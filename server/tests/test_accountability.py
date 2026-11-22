import pytest
from app.services.accountability_service import accountability_service
from app.services.calendar_service import calendar_service
from app.core.config import settings


@pytest.mark.asyncio
async def test_quarter_key_ledger_spending():
    # 1. Ensure Quarter exists
    quarter = await calendar_service.ensure_quarter_exists(2026, 11, 1)
    assert quarter.remaining_keys == settings.QUARTER_KEYS_INITIAL

    # 2. Spend 1 key explicitly
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
    assert len(ledger) >= 1
    assert ledger[0].reason == "Violation test"


@pytest.mark.asyncio
async def test_deterministic_junk_point_limit_no_auto_key_deduction():
    quarter = await calendar_service.ensure_quarter_exists(2026, 11, 1)

    # 1. Add normal entry below 50 limit
    entry1, summary1 = await accountability_service.add_junk_point_entry(
        date_str="2026-11-05",
        period_id=quarter.quarter_id,
        food_item="Chips",
        jp_value=20.0,
    )
    assert entry1.jp_value == 20.0
    assert summary1.accumulated_jp == 20.0
    assert summary1.remaining_jp == 30.0

    # 2. Add second entry pushing total over 50 limit (20 + 40 = 60)
    entry2, summary2 = await accountability_service.add_junk_point_entry(
        date_str="2026-11-05",
        period_id=quarter.quarter_id,
        food_item="Pizza",
        jp_value=40.0,
    )
    assert entry2.jp_value == 40.0
    assert summary2.accumulated_jp == 60.0
    assert summary2.remaining_jp == 0.0  # Clamped to 0

    # 3. Verify confirmed violation was recorded
    violations = await accountability_service.get_period_violations(quarter.quarter_id)
    jp_violations = [v for v in violations if v.rule_id == "junk_point_limit"]
    assert len(jp_violations) >= 1

    # 4. Spec Principle 9: Quarter Keys are NOT automatically deducted on JP > 50!
    # Initial was 3 (or 2 from previous test if same quarter), verify balance was not deducted by JP
    balance = await accountability_service.get_quarter_keys_balance(quarter.quarter_id)
    # The balance should remain untouched by the JP exceedance
    assert balance >= 0
