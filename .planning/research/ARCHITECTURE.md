# Architecture Patterns

**Domain:** Self-hosted multi-node Claude Code session management platform
**Researched:** 2026-04-09

## System Overview

GSD Cloud is a three-tier relay architecture: Browser <-> Server <-> Node. The server is the hub -- it authenticates users, persists state, and relays WebSocket messages between browser clients and remote node daemons. Nodes are headless Go binaries that spawn Claude Code processes via pty and stream output back through the relay chain.

```
+------------------+       +----------------------------+       +-------------------+
|   Browser (GSD   | WS/   |        Server              | WS/   |   Node (daemon)   |
|   Vibe React)    |<----->|  FastAPI + PostgreSQL       |<----->|   Go binary       |
|                  | REST  |  (Docker Compose)           | JSON  |   (bare metal)    |
+------------------+       +----------------------------+       +-------------------+
                                      |
                                +-----+-----+
                                | PostgreSQL |
                                +-----------+
```

## Recommended Architecture

### The Relay Hub Pattern

The server is NOT a proxy -- it is a stateful relay hub. It must:
1. Maintain a registry of connected nodes (in-memory + DB)
2. Route browser messages to the correct node by machineId/sessionId
3. Route node messages back to the correct browser connection by channelId
4. Persist session metadata, usage stats, and stream events to PostgreSQL

This is the critical architectural insight: the server does NOT just forward bytes. It inspects every envelope's `type` field, updates its own state (session status, token counts, machine heartbeat timestamps), and then forwards to the appropriate destination.

### Component Boundaries

| Component | Responsibility | Communicates With | Protocol |
|-----------|---------------|-------------------|----------|
| **Frontend (GSD Vibe)** | User interface, session management UI, node monitoring | Server only | REST + WebSocket |
| **Server Backend (FastAPI)** | Auth, user/machine/session CRUD, WebSocket relay hub, event persistence | Frontend (REST/WS), Node (WS), PostgreSQL | HTTP, WS, SQL |
| **Server Frontend (static)** | Serves built React app | Nginx serves static files, proxies API to backend | HTTP |
| **PostgreSQL** | Users, machines, sessions, pairing codes, stream event log | Server Backend only | SQL |
| **Node Daemon (Go)** | Claude Code process lifecycle, WAL, pty management | Server only (outbound WS) | WebSocket JSON (protocol-go) |
| **protocol-go** | Wire format definitions, envelope parsing | Imported by daemon as Go library; spec consumed by server (Python) and frontend (TypeScript) | N/A (library) |

### Boundary Rules

- **Frontend never talks to nodes directly.** All communication is relayed through the server.
- **Nodes only make outbound connections.** No inbound ports needed on node machines.
- **PostgreSQL is only accessed by the server backend.** No direct DB access from frontend or nodes.
- **protocol-go is the source of truth** for all message types. The Python server and TypeScript frontend must conform to `PROTOCOL.md`, not the other way around.

## Data Flow

### Relay Chain: Browser -> Node (e.g., sending a task)

```
1. Browser sends REST POST /api/v1/sessions/{id}/task  (or WS frame)
      |
2. Server authenticates JWT, resolves sessionId -> machineId
      |
3. Server looks up machineId in its in-memory connection registry
      |
4. Server wraps as protocol envelope {"type":"task", ...} and writes to node's WS
      |
5. Node daemon receives envelope, dispatches to session.Manager -> Actor
      |
6. Actor spawns/resumes Claude CLI process via pty, sends prompt
```

### Relay Chain: Node -> Browser (e.g., streaming output)

```
1. Claude CLI writes to stdout, daemon's pty reader parses JSONL events
      |
2. Actor assigns sequenceNumber, writes to WAL, wraps as {"type":"stream",...}
      |
3. Daemon sends frame to server via its outbound WS connection
      |
4. Server receives frame, inspects type:
   - "stream": forward to browser WS connection matching channelId
   - "taskComplete": update session record in DB, then forward
   - "heartbeat": update machine.last_seen in DB, do NOT forward
      |
5. Server writes frame to browser's WS connection (matched by channelId)
      |
6. Browser React app receives event, updates UI
```

### Node Registration Flow (Pairing)

```
1. User clicks "Add Machine" in web UI -> server generates 6-char pairing code
      |
2. Server stores: PairingCode(code, user_id, expires_at) in DB
      |
3. User runs `gsd-cloud login ABCDEF` on the node machine
      |
4. Daemon POST /api/daemon/pair {code, hostname, os, arch, daemonVersion}
      |
5. Server validates code, creates Machine(id, user_id, hostname, ...) in DB
      |
6. Server generates machine-scoped auth token (JWT or opaque), returns:
   {machineId, authToken, relayUrl}
      |
7. Daemon saves to ~/.gsd-cloud/config.json
      |
8. On `gsd-cloud start`: daemon dials relayUrl with Bearer token,
   sends Hello frame, receives Welcome, enters event loop
```

### WebSocket Connection Registry (Server In-Memory State)

The server must maintain two maps:

```python
# Node connections: machineId -> WebSocket connection
node_connections: dict[str, WebSocket] = {}

# Browser connections: channelId -> WebSocket connection
browser_connections: dict[str, WebSocket] = {}
```

Routing logic:
- **Browser -> Node**: Message contains `sessionId`. Server queries DB: `SELECT machine_id FROM session WHERE id = ?`. Looks up `node_connections[machine_id]`, forwards.
- **Node -> Browser**: Message contains `channelId`. Looks up `browser_connections[channelId]`, forwards.
- **Heartbeat**: No forwarding. Update `machine.last_seen_at` in DB.
- **Hello/Welcome**: Connection lifecycle only. Populate/remove from `node_connections`.

### Session-to-Machine Mapping

Sessions must be pre-associated with a machine. When the browser creates a session, it selects a target machine. The server stores this mapping in PostgreSQL:

```
Session(id, user_id, machine_id, name, status, created_at, ...)
```

This lets the server route any `sessionId`-bearing message to the correct node without the browser needing to know the machineId.

## Monorepo Directory Layout

```
glsd/
  server/                         # Docker Compose deployable
    docker-compose.yml
    .env.example
    backend/
      Dockerfile
      app/
        main.py                   # FastAPI app
        core/
          config.py               # Settings (pydantic-settings)
          security.py             # JWT, password hashing
          db.py                   # SQLAlchemy engine + session
        models/
          user.py                 # From deployable-saas-template
          machine.py              # NEW: Machine registration
          session.py              # NEW: Claude session tracking
          pairing.py              # NEW: Pairing codes
        api/
          main.py                 # Router aggregator
          deps.py                 # Dependency injection (get_db, get_current_user)
          routes/
            auth.py               # Login, register, token refresh
            users.py              # User CRUD
            machines.py           # NEW: Machine CRUD, pairing code generation
            sessions.py           # NEW: Session CRUD
            ws_browser.py         # NEW: Browser WebSocket endpoint
            ws_node.py            # NEW: Node/daemon WebSocket endpoint
        relay/
          hub.py                  # NEW: Connection registry + routing logic
          protocol.py             # NEW: Python envelope types matching PROTOCOL.md
        alembic/
          versions/               # DB migrations
    frontend/
      Dockerfile                  # Multi-stage: npm build -> nginx
      nginx.conf
      package.json
      src/                        # GSD Vibe source (copied/adapted from gsd-vibe/)
        ...
  node/                           # Go binary, no Docker
    go.mod                        # module github.com/gsd-build/node
    go.sum
    cmd/
      gsd-cloud/
        main.go                   # Entry point
    internal/
      claude/                     # From daemon/internal/claude/
      config/                     # From daemon/internal/config/
      fs/                         # From daemon/internal/fs/
      loop/                       # From daemon/internal/loop/
      relay/                      # From daemon/internal/relay/
      session/                    # From daemon/internal/session/
      wal/                        # From daemon/internal/wal/
    scripts/
      install.sh                  # curl-pipe installer
  protocol/                       # Wire format spec (shared reference)
    PROTOCOL.md                   # Authoritative spec
    go/                           # Go bindings (imported by node/)
      envelope.go
      messages.go
    ts/                           # TypeScript types (imported by server/frontend/)
      protocol.ts
```

### Key Layout Decisions

**protocol/ is top-level, not nested.** Both `server/` and `node/` depend on it. The Go code in `protocol/go/` is imported by `node/go.mod` as a module. The TypeScript types in `protocol/ts/` are imported by `server/frontend/`. Keeping it at the top makes this cross-language dependency clear.

**node/ replaces daemon/.** The existing `daemon/` code moves wholesale into `node/internal/`. The Go module path changes from `github.com/gsd-build/daemon` to `github.com/gsd-build/node`. The `protocol-go` import path changes to `github.com/gsd-build/glsd/protocol/go` (or stays external if preferred).

**server/frontend/ is a separate build from server/backend/.** The frontend builds to static files served by nginx. The backend is a Python process. Docker Compose runs both as separate services, plus PostgreSQL. This matches the existing deployable-saas-template pattern.

## Patterns to Follow

### Pattern 1: Server-Side WebSocket Hub

**What:** A central hub class manages all active WebSocket connections, provides send-to-node and send-to-browser methods, and handles connection lifecycle.

**When:** Always -- this is the core of the relay.

```python
# server/backend/app/relay/hub.py
class RelayHub:
    def __init__(self):
        self._nodes: dict[str, WebSocket] = {}      # machineId -> ws
        self._browsers: dict[str, WebSocket] = {}    # channelId -> ws

    async def register_node(self, machine_id: str, ws: WebSocket):
        self._nodes[machine_id] = ws

    async def register_browser(self, channel_id: str, ws: WebSocket):
        self._browsers[channel_id] = ws

    async def send_to_node(self, machine_id: str, message: dict):
        ws = self._nodes.get(machine_id)
        if ws:
            await ws.send_json(message)

    async def send_to_browser(self, channel_id: str, message: dict):
        ws = self._browsers.get(channel_id)
        if ws:
            await ws.send_json(message)
```

The hub is a singleton, created at app startup and injected via FastAPI dependency.

### Pattern 2: Envelope-Based Message Routing

**What:** Every message is a JSON object with a `type` field. The server inspects `type` to decide routing + side effects.

**When:** All WebSocket message handling.

```python
async def handle_node_message(hub: RelayHub, db: Session, raw: dict):
    msg_type = raw.get("type")

    if msg_type == "heartbeat":
        await update_machine_heartbeat(db, raw["machineId"], raw["timestamp"])
        return  # Do NOT forward heartbeats to browser

    if msg_type == "taskComplete":
        await update_session_stats(db, raw)
        # Fall through to forward

    channel_id = raw.get("channelId")
    if channel_id:
        await hub.send_to_browser(channel_id, raw)
```

### Pattern 3: WAL + Sequence Numbers for Reliability

**What:** The daemon writes every stream event to a write-ahead log with monotonically increasing sequence numbers. On reconnect, the server tells the daemon the last sequence it persisted, and the daemon replays from there.

**When:** This is already implemented in the daemon. The server must implement the other side: track `acked_sequence` per session in PostgreSQL, send `welcome` with acked sequences on connect, send `ack` as it persists events, send `replayRequest` if it detects gaps.

### Pattern 4: Pairing Code for Node Registration

**What:** Short-lived 6-character codes generated by the server, entered on the node machine to establish trust.

**When:** This is the auth bootstrap for nodes. Already partially implemented in the daemon's `api/pair.go`. The server needs the matching endpoint: `POST /api/daemon/pair`.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Transparent Proxy / Byte Forwarding

**What:** Treating the server as a dumb pipe that forwards WebSocket bytes without inspection.

**Why bad:** The server MUST inspect messages to: update session state, track usage/costs, enforce authorization (user can only access their own machines), detect node disconnections, persist stream events for late-joining browsers.

**Instead:** Every message goes through the envelope parser. The server reads `type`, performs side effects, then forwards.

### Anti-Pattern 2: Storing Node Auth Tokens in the Database as Plaintext

**What:** The `authToken` returned during pairing and stored by the daemon.

**Why bad:** If the database is compromised, an attacker can impersonate any node.

**Instead:** Store a hash of the token. When the daemon connects, verify the token against the hash. Alternatively, use JWTs signed by the server's secret key with the machineId as the subject -- then no DB lookup is needed for token verification.

### Anti-Pattern 3: Coupling Frontend to Node Protocol Details

**What:** Having the React frontend construct raw protocol envelopes (e.g., building `{"type":"task","taskId":"..."}` objects directly).

**Why bad:** Ties the frontend to the wire protocol. If the protocol evolves, the frontend breaks.

**Instead:** The frontend calls REST endpoints or sends simplified WebSocket messages. The server translates to/from the protocol-go wire format. The frontend's WebSocket contract is: send `{action: "sendTask", sessionId, prompt, ...}` and receive `{type: "stream", ...}` events. The server handles the envelope wrapping.

### Anti-Pattern 4: One WebSocket Per Session on the Browser Side

**What:** Opening a separate WebSocket connection for each active session tab.

**Why bad:** Users with multiple sessions would have many connections. Browser limits apply.

**Instead:** One WebSocket per browser client. The `channelId` field multiplexes all sessions over that single connection. The frontend routes incoming events to the correct session view by channelId.

## New Database Models (Server)

The existing `deployable-saas-template` has User and Item models. The following must be added:

```
Machine
  id: UUID (PK)
  user_id: UUID (FK -> User)
  hostname: str
  os: str
  arch: str
  daemon_version: str
  auth_token_hash: str          # bcrypt hash of the node's auth token
  status: enum(online, offline)
  last_seen_at: datetime
  created_at: datetime

PairingCode
  id: UUID (PK)
  user_id: UUID (FK -> User)
  code: str (6 chars, unique, indexed)
  expires_at: datetime
  redeemed: bool

Session
  id: UUID (PK)
  user_id: UUID (FK -> User)
  machine_id: UUID (FK -> Machine)
  name: str
  status: enum(idle, running, waiting_permission, error)
  claude_session_id: str?       # For --resume
  cwd: str
  model: str
  total_input_tokens: int
  total_output_tokens: int
  total_cost_usd: decimal
  created_at: datetime
  updated_at: datetime

StreamEvent (optional, for persistence/replay to late-joining browsers)
  id: bigint (PK, auto)
  session_id: UUID (FK -> Session)
  sequence_number: int
  event_data: jsonb
  created_at: datetime
```

## Server WebSocket Endpoints

Two distinct WebSocket endpoints on the server:

### `/api/v1/ws/browser`
- Auth: JWT token (same as REST API auth)
- Client sends: `task`, `stop`, `permissionResponse`, `questionResponse`, `browseDir`, `readFile`
- Client receives: `stream`, `taskStarted`, `taskComplete`, `taskError`, `permissionRequest`, `question`, `browseDirResult`, `readFileResult`
- On connect: browser sends a `subscribe` message with desired channelId
- On disconnect: remove from browser_connections registry

### `/api/v1/ws/node`
- Auth: Bearer token in WS handshake headers (the machine's authToken)
- Node sends: `hello` (first frame), then `stream`, `taskStarted`, `taskComplete`, `taskError`, `permissionRequest`, `question`, `heartbeat`, `browseDirResult`, `readFileResult`
- Node receives: `welcome` (first frame), then `task`, `stop`, `permissionResponse`, `questionResponse`, `browseDir`, `readFile`, `ack`, `replayRequest`
- On connect: validate token, register in node_connections
- On disconnect: mark machine as offline, remove from node_connections

## Scalability Considerations

| Concern | Self-hosted (1-5 users) | Growth (10-50 users) |
|---------|------------------------|----------------------|
| WebSocket connections | Single-process FastAPI handles hundreds easily | Still fine -- FastAPI + uvicorn async handles thousands |
| Stream event storage | Store all in PostgreSQL | Add TTL / cleanup job for old stream events |
| Node connections | In-memory dict per process | If multi-process, need Redis pub/sub for cross-worker routing |
| Session state | PostgreSQL | PostgreSQL remains fine at this scale |

For the self-hosted use case (the primary target), single-process FastAPI is more than sufficient. Redis or multi-worker routing is not needed and should not be built preemptively.

## Suggested Build Order

Dependencies flow upward -- build bottom layers first.

### Phase 1: Foundation (No WebSocket relay yet)

1. **Monorepo scaffold** -- Create `server/` and `node/` directories, move existing code
2. **protocol/ extraction** -- Move `protocol-go/` to `protocol/go/`, create `protocol/ts/` with TypeScript types generated from PROTOCOL.md
3. **Server database models** -- Add Machine, PairingCode, Session models + Alembic migrations
4. **Server REST APIs** -- Machine CRUD, pairing code generation, session CRUD
5. **Node code migration** -- Move `daemon/` internals into `node/internal/`, update Go module paths

**Why first:** Everything else depends on the monorepo structure, data models, and REST APIs being in place. No WebSocket complexity yet -- just CRUD.

### Phase 2: Relay Chain

6. **Server WebSocket endpoints** -- `/ws/node` and `/ws/browser` with RelayHub
7. **Node pairing flow** -- Server endpoint `POST /api/daemon/pair` + node `gsd-cloud login` pointing at server
8. **Hello/Welcome handshake** -- Server implements the node connection lifecycle
9. **Message routing** -- Server inspects envelopes, routes between browser and node connections
10. **Heartbeat handling** -- Server updates machine status on heartbeat, marks offline on disconnect

**Why second:** The relay is the core of the system. Building it after the data models means routing can query the DB for session-to-machine mappings.

### Phase 3: Frontend Integration

11. **GSD Vibe migration** -- Move gsd-vibe source into `server/frontend/src/`
12. **API client adaptation** -- Replace any existing API calls with server REST endpoints
13. **WebSocket client** -- Connect to `/ws/browser`, handle multiplexed channelId events
14. **Node management UI** -- View connected machines, add machine (pairing code flow)
15. **Session management UI** -- Create/resume sessions, select target machine

**Why third:** Frontend needs both REST APIs (Phase 1) and WebSocket relay (Phase 2) to function.

### Phase 4: Reliability + Polish

16. **WAL replay integration** -- Server persists stream events, sends ack/replayRequest on reconnect
17. **Docker Compose finalization** -- Production-ready compose with all services
18. **Install script for node** -- `curl | bash` installer that builds the Go binary
19. **Error handling hardening** -- Graceful degradation on node disconnect, reconnect UI

**Why last:** Reliability features build on a working end-to-end system. Premature reliability work wastes effort if the routing layer changes.

## Key Architectural Decisions to Lock In Early

1. **Server owns session-to-machine mapping.** The browser never needs to know the machineId -- it operates on sessionIds. The server resolves the route.

2. **One browser WebSocket, multiplexed by channelId.** Not one-WS-per-session.

3. **The node always connects outbound to the server.** The server never dials the node. This means nodes behind NAT/firewalls work without port forwarding.

4. **Protocol-go remains the spec.** The Python server and TypeScript frontend are consumers of the spec, not co-owners. Changes flow: PROTOCOL.md -> Go types -> Python/TS implementations.

5. **RelayHub is in-memory, single-process.** No Redis, no message queue. The self-hosted target does not need distributed state.

## Sources

- Existing codebase: `daemon/`, `protocol-go/`, `deployable-saas-template/`, `gsd-vibe/`
- Protocol spec: `protocol-go/PROTOCOL.md` (authoritative)
- FastAPI WebSocket documentation (HIGH confidence -- well-established pattern)
- Existing daemon architecture: proven patterns for WAL, session actors, relay client
