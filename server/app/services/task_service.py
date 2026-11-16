"""
Task, Goal, and Routine domain service.
Enforces non-negotiable routine adherence and transparent Must/Should evaluations.
"""
import uuid
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
    TaskCategory,
    TaskStatus,
)


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
        )
        await self.db.goals.insert_one(goal.model_dump())
        return goal

    async def get_quarter_goals(self, quarter_id: str) -> List[GoalModel]:
        cursor = self.db.goals.find({"quarter_id": quarter_id}).sort("priority", 1)
        return [GoalModel(**doc) async for doc in cursor]

    # --- Tasks ---

    async def create_task(
        self,
        quarter_id: str,
        title: str,
        category: TaskCategory,
        goal_id: Optional[str] = None,
        description: str = "",
        target_date: Optional[str] = None,
        deadline: Optional[str] = None,
        estimated_minutes: int = 30,
        subtask_titles: Optional[List[str]] = None,
        status: TaskStatus = "draft",
    ) -> TaskModel:
        task_id = str(uuid.uuid4())
        subtasks = []
        if subtask_titles:
            for st_title in subtask_titles:
                subtasks.append(
                    Subtask(
                        subtask_id=str(uuid.uuid4()),
                        task_id=task_id,
                        title=st_title,
                        is_completed=False,
                    )
                )

        task = TaskModel(
            task_id=task_id,
            quarter_id=quarter_id,
            goal_id=goal_id,
            title=title,
            description=description,
            category=category,
            status=status,
            target_date=target_date,
            deadline=deadline,
            estimated_minutes=estimated_minutes,
            subtasks=subtasks,
        )

        # Run transparent evaluation for potential Should -> Must promotion recommendation
        task = self.evaluate_should_must_promotion(task)

        await self.db.tasks.insert_one(task.model_dump())

        # If target_date is set, associate with Day
        if target_date:
            await self.db.days.update_one(
                {"date_str": target_date},
                {"$addToSet": {"todo_ids": task_id}},
            )

        return task

    def evaluate_should_must_promotion(self, task: TaskModel) -> TaskModel:
        """
        Deterministic, transparent evaluation of task category based on deadline risk.
        Recommends promoting a Should task to Must if deadline risk becomes significant.
        """
        if task.category == "SHOULD" and task.deadline:
            try:
                deadline_d = cal.parse_date(task.deadline)
                ref_d = cal.parse_date(task.target_date) if task.target_date else cal.today_local()
                days_left = (deadline_d - ref_d).days

                if days_left <= 1:
                    task.is_promoted = True
                    task.promotion_reason = (
                        f"Recommended promotion to MUST: Deadline is in {days_left} day(s)."
                    )
                elif days_left <= 2 and task.estimated_minutes >= 60:
                    task.is_promoted = True
                    task.promotion_reason = (
                        f"Recommended promotion to MUST: High workload ({task.estimated_minutes} min) due within 48h."
                    )
            except Exception:
                pass
        return task

    async def get_tasks_for_day(self, date_str: str) -> List[TaskModel]:
        cursor = self.db.tasks.find({"target_date": date_str})
        return [TaskModel(**doc) async for doc in cursor]

    async def get_tasks_for_quarter(self, quarter_id: str) -> List[TaskModel]:
        cursor = self.db.tasks.find({"quarter_id": quarter_id})
        return [TaskModel(**doc) async for doc in cursor]

    async def update_task_status(self, task_id: str, new_status: TaskStatus) -> Optional[TaskModel]:
        update_data: Dict[str, Any] = {
            "status": new_status,
            "updated_at": datetime.utcnow(),
        }
        if new_status == "completed":
            update_data["completed_at"] = datetime.utcnow()

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
            task.status = "completed"
            task.completed_at = datetime.utcnow()

        await self.db.tasks.replace_one({"task_id": task_id}, task.model_dump())
        return task

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
        """
        Generate routine occurrences for a specific day ONLY if scheduled.
        Prevents duplicate occurrences.
        """
        date_str = cal.format_date(d)
        weekday = d.weekday()  # 0=Monday, 6=Sunday
        routines = await self.get_active_routines()
        occurrences = []

        for r in routines:
            # Check recurrence rules: weekday match OR explicit date scheduled
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

                # Link to Day record
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

    async def check_routine_adherence(self, date_str: str) -> Tuple[bool, List[str]]:
        """
        Rule: "Missing even one scheduled Routine task makes that Day a bad day under the current rules."
        Returns (all_adhered: bool, missed_routine_titles: List[str]).
        """
        cursor = self.db.routine_occurrences.find({"date_str": date_str})
        missed = []
        async for doc in cursor:
            occ = RoutineOccurrenceModel(**doc)
            if not occ.is_completed:
                missed.append(occ.title)

        all_adhered = len(missed) == 0
        return all_adhered, missed


task_service = TaskService()
