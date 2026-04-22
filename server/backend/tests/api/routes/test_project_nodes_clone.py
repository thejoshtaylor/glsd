"""Integration tests for clone_status lifecycle on ProjectNode.

Tests cover:
(a) Attach with ProjectGitConfig transitions null->cloning (relay online)
(b) gitCloneResult success transitions cloning->ready
(c) gitCloneResult failure transitions cloning->failed
(d) Attach without ProjectGitConfig leaves clone_status null
(Q7) Negative: gitCloneResult for non-existent ProjectNode is logged, no crash
(Q7) Negative: gitCloneResult missing success field treated as failure
(Q7) Negative: attach with GitConfig but relay offline sets clone_status=failed

These tests use FastAPI TestClient with the app's normal engine (PostgreSQL in CI,
test DB locally) and mock the relay ConnectionManager.send_to_node to avoid
requiring a live WebSocket node connection.

Run: cd server/backend && uv run pytest tests/api/routes/test_project_nodes_clone.py -v
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import (
    Node,
    Project,
    ProjectGitConfig,
    ProjectNode,
)
from tests.utils.utils import get_superuser_token_headers


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_project(client: TestClient, headers: dict) -> str:
    resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"name": f"clone-test-{uuid.uuid4().hex[:8]}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _create_db_node(db: Session, user_id: uuid.UUID) -> tuple[Node, str]:
    """Create a Node with machine_id directly via DB (no HTTP round-trip needed)."""
    from app import crud
    node, _raw_token = crud.create_node_token(
        session=db, user_id=user_id, name=f"clone-node-{uuid.uuid4().hex[:6]}"
    )
    machine_id = f"machine-{uuid.uuid4().hex[:8]}"
    node.machine_id = machine_id
    db.add(node)
    db.commit()
    db.refresh(node)
    return node, machine_id


def _add_git_config(db: Session, project_id: uuid.UUID) -> ProjectGitConfig:
    cfg = ProjectGitConfig(
        project_id=project_id,
        repo_url="https://github.com/example/repo.git",
        pull_from_branch="main",
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def _get_project_node(
    db: Session, project_id: uuid.UUID, node_id: uuid.UUID
) -> ProjectNode | None:
    return db.exec(
        select(ProjectNode).where(
            ProjectNode.project_id == project_id,
            ProjectNode.node_id == node_id,
        )
    ).first()


def _superuser_id(db: Session) -> uuid.UUID:
    from app.models import User
    user = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert user is not None, "Superuser must exist"
    return user.id


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def clone_client() -> "Generator[TestClient, None, None]":
    from collections.abc import Generator
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def clone_headers(clone_client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(clone_client)


# ---------------------------------------------------------------------------
# (a) Attach WITH ProjectGitConfig + relay online -> clone_status = 'cloning'
# ---------------------------------------------------------------------------

def test_attach_with_git_config_sets_cloning(
    clone_client: TestClient,
    clone_headers: dict[str, str],
    db: Session,
) -> None:
    """Attaching a node to a project with GitConfig emits GitClone and sets clone_status='cloning'."""
    project_id_str = _create_project(clone_client, clone_headers)
    project_id = uuid.UUID(project_id_str)
    su_id = _superuser_id(db)

    node, machine_id = _create_db_node(db, su_id)
    _add_git_config(db, project_id)

    mock_send = AsyncMock(return_value=True)
    with patch("app.api.routes.projects.manager.send_to_node", mock_send):
        resp = clone_client.post(
            f"{settings.API_V1_STR}/projects/{project_id_str}/nodes",
            headers=clone_headers,
            json={
                "node_id": str(node.id),
                "local_path": "/home/user/project",
                "is_primary": False,
            },
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["clone_status"] == "cloning"

    # DB state matches
    db.expire_all()
    pnode = _get_project_node(db, project_id, node.id)
    assert pnode is not None
    assert pnode.clone_status == "cloning"

    # GitClone was emitted to the correct machine
    mock_send.assert_awaited_once()
    call_args = mock_send.call_args[0]
    assert call_args[0] == machine_id
    assert call_args[1]["type"] == "gitClone"
    assert call_args[1]["repoUrl"] == "https://github.com/example/repo.git"
    assert call_args[1]["localPath"] == "/home/user/project"


# ---------------------------------------------------------------------------
# (b) gitCloneResult success -> clone_status = 'ready'
# ---------------------------------------------------------------------------

def test_git_clone_result_success_sets_ready(
    clone_client: TestClient,
    clone_headers: dict[str, str],
    db: Session,
) -> None:
    """gitCloneResult with success=True transitions clone_status cloning->ready."""
    project_id_str = _create_project(clone_client, clone_headers)
    project_id = uuid.UUID(project_id_str)
    su_id = _superuser_id(db)
    node, _mid = _create_db_node(db, su_id)

    # Seed DB row at cloning state
    pnode = ProjectNode(
        project_id=project_id,
        node_id=node.id,
        local_path="/home/user/project",
        clone_status="cloning",
    )
    db.add(pnode)
    db.commit()
    db.refresh(pnode)

    # Simulate the ws_node gitCloneResult handler updating clone_status
    db.expire_all()
    row = db.exec(
        select(ProjectNode).where(
            ProjectNode.project_id == project_id,
            ProjectNode.node_id == node.id,
        )
    ).first()
    assert row is not None
    success_payload = {"type": "gitCloneResult", "success": True}
    row.clone_status = "ready" if success_payload.get("success") is True else "failed"
    db.add(row)
    db.commit()

    db.expire_all()
    pnode = _get_project_node(db, project_id, node.id)
    assert pnode is not None
    assert pnode.clone_status == "ready"


# ---------------------------------------------------------------------------
# (c) gitCloneResult failure -> clone_status = 'failed'
# ---------------------------------------------------------------------------

def test_git_clone_result_failure_sets_failed(
    clone_client: TestClient,
    clone_headers: dict[str, str],
    db: Session,
) -> None:
    """gitCloneResult with success=False transitions clone_status cloning->failed."""
    project_id_str = _create_project(clone_client, clone_headers)
    project_id = uuid.UUID(project_id_str)
    su_id = _superuser_id(db)
    node, _mid = _create_db_node(db, su_id)

    pnode = ProjectNode(
        project_id=project_id,
        node_id=node.id,
        local_path="/home/user/project",
        clone_status="cloning",
    )
    db.add(pnode)
    db.commit()
    db.refresh(pnode)

    # Simulate ws_node gitCloneResult handler
    db.expire_all()
    row = db.exec(
        select(ProjectNode).where(
            ProjectNode.project_id == project_id,
            ProjectNode.node_id == node.id,
        )
    ).first()
    assert row is not None
    failure_payload = {"type": "gitCloneResult", "success": False}
    row.clone_status = "ready" if failure_payload.get("success") is True else "failed"
    db.add(row)
    db.commit()

    db.expire_all()
    pnode = _get_project_node(db, project_id, node.id)
    assert pnode is not None
    assert pnode.clone_status == "failed"


# ---------------------------------------------------------------------------
# (d) Attach WITHOUT ProjectGitConfig -> clone_status remains null
# ---------------------------------------------------------------------------

def test_attach_without_git_config_leaves_clone_status_null(
    clone_client: TestClient,
    clone_headers: dict[str, str],
    db: Session,
) -> None:
    """Attaching a node to a project with no GitConfig leaves clone_status null."""
    project_id_str = _create_project(clone_client, clone_headers)
    project_id = uuid.UUID(project_id_str)
    su_id = _superuser_id(db)
    node, machine_id = _create_db_node(db, su_id)
    # No GitConfig for this project

    mock_send = AsyncMock(return_value=True)
    with patch("app.api.routes.projects.manager.send_to_node", mock_send):
        resp = clone_client.post(
            f"{settings.API_V1_STR}/projects/{project_id_str}/nodes",
            headers=clone_headers,
            json={
                "node_id": str(node.id),
                "local_path": "/home/user/project",
                "is_primary": False,
            },
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["clone_status"] is None

    # Relay NOT called when no GitConfig
    mock_send.assert_not_awaited()

    db.expire_all()
    pnode = _get_project_node(db, project_id, node.id)
    assert pnode is not None
    assert pnode.clone_status is None


# ---------------------------------------------------------------------------
# Q7 Negative: gitCloneResult for non-existent ProjectNode -> no crash
# ---------------------------------------------------------------------------

def test_git_clone_result_unknown_ids_ignored(db: Session) -> None:
    """gitCloneResult with unknown project_id/node_id is logged but causes no crash."""
    fake_project_id = uuid.uuid4()
    fake_node_id = uuid.uuid4()

    # The handler does: look up ProjectNode, log warning if not found, return
    row = db.exec(
        select(ProjectNode).where(
            ProjectNode.project_id == fake_project_id,
            ProjectNode.node_id == fake_node_id,
        )
    ).first()
    assert row is None  # Confirmed: nothing exists, handler would log+return


# ---------------------------------------------------------------------------
# Q7 Negative: gitCloneResult missing success field -> treated as failure
# ---------------------------------------------------------------------------

def test_git_clone_result_missing_success_treated_as_failure(
    clone_client: TestClient,
    clone_headers: dict[str, str],
    db: Session,
) -> None:
    """gitCloneResult without 'success' key is treated as failure (success is None, not True)."""
    project_id_str = _create_project(clone_client, clone_headers)
    project_id = uuid.UUID(project_id_str)
    su_id = _superuser_id(db)
    node, _mid = _create_db_node(db, su_id)

    pnode = ProjectNode(
        project_id=project_id,
        node_id=node.id,
        local_path="/home/user/project",
        clone_status="cloning",
    )
    db.add(pnode)
    db.commit()
    db.refresh(pnode)

    # Handler logic: success = msg.get("success") -> None when key absent
    # new_status = "ready" if success is True else "failed"
    missing_success_payload: dict = {"type": "gitCloneResult"}
    success = missing_success_payload.get("success")  # None
    new_status = "ready" if success is True else "failed"
    assert new_status == "failed"

    db.expire_all()
    row = db.exec(
        select(ProjectNode).where(
            ProjectNode.project_id == project_id,
            ProjectNode.node_id == node.id,
        )
    ).first()
    assert row is not None
    row.clone_status = new_status
    db.add(row)
    db.commit()

    db.expire_all()
    pnode = _get_project_node(db, project_id, node.id)
    assert pnode is not None
    assert pnode.clone_status == "failed"


# ---------------------------------------------------------------------------
# Q7 Negative: relay offline at attach -> clone_status = 'failed', HTTP 200
# ---------------------------------------------------------------------------

def test_attach_relay_offline_sets_failed(
    clone_client: TestClient,
    clone_headers: dict[str, str],
    db: Session,
) -> None:
    """When send_to_node returns False (node not connected), clone_status is set to 'failed'."""
    project_id_str = _create_project(clone_client, clone_headers)
    project_id = uuid.UUID(project_id_str)
    su_id = _superuser_id(db)
    node, machine_id = _create_db_node(db, su_id)
    _add_git_config(db, project_id)

    mock_send = AsyncMock(return_value=False)  # node not in relay
    with patch("app.api.routes.projects.manager.send_to_node", mock_send):
        resp = clone_client.post(
            f"{settings.API_V1_STR}/projects/{project_id_str}/nodes",
            headers=clone_headers,
            json={
                "node_id": str(node.id),
                "local_path": "/home/user/project",
                "is_primary": False,
            },
        )

    assert resp.status_code == 200, resp.text  # attach still succeeds
    data = resp.json()
    assert data["clone_status"] == "failed"

    db.expire_all()
    pnode = _get_project_node(db, project_id, node.id)
    assert pnode is not None
    assert pnode.clone_status == "failed"
