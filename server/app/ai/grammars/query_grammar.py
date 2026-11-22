"""
GBNF Grammar and Safe Query Builder for MongoDB Natural Language Extraction.
Enforces allowlisted collections and parameters with regex escaping.
"""
import json
import re
from typing import Dict, Any

QUERY_GRAMMAR = r"""
root ::= "{" ws query-fields ws "}"
query-fields ::= field (ws "," ws field)*
field ::= collection-field | query-text-field | status-field | date-field | period-field | limit-field
collection-field ::= "\"collection\":" ws ("\"tasks\"" | "\"routine_occurrences\"" | "\"violations\"" | "\"junk_point_ledger\"" | "\"pomodoro_sessions\"")
query-text-field ::= "\"query\":" ws json-string
status-field ::= "\"status\":" ws ("\"Not started\"" | "\"In progress\"" | "\"Done\"" | "\"all\"")
date-field ::= "\"date_str\":" ws json-string
period-field ::= "\"period_id\":" ws json-string
limit-field ::= "\"limit\":" ws [1-9] [0-9]?
json-string ::= "\"" ([^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))* "\""
ws ::= [ \t\n\r]*
""".strip()

ALLOWED_COLLECTIONS = {
    "tasks",
    "routine_occurrences",
    "violations",
    "junk_point_ledger",
    "pomodoro_sessions",
}


def escape_regex(text: str) -> str:
    return re.escape(text)


def build_safe_query(raw_output: str) -> Dict[str, Any]:
    try:
        json_match = re.search(r"\{[\s\S]*\}", raw_output)
        parsed = json.loads(json_match.group(0) if json_match else raw_output)
    except Exception:
        parsed = {}

    collection = parsed.get("collection", "tasks")
    if collection not in ALLOWED_COLLECTIONS:
        collection = "tasks"

    query_filter: Dict[str, Any] = {}
    query_text = str(parsed.get("query", "")).strip()
    status = parsed.get("status")
    date_str = parsed.get("date_str")
    period_id = parsed.get("period_id")

    if status and status != "all":
        query_filter["status"] = status

    if date_str:
        query_filter["date_str"] = date_str

    if period_id:
        query_filter["$or"] = [{"period_id": period_id}, {"quarter_id": period_id}]

    if query_text:
        escaped = escape_regex(query_text)
        if collection == "tasks":
            query_filter["$or"] = [
                {"title": {"$regex": escaped, "$options": "i"}},
                {"description": {"$regex": escaped, "$options": "i"}},
            ]
        elif collection == "routine_occurrences":
            query_filter["title"] = {"$regex": escaped, "$options": "i"}
        elif collection == "violations":
            query_filter["$or"] = [
                {"rule_name": {"$regex": escaped, "$options": "i"}},
                {"evidence": {"$regex": escaped, "$options": "i"}},
            ]
        elif collection == "junk_point_ledger":
            query_filter["food_item"] = {"$regex": escaped, "$options": "i"}

    try:
        limit = max(1, min(25, int(parsed.get("limit", 10))))
    except Exception:
        limit = 10

    return {
        "collection": collection,
        "filter": query_filter,
        "limit": limit,
    }
