---
phase: 07-backend-api-fixes
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - server/backend/app/api/routes/nodes.py
  - server/backend/app/api/routes/sessions.py
  - server/backend/app/models.py
  - server/backend/app/crud.py
  - server/backend/tests/api/routes/test_nodes.py
  - server/backend/tests/api/routes/test_sessions.py
  - server/backend/tests/api/routes/test_auth.py
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 07 adds `GET /nodes/{node_id}` with ownership enforcement, a `node_id` query filter on `GET /sessions/`, a `channel_id` field on `SessionPublic`, and converts three xfail auth test stubs to real assertions.

The ownership enforcement logic is correct and consistent with the existing revoke pattern. UUID parsing defensiveness (try/except → 404) is applied uniformly across `nodes.py` and `sessions.py`. SQLModel parameterized queries prevent SQL injection throughout. No authentication bypasses or info leaks were found in the primary security focus areas.

Three warnings were identified: a missing test for cross-user `node_id` filter isolation on sessions, a leaky exception catch in the revoke broadcast loop, and `update_session_status` accepting an unconstrained `**kwargs` dict that can overwrite any session column. Three informational items cover minor code quality concerns.

## Warnings

### WR-01: No test asserts that `?node_id=<other_user_node>` returns empty, not the other user's sessions

**File:** `server/backend/tests/api/routes/test_sessions.py` (no single line — gap)
**Issue:** T-07-02 requires that `GET /sessions/?node_id=<X>` always scopes to `current_user.id`. The existing `test_list_sessions_by_node` (line 183) only verifies filtering between two nodes owned by the *same* user. There is no test where user B supplies user A's `node_id` and the assertion confirms an empty result — rather than leaking user A's sessions. The implementation in `crud.get_sessions_by_user` is correct (always `WHERE user_id = user_id`), but the cross-user isolation case is untested.
**Fix:** Add a test case:
```python
def test_list_sessions_by_other_users_node_returns_empty(
    client: TestClient, db: Session
) -> None:
    """T-07-02: Filtering by another user's node_id returns empty, not their sessions."""
    user_a_email = random_email()
    user_a_headers = authentication_token_from_email(client=client, email=user_a_email, db=db)
    node_id, _ = _create_node_for_user(client, user_a_headers)
    # Create a session on user A's node
    client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=user_a_headers,
        json={"node_id": node_id, "cwd": "/tmp"},
    )

    user_b_email = random_email()
    user_b_headers = authentication_token_from_email(client=client, email=user_b_email, db=db)
    # User B queries with user A's node_id
    response = client.get(
        f"{settings.API_V1_STR}/sessions/?node_id={node_id}",
        headers=user_b_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 0  # Must not leak user A's sessions
```

### WR-02: Bare `except Exception` in revoke broadcast silently drops all errors including broken invariants

**File:** `server/backend/app/api/routes/nodes.py:119`
**Issue:** The inner loop sends `taskError` to browser channels. The `except Exception` block swallows every error — including `RuntimeError`, `AttributeError`, and similar programming errors that indicate a broken `ConnectionManager` state. Only network/WebSocket send errors should be suppressed here. A corrupted `manager._browsers` dict or a missing `websocket` attribute would be silently ignored, masking bugs.
**Fix:** Catch the narrowest exception the WebSocket library raises for send failures. If `coder/websocket` (Go side) is not involved here and the Python WebSocket is Starlette's, catch `WebSocketDisconnect` and `RuntimeError` explicitly, and re-raise anything else:
```python
from starlette.websockets import WebSocketDisconnect

try:
    await browser_conn.websocket.send_json({...})
except (WebSocketDisconnect, RuntimeError):
    logger.warning("Failed to send taskError to channel %s", channel_id)
except Exception:
    logger.exception(
        "Unexpected error sending taskError to channel %s", channel_id
    )
```

### WR-03: `update_session_status` accepts `**kwargs` and blindly sets any session column via `setattr`

**File:** `server/backend/app/crud.py:211-223`
**Issue:** `update_session_status(*, session, session_id, status, **kwargs)` iterates `kwargs.items()` and calls `setattr(sess, key, value)` for any key that `hasattr(sess, key)`. This means any caller that passes a misspelled or unintended keyword silently writes to the DB column if the attribute exists. For example, `update_session_status(..., user_id=other_user_id)` would silently reassign session ownership with no error. This is not currently exploitable from an API boundary (the only callers are in `ws_node.py` with known-safe keys), but it is a latent correctness risk.
**Fix:** Replace the open `**kwargs` with explicit optional parameters for the fields that callers actually need to update:
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

## Info

### IN-01: `SessionModel.status` is an unconstrained string with no DB-level or model-level enum

**File:** `server/backend/app/models.py:201`
**Issue:** `status: str = Field(default="created", max_length=50)` accepts any string. The route layer hard-codes `"completed"` and `"error"` for the stop guard (sessions.py:80), and the WebSocket handler writes other values. A typo in any of these sites would silently write an invalid status to the DB and never be caught.
**Fix:** Define a `Literal` or `enum.Enum` for valid status values and use it as the field type, or at minimum add a validator:
```python
from typing import Literal
SessionStatus = Literal["created", "starting", "running", "completed", "error"]
# Then in SessionModel:
status: SessionStatus = Field(default="created", max_length=50)
```

### IN-02: `get_node` route accepts `node_id: str` while all other route parameters use the same pattern — inconsistency with `revoke_node`

**File:** `server/backend/app/api/routes/nodes.py:66`
**Issue:** Both `get_node` (line 66) and `revoke_node` (line 85) take `node_id: str` and parse the UUID manually. This is the correct defensive pattern given the security requirement. However, the two UUID-parsing blocks are copy-pasted identically. The shared `_get_owned_online_node` helper already deduplicates this for fs/file routes, but not for `get_node` and `revoke_node`. Minor code duplication with no functional impact.
**Fix:** Extract a small `_parse_node_uuid(node_id: str) -> uuid.UUID` helper or reuse the existing pattern in a shared utility, reducing the risk of one copy drifting from the other.

### IN-03: `test_logout_is_client_side` does not send a valid token in the "token works" scenario

**File:** `server/backend/tests/api/routes/test_auth.py:43-51`
**Issue:** The docstring says "confirm a valid token works for auth" but the test only asserts the unauthenticated case (no token → 401). It never actually exercises the authenticated path with a valid JWT. The assertion is correct but the test name and docstring overstate what is being verified.
**Fix:** Either remove the misleading docstring preamble, or add a second request with a valid token to confirm the positive case:
```python
# First confirm an unauthenticated request is rejected
response = client.get("/api/v1/users/me")
assert response.status_code == 401

# Then confirm a valid token (login first, then use it) is accepted
login_resp = client.post(
    "/api/v1/login/access-token",
    data={"username": settings.FIRST_SUPERUSER, "password": settings.FIRST_SUPERUSER_PASSWORD},
)
token = login_resp.json()["access_token"]
auth_response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
assert auth_response.status_code == 200
```

---

_Reviewed: 2026-04-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
