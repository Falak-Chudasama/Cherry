"""
Task Crafter Service for Cherry.
Generates structured Kanban tasks using GBNF grammar constraints (temperature: 0.2).
"""
import logging
from typing import Dict, Any, Optional
from app.adapters.basket_adapter import basket_adapter
from app.ai.grammars.task_grammar import TASK_GRAMMAR, validate_and_sanitize_task

logger = logging.getLogger(__name__)

TASK_SYSTEM_PROMPT = """You are Cherry's Kanban Task Crafter.
Translate the user's task request into a structured Kanban task.
You must output a single JSON object with:
- "title": concise, action-oriented task title
- "description": clear description and acceptance criteria
- "priority": "High" | "Normal" | "Low"
- "period_type": "Q1" | "Q2" | "Q3" | "Q4" | "SURPLUS"
- "subtasks": array of 1 to 4 checklist steps with "title", "start_day" (1-7), "end_day" (1-7)

Rules:
1. Always output valid JSON conforming to the grammar.
2. Days are integers from 1 to 7 representing day offsets within the period."""


async def craft_task(
    user_prompt: str,
    snapshot_text: str = "",
    period_id: str = "2026-11-Q3",
    period_type: str = "Q1",
    current_draft: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    prompt_parts = []
    if snapshot_text:
        prompt_parts.append(snapshot_text)
    if current_draft:
        import json
        prompt_parts.append(f"Current Task Draft:\n{json.dumps(current_draft, indent=2)}")
    prompt_parts.append(f"Active Period: {period_id} ({period_type})")
    prompt_parts.append(f"User Request: {user_prompt.strip()}")

    full_prompt = "\n\n".join(prompt_parts)

    try:
        res = await basket_adapter.completion(
            prompt=full_prompt,
            system_prompt=TASK_SYSTEM_PROMPT,
            grammar=TASK_GRAMMAR,
            temperature=0.2,
            max_tokens=512,
        )
        content = res.get("content", "")
        task = validate_and_sanitize_task(content, default_period=period_type)
        task["period_id"] = period_id
        logger.info(f"[TaskCrafter] Successfully crafted task: {task['title']}")
        return task
    except Exception as e:
        logger.error(f"[TaskCrafter] Error generating task: {e}")
        return {
            "period_id": period_id,
            "period_type": period_type,
            "title": user_prompt.strip()[:60] or "New Task",
            "description": user_prompt.strip(),
            "priority": "Normal",
            "subtasks": [
                {"title": "Initial step", "start_day": 1, "end_day": 3, "is_completed": False},
                {"title": "Completion step", "start_day": 4, "end_day": 7, "is_completed": False},
            ],
        }
