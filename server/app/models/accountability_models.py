"""
Accountability models: Rules, Violations, Diet/Junk Points, and Quarter Keys.
Enforces the Quarter System Master Spec without invented operational rules.
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class RuleModel(BaseModel):
    rule_id: str  # "no_games", "junk_point_limit", "no_skip_all_routines"
    name: str
    description: str
    is_active: bool = True


class ViolationRecordModel(BaseModel):
    violation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    rule_id: str  # "no_games" | "junk_point_limit" | "no_skip_all_routines" | custom
    rule_name: str
    date_str: str  # YYYY-MM-DD
    period_id: str  # e.g. "2026-11-Q3" or "2026-11-SURPLUS"
    evidence: str
    notes: Optional[str] = ""
    is_confirmed: bool = True
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class JunkPointEntryModel(BaseModel):
    entry_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date_str: str  # YYYY-MM-DD
    period_id: str  # e.g. "2026-11-Q3"
    food_item: str
    jp_value: float  # Explicit user-entered or mapped score
    notes: Optional[str] = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class FoodJpMappingModel(BaseModel):
    mapping_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    food_name: str
    default_jp: float
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QuarterKeyLedgerModel(BaseModel):
    tx_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quarter_id: str
    date_str: str
    delta: int  # e.g. -1
    balance_after: int
    reason: str
    violation_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class JunkPointSummary(BaseModel):
    scope: Literal["day", "period"]
    identifier: str  # date_str or period_id
    limit: float = 50.0
    accumulated_jp: float
    remaining_jp: float
    entries: List[JunkPointEntryModel] = Field(default_factory=list)
