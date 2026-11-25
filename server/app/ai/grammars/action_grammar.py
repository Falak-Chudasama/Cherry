"""
GBNF Grammar and Validator for Quick Actions.
Enforces structured action payloads for tasks, subtasks, JP, routines, focus, Lemon DNS, notes, and violations.
"""
import json
import re
from typing import Dict, Any

VALID_ACTIONS = {
    "log_jp",
    "toggle_routine",
    "start_focus",
    "stop_focus",
    "lemon_dns",
    "record_violation",
    "update_task_status",
    "toggle_subtask",
    "add_subtasks",
    "delete_task",
    "create_note",
}

ACTION_GRAMMAR = r"""
root ::= "{" ws "\"action\":" ws action-type ws "," ws "\"item\":" ws json-string ws "," ws "\"value\":" ws number (ws "," ws "\"detail\":" ws json-string)? ws "}"
action-type ::= "\"log_jp\"" | "\"toggle_routine\"" | "\"start_focus\"" | "\"stop_focus\"" | "\"lemon_dns\"" | "\"record_violation\"" | "\"update_task_status\"" | "\"toggle_subtask\"" | "\"add_subtasks\"" | "\"delete_task\"" | "\"create_note\""
number ::= "-"? [0-9]+ ("." [0-9]+)?
json-string ::= "\"" ([^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\""
ws ::= [ \t\n\r]*
""".strip()


def validate_and_sanitize_action(raw_output: str) -> Dict[str, Any]:
    try:
        json_match = re.search(r"\{[\s\S]*\}", raw_output)
        data = json.loads(json_match.group(0) if json_match else raw_output)
    except Exception:
        data = {}

    action = str(data.get("action", "")).strip().lower()
    item = str(data.get("item", "")).strip()
    detail = str(data.get("detail", "")).strip()
    try:
        value = float(data.get("value", 0))
    except Exception:
        value = 0.0

    if action not in VALID_ACTIONS:
        action = "log_jp"

    return {
        "action": action,
        "item": item,
        "value": value,
        "detail": detail,
    }
