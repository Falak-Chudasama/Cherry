"""
Conversational Assistant Routes for Cherry.
Provides single backend SSE streaming endpoint (POST /api/chat/stream),
conversation persistence, and interactive Composer Modal refinement.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any
from app.services.chat_service import chat_service
from app.ai.services.chat_orchestrator import handle_chat_stream
from app.ai.services.plan_crafter import craft_plan
from app.ai.services.task_crafter import craft_task
from app.ai.services.action_executor import execute_staged_action
from app.core.database import get_db

router = APIRouter(prefix="/api/chat", tags=["Chat"])


class SendMessagePayload(BaseModel):
    conversation_id: Optional[str] = None
    session_id: Optional[str] = None
    content: str


class StreamChatPayload(BaseModel):
    session_id: Optional[str] = None
    content: str


class CreateConversationPayload(BaseModel):
    title: Optional[str] = None


class RenameConversationPayload(BaseModel):
    title: str


class RefinePlanPayload(BaseModel):
    prompt: str
    current_draft: Optional[Dict[str, Any]] = None
    period_id: Optional[str] = "2026-11-Q3"


class RefineTaskPayload(BaseModel):
    prompt: str
    current_draft: Optional[Dict[str, Any]] = None
    period_id: Optional[str] = "2026-11-Q3"
    period_type: Optional[str] = "Q1"


@router.post("/stream")
async def chat_stream_endpoint(payload: StreamChatPayload):
    """
    Single unified SSE transport endpoint for Cherry.
    Streams deltas, structured cards, and completion events.
    """
    sid = payload.session_id
    if not sid:
        conv = await chat_service.create_new_conversation(title=payload.content[:30])
        sid = conv["session_id"]

    return StreamingResponse(
        handle_chat_stream(session_id=sid, user_prompt=payload.content),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/message")
async def send_message(payload: SendMessagePayload):
    """Synchronous fallback endpoint for testing or non-streaming clients."""
    sid = payload.conversation_id or payload.session_id
    conv = await chat_service.get_or_create_conversation(sid)
    active_id = conv.get("session_id") or conv.get("conversation_id")
    assistant_msg = await chat_service.handle_user_message(
        session_id=active_id,
        user_text=payload.content,
    )
    return {
        "conversation_id": active_id,
        "session_id": active_id,
        "reply": assistant_msg.model_dump(),
    }


@router.get("/conversations")
async def list_conversations():
    return await chat_service.list_conversations()


@router.post("/conversations")
async def create_conversation(payload: Optional[CreateConversationPayload] = None):
    title = payload.title if payload else None
    return await chat_service.create_new_conversation(title=title)


@router.get("/conversations/{conversation_id}")
async def get_conversation_by_id(conversation_id: str):
    doc = await chat_service.get_or_create_conversation(conversation_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return doc


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    success = await chat_service.delete_conversation(conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"deleted": True, "conversation_id": conversation_id, "session_id": conversation_id}


@router.patch("/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, payload: RenameConversationPayload):
    success = await chat_service.update_conversation_title(conversation_id, payload.title)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"updated": True, "conversation_id": conversation_id, "title": payload.title}


@router.get("/conversation")
async def get_or_create_conversation(conversation_id: Optional[str] = None):
    return await chat_service.get_or_create_conversation(conversation_id)


# --- Composer Modal AI Refinement Endpoints ---

@router.post("/composer/refine-plan")
async def refine_plan_endpoint(payload: RefinePlanPayload):
    plan = await craft_plan(
        user_prompt=payload.prompt,
        period_id=payload.period_id or "2026-11-Q3",
        current_draft=payload.current_draft,
    )
    return plan


@router.post("/composer/refine-task")
async def refine_task_endpoint(payload: RefineTaskPayload):
    task = await craft_task(
        user_prompt=payload.prompt,
        period_id=payload.period_id or "2026-11-Q3",
        period_type=payload.period_type or "Q1",
        current_draft=payload.current_draft,
    )
    return task


# --- Quick Action Approval Gate Endpoints ---

class ExecuteActionPayload(BaseModel):
    action_id: str
    action_data: Dict[str, Any]
    session_id: Optional[str] = None
    message_id: Optional[str] = None


class RejectActionPayload(BaseModel):
    action_id: str
    session_id: Optional[str] = None
    message_id: Optional[str] = None


@router.post("/actions/execute")
async def execute_action_endpoint(payload: ExecuteActionPayload):
    """
    Strict Human-in-the-Loop Approval Execution Endpoint.
    Validates pending status, ensures idempotency, runs domain services,
    and updates conversation card state.
    """
    db = get_db()
    existing = await db.executed_actions.find_one({"action_id": payload.action_id})
    if existing:
        raise HTTPException(status_code=400, detail="Action has already been processed.")

    res = await execute_staged_action(payload.action_data)

    # Persist execution status for idempotency
    await db.executed_actions.insert_one({
        "action_id": payload.action_id,
        "status": res.get("status", "executed"),
        "executed_at": datetime.utcnow(),
        "result": res,
    })

    # Update conversation message card state if session_id provided
    if payload.session_id:
        await db.conversations.update_one(
            {
                "session_id": payload.session_id,
                "messages.card_data.action_id": payload.action_id,
            },
            {
                "$set": {
                    "messages.$.card_data.status": res.get("status", "executed"),
                    "messages.$.card_data.result": res,
                }
            },
        )

    return res


@router.post("/actions/reject")
async def reject_action_endpoint(payload: RejectActionPayload):
    """
    Rejection Endpoint for Staged Actions.
    Marks action as rejected and updates conversation message card state.
    """
    db = get_db()
    existing = await db.executed_actions.find_one({"action_id": payload.action_id})
    if existing:
        raise HTTPException(status_code=400, detail="Action has already been processed.")

    await db.executed_actions.insert_one({
        "action_id": payload.action_id,
        "status": "rejected",
        "rejected_at": datetime.utcnow(),
    })

    if payload.session_id:
        await db.conversations.update_one(
            {
                "session_id": payload.session_id,
                "messages.card_data.action_id": payload.action_id,
            },
            {
                "$set": {
                    "messages.$.card_data.status": "rejected",
                }
            },
        )

    return {"action_id": payload.action_id, "status": "rejected"}

