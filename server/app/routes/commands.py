"""
Commands management routes for Cherry.
Provides CRUD for standing behavioral instructions, stored in cherry.commands
and synchronized in real-time with Basket (POST /context/commands/sync).
"""
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from typing import List
from app.core.database import get_db
from app.adapters.basket_adapter import basket_adapter
from app.models.command_models import CommandModel, CreateCommandPayload, UpdateCommandPayload

router = APIRouter(prefix="/api/commands", tags=["Commands"])


@router.get("")
async def list_commands():
    db = get_db()
    cursor = db.commands.find({"application": "cherry"}).sort("created_at", -1)
    commands = [CommandModel(**doc) async for doc in cursor]
    return [c.model_dump() for c in commands]


@router.post("")
async def create_command(payload: CreateCommandPayload):
    db = get_db()
    cmd = CommandModel(
        command_id=str(uuid.uuid4()),
        application="cherry",
        name=payload.name.strip(),
        content=payload.content.strip(),
        is_active=payload.is_active,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await db.commands.insert_one(cmd.model_dump())

    # Sync to Basket
    await basket_adapter.sync_command(
        action="upsert",
        command_id=cmd.command_id,
        command=cmd.content,
    )

    return cmd.model_dump()


@router.put("/{command_id}")
async def update_command(command_id: str, payload: UpdateCommandPayload):
    db = get_db()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    updates["updated_at"] = datetime.utcnow()
    res = await db.commands.find_one_and_update(
        {"command_id": command_id, "application": "cherry"},
        {"$set": updates},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Command not found.")

    cmd = CommandModel(**res)
    # Sync to Basket
    await basket_adapter.sync_command(
        action="upsert",
        command_id=cmd.command_id,
        command=cmd.content,
    )
    return cmd.model_dump()


@router.delete("/{command_id}")
async def delete_command(command_id: str):
    db = get_db()
    res = await db.commands.delete_one({"command_id": command_id, "application": "cherry"})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Command not found.")

    # Sync delete to Basket
    await basket_adapter.sync_command(
        action="delete",
        command_id=command_id,
        command="",
    )
    return {"deleted": True, "command_id": command_id}
