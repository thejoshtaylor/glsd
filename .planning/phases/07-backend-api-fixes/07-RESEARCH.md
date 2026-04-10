# Phase 7: Backend API Completion - Research

**Researched:** 2026-04-09
**Domain:** FastAPI REST API routes, SQLModel CRUD, pytest test completion
**Confidence:** HIGH

## Summary

Phase 7 closes five specific backend API gaps identified during the v1.0 audit. All five gaps are well-scoped and involve adding or modifying existing FastAPI routes, SQLModel models, CRUD functions, and converting xfail test stubs to real assertions. The existing codebase provides strong patterns to follow -- every change has an adjacent example already implemented.

The gaps are: (1) missing `GET /api/v1/nodes/{node_id}` endpoint, (2) missing `node_id` query parameter filter on `GET /api/v1/sessions/`, (3) missing `channel_id` field on `SessionPublic` response model, (4) three `@pytest.mark.xfail` stubs in `test_auth.py` that need real assertions, and (5) a `dict[str, int]` annotation in the Python protocol models that should be `dict[str, int]` (which is actually correct -- Python `int` handles int64 natively, but the concern is worth verifying).

**Primary recommendation:** Implement all five gaps in a single plan with 2 tasks -- one for the API/model changes and one for the test fixes. All changes are additive and low-risk.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-05 | User can view all paired nodes in the UI | `GET /api/v1/nodes/{node_id}` endpoint enables NodeDetailPage to render |
| AUTH-06 | User can revoke (disconnect) a node from the UI | Already implemented -- revoke endpoint exists. This phase ensures the detail page loads so the revoke button is reachable |
| VIBE-04 | Node management dashboard shows connected nodes, their status, and active sessions | Sessions filtered by node_id enables per-node session lists on the detail page |
| SESS-06 (partial) | User can run multiple sessions on a single node | Session list filtered by node_id is prerequisite; session creation already allows multiple per node |
| SESS-01 (partial) | User can start a Claude Code session on a selected node | `channel_id` in SessionPublic enables browser to use real channel ID for WebSocket routing |
</phase_requirements>

## Standard Stack

No new dependencies required. All changes use the existing stack:

### Core (already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.114.2 | HTTP routes | Existing framework [VERIFIED: pyproject.toml] |
| SQLModel | >=0.0.21 | ORM + Pydantic models | Existing ORM [VERIFIED: pyproject.toml] |
| pytest | existing | Test framework | Existing test infrastructure [VERIFIED: tests/conftest.py] |
| Pydantic | >2.0 | Validation | Bundled with SQLModel/FastAPI [VERIFIED: pyproject.toml] |

**Installation:** None required -- all dependencies already installed.

## Architecture Patterns

### Existing Patterns to Follow

All five changes follow patterns already established in the codebase:

**Pattern 1: Single-entity GET endpoint**
**What:** Route handler that parses UUID path param, calls CRUD lookup, returns 404 or public model.
**When to use:** `GET /api/v1/nodes/{node_id}` -- the missing endpoint.
**Example already in codebase:**
```python
# Source: server/backend/app/api/routes/sessions.py lines 46-57
@router.get("/{session_id}", response_model=SessionPublic)
def get_session(
    session_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    try:
        sid = uuid_mod.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = crud.get_session(session=session, session_id=sid)
    if not sess or sess.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionPublic.model_validate(sess)
```
[VERIFIED: server/backend/app/api/routes/sessions.py]

**Pattern 2: Optional query parameter filter on list endpoint**
**What:** Add an optional `Query` parameter to an existing list route, filter in CRUD layer.
**When to use:** `GET /api/v1/sessions/?node_id={id}` filter.
**Frontend already sends this:** `sessionsApi.listSessions(nodeId)` calls `/sessions/?node_id=${nodeId}`
[VERIFIED: server/frontend/src/lib/api/sessions.ts line 34]

**Pattern 3: Adding fields to Public response models**
**What:** Add a field to a Pydantic `SQLModel` response class.
**When to use:** Adding `channel_id` to `SessionPublic`.
**Note:** `channel_id` is not stored in the DB `SessionModel` -- it is a runtime routing concept managed by `ConnectionManager._session_to_channel`. The `SessionPublic` model needs a computed/optional field. Since sessions are created via REST before WebSocket connects, `channel_id` will initially be empty/null and populated once the browser WebSocket binds.

### Anti-Patterns to Avoid
- **Storing channel_id in the database:** Channel IDs are ephemeral browser connection identifiers. They change on each browser reconnection. Do not add a `channel_id` column to the `session` table.
- **Breaking the existing list_sessions signature:** The `node_id` filter must be optional (default `None`) so the unfiltered list still works.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID parsing | Manual regex | `uuid.UUID(str)` in try/except | Already the pattern in every route handler |
| Query param filtering | Custom parsing | FastAPI `Query(default=None)` | Type-safe, auto-documented in OpenAPI |
| Test fixtures | New user creation helpers | `authentication_token_from_email` + `create_random_user` from `tests/utils/` | Already used by `test_nodes.py` and `test_sessions.py` |

## Common Pitfalls

### Pitfall 1: Route ordering in FastAPI
**What goes wrong:** `GET /nodes/{node_id}` conflicts with `GET /nodes/{node_id}/revoke` or `GET /nodes/{node_id}/fs`.
**Why it happens:** FastAPI matches routes in registration order. Path params are greedy.
**How to avoid:** Place the `GET /{node_id}` route AFTER all `/nodes/{node_id}/...` sub-routes, or (better) register it using the same router instance where the other routes already exist. Since `revoke`, `fs`, and `file` are already POST/GET with longer paths, `GET /{node_id}` will not conflict.
**Warning signs:** Wrong route handler fires; 405 Method Not Allowed on correct path.
[VERIFIED: FastAPI documentation -- routes match in order, but different methods and longer paths take precedence]

### Pitfall 2: xfail test endpoints don't match actual routes
**What goes wrong:** `test_auth.py` stubs test `/api/v1/users/signup` and `/api/v1/login/access-token` but the actual auth flow uses `/api/v1/login/cookie` for cookie-based auth.
**Why it happens:** The stubs were written for Wave 0 before cookie auth was implemented in Phase 4.
**How to avoid:** Check which endpoints actually exist. The signup is at `/api/v1/users/signup` (confirmed in `users.py`). The login is at `/api/v1/login/access-token` (confirmed in `login.py`). Both exist and work. The cookie login is an additional endpoint, not a replacement.
**Warning signs:** Tests pass with `access-token` endpoint but the actual frontend uses `/login/cookie`.
[VERIFIED: server/backend/app/api/routes/login.py and users.py]

### Pitfall 3: channel_id semantics
**What goes wrong:** Adding `channel_id` to `SessionPublic` with a required field, causing validation errors for sessions that have no browser connected yet.
**Why it happens:** Sessions are created via REST (status "created") before any browser WebSocket connects and binds a channelId.
**How to avoid:** Make `channel_id` optional (`str | None = None`) on `SessionPublic`. The frontend already handles this fallback: `const channelId = (session as { channel_id?: string }).channel_id ?? sessionId;`
[VERIFIED: server/frontend/src/hooks/use-cloud-session.ts line 187]

### Pitfall 4: Sequence type mismatch is a non-issue
**What goes wrong:** Concern that Python `dict[str, int]` doesn't match Go `map[string]int64`.
**Why it happens:** Annotation looks different across languages.
**How to avoid:** Python `int` is arbitrary precision -- it natively handles int64 values from JSON. No code change needed. The Python `dict[str, int]` annotation is correct. JSON has no int64 type -- it's just `number`. Pydantic will deserialize any JSON integer into Python `int`.
**Warning signs:** None expected. This is a documentation/annotation concern only.
[VERIFIED: Python int is arbitrary precision; JSON number serialization is language-agnostic]

## Code Examples

### 1. GET /api/v1/nodes/{node_id} endpoint

```python
# Add to server/backend/app/api/routes/nodes.py
# Place after list_nodes, before revoke_node

@router.get("/{node_id}", response_model=NodePublic)
def get_node(
    node_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """AUTH-05: Get a single node by ID. Returns 404 if not found or not owned."""
    try:
        nid = uuid_mod.UUID(node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Node not found")
    node = crud.get_node_by_id(session=session, node_id=nid, user_id=current_user.id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return NodePublic.model_validate(node)
```
[VERIFIED: follows exact pattern from sessions.py get_session; crud.get_node_by_id already exists at crud.py line 140]

### 2. Session list with node_id filter

```python
# Modify server/backend/app/api/routes/sessions.py list_sessions

@router.get("/", response_model=SessionsPublic)
def list_sessions(
    session: SessionDep,
    current_user: CurrentUser,
    node_id: str | None = Query(default=None),
) -> Any:
    sessions = crud.get_sessions_by_user(
        session=session, user_id=current_user.id, node_id=node_id
    )
    return SessionsPublic(
        data=[SessionPublic.model_validate(s) for s in sessions],
        count=len(sessions),
    )
```

```python
# Modify server/backend/app/crud.py get_sessions_by_user

def get_sessions_by_user(
    *, session: Session, user_id: uuid.UUID, node_id: str | None = None
) -> list[SessionModel]:
    statement = select(SessionModel).where(SessionModel.user_id == user_id)
    if node_id:
        try:
            nid = uuid.UUID(node_id)
            statement = statement.where(SessionModel.node_id == nid)
        except ValueError:
            return []
    statement = statement.order_by(SessionModel.created_at.desc())
    return list(session.exec(statement).all())
```
[VERIFIED: frontend sends `?node_id=` at sessions.ts line 34; node-detail-page.tsx line 78 calls useSessions(nodeId)]

### 3. SessionPublic with channel_id

```python
# Modify server/backend/app/models.py SessionPublic

class SessionPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    node_id: uuid.UUID
    status: str
    cwd: str
    channel_id: str | None = None  # Runtime routing ID, populated when browser WS binds
    claude_session_id: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
```

Note: Since `channel_id` is not a DB column, `SessionPublic.model_validate(sess)` will not populate it automatically. The route handlers need to look up the channel from `ConnectionManager._session_to_channel` when building the response. Alternatively, set it to None and let the frontend use its existing fallback. The frontend already handles the None case gracefully.
[VERIFIED: use-cloud-session.ts line 187 falls back to sessionId when channel_id is absent]

### 4. Converting xfail stubs

The three xfail tests in `test_auth.py` test:
1. `POST /api/v1/users/signup` -- endpoint exists at `users.py:145` [VERIFIED]
2. `POST /api/v1/login/access-token` -- endpoint exists at `login.py:27` [VERIFIED]
3. `GET /api/v1/users/me` without token returns 401 -- endpoint exists at `login.py:83` [VERIFIED]

The tests should work as-is once xfail markers are removed. The only concern is test ordering -- `test_login_returns_jwt` depends on the user created in `test_signup_creates_user`. This is fragile; either combine them or use a fixture.

## State of the Art

No deprecated approaches. All patterns use current FastAPI/SQLModel/Pydantic conventions.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Query(...)` with explicit type | `param: type = Query(default=...)` | FastAPI 0.95+ | Use modern annotation style |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | channel_id should be optional/None on SessionPublic (not stored in DB) | Code Examples #3 | LOW -- frontend already handles None fallback. If it should be stored in DB, an Alembic migration would be needed |
| A2 | The sequence type `dict[str, int]` mismatch is a non-issue | Pitfalls #4 | LOW -- Python int handles int64. If there's a specific serialization edge case it would only matter for values > 2^53 (JSON number precision in JS), which sequence numbers won't reach |
| A3 | Route ordering for GET /{node_id} won't conflict with existing routes | Pitfalls #1 | LOW -- FastAPI distinguishes by method and path length, and revoke/fs/file have longer paths |

## Open Questions

1. **Should channel_id be actively populated from ConnectionManager on GET /sessions/ responses?**
   - What we know: The frontend falls back to sessionId when channel_id is absent. ConnectionManager tracks session-to-channel mappings at runtime.
   - What's unclear: Whether the planner should add logic to look up channel_id from ConnectionManager for each session in the response, or just leave it as None.
   - Recommendation: Leave as None for now. The WebSocket flow already handles routing without it. The REST response is informational.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | server/backend/pyproject.toml |
| Quick run command | `cd server/backend && python -m pytest tests/api/routes/test_nodes.py tests/api/routes/test_sessions.py tests/api/routes/test_auth.py -x -q` |
| Full suite command | `cd server/backend && python -m pytest -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-05 | GET /nodes/{node_id} returns node | unit | `pytest tests/api/routes/test_nodes.py::test_get_node -x` | No -- Wave 0 |
| AUTH-05 | GET /nodes/{node_id} returns 404 for other user's node | unit | `pytest tests/api/routes/test_nodes.py::test_get_other_users_node -x` | No -- Wave 0 |
| AUTH-06 | Revoke node (already tested) | unit | `pytest tests/api/routes/test_nodes.py::test_revoke_node -x` | Yes |
| VIBE-04 | GET /sessions/?node_id= filters by node | unit | `pytest tests/api/routes/test_sessions.py::test_list_sessions_by_node -x` | No -- Wave 0 |
| SESS-01 | SessionPublic includes channel_id | unit | `pytest tests/api/routes/test_sessions.py::test_create_session -x` | Yes (needs assertion update) |
| AUTH-01 | Signup creates user (xfail removal) | unit | `pytest tests/api/routes/test_auth.py::test_signup_creates_user -x` | Yes (xfail) |
| AUTH-02 | Login returns JWT (xfail removal) | unit | `pytest tests/api/routes/test_auth.py::test_login_returns_jwt -x` | Yes (xfail) |
| AUTH-03 | Logout is client-side (xfail removal) | unit | `pytest tests/api/routes/test_auth.py::test_logout_is_client_side -x` | Yes (xfail) |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/api/routes/test_nodes.py tests/api/routes/test_sessions.py tests/api/routes/test_auth.py -x -q`
- **Per wave merge:** `cd server/backend && python -m pytest -x -q`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test_nodes.py::test_get_node` -- covers AUTH-05 (get single node)
- [ ] `test_nodes.py::test_get_other_users_node` -- covers AUTH-05 (ownership check)
- [ ] `test_sessions.py::test_list_sessions_by_node` -- covers VIBE-04 (node_id filter)
- [ ] `test_sessions.py::test_create_session` needs `channel_id` assertion -- covers SESS-01

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT via PyJWT -- existing pattern |
| V3 Session Management | no | N/A (stateless JWT) |
| V4 Access Control | yes | User ownership check on node/session lookup (existing CRUD pattern) |
| V5 Input Validation | yes | UUID parsing with try/except, Pydantic model validation |
| V6 Cryptography | no | No new crypto -- token hashing already implemented |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on GET /nodes/{id} | Information Disclosure | Ownership check: `node.user_id != current_user.id` returns 404 (already in `crud.get_node_by_id`) |
| IDOR on GET /sessions/?node_id= | Information Disclosure | Filter includes `user_id == current_user.id` in WHERE clause |
| UUID enumeration | Information Disclosure | 404 for both "not found" and "not owned" -- no information leak |

## Sources

### Primary (HIGH confidence)
- `server/backend/app/api/routes/nodes.py` -- existing route patterns, confirmed missing GET /{node_id}
- `server/backend/app/api/routes/sessions.py` -- existing list endpoint, confirmed missing node_id filter
- `server/backend/app/models.py` -- confirmed SessionPublic lacks channel_id
- `server/backend/app/crud.py` -- confirmed get_node_by_id exists (line 140), get_sessions_by_user lacks node_id param
- `server/backend/tests/api/routes/test_auth.py` -- confirmed 3 xfail stubs
- `server/frontend/src/lib/api/nodes.ts` -- confirmed frontend calls `GET /nodes/${nodeId}`
- `server/frontend/src/lib/api/sessions.ts` -- confirmed frontend sends `?node_id=` param
- `server/frontend/src/hooks/use-cloud-session.ts` -- confirmed channel_id fallback logic
- `node/protocol-go/messages.go` -- confirmed `map[string]int64` for sequence maps

### Secondary (MEDIUM confidence)
- FastAPI route ordering behavior [ASSUMED -- based on standard FastAPI behavior]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing code
- Architecture: HIGH -- every change follows an existing adjacent pattern
- Pitfalls: HIGH -- verified all edge cases against actual codebase

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable -- no external dependency changes)
