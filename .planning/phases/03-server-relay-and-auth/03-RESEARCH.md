# Phase 3: Server Relay and Auth - Research

**Researched:** 2026-04-09
**Domain:** FastAPI WebSocket relay, JWT authentication, PostgreSQL session/event storage
**Confidence:** HIGH

## Summary

Phase 3 builds the server-side relay hub that connects authenticated browser clients to paired node daemons via WebSocket. The existing codebase provides a complete foundation: JWT auth, user management, SQLModel ORM, Alembic migrations, and password hashing are all implemented. The daemon already implements its side of the protocol (hello/welcome handshake, heartbeat, WAL replay). This phase fills the server-side gap: new database models (Node, Session, SessionEvent), two WebSocket endpoints (browser and node), a ConnectionManager for routing, REST endpoints for session lifecycle, and the node pairing flow.

The primary technical challenge is implementing WebSocket message routing correctly -- mapping browser channelId to node connections and vice versa -- while persisting all events to PostgreSQL before sending acks. The existing sync SQLModel/psycopg stack is adequate; FastAPI runs sync dependencies in a threadpool automatically, so WebSocket handlers can call sync DB functions without blocking the event loop.

**Primary recommendation:** Extend the existing FastAPI app with two WebSocket endpoints (`/ws/browser`, `/ws/node`), a ConnectionManager class for routing, three new SQLModel tables (Node, Session, SessionEvent), and REST endpoints for session CRUD and node pairing. Keep the sync database pattern from the existing codebase -- do not migrate to async SQLModel/asyncpg in this phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tokens are long-lived and revocable -- no expiry by default. Node startup script stores the token once and reuses it across restarts. Survives server restarts.
- **D-02:** Token is revealed once on generation (like GitHub PATs). The UI shows it one time; the server stores only the bcrypt/argon2 hash. User copies it into the node's env/config.
- **D-03:** Revocation is immediate disconnect -- server closes the WebSocket connection to the node and marks the token as revoked in DB. Any active sessions on that node receive a `taskError`.
- **D-04:** Tokens are scoped to a user account -- each token belongs to one user. Sessions run on that node are attributed to that user. No server-wide shared tokens.
- **D-05:** Sessions are created REST-first -- browser calls `POST /api/v1/sessions` with `{nodeId, cwd}`, server creates a DB record and returns `{sessionId}`. Browser then opens a WebSocket and sends `task` with that `sessionId`. Server validates the session exists before accepting WS messages for it.
- **D-06:** Browser WebSocket authenticates via JWT in query param -- `ws://.../ws/browser?token=<jwt>`. Browser WebSocket API cannot send custom headers; JWT query param is the standard FastAPI pattern.
- **D-07:** Session stop is forward-only -- server forwards the `stop` message to the node daemon via WS. DB session state is updated when `taskComplete` or `taskError` arrives back from the daemon. No optimistic `stopping` state.
- **D-08:** All events stored from day one -- every `stream` event and all control events are written to PostgreSQL. Phase 5 WAL replay will read from this table without migration.
- **D-09:** Schema is one row per event: `session_id UUID`, `sequence_number INT8`, `event_type TEXT`, `payload JSONB`, `created_at TIMESTAMPTZ`. Primary key on `(session_id, sequence_number)`.
- **D-10:** `ack` messages are sent to the daemon after the DB write confirms -- not fire-and-forget. Server writes the event to PostgreSQL, then sends `ack {sessionId, sequenceNumber}`. Daemon prunes WAL on ack per PROTOCOL.md semantics.
- **D-11:** Node status uses in-memory + DB hybrid -- ConnectionManager tracks live WebSocket connections in-memory (authoritative for routing). Server writes `connected_at` / `disconnected_at` / `last_seen` to the nodes table on connect, disconnect, and heartbeat. DB reflects last known state across server restarts.
- **D-12:** On receiving a `heartbeat` message from the daemon, the server updates `last_seen` in PostgreSQL. A node is considered offline if `last_seen` is older than 2x the heartbeat interval (or if its WebSocket connection is absent from ConnectionManager).

### Claude's Discretion
- Exact location of ConnectionManager class within the FastAPI app (dedicated module vs inline in the WebSocket route handlers)
- Whether `sequence_number` on the events table is the daemon's WAL sequence or a server-assigned sequence
- Alembic migration ordering for new tables (nodes, sessions, session_events)
- Whether to add a separate `node_status` enum type or use a string column for node online/offline state

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within Phase 3 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can create an account with email and password | Existing: `POST /api/v1/users/signup` already implemented in `users.py` -- no new code needed |
| AUTH-02 | User can log in and stay logged in across browser sessions (JWT) | Existing: `POST /api/v1/login/access-token` returns JWT with 8-day expiry -- no new code needed |
| AUTH-03 | User can log out from any page | Client-side token discard; optionally add server-side token blocklist (see Architecture Patterns) |
| AUTH-04 | Node operator can pair a node to their server account using a user token | New: `POST /api/v1/nodes/pair` endpoint + Node model + token generation flow |
| SESS-01 | User can start a Claude Code session on a selected node with prompt and cwd | New: `POST /api/v1/sessions` REST endpoint + `task` message forwarding via WS |
| SESS-02 | User can stop a running session | New: `stop` message forwarding through ConnectionManager to correct node |
| SESS-06 | User can run multiple sessions on a single node simultaneously | ConnectionManager routes by sessionId/channelId, not by nodeId -- multiple sessions per node are inherent in the routing design |
| RELY-01 | Server maintains persistent WebSocket connections to each connected node | New: `/ws/node` endpoint with hello/welcome handshake + ConnectionManager tracking |
| RELY-02 | Server routes browser WS messages to correct node/session via channelId | New: ConnectionManager maps channelId to node connection; routes by sessionId lookup |
| RELY-03 | Server stores session state and stream events in PostgreSQL | New: Session + SessionEvent models, event persistence before ack (D-10) |
| RELY-04 | Node daemon reconnects to server automatically after connection loss | Already implemented in daemon (`loop.Run` with exponential backoff); server must handle clean disconnect + reconnect of same machineId |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Files under 500 lines; use Domain-Driven Design with bounded contexts
- All database models use SQLModel with `table=True` and UUID primary keys
- Prefer TDD London School (mock-first) for new code
- Input validation at system boundaries
- Use `/src` for source code, `/tests` for tests -- but server backend already uses `app/` and `tests/` structure
- Run tests after code changes; verify build before committing
- Never hardcode API keys or secrets; validate user input at boundaries

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.114.2 | HTTP + WebSocket server | Already in pyproject.toml. Native `@app.websocket()` support. | 
| SQLModel | >=0.0.21 | ORM for Node, Session, SessionEvent models | Already in pyproject.toml. Pydantic + SQLAlchemy hybrid. |
| Alembic | >=1.12.1 | Database migrations for new tables | Already configured with env.py pointing at app.models |
| PyJWT | >=2.8.0 | JWT validation for WebSocket auth | Already in pyproject.toml and security.py |
| pwdlib | >=0.3.0 | Hashing node pairing tokens (argon2/bcrypt) | Already in pyproject.toml and security.py |
| psycopg[binary] | >=3.1.13 | PostgreSQL driver (sync) | Already in pyproject.toml |
| Pydantic | >2.0 | Protocol message validation | Already in pyproject.toml |
| pytest | >=7.4.3 | Test framework | Already in dev dependencies |

[VERIFIED: pyproject.toml at server/backend/pyproject.toml]

### No New Dependencies Required

This phase requires **zero new pip packages**. Everything needed is already installed:
- WebSocket handling: built into FastAPI/Starlette
- JWT auth: PyJWT already installed
- Token hashing: pwdlib already installed
- Database: SQLModel + psycopg already installed
- Migrations: Alembic already configured
- Testing: pytest + TestClient already in dev deps

### Alternatives Rejected
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| Async SQLModel + asyncpg | Sync SQLModel + psycopg | Existing codebase is 100% sync. Migration would touch every DB access point. FastAPI runs sync deps in threadpool -- adequate for this workload. |
| Redis pub/sub | In-memory ConnectionManager | Single-worker deployment initially (per CLAUDE.md tech stack). Redis deferred to SCAL-01 (v2). |
| python-socketio | Raw WebSocket | Protocol is defined as raw JSON text frames. Socket.IO adds its own protocol layer that conflicts. |

## Architecture Patterns

### Recommended Project Structure
```
server/backend/app/
  api/
    routes/
      nodes.py          # Node pairing REST endpoints
      sessions.py       # Session CRUD REST endpoints  
      ws_browser.py     # Browser WebSocket endpoint
      ws_node.py        # Node daemon WebSocket endpoint
  models.py             # Add Node, Session, SessionEvent (extend existing)
  crud.py               # Add node/session CRUD helpers (extend existing)
  relay/
    connection_manager.py  # ConnectionManager class
    protocol.py            # Pydantic models for protocol messages
  api/main.py           # Mount new routers
```

**Rationale for ConnectionManager location:** Dedicated `relay/` module keeps WebSocket routing logic separate from HTTP route handlers. The ConnectionManager is shared state accessed by both `ws_browser.py` and `ws_node.py`, so it should not live inside either route file. [ASSUMED]

### Pattern 1: ConnectionManager (Singleton)
**What:** In-memory registry mapping connections for message routing
**When to use:** Always -- this is the core relay infrastructure

```python
# Source: FastAPI WebSocket docs + CONTEXT.md decisions D-11, D-12
import asyncio
from dataclasses import dataclass, field
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
    def __init__(self):
        self._nodes: dict[str, NodeConnection] = {}        # machine_id -> conn
        self._browsers: dict[str, BrowserConnection] = {}  # channel_id -> conn
        self._session_to_node: dict[str, str] = {}         # session_id -> machine_id
        self._lock = asyncio.Lock()
    
    async def register_node(self, machine_id: str, user_id: str, ws: WebSocket):
        async with self._lock:
            # Close existing connection for same machine (reconnect case)
            if machine_id in self._nodes:
                old = self._nodes[machine_id]
                try:
                    await old.websocket.close(code=1000)
                except Exception:
                    pass
            self._nodes[machine_id] = NodeConnection(machine_id, user_id, ws)
    
    async def register_browser(self, channel_id: str, user_id: str, ws: WebSocket):
        async with self._lock:
            self._browsers[channel_id] = BrowserConnection(user_id, channel_id, ws)
    
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
```

[CITED: https://fastapi.tiangolo.com/advanced/websockets/]
[VERIFIED: CONTEXT.md decisions D-11, D-04]

### Pattern 2: Node WebSocket Endpoint (hello/welcome handshake)
**What:** Server-side handler for daemon connections with authentication and protocol handshake
**When to use:** `/ws/node` endpoint

```python
# Daemon connects with: Authorization: Bearer <token> header
# (daemon uses HTTP headers, not query params -- see relay/client.go line 68)
@router.websocket("/ws/node")
async def ws_node(websocket: WebSocket, db: SessionDep):
    await websocket.accept()
    
    # 1. Authenticate: daemon sends Authorization header
    auth = websocket.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        await websocket.close(code=1008)
        return
    token = auth[7:]
    
    # 2. Wait for Hello (first frame per PROTOCOL.md)
    data = await websocket.receive_json()
    if data.get("type") != "hello":
        await websocket.close(code=1008)
        return
    machine_id = data["machineId"]
    
    # 3. Verify token against hashed tokens in DB
    node = verify_node_token(db, machine_id, token)
    if not node:
        await websocket.close(code=1008)
        return
    
    # 4. Register in ConnectionManager + update DB
    await manager.register_node(machine_id, str(node.user_id), websocket)
    update_node_connected(db, node)
    
    # 5. Send Welcome with acked sequences
    acked = get_acked_sequences(db, machine_id)
    await websocket.send_json({"type": "welcome", "ackedSequencesBySession": acked})
    
    # 6. Message loop
    try:
        while True:
            msg = await websocket.receive_json()
            await handle_node_message(msg, machine_id, db)
    except WebSocketDisconnect:
        await manager.unregister_node(machine_id)
        update_node_disconnected(db, node)
```

**Critical detail from daemon code:** The daemon sends auth via `Authorization: Bearer` HTTP header (relay/client.go line 68), NOT query params. The query-param auth is for browser connections only (D-06). The daemon also sends `machineId` and `token` as query params (loop/daemon.go `buildRelayURL`), providing two auth signals. Use the query param token for verification since it is the explicit auth mechanism the daemon builds into the URL.

[VERIFIED: node/daemon/internal/relay/client.go line 68, node/daemon/internal/loop/daemon.go buildRelayURL]

### Pattern 3: Browser WebSocket Endpoint (JWT query param)
**What:** Server-side handler for browser connections with JWT authentication
**When to use:** `/ws/browser` endpoint

```python
# Browser connects with: ws://host/ws/browser?token=<jwt>&channelId=<id>
@router.websocket("/ws/browser")
async def ws_browser(websocket: WebSocket, token: str, channelId: str, db: SessionDep):
    # 1. Validate JWT
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.InvalidTokenError:
        await websocket.close(code=1008)
        return
    
    user = db.get(User, user_id)
    if not user or not user.is_active:
        await websocket.close(code=1008)
        return
    
    await websocket.accept()
    await manager.register_browser(channelId, user_id, websocket)
    
    try:
        while True:
            msg = await websocket.receive_json()
            await handle_browser_message(msg, user_id, channelId, db)
    except WebSocketDisconnect:
        await manager.unregister_browser(channelId)
```

[CITED: https://fastapi.tiangolo.com/advanced/websockets/]
[VERIFIED: CONTEXT.md decision D-06]

### Pattern 4: Node Pairing Flow
**What:** REST endpoint that generates a token, returns it once, stores only the hash
**When to use:** `POST /api/v1/nodes/pair`

```python
import secrets
from app.core.security import get_password_hash

@router.post("/", response_model=NodePairResponse)
def create_node_token(session: SessionDep, current_user: CurrentUser, body: NodeCreateRequest):
    # Generate a cryptographically secure token
    raw_token = secrets.token_urlsafe(32)
    
    # Store only the hash (D-02: revealed once, like GitHub PATs)
    node = Node(
        name=body.name,
        user_id=current_user.id,
        token_hash=get_password_hash(raw_token),
        is_revoked=False,
    )
    session.add(node)
    session.commit()
    session.refresh(node)
    
    # Return the raw token -- this is the only time it is visible
    return NodePairResponse(
        node_id=node.id,
        token=raw_token,  # shown once, never stored
        relay_url=f"wss://{settings.SERVER_HOST}/ws/node",
    )
```

[VERIFIED: CONTEXT.md decisions D-01, D-02, D-04]
[VERIFIED: existing get_password_hash in app/core/security.py]

### Pattern 5: Event Persistence Before Ack (D-10)
**What:** Write event to PostgreSQL, then send ack to daemon
**When to use:** Every daemon->server event that has a sequence number

```python
async def handle_node_message(msg: dict, machine_id: str, db: Session):
    msg_type = msg.get("type")
    
    if msg_type == "stream":
        session_id = msg["sessionId"]
        seq = msg["sequenceNumber"]
        
        # 1. Write to DB FIRST (D-10)
        event = SessionEvent(
            session_id=session_id,
            sequence_number=seq,
            event_type=msg_type,
            payload=msg,
        )
        db.add(event)
        db.commit()
        
        # 2. Send ack AFTER DB confirms (D-10)
        await manager.send_to_node(machine_id, {
            "type": "ack",
            "sessionId": session_id,
            "sequenceNumber": seq,
        })
        
        # 3. Forward to browser
        channel_id = msg.get("channelId")
        if channel_id:
            await manager.send_to_browser(channel_id, msg)
    
    elif msg_type == "heartbeat":
        # D-12: update last_seen in DB
        update_node_heartbeat(db, machine_id, msg["timestamp"])
    
    elif msg_type in ("taskStarted", "taskComplete", "taskError",
                       "permissionRequest", "question"):
        # Store control events too (D-08), forward to browser
        # taskComplete and taskError also update session status
        ...
```

### Pattern 6: Sync DB in Async WebSocket Handlers
**What:** The existing codebase uses sync SQLModel. WebSocket handlers are async. FastAPI handles this.
**When to use:** All WebSocket handlers that need DB access

```python
# FastAPI automatically runs sync dependencies in a threadpool.
# For explicit sync calls inside async functions, use run_in_executor:
import asyncio
from functools import partial

async def persist_event(db_session_factory, event_data):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(_sync_persist, db_session_factory, event_data))

def _sync_persist(db_session_factory, event_data):
    with db_session_factory() as db:
        event = SessionEvent(**event_data)
        db.add(event)
        db.commit()
```

**Alternative (simpler):** Since WebSocket handlers manage their own lifecycle (not request-response), create a sync Session directly inside the handler using `with Session(engine) as db:` for each DB operation. This avoids the dependency injection complexity for long-lived WebSocket connections.

[ASSUMED -- specific pattern choice for sync-in-async is discretionary]

### Anti-Patterns to Avoid
- **Sharing a single DB session across the WebSocket lifetime:** Sessions should be short-lived. Create a new session per DB operation (or per batch of related operations). A long-lived session accumulates stale objects and risks transaction timeouts.
- **Accepting WebSocket before auth:** Validate JWT/token BEFORE calling `websocket.accept()` for browser connections. For node connections, accept first (needed to receive hello frame), but close immediately on auth failure.
- **Using `asyncio.Lock` for DB writes:** The lock protects in-memory ConnectionManager state. DB writes do not need the same lock -- PostgreSQL handles concurrency via transactions.
- **Storing raw pairing tokens:** Only store hashes (D-02). The raw token is returned once at creation time.

## Database Models

### Node Model
```python
class Node(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    name: str = Field(max_length=255)
    machine_id: str | None = Field(default=None, max_length=255, unique=True, index=True)
    token_hash: str  # argon2/bcrypt hash of the pairing token
    is_revoked: bool = Field(default=False)
    
    # Connection state (D-11)
    connected_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    disconnected_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    last_seen: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    
    # Metadata from hello message
    os: str | None = Field(default=None, max_length=50)
    arch: str | None = Field(default=None, max_length=50)
    daemon_version: str | None = Field(default=None, max_length=50)
    
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),
    )
    
    # Relationships
    user: User | None = Relationship()
    sessions: list["Session"] = Relationship(back_populates="node")
```

**Note on `machine_id`:** This is NULL at creation time (token generated but node hasn't connected yet). It gets populated when the daemon sends its first `hello` message with the machineId. The `machine_id` is the daemon's self-generated UUID, stored in `~/.gsd-cloud/config.json` on the node.

[VERIFIED: node/daemon/internal/config/config.go -- MachineID field]
[VERIFIED: node/daemon/internal/api/pair.go -- PairResponse returns machineId]

### Session Model
```python
class Session(SQLModel, table=True):
    __tablename__ = "session"  # avoid conflict with SQLAlchemy "session"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    node_id: uuid.UUID = Field(foreign_key="node.id", nullable=False, index=True)
    
    status: str = Field(default="created", max_length=50)  # created, running, completed, error
    cwd: str = Field(max_length=4096)
    
    # Set when taskComplete arrives
    claude_session_id: str | None = Field(default=None, max_length=255)
    
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),
    )
    started_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    completed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    
    # Relationships
    node: Node | None = Relationship(back_populates="sessions")
    events: list["SessionEvent"] = Relationship(back_populates="session", cascade_delete=True)
```

### SessionEvent Model (D-09)
```python
class SessionEvent(SQLModel, table=True):
    __tablename__ = "session_event"
    
    session_id: uuid.UUID = Field(foreign_key="session.id", nullable=False, primary_key=True)
    sequence_number: int = Field(primary_key=True)  # Composite PK per D-09
    event_type: str = Field(max_length=50, index=True)
    payload: dict = Field(sa_type=JSONB)  # Full protocol message
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),
    )
    
    # Relationship
    session: Session | None = Relationship(back_populates="events")
```

**Note on JSONB:** SQLModel does not expose `JSONB` directly. Use `sa_column=Column(JSONB)` from `sqlalchemy.dialects.postgresql`. [VERIFIED: PostgreSQL 18 supports JSONB natively]

[VERIFIED: CONTEXT.md D-09 schema specification]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password/token hashing | Custom hash function | `pwdlib` (already installed) | Argon2 is the current best practice; timing attacks are subtle |
| JWT creation/validation | Manual token signing | `PyJWT` (already installed) | Expiry, algorithm validation, standard claims handling |
| UUID generation | Sequential IDs or custom generators | `uuid.uuid4()` (Python stdlib) | Already the pattern in all existing models |
| WebSocket protocol framing | Custom binary protocol | Starlette's `WebSocket.send_json()` / `receive_json()` | PROTOCOL.md specifies JSON text frames; Starlette handles encoding |
| Connection health checks | Custom ping/pong | Daemon's 30s heartbeat + `coder/websocket` ping (client.go line 149) | Daemon already implements heartbeat; server just updates `last_seen` |
| Exponential backoff (reconnect) | Custom reconnect logic on server | Daemon handles reconnection (loop/daemon.go) | Server is passive -- it accepts connections. Daemon reconnects. |

**Key insight:** The daemon already implements reconnection with exponential backoff (1s to 60s). The server does not need to initiate connections to nodes -- it only needs to gracefully handle disconnect/reconnect of the same machineId.

## Common Pitfalls

### Pitfall 1: WebSocket Accept Before Auth Validation
**What goes wrong:** Accepting the WebSocket connection before validating credentials leaks server resources. An attacker can open thousands of connections without valid tokens.
**Why it happens:** FastAPI's `websocket.accept()` must be called to establish the connection, but for browser connections, the JWT can be validated from query params before accept.
**How to avoid:** For browser WS: validate JWT from `websocket.query_params` BEFORE `websocket.accept()`. For node WS: must accept first (need to receive hello frame), but close immediately on auth failure within a timeout.
**Warning signs:** High connection count with no authenticated users.

### Pitfall 2: Stale DB Sessions in Long-Lived WebSocket Handlers
**What goes wrong:** Using a single SQLModel Session for the entire WebSocket connection lifetime causes stale reads, memory leaks, and transaction timeout errors.
**Why it happens:** HTTP request handlers are short-lived (one session per request). WebSocket handlers can run for hours.
**How to avoid:** Create a new `Session(engine)` for each discrete DB operation or batch. Do not use the FastAPI `SessionDep` dependency for WebSocket handlers -- it yields once and the generator does not close until the connection ends.
**Warning signs:** `OperationalError: server closed the connection unexpectedly` or stale object state after concurrent modifications.

### Pitfall 3: Daemon Auth Uses HTTP Header, Not Query Param
**What goes wrong:** Implementing node auth as query-param-only when the daemon sends `Authorization: Bearer <token>` as an HTTP header during WebSocket upgrade.
**Why it happens:** Confusion between browser auth (query param, D-06) and daemon auth. The daemon code in `relay/client.go:68` sets an HTTP header. However, `loop/daemon.go:buildRelayURL` ALSO sets `token` as a query param.
**How to avoid:** Accept token from either source. The daemon provides both. Use the query param `token` as the primary mechanism (it is explicitly built into the URL), with the header as a fallback.
**Warning signs:** Daemon connections being rejected despite correct token.

[VERIFIED: relay/client.go line 68 sets Authorization header; loop/daemon.go buildRelayURL sets query params]

### Pitfall 4: Missing Composite Primary Key on SessionEvent
**What goes wrong:** Using a single auto-increment ID instead of `(session_id, sequence_number)` as the primary key means losing the ability to do efficient range queries for WAL replay and creating duplicate events on retry.
**Why it happens:** Default SQLModel pattern uses a single UUID primary key.
**How to avoid:** Use composite primary key per D-09. SQLModel supports this via `primary_key=True` on both fields. Add an upsert pattern (INSERT ON CONFLICT DO NOTHING) to handle daemon retransmissions gracefully.
**Warning signs:** Duplicate events in the session_events table after daemon reconnection.

### Pitfall 5: Race Condition on Node Reconnect
**What goes wrong:** Daemon reconnects while the server still has the old WebSocket in ConnectionManager. Two connections for the same machineId causes message duplication.
**Why it happens:** The old connection's disconnect handler has not fired yet when the new connection arrives.
**How to avoid:** On `register_node`, check for existing connection with same machineId and close it. Use an `asyncio.Lock` around ConnectionManager mutations.
**Warning signs:** Duplicate messages, "connection already closed" errors.

### Pitfall 6: SQLModel `session` Table Name Conflict
**What goes wrong:** SQLModel infers table name from class name. A class called `Session` would try to create a table named `session`, which conflicts with SQLAlchemy's internal session concept and is a reserved word in some SQL contexts.
**Why it happens:** SQLModel's convention-over-configuration approach.
**How to avoid:** Use `__tablename__ = "session"` explicitly or name the class `GsdSession` / `CloudSession`. The word "session" is not a reserved keyword in PostgreSQL, but explicit naming avoids confusion.
**Warning signs:** Mysterious SQLAlchemy import errors or table creation failures.

### Pitfall 7: Node Pairing Token Verification Performance
**What goes wrong:** Argon2 verification is intentionally slow (~200ms). If every WebSocket frame triggers token re-verification, the server becomes a bottleneck.
**Why it happens:** Over-verifying credentials.
**How to avoid:** Verify the node token ONCE during the hello/welcome handshake. After that, the WebSocket connection is authenticated for its lifetime. ConnectionManager associates machineId with a verified connection object.
**Warning signs:** High CPU usage on the server, slow message relay.

## Code Examples

### Alembic Migration for New Tables

```python
# Source: existing migration pattern in app/alembic/versions/
"""Add nodes, sessions, session_events tables

Revision ID: <generated>
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
import sqlmodel

def upgrade() -> None:
    op.create_table(
        "node",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("machine_id", sa.String(255), nullable=True),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("os", sa.String(50), nullable=True),
        sa.Column("arch", sa.String(50), nullable=True),
        sa.Column("daemon_version", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("machine_id"),
    )
    op.create_index("ix_node_user_id", "node", ["user_id"])
    op.create_index("ix_node_machine_id", "node", ["machine_id"])
    
    op.create_table(
        "session",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="created"),
        sa.Column("cwd", sa.String(4096), nullable=False),
        sa.Column("claude_session_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["node_id"], ["node.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_session_user_id", "session", ["user_id"])
    op.create_index("ix_session_node_id", "session", ["node_id"])
    
    op.create_table(
        "session_event",
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("sequence_number", sa.BigInteger(), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("session_id", "sequence_number"),
        sa.ForeignKeyConstraint(["session_id"], ["session.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_session_event_event_type", "session_event", ["event_type"])

def downgrade() -> None:
    op.drop_table("session_event")
    op.drop_table("session")
    op.drop_table("node")
```

[VERIFIED: existing Alembic migration pattern in app/alembic/versions/]

### Node Token Verification Helper

```python
# Add to app/crud.py following existing pattern
from app.core.security import verify_password

def verify_node_token(*, session: Session, machine_id: str, raw_token: str) -> Node | None:
    """Verify a node's pairing token. Returns the Node if valid, None otherwise."""
    node = session.exec(
        select(Node).where(Node.machine_id == machine_id, Node.is_revoked == False)
    ).first()
    if not node:
        # Timing attack prevention: hash anyway
        verify_password(raw_token, DUMMY_HASH)
        return None
    verified, updated_hash = verify_password(raw_token, node.token_hash)
    if not verified:
        return None
    if updated_hash:
        node.token_hash = updated_hash
        session.add(node)
        session.commit()
        session.refresh(node)
    return node
```

[VERIFIED: follows existing authenticate() pattern in app/crud.py]

### Welcome Message with Acked Sequences

```python
def get_acked_sequences_for_node(session: Session, node_id: uuid.UUID) -> dict[str, int]:
    """Get the highest acked sequence number per session for a node's sessions."""
    from sqlmodel import func
    
    statement = (
        select(
            SessionEvent.session_id,
            func.max(SessionEvent.sequence_number).label("max_seq")
        )
        .join(Session, Session.id == SessionEvent.session_id)
        .where(Session.node_id == node_id)
        .group_by(SessionEvent.session_id)
    )
    results = session.exec(statement).all()
    return {str(row.session_id): row.max_seq for row in results}
```

### Daemon Pairing Endpoint (Server Side)

The daemon calls `POST /api/daemon/pair` (see `node/daemon/internal/api/pair.go`). The server-side endpoint must match this contract:

```python
# Request body (matches PairRequest in pair.go)
class DaemonPairRequest(SQLModel):
    code: str          # The raw token generated by POST /api/v1/nodes
    hostname: str
    os: str
    arch: str
    daemonVersion: str = Field(alias="daemonVersion")

# Response (matches PairResponse in pair.go)
class DaemonPairResponse(SQLModel):
    machineId: str
    authToken: str
    relayUrl: str

@router.post("/api/daemon/pair")
def daemon_pair(body: DaemonPairRequest, db: SessionDep):
    # 1. Find node by verifying the code (raw token) against stored hashes
    # 2. Generate a machineId (UUID) and a long-lived authToken
    # 3. Store machineId on the node record
    # 4. Return {machineId, authToken, relayUrl}
```

**Important:** The pairing flow has TWO tokens:
1. **Pairing code** -- generated by `POST /api/v1/nodes`, shown once to user, used by daemon during `POST /api/daemon/pair` to prove ownership
2. **Auth token** -- generated during pairing, returned to daemon, used for all subsequent WebSocket connections

[VERIFIED: node/daemon/internal/api/pair.go -- PairRequest and PairResponse structs]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| gorilla/websocket | coder/websocket | 2023 (gorilla unmaintained) | Daemon already uses coder/websocket -- no change needed |
| Sync-only SQLModel | SQLModel with async support | 2025 | Async is available but existing codebase is sync -- keep sync for this phase |
| Manual CORS | FastAPI CORSMiddleware | N/A | Already configured in app/main.py |

**Deprecated/outdated:**
- `fastapi-jwt-auth`: Third-party wrapper -- unnecessary since PyJWT + manual decode is already implemented and working in `security.py`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ConnectionManager should live in dedicated `relay/` module rather than inline in route handlers | Architecture Patterns | Low -- structural decision, easy to refactor |
| A2 | Sync DB pattern (create new Session per operation) is adequate for WebSocket handler throughput | Pattern 6 | Medium -- if event write throughput exceeds what sync psycopg can handle, would need async migration. Unlikely at initial scale. |
| A3 | `secrets.token_urlsafe(32)` provides sufficient entropy for pairing tokens | Pattern 4 | Low -- 32 bytes = 256 bits of entropy, same as industry standard |
| A4 | Two-token pairing flow (pairing code + auth token) matches daemon expectations | Code Examples | Medium -- if daemon expects a single token flow, pairing endpoint needs adjustment. Verified against pair.go struct but not tested end-to-end. |

## Open Questions

1. **Sequence number source for SessionEvent**
   - What we know: PROTOCOL.md defines `sequenceNumber` on `stream` messages. The daemon assigns these as WAL sequence numbers.
   - What's unclear: Should `SessionEvent.sequence_number` use the daemon's WAL sequence (preserving exactly-once semantics) or a server-assigned sequence?
   - Recommendation: Use the daemon's WAL sequence number. This preserves the protocol's exactly-once guarantee and enables `ack` messages to reference the same sequence. D-10 explicitly states ack uses the event's sequenceNumber.

2. **Token hashing: argon2 vs bcrypt for node tokens**
   - What we know: The existing `verify_password` supports both argon2 and bcrypt. Argon2 is slower (~200ms) than bcrypt (~75ms).
   - What's unclear: Is argon2 overhead acceptable for node pairing token verification (once per connection)?
   - Recommendation: Use argon2 (default) since verification happens once per connection, not per message. Consistency with the existing password hashing approach is more valuable than the ~125ms savings.

3. **How does the daemon discover the node's machine_id before first hello?**
   - What we know: `PairResponse` from `pair.go` returns a `machineId`. The daemon stores it in `~/.gsd-cloud/config.json`. The daemon sends it in the `hello` message.
   - What's unclear: Does the server generate `machineId` during pairing, or does the daemon generate it?
   - Recommendation: Server generates `machineId` (UUID) during the `POST /api/daemon/pair` call and returns it. This is consistent with the PairResponse struct.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest >=7.4.3 |
| Config file | `server/backend/pyproject.toml` (pytest config section absent -- uses defaults) |
| Quick run command | `cd server/backend && python -m pytest tests/ -x -q` |
| Full suite command | `cd server/backend && python -m pytest tests/ -v` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | User signup | unit | `pytest tests/api/routes/test_users.py -x -k signup` | Likely exists (existing template) |
| AUTH-02 | Login returns JWT | unit | `pytest tests/api/routes/test_login.py -x` | Likely exists (existing template) |
| AUTH-03 | Logout (client-side token discard) | N/A | No server test needed -- client behavior | N/A |
| AUTH-04 | Node pairing token generation + daemon pair | unit | `pytest tests/api/routes/test_nodes.py -x` | Wave 0 |
| SESS-01 | Session creation REST + task forwarding | integration | `pytest tests/api/routes/test_sessions.py -x` | Wave 0 |
| SESS-02 | Session stop forwarding | integration | `pytest tests/api/routes/test_sessions.py -x -k stop` | Wave 0 |
| SESS-06 | Multiple sessions on one node | integration | `pytest tests/api/routes/test_sessions.py -x -k multi` | Wave 0 |
| RELY-01 | Node WS connection + hello/welcome | integration | `pytest tests/relay/test_ws_node.py -x` | Wave 0 |
| RELY-02 | Message routing browser->node->browser | integration | `pytest tests/relay/test_routing.py -x` | Wave 0 |
| RELY-03 | Event persistence to PostgreSQL | unit | `pytest tests/relay/test_persistence.py -x` | Wave 0 |
| RELY-04 | Node reconnection handling | integration | `pytest tests/relay/test_reconnect.py -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/ -x -q --timeout=30`
- **Per wave merge:** `cd server/backend && python -m pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/api/routes/test_nodes.py` -- covers AUTH-04 (node pairing)
- [ ] `tests/api/routes/test_sessions.py` -- covers SESS-01, SESS-02, SESS-06
- [ ] `tests/relay/test_ws_node.py` -- covers RELY-01 (node WS hello/welcome)
- [ ] `tests/relay/test_ws_browser.py` -- covers browser WS auth
- [ ] `tests/relay/test_routing.py` -- covers RELY-02 (message routing)
- [ ] `tests/relay/test_persistence.py` -- covers RELY-03 (event storage + ack)
- [ ] `tests/relay/test_reconnect.py` -- covers RELY-04 (node reconnect)
- [ ] `tests/relay/__init__.py` -- package init
- [ ] `tests/conftest.py` -- extend existing fixtures for WebSocket testing (TestClient supports WebSocket via `with client.websocket_connect()`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | PyJWT for JWT, pwdlib (argon2) for token hashing -- already implemented |
| V3 Session Management | yes | JWT with 8-day expiry (existing), stateless -- no server-side session store |
| V4 Access Control | yes | Token-scoped-to-user (D-04); session creation validates user owns the node |
| V5 Input Validation | yes | Pydantic models for REST, JSON schema validation for WS messages |
| V6 Cryptography | no | No custom crypto -- using PyJWT (HS256) and pwdlib |

### Known Threat Patterns for FastAPI + WebSocket

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JWT in query param logged by proxies/servers | Information Disclosure | Use short-lived tokens; strip query params from access logs in Nginx config |
| WebSocket connection exhaustion (DoS) | Denial of Service | Validate auth before `accept()` (browser), close on auth failure within timeout (node), rate limit connections per IP |
| Cross-site WebSocket hijacking | Spoofing | Validate Origin header; JWT query param prevents unauthenticated connections |
| Token brute-force on pairing endpoint | Tampering | Argon2 makes brute-force impractical; rate limit pairing endpoint |
| channelId spoofing (browser sends wrong channelId) | Elevation of Privilege | Server validates that session belongs to authenticated user before routing |
| Node token replay after revocation | Spoofing | Check `is_revoked` during hello handshake; immediate disconnect on revocation (D-03) |

## Sources

### Primary (HIGH confidence)
- `server/backend/app/core/security.py` -- existing JWT + password hashing implementation
- `server/backend/app/models.py` -- existing User/Item model patterns
- `server/backend/app/api/deps.py` -- existing dependency injection patterns
- `server/backend/app/crud.py` -- existing CRUD helper patterns
- `server/backend/app/api/routes/login.py` -- existing login/auth route patterns
- `server/backend/app/api/routes/users.py` -- existing user registration (AUTH-01)
- `server/backend/pyproject.toml` -- dependency versions
- `node/protocol-go/PROTOCOL.md` -- wire protocol specification
- `node/protocol-go/messages.go` -- Go type definitions
- `node/daemon/internal/relay/client.go` -- daemon WebSocket client (auth mechanism)
- `node/daemon/internal/loop/daemon.go` -- daemon event loop (reconnect, hello/welcome)
- `node/daemon/internal/api/pair.go` -- daemon pairing client
- `node/daemon/internal/config/config.go` -- daemon config structure

### Secondary (MEDIUM confidence)
- [FastAPI WebSocket docs](https://fastapi.tiangolo.com/advanced/websockets/) -- WebSocket endpoint patterns
- [FastAPI WebSocket auth patterns](https://dev.to/hamurda/how-i-solved-websocket-authentication-in-fastapi-and-why-depends-wasnt-enough-1b68) -- JWT query param auth
- [FastAPI WebSocket ConnectionManager](https://oneuptime.com/blog/post/2026-02-02-fastapi-websockets/view) -- ConnectionManager pattern

### Tertiary (LOW confidence)
- None -- all claims verified against codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, everything already in pyproject.toml
- Architecture: HIGH -- patterns derived from existing codebase + protocol spec + CONTEXT.md decisions
- Database models: HIGH -- follow existing SQLModel patterns, schema specified in D-09
- WebSocket relay: HIGH -- protocol fully specified, daemon code verified
- Pitfalls: HIGH -- derived from verified code analysis (daemon auth mechanism, DB session lifecycle)

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable -- no fast-moving dependencies)
