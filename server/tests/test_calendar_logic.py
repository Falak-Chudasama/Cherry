import pytest
from datetime import date
from app.core.calendar import (
    get_days_in_month,
    get_period_for_day,
    get_quarter_date_range,
    get_quarter_dates,
    get_surplus_date_range,
    get_surplus_dates,
    get_season_date_range,
    is_quarter_closing_day,
    is_season_closing_day,
    is_verse_closing_day,
    get_season_name,
    get_quarter_id,
    get_surplus_id,
)


def test_days_in_month_edge_cases():
    # Feb leap year
    assert get_days_in_month(2024, 2) == 29
    # Feb non-leap
    assert get_days_in_month(2026, 2) == 28
    # 30-day month
    assert get_days_in_month(2026, 11) == 30
    assert get_days_in_month(2026, 4) == 30
    # 31-day month
    assert get_days_in_month(2026, 10) == 31
    assert get_days_in_month(2026, 12) == 31


def test_quarter_boundaries():
    # Test Q1: 1-7
    q1_dates = get_quarter_dates(2026, 11, 1)
    assert len(q1_dates) == 7
    assert q1_dates[0] == date(2026, 11, 1)
    assert q1_dates[-1] == date(2026, 11, 7)

    # Test Q2: 8-14
    q2_dates = get_quarter_dates(2026, 11, 2)
    assert len(q2_dates) == 7
    assert q2_dates[0] == date(2026, 11, 8)
    assert q2_dates[-1] == date(2026, 11, 14)

    # Test Q3: 15-21
    q3_dates = get_quarter_dates(2026, 11, 3)
    assert len(q3_dates) == 7
    assert q3_dates[0] == date(2026, 11, 15)
    assert q3_dates[-1] == date(2026, 11, 21)

    # Test Q4: 22-28
    q4_dates = get_quarter_dates(2026, 11, 4)
    assert len(q4_dates) == 7
    assert q4_dates[0] == date(2026, 11, 22)
    assert q4_dates[-1] == date(2026, 11, 28)


def test_surplus_period():
    # 28-day February: NO surplus period
    assert get_surplus_date_range(2026, 2) is None
    assert get_surplus_dates(2026, 2) == []

    # 29-day February: day 29 only
    surplus_2024_feb = get_surplus_dates(2024, 2)
    assert len(surplus_2024_feb) == 1
    assert surplus_2024_feb[0] == date(2024, 2, 29)

    # 30-day November: days 29, 30
    surplus_nov = get_surplus_dates(2026, 11)
    assert len(surplus_nov) == 2
    assert surplus_nov[0] == date(2026, 11, 29)
    assert surplus_nov[1] == date(2026, 11, 30)

    # 31-day December: days 29, 30, 31
    surplus_dec = get_surplus_dates(2026, 12)
    assert len(surplus_dec) == 3
    assert surplus_dec[0] == date(2026, 11, 29).replace(month=12)
    assert surplus_dec[-1] == date(2026, 12, 31)


def test_period_for_day_mapping():
    # Q1
    period_type, p_id = get_period_for_day(date(2026, 11, 1))
    assert period_type == "Q1"
    assert p_id == "2026-11-Q1"

    period_type, p_id = get_period_for_day(date(2026, 11, 7))
    assert period_type == "Q1"

    # Q2
    period_type, p_id = get_period_for_day(date(2026, 11, 8))
    assert period_type == "Q2"
    assert p_id == "2026-11-Q2"

    period_type, p_id = get_period_for_day(date(2026, 11, 14))
    assert period_type == "Q2"

    # Q3
    period_type, p_id = get_period_for_day(date(2026, 11, 15))
    assert period_type == "Q3"
    assert p_id == "2026-11-Q3"

    period_type, p_id = get_period_for_day(date(2026, 11, 21))
    assert period_type == "Q3"

    # Q4
    period_type, p_id = get_period_for_day(date(2026, 11, 22))
    assert period_type == "Q4"
    assert p_id == "2026-11-Q4"

    period_type, p_id = get_period_for_day(date(2026, 11, 28))
    assert period_type == "Q4"

    # Surplus
    period_type, p_id = get_period_for_day(date(2026, 11, 29))
    assert period_type == "SURPLUS"
    assert p_id == "2026-11-SURPLUS"

    period_type, p_id = get_period_for_day(date(2026, 11, 30))
    assert period_type == "SURPLUS"


def test_closing_indicators():
    assert is_quarter_closing_day(date(2026, 11, 7)) is True
    assert is_quarter_closing_day(date(2026, 11, 14)) is True
    assert is_quarter_closing_day(date(2026, 11, 21)) is True
    assert is_quarter_closing_day(date(2026, 11, 28)) is True
    assert is_quarter_closing_day(date(2026, 11, 29)) is False

    assert is_season_closing_day(date(2026, 11, 30)) is True
    assert is_season_closing_day(date(2026, 11, 29)) is False
    assert is_season_closing_day(date(2026, 2, 28)) is True
    assert is_season_closing_day(date(2024, 2, 29)) is True

    assert is_verse_closing_day(date(2026, 12, 31)) is True
    assert is_verse_closing_day(date(2026, 11, 30)) is False
