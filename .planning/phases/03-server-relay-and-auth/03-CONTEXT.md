# Phase 3: Server Relay and Auth - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the FastAPI relay hub, JWT auth, node pairing, and core session lifecycle so that a browser client can authenticate, create a session on a paired node, and receive responses through the server relay hub. This phase delivers working end-to-end message relay — no WAL replay (Phase 5), no frontend UI (Phase 4). The backend API and WebSocket relay infrastructure are the deliverable.

Requirements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, SESS-01, SESS-02, SESS-06, RELY-01, RELY-02, RELY-03, RELY-04

</domain>

<decisions>
## Implementation Decisions

### Node Pairing Token

- **D-01:** Tokens are **long-lived and revocable** — no expiry by default. Node startup script stores the token once and reuses it across restarts. Survives server restarts.
- **D-02:** Token is **revealed once on generation** (like GitHub PATs). The UI shows it one time; the server stores only the bcrypt/argon2 hash. User copies it into the node's env/config.
- **D-03:** Revocation is **immediate disconnect** — server closes the WebSocket connection to the node and marks the token as revoked in DB. Any active sessions on that node receive a `taskError`.
- **D-04:** Tokens are **scoped to a user account** — each token belongs to one user. Sessions run on that node are attributed to that user. No server-wide shared tokens.

### Session Start Flow

- **D-05:** Sessions are created **REST-first** — browser calls `POST /api/v1/sessions` with `{nodeId, cwd}`, server creates a DB record and returns `{sessionId}`. Browser then opens a WebSocket and sends `task` with that `sessionId`. Server validates the session exists before accepting WS messages for it.
- **D-06:** Browser WebSocket authenticates via **JWT in query param** — `ws://.../ws/browser?token=<jwt>`. Browser WebSocket API cannot send custom headers; JWT query param is the standard FastAPI pattern.
- **D-07:** Session stop is **forward-only** — server forwards the `stop` message to the node daemon via WS. DB session state is updated when `taskComplete` or `taskError` arrives back from the daemon. No optimistic `stopping` state.

### Stream Event Storage

- **D-08:** **All events stored from day one** — every `stream` event (Claude output chunks) and all control events (taskStarted, taskComplete, taskError, permissionRequest, question) are written to PostgreSQL. Phase 5 WAL replay will read from this table without migration.
- **D-09:** Schema is **one row per event**: `session_id UUID`, `sequence_number INT8`, `event_type TEXT`, `payload JSONB`, `created_at TIMESTAMPTZ`. Primary key on `(session_id, sequence_number)`.
- **D-10:** `ack` messages are sent to the daemon **after the DB write confirms** — not fire-and-forget. Server writes the event to PostgreSQL, then sends `ack {sessionId, sequenceNumber}`. Daemon prunes WAL on ack per PROTOCOL.md semantics.

### Node Online/Offline State

- **D-11:** Node status uses **in-memory + DB hybrid** — `ConnectionManager` tracks live WebSocket connections in-memory (authoritative for routing). Server writes `connected_at` / `disconnected_at` / `last_seen` to the `nodes` table on connect, disconnect, and heartbeat. DB reflects last known state across server restarts.
- **D-12:** On receiving a `heartbeat` message from the daemon, the server **updates `last_seen` in PostgreSQL**. A node is considered offline if `last_seen` is older than 2× the heartbeat interval (or if its WebSocket connection is absent from ConnectionManager).

### Claude's Discretion

- Exact location of ConnectionManager class within the FastAPI app (dedicated module vs inline in the WebSocket route handlers)
- Whether `sequence_number` on the events table is the daemon's WAL sequence or a server-assigned sequence
- Alembic migration ordering for new tables (nodes, sessions, session_events)
- Whether to add a separate `node_status` enum type or use a string column for node online/offline state

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol
- `node/protocol-go/PROTOCOL.md` — Wire format spec; all message types, fields, hello/welcome/ack/replayRequest control flow
- `node/protocol-go/messages.go` — Go type definitions for all protocol messages (authoritative field names)

### Server Backend (existing — extend, don't replace)
- `server/backend/app/core/security.py` — JWT creation/verification, password hashing (already implemented)
- `server/backend/app/models.py` — Existing User model; new Node, Session, SessionEvent models go here
- `server/backend/app/api/routes/login.py` — Existing login route (`POST /login/access-token`); auth pattern to follow
- `server/backend/app/api/deps.py` — Existing `CurrentUser`, `SessionDep` dependency injection patterns
- `server/backend/app/core/config.py` — Settings class (ACCESS_TOKEN_EXPIRE_MINUTES, SECRET_KEY, etc.)
- `server/backend/app/api/main.py` — Where new routers are registered
- `server/backend/app/crud.py` — Existing CRUD pattern to follow for new models

### Tech Stack Reference
- `CLAUDE.md` §Server Backend and §WebSocket Relay — architecture decisions and rejected alternatives

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/core/security.py` `create_access_token()` — already handles JWT with expiry; node pairing token generation can use the same function or a simpler `secrets.token_urlsafe(32)` approach
- `app/core/security.py` `get_password_hash()` / `verify_password()` — reuse for hashing node pairing tokens (same argon2/bcrypt stack)
- `app/api/deps.py` `CurrentUser` — existing dependency for authenticated routes; new node/session routes follow this pattern
- `app/api/deps.py` `SessionDep` — async DB session dependency; all new routes use this
- `app/models.py` `User` + `UserPublic` — existing pattern for SQLModel table + public response model; Node, Session, SessionEvent follow same pattern
- `app/crud.py` — existing CRUD helper functions (get_user_by_email, authenticate); add similar helpers for node token verification

### Established Patterns
- Routes are registered as APIRouter in `app/api/routes/` and mounted in `app/api/main.py`
- All database models use SQLModel with `table=True` and UUID primary keys
- All timestamps use `datetime.now(timezone.utc)` via `get_datetime_utc()` helper
- Alembic is already configured — new tables go through migrations in `app/alembic/versions/`

### Integration Points
- `app/api/main.py` — mount new routers: `/nodes`, `/sessions`, `/ws/browser`, `/ws/node`
- `app/models.py` — add Node, Session, SessionEvent models (foreign-keyed to User)
- `app/alembic/versions/` — new migration for nodes, sessions, session_events tables
- FastAPI `@app.websocket()` endpoints — two new WS handlers (browser relay, node relay)

</code_context>

<specifics>
## Specific Ideas

No specific UI references or external examples — this is a backend infrastructure phase. The protocol is fully defined in PROTOCOL.md. The server auth patterns are already established in the existing deployable-saas-template code.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 3 scope.

</deferred>

---

*Phase: 03-server-relay-and-auth*
*Context gathered: 2026-04-09*
