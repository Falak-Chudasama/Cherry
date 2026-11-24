import pytest
from datetime import date
from app.core import calendar as cal
from app.services.task_service import task_service
from app.services.calendar_service import calendar_service
from app.models.task_models import TaskModel, Subtask


@pytest.mark.asyncio
async def test_kanban_three_status_and_subtasks():
    # 1. Create a task with 3-state Kanban model and subtasks with day range 1..7
    task = await task_service.create_task(
        period_id="2026-11-Q1",
        period_type="Q1",
        title="Refactor Database Models",
        description="Clean 3-status Kanban",
        priority="High",
        subtasks=[
            {"title": "Step 1: Write schemas", "start_day": 1, "end_day": 3},
            {"title": "Step 2: Migrate data", "start_day": 4, "end_day": 7},
        ],
    )

    assert task.status == "Not started"
    assert len(task.subtasks) == 2
    assert task.subtasks[0].start_day == 1
    assert task.subtasks[0].end_day == 3

    # 2. Transition to In progress
    updated = await task_service.update_task_status(task.task_id, "In progress")
    assert updated.status == "In progress"

    # 3. Complete first subtask
    st1_id = task.subtasks[0].subtask_id
    updated_st = await task_service.toggle_subtask(task.task_id, st1_id, True)
    assert updated_st.subtasks[0].is_completed is True
    # Still In progress because second subtask is pending
    assert updated_st.status == "In progress"

    # 4. Complete second subtask -> task automatically completes
    st2_id = task.subtasks[1].subtask_id
    completed_task = await task_service.toggle_subtask(task.task_id, st2_id, True)
    assert completed_task.status == "Done"
    assert completed_task.completed_at is not None

    # 5. Requirement 12: Uncheck one subtask -> In progress
    uncheck_one = await task_service.toggle_subtask(task.task_id, st2_id, False)
    assert uncheck_one.status == "In progress"

    # 6. Requirement 12: Uncheck ALL subtasks -> Status returns to "Not started"!
    uncheck_all = await task_service.toggle_subtask(task.task_id, st1_id, False)
    assert uncheck_all.status == "Not started"
    assert uncheck_all.completed_at is None


@pytest.mark.asyncio
async def test_day_task_filtering_requirement_1():
    # Create a task for Day 6 only in Q4 (Nov 22-28, so Day 3 is Nov 24, Day 6 is Nov 27)
    task_d6 = await task_service.create_task(
        period_id="2026-11-Q4",
        period_type="Q4",
        title="D6 Only Task",
        scheduled_days=[6],
        target_date="2026-11-24", # created while on Nov 24
    )

    # Create a task for All Days (D1..D7)
    task_all = await task_service.create_task(
        period_id="2026-11-Q4",
        period_type="Q4",
        title="All Days Task",
        scheduled_days=[1, 2, 3, 4, 5, 6, 7],
    )

    # Create a task for Day 3 only
    task_d3 = await task_service.create_task(
        period_id="2026-11-Q4",
        period_type="Q4",
        title="D3 Only Task",
        scheduled_days=[3],
    )

    # On Nov 24 (Day 3 of Q4):
    day_3_tasks = await task_service.get_tasks_for_day("2026-11-24")
    day_3_ids = [t.task_id for t in day_3_tasks]

    # Task for Day 6 MUST NOT be in Day 3 tasks!
    assert task_d6.task_id not in day_3_ids
    # Task for Day 3 and All Days MUST be in Day 3 tasks!
    assert task_d3.task_id in day_3_ids
    assert task_all.task_id in day_3_ids


@pytest.mark.asyncio
async def test_explicit_carry_over():
    # 1. Create an unfinished task in Q1
    t1 = await task_service.create_task(
        period_id="2026-11-Q1",
        period_type="Q1",
        title="Unfinished Milestone",
        status="In progress",
    )

    # 2. Explicitly carry over to Q2
    carried = await task_service.carry_over_tasks(
        from_period_id="2026-11-Q1",
        to_period_id="2026-11-Q2",
        to_period_type="Q2",
        task_ids=[t1.task_id],
    )

    assert len(carried) == 1
    assert carried[0].task_id == t1.task_id
    assert carried[0].period_id == "2026-11-Q2"
    assert carried[0].period_type == "Q2"


@pytest.mark.asyncio
async def test_routine_scheduling_and_exact_all_skipped_rule():
    # 1. Create two routines active every day
    r1 = await task_service.create_routine_definition(
        title="Morning Focus",
        days_of_week=[0, 1, 2, 3, 4, 5, 6],
    )
    r2 = await task_service.create_routine_definition(
        title="Evening Review",
        days_of_week=[0, 1, 2, 3, 4, 5, 6],
    )

    test_d = date(2026, 11, 15)
    await calendar_service.ensure_day_exists(test_d)
    occs = await task_service.generate_routine_occurrences_for_day(test_d)
    assert len(occs) >= 2

    # Check adherence before completing anything
    all_skipped, total, completed = await task_service.check_all_routines_skipped("2026-11-15")
    # Total > 0 and 0 completed -> all_skipped is True!
    assert all_skipped is True
    assert completed == 0

    # Complete ONE routine:
    await task_service.complete_routine_occurrence(occs[0].occurrence_id, is_completed=True)

    # Spec Principle 9: Were ALL configured routine tasks skipped?
    all_skipped_now, total_now, completed_now = await task_service.check_all_routines_skipped("2026-11-15")
    # One was completed, so ALL were NOT skipped!
    assert all_skipped_now is False
    assert completed_now >= 1
