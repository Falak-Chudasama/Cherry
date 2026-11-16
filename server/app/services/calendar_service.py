"""
Calendar domain service for managing the Quarter System hierarchy:
Verse, Season, Quarter, SurplusPeriod, and Day.
"""
from datetime import date, datetime
from typing import Optional, List, Tuple
from app.core.database import get_db
from app.core import calendar as cal
from app.models.calendar_models import (
    VerseModel,
    SeasonModel,
    QuarterModel,
    SurplusPeriodModel,
    DayModel,
)


class CalendarService:
    @property
    def db(self):
        return get_db()

    async def ensure_verse_exists(self, year: int) -> VerseModel:
        """Ensure the calendar year Verse record exists."""
        verse_id = cal.get_verse_id(year)
        doc = await self.db.verses.find_one({"verse_id": verse_id})
        if doc:
            return VerseModel(**doc)

        verse = VerseModel(
            verse_id=verse_id,
            year=year,
            season_ids=[cal.get_season_id(year, m) for m in range(1, 13)],
            status="active",
        )
        await self.db.verses.insert_one(verse.model_dump())
        return verse

    async def ensure_season_exists(self, year: int, month: int) -> SeasonModel:
        """Ensure the calendar month Season record exists."""
        await self.ensure_verse_exists(year)
        season_id = cal.get_season_id(year, month)
        doc = await self.db.seasons.find_one({"season_id": season_id})
        if doc:
            return SeasonModel(**doc)

        quarter_ids = [cal.get_quarter_id(year, month, q) for q in range(1, 5)]
        has_surplus = cal.get_days_in_month(year, month) > 28
        surplus_id = cal.get_surplus_id(year, month) if has_surplus else None

        season = SeasonModel(
            season_id=season_id,
            year=year,
            month=month,
            name=cal.get_season_name(year, month),
            verse_id=cal.get_verse_id(year),
            quarter_ids=quarter_ids,
            surplus_id=surplus_id,
            status="active",
        )
        await self.db.seasons.insert_one(season.model_dump())

        # Also initialize the 4 quarters
        for q in range(1, 5):
            await self.ensure_quarter_exists(year, month, q)

        # Initialize surplus period if applicable
        if has_surplus:
            await self.ensure_surplus_exists(year, month)

        return season

    async def ensure_quarter_exists(self, year: int, month: int, quarter_num: int) -> QuarterModel:
        """Ensure a Quarter record exists (exactly 7 days)."""
        quarter_id = cal.get_quarter_id(year, month, quarter_num)
        doc = await self.db.quarters.find_one({"quarter_id": quarter_id})
        if doc:
            return QuarterModel(**doc)

        start_d, end_d = cal.get_quarter_date_range(year, month, quarter_num)
        day_ids = [cal.format_date(d) for d in cal.get_quarter_dates(year, month, quarter_num)]

        quarter = QuarterModel(
            quarter_id=quarter_id,
            season_id=cal.get_season_id(year, month),
            verse_id=cal.get_verse_id(year),
            quarter_num=quarter_num,
            start_date=cal.format_date(start_d),
            end_date=cal.format_date(end_d),
            day_ids=day_ids,
            remaining_keys=3,
            total_violations=0,
            status="active",
        )
        await self.db.quarters.insert_one(quarter.model_dump())
        return quarter

    async def ensure_surplus_exists(self, year: int, month: int) -> Optional[SurplusPeriodModel]:
        """Ensure a Surplus Period record exists for months with > 28 days."""
        total_days = cal.get_days_in_month(year, month)
        if total_days <= 28:
            return None

        surplus_id = cal.get_surplus_id(year, month)
        doc = await self.db.surplus_periods.find_one({"surplus_id": surplus_id})
        if doc:
            return SurplusPeriodModel(**doc)

        start_d, end_d = cal.get_surplus_date_range(year, month)
        day_ids = [cal.format_date(d) for d in cal.get_surplus_dates(year, month)]

        surplus = SurplusPeriodModel(
            surplus_id=surplus_id,
            season_id=cal.get_season_id(year, month),
            verse_id=cal.get_verse_id(year),
            start_date=cal.format_date(start_d),
            end_date=cal.format_date(end_d),
            day_ids=day_ids,
            status="active",
        )
        await self.db.surplus_periods.insert_one(surplus.model_dump())
        return surplus

    async def ensure_day_exists(self, d: date) -> DayModel:
        """Ensure an individual calendar-day record exists and is linked to its parent hierarchy."""
        date_str = cal.format_date(d)
        doc = await self.db.days.find_one({"date_str": date_str})
        if doc:
            return DayModel(**doc)

        # Make sure parent entities exist
        await self.ensure_season_exists(d.year, d.month)
        period_type, period_id = cal.get_period_for_day(d)

        day = DayModel(
            date_str=date_str,
            period_type=period_type,
            period_id=period_id,
            season_id=cal.get_season_id(d.year, d.month),
            verse_id=cal.get_verse_id(d.year),
            status="active",
            is_bad_day=False,
            bad_day_reasons=[],
        )
        await self.db.days.insert_one(day.model_dump())
        return day

    async def get_active_quarter(self, target_date: Optional[date] = None) -> Optional[QuarterModel]:
        """Get the Quarter corresponding to target_date (or today_local)."""
        d = target_date or cal.today_local()
        period_type, period_id = cal.get_period_for_day(d)
        if period_type == "SURPLUS":
            # If currently in surplus, the last quarter was Q4
            period_id = cal.get_quarter_id(d.year, d.month, 4)
        doc = await self.db.quarters.find_one({"quarter_id": period_id})
        return QuarterModel(**doc) if doc else None

    async def get_day(self, date_str: str) -> Optional[DayModel]:
        doc = await self.db.days.find_one({"date_str": date_str})
        return DayModel(**doc) if doc else None

    async def close_day(self, date_str: str, is_bad: bool = False, reasons: Optional[List[str]] = None) -> bool:
        """Close a Day record deterministically."""
        res = await self.db.days.update_one(
            {"date_str": date_str},
            {
                "$set": {
                    "status": "closed",
                    "closure_completed": True,
                    "is_bad_day": is_bad,
                    "bad_day_reasons": reasons or [],
                    "closed_at": datetime.utcnow(),
                }
            },
        )
        return res.modified_count > 0

    async def close_quarter(self, quarter_id: str) -> bool:
        """Close a Quarter record."""
        res = await self.db.quarters.update_one(
            {"quarter_id": quarter_id},
            {"$set": {"status": "closed", "closed_at": datetime.utcnow()}},
        )
        return res.modified_count > 0

    async def close_season(self, season_id: str) -> bool:
        """Close a Season record."""
        res = await self.db.seasons.update_one(
            {"season_id": season_id},
            {"$set": {"status": "closed", "closed_at": datetime.utcnow()}},
        )
        return res.modified_count > 0

    async def close_verse(self, verse_id: str) -> bool:
        """Close a Verse record."""
        res = await self.db.verses.update_one(
            {"verse_id": verse_id},
            {"$set": {"status": "closed", "closed_at": datetime.utcnow()}},
        )
        return res.modified_count > 0


calendar_service = CalendarService()
