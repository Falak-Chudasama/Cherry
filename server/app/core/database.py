"""
MongoDB connection and index management using Motor async client.
Supports multi-loop isolation to prevent 'Event loop is closed' errors during async tests.
"""
import asyncio
import logging
from typing import Optional, Dict
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING

from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabaseManager:
    def __init__(self):
        self._clients: Dict[int, AsyncIOMotorClient] = {}

    def get_client(self, uri: Optional[str] = None) -> AsyncIOMotorClient:
        try:
            loop = asyncio.get_running_loop()
            loop_id = id(loop)
        except RuntimeError:
            loop_id = 0

        if loop_id not in self._clients:
            target_uri = uri or settings.MONGO_URI
            self._clients[loop_id] = AsyncIOMotorClient(target_uri, serverSelectionTimeoutMS=3000)
        return self._clients[loop_id]

    @property
    def db(self) -> AsyncIOMotorDatabase:
        return self.get_client()[settings.DATABASE_NAME]

    def connect(self, uri: Optional[str] = None) -> AsyncIOMotorDatabase:
        return self.get_client(uri)[settings.DATABASE_NAME]

    def close(self):
        for client in self._clients.values():
            try:
                client.close()
            except Exception:
                pass
        self._clients.clear()
        logger.info("MongoDB connections closed.")

    async def init_indexes(self):
        """Create necessary compound and unique indexes idempotently."""
        target_db = self.db
        try:
            # Verses
            await target_db.verses.create_index([("verse_id", ASCENDING)], unique=True)

            # Seasons
            await target_db.seasons.create_index([("season_id", ASCENDING)], unique=True)

            # Quarters
            await target_db.quarters.create_index([("quarter_id", ASCENDING)], unique=True)
            await target_db.quarters.create_index([("season_id", ASCENDING)])

            # Surplus Periods
            await target_db.surplus_periods.create_index([("surplus_id", ASCENDING)], unique=True)

            # Days
            await target_db.days.create_index([("date_str", ASCENDING)], unique=True)
            await target_db.days.create_index([("period_id", ASCENDING)])

            # Tasks & Goals
            await target_db.tasks.create_index([("task_id", ASCENDING)], unique=True)
            await target_db.tasks.create_index([("quarter_id", ASCENDING)])
            await target_db.tasks.create_index([("target_date", ASCENDING)])
            await target_db.goals.create_index([("goal_id", ASCENDING)], unique=True)
            await target_db.goals.create_index([("quarter_id", ASCENDING)])

            # Routines
            await target_db.routine_definitions.create_index([("routine_id", ASCENDING)], unique=True)
            await target_db.routine_occurrences.create_index(
                [("routine_id", ASCENDING), ("date_str", ASCENDING)], unique=True
            )

            # Plans & Todo Drafts
            await target_db.quarter_plans.create_index([("plan_id", ASCENDING)], unique=True)
            await target_db.quarter_plans.create_index([("quarter_id", ASCENDING)])
            await target_db.todo_drafts.create_index([("draft_id", ASCENDING)], unique=True)
            await target_db.todo_drafts.create_index([("date_str", ASCENDING)])

            # Accountability & Ledgers
            await target_db.quarter_key_ledger.create_index([("tx_id", ASCENDING)], unique=True)
            await target_db.quarter_key_ledger.create_index([("quarter_id", ASCENDING)])
            await target_db.junk_point_ledger.create_index([("entry_id", ASCENDING)], unique=True)
            await target_db.junk_point_ledger.create_index([("date_str", ASCENDING)])
            await target_db.violations.create_index([("violation_id", ASCENDING)], unique=True)
            await target_db.rules.create_index([("rule_id", ASCENDING)], unique=True)
            await target_db.food_jp_mappings.create_index([("food_name", ASCENDING)], unique=True)

            # Focus & Pomodoro
            await target_db.pomodoro_sessions.create_index([("session_id", ASCENDING)], unique=True)
            await target_db.pomodoro_sessions.create_index([("date_str", ASCENDING)])

            # Feedback & Summaries
            await target_db.daily_summaries.create_index(
                [("date_str", ASCENDING), ("version", ASCENDING)], unique=True
            )
            await target_db.friction_logs.create_index([("friction_id", ASCENDING)], unique=True)

            # Notes
            await target_db.personal_notes.create_index([("note_id", ASCENDING)], unique=True)

            # Lifecycle Jobs (Mandatory unique constraint for idempotency)
            await target_db.lifecycle_jobs.create_index([("idempotency_key", ASCENDING)], unique=True)
            await target_db.lifecycle_jobs.create_index([("calendar_date", ASCENDING)])
            await target_db.lifecycle_jobs.create_index([("status", ASCENDING)])

            # Standard 3-Tier Context Collections (Basket Standard)
            # A. chats (Multi-Chat Collection)
            await target_db.chats.create_index([("session_id", ASCENDING)], unique=True)
            await target_db.chats.create_index([("application", ASCENDING)])
            await target_db.chats.create_index([("updated_at", -1)])

            # B. notes (Persistent Knowledge Base)
            await target_db.notes.create_index([("note_id", ASCENDING)], sparse=True)
            await target_db.notes.create_index([("application", ASCENDING)])
            await target_db.notes.create_index([("updated_at", -1)])

            # C. commands (Behavioral Rules)
            await target_db.commands.create_index([("command_id", ASCENDING)], unique=True, sparse=True)
            await target_db.commands.create_index([("application", ASCENDING)])
            await target_db.commands.create_index([("is_active", ASCENDING)])

            # Executed Actions (Chat quick_action audit & approval log)
            await target_db.executed_actions.create_index([("action_id", ASCENDING)], unique=True)
            await target_db.executed_actions.create_index([("created_at", -1)])

            # Automatic Migration from legacy collections if present
            await self._run_migrations(target_db)

            # Notifications
            await target_db.notifications.create_index([("notification_id", ASCENDING)], unique=True)
            await target_db.notifications.create_index([("target_date", ASCENDING)])

            logger.info("MongoDB indexes verified successfully.")
        except Exception as e:
            logger.warning(f"Index initialization warning (non-fatal if offline): {e}")

    async def _run_migrations(self, target_db):
        """Idempotently migrate any legacy records into the 3 standard collections."""
        try:
            # 1. Migrate legacy conversations -> chats
            conv_cursor = target_db.conversations.find()
            async for doc in conv_cursor:
                session_id = doc.get("conversation_id") or str(doc.get("_id"))
                existing = await target_db.chats.find_one({"session_id": session_id})
                if not existing:
                    clean_msgs = []
                    for m in doc.get("messages", []):
                        created = m.get("created_at")
                        if isinstance(created, str):
                            c_str = created
                        elif created:
                            c_str = created.strftime("%Y-%m-%d %H:%M:%S")
                        else:
                            c_str = ""
                        clean_msgs.append({
                            "role": m.get("role", "user"),
                            "content": m.get("content", ""),
                            "card_type": m.get("card_type", "text"),
                            "card_data": m.get("card_data"),
                            "created_at": c_str,
                        })
                    c_at = doc.get("created_at")
                    u_at = doc.get("updated_at")
                    await target_db.chats.insert_one({
                        "session_id": session_id,
                        "title": doc.get("title", "New Chat"),
                        "application": "cherry",
                        "messages": clean_msgs,
                        "created_at": c_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(c_at, "strftime") else str(c_at or ""),
                        "updated_at": u_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(u_at, "strftime") else str(u_at or ""),
                    })

            # 2. Migrate legacy personal_notes -> notes
            pnote_cursor = target_db.personal_notes.find()
            async for doc in pnote_cursor:
                note_id = doc.get("note_id") or str(doc.get("_id"))
                existing = await target_db.notes.find_one({"note_id": note_id})
                if not existing:
                    c_at = doc.get("created_at")
                    u_at = doc.get("updated_at")
                    await target_db.notes.insert_one({
                        "note_id": note_id,
                        "title": doc.get("title", ""),
                        "content": doc.get("content", ""),
                        "tags": doc.get("tags", []),
                        "metadata": doc.get("metadata", {"version": "1.0"}),
                        "application": "cherry",
                        "created_at": c_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(c_at, "strftime") else str(c_at or ""),
                        "updated_at": u_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(u_at, "strftime") else str(u_at or ""),
                    })

            # 3. Seed standard command if commands collection is empty
            cmd_count = await target_db.commands.count_documents({"application": "cherry"})
            if cmd_count == 0:
                now_str = ""
                from datetime import datetime
                now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                await target_db.commands.insert_one({
                    "command": "Always structure system diagnostics responses in markdown tables with latency in milliseconds.",
                    "is_active": True,
                    "application": "cherry",
                    "created_at": now_str,
                    "updated_at": now_str,
                })
            # 4. Migrate task statuses cleanly to 3-state Kanban model ("Not started", "In progress", "Done")
            task_cursor = target_db.tasks.find({"status": {"$nin": ["Not started", "In progress", "Done"]}})
            async for t_doc in task_cursor:
                old_status = str(t_doc.get("status", "")).lower()
                if old_status in ("completed", "done"):
                    new_status = "Done"
                elif old_status in ("in_progress", "in-progress", "active"):
                    new_status = "In progress"
                else:
                    new_status = "Not started"
                
                updates = {"status": new_status}
                if not t_doc.get("period_id") and t_doc.get("quarter_id"):
                    updates["period_id"] = t_doc["quarter_id"]
                if not t_doc.get("period_type"):
                    pid = updates.get("period_id") or t_doc.get("period_id") or t_doc.get("quarter_id", "")
                    if "SURPLUS" in pid.upper():
                        updates["period_type"] = "SURPLUS"
                    elif "Q4" in pid.upper():
                        updates["period_type"] = "Q4"
                    elif "Q3" in pid.upper():
                        updates["period_type"] = "Q3"
                    elif "Q2" in pid.upper():
                        updates["period_type"] = "Q2"
                    else:
                        updates["period_type"] = "Q1"
                
                await target_db.tasks.update_one({"_id": t_doc["_id"]}, {"$set": updates})
        except Exception as exc:
            logger.warning(f"Data migration warning: {exc}")

    async def is_healthy(self) -> bool:
        try:
            await self.db.command("ping")
            return True
        except Exception:
            return False


db_manager = DatabaseManager()


def get_db() -> AsyncIOMotorDatabase:
    return db_manager.db
