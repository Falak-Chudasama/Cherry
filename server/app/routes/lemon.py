"""
Lemon Desktop integration routes.
Exposes real-time Lemon DNS protection status and Quarantine management.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.adapters.lemon_adapter import lemon_adapter

router = APIRouter(prefix="/api/lemon", tags=["Lemon Integration"])


class CreateQuarantinePayload(BaseModel):
    target_value: str
    duration_minutes: int = 60
    target_type: str = "DOMAIN"
    reason: str = "Deep Work Protocol"


@router.get("/dns")
async def get_lemon_dns():
    status = await lemon_adapter.get_dns_status()
    return status


@router.post("/dns/enable")
async def enable_dns():
    res = await lemon_adapter.enable_dns()
    return res


@router.post("/dns/disable")
async def disable_dns():
    res = await lemon_adapter.disable_dns()
    return res


@router.get("/quarantines")
async def get_quarantines():
    data = await lemon_adapter.get_active_quarantines()
    return data


@router.post("/quarantines")
async def create_quarantine(payload: CreateQuarantinePayload):
    res = await lemon_adapter.create_quarantine(
        target_value=payload.target_value,
        duration_minutes=payload.duration_minutes,
        target_type=payload.target_type,
        reason=payload.reason,
    )
    return res


@router.get("/quarantines/pending")
async def get_pending_quarantine_requests():
    data = await lemon_adapter.get_pending_quarantine_requests()
    return data


@router.post("/quarantines/cancel/{request_id}")
async def cancel_pending_quarantine_request(request_id: int):
    res = await lemon_adapter.cancel_pending_quarantine_request(request_id)
    return res
