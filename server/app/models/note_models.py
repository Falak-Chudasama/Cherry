"""
Personal Context and Notes models for Cherry.
Aligned with Basket 3-Tier standard:
- application: 'cherry'
- metadata: dict
- timestamps formatted
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class PersonalNoteModel(BaseModel):
    note_id: str
    title: str
    content: str
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=lambda: {"version": "1.0"})
    application: str = "cherry"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
