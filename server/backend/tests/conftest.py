from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app.core.config import settings
from app.core.db import engine, init_db
from app.main import app
from app.models import Action, ActionChain, GitHubAppInstallation, Item, Node, Project, ProjectGitConfig, SessionEvent, SessionModel, Trigger, TriggerExecution, User, UserSettings
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        init_db(session)
        yield session
        session.execute(delete(SessionEvent))
        session.execute(delete(SessionModel))
        session.execute(delete(Node))
        session.execute(delete(UserSettings))
        session.execute(delete(Item))
        session.execute(delete(TriggerExecution))
        session.execute(delete(Action))
        session.execute(delete(ActionChain))
        session.execute(delete(Trigger))
        session.execute(delete(GitHubAppInstallation))
        try:
            session.execute(delete(ProjectGitConfig))
        except Exception:
            session.rollback()
        session.execute(delete(Project))
        session.execute(delete(User))
        session.commit()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
