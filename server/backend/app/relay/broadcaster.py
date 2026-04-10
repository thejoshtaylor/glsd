"""Activity event broadcaster for SSE fan-out.

Provides in-memory pub/sub with per-user filtering and bounded queues.
D-08: Only qualifying event types are published to the activity feed.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

ACTIVITY_EVENT_TYPES = frozenset({
    "task",
    "taskComplete",
    "taskError",
    "permissionRequest",
    "question",
    "session_created",
    "session_stopped",
})


class ActivityBroadcaster:
    def __init__(self) -> None:
        self._subscribers: dict[asyncio.Queue, str] = {}  # queue -> user_id

    async def subscribe(self, user_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers[queue] = user_id
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.pop(queue, None)

    async def publish(self, event: dict, user_id: str) -> None:
        for queue, uid in list(self._subscribers.items()):
            if uid == user_id:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    # Drop oldest event to make room
                    try:
                        queue.get_nowait()
                        queue.put_nowait(event)
                    except (asyncio.QueueEmpty, asyncio.QueueFull):
                        pass


broadcaster = ActivityBroadcaster()
