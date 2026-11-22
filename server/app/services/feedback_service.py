"""
Daily Lemon Activity Ingestion and Evidence-Based Feedback Service.
Combines device activity intelligence with Cherry's task execution records.
Enforces strict privacy: discards raw Lemon activity payloads after computing derived metrics.
"""
import uuid
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from app.core.database import get_db
from app.adapters.lemon_adapter import lemon_adapter
from app.adapters.basket_adapter import basket_adapter
from app.services.task_service import task_service
from app.services.focus_service import focus_service
from app.services.accountability_service import accountability_service
from app.models.feedback_models import (
    DailyFeedbackSummaryModel,
    DerivedMetrics,
    ObservationItem,
    FrictionLogModel,
    FrictionCategory,
)

logger = logging.getLogger(__name__)


class FeedbackService:
    @property
    def db(self):
        return get_db()

    # --- Friction Logs ---

    async def log_friction(
        self,
        date_str: str,
        category: FrictionCategory,
        description: str,
        task_id: Optional[str] = None,
        task_title: Optional[str] = None,
        impact_level: str = "medium",
    ) -> FrictionLogModel:
        friction_id = str(uuid.uuid4())
        log = FrictionLogModel(
            friction_id=friction_id,
            date_str=date_str,
            task_id=task_id,
            task_title=task_title,
            category=category,
            description=description,
            impact_level=impact_level,
        )
        await self.db.friction_logs.insert_one(log.model_dump())
        await self.db.days.update_one(
            {"date_str": date_str},
            {"$addToSet": {"friction_log_ids": friction_id}},
        )
        return log

    async def get_friction_logs_for_day(self, date_str: str) -> List[FrictionLogModel]:
        cursor = self.db.friction_logs.find({"date_str": date_str}).sort("timestamp", 1)
        return [FrictionLogModel(**doc) async for doc in cursor]

    # --- Daily Feedback Generation ---

    async def generate_daily_feedback(
        self,
        date_str: str,
        version: int = 1,
    ) -> DailyFeedbackSummaryModel:
        """
        Ingest Lemon activity for date_str, combine with Cherry productivity records,
        and generate evidence-grounded summary. Discards raw Lemon payload.
        """
        logger.info(f"Generating daily feedback for {date_str} (v{version})...")

        # 1. Ephemeral Lemon activity retrieval
        lemon_data = await lemon_adapter.get_activity_summary(date_str)
        lemon_available = lemon_data is not None

        # 2. Cherry productivity records
        tasks = await task_service.get_tasks_for_day(date_str)
        routines_adhered, missed_routines = await task_service.check_routine_adherence(date_str)
        pomodoros = await focus_service.get_sessions_for_day(date_str)
        frictions = await self.get_friction_logs_for_day(date_str)
        junk_points = await accountability_service.get_daily_junk_points_total(date_str)

        # Count metrics
        completed_tasks = [t for t in tasks if t.status == "completed"]
        missed_tasks = [t for t in tasks if t.status in ("missed", "deferred")]
        approved_tasks = [t for t in tasks if t.status != "suggested"]

        total_focus_sec = sum(
            p.planned_minutes * 60 for p in pomodoros if p.status == "completed"
        )
        focus_minutes = total_focus_sec / 60.0

        day_doc = await self.db.days.find_one({"date_str": date_str})
        bad_day = day_doc.get("is_bad_day", False) if day_doc else not routines_adhered

        # 3. Build Derived Metrics
        derived = DerivedMetrics(
            date_str=date_str,
            total_active_seconds=lemon_data.get("total_active_seconds", 0.0) if lemon_available else 0.0,
            productive_seconds=lemon_data.get("productive_seconds", 0.0) if lemon_available else 0.0,
            entertainment_seconds=lemon_data.get("entertainment_seconds", 0.0) if lemon_available else 0.0,
            tasks_approved_count=len(approved_tasks),
            tasks_completed_count=len(completed_tasks),
            tasks_missed_count=len(missed_tasks),
            routines_scheduled_count=len(missed_routines) + (1 if routines_adhered and not missed_routines else 0),
            routines_completed_count=1 if routines_adhered else 0,
            routines_missed_count=len(missed_routines),
            focus_sessions_completed=len([p for p in pomodoros if p.status == "completed"]),
            focus_minutes_total=focus_minutes,
            friction_events_count=len(frictions),
            junk_points_total=junk_points,
            bad_day=bad_day,
        )

        # 4. Evidence Classification
        observations: List[ObservationItem] = []

        # Observed Facts (Facts from internal DB + Lemon aggregated numbers)
        observations.append(
            ObservationItem(
                evidence_type="OBSERVED_FACT",
                category="tasks",
                statement=f"Completed {len(completed_tasks)} of {len(approved_tasks)} approved tasks.",
                confidence=1.0,
                evidence_source="Cherry Task Records",
            )
        )

        if routines_adhered:
            observations.append(
                ObservationItem(
                    evidence_type="OBSERVED_FACT",
                    category="routine",
                    statement="All scheduled routine tasks were completed on time.",
                    confidence=1.0,
                    evidence_source="Cherry Routine Ledger",
                )
            )
        else:
            observations.append(
                ObservationItem(
                    evidence_type="OBSERVED_FACT",
                    category="routine",
                    statement=f"Missed scheduled routine(s): {', '.join(missed_routines)}. Day marked bad under Quarter rules.",
                    confidence=1.0,
                    evidence_source="Cherry Routine Ledger",
                )
            )

        if lemon_available:
            active_hours = lemon_data["total_active_seconds"] / 3600.0
            prod_hours = lemon_data["productive_seconds"] / 3600.0
            observations.append(
                ObservationItem(
                    evidence_type="OBSERVED_FACT",
                    category="activity",
                    statement=f"Device active time: {active_hours:.1f} hours ({prod_hours:.1f} hours classified as productive).",
                    confidence=1.0,
                    evidence_source="Lemon Desktop Intelligence",
                )
            )
            yt_shorts = lemon_data.get("youtube_stats", {}).get("shorts_seconds", 0)
            if yt_shorts > 300:
                observations.append(
                    ObservationItem(
                        evidence_type="OBSERVED_FACT",
                        category="distraction",
                        statement=f"Recorded {yt_shorts // 60} minutes of short-form video viewing.",
                        confidence=1.0,
                        evidence_source="Lemon Activity Stream",
                    )
                )
        else:
            observations.append(
                ObservationItem(
                    evidence_type="OBSERVED_FACT",
                    category="activity",
                    statement="Device activity data was unavailable from Lemon for this date.",
                    confidence=1.0,
                    evidence_source="Lemon System Status",
                )
            )

        # User-Reported Explanations
        for f in frictions:
            observations.append(
                ObservationItem(
                    evidence_type="USER_REPORT",
                    category="friction",
                    statement=f"User reported {f.category} friction: '{f.description}'.",
                    confidence=1.0,
                    evidence_source="Cherry Friction Log",
                )
            )

        # AI-Generated Hypotheses
        if missed_tasks:
            missed_titles = [t.title for t in missed_tasks]
            if lemon_available and lemon_data.get("context_switches", 0) > 30:
                observations.append(
                    ObservationItem(
                        evidence_type="AI_HYPOTHESIS",
                        category="workload",
                        statement=f"Tasks ({', '.join(missed_titles)}) may have stalled due to high context switching ({lemon_data['context_switches']} switches).",
                        confidence=0.75,
                        evidence_source="Inferred from Lemon Context Switch Count",
                    )
                )

        # 5. Narrative Synthesis (Basket LLM with fallback)
        accomplishments = [f"Completed: {t.title}" for t in completed_tasks]
        distractions = [f"Friction: {f.description}" for f in frictions]

        ai_prompt = (
            f"Generate a direct, evidence-based daily feedback report for {date_str}.\n"
            f"Tasks completed: {len(completed_tasks)}/{len(approved_tasks)}.\n"
            f"Routines adhered: {routines_adhered}.\n"
            f"Junk Points: {junk_points} JP.\n"
            f"Active device time: {derived.total_active_seconds / 3600.0:.1f}h.\n"
            f"Focus time: {derived.focus_minutes_total:.0f}m.\n"
            f"Distinguish observed facts from user reports and hypotheses."
        )

        basket_response = await basket_adapter.chat_completion(
            messages=[{"role": "user", "content": ai_prompt}],
            max_tokens=400,
        )
        basket_used = basket_response is not None

        # Determine concise status verdict (1-2 words strictly for the badge pill)
        if bad_day:
            verdict_badge = "Off Track"
        elif len(completed_tasks) > 0 and routines_adhered:
            verdict_badge = "Adherent"
        elif routines_adhered:
            verdict_badge = "On Track"
        else:
            verdict_badge = "Needs Attention"

        if basket_response:
            narrative_report = basket_response.strip()
        else:
            status_text = "Good day" if not bad_day else "Bad day (routine missed or limit breached)"
            narrative_report = (
                f"{status_text}. Completed {len(completed_tasks)} tasks with {focus_minutes:.0f} min focus. "
                f"Adherence: {'Maintained' if routines_adhered else 'Violated'}."
            )

        summary_id = str(uuid.uuid4())
        summary = DailyFeedbackSummaryModel(
            summary_id=summary_id,
            date_str=date_str,
            version=version,
            is_complete=lemon_available,
            lemon_data_available=lemon_available,
            basket_ai_used=basket_used,
            observations=observations,
            accomplishments=accomplishments,
            distractions_and_friction=distractions,
            alignment_verdict=verdict_badge,
            actionable_improvement=narrative_report,
            metrics=derived,
            generated_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        # Store summary in database; RAW LEMON PAYLOAD IS COMPLETELY DISCARDED
        await self.db.daily_summaries.replace_one(
            {"date_str": date_str, "version": version},
            summary.model_dump(),
            upsert=True,
        )

        # Link summary to Day record
        await self.db.days.update_one(
            {"date_str": date_str},
            {"$set": {"daily_summary_id": summary_id}},
        )

        logger.info(f"Feedback summary for {date_str} persisted successfully.")
        return summary

    async def get_daily_summary(self, date_str: str) -> Optional[DailyFeedbackSummaryModel]:
        doc = await self.db.daily_summaries.find_one({"date_str": date_str}, sort=[("version", -1)])
        if not doc:
            return None
        # Auto-heal older records where the full narrative was erroneously put into alignment_verdict
        if len(doc.get("alignment_verdict", "")) > 30:
            full_text = doc["alignment_verdict"]
            doc["alignment_verdict"] = "On Track"
            if not doc.get("actionable_improvement") or doc.get("actionable_improvement") == "Protect tomorrow morning for uninterrupted high-priority Must tasks.":
                doc["actionable_improvement"] = full_text
            # Persist healed fields back
            await self.db.daily_summaries.update_one(
                {"_id": doc["_id"]},
                {"$set": {"alignment_verdict": "On Track", "actionable_improvement": full_text}}
            )
        return DailyFeedbackSummaryModel(**doc)


feedback_service = FeedbackService()
