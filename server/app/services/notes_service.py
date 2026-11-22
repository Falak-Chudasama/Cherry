"""
Personal Context and Notes service.
Standardized to MongoDB 'notes' collection with application='cherry'.
Synchronizes real-time with Basket 3-Tier knowledge base (POST /context/notes/sync).
"""
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from app.core.database import get_db
from app.adapters.basket_adapter import basket_adapter
from app.models.note_models import PersonalNoteModel


class NotesService:
    @property
    def db(self):
        return get_db()

    async def create_note(
        self,
        title: str,
        content: str,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> PersonalNoteModel:
        note_id = str(uuid.uuid4())
        note = PersonalNoteModel(
            note_id=note_id,
            title=title,
            content=content,
            tags=tags or [],
            metadata=metadata or {"version": "1.0"},
            application="cherry",
        )
        await self.db.notes.insert_one(note.model_dump())

        # Real-time synchronization to Basket 3-Tier knowledge base
        await basket_adapter.sync_note(
            action="upsert",
            note_id=note_id,
            title=title,
            content=content,
            metadata=note.metadata,
        )

        return note

    async def get_all_notes(self) -> List[PersonalNoteModel]:
        cursor = self.db.notes.find({"application": "cherry"}).sort("updated_at", -1)
        notes = []
        async for doc in cursor:
            # Map doc to model
            doc.pop("_id", None)
            notes.append(PersonalNoteModel(**doc))
        return notes

    async def get_note(self, note_id: str) -> Optional[PersonalNoteModel]:
        doc = await self.db.notes.find_one({"note_id": note_id, "application": "cherry"})
        if doc:
            doc.pop("_id", None)
            return PersonalNoteModel(**doc)
        return None

    async def update_note(
        self,
        note_id: str,
        title: str,
        content: str,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[PersonalNoteModel]:
        now = datetime.utcnow()
        update_fields: Dict[str, Any] = {
            "title": title,
            "content": content,
            "tags": tags or [],
            "updated_at": now,
        }
        if metadata is not None:
            update_fields["metadata"] = metadata

        res = await self.db.notes.find_one_and_update(
            {"note_id": note_id, "application": "cherry"},
            {"$set": update_fields},
            return_document=True,
        )
        if not res:
            return None

        res.pop("_id", None)
        note = PersonalNoteModel(**res)

        # Real-time synchronization to Basket
        await basket_adapter.sync_note(
            action="upsert",
            note_id=note_id,
            title=title,
            content=content,
            metadata=note.metadata,
        )

        return note

    async def delete_note(self, note_id: str) -> bool:
        res = await self.db.notes.delete_one({"note_id": note_id, "application": "cherry"})
        if res.deleted_count > 0:
            # Real-time delete sync to Basket
            await basket_adapter.sync_note(
                action="delete",
                note_id=note_id,
                title="",
                content="",
            )
            return True
        return False


notes_service = NotesService()
