"""
Task, Goal, and Routine models for Cherry.
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime


TaskCategory = Literal["ROUTINE", "MUST", "SHOULD"]
TaskStatus = Literal[
    "suggested",
    "draft",
    "approved",
    "in_progress",
    "completed",
    "missed",
    "deferred",
    "cancelled",
]
GoalStatus = Literal["not_started", "in_progress", "done"]


class Subtask(BaseModel):
    subtask_id: str
    task_id: str
    title: str
    is_completed: bool = False
    completed_at: Optional[datetime] = None


class GoalModel(BaseModel):
    goal_id: str
    quarter_id: str
    priority: int  # 1, 2, 3...
    title: str
    description: Optional[str] = ""
    status: GoalStatus = "not_started"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TaskModel(BaseModel):
    task_id: str
    quarter_id: str
    goal_id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    category: TaskCategory  # ROUTINE, MUST, SHOULD
    status: TaskStatus = "draft"
    target_date: Optional[str] = None  # YYYY-MM-DD
    deadline: Optional[str] = None     # YYYY-MM-DD
    estimated_minutes: int = 30
    actual_minutes: int = 0
    subtasks: List[Subtask] = Field(default_factory=list)
    is_promoted: bool = False  # e.g. Should -> Must recommendation
    promotion_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class RoutineDefinitionModel(BaseModel):
    routine_id: str
    quarter_id: Optional[str] = None  # can be active for quarter or permanent
    title: str
    description: Optional[str] = ""
    days_of_week: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])  # 0=Monday, 6=Sunday
    scheduled_dates: List[str] = Field(default_factory=list)  # explicit dates if set
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RoutineOccurrenceModel(BaseModel):
    occurrence_id: str
    routine_id: str
    date_str: str  # YYYY-MM-DD
    title: str
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    missed: bool = False
    notes: Optional[str] = None
