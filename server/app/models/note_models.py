"""
Personal Context and Notes models for Cherry.
"""
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class PersonalNoteModel(BaseModel):
    note_id: str
    title: str
    content: str
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
