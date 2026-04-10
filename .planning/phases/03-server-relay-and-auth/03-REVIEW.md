---
phase: 03-server-relay-and-auth
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - server/backend/app/alembic/versions/a1b2c3d4e5f6_add_node_session_and_session_event_tables.py
  - server/backend/app/api/main.py
  - server/backend/app/api/routes/nodes.py
  - server/backend/app/api/routes/sessions.py
  - server/backend/app/api/routes/ws_browser.py
  - server/backend/app/api/routes/ws_node.py
  - server/backend/app/crud.py
  - server/backend/app/main.py
  - server/backend/app/models.py
  - server/backend/app/relay/__init__.py
  - server/backend/app/relay/connection_manager.py
  - server/backend/app/relay/protocol.py
  - server/backend/tests/api/__init__.py
  - server/backend/tests/api/routes/__init__.py
  - server/backend/tests/api/routes/test_auth.py
  - server/backend/tests/api/routes/test_nodes.py
  - server/backend/tests/api/routes/test_sessions.py
  - server/backend/tests/conftest.py
  - server/backend/tests/test_foundation.py
  - server/backend/tests/ws/__init__.py
  - server/backend/tests/ws/test_browser_relay.py
  - server/backend/tests/ws/test_event_storage.py
  - server/backend/tests/ws/test_node_relay.py
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

This phase implements the node pairing REST endpoints, session lifecycle REST endpoints, browser and node WebSocket relay handlers, an in-memory `ConnectionManager`, Pydantic protocol models, DB models, and a supporting Alembic migration.

The implementation is well-structured and the security-sensitive parts (token hashing, timing-attack prevention on auth, JWT pre-accept validation, channelId overwrite to block spoofing) are handled correctly. However, three critical issues exist: a linear-scan token verification function that is quadratic under load and opens a timing-based enumeration risk, an unconditional `websocket.accept()` before authentication in the node endpoint, and unvalidated/unsanitized `session_id` and `sequence_number` values being written directly to the DB from untrusted node messages. Five warnings cover authorization gaps in the `stop_session` flow, a race window in the revoke-disconnect path, a missing unique-constraint guard for `machine_id` reconnection, a broad-exception swallow in the node WS finally-block, and the `get_browsers_for_node` method returning all browsers regardless of session ownership.

---

## Critical Issues

### CR-01: Node token verification is O(n) — iterates all non-revoked tokens

**File:** `server/backend/app/crud.py:101-116`

**Issue:** `verify_node_token` fetches every non-revoked `Node` row and runs an Argon2 hash comparison against each one. Argon2 is deliberately slow (tens of milliseconds per call). With even a few hundred nodes this function blocks the thread for seconds and makes the WebSocket connection handshake trivially deniable. More importantly, the iteration order is deterministic (insertion order from the DB) and the function returns as soon as a match is found, so an attacker who can observe response-time differences (or connection queue depth) can enumerate which position in the table a valid node occupies. This violates D-01 (tokens are long-lived and must remain secure).

The root cause is that the token is stored as an Argon2 hash with no lookup key. The correct fix is to store a fast, constant-time lookup index alongside the Argon2 hash (a BLAKE2b/SHA-256 prefix of the raw token works), query by that index, then verify the full Argon2 hash on the single matching row.

**Fix:**
```python
# In crud.py -- replace the linear scan with an indexed lookup

import hashlib

def _token_index(raw_token: str) -> str:
    """Fast non-secret index -- used only for DB lookup, not for auth."""
    return hashlib.blake2b(raw_token.encode(), digest_size=16).hexdigest()

def create_node_token(*, session: Session, user_id: uuid.UUID, name: str) -> tuple[Node, str]:
    raw_token = secrets.token_urlsafe(32)
    node = Node(
        name=name,
        user_id=user_id,
        token_hash=get_password_hash(raw_token),
        token_index=_token_index(raw_token),   # new indexed column
        is_revoked=False,
    )
    session.add(node)
    session.commit()
    session.refresh(node)
    return node, raw_token

def verify_node_token(*, session: Session, token: str) -> Node | None:
    idx = _token_index(token)
    node = session.exec(
        select(Node).where(Node.token_index == idx, Node.is_revoked == False)
    ).first()
    if not node:
        return None
    verified, updated_hash = verify_password(token, node.token_hash)
    if not verified:
        return None
    if updated_hash:
        node.token_hash = updated_hash
        session.add(node)
        session.commit()
        session.refresh(node)
    return node
```

Add `token_index: str = Field(index=True, unique=True)` to the `Node` model and a corresponding Alembic migration column.

---

### CR-02: Node WebSocket accepts before authenticating — unauthenticated frames accumulate

**File:** `server/backend/app/api/routes/ws_node.py:29`

**Issue:** `await websocket.accept()` is called unconditionally on line 29, before the token is validated and before the `hello` message is received. An unauthenticated caller can establish a real WebSocket connection and hold it open indefinitely (or send junk frames) without ever presenting a valid token. This bypasses the pre-accept close(1008) pattern that `ws_browser.py` correctly implements for its JWT check. The `ws_browser.py` approach is the right model: validate before calling `accept()`.

Note: for WebSocket endpoints, FastAPI/Starlette requires `accept()` to be called to send a close frame; however, it is possible to close immediately after accepting. The correct pattern here is identical to `ws_browser.py` — extract and validate the token query param first, then accept only if valid (or accept + immediately close with 1008 before reading any additional frames).

**Fix:**
```python
@router.websocket("/ws/node")
async def ws_node(websocket: WebSocket) -> None:
    # 1. Validate token BEFORE accept (mirrors ws_browser.py pattern)
    token = websocket.query_params.get("token", "")
    if not token:
        auth = websocket.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        await websocket.close(code=1008, reason="Missing authentication")
        return

    # 2. Verify token against DB before accepting the connection
    with DBSession(engine) as db:
        node = crud.verify_node_token(session=db, token=token)
        if not node:
            await websocket.close(code=1008, reason="Invalid token")
            return

    # 3. Now accept
    await websocket.accept()

    # 4. Wait for hello message ...
```

---

### CR-03: Unvalidated `session_id` and `sequence_number` from node written directly to DB

**File:** `server/backend/app/api/routes/ws_node.py:131-151`

**Issue:** When a node sends a `stream`, `taskStarted`, `taskComplete`, or `taskError` message, the handler extracts `session_id` and `seq` from the raw JSON dict and passes them directly to `SessionEvent(session_id=session_id, ...)` without:

1. Validating that `session_id` is a valid UUID.
2. Verifying that the session belongs to the node that sent the message (a compromised or misconfigured node can write events for sessions it doesn't own).
3. Clamping or validating `seq` is a positive integer.

If `session_id` is not a valid UUID, the `db.add(event)` / `db.commit()` call will raise an unhandled exception inside the `with DBSession(engine) as db:` block that will propagate out and crash the message loop for that node connection (line 189's bare `except Exception` catches it, but the connection is then torn down unexpectedly). More critically, if validation is skipped, a malicious node can forge events for sessions belonging to other users (cross-tenant data corruption).

**Fix:**
```python
# After extracting session_id and seq from msg, validate ownership:
session_id = msg.get("sessionId")
seq = msg.get("sequenceNumber")
if session_id and seq is not None:
    # Validate session_id format and ownership
    try:
        sid_uuid = uuid.UUID(session_id)
    except (ValueError, AttributeError):
        logger.warning("Node %s sent invalid sessionId: %s", machine_id, session_id)
        continue  # skip persistence, don't ack

    if not isinstance(seq, int) or seq < 0:
        logger.warning("Node %s sent invalid sequenceNumber: %s", machine_id, seq)
        continue

    with DBSession(engine) as db:
        # Verify the session belongs to this node
        sess = db.exec(
            select(SessionModel)
            .join(Node, SessionModel.node_id == Node.id)
            .where(SessionModel.id == sid_uuid)
            .where(Node.machine_id == machine_id)
        ).first()
        if not sess:
            logger.warning(
                "Node %s attempted to write event for unowned session %s",
                machine_id, session_id,
            )
            continue  # do NOT ack; node should retransmit to the correct target

        event = SessionEvent(
            session_id=sid_uuid,
            sequence_number=seq,
            event_type=msg_type,
            payload=msg,
        )
        db.add(event)
        db.commit()
    # D-10: ack only after successful DB write
    await websocket.send_json({"type": "ack", "sessionId": session_id, "sequenceNumber": seq})
```

---

## Warnings

### WR-01: `stop_session` does not verify session is in a stoppable state

**File:** `server/backend/app/api/routes/sessions.py:60-84`

**Issue:** `POST /sessions/{id}/stop` forwards the stop message to the node regardless of the session's current `status`. A session in `completed`, `error`, or `created` (never started) state will still have a stop message forwarded to the node. For `completed`/`error` sessions this is a no-op on the node but constitutes noise on the wire. For a `created` session (node has no active PTY for it), the node will receive a stop it cannot act on and there is no recovery path. The session status remains unchanged in the DB (by design for the forward-only pattern), but the caller receives a 200 with status `completed` with no indication the stop was a no-op.

**Fix:** Guard against stopping already-terminal sessions:
```python
if sess.status in ("completed", "error"):
    raise HTTPException(status_code=409, detail="Session already completed")
```

---

### WR-02: Race window between `revoke_node` DB write and `disconnect_node` WS close

**File:** `server/backend/app/api/routes/nodes.py:78-108`

**Issue:** `crud.revoke_node()` commits `is_revoked=True` to the DB (line 78), then the endpoint proceeds to call `manager.disconnect_node()` (line 108). Between those two operations, the daemon's message loop is still running and can accept and process new messages. In `ws_node.py`, there is no check of `is_revoked` in the message loop — so a revoked node can still forward messages to browsers and write events to the DB for the window between the DB commit and the WS close. This is a logic error: a revoked node should stop being trusted immediately at the DB write.

**Fix:** In `ws_node.py`, add an `is_revoked` check in the message loop (or at minimum for `task` and event-persistence paths):
```python
# Near the top of the while True: loop in ws_node
with DBSession(engine) as db:
    n = db.exec(select(Node).where(Node.machine_id == machine_id)).first()
    if not n or n.is_revoked:
        await websocket.close(code=1008, reason="Token revoked")
        return
```

This does not need to run on every message — it can run periodically (e.g., every N messages) or as part of the heartbeat handler. The disconnect from the revoke endpoint will also terminate the loop, so this is defense-in-depth for the narrow race window.

---

### WR-03: `get_browsers_for_node` returns ALL browsers, not only those with sessions on the node

**File:** `server/backend/app/relay/connection_manager.py:102-111`

**Issue:** `get_browsers_for_node` iterates `_session_to_node` to find sessions belonging to `machine_id`, then for each such session appends every value in `self._browsers` to the result. The inner loop (`for browser in self._browsers.values()`) is not scoped to the session's owning channel. This means a revocation event sends `taskError` to every connected browser, not just those whose channels are bound to sessions on the revoked node. The method is not called in production code (the revocation path in `nodes.py` uses `manager._browsers` directly), but its semantics are incorrect and it will produce incorrect results if used.

**Fix:**
```python
def get_browsers_for_node(self, machine_id: str) -> list[BrowserConnection]:
    """Return browser connections that have at least one session on this node."""
    # Collect channel_ids that have sessions bound to this machine
    channel_ids = set()
    for session_id, node_machine_id in self._session_to_node.items():
        if node_machine_id == machine_id:
            # Find which browser channel is using this session
            # (session_id is keyed by sessionId, not channelId -- need reverse map)
            pass  # See note below
    # The current data model maps session_id -> machine_id but NOT session_id -> channel_id.
    # Fix: also maintain _session_to_channel: dict[str, str] in bind_session_to_node.
    result = []
    for cid, browser in self._browsers.items():
        if cid in channel_ids:
            result.append(browser)
    return result
```

The deeper fix is to add `_session_to_channel: dict[str, str]` tracking in `bind_session_to_node`:
```python
def bind_session_to_node(self, session_id: str, machine_id: str, channel_id: str) -> None:
    self._session_to_node[session_id] = machine_id
    self._session_to_channel[session_id] = channel_id
```

---

### WR-04: `machine_id` uniqueness constraint violated on reconnect when old connection is still in DB

**File:** `server/backend/app/api/routes/ws_node.py:67-77`

**Issue:** On reconnect, a daemon sends a `hello` with its `machine_id`. The handler sets `node.machine_id = hello.machine_id` and commits (line 67-75). The `machine_id` column has `unique=True` (models.py:143). If a second node record (from a revoked/replaced pairing) exists with the same `machine_id`, the `db.commit()` on line 74 will raise an `IntegrityError` (unique constraint violation). The `with DBSession(engine) as db:` block does not catch `IntegrityError`, so this exception propagates past the authentication logic and is caught only by the top-level `except Exception as e:` in the message loop — but at that point `machine_id` is not yet defined (it is assigned on line 77 after the commit), so the `finally` block's `manager.unregister_node(machine_id)` call on line 191 will raise a `NameError`.

**Fix:** Wrap the `node.machine_id` update in a try/except for `IntegrityError`:
```python
from sqlalchemy.exc import IntegrityError

try:
    node.machine_id = hello.machine_id
    # ... other fields ...
    db.add(node)
    db.commit()
    db.refresh(node)
    user_id = str(node.user_id)
    machine_id = hello.machine_id
except IntegrityError:
    db.rollback()
    await websocket.close(code=1008, reason="machine_id already registered to another token")
    return
```

Additionally, define `machine_id = ""` before the `with DBSession` block so the `finally` block does not `NameError`:
```python
machine_id = ""   # safe default for finally block
with DBSession(engine) as db:
    ...
```

---

### WR-05: `stop_session` passes `channelId: ""` — node cannot route the stop response

**File:** `server/backend/app/api/routes/sessions.py:76-83`

**Issue:** The REST-initiated stop message is built with `"channelId": ""`. The node daemon uses `channelId` to route any `taskError` or `taskComplete` response back to the correct browser. With an empty `channelId`, the daemon's response (if any) will be sent to `manager.send_to_browser("")`, which will silently fail (no browser is registered under an empty channel ID). The browser that originated the stop (if any) will never receive the completion acknowledgment.

The comment says "channelId set by browser WS handler" but the browser WS handler's `stop` path (ws_browser.py:114-122) correctly overwrites it. However, the REST `stop_session` route does not go through the browser WS handler, so it has no channel context.

**Fix:** Either:
1. Accept an optional `channelId` in the `stop` REST body (`SessionStopRequest`), or
2. Document that REST-initiated stops will not receive a routed completion event and that callers must poll the session status endpoint.

At minimum, add a comment in the code explaining why `channelId` is empty here and what the expected behavior is when the node sends a `taskComplete`/`taskError` in response.

---

## Info

### IN-01: `items` router is still registered — leftover from the template

**File:** `server/backend/app/api/main.py:10`

**Issue:** `api_router.include_router(items.router)` is present. The `items` resource is a template placeholder that has no relationship to GSD Cloud functionality. Leaving it registered exposes unused endpoints and may confuse API documentation consumers.

**Fix:** Remove `items` from `api_router` includes and remove `items` from the imports if the resource is fully superseded by the new node/session models.

---

### IN-02: `update_session_status` accepts arbitrary `**kwargs` and uses `setattr`

**File:** `server/backend/app/crud.py:182-195`

**Issue:** The `update_session_status` function accepts `**kwargs` and sets arbitrary attributes on the `SessionModel` via `setattr(sess, key, value)`. This pattern silently ignores unknown field names (the `hasattr` guard is a correctness safety net, not a validation gate). A caller passing a mistyped keyword (e.g., `complted_at` instead of `completed_at`) will silently fail to update the intended field. Use explicit keyword parameters for the handful of mutable fields.

**Fix:**
```python
def update_session_status(
    *,
    session: Session,
    session_id: uuid.UUID,
    status: str,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    claude_session_id: str | None = None,
) -> SessionModel | None:
    sess = session.get(SessionModel, session_id)
    if not sess:
        return None
    sess.status = status
    if started_at is not None:
        sess.started_at = started_at
    if completed_at is not None:
        sess.completed_at = completed_at
    if claude_session_id is not None:
        sess.claude_session_id = claude_session_id
    session.add(sess)
    session.commit()
    session.refresh(sess)
    return sess
```

---

### IN-03: `bind_session_to_node` and `unbind_session` are not protected by the lock

**File:** `server/backend/app/relay/connection_manager.py:60-64`

**Issue:** `bind_session_to_node` and `unbind_session` mutate `_session_to_node` without holding `_lock`. All other mutating methods (`register_node`, `unregister_node`, `register_browser`, `unregister_browser`, `disconnect_node`) acquire `_lock`. Because these methods are called from async contexts and the lock is an `asyncio.Lock`, unprotected writes can interleave with concurrent reads in `get_sessions_for_node`, `get_node_for_session`, and `get_browsers_for_node`. This is a latent race condition under concurrent load.

**Fix:** Make both methods async and acquire `_lock`:
```python
async def bind_session_to_node(self, session_id: str, machine_id: str) -> None:
    async with self._lock:
        self._session_to_node[session_id] = machine_id

async def unbind_session(self, session_id: str) -> None:
    async with self._lock:
        self._session_to_node.pop(session_id, None)
```

Update callers in `ws_browser.py` and `nodes.py` with `await`.

---

### IN-04: Commented-out / placeholder assertion in `test_foundation.py`

**File:** `server/backend/tests/test_foundation.py:62`

**Issue:** `assert session_id_info.metadata or True` is a no-op assertion that always passes. It was presumably a placeholder for a proper primary-key check but was left in place.

**Fix:** Replace with a meaningful check or remove:
```python
# Verify composite PK by inspecting SQLAlchemy table metadata
from sqlalchemy import inspect as sa_inspect
from app.core.db import engine
mapper = sa_inspect(SessionEvent)
pk_cols = {col.name for col in mapper.mapper.primary_key}
assert pk_cols == {"session_id", "sequence_number"}
```

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
