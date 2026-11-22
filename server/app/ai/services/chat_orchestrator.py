"""
Chat Orchestrator for Cherry AI.
Coordinates Live Reality Snapshot -> Call 1 (Intent Router) -> Call 2 (Executor/Crafter/Chat Stream)
and streams Server-Sent Events (SSE) to the frontend.
Emits strictly:
- event: delta (text tokens)
- event: card (actionable cards for plan/task composer, db query, or action results)
- event: done
"""
import json
import logging
from datetime import datetime
from typing import AsyncGenerator, Dict, Any, Optional
from app.core.database import get_db
from app.ai.context_builder import build_live_reality_snapshot
from app.ai.services.intent_router import route_intent
from app.ai.services.plan_crafter import craft_plan
from app.ai.services.task_crafter import craft_task
from app.ai.services.task_list_crafter import craft_task_list
from app.ai.services.query_executor import execute_db_query
from app.ai.services.action_executor import stage_quick_action
from app.adapters.basket_adapter import basket_adapter

logger = logging.getLogger(__name__)


def sse_format(event: str, data: Any) -> str:
    payload = json.dumps(data) if isinstance(data, (dict, list)) else str(data)
    return f"event: {event}\ndata: {payload}\n\n"


async def handle_chat_stream(session_id: str, user_prompt: str) -> AsyncGenerator[str, None]:
    db = get_db()
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Persist User Message in cherry.chats
    user_msg = {
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
                "title": user_prompt[:30] or "New Chat",
                "application": "cherry",
                "created_at": now_str,
            },
            "$push": {"messages": user_msg},
            "$set": {"updated_at": now_str},
        },
        upsert=True,
    )

    # 2. Build Deterministic Live Reality Snapshot (zero LLM calls)
    snapshot = await build_live_reality_snapshot(session_id=session_id, user_prompt=user_prompt)
    snapshot_text = snapshot["snapshot_text"]
    period_id = snapshot["period_id"]
    period_type = snapshot["period_type"]

    # 3. Call 1 — Fast Intent Router (temperature: 0.0, max_tokens: 16)
    intent = await route_intent(user_prompt, snapshot_context=snapshot_text)

    assistant_content = ""
    card_type = "text"
    card_data: Optional[Dict[str, Any]] = None

    # 4. Dispatch based on intent
    if intent == "make_plan":
        yield sse_format("delta", "I've drafted a Quarter Plan based on your goals.\n\nReview or customize it in the Composer Modal below:\n")
        plan = await craft_plan(
            user_prompt=user_prompt,
            snapshot_text=snapshot_text,
            period_id=period_id,
        )
        card_type = "plan_composer"
        card_data = plan
        assistant_content = f"I've drafted a Quarter Plan for **{period_id}** with {len(plan.get('deliverables', []))} core deliverables. Click below to open and refine it in the Composer Modal."
        yield sse_format("card", {"card_type": card_type, "card_data": card_data})

    elif intent in ("create_task_list", "create_task"):
        yield sse_format("delta", "I've structured your tasks with the requested tiers and subtasks.\n\nReview or add them below:\n")
        task_list = await craft_task_list(
            user_prompt=user_prompt,
            snapshot_text=snapshot_text,
            period_id=period_id,
            period_type=period_type,
        )
        card_type = "task_list_card"
        card_data = task_list
        count = len(task_list.get("tasks", []))
        assistant_content = f"Prepared {count} task(s) for **{period_id}**. You can add them directly to your board or edit them in the Task Drawer."
        yield sse_format("card", {"card_type": card_type, "card_data": card_data})

    elif intent == "db_query":
        yield sse_format("delta", "Searching your records...\n\n")
        query_res = await execute_db_query(user_prompt, snapshot_text=snapshot_text)
        card_type = "query_result"
        card_data = query_res
        summary_text = query_res.get("summary", "Search completed.")
        yield sse_format("delta", summary_text + "\n")
        assistant_content = summary_text
        yield sse_format("card", {"card_type": card_type, "card_data": card_data})

    elif intent == "quick_action":
        staged = await stage_quick_action(user_prompt, snapshot_text=snapshot_text)
        if staged.get("needs_clarification"):
            clarify_msg = staged.get("clarification_question", "Could you provide more details for this action?")
            yield sse_format("delta", clarify_msg + "\n")
            assistant_content = clarify_msg
            card_type = "text"
            card_data = None
        else:
            card_type = "action_confirm"
            card_data = staged
            summary = staged.get("summary", "Proposed Action")
            msg = f"I've prepared the following action:\n\n**{summary}**\n\nPlease review and approve or reject below:\n"
            yield sse_format("delta", msg)
            assistant_content = f"Prepared action: {summary}. Awaiting your confirmation."
            yield sse_format("card", {"card_type": card_type, "card_data": card_data})

    else:
        # Conversational Chat Stream (temperature: 0.4, thinking disabled)
        chat_system_prompt = (
            f"You are Cherry, the intelligent personal operating system assistant.\n"
            f"Respond concisely, directly, and helpful without emojis or meta-commentary.\n"
            f"Ground your answers in the Live Reality Snapshot below:\n\n"
            f"{snapshot_text}"
        )
        messages_payload = []
        for h in snapshot["recent_history"]:
            messages_payload.append(h)
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
            err_msg = f"\n[Chat stream unavailable: {e}]"
            assistant_content += err_msg
            yield sse_format("delta", err_msg)

    # 5. Persist Assistant Message in cherry.chats
    assistant_msg = {
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

    # 6. Emit done event
    yield sse_format("done", {"session_id": session_id})
