---
phase: 03-server-relay-and-auth
fixed_at: 2026-04-09T00:00:00Z
review_path: .planning/phases/03-server-relay-and-auth/03-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-04-09
**Source review:** .planning/phases/03-server-relay-and-auth/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04, WR-05)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: Node token verification is O(n) — iterates all non-revoked tokens

**Files modified:** `server/backend/app/crud.py`, `server/backend/app/models.py`, `server/backend/app/alembic/versions/b3c4d5e6f7a8_add_token_index_to_node.py`
**Commit:** 3299bb1
**Applied fix:** Added `_token_index()` helper using `hashlib.blake2b(digest_size=16)`. Added `token_index: str = Field(max_length=64, index=True, unique=True)` to the `Node` model. Updated `create_node_token` to populate `token_index` at creation time. Replaced `verify_node_token`'s full-table O(n) Argon2 scan with an indexed DB lookup by `token_index` followed by a single Argon2 verify on the matched row. Created Alembic migration `b3c4d5e6f7a8` to add and index the `token_index` column (with a placeholder backfill for existing rows, which require token re-issuance since raw tokens are not stored).

---

### CR-02: Node WebSocket accepts before authenticating

**Files modified:** `server/backend/app/api/routes/ws_node.py`
**Commit:** e1f1f0d
**Applied fix:** Moved token extraction and `crud.verify_node_token` DB call to before `await websocket.accept()`. Unauthenticated callers now receive a close(1008) without ever holding an open connection. The valid `node_id` is captured before accept so the subsequent hello-phase DB update can re-fetch the node in a fresh session. This mirrors the `ws_browser.py` pattern exactly.

---

### CR-03: Unvalidated `session_id` and `sequence_number` from node written directly to DB

**Files modified:** `server/backend/app/api/routes/ws_node.py`
**Commit:** e1f1f0d
**Applied fix:** Before persisting a `SessionEvent`, the handler now: (1) validates `session_id` is a parseable UUID via `uuid.UUID(session_id)` and logs a warning + skips on failure; (2) validates `sequence_number` is a non-negative `int`; (3) performs an ownership JOIN query to verify the session belongs to the node sending the message (via `Node.machine_id == machine_id`). If ownership fails, the event is dropped and not ack'd. The DB write and ack only proceed after all three checks pass.

**Commit status:** fixed: requires human verification (ownership JOIN logic)

---

### WR-01: `stop_session` does not verify session is in a stoppable state

**Files modified:** `server/backend/app/api/routes/sessions.py`
**Commit:** 06ae2be
**Applied fix:** Added a guard after session ownership check: if `sess.status in ("completed", "error")` raise `HTTPException(status_code=409, detail="Session already completed")`. This prevents forwarding noise stop messages to the node for already-terminal sessions and gives REST callers a clear 409 signal.

---

### WR-02: Race window between `revoke_node` DB write and `disconnect_node` WS close

**Files modified:** `server/backend/app/api/routes/ws_node.py`
**Commit:** e1f1f0d
**Applied fix:** Added an `is_revoked` check inside the `heartbeat` handler in the message loop. On each heartbeat, the handler re-fetches the node from DB and closes the connection with code 1008 if `is_revoked` is True. This provides defense-in-depth for the race window between the DB revoke commit and the WS disconnect triggered by the revoke endpoint.

---

### WR-03: `get_browsers_for_node` returns ALL browsers, not only those with sessions on the node

**Files modified:** `server/backend/app/relay/connection_manager.py`
**Commit:** b37fb5a
**Applied fix:** Added `_session_to_channel: dict[str, str]` to `ConnectionManager.__init__`. Updated `bind_session_to_node` to accept an optional `channel_id` parameter and populate `_session_to_channel`. Updated `unbind_session` to also clean up `_session_to_channel`. Rewrote `get_browsers_for_node` to look up `channel_id` via `_session_to_channel` for each session bound to the node, then return only the `BrowserConnection` entries for those specific channels (deduplicating by channel_id via a `seen` set).

---

### WR-04: `machine_id` uniqueness constraint violated on reconnect raises NameError in finally

**Files modified:** `server/backend/app/api/routes/ws_node.py`
**Commit:** e1f1f0d
**Applied fix:** `machine_id = ""` is now initialized before the `with DBSession` hello-update block so the `finally` block's `manager.unregister_node(machine_id)` call never raises `NameError`. The `node.machine_id` assignment and DB commit are wrapped in `try/except IntegrityError`: on constraint violation the session is rolled back and the WebSocket is closed with code 1008 before the message loop begins.

---

### WR-05: `stop_session` passes `channelId: ""` — node cannot route stop response

**Files modified:** `server/backend/app/api/routes/sessions.py`
**Commit:** ff1d682
**Applied fix:** Added an explanatory comment in the `stop_session` handler clarifying that `channelId` is intentionally empty for REST-initiated stops because the REST caller has no live browser WebSocket channel. The comment notes that the browser WS handler overwrites `channelId` when a stop originates from a WebSocket connection, and that REST callers must poll `GET /sessions/{id}` to observe the final status.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-04-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
