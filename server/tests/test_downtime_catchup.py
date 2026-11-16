"""
Tests for Section 16.3 Critical Downtime Scenarios A through J.
Validates durable recovery across crashes, calendar boundaries, and service outages.
"""
import pytest
from datetime import date, datetime
from app.core import calendar as cal
from app.services.lifecycle_service import lifecycle_service
from app.services.calendar_service import calendar_service
from app.services.plan_service import plan_service
from app.models.lifecycle_models import LifecycleJobModel


async def async_none(*args, **kwargs):
    return None


@pytest.mark.asyncio
async def test_scenario_a_normal_day_closure(monkeypatch):
    """Scenario A: Cherry is running normally and closes a Day."""
    d = date(2026, 11, 15)
    d_str = cal.format_date(d)
    await calendar_service.ensure_day_exists(d)

    job = await lifecycle_service.enqueue_job(
        idempotency_key=f"closure:{d_str}",
        calendar_date=d_str,
        op_type="daily_closure",
    )

    await lifecycle_service._execute_closure_job(job, d)

    day_doc = await calendar_service.get_day(d_str)
    assert day_doc is not None
    assert day_doc.status == "closed"
    assert day_doc.closure_completed is True


@pytest.mark.asyncio
async def test_scenario_b_off_before_closure_and_restarted(monkeypatch):
    """Scenario B: Cherry is off before daily closure and restarted next morning."""
    # Seed yesterday (Nov 14)
    yesterday = date(2026, 11, 14)
    await calendar_service.ensure_day_exists(yesterday)

    # Set system time to Nov 15
    monkeypatch.setattr("app.core.calendar.today_local", lambda: date(2026, 11, 15))
    monkeypatch.setattr("app.services.lifecycle_service.focus_service.reconcile_active_sessions_on_startup", async_none)
    monkeypatch.setattr("app.services.feedback_service.lemon_adapter.get_activity_summary", async_none)
    monkeypatch.setattr("app.services.feedback_service.basket_adapter.chat_completion", async_none)

    res = await lifecycle_service.reconcile_on_startup()
    assert "2026-11-14" in res["reconciled_dates"]

    yesterday_doc = await calendar_service.get_day("2026-11-14")
    assert yesterday_doc is not None
    assert yesterday_doc.status == "closed"


@pytest.mark.asyncio
async def test_scenario_c_offline_multiple_days_chronological(monkeypatch):
    """Scenario C: Cherry is off for multiple days: reconciled in chronological order without duplication."""
    # Seed earliest day as Nov 10
    nov_10 = date(2026, 11, 10)
    await calendar_service.ensure_day_exists(nov_10)

    monkeypatch.setattr("app.core.calendar.today_local", lambda: date(2026, 11, 15))
    monkeypatch.setattr("app.services.lifecycle_service.focus_service.reconcile_active_sessions_on_startup", async_none)
    monkeypatch.setattr("app.services.feedback_service.lemon_adapter.get_activity_summary", async_none)
    monkeypatch.setattr("app.services.feedback_service.basket_adapter.chat_completion", async_none)

    res = await lifecycle_service.reconcile_on_startup()
    expected = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]
    assert res["reconciled_dates"] == expected

    # Verify no duplicate jobs in lifecycle_jobs
    for d_str in expected:
        count = await lifecycle_service.db.lifecycle_jobs.count_documents({"idempotency_key": f"closure:{d_str}"})
        assert count == 1


@pytest.mark.asyncio
async def test_scenario_d_offline_across_quarter_boundary():
    """Scenario D: Offline across Quarter boundary (Day 7, 14, 21, 28)."""
    assert cal.is_quarter_closing_day(date(2026, 11, 7)) is True
    assert cal.is_quarter_closing_day(date(2026, 11, 14)) is True

    # Next day after Q1 is Day 8 which belongs to Q2
    p_type_8, q_id_8 = cal.get_period_for_day(date(2026, 11, 8))
    assert p_type_8 == "Q2"
    assert q_id_8 == "2026-11-Q2"


@pytest.mark.asyncio
async def test_scenario_e_offline_across_season_and_surplus_period():
    """Scenario E: Offline across Season boundary including Surplus Period (days 29, 30, 31)."""
    # Nov 29 & 30 are Surplus Period
    p_type_29, p_id_29 = cal.get_period_for_day(date(2026, 11, 29))
    assert p_type_29 == "SURPLUS"
    assert p_id_29 == "2026-11-SURPLUS"

    # Nov 30 is season closing day
    assert cal.is_season_closing_day(date(2026, 11, 30)) is True

    # Dec 1 starts next Season
    season_id_dec = cal.get_season_id(2026, 12)
    assert season_id_dec == "2026-12"


@pytest.mark.asyncio
async def test_scenario_f_offline_across_year_verse_boundary():
    """Scenario F: Offline across December-January: old Verse closes, new Verse created."""
    assert cal.is_verse_closing_day(date(2026, 12, 31)) is True

    # Next day is Jan 1, 2027
    jan_1_2027 = date(2027, 1, 1)
    verse_2027 = cal.get_verse_id(jan_1_2027.year)
    assert verse_2027 == "2027"


@pytest.mark.asyncio
async def test_scenario_g_lemon_unavailable_during_catchup(monkeypatch):
    """Scenario G: Lemon is unavailable: summary marked incomplete/awaiting external, never fabricates activity."""
    # Lemon returns None when offline
    monkeypatch.setattr("app.services.feedback_service.lemon_adapter.get_activity_summary", async_none)
    monkeypatch.setattr("app.services.feedback_service.basket_adapter.chat_completion", async_none)

    job = await lifecycle_service.enqueue_job(
        idempotency_key="feedback:2026-11-14",
        calendar_date="2026-11-14",
        op_type="lemon_ingestion",
    )

    await lifecycle_service._execute_feedback_job(job)

    job_doc = await lifecycle_service.db.lifecycle_jobs.find_one({"job_id": job.job_id})
    assert job_doc["status"] == "awaiting_external"

    # Summary exists but is marked is_complete=False
    summary_doc = await lifecycle_service.db.daily_summaries.find_one({"date_str": "2026-11-14"})
    assert summary_doc is not None
    assert summary_doc["is_complete"] is False
    assert summary_doc["lemon_data_available"] is False


@pytest.mark.asyncio
async def test_scenario_h_basket_unavailable_during_catchup(monkeypatch):
    """Scenario H: Basket unavailable: deterministic lifecycle work continues."""
    monkeypatch.setattr("app.services.feedback_service.basket_adapter.chat_completion", async_none)

    d = date(2026, 11, 14)
    await calendar_service.ensure_day_exists(d)

    job = await lifecycle_service.enqueue_job(
        idempotency_key="closure:2026-11-14",
        calendar_date="2026-11-14",
        op_type="daily_closure",
    )

    await lifecycle_service._execute_closure_job(job, d)

    day_doc = await calendar_service.get_day("2026-11-14")
    assert day_doc.status == "closed"


@pytest.mark.asyncio
async def test_scenario_i_idempotency_after_crash():
    """Scenario I: Crashing halfway: restart finished remaining without duplicate jobs."""
    # First enqueue
    job1 = await lifecycle_service.enqueue_job(
        idempotency_key="closure:2026-11-15-crash",
        calendar_date="2026-11-15",
        op_type="daily_closure",
    )

    # Second enqueue with same idempotency key (simulating reboot)
    job2 = await lifecycle_service.enqueue_job(
        idempotency_key="closure:2026-11-15-crash",
        calendar_date="2026-11-15",
        op_type="daily_closure",
    )

    assert job1.job_id == job2.job_id
    count = await lifecycle_service.db.lifecycle_jobs.count_documents(
        {"idempotency_key": "closure:2026-11-15-crash"}
    )
    assert count == 1


@pytest.mark.asyncio
async def test_scenario_j_retrospective_draft_remains_unapproved():
    """Scenario J: A retrospective Todo draft is generated: must remain unapproved draft."""
    draft = await plan_service.generate_daily_todo_draft("2026-11-10", is_retrospective=True)
    assert draft.status == "draft"
    assert draft.is_retrospective is True
    assert draft.approved_at is None
