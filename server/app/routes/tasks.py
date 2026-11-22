"""
Task, Goal, and Routine management routes for Cherry.
Enforces the 3-status Kanban model ("Not started", "In progress", "Done")
and explicit carry-over.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.core import calendar as cal
from app.services.task_service import task_service
from app.models.task_models import KanbanStatus, PeriodType

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


class CreateTaskPayload(BaseModel):
    period_id: str
    title: str
    period_type: PeriodType = "Q1"
    tier: Optional[str] = "Must Do"
    description: Optional[str] = ""
    priority: Optional[str] = None
    status: KanbanStatus = "Not started"
    target_date: Optional[str] = None
    deadline: Optional[str] = None
    estimated_minutes: int = 30
    start_day: Optional[int] = None
    end_day: Optional[int] = None
    scheduled_days: Optional[List[int]] = None
    subtasks: Optional[List[Any]] = None


class BatchCreateTasksPayload(BaseModel):
    tasks: List[CreateTaskPayload]


class UpdateStatusPayload(BaseModel):
    status: KanbanStatus


class ToggleSubtaskPayload(BaseModel):
    is_completed: bool


class CarryOverPayload(BaseModel):
    from_period_id: str
    to_period_id: str
    to_period_type: PeriodType = "Q1"
    task_ids: Optional[List[str]] = None


class CreateRoutinePayload(BaseModel):
    title: str
    description: Optional[str] = ""
    quarter_id: Optional[str] = None
    days_of_week: Optional[List[int]] = None
    scheduled_dates: Optional[List[str]] = None


@router.get("/period/{period_id}")
async def get_period_tasks(period_id: str):
    tasks = await task_service.get_tasks_for_period(period_id)
    return [t.model_dump() for t in tasks]


@router.get("/day/{date_str}")
async def get_day_tasks(date_str: str):
    tasks = await task_service.get_tasks_for_day(date_str)
    try:
        d = cal.parse_date(date_str)
        routines = await task_service.generate_routine_occurrences_for_day(d)
    except Exception:
        routines = []

    all_adhered, missed = await task_service.check_routine_adherence(date_str)
    all_skipped, total_routines, completed_routines = await task_service.check_all_routines_skipped(date_str)

    return {
        "date_str": date_str,
        "tasks": [t.model_dump() for t in tasks],
        "routines": [r.model_dump() for r in routines],
        "routine_adherence": all_adhered,
        "missed_routines": missed,
        "all_routines_skipped": all_skipped,
        "total_routines": total_routines,
        "completed_routines": completed_routines,
    }


@router.post("")
async def create_task(payload: CreateTaskPayload):
    task = await task_service.create_task(
        period_id=payload.period_id,
        title=payload.title,
        period_type=payload.period_type,
        tier=payload.tier or "Must Do",
        description=payload.description or "",
        priority=payload.priority,
        status=payload.status,
        target_date=payload.target_date,
        deadline=payload.deadline,
        estimated_minutes=payload.estimated_minutes,
        start_day=payload.start_day,
        end_day=payload.end_day,
        scheduled_days=payload.scheduled_days,
        subtasks=payload.subtasks,
    )
    return task.model_dump()


@router.post("/batch")
async def batch_create_tasks(payload: BatchCreateTasksPayload):
    created = []
    for item in payload.tasks:
        t = await task_service.create_task(
            period_id=item.period_id,
            title=item.title,
            period_type=item.period_type,
            tier=item.tier or "Must Do",
            description=item.description or "",
            priority=item.priority,
            status=item.status,
            target_date=item.target_date,
            deadline=item.deadline,
            estimated_minutes=item.estimated_minutes,
            start_day=item.start_day,
            end_day=item.end_day,
            scheduled_days=item.scheduled_days,
            subtasks=item.subtasks,
        )
        created.append(t.model_dump())
    return {"created_count": len(created), "tasks": created}


@router.put("/{task_id}/status")
async def update_status(task_id: str, payload: UpdateStatusPayload):
    task = await task_service.update_task_status(task_id, payload.status)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task.model_dump()


@router.put("/{task_id}/subtask/{subtask_id}")
async def toggle_subtask(task_id: str, subtask_id: str, payload: ToggleSubtaskPayload):
    task = await task_service.toggle_subtask(task_id, subtask_id, payload.is_completed)
    if not task:
        raise HTTPException(status_code=404, detail="Task or subtask not found.")
    return task.model_dump()


@router.put("/{task_id}")
async def update_task(task_id: str, payload: Dict[str, Any]):
    task = await task_service.update_task(task_id, payload)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task.model_dump()


@router.delete("/{task_id}")
async def delete_task_endpoint(task_id: str):
    deleted = await task_service.delete_task(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"deleted": True, "task_id": task_id}


@router.post("/carry-over")
async def carry_over_tasks_endpoint(payload: CarryOverPayload):
    """
    Explicit user-approved carry-over of unfinished tasks.
    Never auto-moves or auto-deletes unfinished tasks at period boundary.
    """
    carried = await task_service.carry_over_tasks(
        from_period_id=payload.from_period_id,
        to_period_id=payload.to_period_id,
        to_period_type=payload.to_period_type,
        task_ids=payload.task_ids,
    )
    return {
        "success": True,
        "carried_count": len(carried),
        "tasks": [t.model_dump() for t in carried],
    }


# --- Routines endpoints ---

@router.get("/routines/active")
async def get_active_routines(quarter_id: Optional[str] = None):
    routines = await task_service.get_active_routines(quarter_id)
    return [r.model_dump() for r in routines]


@router.post("/routines")
async def create_routine(payload: CreateRoutinePayload):
    routine = await task_service.create_routine_definition(
        title=payload.title,
        description=payload.description or "",
        quarter_id=payload.quarter_id,
        days_of_week=payload.days_of_week,
        scheduled_dates=payload.scheduled_dates,
    )
    return routine.model_dump()


@router.put("/routines/occurrences/{occurrence_id}/toggle")
async def toggle_routine_occurrence(occurrence_id: str, payload: ToggleSubtaskPayload):
    occ = await task_service.complete_routine_occurrence(occurrence_id, payload.is_completed)
    if not occ:
        raise HTTPException(status_code=404, detail="Routine occurrence not found.")
    return occ.model_dump()


@router.delete("/routines/occurrences/{occurrence_id}")
async def delete_routine_occurrence(occurrence_id: str):
    deleted = await task_service.delete_routine_occurrence(occurrence_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Routine occurrence not found.")
    return {"deleted": True, "occurrence_id": occurrence_id}
