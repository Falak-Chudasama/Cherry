"""
Query Executor Service for Cherry.
Translates user search requests into safe MongoDB queries via GBNF grammar constraints (temperature: 0.0),
executes them against Cherry's collections, and produces structured results.
Includes deterministic review/report synthesizers:
- day_snapshot
- quarter_review
- compare_quarters
- surplus_review
- season_review
"""
import re
import logging
from typing import Dict, Any, List, Optional
from app.core.database import get_db
from app.core import calendar as cal
from app.adapters.basket_adapter import basket_adapter
from app.ai.grammars.query_grammar import QUERY_GRAMMAR, build_safe_query
from app.services.task_service import task_service
from app.services.accountability_service import accountability_service

logger = logging.getLogger(__name__)

QUERY_SYSTEM_PROMPT = """You are Cherry's MongoDB Query Generator.
Translate the user's natural language search request into a JSON filter object that queries Cherry's records.

Allowed Collections:
- "tasks": Kanban tasks and todos
- "routine_occurrences": Routine completions and checklists
- "violations": Personal rule violations (no_games, junk_point_limit, no_skip_all_routines)
- "junk_point_ledger": Bad Diet and junk food log
- "pomodoro_sessions": Focus time logs
- "notes": Personal notes
- "quarter_plans": Saved quarter plans

Allowed JSON fields:
- "collection": name of collection to query
- "query": search keywords for title, description, or food name (leave empty string "" if listing all)
- "status": "Not started" | "In progress" | "Done" | "all"
- "date_str": YYYY-MM-DD (only when user asks for a specific date)
- "period_id": period identifier (e.g. 2026-11-Q4)
- "limit": integer 1-25

Return ONLY the raw JSON object."""


# --- Deterministic Report Synthesizers ---

async def generate_day_snapshot(date_str: str) -> Dict[str, Any]:
    """Synthesize complete Day Snapshot: tasks, routines, JP ledger, focus, violations."""
    db = get_db()
    tasks = await db.tasks.find({"target_date": date_str}).to_list(100)
    routines = await db.routine_occurrences.find({"date_str": date_str}).to_list(50)
    jp_entries = await db.junk_point_ledger.find({"date_str": date_str}).to_list(50)
    violations = await db.violations.find({"date_str": date_str}).to_list(50)
    focus_sessions = await db.pomodoro_sessions.find({"date_str": date_str, "status": "completed"}).to_list(50)

    done_tasks = sum(1 for t in tasks if t.get("status") == "Done")
    done_routines = sum(1 for r in routines if r.get("is_completed"))
    accumulated_jp = round(sum(e.get("jp_value", 0.0) for e in jp_entries), 2)
    focus_mins = sum(s.get("planned_minutes", 0) for s in focus_sessions)

    summary = (
        f"**Day Snapshot for {date_str}**:\n"
        f"• Tasks: {done_tasks}/{len(tasks)} completed\n"
        f"• Routines: {done_routines}/{len(routines)} completed\n"
        f"• Bad Diet: {accumulated_jp}/50 JP logged ({len(jp_entries)} entries)\n"
        f"• Focus: {focus_mins} minutes across {len(focus_sessions)} completed sprint(s)\n"
        f"• Violations: {len(violations)} recorded"
    )

    return {
        "report_type": "day_snapshot",
        "date_str": date_str,
        "summary": summary,
        "tasks_completed": done_tasks,
        "tasks_total": len(tasks),
        "routines_completed": done_routines,
        "routines_total": len(routines),
        "accumulated_jp": accumulated_jp,
        "focus_minutes": focus_mins,
        "violations_count": len(violations),
        "collection": "days",
        "result_count": len(tasks) + len(routines),
        "results": [{"title": t.get("title"), "status": t.get("status")} for t in tasks[:5]],
    }


async def generate_quarter_review(quarter_id: str) -> Dict[str, Any]:
    """Synthesize Quarter Review: tasks completed, deliverable progress, violations, focus."""
    db = get_db()
    tasks = await db.tasks.find({
        "$or": [{"period_id": quarter_id}, {"quarter_id": quarter_id}]
    }).to_list(200)
    violations = await db.violations.find({
        "$or": [{"period_id": quarter_id}, {"quarter_id": quarter_id}]
    }).to_list(100)

    done_tasks = sum(1 for t in tasks if t.get("status") == "Done")
    in_progress = sum(1 for t in tasks if t.get("status") == "In progress")
    not_started = sum(1 for t in tasks if t.get("status") == "Not started")
    completion_rate = round((done_tasks / len(tasks)) * 100, 1) if tasks else 0.0

    summary = (
        f"**Quarter Review for {quarter_id}**:\n"
        f"• Total Tasks: {len(tasks)} ({completion_rate}% completion rate)\n"
        f"• Kanban Breakdown: {done_tasks} Done, {in_progress} In Progress, {not_started} Not Started\n"
        f"• Violations: {len(violations)} recorded across the 7 days"
    )

    return {
        "report_type": "quarter_review",
        "period_id": quarter_id,
        "summary": summary,
        "total_tasks": len(tasks),
        "done_tasks": done_tasks,
        "in_progress": in_progress,
        "not_started": not_started,
        "completion_rate": completion_rate,
        "violations_count": len(violations),
        "collection": "tasks",
        "result_count": len(tasks),
        "results": [{"title": t.get("title"), "status": t.get("status")} for t in tasks[:5]],
    }


async def generate_compare_quarters(q1_id: str, q2_id: str) -> Dict[str, Any]:
    """Compare performance metrics between two Quarters."""
    rev1 = await generate_quarter_review(q1_id)
    rev2 = await generate_quarter_review(q2_id)

    summary = (
        f"**Comparison: {q1_id} vs {q2_id}**:\n"
        f"• Completion Rate: {rev1['completion_rate']}% ({q1_id}) vs {rev2['completion_rate']}% ({q2_id})\n"
        f"• Completed Tasks: {rev1['done_tasks']}/{rev1['total_tasks']} vs {rev2['done_tasks']}/{rev2['total_tasks']}\n"
        f"• Violations: {rev1['violations_count']} vs {rev2['violations_count']}"
    )

    return {
        "report_type": "compare_quarters",
        "summary": summary,
        "q1": rev1,
        "q2": rev2,
        "collection": "tasks",
        "result_count": rev1["total_tasks"] + rev2["total_tasks"],
        "results": [],
    }


async def generate_surplus_review(surplus_id: str) -> Dict[str, Any]:
    """Review activity, tasks, notes and diet during the distinct Surplus Period (Days 29-31)."""
    db = get_db()
    tasks = await db.tasks.find({
        "$or": [{"period_id": surplus_id}, {"quarter_id": surplus_id}]
    }).to_list(100)
    violations = await db.violations.find({
        "$or": [{"period_id": surplus_id}, {"quarter_id": surplus_id}]
    }).to_list(50)
    jp_entries = await db.junk_point_ledger.find({"period_id": surplus_id}).to_list(50)

    done = sum(1 for t in tasks if t.get("status") == "Done")
    accumulated_jp = round(sum(e.get("jp_value", 0.0) for e in jp_entries), 2)

    summary = (
        f"**Surplus Period Review ({surplus_id})**:\n"
        f"• Distinct entity for Days 29-31 (not a 5th Quarter)\n"
        f"• Tasks: {done}/{len(tasks)} completed\n"
        f"• Bad Diet: {accumulated_jp} JP logged across surplus days\n"
        f"• Violations: {len(violations)} recorded"
    )

    return {
        "report_type": "surplus_review",
        "period_id": surplus_id,
        "summary": summary,
        "tasks_completed": done,
        "total_tasks": len(tasks),
        "accumulated_jp": accumulated_jp,
        "violations_count": len(violations),
        "collection": "tasks",
        "result_count": len(tasks),
        "results": [{"title": t.get("title"), "status": t.get("status")} for t in tasks[:5]],
    }


async def generate_season_review(season_id: str) -> Dict[str, Any]:
    """Roll up all 4 quarters + Surplus Period for a Season (calendar month)."""
    q_reviews = []
    total_tasks = 0
    total_done = 0
    total_violations = 0

    for q_num in range(1, 5):
        qid = f"{season_id}-Q{q_num}"
        rev = await generate_quarter_review(qid)
        q_reviews.append(rev)
        total_tasks += rev["total_tasks"]
        total_done += rev["done_tasks"]
        total_violations += rev["violations_count"]

    surplus_id = f"{season_id}-SURPLUS"
    surplus_rev = await generate_surplus_review(surplus_id)
    total_tasks += surplus_rev["total_tasks"]
    total_done += surplus_rev["tasks_completed"]
    total_violations += surplus_rev["violations_count"]

    overall_completion = round((total_done / total_tasks) * 100, 1) if total_tasks else 0.0

    summary = (
        f"**Season Review for {season_id}**:\n"
        f"• Overall Completion: {overall_completion}% ({total_done}/{total_tasks} tasks done)\n"
        f"• 4 Quarters: Q1 ({q_reviews[0]['completion_rate']}%), Q2 ({q_reviews[1]['completion_rate']}%), Q3 ({q_reviews[2]['completion_rate']}%), Q4 ({q_reviews[3]['completion_rate']}%)\n"
        f"• Surplus Period: {surplus_rev['tasks_completed']}/{surplus_rev['total_tasks']} tasks\n"
        f"• Season Total Violations: {total_violations}"
    )

    return {
        "report_type": "season_review",
        "season_id": season_id,
        "summary": summary,
        "overall_completion": overall_completion,
        "total_tasks": total_tasks,
        "total_done": total_done,
        "total_violations": total_violations,
        "quarter_reviews": q_reviews,
        "surplus_review": surplus_rev,
        "collection": "seasons",
        "result_count": total_tasks,
        "results": [],
    }


# --- Main Query Dispatcher ---

async def execute_db_query(user_prompt: str, snapshot_text: str = "") -> Dict[str, Any]:
    prompt_lower = user_prompt.lower()
    today_d = cal.today_local()
    today_str = cal.format_date(today_d)
    _, active_period_id = cal.get_period_for_day(today_d)
    season_id = cal.get_season_for_day(today_d)

    # 1. Check deterministic report keywords
    if "day snapshot" in prompt_lower or "today snapshot" in prompt_lower:
        date_match = re.search(r"\b\d{4}-\d{2}-\d{2}\b", user_prompt)
        target_date = date_match.group(0) if date_match else today_str
        return await generate_day_snapshot(target_date)

    if "quarter review" in prompt_lower or "review quarter" in prompt_lower:
        q_match = re.search(r"\b\d{4}-\d{2}-Q[1-4]\b", user_prompt, re.IGNORECASE)
        target_q = q_match.group(0).upper() if q_match else active_period_id
        return await generate_quarter_review(target_q)

    if "compare quarters" in prompt_lower or "compare quarter" in prompt_lower:
        matches = re.findall(r"\b\d{4}-\d{2}-Q[1-4]\b", user_prompt, re.IGNORECASE)
        q1 = matches[0].upper() if len(matches) > 0 else f"{season_id}-Q1"
        q2 = matches[1].upper() if len(matches) > 1 else f"{season_id}-Q2"
        return await generate_compare_quarters(q1, q2)

    if "surplus review" in prompt_lower:
        s_match = re.search(r"\b\d{4}-\d{2}-SURPLUS\b", user_prompt, re.IGNORECASE)
        target_s = s_match.group(0).upper() if s_match else f"{season_id}-SURPLUS"
        return await generate_surplus_review(target_s)

    if "season review" in prompt_lower:
        s_match = re.search(r"\b\d{4}-\d{2}\b", user_prompt)
        target_season = s_match.group(0) if s_match else season_id
        return await generate_season_review(target_season)

    # 1b. Direct high-signal queries (today's tasks, JP budget, notes)
    if any(k in prompt_lower for k in ("what tasks", "show my tasks", "my tasks", "list tasks", "today's tasks", "tasks today", "tasks right now")):
        day_tasks = await task_service.get_tasks_for_day(today_str)
        if not day_tasks:
            day_tasks = await task_service.get_tasks_for_period(active_period_id)
        results = [t.model_dump(mode="json") for t in day_tasks[:15]]
        if not results:
            summary = f"No tasks found for **{active_period_id}**."
        else:
            lines = [f"**{len(results)} task(s)** in **{active_period_id}**:"]
            for t in day_tasks[:8]:
                st_info = f" ({sum(1 for s in t.subtasks if s.is_completed)}/{len(t.subtasks)} subtasks)" if t.subtasks else ""
                lines.append(f"- **{t.title}** — {t.tier or 'Must Do'} · *{t.status}*{st_info}")
            summary = "\n".join(lines)
        return {
            "collection": "tasks",
            "filter": {"period_id": active_period_id},
            "result_count": len(results),
            "summary": summary,
            "results": results[:10],
        }

    if any(k in prompt_lower for k in ("how many jp", "how many junk", "junk point", "what did i eat", "diet today")):
        jp = await accountability_service.get_day_junk_points(today_str, active_period_id)
        entries = [e.model_dump(mode="json") for e in jp.entries]
        summary = f"**Diet today ({today_str})**: {jp.accumulated_jp}/{int(jp.limit)} JP used · **{jp.remaining_jp} JP** remaining ({len(entries)} entries)."
        return {
            "collection": "junk_point_ledger",
            "filter": {"date_str": today_str},
            "result_count": len(entries),
            "summary": summary,
            "results": entries[:10],
        }

    # 2. General Query via GBNF Grammar
    full_prompt = f"{snapshot_text}\n\nSearch Request: {user_prompt.strip()}"
    try:
        res = await basket_adapter.completion(
            prompt=full_prompt,
            system_prompt=QUERY_SYSTEM_PROMPT,
            grammar=QUERY_GRAMMAR,
            temperature=0.0,
            max_tokens=256,
        )
        content = res.get("content", "")
        safe_spec = build_safe_query(content)
        collection_name = safe_spec["collection"]
        mongo_filter = safe_spec["filter"]
        limit = safe_spec["limit"]

        # Special handling for tasks when filtered by date_str
        if collection_name == "tasks" and safe_spec.get("date_str"):
            day_tasks = await task_service.get_tasks_for_day(safe_spec["date_str"])
            q_text = (safe_spec.get("query_text") or "").lower()
            st_filter = safe_spec.get("status")
            results = []
            for t in day_tasks:
                if st_filter and st_filter != "all" and t.status != st_filter:
                    continue
                if q_text and q_text not in t.title.lower() and q_text not in (t.description or "").lower():
                    continue
                results.append(t.model_dump(mode="json"))
        else:
            db = get_db()
            coll = getattr(db, collection_name)
            cursor = coll.find(mongo_filter).sort("created_at", -1).limit(limit)
            results = []
            async for doc in cursor:
                doc.pop("_id", None)
                results.append(doc)

        logger.info(f"[QueryExecutor] Executed query on '{collection_name}' with filter {mongo_filter}: {len(results)} matches.")

        label_map = {
            "tasks": "tasks",
            "routine_occurrences": "routines",
            "violations": "violations",
            "junk_point_ledger": "diet entries",
            "pomodoro_sessions": "focus sessions",
            "notes": "notes",
            "quarter_plans": "quarter plans",
        }
        col_label = label_map.get(collection_name, collection_name)

        if not results:
            summary = f"No matching {col_label} found."
        else:
            summary = f"Found **{len(results)}** {col_label}."

        return {
            "collection": collection_name,
            "filter": mongo_filter,
            "result_count": len(results),
            "summary": summary,
            "results": results[:10],
        }
    except Exception as e:
        logger.error(f"[QueryExecutor] Error executing query: {e}")
        return {
            "collection": "tasks",
            "filter": {},
            "result_count": 0,
            "summary": f"Could not complete search: {str(e)}",
            "results": [],
        }
