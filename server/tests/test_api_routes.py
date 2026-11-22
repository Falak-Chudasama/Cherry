import pytest
import httpx
from app.main import app


@pytest.mark.asyncio
async def test_hello_and_health_endpoints():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Hello
        r = await client.get("/")
        assert r.status_code == 200
        data = r.json()
        assert data["app"] == "Cherry"
        assert "🍒" in data["message"]

        # 2. System Health
        r = await client.get("/api/system/health")
        assert r.status_code == 200
        health = r.json()
        assert health["service"] == "cherry"
        assert "timezone" in health


@pytest.mark.asyncio
async def test_calendar_today_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/calendar/today")
        assert r.status_code == 200
        data = r.json()
        assert "day" in data
        assert "quarter" in data
        assert "season" in data
        assert "verse" in data

        season_id = data["season"]["season_id"]
        r_season = await client.get(f"/api/calendar/season/{season_id}/summary")
        assert r_season.status_code == 200
        s_data = r_season.json()
        assert s_data["season_id"] == season_id
        assert "periods" in s_data
        assert "totals" in s_data

        year = data["season"]["year"]
        r_verse = await client.get(f"/api/calendar/verse/{year}/summary")
        assert r_verse.status_code == 200
        v_data = r_verse.json()
        assert v_data["year"] == year
        assert len(v_data["months"]) == 12
        assert "totals" in v_data


@pytest.mark.asyncio
async def test_chat_message_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/chat/message", json={"content": "Hello Cherry!"})
        assert r.status_code == 200
        data = r.json()
        assert "reply" in data
        assert data["reply"]["role"] == "assistant"


@pytest.mark.asyncio
async def test_create_task_endpoints_and_payload_compatibility():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Exact payload from user screenshot
        user_payload = {
            "title": "Amazon Assessment",
            "description": "",
            "tier": "Must Do",
            "priority": "High",
            "status": "Not started",
            "period_id": "2026-11-Q4",
            "period_type": "Q4",
            "target_date": "2026-11-22",
            "start_day": 2,
            "end_day": 2,
            "scheduled_days": [2],
            "subtasks": [],
        }
        r1 = await client.post("/api/tasks", json=user_payload)
        assert r1.status_code == 200, f"Failed: {r1.text}"
        data1 = r1.json()
        assert data1["title"] == "Amazon Assessment"
        assert data1["period_id"] == "2026-11-Q4"
        assert data1["tier"] == "Must Do"
        assert data1["scheduled_days"] == [2]

        # 2. Legacy payload with quarter_id and category
        legacy_payload = {
            "quarter_id": "2026-11-Q4",
            "title": "Legacy Form Task",
            "category": "MUST",
            "description": "Created from legacy caller",
        }
        r2 = await client.post("/api/tasks", json=legacy_payload)
        assert r2.status_code == 200, f"Failed: {r2.text}"
        data2 = r2.json()
        assert data2["title"] == "Legacy Form Task"
        assert data2["period_id"] == "2026-11-Q4"
        assert data2["tier"] == "Must Do"

        # 3. Batch task creation
        batch_payload = {
            "tasks": [
                {
                    "title": "Batch 1",
                    "period_id": "2026-11-Q4",
                    "tier": "Must Do",
                },
                {
                    "title": "Batch 2",
                    "quarter_id": "2026-11-Q4",
                    "category": "SHOULD",
                },
            ]
        }
        r3 = await client.post("/api/tasks/batch", json=batch_payload)
        assert r3.status_code == 200, f"Failed: {r3.text}"
        data3 = r3.json()
        assert data3["created_count"] == 2

        # 4. Fetch period tasks
        r4 = await client.get("/api/tasks/period/2026-11-Q4")
        assert r4.status_code == 200
        tasks = r4.json()
        assert any(t["title"] == "Amazon Assessment" for t in tasks)
