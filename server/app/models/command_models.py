"""
Command models for Cherry.
Standing behavioral instructions synced to Basket's commands collection.
"""
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class CommandModel(BaseModel):
    command_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    application: str = "cherry"
    name: str
    content: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CreateCommandPayload(BaseModel):
    name: str
    content: str
    is_active: bool = True


class UpdateCommandPayload(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None
