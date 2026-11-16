"""
System & Ecosystem Health endpoints for Cherry.
"""
from fastapi import APIRouter
from app.core.config import settings
from app.core.database import db_manager
from app.core import calendar as cal
from app.adapters.basket_adapter import basket_adapter
from app.adapters.lemon_adapter import lemon_adapter
from app.services.calendar_service import calendar_service

router = APIRouter(prefix="/api/system", tags=["System"])


@router.get("/health")
async def health_check():
    today = cal.today_local()
    mongo_ok = await db_manager.is_healthy()
    basket_ok = await basket_adapter.is_available()
    lemon_ok = await lemon_adapter.is_available()

    return {
        "status": "healthy" if mongo_ok else "degraded",
        "service": "cherry",
        "version": settings.version,
        "database_ok": mongo_ok,
        "basket_ai_ok": basket_ok,
        "lemon_desktop_ok": lemon_ok,
        "current_local_date": cal.format_date(today),
        "timezone": settings.TIMEZONE,
        "junk_point_limit": settings.JUNK_POINT_LIMIT,
        "quarter_keys_initial": settings.QUARTER_KEYS_INITIAL,
    }


@router.get("/overview")
async def system_overview():
    today = cal.today_local()
    active_q = await calendar_service.get_active_quarter(today)
    q_data = active_q.model_dump() if active_q else None
    day = await calendar_service.get_day(cal.format_date(today))

    return {
        "today": cal.format_date(today),
        "active_quarter": q_data,
        "day": day.model_dump() if day else None,
        "basket_available": await basket_adapter.is_available(),
        "lemon_available": await lemon_adapter.is_available(),
    }
