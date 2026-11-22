"""
Plan Crafter Service for Cherry.
Generates structured Quarter / Period plans using GBNF grammar constraints (temperature: 0.2).
"""
import logging
from typing import Dict, Any, Optional
from app.adapters.basket_adapter import basket_adapter
from app.ai.grammars.plan_grammar import PLAN_GRAMMAR, validate_and_sanitize_plan

logger = logging.getLogger(__name__)

PLAN_SYSTEM_PROMPT = """You are Cherry's Quarter Plan Crafter.
Translate the user's planning goals into a structured 7-day Sprint / Quarter plan.
You must output a single JSON object with:
- "quarter_goal": high-level goal statement for the 7-day quarter
- "deliverables": array of 1 to 4 deliverable objects, each with:
  - "title": concise name of the deliverable
  - "description": clear success criteria
  - "priority": "High" | "Normal" | "Low"
  - "subtasks": array of 2 to 4 checklist steps with "title", "start_day" (1-7), "end_day" (1-7)

Rules:
1. Always output valid JSON conforming to the grammar.
2. Days are integers from 1 to 7 representing the days of the 7-day Quarter.
3. Keep subtasks actionable, specific, and realistic."""


async def craft_plan(
    user_prompt: str,
    snapshot_text: str = "",
    period_id: str = "2026-11-Q3",
    current_draft: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    prompt_parts = []
    if snapshot_text:
        prompt_parts.append(snapshot_text)
    if current_draft:
        import json
        prompt_parts.append(f"Current Plan Draft:\n{json.dumps(current_draft, indent=2)}")
    prompt_parts.append(f"Active Period: {period_id}")
    prompt_parts.append(f"User Request: {user_prompt.strip()}")

    full_prompt = "\n\n".join(prompt_parts)

    try:
        res = await basket_adapter.completion(
            prompt=full_prompt,
            system_prompt=PLAN_SYSTEM_PROMPT,
            grammar=PLAN_GRAMMAR,
            temperature=0.2,
            max_tokens=768,
        )
        content = res.get("content", "")
        plan = validate_and_sanitize_plan(content, default_goal=user_prompt[:80])
        plan["period_id"] = period_id
        logger.info(f"[PlanCrafter] Successfully crafted plan for {period_id}: {plan['quarter_goal']}")
        return plan
    except Exception as e:
        logger.error(f"[PlanCrafter] Error generating plan: {e}")
        return {
            "period_id": period_id,
            "quarter_goal": user_prompt.strip() or "Quarter Sprint Plan",
            "deliverables": [
                {
                    "title": "Core Milestone 1",
                    "description": "Initial setup and sprint deliverables",
                    "priority": "Normal",
                    "subtasks": [
                        {"title": "Sprint planning and setup", "start_day": 1, "end_day": 2, "is_completed": False},
                        {"title": "Core development", "start_day": 3, "end_day": 5, "is_completed": False},
                        {"title": "Verification and review", "start_day": 6, "end_day": 7, "is_completed": False},
                    ],
                }
            ],
        }
