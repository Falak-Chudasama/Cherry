"""
GBNF Grammar and Validator for Chat Title Generation.
Ported from Plum to Cherry for concise (<= 6 words) chat titles on Turn 1.
"""
import json
import re

CHAT_TITLE_GRAMMAR = r"""
root ::= "{" ws "\"title\"" ws ":" ws title-string ws "}"
title-string ::= "\"" [a-zA-Z0-9 ]+ "\""
ws ::= [ \t\n\r]*
""".strip()


def parse_chat_title(raw_output: str) -> str:
    try:
        json_match = re.search(r"\{[\s\S]*\}", raw_output)
        if json_match:
            parsed = json.loads(json_match.group(0))
            if parsed and isinstance(parsed.get("title"), str) and parsed["title"].strip():
                words = parsed["title"].strip().split()
                return " ".join(words[:6])[:50]
    except Exception:
        pass

    cleaned = re.sub(r'[{}\"]', "", raw_output)
    cleaned = re.sub(r"title\s*:", "", cleaned, flags=re.IGNORECASE).strip()
    words = cleaned.split()
    return " ".join(words[:6])[:50] if words else "New Conversation"
