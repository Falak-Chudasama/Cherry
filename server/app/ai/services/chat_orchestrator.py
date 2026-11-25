"""
Chat Orchestrator for Cherry AI.
Coordinates Live Reality Snapshot -> Call 1 (Intent Router) -> Call 2 (Executor/Crafter/Chat Stream)
and streams Server-Sent Events (SSE) to the frontend.
Emits:
- event: status (step indicator)
- event: delta (JSON-encoded text tokens preserving spaces & newlines)
- event: card (actionable cards for plan/task composer, db query, or action approval)
- event: title (Turn-1 concise auto-title)
- event: done
"""
import json
import uuid
import logging
from datetime import datetime
from typing import AsyncGenerator, Dict, Any, Optional
from app.core.database import get_db
from app.ai.context_builder import build_live_reality_snapshot
from app.ai.services.intent_router import route_intent
from app.ai.services.plan_crafter import craft_plan
from app.ai.services.task_list_crafter import craft_task_list
from app.ai.services.query_executor import execute_db_query
from app.ai.services.action_executor import stage_quick_action
from app.ai.grammars.title_grammar import CHAT_TITLE_GRAMMAR, parse_chat_title
from app.adapters.basket_adapter import basket_adapter

logger = logging.getLogger(__name__)


def sse_format(event: str, data: Any) -> str:
    # Always JSON-encode payloads so spaces, quotes, and newlines never corrupt SSE framing
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _fallback_title(prompt: str) -> str:
    words = prompt.strip().split()
    if not words:
        return "New Chat"
    return " ".join(words[:5])[:48]


async def handle_chat_stream(session_id: str, user_prompt: str) -> AsyncGenerator[str, None]:
    db = get_db()
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Build Snapshot BEFORE inserting current user message so recent_history has no duplicate tail
    snapshot = await build_live_reality_snapshot(session_id=session_id, user_prompt=user_prompt)
    snapshot_text = snapshot["snapshot_text"]
    period_id = snapshot["period_id"]
    period_type = snapshot["period_type"]

    # Check if this is Turn 1 for auto-titling
    existing_doc = await db.chats.find_one({"session_id": session_id, "application": "cherry"})
    prior_user_msgs = [m for m in (existing_doc or {}).get("messages", []) if m.get("role") == "user"]
    is_turn_one = len(prior_user_msgs) == 0

    # 2. Persist User Message in cherry.chats
    user_msg = {
        "message_id": str(uuid.uuid4()),
        "role": "user",
        "content": user_prompt,
        "card_type": "text",
        "card_data": None,
        "created_at": now_str,
    }
    await db.chats.update_one(
        {"session_id": session_id, "application": "cherry"},
        {
            "$setOnInsert": {
                "session_id": session_id,
                "title": _fallback_title(user_prompt),
                "application": "cherry",
                "created_at": now_str,
            },
            "$push": {"messages": user_msg},
            "$set": {"updated_at": now_str},
        },
        upsert=True,
    )

    # 3. Call 1 — Fast Intent Router
    yield sse_format("status", {"step": "Thinking..."})
    intent = await route_intent(user_prompt, snapshot_context=snapshot_text)

    assistant_msg_id = str(uuid.uuid4())
    assistant_content = ""
    card_type = "text"
    card_data: Optional[Dict[str, Any]] = None

    # 4. Dispatch based on intent
    if intent == "make_plan":
        yield sse_format("status", {"step": "Drafting Quarter plan..."})
        plan = await craft_plan(
            user_prompt=user_prompt,
            snapshot_text=snapshot_text,
            period_id=period_id,
        )
        card_type = "plan_composer"
        card_data = plan
        lead = f"Drafted a plan for **{period_id}** with {len(plan.get('deliverables', []))} deliverables."
        assistant_content = lead
        yield sse_format("delta", lead)
        yield sse_format("card", {"message_id": assistant_msg_id, "card_type": card_type, "card_data": card_data})

    elif intent in ("create_task_list", "create_task"):
        yield sse_format("status", {"step": "Structuring tasks..."})
        task_list = await craft_task_list(
            user_prompt=user_prompt,
            snapshot_text=snapshot_text,
            period_id=period_id,
            period_type=period_type,
        )
        card_type = "task_list_card"
        card_data = task_list
        count = len(task_list.get("tasks", []))
        lead = f"Prepared {count} task{'s' if count != 1 else ''} for **{period_id}**."
        assistant_content = lead
        yield sse_format("delta", lead)
        yield sse_format("card", {"message_id": assistant_msg_id, "card_type": card_type, "card_data": card_data})

    elif intent == "db_query":
        yield sse_format("status", {"step": "Searching records..."})
        query_res = await execute_db_query(user_prompt, snapshot_text=snapshot_text)
        card_type = "query_result"
        card_data = query_res
        summary_text = query_res.get("summary", "Search completed.")
        assistant_content = summary_text
        yield sse_format("delta", summary_text)
        yield sse_format("card", {"message_id": assistant_msg_id, "card_type": card_type, "card_data": card_data})

    elif intent == "quick_action":
        yield sse_format("status", {"step": "Staging action..."})
        staged = await stage_quick_action(user_prompt, snapshot_text=snapshot_text)
        if staged.get("needs_clarification"):
            clarify_msg = staged.get("clarification_question", "Could you provide more details for this action?")
            assistant_content = clarify_msg
            yield sse_format("delta", clarify_msg)
            card_type = "text"
            card_data = None
        else:
            card_type = "action_confirm"
            card_data = staged
            summary = staged.get("summary", "Proposed Action")
            assistant_content = f"Ready to execute: **{summary}**"
            yield sse_format("delta", assistant_content)
            yield sse_format("card", {"message_id": assistant_msg_id, "card_type": card_type, "card_data": card_data})

    else:
        # Conversational Chat Stream (temperature: 0.4, thinking disabled)
        chat_system_prompt = (
            f"You are Cherry, a calm, sharp personal productivity assistant.\n"
            f"Respond concisely and directly in clean Markdown without emojis or meta-commentary.\n"
            f"Ground all facts in the Live Reality Snapshot below:\n\n"
            f"{snapshot_text}"
        )
        messages_payload = list(snapshot["recent_history"])
        messages_payload.append({"role": "user", "content": user_prompt})

        try:
            async for token in basket_adapter.stream_chat_text(
                messages=messages_payload,
                system_prompt=chat_system_prompt,
                temperature=0.4,
            ):
                assistant_content += token
                yield sse_format("delta", token)
        except Exception as e:
            err_msg = f"Chat stream unavailable: {e}"
            assistant_content += err_msg
            yield sse_format("delta", err_msg)

    # 5. Persist Assistant Message in cherry.chats
    assistant_msg = {
        "message_id": assistant_msg_id,
        "role": "assistant",
        "content": assistant_content,
        "card_type": card_type,
        "card_data": card_data,
        "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
    }
    await db.chats.update_one(
        {"session_id": session_id, "application": "cherry"},
        {
            "$push": {"messages": assistant_msg},
            "$set": {"updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")},
        },
    )

    # 6. Turn-1 Concise Auto-Titling
    if is_turn_one:
        auto_title = _fallback_title(user_prompt)
        try:
            title_res = await basket_adapter.completion(
                prompt=f"User: {user_prompt}\nAssistant: {assistant_content[:120]}",
                system_prompt="Generate a concise chat title of 5 words or fewer.",
                grammar=CHAT_TITLE_GRAMMAR,
                temperature=0.2,
                max_tokens=24,
            )
            parsed_title = parse_chat_title(title_res.get("content", ""))
            if parsed_title and parsed_title != "New Conversation":
                auto_title = parsed_title
        except Exception as e:
            logger.debug(f"Stream auto-titling skipped: {e}")

        await db.chats.update_one(
            {"session_id": session_id, "application": "cherry"},
            {"$set": {"title": auto_title}},
        )
        yield sse_format("title", {"session_id": session_id, "title": auto_title})

    # 7. Emit done event
    yield sse_format("done", {"session_id": session_id, "message_id": assistant_msg_id})
