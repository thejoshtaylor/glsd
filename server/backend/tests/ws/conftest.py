"""Local conftest for ws/ unit tests.

Overrides the session-scoped `db` fixture from the root conftest so that
pure unit tests in this directory do not require a live PostgreSQL connection.
"""
from collections.abc import Generator
from unittest.mock import MagicMock

import pytest


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[MagicMock, None, None]:  # type: ignore[override]
    """No-op DB fixture — unit tests in tests/ws/ mock the manager directly."""
    yield MagicMock()
