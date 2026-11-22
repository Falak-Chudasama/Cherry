"""
GBNF Grammar and Validator for Quarter Plan Generation (Call 2).
Enforces structured JSON output matching Cherry's Plan Compose schema.
"""
import json
import re
from typing import Dict, Any, List

PLAN_GRAMMAR = r"""
root ::= "{" ws "\"quarter_goal\":" ws json-string ws "," ws "\"deliverables\":" ws deliverables-list ws "}"
deliverables-list ::= "[" ws (deliverable (ws "," ws deliverable)*)? ws "]"
deliverable ::= "{" ws "\"title\":" ws json-string ws "," ws "\"description\":" ws json-string ws "," ws "\"priority\":" ws json-string ws "," ws "\"subtasks\":" ws subtasks-list ws "}"
subtasks-list ::= "[" ws (subtask (ws "," ws subtask)*)? ws "]"
subtask ::= "{" ws "\"title\":" ws json-string ws "," ws "\"start_day\":" ws [1-7] ws "," ws "\"end_day\":" ws [1-7] ws "}"
json-string ::= "\"" ([^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\""
ws ::= [ \t\n\r]*
""".strip()


def validate_and_sanitize_plan(raw_output: str, default_goal: str = "Quarter Sprint Goal") -> Dict[str, Any]:
    try:
        json_match = re.search(r"\{[\s\S]*\}", raw_output)
        data = json.loads(json_match.group(0) if json_match else raw_output)
    except Exception:
        data = {}

    quarter_goal = str(data.get("quarter_goal", "")).strip() or default_goal
    raw_deliverables = data.get("deliverables", [])
    if not isinstance(raw_deliverables, list):
        raw_deliverables = []

    deliverables = []
    for d in raw_deliverables:
        if not isinstance(d, dict):
            continue
        title = str(d.get("title", "")).strip()
        if not title:
            continue
        desc = str(d.get("description", "")).strip()
        priority = str(d.get("priority", "Normal")).strip() or "Normal"

        subtasks = []
        for st in d.get("subtasks", []):
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

        deliverables.append({
            "title": title,
            "description": desc,
            "priority": priority,
            "subtasks": subtasks,
        })

    if not deliverables:
        deliverables.append({
            "title": "Core Sprint Deliverable",
            "description": quarter_goal,
            "priority": "Normal",
            "subtasks": [
                {"title": "Initial design and milestones", "start_day": 1, "end_day": 3, "is_completed": False},
                {"title": "Implementation and testing", "start_day": 3, "end_day": 7, "is_completed": False},
            ],
        })

    return {
        "quarter_goal": quarter_goal,
        "deliverables": deliverables,
    }
