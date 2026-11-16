"""
Cherry Quarter System Calendar Engine.

Hierarchy:
Day -> Quarter -> Season -> Verse

Laws:
- Verse: Calendar year.
- Season: Calendar month named after month (e.g., November 2026).
- Quarter: Exactly 7 days!
  * Q1: Days 1-7
  * Q2: Days 8-14
  * Q3: Days 15-21
  * Q4: Days 22-28
- Surplus Period: Days 29, 30, 31 (when present).
  * Never a 5th Quarter. Never an extension of Q4.
  * Separate entity belonging to its Season.
  * A month with 28 days has NO Surplus Period.
"""
import calendar
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple, Literal
import zoneinfo
from app.core.config import settings


PeriodType = Literal["Q1", "Q2", "Q3", "Q4", "SURPLUS"]


def get_timezone():
    """Get the configured ZoneInfo object."""
    try:
        return zoneinfo.ZoneInfo(settings.TIMEZONE)
    except Exception:
        return zoneinfo.ZoneInfo("UTC")


def now_local() -> datetime:
    """Current timestamp in configured local timezone."""
    return datetime.now(get_timezone())


def today_local() -> date:
    """Current calendar date in configured local timezone."""
    return now_local().date()


def parse_date(date_str: str) -> date:
    """Parse YYYY-MM-DD string to date object."""
    return datetime.strptime(date_str, "%Y-%m-%d").date()


def format_date(d: date) -> str:
    """Format date to YYYY-MM-DD string."""
    return d.strftime("%Y-%m-%d")


def get_days_in_month(year: int, month: int) -> int:
    """Return total days in month (28, 29, 30, or 31)."""
    return calendar.monthrange(year, month)[1]


def get_month_name(month: int) -> str:
    """Return English month name (e.g. November)."""
    return calendar.month_name[month]


def get_verse_id(year: int) -> str:
    """Verse ID (e.g. '2026')."""
    return str(year)


def get_season_id(year: int, month: int) -> str:
    """Season ID (e.g. '2026-11')."""
    return f"{year:04d}-{month:02d}"


def get_season_name(year: int, month: int) -> str:
    """Season Name (e.g. 'November 2026')."""
    return f"{get_month_name(month)} {year}"


def get_quarter_id(year: int, month: int, quarter_num: int) -> str:
    """Quarter ID (e.g. '2026-11-Q1')."""
    if quarter_num < 1 or quarter_num > 4:
        raise ValueError(f"Quarter number must be 1, 2, 3, or 4. Got {quarter_num}.")
    return f"{year:04d}-{month:02d}-Q{quarter_num}"


def get_surplus_id(year: int, month: int) -> str:
    """Surplus Period ID (e.g. '2026-11-SURPLUS')."""
    return f"{year:04d}-{month:02d}-SURPLUS"


def get_period_for_day(d: date) -> Tuple[PeriodType, str]:
    """
    Given a calendar date, return its PeriodType ('Q1','Q2','Q3','Q4','SURPLUS')
    and its stable period ID.
    """
    day_num = d.day
    year = d.year
    month = d.month

    if 1 <= day_num <= 7:
        return "Q1", get_quarter_id(year, month, 1)
    elif 8 <= day_num <= 14:
        return "Q2", get_quarter_id(year, month, 2)
    elif 15 <= day_num <= 21:
        return "Q3", get_quarter_id(year, month, 3)
    elif 22 <= day_num <= 28:
        return "Q4", get_quarter_id(year, month, 4)
    else:
        # Days 29, 30, 31
        total_days = get_days_in_month(year, month)
        if day_num > total_days:
            raise ValueError(f"Invalid date {d}: month {month} has only {total_days} days.")
        return "SURPLUS", get_surplus_id(year, month)


def get_quarter_date_range(year: int, month: int, quarter_num: int) -> Tuple[date, date]:
    """
    Return start and end dates for a specific Quarter (always exactly 7 days).
    """
    if quarter_num == 1:
        return date(year, month, 1), date(year, month, 7)
    elif quarter_num == 2:
        return date(year, month, 8), date(year, month, 14)
    elif quarter_num == 3:
        return date(year, month, 15), date(year, month, 21)
    elif quarter_num == 4:
        return date(year, month, 22), date(year, month, 28)
    else:
        raise ValueError(f"Quarter number must be 1-4. Got {quarter_num}.")


def get_quarter_dates(year: int, month: int, quarter_num: int) -> List[date]:
    """Return all 7 date objects in a Quarter."""
    start_d, end_d = get_quarter_date_range(year, month, quarter_num)
    dates = []
    curr = start_d
    while curr <= end_d:
        dates.append(curr)
        curr += timedelta(days=1)
    return dates


def get_surplus_date_range(year: int, month: int) -> Optional[Tuple[date, date]]:
    """
    Return start and end dates for a month's Surplus Period, or None if 28-day month.
    """
    total_days = get_days_in_month(year, month)
    if total_days <= 28:
        return None
    return date(year, month, 29), date(year, month, total_days)


def get_surplus_dates(year: int, month: int) -> List[date]:
    """Return all date objects in the Surplus Period, or empty list if month has <= 28 days."""
    total_days = get_days_in_month(year, month)
    if total_days <= 28:
        return []
    dates = []
    for d in range(29, total_days + 1):
        dates.append(date(year, month, d))
    return dates


def get_season_date_range(year: int, month: int) -> Tuple[date, date]:
    """Start and end dates for the Season (1st of month to last calendar day)."""
    total_days = get_days_in_month(year, month)
    return date(year, month, 1), date(year, month, total_days)


def get_season_days(year: int, month: int) -> List[date]:
    """All calendar dates in the Season."""
    total_days = get_days_in_month(year, month)
    return [date(year, month, d) for d in range(1, total_days + 1)]


def get_date_sequence(start_d: date, end_d: date) -> List[date]:
    """Generate inclusive list of dates between start_d and end_d in chronological order."""
    if start_d > end_d:
        return []
    dates = []
    curr = start_d
    while curr <= end_d:
        dates.append(curr)
        curr += timedelta(days=1)
    return dates


def is_quarter_closing_day(d: date) -> bool:
    """Returns True if this calendar date is the final day of a Quarter (day 7, 14, 21, 28)."""
    return d.day in (7, 14, 21, 28)


def is_season_closing_day(d: date) -> bool:
    """Returns True if this calendar date is the last calendar day of the month."""
    total_days = get_days_in_month(d.year, d.month)
    return d.day == total_days


def is_verse_closing_day(d: date) -> bool:
    """Returns True if this calendar date is Dec 31."""
    return d.month == 12 and d.day == 31
