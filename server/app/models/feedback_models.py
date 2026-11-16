"""
Feedback, Observations, Derived Metrics, and Friction Logs models.
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime


EvidenceType = Literal["OBSERVED_FACT", "USER_REPORT", "AI_HYPOTHESIS"]
FrictionCategory = Literal["interruption", "procrastination", "tool_issue", "fatigue", "unclear_requirements", "other"]


class FrictionLogModel(BaseModel):
    friction_id: str
    date_str: str  # YYYY-MM-DD
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    category: FrictionCategory
    description: str
    impact_level: Literal["low", "medium", "high"] = "medium"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ObservationItem(BaseModel):
    evidence_type: EvidenceType  # OBSERVED_FACT, USER_REPORT, AI_HYPOTHESIS
    category: str  # "activity", "distraction", "routine", "focus", "workload"
    statement: str
    confidence: float = 1.0  # 1.0 for facts and direct user reports; <1.0 for hypotheses
    evidence_source: Optional[str] = None  # e.g. "Lemon summary", "Pomodoro log", "User explanation"


class DerivedMetrics(BaseModel):
    date_str: str
    total_active_seconds: float = 0.0
    productive_seconds: float = 0.0
    entertainment_seconds: float = 0.0
    tasks_approved_count: int = 0
    tasks_completed_count: int = 0
    tasks_missed_count: int = 0
    routines_scheduled_count: int = 0
    routines_completed_count: int = 0
    routines_missed_count: int = 0
    focus_sessions_completed: int = 0
    focus_minutes_total: float = 0.0
    friction_events_count: int = 0
    junk_points_total: float = 0.0
    quarter_keys_spent: int = 0
    bad_day: bool = False


class DailyFeedbackSummaryModel(BaseModel):
    summary_id: str
    date_str: str  # YYYY-MM-DD
    version: int = 1
    is_complete: bool = True
    lemon_data_available: bool = True
    basket_ai_used: bool = True
    observations: List[ObservationItem] = Field(default_factory=list)
    accomplishments: List[str] = Field(default_factory=list)
    distractions_and_friction: List[str] = Field(default_factory=list)
    alignment_verdict: str = ""
    actionable_improvement: str = ""
    metrics: DerivedMetrics
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
