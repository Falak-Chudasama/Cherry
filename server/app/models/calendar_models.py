"""
Calendar domain models for Cherry.
Hierarchy: Day -> Quarter -> Season -> Verse
"""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime


class VerseModel(BaseModel):
    verse_id: str  # e.g. "2026"
    year: int
    season_ids: List[str] = Field(default_factory=list)
    status: Literal["active", "closed"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None


class SeasonModel(BaseModel):
    season_id: str  # e.g. "2026-11"
    year: int
    month: int
    name: str  # e.g. "November 2026"
    verse_id: str
    quarter_ids: List[str] = Field(default_factory=list)  # exactly 4
    surplus_id: Optional[str] = None  # None if month has 28 days
    status: Literal["active", "closed"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None


class QuarterModel(BaseModel):
    quarter_id: str  # e.g. "2026-11-Q1"
    season_id: str
    verse_id: str
    quarter_num: int  # 1, 2, 3, or 4
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    day_ids: List[str] = Field(default_factory=list)  # exactly 7 days
    plan_version: int = 1
    active_plan_id: Optional[str] = None
    remaining_keys: int = 3
    total_violations: int = 0
    status: Literal["active", "closed"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None


class SurplusPeriodModel(BaseModel):
    surplus_id: str  # e.g. "2026-11-SURPLUS"
    season_id: str
    verse_id: str
    start_date: str  # e.g. "2026-11-29"
    end_date: str    # e.g. "2026-11-30"
    day_ids: List[str] = Field(default_factory=list)  # days 29..end
    status: Literal["active", "closed"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None


class DayModel(BaseModel):
    date_str: str  # YYYY-MM-DD (unique key)
    period_type: Literal["Q1", "Q2", "Q3", "Q4", "SURPLUS"]
    period_id: str
    season_id: str
    verse_id: str
    status: Literal["active", "closed"] = "active"
    is_bad_day: bool = False
    bad_day_reasons: List[str] = Field(default_factory=list)
    todo_ids: List[str] = Field(default_factory=list)
    routine_ids: List[str] = Field(default_factory=list)
    focus_session_ids: List[str] = Field(default_factory=list)
    friction_log_ids: List[str] = Field(default_factory=list)
    daily_summary_id: Optional[str] = None
    closure_completed: bool = False
    closed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
