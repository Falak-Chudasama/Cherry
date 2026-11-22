"""
Conversational interface models for Cherry.
Aligned with Basket 3-Tier Multi-Chat Schema (cherry.chats collection):
- session_id: unique session key
- application: 'cherry'
- messages: list of messages with role, content, card_type, card_data, created_at
"""
from typing import List, Optional, Literal, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


MessageRole = Literal["user", "assistant", "system"]
CardType = Literal[
    "text",
    "plan_composer",
    "task_composer",
    "query_result",
    "action_result",
    "quarter_plan_proposal",
    "todo_draft",
    "focus_control",
    "feedback_report",
    "quarantine_control",
    "accountability_status",
    "action_confirmation",
]


class ChatMessageModel(BaseModel):
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: MessageRole
    content: str
    card_type: CardType = "text"
    card_data: Optional[Dict[str, Any]] = None
    created_at: Union[str, datetime] = Field(default_factory=datetime.utcnow)


class ConversationModel(BaseModel):
    session_id: str
    title: str = "New Conversation"
    application: str = "cherry"
    messages: List[ChatMessageModel] = Field(default_factory=list)
    context_date: Optional[str] = None
    active_quarter_id: Optional[str] = None
    created_at: Union[str, datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Union[str, datetime] = Field(default_factory=datetime.utcnow)

    @property
    def conversation_id(self) -> str:
        return self.session_id
