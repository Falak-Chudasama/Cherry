"""
Quarter Planning and Daily Todo Draft routes.
Enforces the mandatory rule: AI proposals are NOT active until explicitly approved by the user.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.services.plan_service import plan_service
from app.models.plan_models import TodoDraftModel

router = APIRouter(prefix="/api/plans", tags=["Plans"])


class ProposePlanPayload(BaseModel):
    quarter_id: str
    intent: str
    routines: Optional[List[Dict[str, Any]]] = None


class ApprovePlanPayload(BaseModel):
    approval_notes: Optional[str] = None


class CommitPlanFromComposerPayload(BaseModel):
    period_id: str
    quarter_goal: str
    deliverables: List[Dict[str, Any]]


@router.post("/quarter/commit")
async def commit_plan_from_composer(payload: CommitPlanFromComposerPayload):
    """
    Commit an approved plan from the Composer Modal into real tasks.
    Database remains untouched until this endpoint is invoked.
    """
    res = await plan_service.commit_plan_from_composer(
        period_id=payload.period_id,
        quarter_goal=payload.quarter_goal,
        deliverables=payload.deliverables,
    )
    return res


@router.post("/quarter/propose")
async def propose_quarter_plan(payload: ProposePlanPayload):
    plan = await plan_service.propose_quarter_plan(
        quarter_id=payload.quarter_id,
        user_intent=payload.intent,
        routine_specs=payload.routines,
    )
    return plan.model_dump()


@router.post("/quarter/{plan_id}/approve")
async def approve_quarter_plan(plan_id: str, payload: ApprovePlanPayload):
    plan = await plan_service.approve_quarter_plan(plan_id, approval_notes=payload.approval_notes)
    if not plan:
        raise HTTPException(status_code=404, detail="Proposed plan not found.")
    return plan.model_dump()


@router.get("/quarter/{quarter_id}/active")
async def get_active_plan(quarter_id: str):
    plan = await plan_service.get_active_plan(quarter_id)
    if not plan:
        return {"status": "none", "message": "No active approved plan for this Quarter."}
    return plan.model_dump()


@router.get("/todo/{date_str}")
async def get_or_generate_todo_draft(date_str: str):
    doc = await plan_service.db.todo_drafts.find_one({"date_str": date_str})
    if doc:
        return TodoDraftModel(**doc).model_dump()
    draft = await plan_service.generate_daily_todo_draft(date_str, is_retrospective=False)
    return draft.model_dump()


@router.post("/todo/{date_str}/finalize")
async def finalize_todo_draft(date_str: str):
    draft = await plan_service.finalize_todo_draft(date_str)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found for this date.")
    return draft.model_dump()
