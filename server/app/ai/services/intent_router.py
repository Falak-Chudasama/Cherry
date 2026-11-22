"""
Call 1 — Fast Intent Router for Cherry.
Classifies user prompt into one of exactly 5 intents:
"chat" | "db_query" | "make_plan" | "create_task" | "quick_action"
Runs with temperature: 0.0, max_tokens: 16, thinking disabled.
"""
import logging
from app.adapters.basket_adapter import basket_adapter
from app.ai.grammars.intent_grammar import INTENT_GRAMMAR, parse_intent

logger = logging.getLogger(__name__)

ROUTER_SYSTEM_PROMPT = """You are Cherry's intent classifier. Classify the user prompt into exactly ONE category:
- make_plan: User wants to plan a quarter, draft sprint objectives, design a period roadmap.
- create_task: User wants to create or add a new task or todo item.
- db_query: User wants to search, look up, or check existing tasks, routines, violations, or logs.
- quick_action: User wants to quickly log junk points/food, toggle routine completion, or start focus mode.
- chat: General conversation, advice, asking about rules/status, or open discussion.

Output ONLY the category name. Do not output anything else."""


async def route_intent(user_prompt: str, snapshot_context: str = "") -> str:
    # Heuristic fast-path for obvious prefixes to ensure sub-millisecond routing when unambiguous
    lower = user_prompt.strip().lower()
    if lower.startswith(("plan quarter", "plan the quarter", "plan sprint", "plan next quarter", "create plan")):
        return "make_plan"
    if lower.startswith(("create task", "add task", "new task", "add a task")):
        return "create_task"
    if lower.startswith(("log jp", "log junk", "ate ", "had ", "log food", "start focus", "toggle routine")):
        return "quick_action"

    prompt = f"User instruction: {user_prompt.strip()}"
    try:
        res = await basket_adapter.completion(
            prompt=prompt,
            system_prompt=ROUTER_SYSTEM_PROMPT,
            grammar=INTENT_GRAMMAR,
            temperature=0.0,
            max_tokens=16,
        )
        content = res.get("content", "")
        intent = parse_intent(content)
        logger.info(f"[IntentRouter] Prompt: '{user_prompt[:50]}' -> Intent: {intent}")
        return intent
    except Exception as e:
        logger.warning(f"[IntentRouter] LLM routing failed: {e}. Defaulting to 'chat'.")
        return "chat"
