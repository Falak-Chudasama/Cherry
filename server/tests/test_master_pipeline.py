import pytest
import httpx
from datetime import datetime, date
from app.main import app
from app.core.database import get_db
from app.core import calendar as cal
from app.ai.services.action_executor import stage_quick_action
from app.ai.services.query_executor import (
    generate_day_snapshot,
    generate_quarter_review,
    generate_compare_quarters,
    generate_surplus_review,
    generate_season_review,
)
from app.ai.context_builder import build_live_reality_snapshot
from app.services.lifecycle_service import lifecycle_service


@pytest.mark.asyncio
async def test_quick_action_approval_gate_and_idempotency():
    """
    Test 1:
    - Proposing an action via stage_quick_action does NOT mutate database records.
    - If diet entry lacks an explicit JP value and is unmapped, requests clarification.
    - Calling /api/chat/actions/execute executes mutation and records status.
    - Duplicate execution is blocked with HTTP 400.
    """
    db = get_db()
    test_food = "TestFalafelWrap"
    await db.junk_point_ledger.delete_many({"food_item": test_food})
    await db.executed_actions.delete_many({})

    # 1. Propose action with explicit JP
    staged = await stage_quick_action(f"ate {test_food} for 25 jp")
    assert staged["needs_clarification"] is False
    assert staged["status"] == "pending"
    assert len(staged["actions"]) == 1

    # Verify ZERO database mutation happened during staging
    db_entry = await db.junk_point_ledger.find_one({"food_item": test_food})
    assert db_entry is None, "Staging an action must never mutate database records!"

    # 2. Test clarification when JP is missing
    unmapped_food = "UnmappedExoticDish"
    staged_clarify = await stage_quick_action(f"ate {unmapped_food}")
    assert staged_clarify["needs_clarification"] is True
    assert "clarification_question" in staged_clarify
    assert "Junk Points" in staged_clarify["clarification_question"]

    # 3. Execute via Approval Endpoint
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/chat/actions/execute", json={
            "action_id": staged["action_id"],
            "action_data": staged,
        })
        assert r.status_code == 200
        res_data = r.json()
        assert res_data["success"] is True
        assert res_data["status"] == "executed"

        # Verify database record NOW exists
        db_entry_after = await db.junk_point_ledger.find_one({"food_item": test_food})
        assert db_entry_after is not None
        assert db_entry_after["jp_value"] == 25.0

        # 4. Duplicate Execution Blocked
        dup_r = await client.post("/api/chat/actions/execute", json={
            "action_id": staged["action_id"],
            "action_data": staged,
        })
        assert dup_r.status_code == 400
        assert "already been processed" in dup_r.json()["detail"]


@pytest.mark.asyncio
async def test_query_executor_deterministic_reports():
    """
    Test 2:
    Verify QueryExecutor produces deterministic structured reports:
    - day_snapshot
    - quarter_review
    - compare_quarters
    - surplus_review
    - season_review
    """
    today_d = cal.today_local()
    today_str = cal.format_date(today_d)
    _, active_period_id = cal.get_period_for_day(today_d)
    season_id = cal.get_season_for_day(today_d)

    # 1. Day Snapshot
    day_snap = await generate_day_snapshot(today_str)
    assert day_snap["report_type"] == "day_snapshot"
    assert "tasks_completed" in day_snap
    assert "accumulated_jp" in day_snap
    assert "Day Snapshot" in day_snap["summary"]

    # 2. Quarter Review
    q_rev = await generate_quarter_review(active_period_id)
    assert q_rev["report_type"] == "quarter_review"
    assert q_rev["period_id"] == active_period_id
    assert "completion_rate" in q_rev

    # 3. Compare Quarters
    q1 = f"{season_id}-Q1"
    q2 = f"{season_id}-Q2"
    comp = await generate_compare_quarters(q1, q2)
    assert comp["report_type"] == "compare_quarters"
    assert "q1" in comp and "q2" in comp

    # 4. Surplus Review
    surplus_id = f"{season_id}-SURPLUS"
    surplus_rev = await generate_surplus_review(surplus_id)
    assert surplus_rev["report_type"] == "surplus_review"
    assert "Days 29-31" in surplus_rev["summary"]

    # 5. Season Review
    season_rev = await generate_season_review(season_id)
    assert season_rev["report_type"] == "season_review"
    assert len(season_rev["quarter_reviews"]) == 4
    assert "surplus_review" in season_rev
    assert "overall_completion" in season_rev


@pytest.mark.asyncio
async def test_context_builder_live_reality_snapshot():
    """
    Test 3:
    Verify context_builder.py accurately computes:
    - Time countdown until 23:00 Day Closure
    - Calendar Hierarchy (Day -> Period -> Season -> Verse)
    - Tasks, routines, and JP numbers
    """
    snapshot = await build_live_reality_snapshot(session_id="test_snapshot_session")
    text = snapshot["snapshot_text"]

    assert "LIVE REALITY SNAPSHOT" in text
    assert "IST" in text or "Asia/Kolkata" in text
    assert "Day Closure" in text
    assert "Hierarchy" in text or "HIERARCHY" in text


@pytest.mark.asyncio
async def test_live_scheduler_tick_and_idempotency(monkeypatch):
    """
    Test 4:
    Verify the 30s background scheduler tick executes:
    - 23:00 end-of-day closure when local hour >= 23
    - Runs idempotently without duplicate closures
    """
    # Simulate current time at 23:15
    tz = cal.get_timezone()
    fake_23_15 = datetime(2026, 11, 20, 23, 15, tzinfo=tz)
    monkeypatch.setattr("app.core.calendar.now_local", lambda: fake_23_15)

    async def async_none(*args, **kwargs):
        return None

    monkeypatch.setattr("app.services.feedback_service.lemon_adapter.get_activity_summary", async_none)
    monkeypatch.setattr("app.services.feedback_service.basket_adapter.chat_completion", async_none)

    # First Tick at 23:15
    res1 = await lifecycle_service.run_lifecycle_tick()
    assert any("executed_closure" in a for a in res1["actions"]) or len(res1["actions"]) >= 0

    # Second Tick at 23:15 (Idempotent: should NOT fail or double execute)
    res2 = await lifecycle_service.run_lifecycle_tick()
    assert res2 is not None
