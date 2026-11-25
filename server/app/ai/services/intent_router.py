"""
Call 1 — Fast Intent Router for Cherry.
Classifies user prompt into one of 5 intents:
"chat" | "db_query" | "make_plan" | "create_task_list" | "quick_action"
Runs with temperature: 0.0, max_tokens: 16, thinking disabled.
"""
import logging
import re
from app.adapters.basket_adapter import basket_adapter
from app.ai.grammars.intent_grammar import INTENT_GRAMMAR, parse_intent

logger = logging.getLogger(__name__)

ROUTER_SYSTEM_PROMPT = """You are Cherry's intent classifier. Classify the user prompt into exactly ONE category:
- make_plan: User wants to design a 7-day quarter plan, sprint roadmap, or weekly deliverables.
- create_task_list: User wants to create or add one or more NEW tasks or todo items.
- db_query: User wants to list, view, search, or review existing tasks, routines, junk points, violations, focus logs, notes, or snapshots/reports.
- quick_action: User wants to mutate or execute an immediate action: mark a task done/in-progress/not-started, toggle a subtask, break an existing task into subtasks, delete a task, log food/junk points, complete a routine, start/stop focus mode, toggle Lemon DNS, record a violation, or save a note.
- chat: General conversation, advice, coaching, prioritization help, or open discussion.

Output ONLY the category name. Do not output anything else."""


async def route_intent(user_prompt: str, snapshot_context: str = "") -> str:
    lower = user_prompt.strip().lower()

    # Fast-path deterministic patterns for crisp, zero-latency routing
    if lower.startswith(("plan quarter", "plan the quarter", "plan sprint", "plan next quarter", "plan the upcoming quarter", "create plan", "draft quarter")):
        return "make_plan"

    if lower.startswith(("create task", "add task", "new task", "add a task", "add these ", "create a task")):
        return "create_task_list"

    if any(
        lower.startswith(p)
        for p in (
            "day snapshot", "today snapshot", "quarter review", "review quarter",
            "compare quarter", "surplus review", "season review",
            "what tasks", "show my tasks", "list tasks", "show tasks", "my tasks",
            "what did i eat", "how many jp", "how many junk", "show violations",
            "show notes", "list notes", "focus sessions",
        )
    ):
        return "db_query"

    if any(
        lower.startswith(p)
        for p in (
            "log jp", "log junk", "ate ", "had ", "log food",
            "start focus", "start a focus", "stop focus", "end focus",
            "turn on lemon", "turn off lemon", "enable lemon", "disable lemon", "toggle lemon",
            "toggle routine", "complete routine", "mark routine",
            "mark ", "complete ", "finish ", "move ", "delete task", "remove task",
            "save note", "create note", "add note", "take a note",
            "record violation", "log violation",
        )
    ) or re.search(r"\b(as done|to done|to in progress|to not started|into \d+ subtasks)\b", lower):
        return "quick_action"

    prompt_parts = []
    if snapshot_context:
        # Keep only compact task/routine titles so router sees existing entities
        compact_lines = [line for line in snapshot_context.splitlines()[:14]]
        prompt_parts.append("\n".join(compact_lines))
    prompt_parts.append(f"User instruction: {user_prompt.strip()}")

    try:
        res = await basket_adapter.completion(
            prompt="\n\n".join(prompt_parts),
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
