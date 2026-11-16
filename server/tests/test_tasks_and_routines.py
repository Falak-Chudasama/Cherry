import pytest
from datetime import date
from app.core import calendar as cal
from app.services.task_service import task_service
from app.services.calendar_service import calendar_service
from app.models.task_models import TaskModel


@pytest.mark.asyncio
async def test_must_should_classification():
    # Task with no deadline stays SHOULD
    task_no_dl = TaskModel(
        task_id="t1",
        quarter_id="2026-11-Q1",
        title="Explore topic",
        category="SHOULD",
    )
    evaluated = task_service.evaluate_should_must_promotion(task_no_dl)
    assert evaluated.is_promoted is False

    # Task due tomorrow with category SHOULD -> must recommend promotion to MUST
    tomorrow = cal.format_date(cal.today_local() + cal.timedelta(days=1))
    task_urgent = TaskModel(
        task_id="t2",
        quarter_id="2026-11-Q1",
        title="Submit tax file",
        category="SHOULD",
        deadline=tomorrow,
    )
    evaluated_urgent = task_service.evaluate_should_must_promotion(task_urgent)
    assert evaluated_urgent.is_promoted is True
    assert "Recommended promotion to MUST" in (evaluated_urgent.promotion_reason or "")


@pytest.mark.asyncio
async def test_routine_scheduling_and_adherence():
    # 1. Create a routine active every day
    r1 = await task_service.create_routine_definition(
        title="Morning Focus",
        days_of_week=[0, 1, 2, 3, 4, 5, 6],
    )

    # 2. Create a routine active only on Wednesdays (weekday 2)
    r2 = await task_service.create_routine_definition(
        title="Wednesday Sprint Review",
        days_of_week=[2],
    )

    # Test day 2026-11-15 (Sunday, weekday 6)
    test_d = date(2026, 11, 15)
    await calendar_service.ensure_day_exists(test_d)

    occs = await task_service.generate_routine_occurrences_for_day(test_d)
    # r1 should be scheduled, r2 should NOT be scheduled on Sunday
    assert len(occs) == 1
    assert occs[0].title == "Morning Focus"

    # Check adherence before completion: must report missed
    adhered, missed = await task_service.check_routine_adherence("2026-11-15")
    assert adhered is False
    assert "Morning Focus" in missed

    # Complete the routine
    await task_service.complete_routine_occurrence(occs[0].occurrence_id, is_completed=True)
    adhered_now, missed_now = await task_service.check_routine_adherence("2026-11-15")
    assert adhered_now is True
    assert len(missed_now) == 0
