"""
Pomodoro and Focus Mode domain models for Cherry.
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime


FocusSessionStatus = Literal["active", "paused", "completed", "interrupted", "abandoned"]


class PomodoroSessionModel(BaseModel):
    session_id: str
    date_str: str  # YYYY-MM-DD
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    planned_minutes: int = 60
    started_at: datetime = Field(default_factory=datetime.utcnow)
    paused_at: Optional[datetime] = None
    total_paused_seconds: float = 0.0
    ended_at: Optional[datetime] = None
    status: FocusSessionStatus = "active"
    dns_enabled_by_session: bool = False
    outcome_notes: Optional[str] = None


class FocusStateModel(BaseModel):
    is_focus_active: bool = False
    current_session_id: Optional[str] = None
    dns_protection_active: bool = False
    lemon_synchronized: bool = False
    last_reconciled_at: Optional[datetime] = None
    error_message: Optional[str] = None
