"""
Conversational Assistant Service for Cherry.
The primary operating interface of Cherry.
Coordinates natural language queries, structured intent recognition,
safe typed tool executions, and rich conversational UI cards.
"""
import uuid
import json
import logging
from datetime import datetime, date
from typing import List, Optional, Dict, Any
from app.core.database import get_db
from app.core import calendar as cal
from app.adapters.basket_adapter import basket_adapter
from app.adapters.lemon_adapter import lemon_adapter
from app.services.calendar_service import calendar_service
from app.services.task_service import task_service
from app.services.plan_service import plan_service
from app.services.focus_service import focus_service
from app.services.feedback_service import feedback_service
from app.services.accountability_service import accountability_service
from app.services.notes_service import notes_service
from app.models.conversation_models import ChatMessageModel, ConversationModel, CardType

logger = logging.getLogger(__name__)


class ChatService:
    @property
    def db(self):
        return get_db()

    async def list_conversations(self) -> List[Dict[str, Any]]:
        """List all saved conversations sorted by updated_at descending."""
        cursor = self.db.conversations.find({}, {"_id": 0}).sort("updated_at", -1)
        results = []
        async for doc in cursor:
            messages = doc.get("messages", [])
            last_content = messages[-1].get("content", "") if messages else ""
            if len(last_content) > 60:
                last_content = last_content[:60] + "..."
            results.append({
                "conversation_id": doc["conversation_id"],
                "title": doc.get("title", "New Conversation"),
                "context_date": doc.get("context_date", ""),
                "active_quarter_id": doc.get("active_quarter_id", ""),
                "message_count": len(messages),
                "preview": last_content,
                "created_at": doc.get("created_at"),
                "updated_at": doc.get("updated_at"),
            })
        return results

    async def create_new_conversation(self, title: Optional[str] = None) -> ConversationModel:
        """Create a fresh conversation session with initial assistant greeting."""
        today = cal.today_local()
        today_str = cal.format_date(today)
        active_q = await calendar_service.get_active_quarter(today)
        q_id = active_q.quarter_id if active_q else cal.get_quarter_id(today.year, today.month, 1)

        conv_id = str(uuid.uuid4())
        initial_msg = ChatMessageModel(
            message_id=str(uuid.uuid4()),
            role="assistant",
            content="Hello! I am Cherry, your conversational operating assistant. How can we organize your work, plan a Quarter, or review your focus today?",
            card_type="text",
        )
        conv = ConversationModel(
            conversation_id=conv_id,
            title=title or "New Chat",
            messages=[initial_msg],
            context_date=today_str,
            active_quarter_id=q_id,
        )
        await self.db.conversations.insert_one(conv.model_dump())
        return conv

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation and its messages from MongoDB."""
        res = await self.db.conversations.delete_one({"conversation_id": conversation_id})
        return res.deleted_count > 0

    async def update_conversation_title(self, conversation_id: str, title: str) -> bool:
        """Update the title of a conversation."""
        res = await self.db.conversations.update_one(
            {"conversation_id": conversation_id},
            {"$set": {"title": title, "updated_at": datetime.utcnow()}}
        )
        return res.modified_count > 0

    async def get_or_create_conversation(self, conversation_id: Optional[str] = None) -> ConversationModel:
        today = cal.today_local()
        today_str = cal.format_date(today)
        active_q = await calendar_service.get_active_quarter(today)
        q_id = active_q.quarter_id if active_q else cal.get_quarter_id(today.year, today.month, 1)

        if conversation_id:
            doc = await self.db.conversations.find_one({"conversation_id": conversation_id})
            if doc:
                return ConversationModel(**doc)

        conv_id = conversation_id or str(uuid.uuid4())
        initial_msg = ChatMessageModel(
            message_id=str(uuid.uuid4()),
            role="assistant",
            content="Hello! I am Cherry, your conversational operating assistant. How can we organize your work, plan a Quarter, or review your focus today?",
            card_type="text",
        )

        conv = ConversationModel(
            conversation_id=conv_id,
            title="Today's Session",
            messages=[initial_msg],
            context_date=today_str,
            active_quarter_id=q_id,
        )
        await self.db.conversations.insert_one(conv.model_dump())
        return conv

    async def handle_user_message(
        self,
        conversation_id: str,
        user_text: str,
    ) -> ChatMessageModel:
        """
        Process user message:
        1. Classify intent into typed domain operations (Planning, Todo, Focus, Feedback, Friction, Notes, Query)
        2. Execute verified backend service logic
        3. Formulate response with structured card payload if applicable
        """
        conv = await self.get_or_create_conversation(conversation_id)
        today = cal.today_local()
        today_str = cal.format_date(today)

        # Store user message
        user_msg = ChatMessageModel(
            message_id=str(uuid.uuid4()),
            role="user",
            content=user_text,
            card_type="text",
        )
        await self.db.conversations.update_one(
            {"conversation_id": conversation_id},
            {"$push": {"messages": user_msg.model_dump()}, "$set": {"updated_at": datetime.utcnow()}},
        )

        # Auto-title conversation if it has a generic title
        if conv.title in ("New Conversation", "New Chat", "Today's Session"):
            clean_title = user_text.strip()
            if len(clean_title) > 36:
                clean_title = clean_title[:36] + "..."
            if clean_title:
                await self.db.conversations.update_one(
                    {"conversation_id": conversation_id},
                    {"$set": {"title": clean_title.capitalize()}},
                )

        lower = user_text.lower().strip()

        # --- INTENT ROUTING ---

        # 1. Plan Quarter Intent
        if any(w in lower for w in ("plan next quarter", "plan quarter", "plan the quarter", "quarter proposal")):
            plan = await plan_service.propose_quarter_plan(
                quarter_id=conv.active_quarter_id,
                user_intent=user_text,
            )
            card_data = {
                "plan_id": plan.plan_id,
                "quarter_id": plan.quarter_id,
                "version": plan.version,
                "goals": [g.model_dump() for g in plan.goals],
                "tasks": [t.model_dump() for t in plan.tasks],
                "rationale": plan.rationale,
            }
            response_text = (
                f"I have prepared a proposal for Quarter {plan.quarter_id} (Version {plan.version}). "
                f"Please review the goals and subtasks below. You must explicitly approve it before it becomes active."
            )
            return await self._save_assistant_reply(
                conversation_id, response_text, card_type="quarter_plan_proposal", card_data=card_data
            )

        # 2. Daily Todo Draft Intent
        if any(w in lower for w in ("generate tomorrow's plan", "tomorrow's plan", "generate today's plan", "todo draft", "daily draft")):
            target_date = cal.format_date(today + cal.timedelta(days=1)) if "tomorrow" in lower else today_str
            draft = await plan_service.generate_daily_todo_draft(target_date, is_retrospective=False)
            card_data = {
                "draft_id": draft.draft_id,
                "date_str": draft.date_str,
                "items": [i.model_dump() for i in draft.items],
                "status": draft.status,
            }
            response_text = f"Here is the daily Todo draft for {target_date}. Review the items and click finalize when ready."
            return await self._save_assistant_reply(
                conversation_id, response_text, card_type="todo_draft", card_data=card_data
            )

        # 3. Focus / Pomodoro Intent
        if any(w in lower for w in ("start focus", "start pomodoro", "focus mode", "begin sprint")):
            session = await focus_service.start_pomodoro(date_str=today_str, task_title="Conversational Focus Sprint")
            card_data = {
                "session_id": session.session_id,
                "planned_minutes": session.planned_minutes,
                "dns_enabled": session.dns_enabled_by_session,
                "status": session.status,
            }
            response_text = (
                f"Focus Mode activated for {session.planned_minutes} minutes. "
                f"Lemon DNS restrictions have been requested ({'Enabled' if session.dns_enabled_by_session else 'DNS Pending'})."
            )
            return await self._save_assistant_reply(
                conversation_id, response_text, card_type="focus_control", card_data=card_data
            )

        if any(w in lower for w in ("stop focus", "end focus", "cancel focus", "stop pomodoro")):
            active = await self.db.pomodoro_sessions.find_one({"status": "active"})
            if active:
                session = await focus_service.stop_pomodoro(active["session_id"], status="completed", outcome_notes="Stopped via chat")
                return await self._save_assistant_reply(
                    conversation_id,
                    "Focus Mode stopped. Lemon DNS deactivation requested.",
                    card_type="focus_control",
                    card_data={"session_id": active["session_id"], "status": "completed"},
                )
            else:
                return await self._save_assistant_reply(
                    conversation_id, "There is no active Focus Mode session running currently."
                )

        # 4. Daily Feedback / Review Intent
        if any(w in lower for w in ("daily feedback", "today's feedback", "yesterday's feedback", "how was today", "daily closure", "review today")):
            target_date = cal.format_date(today - cal.timedelta(days=1)) if "yesterday" in lower else today_str
            summary = await feedback_service.generate_daily_feedback(target_date)
            card_data = {
                "summary_id": summary.summary_id,
                "date_str": summary.date_str,
                "verdict": summary.alignment_verdict,
                "observations": [o.model_dump() for o in summary.observations],
                "metrics": summary.metrics.model_dump(),
            }
            response_text = f"Daily Feedback Report for {target_date}: {summary.alignment_verdict}"
            return await self._save_assistant_reply(
                conversation_id, response_text, card_type="feedback_report", card_data=card_data
            )

        # 5. Friction Logging Intent
        if any(w in lower for w in ("friction:", "log friction", "distracted because", "interrupted by")):
            clean_desc = user_text.replace("log friction", "").replace("friction:", "").strip()
            log = await feedback_service.log_friction(
                date_str=today_str,
                category="interruption" if "interrupt" in lower else "procrastination",
                description=clean_desc or "User reported distraction during workday.",
            )
            return await self._save_assistant_reply(
                conversation_id, f"Friction recorded for {today_str}: '{log.description}'. This will be factored into daily feedback."
            )

        # 6. Notes Intent
        if lower.startswith("note:") or lower.startswith("remember:"):
            content = user_text.split(":", 1)[1].strip()
            title = content[:30] + ("..." if len(content) > 30 else "")
            note = await notes_service.create_note(title=title, content=content)
            return await self._save_assistant_reply(
                conversation_id, f"Saved personal context note '{title}'. It is accessible in Notes and preserved for planning."
            )

        # 7. General Assistant Retrieval & Answering
        # Retrieve context from active quarter, today's tasks, and notes
        tasks = await task_service.get_tasks_for_day(today_str)
        q_doc = await self.db.quarters.find_one({"quarter_id": conv.active_quarter_id})
        remaining_keys = q_doc.get("remaining_keys", 3) if q_doc else 3
        jp_total = await accountability_service.get_daily_junk_points_total(today_str)

        context_str = (
            f"Context: Today is {today_str}. Active Quarter: {conv.active_quarter_id}.\n"
            f"Remaining Quarter Keys: {remaining_keys} QK. Today's Junk Points: {jp_total} JP.\n"
            f"Today's tasks: {len(tasks)} ({len([t for t in tasks if t.status == 'completed'])} completed).\n"
        )

        llm_reply = await basket_adapter.chat_completion(
            messages=[
                {"role": "system", "content": context_str},
                {"role": "user", "content": user_text},
            ],
            temperature=0.4,
            max_tokens=450,
        )

        reply_content = llm_reply or (
            f"Today is {today_str} in Quarter {conv.active_quarter_id}. "
            f"You have {remaining_keys} Quarter Keys and {jp_total} Junk Points recorded. "
            f"How else can I assist with your planning or focus?"
        )

        return await self._save_assistant_reply(conversation_id, reply_content, card_type="text")

    async def _save_assistant_reply(
        self,
        conversation_id: str,
        content: str,
        card_type: CardType = "text",
        card_data: Optional[Dict[str, Any]] = None,
    ) -> ChatMessageModel:
        msg = ChatMessageModel(
            message_id=str(uuid.uuid4()),
            role="assistant",
            content=content,
            card_type=card_type,
            card_data=card_data,
        )
        await self.db.conversations.update_one(
            {"conversation_id": conversation_id},
            {"$push": {"messages": msg.model_dump()}, "$set": {"updated_at": datetime.utcnow()}},
        )
        return msg


chat_service = ChatService()
