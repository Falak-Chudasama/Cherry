"""
Accountability, Rules, Violations, Diet/Junk Points, and Quarter Keys routes.
Enforces the Quarter System Master Spec without invented operational rules.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.core.config import settings
from app.core import calendar as cal
from app.services.accountability_service import accountability_service

router = APIRouter(prefix="/api/accountability", tags=["Accountability"])


class SpendKeyPayload(BaseModel):
    quarter_id: str
    date_str: str
    reason: str
    violation_id: Optional[str] = None


class AddJunkPointPayload(BaseModel):
    food_item: str
    jp_value: float
    date_str: Optional[str] = None
    period_id: Optional[str] = None
    notes: Optional[str] = ""


class UpdateJunkPointPayload(BaseModel):
    food_item: Optional[str] = None
    jp_value: Optional[float] = None
    notes: Optional[str] = None


class FoodMappingPayload(BaseModel):
    food_name: str
    default_jp: float
    notes: Optional[str] = ""


class RecordViolationPayload(BaseModel):
    rule_id: str
    evidence: str
    date_str: Optional[str] = None
    period_id: Optional[str] = None
    rule_name: Optional[str] = None
    notes: Optional[str] = ""


# --- Rules ---

@router.get("/rules")
async def get_rules():
    rules = await accountability_service.get_rules()
    return [r.model_dump() for r in rules]


# --- Violations ---

@router.get("/violations/period/{period_id}")
async def get_period_violations(period_id: str):
    viols = await accountability_service.get_period_violations(period_id)
    return [v.model_dump() for v in viols]


@router.get("/violations/day/{date_str}")
async def get_day_violations(date_str: str):
    viols = await accountability_service.get_day_violations(date_str)
    return [v.model_dump() for v in viols]


@router.post("/violations")
async def record_violation(payload: RecordViolationPayload):
    date_val = cal.parse_date(payload.date_str) if payload.date_str else cal.today_local()
    date_str = cal.format_date(date_val)
    period_id = payload.period_id
    if not period_id:
        _, period_id = cal.get_period_for_day(date_val)

    viol = await accountability_service.record_violation(
        rule_id=payload.rule_id,
        date_str=date_str,
        period_id=period_id,
        evidence=payload.evidence,
        rule_name=payload.rule_name,
        notes=payload.notes or "",
    )
    return viol.model_dump()


@router.delete("/violations/{violation_id}")
async def delete_violation(violation_id: str):
    deleted = await accountability_service.delete_violation(violation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Violation not found.")
    return {"deleted": True, "violation_id": violation_id}


# --- Diet & Junk Points (Bad Diet Table) ---

@router.get("/junk-points/day/{date_str}")
async def get_day_junk_points(date_str: str):
    summary = await accountability_service.get_day_junk_points(date_str)
    return summary.model_dump()


@router.get("/junk-points/period/{period_id}")
async def get_period_junk_points(period_id: str):
    summary = await accountability_service.get_period_junk_points(period_id)
    return summary.model_dump()


@router.post("/junk-points")
async def add_junk_point_entry(payload: AddJunkPointPayload):
    date_val = cal.parse_date(payload.date_str) if payload.date_str else cal.today_local()
    date_str = cal.format_date(date_val)
    period_id = payload.period_id
    if not period_id:
        _, period_id = cal.get_period_for_day(date_val)

    entry, summary = await accountability_service.add_junk_point_entry(
        date_str=date_str,
        period_id=period_id,
        food_item=payload.food_item,
        jp_value=payload.jp_value,
        notes=payload.notes or "",
    )
    return {
        "entry": entry.model_dump(),
        "summary": summary.model_dump(),
    }


@router.put("/junk-points/{entry_id}")
async def update_junk_point_entry(entry_id: str, payload: UpdateJunkPointPayload):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    entry = await accountability_service.update_junk_point_entry(entry_id, updates)
    if not entry:
        raise HTTPException(status_code=404, detail="Junk point entry not found.")
    return entry.model_dump()


@router.delete("/junk-points/{entry_id}")
async def delete_junk_point_entry(entry_id: str):
    deleted = await accountability_service.delete_junk_point_entry(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Junk point entry not found.")
    return {"deleted": True, "entry_id": entry_id}


# --- Food Mappings ---

@router.get("/food-mappings")
async def get_food_mappings():
    mappings = await accountability_service.get_food_mappings()
    return [m.model_dump() for m in mappings]


@router.post("/food-mappings")
async def set_food_mapping(payload: FoodMappingPayload):
    mapping = await accountability_service.set_food_mapping(
        food_name=payload.food_name,
        default_jp=payload.default_jp,
        notes=payload.notes or "",
    )
    return mapping.model_dump()


@router.delete("/food-mappings/{mapping_id}")
async def delete_food_mapping(mapping_id: str):
    deleted = await accountability_service.delete_food_mapping(mapping_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Food mapping not found.")
    return {"deleted": True, "mapping_id": mapping_id}


# --- Quarter Keys (Preserved Constants & Transparent Ledger) ---

@router.get("/quarter/{quarter_id}")
async def get_quarter_accountability(quarter_id: str):
    balance = await accountability_service.get_quarter_keys_balance(quarter_id)
    ledger = await accountability_service.get_quarter_key_ledger(quarter_id)
    violations = await accountability_service.get_period_violations(quarter_id)

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
