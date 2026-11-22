"""
GBNF Grammar and Validator for Cherry Task List Crafter.
Generates structured task batches with tiers ("Must Do", "Should Do", "Routine")
and scheduled subtasks.
"""
import json
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

TASK_LIST_GRAMMAR = r'''
root ::= "{" ws "\"tasks\"" ws ":" ws task_array ws "}"
task_array ::= "[" ws (task (ws "," ws task)*)? ws "]"
task ::= "{" ws "\"title\"" ws ":" ws string ws "," ws "\"tier\"" ws ":" ws tier ws "," ws "\"priority\"" ws ":" ws priority ws ("," ws "\"description\"" ws ":" ws string ws)? ("," ws "\"subtasks\"" ws ":" ws subtask_array ws)? "}"
subtask_array ::= "[" ws (subtask (ws "," ws subtask)*)? ws "]"
subtask ::= "{" ws "\"title\"" ws ":" ws string ws ("," ws "\"start_day\"" ws ":" ws day_num ws)? ("," ws "\"end_day\"" ws ":" ws day_num ws)? "}"
tier ::= "\"Must Do\"" | "\"Should Do\"" | "\"Routine\""
priority ::= "\"High\"" | "\"Normal\"" | "\"Low\"" | "\"P1\"" | "\"P2\"" | "\"P3\""
day_num ::= [1-7]
string ::= "\"" [^"\\]* "\""
ws ::= [ \t\n\r]*
'''.strip()


def validate_and_sanitize_task_list(raw_json: str, default_period: str = "2026-11-Q4", default_period_type: str = "Q4") -> Dict[str, Any]:
    try:
        # Strip potential markdown fences
        cleaned = raw_json.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        data = json.loads(cleaned)
    except Exception as e:
        logger.warning(f"[TaskListGrammar] JSON parse failed: {e}. Fallback triggered.")
        data = {}

    tasks_raw = data.get("tasks", [])
    if not isinstance(tasks_raw, list):
        tasks_raw = []

    valid_tiers = {"Must Do", "Should Do", "Routine"}
    sanitized_tasks: List[Dict[str, Any]] = []

    for item in tasks_raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue

        raw_tier = str(item.get("tier", "Must Do")).strip()
        if "must" in raw_tier.lower():
            tier = "Must Do"
        elif "should" in raw_tier.lower():
            tier = "Should Do"
        elif "routine" in raw_tier.lower():
            tier = "Routine"
        else:
            tier = "Must Do"

        priority = str(item.get("priority", "Normal")).strip()
        description = str(item.get("description", "")).strip()

        # Sanitize subtasks
        subtasks_raw = item.get("subtasks", [])
        sanitized_subtasks = []
        if isinstance(subtasks_raw, list):
            for st in subtasks_raw:
                if isinstance(st, dict):
                    st_title = str(st.get("title", "")).strip()
                    if not st_title:
                        continue
                    try:
                        start_d = max(1, min(7, int(st.get("start_day", 1))))
                        end_d = max(start_d, min(7, int(st.get("end_day", 7))))
                    except (ValueError, TypeError):
                        start_d, end_d = 1, 7
                    sanitized_subtasks.append({
                        "title": st_title,
                        "start_day": start_d,
                        "end_day": end_d,
                        "is_completed": False,
                    })

        sanitized_tasks.append({
            "title": title,
            "tier": tier,
            "priority": priority,
            "description": description,
            "period_id": default_period,
            "period_type": default_period_type,
            "status": "Not started",
            "subtasks": sanitized_subtasks,
        })

    if not sanitized_tasks:
        sanitized_tasks = [
            {
                "title": "New Task",
                "tier": "Must Do",
                "priority": "Normal",
                "description": "",
                "period_id": default_period,
                "period_type": default_period_type,
                "status": "Not started",
                "subtasks": [
                    {"title": "Step 1", "start_day": 1, "end_day": 3, "is_completed": False},
                    {"title": "Step 2", "start_day": 4, "end_day": 7, "is_completed": False},
                ],
            }
        ]

    return {
        "period_id": default_period,
        "period_type": default_period_type,
        "tasks": sanitized_tasks,
    }
