"""
Pomodoro and Focus Mode routes.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.focus_service import focus_service

router = APIRouter(prefix="/api/focus", tags=["Focus"])


class StartFocusPayload(BaseModel):
    date_str: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    planned_minutes: Optional[int] = None


class StopFocusPayload(BaseModel):
    session_id: str
    status: str = "completed"
    outcome_notes: Optional[str] = None


@router.get("/status")
async def get_focus_status():
    state = await focus_service.get_focus_state()
    return state.model_dump()


@router.post("/start")
async def start_focus(payload: StartFocusPayload):
    session = await focus_service.start_pomodoro(
        date_str=payload.date_str,
        task_id=payload.task_id,
        task_title=payload.task_title,
        planned_minutes=payload.planned_minutes,
    )
    return session.model_dump()


@router.post("/pause/{session_id}")
async def pause_focus(session_id: str):
    session = await focus_service.pause_pomodoro(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found.")
    return session.model_dump()


@router.post("/resume/{session_id}")
async def resume_focus(session_id: str):
    session = await focus_service.resume_pomodoro(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Paused session not found.")
    return session.model_dump()


@router.post("/stop")
async def stop_focus(payload: StopFocusPayload):
    session = await focus_service.stop_pomodoro(
        session_id=payload.session_id,
        status=payload.status,  # type: ignore
        outcome_notes=payload.outcome_notes,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session.model_dump()


@router.get("/sessions/{date_str}")
async def get_day_sessions(date_str: str):
    sessions = await focus_service.get_sessions_for_day(date_str)
    return [s.model_dump() for s in sessions]
