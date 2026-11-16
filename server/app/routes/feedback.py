"""
Daily Feedback and Friction Logging routes.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.feedback_service import feedback_service
from app.models.feedback_models import FrictionCategory

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


class LogFrictionPayload(BaseModel):
    date_str: str
    category: FrictionCategory
    description: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    impact_level: str = "medium"


@router.get("/day/{date_str}")
async def get_or_generate_summary(date_str: str, regenerate: bool = False):
    if not regenerate:
        existing = await feedback_service.get_daily_summary(date_str)
        if existing:
            return existing.model_dump()

    summary = await feedback_service.generate_daily_feedback(date_str)
    return summary.model_dump()


@router.post("/friction")
async def log_friction(payload: LogFrictionPayload):
    log = await feedback_service.log_friction(
        date_str=payload.date_str,
        category=payload.category,
        description=payload.description,
        task_id=payload.task_id,
        task_title=payload.task_title,
        impact_level=payload.impact_level,
    )
    return log.model_dump()


@router.get("/frictions/{date_str}")
async def get_day_frictions(date_str: str):
    frictions = await feedback_service.get_friction_logs_for_day(date_str)
    return [f.model_dump() for f in frictions]
