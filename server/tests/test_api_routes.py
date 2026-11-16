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


@pytest.mark.asyncio
async def test_chat_message_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/chat/message", json={"content": "Hello Cherry!"})
        assert r.status_code == 200
        data = r.json()
        assert "reply" in data
        assert data["reply"]["role"] == "assistant"
