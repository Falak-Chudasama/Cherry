"""
Deterministic Live Reality Snapshot Builder for Cherry AI.
Constructs a compact, fact-grounded context (~200-300 tokens) with zero LLM calls.
"""
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from app.core import calendar as cal
from app.core.config import settings
from app.core.database import get_db
from app.adapters.lemon_adapter import lemon_adapter
from app.adapters.basket_adapter import basket_adapter
from app.services.accountability_service import accountability_service
from app.services.focus_service import focus_service

logger = logging.getLogger(__name__)


async def build_live_reality_snapshot(session_id: Optional[str] = None, user_prompt: Optional[str] = None) -> Dict[str, Any]:
    db = get_db()
    now_dt = cal.now_local()
    today_d = now_dt.date()
    today_str = cal.format_date(today_d)

    # 1. Clock & Time remaining until 23:00 Day Closure
    closure_target = datetime.combine(today_d, datetime.min.time().replace(hour=settings.CLOSURE_HOUR, minute=0))
    closure_target = closure_target.replace(tzinfo=now_dt.tzinfo)
    time_diff = closure_target - now_dt
    if time_diff.total_seconds() > 0:
        hours_left = int(time_diff.total_seconds() // 3600)
        mins_left = int((time_diff.total_seconds() % 3600) // 60)
        closure_countdown = f"{hours_left}h {mins_left}m remaining until 23:00 Day Closure"
    else:
        closure_countdown = "Day Closure (23:00) has passed"

    # 2. Active Hierarchy: Day -> Period -> Season -> Verse
    period_type, period_id = cal.get_period_for_day(today_d)
    season_id = cal.get_season_for_day(today_d)
    verse_id = cal.get_verse_for_day(today_d)

    # Calculate day N of 7 (or day N of 3 for surplus)
    day_num = today_d.day
    if period_type == "SURPLUS":
        period_label = f"Surplus Period ({period_id}) [Day {day_num - 28} of 3]"
    else:
        q_idx = int(period_type.replace("Q", ""))
        day_in_q = day_num - ((q_idx - 1) * 7)
        period_label = f"{period_type} ({period_id}) [Day {day_in_q} of 7]"

    # 3. Current Period Kanban Tasks
    task_cursor = db.tasks.find({
        "$or": [{"period_id": period_id}, {"quarter_id": period_id}]
    }).sort("created_at", 1)
    kanban_tasks = []
    async for t in task_cursor:
        subtasks = t.get("subtasks", [])
        done_st = sum(1 for s in subtasks if s.get("is_completed"))
        st_summary = f"{done_st}/{len(subtasks)} st" if subtasks else "no st"
        tier = t.get("tier", t.get("priority", "Must Do"))
        kanban_tasks.append(
            f"[{t.get('task_id', '')[:8]}] {t.get('title', '')} | {tier} | {t.get('status', 'Not started')} | ({st_summary})"
        )

    # 4. Daily Routines
    routine_cursor = db.routine_occurrences.find({"date_str": today_str})
    routines = []
    async for r in routine_cursor:
        status_str = "Done" if r.get("is_completed") else "Pending"
        routines.append(f"{r.get('title', '')} ({status_str})")

    # 5. Real Diet/JP & Focus State
    try:
        jp_summary = await accountability_service.get_day_junk_points(today_str, period_id)
        today_jp = jp_summary.accumulated_jp
        remaining_jp = jp_summary.remaining_jp
    except Exception:
        today_jp = 0.0
        remaining_jp = float(settings.JUNK_POINT_LIMIT)

    focus_line = "Focus: Idle"
    try:
        focus_state = await focus_service.get_focus_state()
        if focus_state.phase == "focus":
            focus_line = f"Focus: Active ({focus_state.planned_minutes or 60}m, DNS={'ON' if focus_state.dns_protection_active else 'OFF'})"
        elif focus_state.phase == "break":
            focus_line = "Focus: 10m Break"
        elif focus_state.dns_protection_active:
            focus_line = "Focus: Idle (Lemon DNS=ON)"
    except Exception:
        pass

    # 6. Recent Conversation Window (last 6 turns, avoiding trailing duplicate)
    recent_history: List[Dict[str, str]] = []
    if session_id:
        chat_doc = await db.chats.find_one({"session_id": session_id, "application": "cherry"})
        if chat_doc:
            raw_msgs = chat_doc.get("messages", [])
            for m in raw_msgs[-6:]:
                role = m.get("role", "user")
                content = m.get("content", "")
                if content:
                    recent_history.append({"role": role, "content": content})

    # 7. Notes Context via Basket RAG
    relevant_notes: List[str] = []
    if user_prompt:
        try:
            rag_results = await basket_adapter.query_notes_rag(user_prompt, limit=3)
            for r in rag_results:
                title = r.get("title", "")
                content = r.get("content", "")
                if title or content:
                    relevant_notes.append(f"- {title}: {content[:120]}")
        except Exception:
            pass

    # Build Compact, High-Signal Text Snapshot (~200 tokens)
    snapshot_lines = [
        f"=== CHERRY LIVE REALITY SNAPSHOT ===",
        f"Time: {now_dt.strftime('%A, %Y-%m-%d %H:%M:%S')} Asia/Kolkata (IST) ({closure_countdown})",
        f"Hierarchy: {period_label} | Season: {season_id} | Verse: {verse_id}",
        f"Diet JP: {today_jp}/{settings.JUNK_POINT_LIMIT} used ({remaining_jp} remaining) | {focus_line}",
    ]

    if kanban_tasks:
        snapshot_lines.append("Period Tasks:")
        for t_line in kanban_tasks[:8]:
            snapshot_lines.append(f"  {t_line}")
        if len(kanban_tasks) > 8:
            snapshot_lines.append(f"  ...and {len(kanban_tasks) - 8} more tasks")

    if routines:
        snapshot_lines.append(f"Daily Routines: {', '.join(routines[:4])}")

    if relevant_notes:
        snapshot_lines.append("Relevant Notes:")
        snapshot_lines.extend(relevant_notes)

    snapshot_text = "\n".join(snapshot_lines)

    return {
        "snapshot_text": snapshot_text,
        "now_dt": now_dt,
        "today_str": today_str,
        "period_id": period_id,
        "period_type": period_type,
        "recent_history": recent_history,
        "today_jp": today_jp,
        "remaining_jp": remaining_jp,
    }
