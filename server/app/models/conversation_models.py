"""
Conversational interface models for Cherry.
"""
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


MessageRole = Literal["user", "assistant", "system"]
CardType = Literal[
    "text",
    "quarter_plan_proposal",
    "todo_draft",
    "focus_control",
    "feedback_report",
    "quarantine_control",
    "accountability_status",
    "action_confirmation",
]


class ChatMessageModel(BaseModel):
    message_id: str
    role: MessageRole
    content: str
    card_type: CardType = "text"
    card_data: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ConversationModel(BaseModel):
    conversation_id: str
    title: str = "New Conversation"
    messages: List[ChatMessageModel] = Field(default_factory=list)
    context_date: str  # YYYY-MM-DD
    active_quarter_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
