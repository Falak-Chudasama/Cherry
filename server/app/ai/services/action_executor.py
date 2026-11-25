"""
Quick Action Executor for Cherry.
Parses natural language action commands into structured actions and stages them for user approval.
Strict Human-in-the-Loop Gate:
- stage_quick_action: Parses and validates actions WITHOUT mutating any database records.
  If a diet entry lacks an explicit JP value (and is not mapped), or a target task is ambiguous/missing,
  it prompts for clarification.
- execute_staged_action: Runs domain services ONLY when user clicks Approve.
"""
import uuid
import logging
import re
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.core import calendar as cal
from app.core.database import get_db
from app.adapters.basket_adapter import basket_adapter
from app.adapters.lemon_adapter import lemon_adapter
from app.ai.grammars.action_grammar import ACTION_GRAMMAR, validate_and_sanitize_action
from app.ai.services.task_crafter import craft_task
from app.services.accountability_service import accountability_service
from app.services.task_service import task_service
from app.services.focus_service import focus_service
from app.services.notes_service import notes_service

logger = logging.getLogger(__name__)

ACTION_SYSTEM_PROMPT = """You are Cherry's Quick Action Parser.
Parse the user's instruction into a single JSON action:
- "action":
  - "update_task_status": mark/move a Kanban task (value: 2=Done, 1=In progress, 0=Not started; detail: target status)
  - "toggle_subtask": complete/uncomplete a subtask (item: subtask or task name; value: 1=done, 0=undone)
  - "add_subtasks": break an existing task into subtasks (item: task title; detail: user's breakdown instruction)
  - "delete_task": delete an existing task (item: task title)
  - "log_jp": log food/junk points (item: food name; value: numeric JP or 0 if omitted)
  - "toggle_routine": complete/uncomplete a daily routine (item: routine title; value: 1=done, 0=undone)
  - "start_focus": start a focus timer (item: focus label; value: minutes e.g. 60)
  - "stop_focus": end/stop active focus or break timer (item: "Focus Session"; value: 0)
  - "lemon_dns": enable/disable Lemon DNS shield (item: "Lemon Shield"; value: 1=on, 0=off)
  - "create_note": save a personal note (item: note title; detail: note content)
  - "record_violation": log a personal rule violation (item: rule name; detail: evidence)

Examples:
- "Mark Amazon Assessment as done" -> {"action": "update_task_status", "item": "Amazon Assessment", "value": 2, "detail": "Done"}
- "Move OS notes to in progress" -> {"action": "update_task_status", "item": "OS notes", "value": 1, "detail": "In progress"}
- "Break Amazon Assessment into 4 subtasks across days 2 to 5" -> {"action": "add_subtasks", "item": "Amazon Assessment", "value": 4, "detail": "4 subtasks across days 2 to 5"}
- "Delete task Old Draft" -> {"action": "delete_task", "item": "Old Draft", "value": 0}
- "I had pizza 20 JP" -> {"action": "log_jp", "item": "Pizza", "value": 20.0}
- "Start 60 min focus" -> {"action": "start_focus", "item": "Focus Session", "value": 60.0}
- "Stop focus" -> {"action": "stop_focus", "item": "Focus Session", "value": 0}
- "Turn on Lemon DNS" -> {"action": "lemon_dns", "item": "Lemon Shield", "value": 1.0}
- "Save a note titled Sprint Retro: focus blocks worked well" -> {"action": "create_note", "item": "Sprint Retro", "value": 1, "detail": "Focus blocks worked well"}

Return ONLY the raw JSON object."""


async def _find_matching_task(db, query: str, period_id: str) -> Optional[Dict[str, Any]]:
    """Find best matching task in active period (or globally if none in period)."""
    q = (query or "").strip()
    tasks = await db.tasks.find({"$or": [{"period_id": period_id}, {"quarter_id": period_id}]}).sort("created_at", 1).to_list(100)
    if not tasks:
        tasks = await db.tasks.find().sort("created_at", -1).to_list(100)
    if not tasks:
        return None

    lower_q = q.lower()
    if any(k in lower_q for k in ("core priority", "first task", "top task", "priority task", "main task")):
        # Prefer first non-Done Must Do task
        for t in tasks:
            if t.get("status") != "Done" and "must" in str(t.get("tier", "")).lower():
                return t
        for t in tasks:
            if t.get("status") != "Done":
                return t
        return tasks[0]

    # Exact ID prefix or exact title match
    for t in tasks:
        if t.get("task_id", "").startswith(q) or t.get("title", "").strip().lower() == lower_q:
            return t

    # Substring match
    for t in tasks:
        title_l = t.get("title", "").lower()
        if lower_q and (lower_q in title_l or title_l in lower_q):
            return t

    # Token overlap match
    q_tokens = {w for w in re.findall(r"[a-z0-9]+", lower_q) if len(w) > 2}
    if q_tokens:
        best = None
        best_score = 0
        for t in tasks:
            t_tokens = set(re.findall(r"[a-z0-9]+", t.get("title", "").lower()))
            score = len(q_tokens & t_tokens)
            if score > best_score:
                best_score = score
                best = t
        if best and best_score > 0:
            return best

    return None


def _resolve_target_status(value: float, detail: str, user_prompt: str) -> str:
    combined = f"{detail} {user_prompt}".lower()
    if "not started" in combined or "reopen" in combined or "reset" in combined or "todo" in combined:
        return "Not started"
    if "in progress" in combined or "working" in combined or "start working" in combined:
        return "In progress"
    if "done" in combined or "complete" in combined or "finish" in combined:
        return "Done"
    if value >= 2:
        return "Done"
    if value >= 1:
        return "In progress"
    return "Not started"


async def stage_quick_action(user_prompt: str, snapshot_text: str = "") -> Dict[str, Any]:
    """
    Stage 1: Parse and validate proposed action WITHOUT mutating database records.
    Returns either a clarification question or a pending action card payload.
    """
    db = get_db()
    lower_p = user_prompt.strip().lower()
    parsed: Optional[Dict[str, Any]] = None

    # Fast paths for unambiguous commands
    jp_match = re.search(
        r"(?:ate|had|log(?:ged)?(?:\s+jp)?)\s+([a-zA-Z\s]+?)\s*(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:jp|points)?",
        user_prompt,
        re.IGNORECASE,
    )
    if jp_match:
        parsed = {
            "action": "log_jp",
            "item": jp_match.group(1).strip(),
            "value": float(jp_match.group(2)),
            "detail": "",
        }
    elif lower_p.startswith(("stop focus", "end focus", "cancel focus")):
        parsed = {"action": "stop_focus", "item": "Focus Session", "value": 0.0, "detail": ""}
    elif re.search(r"\b(turn on|enable|activate)\s+lemon", lower_p):
        parsed = {"action": "lemon_dns", "item": "Lemon Shield", "value": 1.0, "detail": ""}
    elif re.search(r"\b(turn off|disable|deactivate)\s+lemon", lower_p):
        parsed = {"action": "lemon_dns", "item": "Lemon Shield", "value": 0.0, "detail": ""}
    elif re.match(r"^(?:mark|set|move)\s+(.+?)\s+(?:as|to)\s+(done|completed?|in progress|not started)\b", user_prompt.strip(), re.IGNORECASE):
        m = re.match(r"^(?:mark|set|move)\s+(?:task\s+)?[\"']?(.+?)[\"']?\s+(?:as|to)\s+(done|completed?|in progress|not started)\b", user_prompt.strip(), re.IGNORECASE)
        if m:
            raw_target = m.group(1).strip()
            raw_status = m.group(2).strip().lower()
            val = 2.0 if raw_status.startswith(("done", "complet")) else (1.0 if "progress" in raw_status else 0.0)
            parsed = {"action": "update_task_status", "item": raw_target, "value": val, "detail": raw_status}

    if parsed is None:
        try:
            res = await basket_adapter.completion(
                prompt=f"{snapshot_text}\n\nUser Action: {user_prompt.strip()}",
                system_prompt=ACTION_SYSTEM_PROMPT,
                grammar=ACTION_GRAMMAR,
                temperature=0.0,
                max_tokens=160,
            )
            content = res.get("content", "")
            parsed = validate_and_sanitize_action(content)
        except Exception as e:
            logger.warning(f"Error parsing action via LLM: {e}")
            parsed = {"action": "log_jp", "item": user_prompt[:30], "value": 0.0, "detail": ""}

    action_type = parsed["action"]
    item = parsed.get("item") or "Item"
    val = float(parsed.get("value", 0.0))
    detail = parsed.get("detail") or ""

    today_d = cal.today_local()
    today_str = cal.format_date(today_d)
    period_type, period_id = cal.get_period_for_day(today_d)

    # Diet / JP Clarification Check
    if action_type == "log_jp" and val <= 0:
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

    action_id = str(uuid.uuid4())
    actions_list: List[Dict[str, Any]] = []

    if action_type == "log_jp":
        summary = f"Log {item} (+{val} JP) for {today_str}"
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

    elif action_type == "update_task_status":
        matched_task = await _find_matching_task(db, item, period_id)
        if not matched_task:
            existing = await db.tasks.find({"$or": [{"period_id": period_id}, {"quarter_id": period_id}]}).to_list(8)
            names = ", ".join(f"`{t.get('title')}`" for t in existing[:5])
            hint = f" Active tasks: {names}." if names else " You currently have no tasks in this quarter."
            return {
                "needs_clarification": True,
                "clarification_question": f"I couldn't find a task matching **{item}**.{hint}",
            }
        target_status = _resolve_target_status(val, detail, user_prompt)
        task_title = matched_task.get("title", item)
        summary = f"Set \"{task_title}\" to {target_status}"
        actions_list.append({
            "action_type": "update_task_status",
            "target": task_title,
            "parameters": {
                "task_id": matched_task["task_id"],
                "title": task_title,
                "status": target_status,
            },
            "description": f"Move from {matched_task.get('status', 'Not started')} to {target_status}",
        })

    elif action_type == "toggle_subtask":
        tasks = await db.tasks.find({"$or": [{"period_id": period_id}, {"quarter_id": period_id}]}).to_list(100)
        matched_pair = None
        q_l = item.lower()
        for t in tasks:
            for st in t.get("subtasks", []):
                if q_l in st.get("title", "").lower():
                    matched_pair = (t, st)
                    break
            if matched_pair:
                break
        if not matched_pair:
            return {
                "needs_clarification": True,
                "clarification_question": f"I couldn't find a subtask matching **{item}** in {period_id}.",
            }
        t_doc, st_doc = matched_pair
        is_comp = val >= 1.0
        summary = f"Mark subtask \"{st_doc['title']}\" as {'done' if is_comp else 'pending'}"
        actions_list.append({
            "action_type": "toggle_subtask",
            "target": st_doc["title"],
            "parameters": {
                "task_id": t_doc["task_id"],
                "subtask_id": st_doc["subtask_id"],
                "title": st_doc["title"],
                "task_title": t_doc["title"],
                "is_completed": is_comp,
            },
            "description": f"Task: {t_doc['title']}",
        })

    elif action_type == "add_subtasks":
        matched_task = await _find_matching_task(db, item, period_id)
        if not matched_task:
            return {
                "needs_clarification": True,
                "clarification_question": f"Which existing task should I break into subtasks? I couldn't find one matching **{item}**.",
            }
        task_title = matched_task.get("title", item)
        crafted = await craft_task(
            user_prompt=f"Break down task '{task_title}': {user_prompt}",
            snapshot_text=snapshot_text,
            period_id=period_id,
            period_type=period_type,
            current_draft={
                "title": task_title,
                "description": matched_task.get("description", ""),
                "priority": matched_task.get("priority", "Normal"),
                "subtasks": matched_task.get("subtasks", []),
            },
        )
        new_subtasks = crafted.get("subtasks", [])
        summary = f"Add {len(new_subtasks)} subtask(s) to \"{task_title}\""
        preview = ", ".join(f"{s['title']} (D{s.get('start_day', 1)}–{s.get('end_day', 7)})" for s in new_subtasks[:4])
        actions_list.append({
            "action_type": "add_subtasks",
            "target": task_title,
            "parameters": {
                "task_id": matched_task["task_id"],
                "title": task_title,
                "subtasks": new_subtasks,
            },
            "description": preview or "Attach generated subtasks",
        })

    elif action_type == "delete_task":
        matched_task = await _find_matching_task(db, item, period_id)
        if not matched_task:
            return {
                "needs_clarification": True,
                "clarification_question": f"I couldn't find a task matching **{item}** to delete.",
            }
        task_title = matched_task.get("title", item)
        summary = f"Delete task \"{task_title}\""
        actions_list.append({
            "action_type": "delete_task",
            "target": task_title,
            "parameters": {
                "task_id": matched_task["task_id"],
                "title": task_title,
            },
            "description": f"Remove task from {period_id}",
        })

    elif action_type == "toggle_routine":
        is_comp = val >= 1.0 or "complete" in lower_p or "done" in lower_p or "finish" in lower_p
        summary = f"Mark routine \"{item}\" as {'completed' if is_comp else 'pending'}"
        actions_list.append({
            "action_type": "toggle_routine",
            "target": item,
            "parameters": {
                "date_str": today_str,
                "title": item,
                "is_completed": is_comp,
            },
            "description": f"Update routine occurrence for {today_str}",
        })

    elif action_type == "start_focus":
        duration = int(val) if val > 0 else 60
        label = item if item and item.lower() != "item" else "Focus Session"
        summary = f"Start {duration}m Focus Session"
        actions_list.append({
            "action_type": "start_focus",
            "target": label,
            "parameters": {
                "date_str": today_str,
                "planned_minutes": duration,
                "task_title": label,
            },
            "description": f"Launch {duration}m timer & enforce Lemon DNS",
        })

    elif action_type == "stop_focus":
        focus_state = await focus_service.get_focus_state()
        if not focus_state.current_session_id or focus_state.phase == "idle":
            return {
                "needs_clarification": True,
                "clarification_question": "No focus or break session is currently running.",
            }
        summary = "End active Focus Session"
        actions_list.append({
            "action_type": "stop_focus",
            "target": "Focus Session",
            "parameters": {
                "session_id": focus_state.current_session_id,
            },
            "description": "Stop active timer and release Lemon DNS",
        })

    elif action_type == "lemon_dns":
        enable = val >= 1.0
        summary = f"{'Enable' if enable else 'Disable'} Lemon DNS Shield"
        actions_list.append({
            "action_type": "lemon_dns",
            "target": "Lemon DNS Shield",
            "parameters": {
                "enabled": enable,
            },
            "description": f"{'Activate' if enable else 'Deactivate'} DNS filtering",
        })

    elif action_type == "create_note":
        note_title = item if item and item.lower() != "item" else "Quick Note"
        note_content = detail or user_prompt
        summary = f"Save note \"{note_title}\""
        actions_list.append({
            "action_type": "create_note",
            "target": note_title,
            "parameters": {
                "title": note_title,
                "content": note_content,
            },
            "description": note_content[:90],
        })

    else:
        summary = f"Record violation: {item}"
        actions_list.append({
            "action_type": "record_violation",
            "target": item,
            "parameters": {
                "date_str": today_str,
                "period_id": period_id,
                "rule_id": item,
                "evidence": detail or user_prompt,
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

            elif atype == "update_task_status":
                updated = await task_service.update_task_status(params["task_id"], params["status"])
                if updated:
                    msg = f"Updated '{updated.title}' to {updated.status}."
                    results.append({"action_type": atype, "success": True, "data": updated.model_dump()})
                    messages.append(msg)
                else:
                    success_all = False
                    msg = f"Task '{params.get('title')}' not found."
                    results.append({"action_type": atype, "success": False, "error": msg})
                    messages.append(msg)

            elif atype == "toggle_subtask":
                updated = await task_service.toggle_subtask(
                    params["task_id"], params["subtask_id"], params.get("is_completed", True)
                )
                if updated:
                    msg = f"Updated subtask '{params.get('title')}' on '{updated.title}'."
                    results.append({"action_type": atype, "success": True, "data": updated.model_dump()})
                    messages.append(msg)
                else:
                    success_all = False
                    msg = "Task or subtask not found."
                    results.append({"action_type": atype, "success": False, "error": msg})
                    messages.append(msg)

            elif atype == "add_subtasks":
                task_doc = await db.tasks.find_one({"task_id": params["task_id"]})
                if not task_doc:
                    success_all = False
                    msg = f"Task '{params.get('title')}' not found."
                    results.append({"action_type": atype, "success": False, "error": msg})
                    messages.append(msg)
                else:
                    existing_st = task_doc.get("subtasks", [])
                    added_st = []
                    for st in params.get("subtasks", []):
                        added_st.append({
                            "subtask_id": str(uuid.uuid4()),
                            "title": st.get("title", "Step"),
                            "is_completed": False,
                            "start_day": int(st.get("start_day", 1)),
                            "end_day": int(st.get("end_day", 7)),
                            "completed_at": None,
                        })
                    updated = await task_service.update_task(
                        params["task_id"], {"subtasks": existing_st + added_st}
                    )
                    msg = f"Added {len(added_st)} subtask(s) to '{task_doc.get('title')}'."
                    results.append({"action_type": atype, "success": True, "data": updated.model_dump() if updated else {}})
                    messages.append(msg)

            elif atype == "delete_task":
                deleted = await task_service.delete_task(params["task_id"])
                if deleted:
                    msg = f"Deleted task '{params.get('title')}'."
                    results.append({"action_type": atype, "success": True, "data": {"task_id": params["task_id"]}})
                    messages.append(msg)
                else:
                    success_all = False
                    msg = f"Task '{params.get('title')}' not found."
                    results.append({"action_type": atype, "success": False, "error": msg})
                    messages.append(msg)

            elif atype == "toggle_routine":
                title_query = params.get("title", "")
                date_str = params.get("date_str")
                is_comp = params.get("is_completed", True)
                occ = await db.routine_occurrences.find_one({
                    "date_str": date_str,
                    "title": {"$regex": re.escape(title_query), "$options": "i"},
                })
                if occ:
                    updated = await task_service.complete_routine_occurrence(occ["occurrence_id"], is_comp)
                    msg = f"Marked routine '{occ['title']}' as {'completed' if is_comp else 'pending'}."
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

            elif atype == "stop_focus":
                session = await focus_service.stop_pomodoro(
                    session_id=params.get("session_id"),
                    status="completed",
                )
                if session:
                    msg = "Stopped active Focus Session."
                    results.append({"action_type": atype, "success": True, "data": session.model_dump()})
                    messages.append(msg)
                else:
                    success_all = False
                    msg = "Active Focus Session not found."
                    results.append({"action_type": atype, "success": False, "error": msg})
                    messages.append(msg)

            elif atype == "lemon_dns":
                enabled = params.get("enabled", True)
                if enabled:
                    lemon_res = await lemon_adapter.enable_dns()
                else:
                    lemon_res = await lemon_adapter.disable_dns()

                if lemon_res.get("dns_enabled") == enabled or lemon_res.get("success"):
                    msg = f"Lemon DNS Shield {'enabled' if enabled else 'disabled'}."
                    results.append({"action_type": atype, "success": True, "data": lemon_res})
                    messages.append(msg)
                else:
                    err = lemon_res.get("error", "Lemon firewall did not confirm status change.")
                    success_all = False
                    msg = f"Lemon DNS error: {err}"
                    results.append({"action_type": atype, "success": False, "error": err})
                    messages.append(msg)

            elif atype == "create_note":
                note = await notes_service.create_note(
                    title=params.get("title", "Quick Note"),
                    content=params.get("content", ""),
                )
                msg = f"Saved note '{note.title}'."
                results.append({"action_type": atype, "success": True, "data": note.model_dump()})
                messages.append(msg)

            elif atype == "record_violation":
                viol = await accountability_service.record_violation(
                    rule_id=params.get("rule_id", "custom"),
                    date_str=params.get("date_str"),
                    period_id=params.get("period_id"),
                    evidence=params.get("evidence", "Recorded via assistant"),
                )
                msg = f"Recorded violation for '{viol.rule_name}'."
                results.append({"action_type": atype, "success": True, "data": viol.model_dump()})
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

