"""
GBNF Grammar and Validator for Quick Actions.
Enforces structured action payloads for logging JP, toggling routines, or starting focus.
"""
import json
import re
from typing import Dict, Any

ACTION_GRAMMAR = r"""
root ::= "{" ws "\"action\":" ws action-type ws "," ws "\"item\":" ws json-string ws "," ws "\"value\":" ws number ws "}"
action-type ::= "\"log_jp\"" | "\"toggle_routine\"" | "\"start_focus\"" | "\"record_violation\""
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
    try:
        value = float(data.get("value", 0))
    except Exception:
        value = 0.0

    if action not in ("log_jp", "toggle_routine", "start_focus", "record_violation"):
        action = "log_jp"

    return {
        "action": action,
        "item": item,
        "value": value,
    }
