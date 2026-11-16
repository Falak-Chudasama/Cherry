import pytest
from app.adapters.lemon_adapter import LemonAdapter


@pytest.mark.asyncio
async def test_lemon_dns_blackout_rejection(monkeypatch):
    adapter = LemonAdapter()

    # Simulate Lemon rejecting disable during Blackout
    blackout_payload = {
        "success": False,
        "dns_enabled": True,
        "reason": "BLACKOUT_ACTIVE",
        "message": "DNS protection cannot be disabled during Blackout.",
        "blackout": {
            "active": True,
            "start": "23:00",
            "end": "06:00",
        },
    }

    class MockResponse:
        status_code = 200
        def json(self):
            return blackout_payload

    async def mock_post(url, *args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(adapter.client, "post", mock_post)

    result = await adapter.disable_dns()
    assert result["success"] is False
    assert result["reason"] == "BLACKOUT_ACTIVE"
    assert result["dns_enabled"] is True


@pytest.mark.asyncio
async def test_lemon_quarantine_contract(monkeypatch):
    adapter = LemonAdapter()

    created_quarantine = {
        "id": 1,
        "target_type": "DOMAIN",
        "target_value": "distraction.com",
        "duration_minutes": 120,
        "is_active": True,
    }

    class MockResponse:
        status_code = 201
        def json(self):
            return created_quarantine

    async def mock_post(url, *args, **kwargs):
        return MockResponse()

    monkeypatch.setattr(adapter.client, "post", mock_post)

    res = await adapter.create_quarantine("distraction.com", 120)
    assert res["success"] is True
    assert res["data"]["target_value"] == "distraction.com"
