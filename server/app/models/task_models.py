"""
Task, Goal, and Routine models for Cherry.
Conforms strictly to the 3-status Kanban model ("Not started", "In progress", "Done")
and the Quarter System Master Spec.
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


KanbanStatus = Literal["Not started", "In progress", "Done"]
PeriodType = Literal["Q1", "Q2", "Q3", "Q4", "SURPLUS"]
TaskCategory = Literal["ROUTINE", "MUST", "SHOULD"]
TaskStatus = KanbanStatus  # Backward compatibility alias


class Subtask(BaseModel):
    subtask_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    is_completed: bool = False
    start_day: int = 1
    end_day: int = 7
    completed_at: Optional[datetime] = None


class TaskModel(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = ""
    status: KanbanStatus = "Not started"
    tier: Optional[str] = "Must Do"  # "Must Do" | "Should Do" | "Routine"
    priority: Optional[str] = None  # Flexible string (e.g. "P1", "High", "Must", or custom label)
    period_type: PeriodType = "Q1"
    period_id: str  # e.g. "2026-11-Q3" or "2026-11-SURPLUS"
    target_date: Optional[str] = None  # YYYY-MM-DD
    deadline: Optional[str] = None     # YYYY-MM-DD
    estimated_minutes: int = 30
    actual_minutes: int = 0
    start_day: Optional[int] = None
    end_day: Optional[int] = None
    scheduled_days: Optional[List[int]] = None
    subtasks: List[Subtask] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class GoalModel(BaseModel):
    goal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quarter_id: str
    priority: int = 1
    title: str
    description: Optional[str] = ""
    status: KanbanStatus = "Not started"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RoutineDefinitionModel(BaseModel):
    routine_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quarter_id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    days_of_week: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])
    scheduled_dates: List[str] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RoutineOccurrenceModel(BaseModel):
    occurrence_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    routine_id: str
    date_str: str  # YYYY-MM-DD
    title: str
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    missed: bool = False
    notes: Optional[str] = None
