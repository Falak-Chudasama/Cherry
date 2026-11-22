import pytest
import httpx
from app.main import app
from app.ai.grammars.intent_grammar import parse_intent
from app.ai.grammars.plan_grammar import validate_and_sanitize_plan
from app.ai.grammars.task_grammar import validate_and_sanitize_task
from app.ai.grammars.query_grammar import build_safe_query
from app.ai.services.intent_router import route_intent
from app.core.database import get_db


@pytest.mark.asyncio
async def test_intent_parsing_and_fallback():
    assert parse_intent('"make_plan"') == "make_plan"
    assert parse_intent('"create_task"') == "create_task"
    assert parse_intent('"db_query"') == "db_query"
    assert parse_intent('"quick_action"') == "quick_action"
    assert parse_intent('"chat"') == "chat"
    assert parse_intent('unknown') == "chat"


@pytest.mark.asyncio
async def test_plan_sanitizer():
    raw_json = '''{
        "quarter_goal": "Build Core Features",
        "deliverables": [
            {
                "title": "API Engine",
                "description": "FastAPI endpoints",
                "priority": "High",
                "subtasks": [
                    {"title": "Schema build", "start_day": 1, "end_day": 3},
                    {"title": "Route testing", "start_day": 4, "end_day": 7}
                ]
            }
        ]
    }'''
    plan = validate_and_sanitize_plan(raw_json)
    assert plan["quarter_goal"] == "Build Core Features"
    assert len(plan["deliverables"]) == 1
    assert plan["deliverables"][0]["title"] == "API Engine"
    assert len(plan["deliverables"][0]["subtasks"]) == 2
    assert plan["deliverables"][0]["subtasks"][0]["start_day"] == 1
    assert plan["deliverables"][0]["subtasks"][0]["end_day"] == 3


@pytest.mark.asyncio
async def test_task_sanitizer():
    raw_json = '''{
        "title": "Migrate Database",
        "description": "Clean collections",
        "priority": "Must",
        "period_type": "Q2",
        "subtasks": [
            {"title": "Index check", "start_day": 1, "end_day": 2}
        ]
    }'''
    task = validate_and_sanitize_task(raw_json, default_period="Q1")
    assert task["title"] == "Migrate Database"
    assert task["priority"] == "Must"
    assert task["period_type"] == "Q2"
    assert len(task["subtasks"]) == 1


@pytest.mark.asyncio
async def test_query_sanitizer():
    raw_json = '''{
        "collection": "tasks",
        "query": "build",
        "status": "In progress",
        "limit": 5
    }'''
    q = build_safe_query(raw_json)
    assert q["collection"] == "tasks"
    assert q["limit"] == 5
    assert q["filter"]["status"] == "In progress"


@pytest.mark.asyncio
async def test_commands_crud_and_sync():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a command
        r = await client.post("/api/commands", json={
            "name": "Concise Responses",
            "content": "Keep all status diagnostics in markdown tables.",
            "is_active": True,
        })
        assert r.status_code == 200
        cmd = r.json()
        cmd_id = cmd["command_id"]
        assert cmd["name"] == "Concise Responses"
        assert cmd["application"] == "cherry"

        # 2. List commands
        r = await client.get("/api/commands")
        assert r.status_code == 200
        cmds = r.json()
        assert any(c["command_id"] == cmd_id for c in cmds)

        # 3. Update command
        r = await client.put(f"/api/commands/{cmd_id}", json={"is_active": False})
        assert r.status_code == 200
        updated = r.json()
        assert updated["is_active"] is False

        # 4. Delete command
        r = await client.delete(f"/api/commands/{cmd_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] is True


@pytest.mark.asyncio
async def test_task_list_sanitizer_and_batch_creation():
    from app.ai.grammars.task_list_grammar import validate_and_sanitize_task_list
    raw_json = '''{
        "tasks": [
            {
                "title": "Finish OS Notes",
                "tier": "Must Do",
                "priority": "High",
                "subtasks": [
                    {"title": "Paging review", "start_day": 1, "end_day": 3}
                ]
            },
            {
                "title": "Review Graphs",
                "tier": "Should Do",
                "priority": "Normal",
                "subtasks": [
                    {"title": "Dijkstra practice", "start_day": 4, "end_day": 6}
                ]
            }
        ]
    }'''
    res = validate_and_sanitize_task_list(raw_json, default_period="2026-11-Q4", default_period_type="Q4")
    assert len(res["tasks"]) == 2
    assert res["tasks"][0]["title"] == "Finish OS Notes"
    assert res["tasks"][0]["tier"] == "Must Do"
    assert res["tasks"][1]["title"] == "Review Graphs"
    assert res["tasks"][1]["tier"] == "Should Do"

    # Test batch creation endpoint
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/tasks/batch", json={"tasks": res["tasks"]})
        assert r.status_code == 200
        data = r.json()
        assert data["created_count"] == 2
        assert len(data["tasks"]) == 2
        assert data["tasks"][0]["tier"] == "Must Do"

