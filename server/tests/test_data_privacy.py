import pytest
from app.services.feedback_service import feedback_service
from app.services.calendar_service import calendar_service
from app.core import calendar as cal


@pytest.mark.asyncio
async def test_zero_raw_lemon_persistence(monkeypatch):
    """
    Verify that raw Lemon event payloads (such as browsing history, tabs, video titles)
    are NOT stored in Cherry database collections.
    """
    await calendar_service.ensure_day_exists(cal.parse_date("2026-11-15"))

    # Mock Lemon returning raw payload
    raw_lemon = {
        "total_active_seconds": 7200.0,
        "productive_seconds": 5400.0,
        "entertainment_seconds": 1800.0,
        "context_switches": 15,
        "longest_focus_seconds": 2400.0,
        "raw_browsing_events": [{"url": "https://secret.com/page", "title": "Secret Page"}],
        "raw_window_transitions": [{"window": "Private Document - Word"}],
    }

    async def mock_lemon_summary(d):
        return raw_lemon

    async def mock_ai_none(*args, **kwargs):
        return None

    monkeypatch.setattr("app.services.feedback_service.lemon_adapter.get_activity_summary", mock_lemon_summary)
    monkeypatch.setattr("app.services.feedback_service.basket_adapter.chat_completion", mock_ai_none)

    summary = await feedback_service.generate_daily_feedback("2026-11-15")

    # Fetch stored document directly from MongoDB
    stored_doc = await feedback_service.db.daily_summaries.find_one({"date_str": "2026-11-15"})
    assert stored_doc is not None

    # Assert raw event arrays do NOT exist anywhere in the saved summary
    assert "raw_browsing_events" not in stored_doc
    assert "raw_window_transitions" not in stored_doc
    assert "secret.com" not in str(stored_doc)
    assert "Private Document" not in str(stored_doc)

    # Assert derived metrics are present
    assert "metrics" in stored_doc
    assert stored_doc["metrics"]["productive_seconds"] == 5400.0
