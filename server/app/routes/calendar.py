"""
Calendar System Routes for Cherry.
Hierarchy: Day -> Quarter -> Season -> Verse
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
from app.core import calendar as cal
from app.services.calendar_service import calendar_service

router = APIRouter(prefix="/api/calendar", tags=["Calendar"])


@router.get("/today")
async def get_today():
    today = cal.today_local()
    day = await calendar_service.ensure_day_exists(today)
    quarter = await calendar_service.get_active_quarter(today)
    season = await calendar_service.ensure_season_exists(today.year, today.month)
    verse = await calendar_service.ensure_verse_exists(today.year)

    return {
        "day": day.model_dump(),
        "quarter": quarter.model_dump() if quarter else None,
        "season": season.model_dump(),
        "verse": verse.model_dump(),
    }


@router.get("/date/{date_str}")
async def get_day_by_date(date_str: str):
    try:
        d = cal.parse_date(date_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")

    day = await calendar_service.ensure_day_exists(d)
    period_type, period_id = cal.get_period_for_day(d)
    return {
        "day": day.model_dump(),
        "period_type": period_type,
        "period_id": period_id,
    }


@router.get("/quarter/{quarter_id}")
async def get_quarter(quarter_id: str):
    doc = await calendar_service.db.quarters.find_one({"quarter_id": quarter_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Quarter not found.")
    return doc


@router.get("/season/{season_id}")
async def get_season(season_id: str):
    doc = await calendar_service.db.seasons.find_one({"season_id": season_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Season not found.")
    return doc


@router.get("/season/{season_id}/summary")
async def get_season_summary(season_id: str):
    """
    Lightweight deterministic summary of all Quarters and Surplus Period in a Season
    (Tasks, JP, Violations, Focus minutes) to power SeasonPage without client-side N+1 roundtrips.
    """
    db = calendar_service.db
    season = await db.seasons.find_one({"season_id": season_id})
    if not season:
        try:
            parts = season_id.split("-")
            year, month = int(parts[0]), int(parts[1])
            s_model = await calendar_service.ensure_season_exists(year, month)
            season = s_model.model_dump()
        except Exception:
            raise HTTPException(status_code=404, detail="Season not found.")

    periods = []
    for q_id in season.get("quarter_ids", []):
        q_doc = await db.quarters.find_one({"quarter_id": q_id})
        if not q_doc:
            continue
        
        tasks_total = await db.tasks.count_documents({"$or": [{"period_id": q_id}, {"quarter_id": q_id}]})
        tasks_done = await db.tasks.count_documents({"$or": [{"period_id": q_id}, {"quarter_id": q_id}], "status": "Done"})
        
        jp_cursor = db.junk_point_ledger.aggregate([
            {"$match": {"period_id": q_id}},
            {"$group": {"_id": None, "total": {"$sum": "$jp_value"}}}
        ])
        jp_res = await jp_cursor.to_list(length=1)
        jp_total = float(jp_res[0]["total"]) if jp_res else 0.0

        violations_count = await db.violations.count_documents({"period_id": q_id})

        day_ids = q_doc.get("day_ids", [])
        focus_cursor = db.pomodoro_sessions.aggregate([
            {"$match": {"date_str": {"$in": day_ids}, "status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$planned_minutes"}}}
        ])
        f_res = await focus_cursor.to_list(length=1)
        focus_mins = int(f_res[0]["total"]) if f_res else 0

        periods.append({
            "period_id": q_id,
            "period_type": f"Q{q_doc.get('quarter_num', 1)}",
            "name": f"Quarter {q_doc.get('quarter_num', 1)}",
            "quarter_num": q_doc.get("quarter_num", 1),
            "start_date": q_doc.get("start_date"),
            "end_date": q_doc.get("end_date"),
            "status": q_doc.get("status", "active"),
            "tasks_total": tasks_total,
            "tasks_done": tasks_done,
            "jp_total": jp_total,
            "violations_count": violations_count,
            "focus_minutes": focus_mins,
            "remaining_keys": q_doc.get("remaining_keys", 3),
        })

    surplus_id = season.get("surplus_id")
    if surplus_id:
        s_doc = await db.surplus_periods.find_one({"surplus_id": surplus_id})
        if s_doc:
            tasks_total = await db.tasks.count_documents({"$or": [{"period_id": surplus_id}, {"quarter_id": surplus_id}]})
            tasks_done = await db.tasks.count_documents({"$or": [{"period_id": surplus_id}, {"quarter_id": surplus_id}], "status": "Done"})
            
            jp_cursor = db.junk_point_ledger.aggregate([
                {"$match": {"period_id": surplus_id}},
                {"$group": {"_id": None, "total": {"$sum": "$jp_value"}}}
            ])
            jp_res = await jp_cursor.to_list(length=1)
            jp_total = float(jp_res[0]["total"]) if jp_res else 0.0

            violations_count = await db.violations.count_documents({"period_id": surplus_id})

            day_ids = s_doc.get("day_ids", [])
            focus_cursor = db.pomodoro_sessions.aggregate([
                {"$match": {"date_str": {"$in": day_ids}, "status": "completed"}},
                {"$group": {"_id": None, "total": {"$sum": "$planned_minutes"}}}
            ])
            f_res = await focus_cursor.to_list(length=1)
            focus_mins = int(f_res[0]["total"]) if f_res else 0

            periods.append({
                "period_id": surplus_id,
                "period_type": "SURPLUS",
                "name": "Surplus Period",
                "quarter_num": None,
                "start_date": s_doc.get("start_date"),
                "end_date": s_doc.get("end_date"),
                "status": s_doc.get("status", "active"),
                "tasks_total": tasks_total,
                "tasks_done": tasks_done,
                "jp_total": jp_total,
                "violations_count": violations_count,
                "focus_minutes": focus_mins,
                "remaining_keys": None,
            })

    return {
        "season_id": season_id,
        "name": season.get("name", season_id),
        "year": season.get("year"),
        "month": season.get("month"),
        "has_surplus": surplus_id is not None,
        "periods": periods,
        "totals": {
            "tasks_done": sum(p["tasks_done"] for p in periods),
            "tasks_total": sum(p["tasks_total"] for p in periods),
            "jp_total": sum(p["jp_total"] for p in periods),
            "violations_count": sum(p["violations_count"] for p in periods),
            "focus_minutes": sum(p["focus_minutes"] for p in periods),
        }
    }


@router.get("/verse/{year}")
async def get_verse(year: int):
    doc = await calendar_service.db.verses.find_one({"verse_id": str(year)})
    if not doc:
        raise HTTPException(status_code=404, detail="Verse not found.")
    return doc


@router.get("/verse/{year}/summary")
async def get_verse_summary(year: int):
    """
    Lightweight deterministic summary of all 12 Seasons in a Verse (Year)
    for the Verse grid overview.
    """
    db = calendar_service.db
    months_data = []

    for m in range(1, 13):
        season_id = f"{year}-{m:02d}"
        # Parse month name
        import calendar as py_calendar
        month_name = py_calendar.month_name[m]

        # Tasks for season
        tasks_total = await db.tasks.count_documents({
            "$or": [
                {"period_id": {"$regex": f"^{season_id}"}},
                {"quarter_id": {"$regex": f"^{season_id}"}},
            ]
        })
        tasks_done = await db.tasks.count_documents({
            "$or": [
                {"period_id": {"$regex": f"^{season_id}"}},
                {"quarter_id": {"$regex": f"^{season_id}"}},
            ],
            "status": "Done"
        })

        # JP
        jp_cursor = db.junk_point_ledger.aggregate([
            {"$match": {"period_id": {"$regex": f"^{season_id}"}}},
            {"$group": {"_id": None, "total": {"$sum": "$jp_value"}}}
        ])
        jp_res = await jp_cursor.to_list(length=1)
        jp_total = float(jp_res[0]["total"]) if jp_res else 0.0

        # Violations
        violations_count = await db.violations.count_documents({
            "period_id": {"$regex": f"^{season_id}"}
        })

        # Focus
        focus_cursor = db.pomodoro_sessions.aggregate([
            {"$match": {"date_str": {"$regex": f"^{season_id}"}, "status": "completed"}},
            {"$group": {"_id": None, "total": {"$sum": "$planned_minutes"}}}
        ])
        f_res = await focus_cursor.to_list(length=1)
        focus_mins = int(f_res[0]["total"]) if f_res else 0

        months_data.append({
            "month": m,
            "month_name": month_name,
            "season_id": season_id,
            "tasks_total": tasks_total,
            "tasks_done": tasks_done,
            "jp_total": jp_total,
            "violations_count": violations_count,
            "focus_minutes": focus_mins,
        })

    return {
        "verse_id": str(year),
        "year": year,
        "months": months_data,
        "totals": {
            "tasks_done": sum(m["tasks_done"] for m in months_data),
            "tasks_total": sum(m["tasks_total"] for m in months_data),
            "jp_total": sum(m["jp_total"] for m in months_data),
            "violations_count": sum(m["violations_count"] for m in months_data),
            "focus_minutes": sum(m["focus_minutes"] for m in months_data),
        }
    }
