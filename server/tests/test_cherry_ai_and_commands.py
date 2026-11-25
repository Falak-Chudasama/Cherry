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


@pytest.mark.asyncio
async def test_agent_task_mutation_query_and_chat_persistence():
    from app.ai.services.action_executor import stage_quick_action, execute_staged_action
    from app.ai.services.query_executor import execute_db_query
    from app.services.task_service import task_service
    from app.core import calendar as cal

    today_d = cal.today_local()
    period_type, period_id = cal.get_period_for_day(today_d)
    created = await task_service.create_task(
        period_id=period_id,
        period_type=period_type,
        title="Amazon Assessment",
        tier="Must Do",
        status="Not started",
    )

    # 1. Stage marking existing task as Done (no DB mutation yet)
    staged = await stage_quick_action("Mark Amazon Assessment as done")
    assert staged["needs_clarification"] is False
    assert staged["actions"][0]["action_type"] == "update_task_status"
    assert staged["actions"][0]["parameters"]["status"] == "Done"

    # Persist chat message in db.chats and execute via /api/chat/actions/execute
    db = get_db()
    await db.chats.insert_one({
        "session_id": "test-sess-actions",
        "application": "cherry",
        "title": "Test Actions",
        "messages": [
            {
                "message_id": "msg-1",
                "role": "assistant",
                "content": "Ready",
                "card_type": "action_confirm",
                "card_data": staged,
            }
        ],
    })

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/chat/actions/execute", json={
            "action_id": staged["action_id"],
            "action_data": staged,
            "session_id": "test-sess-actions",
            "message_id": "msg-1",
        })
        assert r.status_code == 200
        assert r.json()["success"] is True

    # Verify task status changed and db.chats persisted card_data.status
    updated_task = await db.tasks.find_one({"task_id": created.task_id})
    assert updated_task["status"] == "Done"
    chat_doc = await db.chats.find_one({"session_id": "test-sess-actions"})
    assert chat_doc["messages"][0]["card_data"]["status"] == "executed"

    # 2. Query tasks in natural language
    q_res = await execute_db_query("What tasks do I have right now?")
    assert q_res["result_count"] >= 1
    assert any(t["title"] == "Amazon Assessment" for t in q_res["results"])

    # 3. Direct stage + execute delete_task
    staged_del = await stage_quick_action("Delete task Amazon Assessment")
    assert staged_del["needs_clarification"] is False
    if staged_del["actions"][0]["action_type"] == "delete_task":
        del_res = await execute_staged_action(staged_del)
        assert del_res["success"] is True
        assert await db.tasks.find_one({"task_id": created.task_id}) is None


@pytest.mark.asyncio
async def test_chat_stream_sse_query_with_datetimes():
    from app.services.task_service import task_service
    from app.core import calendar as cal

    today_d = cal.today_local()
    period_type, period_id = cal.get_period_for_day(today_d)
    await task_service.create_task(
        period_id=period_id,
        period_type=period_type,
        title="SSE Verification Task",
        tier="Must Do",
        status="Not started",
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/chat/stream", json={"content": "What tasks do I have right now?"})
        assert r.status_code == 200
        body = r.text
        assert "event: card" in body
        assert "SSE Verification Task" in body
        assert "event: done" in body



