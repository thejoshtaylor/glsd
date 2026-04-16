"""Local conftest for relay unit tests.

Overrides the root conftest's session-scoped autouse db fixture so
relay unit tests can run without a live database connection.
"""
from collections.abc import Generator
import pytest


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[None, None, None]:
    """No-op db fixture — relay unit tests stub the DB themselves."""
    yield None
