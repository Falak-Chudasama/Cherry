"""
Conversational Assistant Service for Cherry.
The primary operating interface of Cherry.
Standardized to the Basket 3-Tier Multi-Chat Architecture (cherry.chats collection).
Coordinates 2-call GBNF pipeline, Live Reality Snapshots, and rich Compose cards.
"""
import uuid
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from app.core.database import get_db
from app.models.conversation_models import ChatMessageModel, CardType
from app.ai.context_builder import build_live_reality_snapshot
from app.ai.services.intent_router import route_intent
from app.ai.services.plan_crafter import craft_plan
from app.ai.services.task_crafter import craft_task
from app.ai.services.query_executor import execute_db_query
from app.ai.services.action_executor import stage_quick_action
from app.ai.grammars.title_grammar import CHAT_TITLE_GRAMMAR, parse_chat_title
from app.adapters.basket_adapter import basket_adapter

logger = logging.getLogger(__name__)


def _now_str() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


class ChatService:
    @property
    def db(self):
        return get_db()

    async def list_conversations(self) -> List[Dict[str, Any]]:
        cursor = self.db.chats.find(
            {"application": "cherry"},
            {"_id": 1, "session_id": 1, "title": 1, "messages": 1, "updated_at": 1, "created_at": 1}
        ).sort("updated_at", -1)

        results = []
        async for doc in cursor:
            session_id = doc.get("session_id") or str(doc.get("_id"))
            messages = doc.get("messages", [])
            last_content = messages[-1].get("content", "") if messages else ""
            if len(last_content) > 60:
                last_content = last_content[:60] + "..."

            c_at = doc.get("created_at", "")
            u_at = doc.get("updated_at", "")
            c_str = c_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(c_at, "strftime") else str(c_at)
            u_str = u_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(u_at, "strftime") else str(u_at)

            results.append({
                "conversation_id": session_id,
                "session_id": session_id,
                "title": doc.get("title", "New Chat"),
                "application": "cherry",
                "message_count": len(messages),
                "preview": last_content,
                "created_at": c_str,
                "updated_at": u_str,
            })
        return results

    async def create_new_conversation(self, title: Optional[str] = None) -> Dict[str, Any]:
        session_id = str(uuid.uuid4())
        now = _now_str()

        initial_msg = {
            "message_id": str(uuid.uuid4()),
            "role": "assistant",
            "content": "Hello! I am Cherry, your operating assistant. How can we organize your work, plan a Quarter, or review focus today?",
            "card_type": "text",
            "created_at": now,
        }

        doc = {
            "session_id": session_id,
            "title": title or "New Chat",
            "application": "cherry",
            "messages": [initial_msg],
            "created_at": now,
            "updated_at": now,
        }
        await self.db.chats.insert_one(doc)

        return {
            "conversation_id": session_id,
            "session_id": session_id,
            "title": doc["title"],
            "application": "cherry",
            "messages": [initial_msg],
            "created_at": now,
            "updated_at": now,
        }

    async def get_or_create_conversation(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        if session_id:
            doc = await self.db.chats.find_one({
                "$or": [{"session_id": session_id}, {"conversation_id": session_id}],
                "application": "cherry",
            })
            if doc:
                doc["conversation_id"] = doc.get("session_id") or str(doc.get("_id"))
                doc["_id"] = str(doc.get("_id"))
                return doc

        # Fallback to most recent session
        latest = await self.db.chats.find_one({"application": "cherry"}, sort=[("updated_at", -1)])
        if latest:
            latest["conversation_id"] = latest.get("session_id") or str(latest.get("_id"))
            latest["_id"] = str(latest.get("_id"))
            return latest

        return await self.create_new_conversation()

    async def delete_conversation(self, session_id: str) -> bool:
        res = await self.db.chats.delete_one({
            "$or": [{"session_id": session_id}, {"conversation_id": session_id}],
            "application": "cherry",
        })
        return res.deleted_count > 0

    async def update_conversation_title(self, session_id: str, new_title: str) -> bool:
        res = await self.db.chats.update_one(
            {"$or": [{"session_id": session_id}, {"conversation_id": session_id}], "application": "cherry"},
            {"$set": {"title": new_title, "updated_at": _now_str()}},
        )
        return res.modified_count > 0

    async def handle_user_message(
        self,
        session_id: str,
        user_text: str,
    ) -> ChatMessageModel:
        """
        Processes a user message through the Plum-inspired 2-Call GBNF architecture:
        1. Context Snapshot
        2. Call 1 Intent Router
        3. Call 2 Execution / Card Generation / Conversation
        """
        now = _now_str()
        user_msg = ChatMessageModel(
            message_id=str(uuid.uuid4()),
            role="user",
            content=user_text,
            card_type="text",
            card_data=None,
            created_at=now,
        )

        await self.db.chats.update_one(
            {"session_id": session_id, "application": "cherry"},
            {
                "$push": {"messages": user_msg.model_dump()},
                "$set": {"updated_at": now},
            },
            upsert=True,
        )

        # 1. Deterministic Live Reality Snapshot
        snapshot = await build_live_reality_snapshot(session_id=session_id, user_prompt=user_text)
        snapshot_text = snapshot["snapshot_text"]
        period_id = snapshot["period_id"]
        period_type = snapshot["period_type"]

        # 2. Call 1: Fast Intent Router
        intent = await route_intent(user_text, snapshot_context=snapshot_text)

        assistant_content = ""
        card_type: CardType = "text"
        card_data: Optional[Dict[str, Any]] = None

        if intent == "make_plan":
            plan = await craft_plan(user_prompt=user_text, snapshot_text=snapshot_text, period_id=period_id)
            card_type = "plan_composer"
            card_data = plan
            assistant_content = f"I've drafted a Quarter Plan for **{period_id}** with {len(plan.get('deliverables', []))} core deliverables. Open it in the Composer Modal to customize."

        elif intent == "create_task":
            task = await craft_task(user_prompt=user_text, snapshot_text=snapshot_text, period_id=period_id, period_type=period_type)
            card_type = "task_composer"
            card_data = task
            assistant_content = f"Structured new task: **{task.get('title')}**. Open it in the Composer Modal to review or save."

        elif intent == "db_query":
            q_res = await execute_db_query(user_text, snapshot_text=snapshot_text)
            card_type = "query_result"
            card_data = q_res
            assistant_content = q_res.get("summary", "Search completed.")

        elif intent == "quick_action":
            staged = await stage_quick_action(user_text, snapshot_text=snapshot_text)
            if staged.get("needs_clarification"):
                assistant_content = staged.get("clarification_question", "Could you provide more details?")
                card_type = "text"
                card_data = None
            else:
                card_type = "action_confirm"
                card_data = staged
                assistant_content = f"Prepared action: {staged.get('summary', 'Action proposal')}. Please approve or reject below."

        else:
            # Conversational Chat
            system_prompt = (
                f"You are Cherry, the intelligent personal operating system assistant.\n"
                f"Respond concisely, directly, and helpful without emojis or meta-commentary.\n"
                f"Ground your answers in the Live Reality Snapshot below:\n\n"
                f"{snapshot_text}"
            )
            chat_res = await basket_adapter.completion(
                prompt=user_text,
                system_prompt=system_prompt,
                temperature=0.4,
                max_tokens=512,
            )
            assistant_content = chat_res.get("content", "") or "I am here. How can I help you organize your sprint or review your routines?"

        assistant_msg = ChatMessageModel(
            message_id=str(uuid.uuid4()),
            role="assistant",
            content=assistant_content,
            card_type=card_type,
            card_data=card_data,
            created_at=_now_str(),
        )

        await self.db.chats.update_one(
            {"session_id": session_id, "application": "cherry"},
            {
                "$push": {"messages": assistant_msg.model_dump()},
                "$set": {"updated_at": _now_str()},
            },
        )

        # 4. Turn 1 Auto-Titling (<= 6 words, CHAT_TITLE_GRAMMAR)
        session_doc = await self.db.chats.find_one({"session_id": session_id, "application": "cherry"})
        if session_doc:
            user_msgs = [m for m in session_doc.get("messages", []) if m.get("role") == "user"]
            if len(user_msgs) == 1 and session_doc.get("title", "") in ("", "New Conversation"):
                try:
                    title_res = await basket_adapter.completion(
                        prompt=f"User: {user_text}\nAssistant: {assistant_content[:150]}",
                        system_prompt="Generate a concise, natural chat title of 6 words or fewer for this conversation.",
                        grammar=CHAT_TITLE_GRAMMAR,
                        temperature=0.2,
                        max_tokens=32,
                    )
                    auto_title = parse_chat_title(title_res.get("content", ""))
                    if auto_title and auto_title != "New Conversation":
                        await self.db.chats.update_one(
                            {"session_id": session_id, "application": "cherry"},
                            {"$set": {"title": auto_title}},
                        )
                except Exception as e:
                    logger.debug(f"Auto-titling failed or skipped: {e}")

        return assistant_msg


chat_service = ChatService()
