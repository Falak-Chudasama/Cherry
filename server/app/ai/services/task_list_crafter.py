"""
Task List Crafter Service for Cherry.
Generates structured batches of Kanban tasks with tiers ("Must Do", "Should Do", "Routine")
and subtasks using GBNF grammar constraints (temperature: 0.2, zero thinking mode).
"""
import logging
from typing import Dict, Any, Optional
from app.adapters.basket_adapter import basket_adapter
from app.ai.grammars.task_list_grammar import TASK_LIST_GRAMMAR, validate_and_sanitize_task_list

logger = logging.getLogger(__name__)

TASK_LIST_SYSTEM_PROMPT = """You are Cherry's Task List Crafter.
Translate the user's task request into a structured list of Kanban tasks.
Assign the appropriate tier to each task based on user preference or urgency:
- "Must Do": critical, non-negotiable daily objectives
- "Should Do": important, high-value secondary objectives
- "Routine": habits, recurring maintenance, or wellness activities

You must output a single JSON object conforming to the grammar:
{
  "tasks": [
    {
      "title": "task title",
      "tier": "Must Do" | "Should Do" | "Routine",
      "priority": "High" | "Normal" | "Low",
      "description": "brief note",
      "subtasks": [
        {"title": "step name", "start_day": 1, "end_day": 3}
      ]
    }
  ]
}

Rules:
1. Days are integers from 1 to 7 representing day offsets within the 7-day Quarter.
2. If the user specifies tiers (e.g. 'first should be Must do, second Should do'), strictly adhere to their request.
3. Keep titles concise and action-oriented."""


async def craft_task_list(
    user_prompt: str,
    snapshot_text: str = "",
    period_id: str = "2026-11-Q4",
    period_type: str = "Q4",
) -> Dict[str, Any]:
    prompt_parts = []
    if snapshot_text:
        prompt_parts.append(snapshot_text)
    prompt_parts.append(f"Active Period: {period_id} ({period_type})")
    prompt_parts.append(f"User Request: {user_prompt.strip()}")

    full_prompt = "\n\n".join(prompt_parts)

    try:
        res = await basket_adapter.completion(
            prompt=full_prompt,
            system_prompt=TASK_LIST_SYSTEM_PROMPT,
            grammar=TASK_LIST_GRAMMAR,
            temperature=0.2,
            max_tokens=600,
        )
        content = res.get("content", "")
        task_list_data = validate_and_sanitize_task_list(
            content,
            default_period=period_id,
            default_period_type=period_type,
        )
        logger.info(f"[TaskListCrafter] Crafted {len(task_list_data['tasks'])} tasks for {period_id}")
        return task_list_data
    except Exception as e:
        logger.warning(f"[TaskListCrafter] Basket completion unavailable or error: {e}. Generating fallback task list.")
        # Fallback task list based on simple heuristics from user prompt
        lines = [line.strip() for line in user_prompt.split("\n") if line.strip()]
        fallback_tasks = []

        # If user mentioned multiple tasks or comma-separated items
        items = [p.strip() for p in user_prompt.replace("and", ",").split(",") if p.strip()]
        if len(items) > 1 and len(items) <= 5:
            for idx, item in enumerate(items):
                clean_title = item.lower().replace("add", "").replace("i wanna do", "").replace("these tasks", "").strip()
                if not clean_title:
                    continue
                tier = "Must Do" if idx == 0 else "Should Do" if idx == 1 else "Routine"
                fallback_tasks.append({
                    "title": clean_title.capitalize(),
                    "tier": tier,
                    "priority": "High" if tier == "Must Do" else "Normal",
                    "description": "",
                    "period_id": period_id,
                    "period_type": period_type,
                    "status": "Not started",
                    "subtasks": [
                        {"title": f"Complete {clean_title}", "start_day": 1, "end_day": 7, "is_completed": False}
                    ],
                })

        if not fallback_tasks:
            fallback_tasks = [
                {
                    "title": user_prompt.strip()[:60] or "New Task",
                    "tier": "Must Do",
                    "priority": "Normal",
                    "description": user_prompt.strip(),
                    "period_id": period_id,
                    "period_type": period_type,
                    "status": "Not started",
                    "subtasks": [
                        {"title": "Initial execution", "start_day": 1, "end_day": 3, "is_completed": False},
                        {"title": "Wrap-up & verification", "start_day": 4, "end_day": 7, "is_completed": False},
                    ],
                }
            ]

        return {
            "period_id": period_id,
            "period_type": period_type,
            "tasks": fallback_tasks,
        }
