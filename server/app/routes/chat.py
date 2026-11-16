"""
Conversational Assistant Routes for Cherry.
Primary interface coordinating multi-chat natural language conversations and rich structured cards.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.services.chat_service import chat_service

router = APIRouter(prefix="/api/chat", tags=["Chat"])


class SendMessagePayload(BaseModel):
    conversation_id: Optional[str] = None
    content: str


class CreateConversationPayload(BaseModel):
    title: Optional[str] = None


class RenameConversationPayload(BaseModel):
    title: str


@router.get("/conversations")
async def list_conversations():
    """List all saved conversations sorted by updated_at descending."""
    return await chat_service.list_conversations()


@router.post("/conversations")
async def create_conversation(payload: Optional[CreateConversationPayload] = None):
    """Create a new conversational session in the database."""
    title = payload.title if payload else None
    conv = await chat_service.create_new_conversation(title=title)
    return conv.model_dump()


@router.get("/conversations/{conversation_id}")
async def get_conversation_by_id(conversation_id: str):
    """Retrieve full conversation document and messages."""
    doc = await chat_service.get_or_create_conversation(conversation_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return doc.model_dump()


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation from the database."""
    success = await chat_service.delete_conversation(conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"deleted": True, "conversation_id": conversation_id}


@router.patch("/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, payload: RenameConversationPayload):
    """Rename a conversation."""
    success = await chat_service.update_conversation_title(conversation_id, payload.title)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"updated": True, "conversation_id": conversation_id, "title": payload.title}


@router.get("/conversation")
async def get_or_create_conversation(conversation_id: Optional[str] = None):
    """Backward-compatible endpoint for default/current conversation."""
    conv = await chat_service.get_or_create_conversation(conversation_id)
    return conv.model_dump()


@router.post("/message")
async def send_message(payload: SendMessagePayload):
    """Send user message to a conversation and receive assistant response."""
    conv = await chat_service.get_or_create_conversation(payload.conversation_id)
    assistant_msg = await chat_service.handle_user_message(
        conversation_id=conv.conversation_id,
        user_text=payload.content,
    )
    return {
        "conversation_id": conv.conversation_id,
        "reply": assistant_msg.model_dump(),
    }
