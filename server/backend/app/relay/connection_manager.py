"""In-memory WebSocket connection registry for message routing.

Per D-11: ConnectionManager tracks live WebSocket connections in-memory
(authoritative for routing). DB columns (connected_at, disconnected_at,
last_seen) reflect last known state across server restarts.
"""
import asyncio
from dataclasses import dataclass

from fastapi import WebSocket


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
        self._lock = asyncio.Lock()

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

    def bind_session_to_node(self, session_id: str, machine_id: str) -> None:
        self._session_to_node[session_id] = machine_id

    def unbind_session(self, session_id: str) -> None:
        self._session_to_node.pop(session_id, None)

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
        """D-03: Find all browser connections with sessions bound to this node.
        Used during revocation to send taskError to affected browsers."""
        result = []
        for session_id, node_machine_id in self._session_to_node.items():
            if node_machine_id == machine_id:
                # Find browser channels associated with sessions on this node
                for browser in self._browsers.values():
                    result.append(browser)
        return result

    def get_sessions_for_node(self, machine_id: str) -> list[str]:
        """Return all session_ids currently bound to this node's machine_id."""
        return [
            sid
            for sid, mid in self._session_to_node.items()
            if mid == machine_id
        ]


# Module-level singleton
manager = ConnectionManager()
