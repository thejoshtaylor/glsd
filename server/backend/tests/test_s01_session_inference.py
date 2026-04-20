"""S01 session inference tests.

Verifies that create_session() infers project_id via ProjectNode (node_id, local_path)
rather than the removed Project.(node_id, cwd) columns.

Run with: uv run pytest tests/test_s01_session_inference.py -v --noconftest
"""
import os
import uuid

# Satisfy pydantic-settings before app imports
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-chars-long")
os.environ.setdefault("POSTGRES_SERVER", "localhost")
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("FIRST_SUPERUSER", "admin@test.com")
os.environ.setdefault("FIRST_SUPERUSER_PASSWORD", "testpassword")

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select


@pytest.fixture(scope="module")
def engine():
    """SQLite in-memory engine with only the tables needed for session inference."""
    from app.models import Node, Project, ProjectNode, SessionModel, Team, User

    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(
        eng,
        tables=[
            User.__table__,
            Team.__table__,
            Node.__table__,
            Project.__table__,
            ProjectNode.__table__,
            SessionModel.__table__,
        ],
    )
    return eng


@pytest.fixture()
def db(engine):
    with Session(engine) as session:
        yield session
        session.rollback()


def _make_user(db):
    from app.models import User

    user = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4()}@test.com",
        hashed_password="x",
    )
    db.add(user)
    db.flush()
    return user


def _make_team(db, user_id):
    from app.models import Team

    team = Team(id=uuid.uuid4(), owner_id=user_id, name="test-team")
    db.add(team)
    db.flush()
    return team


def _make_node(db, user_id, team_id):
    from app.models import Node

    node = Node(
        id=uuid.uuid4(),
        user_id=user_id,
        team_id=team_id,
        name="test-node",
        token_hash=f"testhash-{uuid.uuid4().hex}",
        token_index=uuid.uuid4().hex,
    )
    db.add(node)
    db.flush()
    return node


def _make_project(db, user_id):
    from app.models import Project

    project = Project(
        id=uuid.uuid4(),
        user_id=user_id,
        name="test-project",
    )
    db.add(project)
    db.flush()
    return project


def test_create_session_infers_project_via_project_node(db):
    """create_session() infers project_id when a ProjectNode row matches (node_id, local_path)."""
    from app.crud import create_session
    from app.models import ProjectNode

    user = _make_user(db)
    team = _make_team(db, user.id)
    node = _make_node(db, user.id, team.id)
    project = _make_project(db, user.id)

    pnode = ProjectNode(
        project_id=project.id,
        node_id=node.id,
        local_path="/home/user/myproject",
    )
    db.add(pnode)
    db.commit()

    sess = create_session(
        session=db,
        user_id=user.id,
        node_id=node.id,
        cwd="/home/user/myproject",
    )

    assert sess is not None
    assert sess.project_id == project.id


def test_create_session_no_project_node_returns_unlinked(db):
    """create_session() sets project_id=None when no ProjectNode matches."""
    from app.crud import create_session

    user = _make_user(db)
    team = _make_team(db, user.id)
    node = _make_node(db, user.id, team.id)
    db.commit()

    sess = create_session(
        session=db,
        user_id=user.id,
        node_id=node.id,
        cwd="/no/matching/path",
    )

    assert sess is not None
    assert sess.project_id is None
