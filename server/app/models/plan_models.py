"""
Planning and Versioning models for Cherry.
"""
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


PlanStatus = Literal["proposed", "approved", "superseded", "rejected"]


class PlanGoalProposal(BaseModel):
    priority: int
    title: str
    description: Optional[str] = ""


class PlanTaskProposal(BaseModel):
    title: str
    category: Literal["ROUTINE", "MUST", "SHOULD"]
    goal_priority: Optional[int] = None
    target_date: Optional[str] = None
    deadline: Optional[str] = None
    estimated_minutes: int = 30
    subtasks: List[str] = Field(default_factory=list)


class QuarterPlanModel(BaseModel):
    plan_id: str
    quarter_id: str
    version: int = 1
    status: PlanStatus = "proposed"
    goals: List[PlanGoalProposal] = Field(default_factory=list)
    tasks: List[PlanTaskProposal] = Field(default_factory=list)
    routines: List[Dict[str, Any]] = Field(default_factory=list)
    rationale: Optional[str] = None
    created_by: Literal["assistant", "user"] = "assistant"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None
    approval_notes: Optional[str] = None
    changes_from_previous: Optional[str] = None


class TodoDraftItem(BaseModel):
    task_id: Optional[str] = None
    title: str
    category: Literal["ROUTINE", "MUST", "SHOULD"]
    is_routine: bool = False
    routine_occurrence_id: Optional[str] = None
    is_selected: bool = True
    estimated_minutes: int = 30


class TodoDraftModel(BaseModel):
    draft_id: str
    date_str: str  # YYYY-MM-DD
    items: List[TodoDraftItem] = Field(default_factory=list)
    status: Literal["draft", "approved"] = "draft"
    is_retrospective: bool = False  # Critical: never falsely claim approval if generated during catch-up
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None
