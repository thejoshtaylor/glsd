"""Trigger REST endpoint tests for M006."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Trigger
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email, random_lower_string

BASE = settings.API_V1_STR


def _make_project(client: TestClient, headers: dict) -> str:
    resp = client.post(
        f"{BASE}/projects",
        headers=headers,
        json={"name": random_lower_string(), "cwd": "/tmp/test"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _make_trigger(client: TestClient, headers: dict, project_id: str) -> dict:
    resp = client.post(
        f"{BASE}/projects/{project_id}/triggers",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "test-trigger",
            "event_type": "push",
            "enabled": True,
            "cooldown_seconds": 0,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_trigger(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    data = _make_trigger(client, superuser_token_headers, project_id)

    assert data["project_id"] == project_id
    assert data["name"] == "test-trigger"
    assert data["event_type"] == "push"
    assert data["enabled"] is True
    assert data["cooldown_seconds"] == 0
    assert "id" in data


def test_list_triggers(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    _make_trigger(client, superuser_token_headers, project_id)
    _make_trigger(client, superuser_token_headers, project_id)

    resp = client.get(
        f"{BASE}/projects/{project_id}/triggers",
        headers=superuser_token_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] >= 2
    assert len(data["data"]) >= 2


def test_get_trigger(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    trigger = _make_trigger(client, superuser_token_headers, project_id)
    trigger_id = trigger["id"]

    resp = client.get(f"{BASE}/triggers/{trigger_id}", headers=superuser_token_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == trigger_id
    assert data["name"] == "test-trigger"
    assert data["project_id"] == project_id


def test_update_trigger(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    trigger = _make_trigger(client, superuser_token_headers, project_id)
    trigger_id = trigger["id"]

    resp = client.patch(
        f"{BASE}/triggers/{trigger_id}",
        headers=superuser_token_headers,
        json={"enabled": False},
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


def test_add_chain_and_action(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    trigger = _make_trigger(client, superuser_token_headers, project_id)
    trigger_id = trigger["id"]

    # Create chain
    chain_resp = client.post(
        f"{BASE}/triggers/{trigger_id}/chains",
        headers=superuser_token_headers,
        json={"trigger_id": trigger_id, "name": "main-chain", "display_order": 0},
    )
    assert chain_resp.status_code == 201, chain_resp.text
    chain = chain_resp.json()
    chain_id = chain["id"]
    assert chain["trigger_id"] == trigger_id
    assert chain["name"] == "main-chain"

    # Create action on chain
    action_resp = client.post(
        f"{BASE}/chains/{chain_id}/actions",
        headers=superuser_token_headers,
        json={
            "chain_id": chain_id,
            "action_type": "run_command",
            "config": {"cmd": "echo hi"},
            "sequence_order": 0,
        },
    )
    assert action_resp.status_code == 201, action_resp.text
    action = action_resp.json()
    assert action["chain_id"] == chain_id
    assert action["action_type"] == "run_command"

    # List actions
    list_resp = client.get(
        f"{BASE}/chains/{chain_id}/actions",
        headers=superuser_token_headers,
    )
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["count"] == 1
    assert list_data["data"][0]["id"] == action["id"]


def test_list_executions_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    trigger = _make_trigger(client, superuser_token_headers, project_id)
    trigger_id = trigger["id"]

    resp = client.get(
        f"{BASE}/triggers/{trigger_id}/executions",
        headers=superuser_token_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert data["data"] == []


def test_delete_trigger(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    trigger = _make_trigger(client, superuser_token_headers, project_id)
    trigger_id = trigger["id"]

    del_resp = client.delete(
        f"{BASE}/triggers/{trigger_id}", headers=superuser_token_headers
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["message"] == "Trigger deleted"

    get_resp = client.get(
        f"{BASE}/triggers/{trigger_id}", headers=superuser_token_headers
    )
    assert get_resp.status_code in (403, 404)


def test_ownership_403(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    # Owner creates a trigger
    project_id = _make_project(client, superuser_token_headers)
    trigger = _make_trigger(client, superuser_token_headers, project_id)
    trigger_id = trigger["id"]

    # Second user tries to access it
    other_email = random_email()
    other_headers = authentication_token_from_email(
        client=client, email=other_email, db=db
    )

    get_resp = client.get(f"{BASE}/triggers/{trigger_id}", headers=other_headers)
    assert get_resp.status_code == 403

    del_resp = client.delete(f"{BASE}/triggers/{trigger_id}", headers=other_headers)
    assert del_resp.status_code == 403


# --- fire-test and evaluator tests (M006 S02 T05) ---


def _make_trigger_with_chain(
    client: TestClient, headers: dict, project_id: str
) -> tuple[str, str, str]:
    """Create trigger + chain + run_bash action; return (trigger_id, chain_id, action_id)."""
    t_resp = client.post(
        f"{BASE}/projects/{project_id}/triggers",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "fire-test-trigger",
            "event_type": "taskComplete",
            "enabled": True,
            "cooldown_seconds": 0,
        },
    )
    assert t_resp.status_code == 201, t_resp.text
    trigger_id = t_resp.json()["id"]

    c_resp = client.post(
        f"{BASE}/triggers/{trigger_id}/chains",
        headers=headers,
        json={"trigger_id": trigger_id, "name": "main", "display_order": 0},
    )
    assert c_resp.status_code == 201, c_resp.text
    chain_id = c_resp.json()["id"]

    a_resp = client.post(
        f"{BASE}/chains/{chain_id}/actions",
        headers=headers,
        json={
            "chain_id": chain_id,
            "action_type": "run_bash",
            "config": {"cmd": "echo hello"},
            "sequence_order": 0,
        },
    )
    assert a_resp.status_code == 201, a_resp.text
    return trigger_id, chain_id, a_resp.json()["id"]


def test_fire_test_run_bash(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    trigger_id, _, _ = _make_trigger_with_chain(client, superuser_token_headers, project_id)

    with (
        patch(
            "app.api.routes.triggers._get_primary_machine_id",
            return_value="test-machine-id",
        ),
        patch(
            "app.api.routes.triggers.manager.is_node_online",
            return_value=True,
        ),
        patch(
            "app.triggers.executor.run_action",
            new_callable=AsyncMock,
            return_value={"ok": True, "output": "hello\n"},
        ),
    ):
        resp = client.post(
            f"{BASE}/triggers/{trigger_id}/fire-test",
            headers=superuser_token_headers,
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "status" in data
    assert data["chain_results"] is not None
    assert len(data["chain_results"]) > 0


def test_fire_test_disabled_trigger(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    t_resp = client.post(
        f"{BASE}/projects/{project_id}/triggers",
        headers=superuser_token_headers,
        json={
            "project_id": project_id,
            "name": "disabled-trigger",
            "event_type": "taskComplete",
            "enabled": False,
            "cooldown_seconds": 0,
        },
    )
    assert t_resp.status_code == 201, t_resp.text
    trigger_id = t_resp.json()["id"]

    # Even with a valid node, a disabled trigger yields no TriggerExecution → 422
    with (
        patch(
            "app.api.routes.triggers._get_primary_machine_id",
            return_value="test-machine-id",
        ),
        patch(
            "app.api.routes.triggers.manager.is_node_online",
            return_value=True,
        ),
    ):
        resp = client.post(
            f"{BASE}/triggers/{trigger_id}/fire-test",
            headers=superuser_token_headers,
        )

    assert resp.status_code == 422, resp.text


def test_evaluator_cooldown(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    from app.triggers.evaluator import evaluate_triggers

    project_id = _make_project(client, superuser_token_headers)
    t_resp = client.post(
        f"{BASE}/projects/{project_id}/triggers",
        headers=superuser_token_headers,
        json={
            "project_id": project_id,
            "name": "cooldown-trigger",
            "event_type": "cooldown_event",
            "enabled": True,
            "cooldown_seconds": 60,
        },
    )
    assert t_resp.status_code == 201, t_resp.text
    trigger_id = t_resp.json()["id"]

    # Set last_fired_at to 10 seconds ago (within the 60s cooldown window)
    trigger_row = db.get(Trigger, uuid.UUID(trigger_id))
    assert trigger_row is not None
    trigger_row.last_fired_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    db.add(trigger_row)
    db.commit()

    asyncio.run(
        evaluate_triggers(
            session_id=None,
            event_type="cooldown_event",
            event_payload={},
            project_id=uuid.UUID(project_id),
        )
    )

    # Verify no TriggerExecution was created (cooldown blocked the fire)
    exec_resp = client.get(
        f"{BASE}/triggers/{trigger_id}/executions",
        headers=superuser_token_headers,
    )
    assert exec_resp.status_code == 200
    assert exec_resp.json()["count"] == 0, "Expected 0 executions — cooldown should have blocked"


def test_fire_test_no_primary_node(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    project_id = _make_project(client, superuser_token_headers)
    trigger = _make_trigger(client, superuser_token_headers, project_id)
    trigger_id = trigger["id"]

    with patch(
        "app.api.routes.triggers._get_primary_machine_id",
        return_value=None,
    ):
        resp = client.post(
            f"{BASE}/triggers/{trigger_id}/fire-test",
            headers=superuser_token_headers,
        )

    assert resp.status_code == 422, resp.text
    assert "primary node" in resp.json()["detail"].lower()


# --- parallel chains outcome + stop-on-first-failure tests (M006 S03 T01) ---


def _make_trigger_two_chains(
    client: TestClient, headers: dict, project_id: str
) -> tuple[str, str, str]:
    """Create trigger with chain A (echo ok) and chain B (fail cmd); return (trigger_id, chain_a_id, chain_b_id)."""
    t_resp = client.post(
        f"{BASE}/projects/{project_id}/triggers",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "two-chain-trigger",
            "event_type": "taskComplete",
            "enabled": True,
            "cooldown_seconds": 0,
        },
    )
    assert t_resp.status_code == 201, t_resp.text
    trigger_id = t_resp.json()["id"]

    ca_resp = client.post(
        f"{BASE}/triggers/{trigger_id}/chains",
        headers=headers,
        json={"trigger_id": trigger_id, "name": "chain-a", "display_order": 0},
    )
    assert ca_resp.status_code == 201, ca_resp.text
    chain_a_id = ca_resp.json()["id"]

    client.post(
        f"{BASE}/chains/{chain_a_id}/actions",
        headers=headers,
        json={"chain_id": chain_a_id, "action_type": "run_bash", "config": {"cmd": "echo ok"}, "sequence_order": 0},
    )

    cb_resp = client.post(
        f"{BASE}/triggers/{trigger_id}/chains",
        headers=headers,
        json={"trigger_id": trigger_id, "name": "chain-b", "display_order": 1},
    )
    assert cb_resp.status_code == 201, cb_resp.text
    chain_b_id = cb_resp.json()["id"]

    client.post(
        f"{BASE}/chains/{chain_b_id}/actions",
        headers=headers,
        json={"chain_id": chain_b_id, "action_type": "run_bash", "config": {"cmd": "fail"}, "sequence_order": 0},
    )

    return trigger_id, chain_a_id, chain_b_id


async def _selective_run_action(action, project_id, event_payload):
    if "fail" in action.config.get("cmd", ""):
        return {"ok": False, "error": "exit code 1"}
    return {"ok": True, "output": "ok"}


def test_parallel_chains_partial_status(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Chain A succeeds, chain B fails → overall status PARTIAL."""
    from app.triggers.evaluator import evaluate_triggers

    project_id = _make_project(client, superuser_token_headers)
    trigger_id, _, _ = _make_trigger_two_chains(client, superuser_token_headers, project_id)

    with patch("app.triggers.evaluator.run_action", side_effect=_selective_run_action):
        asyncio.run(
            evaluate_triggers(
                session_id=None,
                event_type="taskComplete",
                event_payload={},
                project_id=uuid.UUID(project_id),
            )
        )

    exec_resp = client.get(
        f"{BASE}/triggers/{trigger_id}/executions",
        headers=superuser_token_headers,
    )
    assert exec_resp.status_code == 200
    data = exec_resp.json()
    assert data["count"] == 1
    execution = data["data"][0]
    assert execution["status"] == "PARTIAL"
    chain_results = execution["chain_results"]
    # Keys are 0-based string indices
    assert "0" in chain_results and "1" in chain_results
    assert chain_results["0"]["ok"] is True
    assert chain_results["1"]["ok"] is False


def test_parallel_chains_all_success(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Both chains succeed → overall status SUCCESS."""
    from app.triggers.evaluator import evaluate_triggers

    project_id = _make_project(client, superuser_token_headers)
    trigger_id, _, _ = _make_trigger_two_chains(client, superuser_token_headers, project_id)

    with patch(
        "app.triggers.evaluator.run_action",
        new_callable=AsyncMock,
        return_value={"ok": True, "output": "ok"},
    ):
        asyncio.run(
            evaluate_triggers(
                session_id=None,
                event_type="taskComplete",
                event_payload={},
                project_id=uuid.UUID(project_id),
            )
        )

    exec_resp = client.get(
        f"{BASE}/triggers/{trigger_id}/executions",
        headers=superuser_token_headers,
    )
    assert exec_resp.status_code == 200
    execution = exec_resp.json()["data"][0]
    assert execution["status"] == "SUCCESS"
    assert execution["chain_results"]["0"]["ok"] is True
    assert execution["chain_results"]["1"]["ok"] is True


def test_parallel_chains_all_failed(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Both chains fail → overall status FAILED."""
    from app.triggers.evaluator import evaluate_triggers

    project_id = _make_project(client, superuser_token_headers)
    trigger_id, _, _ = _make_trigger_two_chains(client, superuser_token_headers, project_id)

    with patch(
        "app.triggers.evaluator.run_action",
        new_callable=AsyncMock,
        return_value={"ok": False, "error": "exit code 1"},
    ):
        asyncio.run(
            evaluate_triggers(
                session_id=None,
                event_type="taskComplete",
                event_payload={},
                project_id=uuid.UUID(project_id),
            )
        )

    exec_resp = client.get(
        f"{BASE}/triggers/{trigger_id}/executions",
        headers=superuser_token_headers,
    )
    assert exec_resp.status_code == 200
    execution = exec_resp.json()["data"][0]
    assert execution["status"] == "FAILED"
    assert execution["chain_results"]["0"]["ok"] is False
    assert execution["chain_results"]["1"]["ok"] is False


def test_stop_on_first_failed_action(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Chain with 2 actions where action 0 fails → run_action called exactly once."""
    from app.triggers.evaluator import evaluate_triggers

    project_id = _make_project(client, superuser_token_headers)
    t_resp = client.post(
        f"{BASE}/projects/{project_id}/triggers",
        headers=superuser_token_headers,
        json={
            "project_id": project_id,
            "name": "stop-on-fail-trigger",
            "event_type": "taskComplete",
            "enabled": True,
            "cooldown_seconds": 0,
        },
    )
    assert t_resp.status_code == 201, t_resp.text
    trigger_id = t_resp.json()["id"]

    c_resp = client.post(
        f"{BASE}/triggers/{trigger_id}/chains",
        headers=superuser_token_headers,
        json={"trigger_id": trigger_id, "name": "two-action-chain", "display_order": 0},
    )
    assert c_resp.status_code == 201, c_resp.text
    chain_id = c_resp.json()["id"]

    # Action 0 will fail
    client.post(
        f"{BASE}/chains/{chain_id}/actions",
        headers=superuser_token_headers,
        json={"chain_id": chain_id, "action_type": "run_bash", "config": {"cmd": "fail"}, "sequence_order": 0},
    )
    # Action 1 should never run
    client.post(
        f"{BASE}/chains/{chain_id}/actions",
        headers=superuser_token_headers,
        json={"chain_id": chain_id, "action_type": "run_bash", "config": {"cmd": "echo second"}, "sequence_order": 1},
    )

    mock = AsyncMock(return_value={"ok": False, "error": "exit code 1"})
    with patch("app.triggers.evaluator.run_action", mock):
        asyncio.run(
            evaluate_triggers(
                session_id=None,
                event_type="taskComplete",
                event_payload={},
                project_id=uuid.UUID(project_id),
            )
        )

    assert mock.call_count == 1, f"Expected 1 run_action call, got {mock.call_count}"


def test_get_executions_with_populated_data(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """After firing evaluator, GET /executions returns all JSONB fields populated."""
    from app.triggers.evaluator import evaluate_triggers

    project_id = _make_project(client, superuser_token_headers)
    trigger_id, _, _ = _make_trigger_with_chain(client, superuser_token_headers, project_id)

    with patch(
        "app.triggers.evaluator.run_action",
        new_callable=AsyncMock,
        return_value={"ok": True, "output": "hello\n"},
    ):
        asyncio.run(
            evaluate_triggers(
                session_id=None,
                event_type="taskComplete",
                event_payload={"key": "value"},
                project_id=uuid.UUID(project_id),
            )
        )

    exec_resp = client.get(
        f"{BASE}/triggers/{trigger_id}/executions",
        headers=superuser_token_headers,
    )
    assert exec_resp.status_code == 200
    data = exec_resp.json()
    assert data["count"] == 1
    execution = data["data"][0]
    assert execution["status"] is not None
    assert execution["chain_results"] is not None
    assert execution["fired_at"] is not None
    assert execution["event_payload"] is not None
    assert execution["event_payload"] == {"key": "value"}


# ---------------------------------------------------------------------------
# R033: non-blocking evaluator dispatch
# ---------------------------------------------------------------------------

import time  # noqa: E402 — imported here to avoid polluting the top-level ns


async def _slow_evaluator(*args, **kwargs):
    await asyncio.sleep(2)


async def _run_nonblocking_check():
    t0 = time.monotonic()
    task = asyncio.create_task(_slow_evaluator())
    elapsed = time.monotonic() - t0
    assert elapsed < 0.5, f"create_task blocked for {elapsed:.2f}s"
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def test_evaluator_nonblocking():
    """asyncio.create_task returns immediately even when the coroutine sleeps 2s."""
    asyncio.run(_run_nonblocking_check())
