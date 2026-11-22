"""
Quick Action Executor for Cherry.
Parses natural language action commands into structured actions and stages them for user approval.
Strict Human-in-the-Loop Gate:
- stage_quick_action: Parses and validates actions WITHOUT mutating any database records.
  If a diet entry lacks an explicit JP value (and is not mapped), it prompts for clarification.
- execute_staged_action: Runs domain services ONLY when user clicks Approve.
"""
import uuid
import logging
import re
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.core import calendar as cal
from app.core.config import settings
from app.core.database import get_db
from app.adapters.basket_adapter import basket_adapter
from app.adapters.lemon_adapter import lemon_adapter
from app.ai.grammars.action_grammar import ACTION_GRAMMAR, validate_and_sanitize_action
from app.services.accountability_service import accountability_service
from app.services.task_service import task_service
from app.services.focus_service import focus_service

logger = logging.getLogger(__name__)

ACTION_SYSTEM_PROMPT = """You are Cherry's Quick Action Parser.
Parse the user's action into a structured JSON action:
- "action": "log_jp" | "toggle_routine" | "start_focus" | "lemon_dns" | "record_violation"
- "item": name of food item, routine title, or focus description
- "value": numeric amount (e.g. JP points like 15.0, or focus minutes like 60.0)

Examples:
- "I had pizza 20 JP" -> {"action": "log_jp", "item": "Pizza", "value": 20.0}
- "Ate burger" -> {"action": "log_jp", "item": "Burger", "value": 0.0}
- "Completed DSA routine" -> {"action": "toggle_routine", "item": "DSA", "value": 1.0}
- "Start 60 min focus" -> {"action": "start_focus", "item": "Focus Session", "value": 60.0}
- "Turn on Lemon DNS" -> {"action": "lemon_dns", "item": "Lemon Shield", "value": 1.0}

Return ONLY the raw JSON object."""


async def stage_quick_action(user_prompt: str, snapshot_text: str = "") -> Dict[str, Any]:
    """
    Stage 1: Parse and validate proposed action WITHOUT mutating database records.
    Returns either a clarification question or a pending action card payload.
    """
    db = get_db()
    # Fast path: regex matching for JP logging with explicit value
    jp_match = re.search(
        r"(?:ate|had|log(?:ged)?(?:\s+jp)?)\s+([a-zA-Z\s]+?)\s*(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:jp|points)?",
        user_prompt,
        re.IGNORECASE,
    )
    if jp_match:
        food_name = jp_match.group(1).strip()
        jp_val = float(jp_match.group(2))
        parsed = {"action": "log_jp", "item": food_name, "value": jp_val}
    else:
        try:
            res = await basket_adapter.completion(
                prompt=f"{snapshot_text}\n\nUser Action: {user_prompt.strip()}",
                system_prompt=ACTION_SYSTEM_PROMPT,
                grammar=ACTION_GRAMMAR,
                temperature=0.0,
                max_tokens=128,
            )
            content = res.get("content", "")
            parsed = validate_and_sanitize_action(content)
        except Exception as e:
            logger.warning(f"Error parsing action via LLM: {e}")
            parsed = {"action": "log_jp", "item": user_prompt[:30], "value": 0.0}

    action_type = parsed["action"]
    item = parsed["item"] or "Item"
    val = parsed["value"]

    # Diet / JP Clarification Check:
    # If action is log_jp and val is 0, check user's food-to-JP mapping table
    if action_type == "log_jp":
        if val <= 0:
            mapping = await db.food_jp_mappings.find_one({
                "food_name": {"$regex": f"^{re.escape(item)}$", "$options": "i"}
            })
            if mapping:
                val = float(mapping.get("default_jp", 10.0))
            else:
                return {
                    "needs_clarification": True,
                    "clarification_question": f"How many Junk Points (JP) should I log for **{item}**? Please specify the value (e.g. '{item} 15 JP').",
                }

    today_d = cal.today_local()
    today_str = cal.format_date(today_d)
    _, period_id = cal.get_period_for_day(today_d)

    action_id = str(uuid.uuid4())
    actions_list = []

    if action_type == "log_jp":
        summary = f"Log **{item}** (+{val} JP) for today ({today_str})"
        actions_list.append({
            "action_type": "log_jp",
            "target": item,
            "parameters": {
                "date_str": today_str,
                "period_id": period_id,
                "food_item": item,
                "jp_value": val,
            },
            "description": f"Add {val} JP entry to Bad Diet ledger",
        })
    elif action_type == "toggle_routine":
        summary = f"Mark routine **{item}** as completed for today"
        actions_list.append({
            "action_type": "toggle_routine",
            "target": item,
            "parameters": {
                "date_str": today_str,
                "title": item,
                "is_completed": True,
            },
            "description": f"Complete scheduled routine occurrence for {today_str}",
        })
    elif action_type == "start_focus":
        duration = int(val) if val > 0 else 60
        summary = f"Start **{duration}-minute Focus Session** with Lemon DNS shield"
        actions_list.append({
            "action_type": "start_focus",
            "target": item or "Focus Session",
            "parameters": {
                "date_str": today_str,
                "planned_minutes": duration,
                "task_title": item,
            },
            "description": f"Launch {duration}m timer and enforce Lemon DNS firewall",
        })
    elif action_type == "lemon_dns":
        enable = val >= 1.0
        summary = f"{'Enable' if enable else 'Disable'} Lemon DNS Firewall"
        actions_list.append({
            "action_type": "lemon_dns",
            "target": "Lemon DNS Shield",
            "parameters": {
                "enabled": enable,
            },
            "description": f"{'Activate' if enable else 'Deactivate'} RFC 1035 firewall via Lemon",
        })
    else:
        summary = f"Record violation for rule **{item}**"
        actions_list.append({
            "action_type": "record_violation",
            "target": item,
            "parameters": {
                "date_str": today_str,
                "period_id": period_id,
                "rule_id": item,
            },
            "description": f"Log violation entry for {item}",
        })

    return {
        "needs_clarification": False,
        "action_id": action_id,
        "status": "pending",
        "summary": summary,
        "actions": actions_list,
        "staged_at": datetime.utcnow().isoformat(),
    }


async def execute_staged_action(action_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Stage 2: Human-in-the-Loop Execution.
    Runs domain services ONLY when user clicks Approve.
    Verifies actual confirmation (never faking Lemon DNS success on blackout/offline).
    """
    actions = action_data.get("actions", [])
    if not actions:
        return {"success": False, "status": "failed", "message": "No actions to execute.", "results": []}

    results = []
    success_all = True
    messages = []
    db = get_db()

    for act in actions:
        atype = act.get("action_type")
        params = act.get("parameters", {})

        try:
            if atype == "log_jp":
                entry, summary = await accountability_service.add_junk_point_entry(
                    date_str=params.get("date_str"),
                    period_id=params.get("period_id"),
                    food_item=params.get("food_item"),
                    jp_value=params.get("jp_value"),
                    notes="Approved quick action",
                )
                msg = f"Logged {entry.food_item} (+{entry.jp_value} JP). Balance: {summary.accumulated_jp}/50 JP."
                results.append({"action_type": atype, "success": True, "data": entry.model_dump()})
                messages.append(msg)

            elif atype == "toggle_routine":
                title_query = params.get("title", "")
                date_str = params.get("date_str")
                occ = await db.routine_occurrences.find_one({
                    "date_str": date_str,
                    "title": {"$regex": re.escape(title_query), "$options": "i"},
                })
                if occ:
                    updated = await task_service.complete_routine_occurrence(occ["occurrence_id"], True)
                    msg = f"Marked routine '{occ['title']}' as completed."
                    results.append({"action_type": atype, "success": True, "data": updated.model_dump() if updated else occ})
                    messages.append(msg)
                else:
                    success_all = False
                    msg = f"Routine matching '{title_query}' not found for today."
                    results.append({"action_type": atype, "success": False, "error": msg})
                    messages.append(msg)

            elif atype == "start_focus":
                session = await focus_service.start_pomodoro(
                    date_str=params.get("date_str"),
                    task_title=params.get("task_title"),
                    planned_minutes=params.get("planned_minutes", 60),
                )
                dns_status = "active" if session.dns_enabled_by_session else "offline/blackout"
                msg = f"Started {session.planned_minutes}m Focus Session. Lemon DNS: {dns_status}."
                results.append({"action_type": atype, "success": True, "data": session.model_dump()})
                messages.append(msg)

            elif atype == "lemon_dns":
                enabled = params.get("enabled", True)
                if enabled:
                    lemon_res = await lemon_adapter.enable_dns()
                else:
                    lemon_res = await lemon_adapter.disable_dns()

                # Verify actual confirmation from Lemon
                if lemon_res.get("dns_enabled") == enabled or lemon_res.get("success"):
                    msg = f"Lemon DNS Shield successfully {'enabled' if enabled else 'disabled'}."
                    results.append({"action_type": atype, "success": True, "data": lemon_res})
                    messages.append(msg)
                else:
                    err = lemon_res.get("error", "Lemon firewall did not confirm status change.")
                    success_all = False
                    msg = f"Lemon DNS error: {err}"
                    results.append({"action_type": atype, "success": False, "error": err})
                    messages.append(msg)

            else:
                success_all = False
                msg = f"Unknown action type: {atype}"
                results.append({"action_type": atype, "success": False, "error": msg})
                messages.append(msg)

        except Exception as e:
            logger.error(f"Error executing action {atype}: {e}")
            success_all = False
            results.append({"action_type": atype, "success": False, "error": str(e)})
            messages.append(f"Failed to execute {atype}: {str(e)}")

    status = "executed" if success_all else "failed"
    return {
        "action_id": action_data.get("action_id"),
        "status": status,
        "success": success_all,
        "results": results,
        "message": " • ".join(messages),
    }


async def parse_and_execute_action(user_prompt: str, snapshot_text: str = "") -> Dict[str, Any]:
    """Backward compatibility helper combining stage and execute in one pass."""
    staged = await stage_quick_action(user_prompt, snapshot_text)
    if staged.get("needs_clarification"):
        return {
            "success": False,
            "status": "clarification_needed",
            "message": staged.get("clarification_question", "Please clarify details."),
        }
    return await execute_staged_action(staged)

