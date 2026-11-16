import pytest
from datetime import datetime, timedelta
from app.services.focus_service import focus_service
from app.models.focus_models import PomodoroSessionModel


@pytest.mark.asyncio
async def test_pomodoro_restart_reconstruction():
    # Insert an active session that started 75 minutes ago with planned 60 minutes
    now = datetime.utcnow()
    past_start = now - timedelta(minutes=75)

    session = PomodoroSessionModel(
        session_id="sess-offline-test",
        date_str="2026-11-15",
        planned_minutes=60,
        started_at=past_start,
        status="active",
        dns_enabled_by_session=True,
    )
    await focus_service.db.pomodoro_sessions.insert_one(session.model_dump())

    # Reconcile on startup
    await focus_service.reconcile_active_sessions_on_startup()

    # Verify session completed automatically
    doc = await focus_service.db.pomodoro_sessions.find_one({"session_id": "sess-offline-test"})
    assert doc is not None
    assert doc["status"] == "completed"
    assert "Completed during offline catch-up" in doc.get("outcome_notes", "")
