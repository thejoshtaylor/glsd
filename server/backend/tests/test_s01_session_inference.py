"""Tests for ProjectNode-based session inference (Slice S01).

These tests use an in-memory SQLite DB so they run without a live PostgreSQL
instance. They cover the create_session() auto-inference path only.

Run with: cd server/backend && uv run pytest tests/test_s01_session_inference.py -v --noconftest
"""
import os
import uuid

# Set required env vars before any app imports load app.core.config.Settings
os.environ.setdefault("PROJECT_NAME", "test")
os.environ.setdefault("POSTGRES_SERVER", "localhost")
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("FIRST_SUPERUSER", "admin@test.com")
os.environ.setdefault("FIRST_SUPERUSER_PASSWORD", "testpassword123")
os.environ.setdefault("SECRET_KEY", "testsecretkey1234567890123456789012")

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models import Node, Project, ProjectNode, SessionModel, Team, User


@pytest.fixture(scope="module")
def mem_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Create only the tables needed for these tests — other tables use JSONB
    # which SQLite cannot compile.
    tables = [
        SQLModel.metadata.tables[t]
        for t in ["user", "team", "node", "project", "project_node", "session"]
    ]
    SQLModel.metadata.create_all(engine, tables=tables)
    yield engine
    engine.dispose()


@pytest.fixture()
def db(mem_engine):
    with Session(mem_engine) as session:
        yield session
        session.rollback()


def _seed_user_node_project(db: Session):
    user = User(
        email=f"test-{uuid.uuid4()}@example.com",
        hashed_password="x",
        is_active=True,
    )
    db.add(user)
    db.flush()

    team = Team(owner_id=user.id, name="Personal", is_personal=True)
    db.add(team)
    db.flush()

    node = Node(
        name="test-node",
        user_id=user.id,
        team_id=team.id,
        token_hash="x",
        token_index=str(uuid.uuid4()),
        is_revoked=False,
    )
    db.add(node)
    db.flush()

    project = Project(name="test-project", user_id=user.id)
    db.add(project)
    db.flush()

    return user, node, project


def test_create_session_infers_project_via_project_node(db: Session):
    """create_session() auto-infers project_id when a matching ProjectNode exists."""
    from app.crud import create_session

    user, node, project = _seed_user_node_project(db)
    cwd = "/home/user/myproject"

    pnode = ProjectNode(
        project_id=project.id,
        node_id=node.id,
        local_path=cwd,
        is_primary=True,
    )
    db.add(pnode)
    db.commit()

    sess = create_session(session=db, user_id=user.id, node_id=node.id, cwd=cwd)
    assert sess is not None
    assert sess.project_id == project.id


def test_create_session_no_project_node_returns_unlinked(db: Session):
    """create_session() returns a session with project_id=None when no ProjectNode matches."""
    from app.crud import create_session

    user, node, _ = _seed_user_node_project(db)
    db.commit()

    sess = create_session(
        session=db,
        user_id=user.id,
        node_id=node.id,
        cwd="/no/matching/path",
    )
    assert sess is not None
    assert sess.project_id is None
