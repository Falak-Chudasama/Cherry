import pytest
from app.services.accountability_service import accountability_service
from app.services.calendar_service import calendar_service
from app.core.config import settings


@pytest.mark.asyncio
async def test_quarter_key_ledger_spending():
    # 1. Ensure Quarter exists
    quarter = await calendar_service.ensure_quarter_exists(2026, 11, 1)
    assert quarter.remaining_keys == 3

    # 2. Spend 1 key
    tx = await accountability_service.spend_quarter_key(
        quarter_id=quarter.quarter_id,
        date_str="2026-11-05",
        reason="Violation test",
    )

    assert tx.delta == -1
    assert tx.balance_after == 2

    # Verify balance in database
    balance = await accountability_service.get_quarter_keys_balance(quarter.quarter_id)
    assert balance == 2

    ledger = await accountability_service.get_quarter_key_ledger(quarter.quarter_id)
    assert len(ledger) == 1
    assert ledger[0].reason == "Violation test"


@pytest.mark.asyncio
async def test_deterministic_junk_point_limit():
    quarter = await calendar_service.ensure_quarter_exists(2026, 11, 1)

    # 1. Add normal entry below 50 limit: (base_score * portion_factor) + adjustments
    entry1, total1, exceeded1 = await accountability_service.add_junk_point_entry(
        date_str="2026-11-05",
        quarter_id=quarter.quarter_id,
        food_item="Chips",
        base_score=15.0,
        portion_factor=1.0,
        adjustments=5.0,
    )
    assert entry1.calculated_points == 20.0
    assert total1 == 20.0
    assert exceeded1 is False

    # 2. Add second entry pushing total over 50 limit (20 + 40 = 60)
    entry2, total2, exceeded2 = await accountability_service.add_junk_point_entry(
        date_str="2026-11-05",
        quarter_id=quarter.quarter_id,
        food_item="Pizza",
        base_score=20.0,
        portion_factor=2.0,
        adjustments=0.0,
    )
    assert entry2.calculated_points == 40.0
    assert total2 == 60.0
    assert exceeded2 is True  # 60 > 50 -> Exceeded limit!

    # Verify confirmed violation was automatically recorded and key was spent
    violations = await accountability_service.get_quarter_violations(quarter.quarter_id)
    assert len(violations) == 1
    assert violations[0].rule_name == "exceeded_junk_point_limit"
    assert violations[0].is_confirmed is True
    assert violations[0].quarter_key_spent is True

    balance = await accountability_service.get_quarter_keys_balance(quarter.quarter_id)
    assert balance == 2
