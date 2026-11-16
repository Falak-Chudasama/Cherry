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


@router.get("/verse/{year}")
async def get_verse(year: int):
    doc = await calendar_service.db.verses.find_one({"verse_id": str(year)})
    if not doc:
        raise HTTPException(status_code=404, detail="Verse not found.")
    return doc
