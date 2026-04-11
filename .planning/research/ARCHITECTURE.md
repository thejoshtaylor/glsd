# Architecture Patterns

**Domain:** v1.1 feature integration into existing GSD Cloud relay architecture
**Researched:** 2026-04-11

## System Overview (v1.0 Baseline)

GSD Cloud v1.0 is a three-tier WebSocket relay: Browser (React/xterm.js) <-> Server (FastAPI + PostgreSQL + Redis) <-> Node (Go daemon). The server is a stateful relay hub that inspects every WebSocket envelope `type` field, performs side effects (DB writes, status updates), and routes messages between browser and node connections.

Key existing components relevant to v1.1:

| Component | File(s) | Role in v1.1 |
|-----------|---------|--------------|
| `ws_node.py` | `server/backend/app/api/routes/ws_node.py` | **Modified** -- intercept `taskComplete`/`permissionRequest` for push notifications; extract usage data |
| `ws_browser.py` | `server/backend/app/api/routes/ws_browser.py` | Unchanged |
| `connection_manager.py` | `server/backend/app/relay/connection_manager.py` | **Modified** -- multi-worker Redis pub/sub already wired but untested |
| `login.py` | `server/backend/app/api/routes/login.py` | **Modified** -- email verification check on login; password reset already exists |
| `models.py` | `server/backend/app/models.py` | **Modified** -- new tables + columns |
| `config.py` | `server/backend/app/core/config.py` | **Modified** -- VAPID keys, email verification settings |
| `utils.py` | `server/backend/app/utils.py` | **Modified** -- verification email template |
| `protocol-go/messages.go` | `node/protocol-go/messages.go` | Unchanged -- `TaskComplete` already carries `inputTokens`, `outputTokens`, `costUsd`, `durationMs` |

## Feature 1: Web Push Notifications (NOTF-01, NOTF-02)

### Architecture

```
Node daemon                 Server (FastAPI)                    Browser
    |                           |                                  |
    |-- taskComplete/           |                                  |
    |   permissionRequest -->   |                                  |
    |                    [ws_node.py message loop]                 |
    |                    inspects type field                       |
    |                           |                                  |
    |                    [push_service.py]                         |
    |                    lookup user's push subscriptions           |
    |                    send via pywebpush                        |
    |                           |--- Web Push ---> Service Worker  |
    |                           |                  shows notification
    |                           |                                  |
    |                    [forward to browser WS as before]         |
```

### Integration Points

**Where push logic lives:** In `ws_node.py`, lines 244-269. After the server processes `taskComplete` and `permissionRequest` events (updating session status, persisting to DB), add a call to a new `push_service.send_push_for_event()` function. This is the exact point where the server already has: the message type, the session_id, and the user_id (from the node connection). No new message inspection is needed.

**Specific insertion point in ws_node.py:**

```python
# After line 269 (after session status updates for taskComplete/taskError)
# and after line 174 (after send_to_browser for permissionRequest)
if msg_type in ("permissionRequest", "taskComplete"):
    await push_service.send_push_for_event(
        user_id=node_conn.user_id,
        event_type=msg_type,
        session_id=session_id,
        payload=msg,
    )
```

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `server/backend/app/push/service.py` | NEW module | `send_push_for_event()` -- looks up subscriptions, calls pywebpush |
| `server/backend/app/push/__init__.py` | NEW module | Package init |
| `server/backend/app/api/routes/push.py` | NEW route file | `POST /api/v1/push/subscribe` -- save subscription; `DELETE /api/v1/push/subscribe` -- remove; `GET /api/v1/push/vapid-key` -- return public key |
| `server/frontend/public/sw.js` | NEW file | Service worker -- handles `push` event, shows notification, handles `notificationclick` to navigate to session |
| `server/frontend/public/manifest.json` | NEW file | PWA manifest -- required for Web Push |

### New Database Table

```sql
CREATE TABLE push_subscription (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,          -- browser public key
    auth TEXT NOT NULL,            -- browser auth secret
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, endpoint)     -- one subscription per endpoint per user
);
CREATE INDEX ix_push_subscription_user_id ON push_subscription(user_id);
```

**SQLModel model:**

```python
class PushSubscription(SQLModel, table=True):
    __tablename__ = "push_subscription"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    endpoint: str = Field(max_length=2048)
    p256dh: str = Field(max_length=512)
    auth: str = Field(max_length=512)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )
```

### VAPID Key Management

**Where:** Two new settings in `config.py`:

```python
VAPID_PRIVATE_KEY: str | None = None   # Base64-encoded EC private key
VAPID_SUBJECT: str | None = None       # "mailto:admin@example.com"
```

**Generation:** One-time `vapid --gen` command (from pywebpush CLI) generates a keypair. Private key goes in `.env`, public key is served by `GET /api/v1/push/vapid-key`.

**Computed property on Settings:**

```python
@computed_field
@property
def push_enabled(self) -> bool:
    return bool(self.VAPID_PRIVATE_KEY and self.VAPID_SUBJECT)
```

### Frontend Integration

The frontend needs:
1. A `manifest.json` in `public/` (name, icons, `display: "standalone"`)
2. A `sw.js` in `public/` (service worker that listens for `push` events)
3. Registration logic in React: on login, call `navigator.serviceWorker.register('/sw.js')`, request notification permission, get `PushSubscription`, POST to `/api/v1/push/subscribe`
4. The service worker `notificationclick` handler navigates to the relevant session URL

**No Tauri concern:** The frontend is already web-only (Tauri was removed in v1.0). Service workers work in standard browser context.

### Dependency

```
pywebpush>=2.0.0   # Add to pyproject.toml
```

## Feature 2: Token Usage Tracking (COST-01, COST-02)

### Architecture

The daemon **already sends usage data**. The `TaskComplete` message in `protocol-go/messages.go` (lines 111-122) includes `inputTokens`, `outputTokens`, `costUsd`, and `durationMs`. The server already receives these in `ws_node.py` but currently only forwards them to the browser -- it does not persist them.

```
Node daemon sends:
{
  "type": "taskComplete",
  "taskId": "...",
  "sessionId": "...",
  "inputTokens": 1234,
  "outputTokens": 567,
  "costUsd": "0.042",
  "durationMs": 8500,
  ...
}
```

### Integration Point

**Where in ws_node.py:** Lines 253-260, in the `taskComplete` handler block. After `crud.update_session_status(...)`, add a `crud.record_usage()` call.

```python
elif msg_type == "taskComplete":
    with DBSession(engine) as db:
        crud.update_session_status(...)
        # NEW: persist usage record
        crud.record_usage(
            session=db,
            session_id=sid_uuid,
            node_id=sess.node_id,
            user_id=user_id,  # from node_conn
            input_tokens=msg.get("inputTokens", 0),
            output_tokens=msg.get("outputTokens", 0),
            cost_usd=msg.get("costUsd", "0"),
            duration_ms=msg.get("durationMs", 0),
            task_id=msg.get("taskId", ""),
        )
```

### New Database Table

```sql
CREATE TABLE usage_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    node_id UUID NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    cost_usd TEXT NOT NULL DEFAULT '0',     -- keep as text to match protocol
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ix_usage_record_user_id ON usage_record(user_id);
CREATE INDEX ix_usage_record_session_id ON usage_record(session_id);
CREATE INDEX ix_usage_record_node_id ON usage_record(node_id);
CREATE INDEX ix_usage_record_created_at ON usage_record(created_at);
```

**SQLModel model:**

```python
class UsageRecord(SQLModel, table=True):
    __tablename__ = "usage_record"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    node_id: uuid.UUID = Field(foreign_key="node.id", nullable=False, index=True)
    session_id: uuid.UUID = Field(foreign_key="session.id", nullable=False, index=True)
    task_id: str = Field(max_length=255)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    cost_usd: str = Field(default="0", max_length=50)
    duration_ms: int = Field(default=0)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc, sa_type=DateTime(timezone=True)
    )
```

### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/usage/` | GET | List usage records for current user, with optional `node_id`, `session_id`, `from_date`, `to_date` query params |
| `GET /api/v1/usage/summary` | GET | Aggregated totals: total tokens, total cost, grouped by node or by day |

**New route file:** `server/backend/app/api/routes/usage.py`

### Frontend Integration

New page/component showing usage history table with filters (by node, by session, by date range). Aggregate stats at the top (total cost, total tokens). Uses React Query to fetch from `/api/v1/usage/` and `/api/v1/usage/summary`.

## Feature 3: Email Auth Flows (AUTH-07, AUTH-08)

### Password Reset (AUTH-07)

**Already exists.** The `login.py` file already has `POST /password-recovery/{email}` (line 112) and `POST /reset-password/` (line 136). The `utils.py` has `generate_password_reset_token()` and `verify_password_reset_token()`. Email sending via SMTP is wired up.

**What is missing:**
1. Frontend pages: `/forgot-password` and `/reset-password?token=...` -- these need to be built in the React app
2. Email templates may need updating to match GSD Cloud branding
3. SMTP configuration needs to be documented in deployment guide

**No backend changes needed for password reset.** The infrastructure is complete.

### Email Verification on Signup (AUTH-08)

**Requires changes.** Currently, the user registration flow (`users.py`, `POST /signup` in the frontend) creates a user and immediately allows login. Email verification requires:

### New Database Columns on User Table

```sql
ALTER TABLE "user" ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN email_verification_token TEXT;
ALTER TABLE "user" ADD COLUMN email_verification_sent_at TIMESTAMPTZ;
```

**SQLModel changes to User model (models.py):**

```python
class User(UserBase, table=True):
    # ... existing fields ...
    email_verified: bool = Field(default=False)
    email_verification_token: str | None = Field(default=None, max_length=512)
    email_verification_sent_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True)
    )
```

### Modified Components

| File | Change |
|------|--------|
| `models.py` | Add `email_verified`, `email_verification_token`, `email_verification_sent_at` to `User` |
| `crud.py` | After `create_user()`, generate verification token and send verification email |
| `login.py` | Add `GET /verify-email?token=...` endpoint; modify login to check `email_verified` (or warn) |
| `utils.py` | Add `generate_email_verification_token()`, `verify_email_verification_token()`, `generate_verification_email()` |
| `config.py` | Add `REQUIRE_EMAIL_VERIFICATION: bool = False` setting (opt-in, so existing deployments are not broken) |

### New Email Template

`server/backend/app/email-templates/build/verify_email.html` -- "Click here to verify your email address" with a link to `{FRONTEND_HOST}/verify-email?token={token}`.

### Flow

```
1. User POST /api/v1/users/signup
2. Server creates user with email_verified=False
3. Server generates JWT verification token (sub=email, exp=48h)
4. Server sends verification email with link
5. User clicks link -> frontend GET /verify-email?token=...
6. Frontend calls POST /api/v1/verify-email with token
7. Server validates token, sets email_verified=True
8. If REQUIRE_EMAIL_VERIFICATION=True, login rejects unverified users
```

**Important:** The `REQUIRE_EMAIL_VERIFICATION` setting must default to `False` to avoid breaking existing self-hosted deployments that have no SMTP configured.

## Feature 4: Multi-Worker Redis Pub/Sub (SCAL-01)

### What Already Exists

The `ConnectionManager` in `connection_manager.py` already has:
- Redis client initialization (`_get_redis()`, line 164)
- Pub/sub subscriber loop (`start_subscriber()`, line 187)
- Cross-worker message publishing (`broadcast_to_session()`, line 228)
- Pattern subscription on `ws:session:*` channels

**What is NOT tested/verified:**
1. Whether `start_subscriber()` is actually called at app startup
2. Whether the subscriber loop correctly delivers to local browser connections
3. Behavior under actual multi-worker deployment (multiple Uvicorn workers)
4. Race conditions between in-memory state and Redis state

### What Needs to Change

**Docker Compose changes (`docker-compose.yml`):**

The backend service currently runs a single Uvicorn worker (default). To test multi-worker:

```yaml
backend:
    # ... existing config ...
    command: uvicorn app.main:app --host 0.0.0.0 --workers 4
```

But **WebSocket connections are stateful** -- a connection opened on worker 1 cannot be read by worker 2. The current Redis pub/sub design handles this: when a node message arrives on worker A, it publishes to Redis; worker B's subscriber picks it up and delivers to the locally-connected browser.

**However**, the current code has a gap: `send_to_browser()` in `ws_node.py` (line 174) sends directly via the local ConnectionManager, NOT via Redis pub/sub. This works in single-worker but fails in multi-worker because the browser may be connected to a different worker than the node.

### Required Code Changes

**In `ws_node.py`, the message forwarding block (line 163-174):**

Replace:
```python
if channel_id:
    await manager.send_to_browser(channel_id, msg)
```

With:
```python
if channel_id:
    # Try local delivery first; fall back to Redis pub/sub for cross-worker
    local_sent = await manager.send_to_browser(channel_id, msg)
    if not local_sent:
        session_id = msg.get("sessionId")
        if session_id:
            await manager.broadcast_to_session(session_id, msg)
```

**In `connection_manager.py`:**
- The `start_subscriber()` must be called from `app/main.py` `on_startup` event
- The subscriber loop needs to handle `channel_id` routing (currently it uses `_session_to_channel` which is only populated for the local worker)
- Add a Redis-backed session-to-channel mapping (not just in-memory)

### Testing Approach

1. Modify `docker-compose.yml` to run 4 Uvicorn workers
2. Connect a node to the server (lands on worker A)
3. Open browser WebSocket (may land on worker B)
4. Send a task -- verify stream events reach browser across worker boundary
5. Verify heartbeats still update DB correctly
6. Test node revocation across workers

### New Files

| File | Purpose |
|------|---------|
| `server/backend/tests/test_multi_worker.py` | Integration tests for cross-worker routing |
| `server/docker-compose.multiworker.yml` | Override file with `--workers 4` |

## Feature 5: "Deploy on New Node" Modal (UX-01)

### Architecture

**Frontend-only change.** No backend modifications.

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| `DeployNodeModal.tsx` | NEW | Modal with step-by-step instructions for pairing a new node |
| Nodes page | MODIFIED | Add "Deploy on new node" button that opens the modal |

### Modal Content

The modal should show:
1. Prerequisites (Go installed, network access to server)
2. `curl | bash` install command (generated from server URL)
3. Node pairing flow: click "Generate Token" -> server creates token -> display token + relay URL
4. User copies token to node machine, runs `gsd-node start --token <token> --relay <url>`

This requires calling the existing `POST /api/v1/nodes/` endpoint from the modal to generate the pairing token. The endpoint already exists and returns `{node_id, token, relay_url}`.

## Component Boundaries (v1.1 Updated)

| Component | v1.0 Responsibility | v1.1 Additions |
|-----------|---------------------|----------------|
| **ws_node.py** | Forward node messages, persist events, update session status | + Push notification trigger, + Usage record persistence |
| **connection_manager.py** | In-memory WS registry, Redis pub/sub skeleton | + Verified multi-worker routing, + Redis session-channel mapping |
| **login.py** | Cookie auth, password reset | + Email verification check on login |
| **models.py** | User, Node, Session, SessionEvent, Project, Item | + PushSubscription, + UsageRecord, + User.email_verified columns |
| **config.py** | DB, SMTP, Redis, CORS settings | + VAPID keys, + REQUIRE_EMAIL_VERIFICATION |
| **Frontend** | Session UI, node management, terminal, activity feed | + Push subscription, + Usage page, + Forgot password page, + Email verification page, + Deploy modal |

## Data Flow Updates

### Push Notification Flow

```
1. Node sends taskComplete/permissionRequest via WebSocket
2. ws_node.py receives, persists event, updates session status (existing)
3. ws_node.py calls push_service.send_push_for_event() (NEW)
4. push_service queries push_subscription table for user's subscriptions
5. push_service calls pywebpush.webpush() for each subscription
6. Browser service worker receives push event, shows notification
7. User taps notification -> navigates to session page
```

### Usage Tracking Flow

```
1. Node sends taskComplete with inputTokens/outputTokens/costUsd (existing)
2. ws_node.py receives, updates session status (existing)
3. ws_node.py calls crud.record_usage() (NEW)
4. UsageRecord row written to PostgreSQL (NEW)
5. Frontend queries GET /api/v1/usage/ to display history (NEW)
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking Push Sends in the WebSocket Loop

**What:** Calling `pywebpush.webpush()` synchronously in the `ws_node.py` message loop.

**Why bad:** `pywebpush` makes HTTP requests to push services (Google FCM, Mozilla autopush). If the push service is slow or down, it blocks the entire node message processing loop, causing stream events to back up.

**Instead:** Use `asyncio.create_task()` to fire push sends in the background. Or use a lightweight task queue (asyncio.Queue drained by a background coroutine). Do not use Celery -- that is overkill for this volume.

```python
# In ws_node.py
asyncio.create_task(push_service.send_push_for_event(...))
```

### Anti-Pattern 2: Storing VAPID Private Key in the Database

**What:** Putting the VAPID private key in a DB table for "flexibility."

**Why bad:** The private key is a deployment secret, not user data. It belongs in environment variables alongside `SECRET_KEY`.

**Instead:** `.env` file, loaded via `config.py` Settings class. One keypair per deployment.

### Anti-Pattern 3: Requiring Email Verification by Default

**What:** Making `email_verified=True` a hard requirement for login immediately.

**Why bad:** Existing self-hosted deployments have no SMTP configured. All existing users would be locked out.

**Instead:** Gate behind `REQUIRE_EMAIL_VERIFICATION=False` (default). Existing users with `email_verified=False` can still log in unless the operator explicitly enables the requirement.

### Anti-Pattern 4: Testing Multi-Worker by Mocking Redis

**What:** Unit-testing Redis pub/sub by mocking the Redis client.

**Why bad:** The whole point of SCAL-01 is to verify real cross-worker delivery. Mocking Redis proves nothing about actual behavior.

**Instead:** Integration tests using Docker Compose with multiple Uvicorn workers and a real Redis instance. Connect a test node and test browser to different workers (use round-robin or specific worker affinity).

## Suggested Build Order

Dependencies flow left to right:

```
Phase 1: DB migrations + models     (foundation for all features)
    |
    +---> Phase 2: Usage tracking   (simplest: one new table, one code change in ws_node.py)
    |
    +---> Phase 3: Email flows      (columns on User, new endpoint, new templates)
    |
    +---> Phase 4: Web Push         (new table, new module, service worker, pywebpush dep)
    |
    +---> Phase 5: Deploy modal     (frontend only, no backend deps)
    |
    +---> Phase 6: Multi-worker     (needs all features working first, then stress test)
```

**Phase ordering rationale:**

1. **DB migrations first** -- All features except the deploy modal need new tables or columns. Run all migrations in one phase to avoid migration ordering issues.
2. **Usage tracking second** -- Smallest scope: one new table, ~10 lines changed in `ws_node.py`, one new route file. Low risk, high value (users want cost visibility).
3. **Email flows third** -- Password reset frontend pages are quick wins (backend already exists). Email verification adds complexity but is isolated to auth routes.
4. **Web Push fourth** -- Highest complexity: new dependency (pywebpush), new service worker, PWA manifest, VAPID key management. Benefits from usage tracking being done first (can also notify on high-cost tasks if desired later).
5. **Deploy modal fifth** -- Pure frontend, no backend dependencies. Can be parallelized with any phase.
6. **Multi-worker last** -- This is a stress test / verification phase, not a feature build. It should happen after all features work correctly in single-worker mode, so you can verify they all work in multi-worker mode.

## Migration Summary

### New Alembic Migrations Required

| Migration | Tables/Columns | Depends On |
|-----------|----------------|------------|
| `add_push_subscription_table` | `push_subscription` (new table) | None |
| `add_usage_record_table` | `usage_record` (new table) | None |
| `add_email_verification_to_user` | `user.email_verified`, `user.email_verification_token`, `user.email_verification_sent_at` | None |

All three migrations are independent and can be created in any order. They should all be included in the first phase.

## Sources

- Existing codebase analysis (HIGH confidence -- direct code inspection)
- [pywebpush on PyPI](https://pypi.org/project/pywebpush/) -- Python Web Push library
- [FastAPI + Web Push VAPID guide](https://medium.com/@kaushalsinh73/fastapi-web-push-vapid-real-time-notifications-without-vendor-lock-in-43540ec855f6) -- Integration pattern
- [web-push-libs/pywebpush on GitHub](https://github.com/web-push-libs/pywebpush) -- Library source
- [MDN Push API tutorial](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Re-engageable_Notifications_Push) -- Service worker patterns
- [How to Add Push Notifications to React PWAs](https://oneuptime.com/blog/post/2026-01-15-push-notifications-react-pwa/view) -- React-specific integration
- Protocol spec: `node/protocol-go/messages.go` lines 111-122 (TaskComplete with usage fields)
- FastAPI WebSocket docs (HIGH confidence -- v1.0 already uses this pattern)
