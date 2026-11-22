"""
GBNF Grammar and Parser for Cherry Intent Classification (Call 1).
"""

INTENT_GRAMMAR = """
root ::= choice
choice ::= "chat" | "db_query" | "create_task_list" | "make_plan" | "quick_action"
""".strip()

VALID_INTENTS = {"chat", "db_query", "create_task_list", "create_task", "make_plan", "quick_action"}


def parse_intent(raw_output: str) -> str:
    cleaned = raw_output.strip().lower().replace('"', '').replace("'", "").strip()
    for valid in ("create_task_list", "create_task", "make_plan", "db_query", "quick_action", "chat"):
        if valid in cleaned:
            return valid
    return "chat"
