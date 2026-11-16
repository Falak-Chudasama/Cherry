"""
Durable Lifecycle, Outbox, and Notification models.
Essential for offline downtime recovery and chronological catch-up.
"""
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


LifecycleStatus = Literal[
    "pending",
    "running",
    "completed",
    "failed",
    "awaiting_external",
    "cancelled",
]

LifecycleOpType = Literal[
    "day_init",
    "daily_draft",
    "lemon_ingestion",
    "daily_closure",
    "quarter_closure",
    "quarter_creation",
    "surplus_creation",
    "surplus_closure",
    "season_closure",
    "season_creation",
    "verse_closure",
    "verse_creation",
]


class LifecycleJobModel(BaseModel):
    job_id: str
    idempotency_key: str  # Unique constraint in database
    calendar_date: str    # YYYY-MM-DD
    operation_type: LifecycleOpType
    dependencies: List[str] = Field(default_factory=list)  # list of job_ids or idempotency_keys
    status: LifecycleStatus = "pending"
    attempt_count: int = 0
    max_attempts: int = 5
    scheduled_at: datetime = Field(default_factory=datetime.utcnow)
    executed_at: Optional[datetime] = None
    error_details: Optional[str] = None
    completion_result: Optional[Dict[str, Any]] = None


class NotificationModel(BaseModel):
    notification_id: str
    title: str
    body: str
    type: Literal["checkin", "closure", "reminder", "overdue", "system"]
    target_date: str  # YYYY-MM-DD
    scheduled_for: datetime
    is_delivered: bool = False
    is_overdue: bool = False
    delivered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
