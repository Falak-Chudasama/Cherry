"""
Personal Context and Notes service.
Allows storing, retrieving, and updating user personal commitments and context.
Synchronizes with Basket's central context memory where suitable.
"""
import uuid
from datetime import datetime
from typing import List, Optional
from app.core.database import get_db
from app.adapters.basket_adapter import basket_adapter
from app.models.note_models import PersonalNoteModel


class NotesService:
    @property
    def db(self):
        return get_db()

    async def create_note(self, title: str, content: str, tags: Optional[List[str]] = None) -> PersonalNoteModel:
        note_id = str(uuid.uuid4())
        note = PersonalNoteModel(
            note_id=note_id,
            title=title,
            content=content,
            tags=tags or [],
        )
        await self.db.personal_notes.insert_one(note.model_dump())
        # Ephemerally register in Basket context memory
        await basket_adapter.add_context_memory(f"Note '{title}': {content}", is_temporary=False)
        return note

    async def get_all_notes(self) -> List[PersonalNoteModel]:
        cursor = self.db.personal_notes.find().sort("updated_at", -1)
        return [PersonalNoteModel(**doc) async for doc in cursor]

    async def get_note(self, note_id: str) -> Optional[PersonalNoteModel]:
        doc = await self.db.personal_notes.find_one({"note_id": note_id})
        return PersonalNoteModel(**doc) if doc else None

    async def update_note(self, note_id: str, title: str, content: str, tags: Optional[List[str]] = None) -> Optional[PersonalNoteModel]:
        res = await self.db.personal_notes.find_one_and_update(
            {"note_id": note_id},
            {
                "$set": {
                    "title": title,
                    "content": content,
                    "tags": tags or [],
                    "updated_at": datetime.utcnow(),
                }
            },
            return_document=True,
        )
        return PersonalNoteModel(**res) if res else None

    async def delete_note(self, note_id: str) -> bool:
        res = await self.db.personal_notes.delete_one({"note_id": note_id})
        return res.deleted_count > 0


notes_service = NotesService()
