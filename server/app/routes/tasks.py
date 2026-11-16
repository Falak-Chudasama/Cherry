"""
Task, Goal, and Routine management routes.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Literal
from app.core import calendar as cal
from app.services.task_service import task_service
from app.models.task_models import TaskCategory, TaskStatus

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


class CreateTaskPayload(BaseModel):
    quarter_id: str
    title: str
    category: TaskCategory
    goal_id: Optional[str] = None
    description: Optional[str] = ""
    target_date: Optional[str] = None
    deadline: Optional[str] = None
    estimated_minutes: int = 30
    subtasks: Optional[List[str]] = None


class UpdateStatusPayload(BaseModel):
    status: TaskStatus


class ToggleSubtaskPayload(BaseModel):
    is_completed: bool


class CreateRoutinePayload(BaseModel):
    title: str
    description: Optional[str] = ""
    quarter_id: Optional[str] = None
    days_of_week: Optional[List[int]] = None
    scheduled_dates: Optional[List[str]] = None


@router.get("/day/{date_str}")
async def get_day_tasks(date_str: str):
    tasks = await task_service.get_tasks_for_day(date_str)
    try:
        d = cal.parse_date(date_str)
        routines = await task_service.generate_routine_occurrences_for_day(d)
    except Exception:
        routines = []

    adhered, missed = await task_service.check_routine_adherence(date_str)

    return {
        "date_str": date_str,
        "tasks": [t.model_dump() for t in tasks],
        "routines": [r.model_dump() for r in routines],
        "routine_adherence": adhered,
        "missed_routines": missed,
    }


@router.post("")
async def create_task(payload: CreateTaskPayload):
    task = await task_service.create_task(
        quarter_id=payload.quarter_id,
        title=payload.title,
        category=payload.category,
        goal_id=payload.goal_id,
        description=payload.description or "",
        target_date=payload.target_date,
        deadline=payload.deadline,
        estimated_minutes=payload.estimated_minutes,
        subtask_titles=payload.subtasks,
        status="approved" if payload.target_date else "draft",
    )
    return task.model_dump()


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


@router.get("/routines")
async def list_routines(quarter_id: Optional[str] = None):
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


@router.put("/routines/{occurrence_id}/complete")
async def complete_routine_occurrence(occurrence_id: str, payload: ToggleSubtaskPayload):
    occ = await task_service.complete_routine_occurrence(occurrence_id, payload.is_completed)
    if not occ:
        raise HTTPException(status_code=404, detail="Routine occurrence not found.")
    return occ.model_dump()
