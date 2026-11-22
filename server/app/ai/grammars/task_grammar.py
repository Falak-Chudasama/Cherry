"""
GBNF Grammar and Validator for Single Task Generation (Call 2).
Enforces structured JSON output matching Cherry's Task Compose schema.
"""
import json
import re
from typing import Dict, Any, List

TASK_GRAMMAR = r"""
root ::= "{" ws "\"title\":" ws json-string ws "," ws "\"description\":" ws json-string ws "," ws "\"priority\":" ws json-string ws "," ws "\"period_type\":" ws period-type ws "," ws "\"subtasks\":" ws subtasks-list ws "}"
period-type ::= "\"Q1\"" | "\"Q2\"" | "\"Q3\"" | "\"Q4\"" | "\"SURPLUS\""
subtasks-list ::= "[" ws (subtask (ws "," ws subtask)*)? ws "]"
subtask ::= "{" ws "\"title\":" ws json-string ws "," ws "\"start_day\":" ws [1-7] ws "," ws "\"end_day\":" ws [1-7] ws "}"
json-string ::= "\"" ([^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\""
ws ::= [ \t\n\r]*
""".strip()


def validate_and_sanitize_task(raw_output: str, default_period: str = "Q1") -> Dict[str, Any]:
    try:
        json_match = re.search(r"\{[\s\S]*\}", raw_output)
        data = json.loads(json_match.group(0) if json_match else raw_output)
    except Exception:
        data = {}

    title = str(data.get("title", "")).strip() or "New Task"
    desc = str(data.get("description", "")).strip()
    priority = str(data.get("priority", "Normal")).strip() or "Normal"
    period_type = str(data.get("period_type", default_period)).upper()
    if period_type not in ("Q1", "Q2", "Q3", "Q4", "SURPLUS"):
        period_type = default_period

    subtasks = []
    for st in data.get("subtasks", []):
        if not isinstance(st, dict):
            continue
        st_title = str(st.get("title", "")).strip()
        if not st_title:
            continue
        try:
            start_day = max(1, min(7, int(st.get("start_day", 1))))
        except Exception:
            start_day = 1
        try:
            end_day = max(start_day, min(7, int(st.get("end_day", 7))))
        except Exception:
            end_day = 7

        subtasks.append({
            "title": st_title,
            "start_day": start_day,
            "end_day": end_day,
            "is_completed": False,
        })

    return {
        "title": title,
        "description": desc,
        "priority": priority,
        "period_type": period_type,
        "subtasks": subtasks,
    }
