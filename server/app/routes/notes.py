"""
Personal Notes and Context routes.
Standardized to MongoDB 'notes' collection with application='cherry'.
Synchronizes real-time with Basket 3-Tier knowledge base (POST /context/notes/sync).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.services.notes_service import notes_service

router = APIRouter(prefix="/api/notes", tags=["Notes"])


class CreateNotePayload(BaseModel):
    title: str
    content: str
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class UpdateNotePayload(BaseModel):
    title: str
    content: str
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


@router.get("")
async def list_notes():
    notes = await notes_service.get_all_notes()
    return [n.model_dump() for n in notes]


@router.post("")
async def create_note(payload: CreateNotePayload):
    note = await notes_service.create_note(
        title=payload.title,
        content=payload.content,
        tags=payload.tags,
        metadata=payload.metadata,
    )
    return note.model_dump()


@router.get("/{note_id}")
async def get_note(note_id: str):
    note = await notes_service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    return note.model_dump()


@router.put("/{note_id}")
async def update_note(note_id: str, payload: UpdateNotePayload):
    note = await notes_service.update_note(
        note_id=note_id,
        title=payload.title,
        content=payload.content,
        tags=payload.tags,
        metadata=payload.metadata,
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    return note.model_dump()


@router.delete("/{note_id}")
async def delete_note(note_id: str):
    success = await notes_service.delete_note(note_id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"success": True, "note_id": note_id}
