"""
Accountability, Quarter Keys, Junk Points, and Violations routes.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.core.config import settings
from app.services.accountability_service import accountability_service

router = APIRouter(prefix="/api/accountability", tags=["Accountability"])


class SpendKeyPayload(BaseModel):
    quarter_id: str
    date_str: str
    reason: str
    violation_id: Optional[str] = None


class AddJunkPointPayload(BaseModel):
    date_str: str
    quarter_id: str
    food_item: str
    base_score: float
    portion_factor: float = 1.0
    adjustments: float = 0.0
    notes: Optional[str] = ""


class RecordViolationPayload(BaseModel):
    quarter_id: str
    date_str: str
    rule_name: str
    violation_type: str  # direct_event, user_reported, ai_suggested, confirmed
    evidence: str
    confirm_and_spend_key: bool = False


@router.get("/quarter/{quarter_id}")
async def get_quarter_accountability(quarter_id: str):
    balance = await accountability_service.get_quarter_keys_balance(quarter_id)
    ledger = await accountability_service.get_quarter_key_ledger(quarter_id)
    violations = await accountability_service.get_quarter_violations(quarter_id)

    return {
        "quarter_id": quarter_id,
        "remaining_keys": balance,
        "initial_keys": settings.QUARTER_KEYS_INITIAL,
        "junk_point_limit": settings.JUNK_POINT_LIMIT,
        "duration_setting_sec": settings.DURATION_SETTING,
        "ledger": [tx.model_dump() for tx in ledger],
        "violations": [v.model_dump() for v in violations],
    }


@router.post("/keys/spend")
async def spend_quarter_key(payload: SpendKeyPayload):
    tx = await accountability_service.spend_quarter_key(
        quarter_id=payload.quarter_id,
        date_str=payload.date_str,
        reason=payload.reason,
        violation_id=payload.violation_id,
    )
    return tx.model_dump()


@router.get("/junk-points/{date_str}")
async def get_day_junk_points(date_str: str):
    entries = await accountability_service.get_junk_points_for_day(date_str)
    total = await accountability_service.get_daily_junk_points_total(date_str)
    return {
        "date_str": date_str,
        "entries": [e.model_dump() for e in entries],
        "total_junk_points": total,
        "limit": settings.JUNK_POINT_LIMIT,
        "limit_exceeded": total > settings.JUNK_POINT_LIMIT,
    }


@router.post("/junk-points")
async def add_junk_point_entry(payload: AddJunkPointPayload):
    entry, total, did_exceed = await accountability_service.add_junk_point_entry(
        date_str=payload.date_str,
        quarter_id=payload.quarter_id,
        food_item=payload.food_item,
        base_score=payload.base_score,
        portion_factor=payload.portion_factor,
        adjustments=payload.adjustments,
        notes=payload.notes or "",
    )
    return {
        "entry": entry.model_dump(),
        "day_total": total,
        "limit_exceeded": did_exceed,
    }


@router.post("/violations")
async def record_violation(payload: RecordViolationPayload):
    v = await accountability_service.record_violation(
        quarter_id=payload.quarter_id,
        date_str=payload.date_str,
        rule_name=payload.rule_name,
        violation_type=payload.violation_type,  # type: ignore
        evidence=payload.evidence,
        confirm_and_spend_key=payload.confirm_and_spend_key,
    )
    return v.model_dump()
