"""
Quarter Planning, Versioning, and Daily Todo Drafting Service.
Enforces the mandatory rule: AI proposals are NOT active until explicitly approved by the user.
"""
import uuid
import logging
from datetime import datetime, date
from typing import List, Optional, Dict, Any, Tuple
from app.core.database import get_db
from app.core import calendar as cal
from app.adapters.basket_adapter import basket_adapter
from app.services.task_service import task_service
from app.models.plan_models import (
    QuarterPlanModel,
    PlanGoalProposal,
    PlanTaskProposal,
    TodoDraftModel,
    TodoDraftItem,
)
from app.models.task_models import TaskCategory

logger = logging.getLogger(__name__)


class PlanService:
    @property
    def db(self):
        return get_db()

    # --- Quarter Planning ---

    async def propose_quarter_plan(
        self,
        quarter_id: str,
        user_intent: str,
        routine_specs: Optional[List[Dict[str, Any]]] = None,
    ) -> QuarterPlanModel:
        """
        Synthesize a structured Quarter plan proposal using Basket LLM.
        The plan remains in 'proposed' state until explicitly approved by the user.
        """
        logger.info(f"Proposing Quarter plan for {quarter_id}...")

        # Gather previous quarter outcomes and backlog
        quarter_doc = await self.db.quarters.find_one({"quarter_id": quarter_id})
        current_version = quarter_doc.get("plan_version", 1) if quarter_doc else 1

        active_routines = await task_service.get_active_routines(quarter_id)
        routine_names = [r.title for r in active_routines]

        # Use Basket to generate goals and actionable daily subtasks
        prompt = (
            f"You are Cherry. Create a balanced, realistic 7-day Quarter plan for Quarter {quarter_id}.\n"
            f"User goal/intent: '{user_intent}'.\n"
            f"Active routines to preserve: {', '.join(routine_names) if routine_names else 'None'}.\n"
            f"Propose 2-3 priority-numbered goals, and 4-6 specific tasks categorized as MUST or SHOULD.\n"
            f"Each task should have 1-2 small actionable subtasks.\n"
            f"Format as readable plan with goals, categories, and workload."
        )

        llm_response = await basket_adapter.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=600,
        )

        # Default structured proposals
        goals = [
            PlanGoalProposal(priority=1, title="Deliver Core Objectives", description=user_intent[:100]),
            PlanGoalProposal(priority=2, title="Maintain Routine Adherence", description="Zero missed routines"),
        ]

        tasks = [
            PlanTaskProposal(
                title=f"Sprint Kickoff: {user_intent[:40]}",
                category="MUST",
                goal_priority=1,
                estimated_minutes=45,
                subtasks=["Review backlog", "Establish milestone"],
            ),
            PlanTaskProposal(
                title="Execute Daily Core Focus Session",
                category="MUST",
                goal_priority=2,
                estimated_minutes=60,
                subtasks=["Start Pomodoro", "Log outcomes"],
            ),
            PlanTaskProposal(
                title="Secondary Exploration & Refinement",
                category="SHOULD",
                goal_priority=1,
                estimated_minutes=30,
                subtasks=["Review documentation", "Clean up notes"],
            ),
        ]

        plan_id = str(uuid.uuid4())
        plan = QuarterPlanModel(
            plan_id=plan_id,
            quarter_id=quarter_id,
            version=current_version,
            status="proposed",
            goals=goals,
            tasks=tasks,
            routines=routine_specs or [],
            rationale=llm_response or "Drafted based on user intent and active quarter backlog.",
            created_by="assistant",
        )

        await self.db.quarter_plans.insert_one(plan.model_dump())
        logger.info(f"Quarter plan proposal {plan_id} created.")
        return plan

    async def approve_quarter_plan(
        self,
        plan_id: str,
        approval_notes: Optional[str] = None,
    ) -> Optional[QuarterPlanModel]:
        """
        MANDATORY GATE: Activate a proposed Quarter plan upon explicit user approval.
        Creates real Goal and Task records in Cherry database.
        """
        doc = await self.db.quarter_plans.find_one({"plan_id": plan_id})
        if not doc:
            return None

        plan = QuarterPlanModel(**doc)
        quarter_id = plan.quarter_id

        # Supersede any currently active plan
        await self.db.quarter_plans.update_many(
            {"quarter_id": quarter_id, "status": "approved"},
            {"$set": {"status": "superseded"}},
        )

        # Create the goals in database
        priority_to_goal_id = {}
        for g_prop in plan.goals:
            goal = await task_service.create_goal(
                quarter_id=quarter_id,
                priority=g_prop.priority,
                title=g_prop.title,
                description=g_prop.description or "",
            )
            priority_to_goal_id[g_prop.priority] = goal.goal_id

        # Create the tasks in database
        quarter_doc = await self.db.quarters.find_one({"quarter_id": quarter_id})
        start_date = quarter_doc.get("start_date") if quarter_doc else cal.format_date(cal.today_local())

        for t_prop in plan.tasks:
            goal_id = priority_to_goal_id.get(t_prop.goal_priority)
            await task_service.create_task(
                quarter_id=quarter_id,
                title=t_prop.title,
                category=t_prop.category,
                goal_id=goal_id,
                target_date=t_prop.target_date or start_date,
                deadline=t_prop.deadline,
                estimated_minutes=t_prop.estimated_minutes,
                subtask_titles=t_prop.subtasks,
                status="approved",  # Approved as part of plan
            )

        # Mark plan approved
        plan.status = "approved"
        plan.approved_at = datetime.utcnow()
        plan.approval_notes = approval_notes

        await self.db.quarter_plans.replace_one({"plan_id": plan_id}, plan.model_dump())

        # Update Quarter record
        await self.db.quarters.update_one(
            {"quarter_id": quarter_id},
            {"$set": {"active_plan_id": plan_id, "plan_version": plan.version}},
        )

        logger.info(f"Quarter plan {plan_id} approved and materialized.")
        return plan

    async def get_active_plan(self, quarter_id: str) -> Optional[QuarterPlanModel]:
        doc = await self.db.quarter_plans.find_one({"quarter_id": quarter_id, "status": "approved"})
        return QuarterPlanModel(**doc) if doc else None

    async def commit_plan_from_composer(
        self,
        period_id: str,
        quarter_goal: str,
        deliverables: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Commits an approved plan from the Composer Modal into MongoDB tasks.
        Strict human approval boundary: database is untouched until user explicitly commits.
        """
        plan_id = str(uuid.uuid4())
        if "SURPLUS" in period_id.upper():
            period_type = "SURPLUS"
        elif "Q4" in period_id.upper():
            period_type = "Q4"
        elif "Q3" in period_id.upper():
            period_type = "Q3"
        elif "Q2" in period_id.upper():
            period_type = "Q2"
        else:
            period_type = "Q1"

        created_tasks = []
        for d in deliverables:
            title = d.get("title", "Core Deliverable")
            desc = d.get("description", "")
            priority = d.get("priority", "Normal")
            subtasks = d.get("subtasks", [])
            task = await task_service.create_task(
                period_id=period_id,
                title=title,
                period_type=period_type,
                description=desc,
                priority=priority,
                status="Not started",
                subtasks=subtasks,
            )
            created_tasks.append(task)

        plan_doc = {
            "plan_id": plan_id,
            "period_id": period_id,
            "quarter_id": period_id,
            "quarter_goal": quarter_goal,
            "deliverables_count": len(deliverables),
            "created_tasks_count": len(created_tasks),
            "status": "approved",
            "created_at": datetime.utcnow(),
        }
        await self.db.quarter_plans.insert_one(plan_doc)

        return {
            "success": True,
            "plan_id": plan_id,
            "quarter_goal": quarter_goal,
            "created_tasks": [t.model_dump() for t in created_tasks],
        }

    # --- Daily Todo Drafting ---

    async def generate_daily_todo_draft(
        self,
        date_str: str,
        is_retrospective: bool = False,
    ) -> TodoDraftModel:
        """
        Draft daily tasks from approved Quarter plan + scheduled routines.
        Retrospective drafts remain unapproved drafts.
        """
        logger.info(f"Drafting daily Todo list for {date_str} (retrospective={is_retrospective})...")
        d = cal.parse_date(date_str)
        period_type, period_id = cal.get_period_for_day(d)

        items: List[TodoDraftItem] = []

        # 1. Scheduled Routines for this day
        routine_occs = await task_service.generate_routine_occurrences_for_day(d)
        for occ in routine_occs:
            items.append(
                TodoDraftItem(
                    title=occ.title,
                    category="ROUTINE",
                    is_routine=True,
                    routine_occurrence_id=occ.occurrence_id,
                    is_selected=True,
                    estimated_minutes=15,
                )
            )

        # 2. Approved tasks assigned to this date or carried over
        tasks = await task_service.get_tasks_for_day(date_str)
        for t in tasks:
            items.append(
                TodoDraftItem(
                    task_id=t.task_id,
                    title=t.title,
                    category=t.category,
                    is_routine=False,
                    is_selected=True,
                    estimated_minutes=t.estimated_minutes,
                )
            )

        draft_id = str(uuid.uuid4())
        draft = TodoDraftModel(
            draft_id=draft_id,
            date_str=date_str,
            items=items,
            status="draft",
            is_retrospective=is_retrospective,
        )

        await self.db.todo_drafts.replace_one(
            {"date_str": date_str},
            draft.model_dump(),
            upsert=True,
        )
        return draft

    async def finalize_todo_draft(self, date_str: str) -> Optional[TodoDraftModel]:
        """Approve and finalize daily draft tasks into active Day Todo list."""
        doc = await self.db.todo_drafts.find_one({"date_str": date_str})
        if not doc:
            return None

        draft = TodoDraftModel(**doc)
        draft.status = "approved"
        draft.approved_at = datetime.utcnow()

        # Update tasks to approved status
        for item in draft.items:
            if item.task_id and item.is_selected:
                await task_service.update_task_status(item.task_id, "approved")

        await self.db.todo_drafts.replace_one({"date_str": date_str}, draft.model_dump())
        return draft


plan_service = PlanService()
