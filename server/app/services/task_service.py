"""
Task, Goal, and Routine domain service for Cherry.
Enforces the 3-status Kanban model ("Not started", "In progress", "Done")
and strict adherence rules without invented heuristics.
"""
import uuid
import logging
from datetime import date, datetime
from typing import List, Optional, Tuple, Dict, Any
from app.core.database import get_db
from app.core import calendar as cal
from app.models.task_models import (
    TaskModel,
    GoalModel,
    Subtask,
    RoutineDefinitionModel,
    RoutineOccurrenceModel,
    KanbanStatus,
    PeriodType,
)

logger = logging.getLogger(__name__)


class TaskService:
    @property
    def db(self):
        return get_db()

    # --- Goals ---

    async def create_goal(self, quarter_id: str, priority: int, title: str, description: str = "") -> GoalModel:
        goal_id = str(uuid.uuid4())
        goal = GoalModel(
            goal_id=goal_id,
            quarter_id=quarter_id,
            priority=priority,
            title=title,
            description=description,
            status="Not started",
        )
        await self.db.goals.insert_one(goal.model_dump())
        return goal

    async def get_quarter_goals(self, quarter_id: str) -> List[GoalModel]:
        cursor = self.db.goals.find({"quarter_id": quarter_id}).sort("priority", 1)
        return [GoalModel(**doc) async for doc in cursor]

    # --- Kanban Tasks ---

    async def create_task(
        self,
        period_id: str,
        title: str,
        period_type: PeriodType = "Q1",
        tier: Optional[str] = "Must Do",
        description: str = "",
        priority: Optional[str] = None,
        status: KanbanStatus = "Not started",
        target_date: Optional[str] = None,
        deadline: Optional[str] = None,
        estimated_minutes: int = 30,
        start_day: Optional[int] = None,
        end_day: Optional[int] = None,
        scheduled_days: Optional[List[int]] = None,
        subtasks: Optional[List[Dict[str, Any]]] = None,
    ) -> TaskModel:
        task_id = str(uuid.uuid4())
        built_subtasks: List[Subtask] = []
        if subtasks:
            for st in subtasks:
                if isinstance(st, dict):
                    built_subtasks.append(
                        Subtask(
                            subtask_id=st.get("subtask_id") or str(uuid.uuid4()),
                            title=st.get("title", ""),
                            is_completed=st.get("is_completed", False),
                            start_day=int(st.get("start_day", 1)),
                            end_day=int(st.get("end_day", 7)),
                            completed_at=st.get("completed_at"),
                        )
                    )
                elif isinstance(st, str):
                    built_subtasks.append(
                        Subtask(
                            subtask_id=str(uuid.uuid4()),
                            title=st,
                            is_completed=False,
                            start_day=1,
                            end_day=7,
                        )
                    )

        task = TaskModel(
            task_id=task_id,
            period_id=period_id,
            period_type=period_type,
            title=title,
            tier=tier or "Must Do",
            description=description,
            priority=priority,
            status=status,
            target_date=target_date,
            deadline=deadline,
            estimated_minutes=estimated_minutes,
            start_day=start_day,
            end_day=end_day,
            scheduled_days=scheduled_days,
            subtasks=built_subtasks,
        )

        await self.db.tasks.insert_one(task.model_dump())

        if target_date:
            await self.db.days.update_one(
                {"date_str": target_date},
                {"$addToSet": {"todo_ids": task_id}},
            )

        return task

    async def create_tasks_batch(self, task_items: List[Dict[str, Any]]) -> List[TaskModel]:
        results = []
        for item in task_items:
            t = await self.create_task(
                period_id=item.get("period_id", "2026-11-Q4"),
                title=item.get("title", "New Task"),
                period_type=item.get("period_type", "Q4"),
                tier=item.get("tier", "Must Do"),
                description=item.get("description", ""),
                priority=item.get("priority"),
                status=item.get("status", "Not started"),
                target_date=item.get("target_date"),
                deadline=item.get("deadline"),
                estimated_minutes=int(item.get("estimated_minutes", 30)),
                start_day=item.get("start_day"),
                end_day=item.get("end_day"),
                scheduled_days=item.get("scheduled_days"),
                subtasks=item.get("subtasks"),
            )
            results.append(t)
        return results

    async def get_tasks_for_period(self, period_id: str) -> List[TaskModel]:
        cursor = self.db.tasks.find({
            "$or": [
                {"period_id": period_id},
                {"quarter_id": period_id},  # backward compatibility
            ]
        }).sort("created_at", 1)
        return [TaskModel(**doc) async for doc in cursor]

    async def get_tasks_for_day(self, date_str: str) -> List[TaskModel]:
        # 1. Exact target_date matches
        # 2. Tagged day in the active period matches (task-level or subtask-level)
        try:
            d = cal.parse_date(date_str)
            period_type, period_id = cal.get_period_for_day(d)
            day_in_period = cal.get_day_number_in_period(d)
        except Exception:
            period_id = None
            day_in_period = None

        query: Dict[str, Any] = {"$or": [{"target_date": date_str}]}

        if period_id and day_in_period is not None:
            period_condition = {
                "$or": [
                    {"period_id": period_id},
                    {"quarter_id": period_id},
                ]
            }
            day_condition = {
                "$or": [
                    {"scheduled_days": day_in_period},
                    {
                        "start_day": {"$lte": day_in_period},
                        "end_day": {"$gte": day_in_period},
                    },
                    {
                        "subtasks": {
                            "$elemMatch": {
                                "start_day": {"$lte": day_in_period},
                                "end_day": {"$gte": day_in_period},
                            }
                        }
                    },
                ]
            }
            query["$or"].append({"$and": [period_condition, day_condition]})

        cursor = self.db.tasks.find(query).sort("created_at", 1)
        tasks = []
        seen = set()
        async for doc in cursor:
            t = TaskModel(**doc)
            if t.task_id not in seen:
                seen.add(t.task_id)
                tasks.append(t)
        return tasks

    async def update_task_status(self, task_id: str, new_status: KanbanStatus) -> Optional[TaskModel]:
        update_data: Dict[str, Any] = {
            "status": new_status,
            "updated_at": datetime.utcnow(),
        }
        if new_status == "Done":
            update_data["completed_at"] = datetime.utcnow()
        else:
            update_data["completed_at"] = None

        res = await self.db.tasks.find_one_and_update(
            {"task_id": task_id},
            {"$set": update_data},
            return_document=True,
        )
        return TaskModel(**res) if res else None

    async def toggle_subtask(self, task_id: str, subtask_id: str, is_completed: bool) -> Optional[TaskModel]:
        task_doc = await self.db.tasks.find_one({"task_id": task_id})
        if not task_doc:
            return None

        task = TaskModel(**task_doc)
        all_done = True
        for st in task.subtasks:
            if st.subtask_id == subtask_id:
                st.is_completed = is_completed
                st.completed_at = datetime.utcnow() if is_completed else None
            if not st.is_completed:
                all_done = False

        if all_done and task.subtasks:
            task.status = "Done"
            task.completed_at = datetime.utcnow()
        elif task.status == "Done" and not all_done:
            task.status = "In progress"
            task.completed_at = None

        task.updated_at = datetime.utcnow()
        await self.db.tasks.replace_one({"task_id": task_id}, task.model_dump())
        return task

    async def update_task(self, task_id: str, update_dict: Dict[str, Any]) -> Optional[TaskModel]:
        update_dict["updated_at"] = datetime.utcnow()
        res = await self.db.tasks.find_one_and_update(
            {"task_id": task_id},
            {"$set": update_dict},
            return_document=True,
        )
        return TaskModel(**res) if res else None

    async def delete_task(self, task_id: str) -> bool:
        res = await self.db.tasks.delete_one({"task_id": task_id})
        await self.db.days.update_many({}, {"$pull": {"todo_ids": task_id}})
        return res.deleted_count > 0

    async def carry_over_tasks(
        self,
        from_period_id: str,
        to_period_id: str,
        to_period_type: PeriodType = "Q1",
        task_ids: Optional[List[str]] = None,
    ) -> List[TaskModel]:
        """
        Explicit user carry-over of unfinished tasks from a completed period to the next period.
        Never auto-moves or auto-deletes tasks without user initiation.
        """
        query: Dict[str, Any] = {
            "$or": [{"period_id": from_period_id}, {"quarter_id": from_period_id}],
            "status": {"$ne": "Done"},
        }
        if task_ids:
            query["task_id"] = {"$in": task_ids}

        cursor = self.db.tasks.find(query)
        carried_tasks = []
        async for doc in cursor:
            t = TaskModel(**doc)
            await self.db.tasks.update_one(
                {"task_id": t.task_id},
                {
                    "$set": {
                        "period_id": to_period_id,
                        "period_type": to_period_type,
                        "updated_at": datetime.utcnow(),
                    }
                },
            )
            t.period_id = to_period_id
            t.period_type = to_period_type
            carried_tasks.append(t)

        logger.info(f"Carried over {len(carried_tasks)} tasks from {from_period_id} to {to_period_id}.")
        return carried_tasks

    # --- Routines ---

    async def create_routine_definition(
        self,
        title: str,
        description: str = "",
        quarter_id: Optional[str] = None,
        days_of_week: Optional[List[int]] = None,
        scheduled_dates: Optional[List[str]] = None,
    ) -> RoutineDefinitionModel:
        routine_id = str(uuid.uuid4())
        routine = RoutineDefinitionModel(
            routine_id=routine_id,
            quarter_id=quarter_id,
            title=title,
            description=description,
            days_of_week=days_of_week if days_of_week is not None else [0, 1, 2, 3, 4, 5, 6],
            scheduled_dates=scheduled_dates or [],
            is_active=True,
        )
        await self.db.routine_definitions.insert_one(routine.model_dump())
        return routine

    async def get_active_routines(self, quarter_id: Optional[str] = None) -> List[RoutineDefinitionModel]:
        q: Dict[str, Any] = {"is_active": True}
        if quarter_id:
            q["$or"] = [{"quarter_id": quarter_id}, {"quarter_id": None}]
        cursor = self.db.routine_definitions.find(q)
        return [RoutineDefinitionModel(**doc) async for doc in cursor]

    async def generate_routine_occurrences_for_day(self, d: date) -> List[RoutineOccurrenceModel]:
        date_str = cal.format_date(d)
        weekday = d.weekday()
        routines = await self.get_active_routines()
        occurrences = []

        for r in routines:
            is_scheduled = (weekday in r.days_of_week) or (date_str in r.scheduled_dates)
            if not is_scheduled:
                continue

            existing = await self.db.routine_occurrences.find_one(
                {"routine_id": r.routine_id, "date_str": date_str}
            )
            if existing:
                occurrences.append(RoutineOccurrenceModel(**existing))
            else:
                occ = RoutineOccurrenceModel(
                    occurrence_id=str(uuid.uuid4()),
                    routine_id=r.routine_id,
                    date_str=date_str,
                    title=r.title,
                    is_completed=False,
                )
                await self.db.routine_occurrences.insert_one(occ.model_dump())
                occurrences.append(occ)

                await self.db.days.update_one(
                    {"date_str": date_str},
                    {"$addToSet": {"routine_ids": occ.occurrence_id}},
                )

        return occurrences

    async def complete_routine_occurrence(self, occurrence_id: str, is_completed: bool = True) -> Optional[RoutineOccurrenceModel]:
        res = await self.db.routine_occurrences.find_one_and_update(
            {"occurrence_id": occurrence_id},
            {
                "$set": {
                    "is_completed": is_completed,
                    "completed_at": datetime.utcnow() if is_completed else None,
                    "missed": not is_completed,
                }
            },
            return_document=True,
        )
        return RoutineOccurrenceModel(**res) if res else None

    async def delete_routine_occurrence(self, occurrence_id: str) -> bool:
        res = await self.db.routine_occurrences.delete_one({"occurrence_id": occurrence_id})
        await self.db.days.update_many({}, {"$pull": {"routine_ids": occurrence_id}})
        return res.deleted_count > 0

    async def check_routine_adherence(self, date_str: str) -> Tuple[bool, List[str]]:
        """
        Adherence summary: returns (all_completed: bool, missed_routine_titles: List[str]).
        """
        cursor = self.db.routine_occurrences.find({"date_str": date_str})
        missed = []
        async for doc in cursor:
            occ = RoutineOccurrenceModel(**doc)
            if not occ.is_completed:
                missed.append(occ.title)

        all_completed = len(missed) == 0
        return all_completed, missed

    async def check_all_routines_skipped(self, date_str: str) -> Tuple[bool, int, int]:
        """
        Exact Rule Evaluation (Spec Principle 9):
        Were ALL configured routine tasks skipped for this day?
        Returns: (all_skipped: bool, total_count: int, completed_count: int).
        Only triggers violation if total_count > 0 AND completed_count == 0.
        """
        cursor = self.db.routine_occurrences.find({"date_str": date_str})
        total = 0
        completed = 0
        async for doc in cursor:
            total += 1
            if doc.get("is_completed"):
                completed += 1

        all_skipped = (total > 0 and completed == 0)
        return all_skipped, total, completed


task_service = TaskService()
