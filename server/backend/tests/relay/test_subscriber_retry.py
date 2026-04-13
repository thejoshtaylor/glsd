"""Tests for Redis subscriber retry logic in ConnectionManager.

Verifies exponential backoff (1s, 2s, 4s, 8s, 16s), max 5 retries,
retry counter reset on successful reconnection, and clean CancelledError propagation.
"""
import asyncio
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.relay.connection_manager import ConnectionManager


@pytest.fixture
def cm() -> ConnectionManager:
    """Fresh ConnectionManager instance for each test."""
    return ConnectionManager()


def _make_mock_redis(pubsub_factory):
    """Create a mock Redis where .pubsub() is a sync call returning pubsub_factory()."""
    mock_redis = MagicMock()
    mock_redis.pubsub = pubsub_factory
    mock_redis.ping = AsyncMock()
    return mock_redis


class FailingPubSub:
    """Pubsub that always fails on psubscribe."""

    def __init__(self):
        self.subscribe_count = 0

    async def psubscribe(self, pattern: str) -> None:
        self.subscribe_count += 1
        raise ConnectionError("Redis gone")

    async def punsubscribe(self, pattern: str) -> None:
        pass

    async def close(self) -> None:
        pass


@pytest.mark.asyncio
async def test_subscriber_retries_on_disconnect(cm: ConnectionManager) -> None:
    """_subscriber_loop retries up to 5 times on Redis exception."""
    call_count = 0

    class CountingFailPubSub:
        async def psubscribe(self, pattern: str) -> None:
            nonlocal call_count
            call_count += 1
            raise ConnectionError("Redis gone")

    shared_ps = CountingFailPubSub()
    mock_redis = _make_mock_redis(lambda: shared_ps)

    cm._redis = mock_redis
    cm._redis_initialized = True

    with patch("asyncio.sleep", new_callable=AsyncMock):
        await cm.start_subscriber()
        assert cm._pubsub_task is not None
        await cm._pubsub_task

    assert call_count == 5


@pytest.mark.asyncio
async def test_subscriber_backoff_delays(cm: ConnectionManager) -> None:
    """Backoff delays are 1s, 2s, 4s, 8s, 16s."""

    class AlwaysFailPubSub:
        async def psubscribe(self, pattern: str) -> None:
            raise ConnectionError("Redis gone")

    shared_ps = AlwaysFailPubSub()
    mock_redis = _make_mock_redis(lambda: shared_ps)

    cm._redis = mock_redis
    cm._redis_initialized = True

    sleep_delays: list[float] = []

    async def track_sleep(delay: float) -> None:
        sleep_delays.append(delay)

    with patch("asyncio.sleep", side_effect=track_sleep):
        await cm.start_subscriber()
        assert cm._pubsub_task is not None
        await cm._pubsub_task

    # 4 sleeps (after attempts 1-4; attempt 5 breaks without sleeping)
    assert sleep_delays == [1, 2, 4, 8]


@pytest.mark.asyncio
async def test_subscriber_logs_error_after_max_retries(
    cm: ConnectionManager, caplog: pytest.LogCaptureFixture
) -> None:
    """Logs error after 5 failed attempts."""

    class AlwaysFailPubSub:
        async def psubscribe(self, pattern: str) -> None:
            raise ConnectionError("Redis gone")

    shared_ps = AlwaysFailPubSub()
    mock_redis = _make_mock_redis(lambda: shared_ps)

    cm._redis = mock_redis
    cm._redis_initialized = True

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with caplog.at_level(logging.ERROR, logger="app.relay.connection_manager"):
            await cm.start_subscriber()
            assert cm._pubsub_task is not None
            await cm._pubsub_task

    assert any(
        "Redis subscriber failed after 5 attempts" in record.message
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_subscriber_resets_retry_on_success(cm: ConnectionManager) -> None:
    """Retry counter resets on successful reconnection (psubscribe succeeds)."""
    call_idx = 0

    class SucceedOncePubSub:
        """Succeeds on psubscribe but fails during listen."""

        async def psubscribe(self, pattern: str) -> None:
            pass  # success -- counter resets to 0

        async def listen(self):
            raise ConnectionError("listen broke")
            yield  # pragma: no cover

    class AlwaysFailPubSub:
        async def psubscribe(self, pattern: str) -> None:
            raise ConnectionError("always fails")

    def make_pubsub():
        nonlocal call_idx
        call_idx += 1
        if call_idx == 2:
            return SucceedOncePubSub()
        return AlwaysFailPubSub()

    mock_redis = _make_mock_redis(make_pubsub)

    cm._redis = mock_redis
    cm._redis_initialized = True

    with patch("asyncio.sleep", new_callable=AsyncMock):
        await cm.start_subscriber()
        assert cm._pubsub_task is not None
        await cm._pubsub_task

    # call_idx tracks total pubsub() calls:
    # attempt=0: fail at psubscribe -> attempt=1, sleep(1)
    # attempt=1: success at psubscribe, reset to 0, fail at listen -> attempt=1, sleep(1)
    # attempt=1..5: fail at psubscribe -> attempt=5, break
    # Total pubsub calls: 1 + 1 + 4 = 6
    # (attempt 5 breaks immediately after incrementing, no new pubsub call after that)
    assert call_idx == 6


@pytest.mark.asyncio
async def test_subscriber_propagates_cancelled_error(cm: ConnectionManager) -> None:
    """CancelledError is propagated immediately (clean shutdown)."""

    class CancellingPubSub:
        async def psubscribe(self, pattern: str) -> None:
            raise asyncio.CancelledError()

    shared_ps = CancellingPubSub()
    mock_redis = _make_mock_redis(lambda: shared_ps)

    cm._redis = mock_redis
    cm._redis_initialized = True

    await cm.start_subscriber()
    assert cm._pubsub_task is not None

    with pytest.raises(asyncio.CancelledError):
        await cm._pubsub_task
