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
