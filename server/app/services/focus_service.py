"""
Pomodoro and Focus Mode domain service.
Coordinates local focus sessions with Lemon's authoritative DNS firewall.
Recovers session state across application crashes and server restarts.
"""
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from app.core.database import get_db
from app.core.config import settings
from app.adapters.lemon_adapter import lemon_adapter
from app.models.focus_models import PomodoroSessionModel, FocusStateModel, FocusSessionStatus

logger = logging.getLogger(__name__)


class FocusService:
    @property
    def db(self):
        return get_db()

    async def get_focus_state(self) -> FocusStateModel:
        """Inspect current focus session and verify Lemon synchronization."""
        # Find active session
        active_session = await self.db.pomodoro_sessions.find_one({"status": "active"})
        lemon_dns = await lemon_adapter.get_dns_status()
        dns_enabled = lemon_dns.get("dns_enabled", False)

        is_active = active_session is not None
        session_id = active_session["session_id"] if active_session else None

        return FocusStateModel(
            is_focus_active=is_active,
            current_session_id=session_id,
            dns_protection_active=dns_enabled,
            lemon_synchronized=(is_active == dns_enabled) if "error" not in lemon_dns else False,
            last_reconciled_at=datetime.utcnow(),
            error_message=lemon_dns.get("error"),
        )

    async def start_pomodoro(
        self,
        date_str: str,
        task_id: Optional[str] = None,
        task_title: Optional[str] = None,
        planned_minutes: Optional[int] = None,
    ) -> PomodoroSessionModel:
        """
        Start a focus session, persist timestamps, and activate Lemon DNS restrictions.
        """
        # Close any existing active sessions
        await self.db.pomodoro_sessions.update_many(
            {"status": "active"},
            {"$set": {"status": "interrupted", "ended_at": datetime.utcnow()}},
        )

        duration = planned_minutes or settings.FOCUS_DURATION_MINUTES
        session_id = str(uuid.uuid4())

        # Request Lemon to enable DNS filtering
        lemon_res = await lemon_adapter.enable_dns()
        dns_enabled = lemon_res.get("dns_enabled", False) or lemon_res.get("success", False)

        session = PomodoroSessionModel(
            session_id=session_id,
            date_str=date_str,
            task_id=task_id,
            task_title=task_title,
            planned_minutes=duration,
            started_at=datetime.utcnow(),
            status="active",
            dns_enabled_by_session=dns_enabled,
        )

        await self.db.pomodoro_sessions.insert_one(session.model_dump())

        # Link to Day record
        await self.db.days.update_one(
            {"date_str": date_str},
            {"$addToSet": {"focus_session_ids": session_id}},
        )

        logger.info(f"Pomodoro started: {session_id} for {duration} min (DNS: {dns_enabled})")
        return session

    async def pause_pomodoro(self, session_id: str) -> Optional[PomodoroSessionModel]:
        doc = await self.db.pomodoro_sessions.find_one({"session_id": session_id, "status": "active"})
        if not doc:
            return None

        res = await self.db.pomodoro_sessions.find_one_and_update(
            {"session_id": session_id},
            {"$set": {"status": "paused", "paused_at": datetime.utcnow()}},
            return_document=True,
        )
        return PomodoroSessionModel(**res) if res else None

    async def resume_pomodoro(self, session_id: str) -> Optional[PomodoroSessionModel]:
        doc = await self.db.pomodoro_sessions.find_one({"session_id": session_id, "status": "paused"})
        if not doc:
            return None

        session = PomodoroSessionModel(**doc)
        extra_paused = 0.0
        if session.paused_at:
            extra_paused = (datetime.utcnow() - session.paused_at).total_seconds()

        total_paused = session.total_paused_seconds + extra_paused

        res = await self.db.pomodoro_sessions.find_one_and_update(
            {"session_id": session_id},
            {
                "$set": {
                    "status": "active",
                    "paused_at": None,
                    "total_paused_seconds": total_paused,
                }
            },
            return_document=True,
        )
        return PomodoroSessionModel(**res) if res else None

    async def stop_pomodoro(
        self,
        session_id: str,
        status: FocusSessionStatus = "completed",
        outcome_notes: Optional[str] = None,
    ) -> Optional[PomodoroSessionModel]:
        """
        End a focus session and request Lemon to deactivate DNS restrictions.
        """
        doc = await self.db.pomodoro_sessions.find_one({"session_id": session_id})
        if not doc:
            return None

        # Request Lemon to disable DNS filtering
        lemon_res = await lemon_adapter.disable_dns()
        if not lemon_res.get("success", False) and lemon_res.get("reason") == "BLACKOUT_ACTIVE":
            logger.info("DNS protection preserved due to mandatory Lemon Blackout.")

        res = await self.db.pomodoro_sessions.find_one_and_update(
            {"session_id": session_id},
            {
                "$set": {
                    "status": status,
                    "ended_at": datetime.utcnow(),
                    "outcome_notes": outcome_notes,
                }
            },
            return_document=True,
        )
        return PomodoroSessionModel(**res) if res else None

    async def get_sessions_for_day(self, date_str: str) -> List[PomodoroSessionModel]:
        cursor = self.db.pomodoro_sessions.find({"date_str": date_str}).sort("started_at", 1)
        return [PomodoroSessionModel(**doc) async for doc in cursor]

    async def reconcile_active_sessions_on_startup(self):
        """
        Reconstruct focus session state across restarts from persisted timestamps.
        If planned time elapsed during offline downtime, marks as completed.
        Reconciles desired Focus Mode with Lemon's actual DNS resolver status.
        """
        logger.info("Reconciling Pomodoro and Focus sessions on startup...")
        cursor = self.db.pomodoro_sessions.find({"status": "active"})
        now = datetime.utcnow()

        async for doc in cursor:
            session = PomodoroSessionModel(**doc)
            elapsed_sec = (now - session.started_at).total_seconds() - session.total_paused_seconds
            planned_sec = session.planned_minutes * 60

            if elapsed_sec >= planned_sec:
                logger.info(f"Session {session.session_id} completed while offline ({elapsed_sec:.0f}s).")
                await self.db.pomodoro_sessions.update_one(
                    {"session_id": session.session_id},
                    {
                        "$set": {
                            "status": "completed",
                            "ended_at": session.started_at + timedelta(seconds=planned_sec),
                            "outcome_notes": "Completed during offline catch-up.",
                        }
                    },
                )
            else:
                logger.info(f"Session {session.session_id} still has remaining time: resuming.")

        # Reconcile Lemon DNS with current state
        has_active = await self.db.pomodoro_sessions.count_documents({"status": "active"}) > 0
        lemon_dns = await lemon_adapter.get_dns_status()
        if not has_active and lemon_dns.get("dns_enabled", False):
            # No active focus session in Cherry; request disable if not in blackout
            if not lemon_dns.get("blackout", {}).get("active", False):
                await lemon_adapter.disable_dns()
        elif has_active and not lemon_dns.get("dns_enabled", False):
            await lemon_adapter.enable_dns()


focus_service = FocusService()
