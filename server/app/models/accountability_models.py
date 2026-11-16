"""
Accountability models: Quarter Keys, Junk Points, Ledgers and Violations.
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime


ViolationType = Literal["direct_event", "user_reported", "ai_suggested", "confirmed"]


class QuarterKeyLedgerModel(BaseModel):
    tx_id: str
    quarter_id: str
    date_str: str
    delta: int  # e.g. -1
    balance_after: int
    reason: str
    violation_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class JunkPointEntryModel(BaseModel):
    entry_id: str
    date_str: str  # YYYY-MM-DD
    quarter_id: str
    food_item: str
    base_score: float
    portion_factor: float = 1.0
    adjustments: float = 0.0
    calculated_points: float  # Deterministically computed: (base_score * portion_factor) + adjustments
    notes: Optional[str] = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ViolationRecordModel(BaseModel):
    violation_id: str
    quarter_id: str
    date_str: str
    rule_name: str  # e.g. "exceeded_junk_point_limit", "missed_routine", "playing_games", "custom"
    violation_type: ViolationType
    is_confirmed: bool = False
    evidence: str
    quarter_key_spent: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    confirmed_at: Optional[datetime] = None
