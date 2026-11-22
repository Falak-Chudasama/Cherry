"""
Durable Lifecycle, Outbox, and Offline Downtime Recovery Engine.

Mandatory Engineering Guarantee:
- Survives arbitrary server power-downs and reboots.
- Durable idempotency in MongoDB: zero duplicate closures or double transitions.
- Executes chronological catch-up across missed days, quarters, seasons, surplus periods, and verses.
- Disallows fabrication of historical user actions (retrospective drafts remain drafts).
- Recovers when Lemon or Basket external services are temporarily unreachable.
"""
import uuid
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any
from app.core.database import get_db
from app.core.config import settings
from app.core import calendar as cal
from app.services.calendar_service import calendar_service
from app.services.task_service import task_service
from app.services.accountability_service import accountability_service
from app.services.focus_service import focus_service
from app.services.feedback_service import feedback_service
from app.services.plan_service import plan_service
from app.models.lifecycle_models import LifecycleJobModel, LifecycleStatus, LifecycleOpType, NotificationModel

logger = logging.getLogger(__name__)


class LifecycleService:
    @property
    def db(self):
        return get_db()

    # --- Durable Job Enqueue & Idempotency ---

    async def enqueue_job(
        self,
        idempotency_key: str,
        calendar_date: str,
        op_type: LifecycleOpType,
        dependencies: Optional[List[str]] = None,
    ) -> LifecycleJobModel:
        """
        Durable enqueue with strict unique constraint.
        If a job with this idempotency key already exists, returns the existing job.
        """
        existing = await self.db.lifecycle_jobs.find_one({"idempotency_key": idempotency_key})
        if existing:
            return LifecycleJobModel(**existing)

        job = LifecycleJobModel(
            job_id=str(uuid.uuid4()),
            idempotency_key=idempotency_key,
            calendar_date=calendar_date,
            operation_type=op_type,
            dependencies=dependencies or [],
            status="pending",
            scheduled_at=datetime.utcnow(),
        )

        try:
            await self.db.lifecycle_jobs.insert_one(job.model_dump())
        except Exception as e:
            # Race condition / duplicate key handled safely
            doc = await self.db.lifecycle_jobs.find_one({"idempotency_key": idempotency_key})
            if doc:
                return LifecycleJobModel(**doc)
            raise e

        return job

    # --- Startup Reconciliation ---

    async def reconcile_on_startup(self) -> Dict[str, Any]:
        """
        The critical startup reconciliation process.
        Calculates what should already exist, identifies missed days chronologically,
        reconstructs Pomodoro timers, and processes all missed lifecycle milestones.
        """
        logger.info("====================================================")
        logger.info("CHERRY STARTUP RECONCILIATION & DOWNTIME CATCH-UP")
        logger.info("====================================================")

        today = cal.today_local()
        today_str = cal.format_date(today)
        results = {"reconciled_dates": [], "jobs_executed": 0, "errors": []}

        # 1. Recover active Pomodoro sessions across restart
        await focus_service.reconcile_active_sessions_on_startup()

        # 2. Ensure current hierarchy exists for today
        await calendar_service.ensure_verse_exists(today.year)
        await calendar_service.ensure_season_exists(today.year, today.month)
        await calendar_service.ensure_day_exists(today)

        # 3. Find historical anchor date (earliest recorded day or default to start of current month)
        earliest_day = await self.db.days.find_one({}, sort=[("date_str", 1)])
        if earliest_day:
            anchor_date = cal.parse_date(earliest_day["date_str"])
        else:
            # First launch: anchor at the 1st of current month
            anchor_date = date(today.year, today.month, 1)

        # 4. Generate all calendar days from anchor_date up to yesterday that need closure
        yesterday = today - timedelta(days=1)
        if anchor_date <= yesterday:
            missed_dates = cal.get_date_sequence(anchor_date, yesterday)
            logger.info(f"Checking {len(missed_dates)} dates for chronological catch-up ({anchor_date} to {yesterday})...")

            for target_d in missed_dates:
                target_str = cal.format_date(target_d)
                await self._catch_up_date(target_d)
                results["reconciled_dates"].append(target_str)

        # 5. Ensure today's routine occurrences and Todo draft exist
        await task_service.generate_routine_occurrences_for_day(today)
        existing_draft = await self.db.todo_drafts.find_one({"date_str": today_str})
        if not existing_draft:
            await plan_service.generate_daily_todo_draft(today_str, is_retrospective=False)

        # 6. Reconcile overdue notifications
        await self._reconcile_notifications(today)

        logger.info("Startup reconciliation complete.")
        return results

    # --- Chronological Catch-Up for a Single Date ---

    async def _catch_up_date(self, target_d: date) -> None:
        """
        Process a historical date chronologically:
        1. Ensure Day record exists
        2. Ensure draft Todo list exists (flagged retrospective)
        3. Retrieve Lemon metadata & generate feedback summary
        4. Execute daily closure
        5. Check Quarter, Surplus Period, Season, and Verse transitions
        """
        target_str = cal.format_date(target_d)
        logger.info(f"Catch-up processing date: {target_str}")

        # 1. Day record
        day = await calendar_service.ensure_day_exists(target_d)

        # 2. Retrospective draft Todo list if missing (marked retrospective)
        existing_draft = await self.db.todo_drafts.find_one({"date_str": target_str})
        if not existing_draft:
            await plan_service.generate_daily_todo_draft(target_str, is_retrospective=True)

        # 3. Lemon metadata & feedback summary (durable job)
        job_feedback_key = f"feedback:{target_str}"
        feedback_job = await self.enqueue_job(
            idempotency_key=job_feedback_key,
            calendar_date=target_str,
            op_type="lemon_ingestion",
        )
        if feedback_job.status in ("pending", "failed", "awaiting_external"):
            await self._execute_feedback_job(feedback_job)

        # 4. Daily Closure (durable job)
        job_closure_key = f"closure:{target_str}"
        closure_job = await self.enqueue_job(
            idempotency_key=job_closure_key,
            calendar_date=target_str,
            op_type="daily_closure",
            dependencies=[feedback_job.job_id],
        )
        if closure_job.status in ("pending", "failed"):
            await self._execute_closure_job(closure_job, target_d)

        # 5. Check Quarter closure & transition (Days 7, 14, 21, 28)
        if cal.is_quarter_closing_day(target_d):
            period_type, q_id = cal.get_period_for_day(target_d)
            q_closure_key = f"quarter_close:{q_id}"
            q_job = await self.enqueue_job(
                idempotency_key=q_closure_key,
                calendar_date=target_str,
                op_type="quarter_closure",
            )
            if q_job.status in ("pending", "failed"):
                await calendar_service.close_quarter(q_id)
                await self.db.lifecycle_jobs.update_one(
                    {"job_id": q_job.job_id},
                    {"$set": {"status": "completed", "executed_at": datetime.utcnow()}},
                )
                logger.info(f"Quarter {q_id} closed at calendar boundary.")

        # 6. Check Surplus Period closure (last day of month if > 28 days)
        if cal.is_season_closing_day(target_d):
            days_in_m = cal.get_days_in_month(target_d.year, target_d.month)
            if days_in_m > 28:
                surplus_id = cal.get_surplus_id(target_d.year, target_d.month)
                s_key = f"surplus_close:{surplus_id}"
                s_job = await self.enqueue_job(
                    idempotency_key=s_key,
                    calendar_date=target_str,
                    op_type="surplus_closure",
                )
                if s_job.status in ("pending", "failed"):
                    await self.db.surplus_periods.update_one(
                        {"surplus_id": surplus_id},
                        {"$set": {"status": "closed", "closed_at": datetime.utcnow()}},
                    )
                    await self.db.lifecycle_jobs.update_one(
                        {"job_id": s_job.job_id},
                        {"$set": {"status": "completed", "executed_at": datetime.utcnow()}},
                    )

            # 7. Season closure
            season_id = cal.get_season_id(target_d.year, target_d.month)
            season_key = f"season_close:{season_id}"
            season_job = await self.enqueue_job(
                idempotency_key=season_key,
                calendar_date=target_str,
                op_type="season_closure",
            )
            if season_job.status in ("pending", "failed"):
                await calendar_service.close_season(season_id)
                await self.db.lifecycle_jobs.update_one(
                    {"job_id": season_job.job_id},
                    {"$set": {"status": "completed", "executed_at": datetime.utcnow()}},
                )
                logger.info(f"Season {season_id} closed at month end.")

            # 8. Verse closure (Dec 31)
            if cal.is_verse_closing_day(target_d):
                verse_id = cal.get_verse_id(target_d.year)
                verse_key = f"verse_close:{verse_id}"
                verse_job = await self.enqueue_job(
                    idempotency_key=verse_key,
                    calendar_date=target_str,
                    op_type="verse_closure",
                )
                if verse_job.status in ("pending", "failed"):
                    await calendar_service.close_verse(verse_id)
                    await self.db.lifecycle_jobs.update_one(
                        {"job_id": verse_job.job_id},
                        {"$set": {"status": "completed", "executed_at": datetime.utcnow()}},
                    )
                    logger.info(f"Verse {verse_id} closed at year end.")

    # --- Job Execution Handlers ---

    async def _execute_feedback_job(self, job: LifecycleJobModel) -> None:
        """Execute daily feedback generation and Lemon metadata retrieval."""
        await self.db.lifecycle_jobs.update_one(
            {"job_id": job.job_id},
            {"$set": {"status": "running"}, "$inc": {"attempt_count": 1}},
        )
        try:
            summary = await feedback_service.generate_daily_feedback(job.calendar_date)
            status: LifecycleStatus = "completed" if summary.is_complete else "awaiting_external"
            await self.db.lifecycle_jobs.update_one(
                {"job_id": job.job_id},
                {
                    "$set": {
                        "status": status,
                        "executed_at": datetime.utcnow(),
                        "completion_result": {"summary_id": summary.summary_id, "is_complete": summary.is_complete},
                    }
                },
            )
        except Exception as e:
            logger.warning(f"Feedback job for {job.calendar_date} failed: {e}")
            await self.db.lifecycle_jobs.update_one(
                {"job_id": job.job_id},
                {"$set": {"status": "failed", "error_details": str(e)}},
            )

    async def _execute_closure_job(self, job: LifecycleJobModel, target_d: date) -> None:
        """Execute daily closure: reconcile task states, routines, and bad day rule."""
        await self.db.lifecycle_jobs.update_one(
            {"job_id": job.job_id},
            {"$set": {"status": "running"}, "$inc": {"attempt_count": 1}},
        )
        target_str = job.calendar_date

        try:
            # Check routine adherence
            routines_ok, missed_routines = await task_service.check_routine_adherence(target_str)
            bad_day_reasons = []
            if not routines_ok:
                bad_day_reasons.append(f"Missed scheduled routine(s): {', '.join(missed_routines)}")

            # Check Junk Points limit
            jp_total = await accountability_service.get_daily_junk_points_total(target_str)
            if jp_total > settings.JUNK_POINT_LIMIT:
                bad_day_reasons.append(f"Exceeded Junk Point limit: {jp_total} JP (limit {settings.JUNK_POINT_LIMIT})")

            is_bad = len(bad_day_reasons) > 0

            # Close the day record
            await calendar_service.close_day(target_str, is_bad=is_bad, reasons=bad_day_reasons)

            await self.db.lifecycle_jobs.update_one(
                {"job_id": job.job_id},
                {
                    "$set": {
                        "status": "completed",
                        "executed_at": datetime.utcnow(),
                        "completion_result": {"is_bad_day": is_bad, "reasons": bad_day_reasons},
                    }
                },
            )
            logger.info(f"Daily closure for {target_str} completed (is_bad={is_bad}).")
        except Exception as e:
            logger.error(f"Closure job for {target_str} failed: {e}")
            await self.db.lifecycle_jobs.update_one(
                {"job_id": job.job_id},
                {"$set": {"status": "failed", "error_details": str(e)}},
            )

    # --- Notifications Reconciliation ---

    async def _reconcile_notifications(self, today: date) -> None:
        """Detect and surface overdue notifications that were missed while offline."""
        now = datetime.utcnow()
        cursor = self.db.notifications.find({"is_delivered": False, "scheduled_for": {"$lt": now}})
        async for doc in cursor:
            # Mark as overdue reminder
            await self.db.notifications.update_one(
                {"notification_id": doc["notification_id"]},
                {"$set": {"is_overdue": True}},
            )

    async def schedule_daily_checkin(self, target_date_str: str) -> NotificationModel:
        """Schedule 10 PM daily check-in reminder."""
        d = cal.parse_date(target_date_str)
        scheduled_time = datetime(d.year, d.month, d.day, settings.CHECKIN_HOUR, 0, 0)
        notif = NotificationModel(
            notification_id=str(uuid.uuid4()),
            title="Daily Check-In",
            body="Review today's completed tasks, log friction, and select tomorrow's draft.",
            type="checkin",
            target_date=target_date_str,
            scheduled_for=scheduled_time,
        )
        await self.db.notifications.insert_one(notif.model_dump())
        return notif

    # --- Live 23:00 & 00:00 Background Scheduler ---

    async def run_lifecycle_tick(self) -> Dict[str, Any]:
        """
        Single tick for the 30-second live background scheduler.
        Runs in Asia/Kolkata timezone:
        - At or past 23:00: fires 23:00 end-of-day closure job (feedback & daily_closure) using lifecycle_jobs idempotency keys.
        - At or past 00:00: ensures today exists, generates routine occurrences, and if transition from yesterday wasn't processed, catches up yesterday.
        """
        now = cal.now_local()
        today_d = now.date()
        today_str = cal.format_date(today_d)
        actions_taken = []

        # 1. 23:00 End-of-Day Job
        if now.hour >= settings.CLOSURE_HOUR:  # 23:00
            closure_key = f"closure:{today_str}"
            job = await self.enqueue_job(
                idempotency_key=closure_key,
                calendar_date=today_str,
                op_type="daily_closure",
            )
            if job.status in ("pending", "failed"):
                # Ensure feedback job exists & runs
                fb_key = f"feedback:{today_str}"
                fb_job = await self.enqueue_job(
                    idempotency_key=fb_key,
                    calendar_date=today_str,
                    op_type="lemon_ingestion",
                )
                if fb_job.status in ("pending", "failed"):
                    await self._execute_feedback_job(fb_job)
                await self._execute_closure_job(job, today_d)
                actions_taken.append(f"executed_closure:{today_str}")

        # 2. 00:00 Transition & Hierarchy Assurance
        await calendar_service.ensure_verse_exists(today_d.year)
        await calendar_service.ensure_season_exists(today_d.year, today_d.month)
        await calendar_service.ensure_day_exists(today_d)
        await task_service.generate_routine_occurrences_for_day(today_d)

        # Check yesterday's closure if not already closed
        yesterday_d = today_d - timedelta(days=1)
        yesterday_str = cal.format_date(yesterday_d)
        yesterday_doc = await self.db.days.find_one({"date_str": yesterday_str})
        if yesterday_doc and yesterday_doc.get("status") != "closed":
            await self._catch_up_date(yesterday_d)
            actions_taken.append(f"catch_up_yesterday:{yesterday_str}")

        return {"timestamp": now.isoformat(), "actions": actions_taken}

    async def start_scheduler_loop(self) -> None:
        """Background loop ticking every 30s in Asia/Kolkata."""
        import asyncio
        logger.info("Starting live background lifecycle scheduler (tick every 30s in Asia/Kolkata)...")
        while True:
            try:
                await self.run_lifecycle_tick()
            except asyncio.CancelledError:
                logger.info("Lifecycle scheduler loop cancelled gracefully.")
                break
            except Exception as e:
                logger.error(f"Error during lifecycle scheduler tick: {e}", exc_info=True)
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                break


lifecycle_service = LifecycleService()
