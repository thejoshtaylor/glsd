"""In-memory WebSocket connection registry for message routing.

Per D-11: ConnectionManager tracks live WebSocket connections in-memory
(authoritative for routing). DB columns (connected_at, disconnected_at,
last_seen) reflect last known state across server restarts.
"""
import asyncio
import json
import logging
from dataclasses import dataclass

import redis.asyncio as aioredis
from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class NodeConnection:
    machine_id: str
    user_id: str  # D-04: token scoped to user
    websocket: WebSocket


@dataclass
class BrowserConnection:
    user_id: str
    channel_id: str
    websocket: WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._nodes: dict[str, NodeConnection] = {}  # machine_id -> conn
        self._browsers: dict[str, BrowserConnection] = {}  # channel_id -> conn
        self._session_to_node: dict[str, str] = {}  # session_id -> machine_id
        self._session_to_channel: dict[str, str] = {}  # session_id -> channel_id
        self._pending_responses: dict[str, asyncio.Future] = {}  # request_id -> future
        self._lock = asyncio.Lock()
        self._redis: aioredis.Redis | None = None
        self._pubsub_task: asyncio.Task | None = None
        self._redis_initialized: bool = False

    async def register_node(
        self, machine_id: str, user_id: str, ws: WebSocket
    ) -> None:
        async with self._lock:
            if machine_id in self._nodes:
                old = self._nodes[machine_id]
                try:
                    await old.websocket.close(code=1000)
                except Exception:
                    pass
            self._nodes[machine_id] = NodeConnection(machine_id, user_id, ws)

    async def unregister_node(self, machine_id: str) -> None:
        async with self._lock:
            self._nodes.pop(machine_id, None)

    async def register_browser(
        self, channel_id: str, user_id: str, ws: WebSocket
    ) -> None:
        async with self._lock:
            self._browsers[channel_id] = BrowserConnection(user_id, channel_id, ws)

    async def unregister_browser(self, channel_id: str) -> None:
        async with self._lock:
            self._browsers.pop(channel_id, None)

    def bind_session_to_node(
        self, session_id: str, machine_id: str, channel_id: str = ""
    ) -> None:
        self._session_to_node[session_id] = machine_id
        if channel_id:
            self._session_to_channel[session_id] = channel_id

    def unbind_session(self, session_id: str) -> None:
        self._session_to_node.pop(session_id, None)
        self._session_to_channel.pop(session_id, None)

    def get_node_for_session(self, session_id: str) -> str | None:
        return self._session_to_node.get(session_id)

    async def send_to_node(self, machine_id: str, message: dict) -> bool:
        conn = self._nodes.get(machine_id)
        if conn:
            await conn.websocket.send_json(message)
            return True
        return False

    async def send_to_browser(self, channel_id: str, message: dict) -> bool:
        conn = self._browsers.get(channel_id)
        if conn:
            await conn.websocket.send_json(message)
            return True
        return False

    def get_node(self, machine_id: str) -> NodeConnection | None:
        return self._nodes.get(machine_id)

    def is_node_online(self, machine_id: str) -> bool:
        return machine_id in self._nodes

    def get_connected_node_ids(self) -> list[str]:
        return list(self._nodes.keys())

    async def disconnect_node(self, machine_id: str) -> None:
        """D-03: Revocation is immediate disconnect."""
        async with self._lock:
            conn = self._nodes.pop(machine_id, None)
            if conn:
                try:
                    await conn.websocket.close(code=1008)
                except Exception:
                    pass

    def get_browsers_for_node(self, machine_id: str) -> list[BrowserConnection]:
        """D-03: Find browser connections whose channels have sessions on this node.
        Used during revocation to send taskError to affected browsers.
        Only returns browsers that own a channel bound to a session on the node
        (WR-03: previously returned ALL browsers regardless of session ownership)."""
        seen: set[str] = set()
        result: list[BrowserConnection] = []
        for session_id, node_machine_id in self._session_to_node.items():
            if node_machine_id == machine_id:
                channel_id = self._session_to_channel.get(session_id)
                if channel_id and channel_id not in seen:
                    browser = self._browsers.get(channel_id)
                    if browser:
                        result.append(browser)
                        seen.add(channel_id)
        return result

    def get_sessions_for_node(self, machine_id: str) -> list[str]:
        """Return all session_ids currently bound to this node's machine_id."""
        return [
            sid
            for sid, mid in self._session_to_node.items()
            if mid == machine_id
        ]

    def register_response(self, request_id: str) -> "asyncio.Future[dict]":
        """Register a one-shot response handler for a request_id.

        Used by REST endpoints (e.g. /fs, /file) to await a single response
        message from the node keyed by requestId. The caller should then
        await the returned future with asyncio.wait_for(..., timeout=N).
        """
        loop = asyncio.get_event_loop()
        future: asyncio.Future[dict] = loop.create_future()
        self._pending_responses[request_id] = future
        return future

    def resolve_response(self, request_id: str, message: dict) -> None:
        """Resolve a pending response future registered by register_response.

        Called from the node message loop when a browseDirResult or
        readFileResult arrives with a matching requestId.
        """
        future = self._pending_responses.pop(request_id, None)
        if future and not future.done():
            future.set_result(message)

    async def _get_redis(self) -> aioredis.Redis | None:
        """Lazy Redis client -- only connects when REDIS_URL is configured."""
        if not self._redis_initialized:
            self._redis_initialized = True
            try:
                from app.core.config import settings

                if settings.REDIS_URL:
                    self._redis = aioredis.from_url(
                        settings.REDIS_URL,
                        decode_responses=True,
                    )
                    # Verify connectivity
                    await self._redis.ping()
                    logger.info("Redis connected for WebSocket pub/sub fan-out")
            except Exception:
                logger.warning(
                    "Redis unavailable -- falling back to in-memory broadcast",
                    exc_info=True,
                )
                self._redis = None
        return self._redis

    async def start_subscriber(self) -> None:
        """Start the Redis pub/sub subscriber for cross-worker message delivery."""
        r = await self._get_redis()
        if r is None:
            return

        async def _subscriber_loop() -> None:
            pubsub = r.pubsub()
            await pubsub.psubscribe("ws:session:*")
            try:
                async for msg in pubsub.listen():
                    if msg["type"] != "pmessage":
                        continue
                    channel: str = msg["channel"]
                    # channel = "ws:session:{session_id}"
                    session_id = (
                        channel.split(":", 2)[2] if channel.count(":") >= 2 else ""
                    )
                    if not session_id:
                        continue
                    data = json.loads(msg["data"])
                    channel_id = self._session_to_channel.get(session_id)
                    if channel_id:
                        await self.send_to_browser(channel_id, data)
            except asyncio.CancelledError:
                await pubsub.punsubscribe("ws:session:*")
                await pubsub.close()

        self._pubsub_task = asyncio.create_task(_subscriber_loop())

    async def stop_subscriber(self) -> None:
        """Stop the Redis subscriber and close Redis connection."""
        if self._pubsub_task and not self._pubsub_task.done():
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.close()

    async def broadcast_to_session(
        self, session_id: str, message: dict
    ) -> None:
        """Publish a message for a session -- uses Redis if available, else local delivery."""
        r = await self._get_redis()
        if r:
            await r.publish(f"ws:session:{session_id}", json.dumps(message))
        else:
            # Fallback: deliver to locally-connected browser only
            channel_id = self._session_to_channel.get(session_id)
            if channel_id:
                await self.send_to_browser(channel_id, message)


# Module-level singleton
manager = ConnectionManager()
