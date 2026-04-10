"""ActivityBroadcaster unit tests.

Tests pub/sub fan-out, unsubscribe, queue overflow, and user filtering.
"""
import asyncio

import pytest

from app.relay.broadcaster import ActivityBroadcaster


@pytest.fixture
def bcast() -> ActivityBroadcaster:
    return ActivityBroadcaster()


@pytest.mark.asyncio
async def test_fanout(bcast: ActivityBroadcaster) -> None:
    """Publish sends event to all subscribed queues for same user_id."""
    q1 = await bcast.subscribe("user-a")
    q2 = await bcast.subscribe("user-a")
    q3 = await bcast.subscribe("user-a")

    event = {"event_type": "task", "message": "hello"}
    await bcast.publish(event, user_id="user-a")

    assert q1.get_nowait() == event
    assert q2.get_nowait() == event
    assert q3.get_nowait() == event


@pytest.mark.asyncio
async def test_unsubscribe(bcast: ActivityBroadcaster) -> None:
    """Unsubscribed queue does not receive subsequent publishes."""
    q = await bcast.subscribe("user-a")
    bcast.unsubscribe(q)

    await bcast.publish({"event_type": "task"}, user_id="user-a")
    assert q.empty()


@pytest.mark.asyncio
async def test_queue_full_drops_oldest(bcast: ActivityBroadcaster) -> None:
    """When queue is full (100), new publish drops oldest and adds newest."""
    q = await bcast.subscribe("user-a")

    # Fill queue to capacity
    for i in range(100):
        await bcast.publish({"seq": i}, user_id="user-a")

    assert q.qsize() == 100

    # Publish one more -- should drop oldest (seq=0) and add newest (seq=100)
    await bcast.publish({"seq": 100}, user_id="user-a")

    assert q.qsize() == 100
    # First item should now be seq=1 (oldest was dropped)
    first = q.get_nowait()
    assert first["seq"] == 1

    # Drain to check last item
    items = [first]
    while not q.empty():
        items.append(q.get_nowait())
    assert items[-1]["seq"] == 100


@pytest.mark.asyncio
async def test_user_filtering(bcast: ActivityBroadcaster) -> None:
    """Events are only delivered to queues subscribed for the matching user_id."""
    q_a = await bcast.subscribe("user-a")
    q_b = await bcast.subscribe("user-b")

    await bcast.publish({"msg": "for A"}, user_id="user-a")

    assert q_a.get_nowait() == {"msg": "for A"}
    assert q_b.empty()
