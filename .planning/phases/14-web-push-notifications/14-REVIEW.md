---
phase: 14
status: findings
critical: 1
high: 2
medium: 3
low: 2
---

# Phase 14: Code Review — Web Push Notifications

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 22
**Status:** findings

## Summary

Phase 14 adds web push notifications (VAPID key management, push subscription CRUD, service worker push/click handling, PWA install banner) to the GSD Cloud platform. The overall architecture is sound — subscriptions are scoped to the authenticated user, the action token pattern (short-lived JWT in push payload for service worker API calls) is well-designed, and expired subscription cleanup on 410 is implemented correctly.

Four issues require attention before this ships:

1. **Critical:** The VAPID private key is written in plaintext to the `.env` file by the server process. In a Docker deployment the `.env` is often committed or bind-mounted and world-readable — this leaks the signing key used to authenticate every push notification.
2. **High:** The `/push/vapid-key` endpoint is unauthenticated. Any unauthenticated visitor can retrieve the VAPID public key, which is then usable to map push subscriptions back to this specific server deployment. While the public key itself is not a secret, serving it without authentication contradicts the auth-on-all-push-routes requirement stated in the review focus areas.
3. **High:** `send_push_to_user` in `core/push.py` calls `ensure_vapid_keys()` (which can trigger filesystem writes) on every notification dispatch, inside the hot path for every `permissionRequest` and `taskComplete` event. This is a performance concern but more critically a correctness risk: if VAPID keys are generated during a concurrent burst of push dispatches, multiple concurrent generations can race and write duplicate/conflicting key pairs to the `.env` file.
4. **Medium:** The service worker stores action tokens in an in-memory `_pushTokens` object keyed by `requestId`. Because `requestId` comes directly from the node and is not validated in the service worker, a crafted push payload with a `requestId` matching an existing entry would silently overwrite the stored token. There is no TTL on entries beyond the explicit `delete` on successful response.

---

## Critical Issues

### CR-01: VAPID private key written to `.env` file in plaintext by server process

**File:** `server/backend/app/core/push.py:38-46`

**Issue:** `ensure_vapid_keys()` opens the `.env` file in append mode (`"a"`) and writes the raw private key as a plain string. Docker deployments commonly bind-mount `.env` from the host or include it in the image layer. If the file is readable by other processes or persisted in a volume snapshot, the VAPID private key — which signs every push subscription assertion — is exposed. An attacker with the private key can impersonate this server to push services and craft arbitrary notifications to subscribed users.

The code also uses `settings.model_config.get("env_file", "../.env")` which is a `SettingsConfigDict` (a plain dict subclass), not a pydantic settings accessor. `model_config` is the class-level config dict, not the resolved value from the instance. The `.get()` call on it will always return `"../.env"` (the hard-coded class default) regardless of any runtime override, making the path resolution fragile.

**Fix:** Do not auto-write generated keys to the filesystem. Instead, raise a startup error that tells the operator to generate and set the env vars explicitly:

```python
def ensure_vapid_keys() -> tuple[str, str]:
    if settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY:
        return settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY

    # Generate once and surface them — operator must persist to env
    vapid = Vapid()
    vapid.generate_keys()
    private_raw = vapid.private_pem()
    public_raw = vapid.public_key_urlsafe_base64()
    logger.critical(
        "VAPID keys not configured. Set these env vars and restart:\n"
        "  VAPID_PRIVATE_KEY=%s\n"
        "  VAPID_PUBLIC_KEY=%s",
        private_raw,
        public_raw,
    )
    raise RuntimeError(
        "VAPID keys missing. See server logs for generated values to set in .env."
    )
```

Alternatively, log the generated keys and cache them in-process for the current run (acceptable for development), but never write them to the filesystem.

---

## High Issues

### HR-01: Concurrent push dispatches race on `ensure_vapid_keys()` key generation

**File:** `server/backend/app/core/push.py:84`

**Issue:** `send_push_to_user` calls `ensure_vapid_keys()` on every invocation. If VAPID keys are not yet set and multiple `permissionRequest`/`taskComplete` events arrive simultaneously (e.g., from multiple nodes or a burst scenario), multiple coroutines will concurrently enter the `Vapid().generate_keys()` path and attempt to append to the `.env` file simultaneously. This produces a corrupted `.env` with multiple conflicting `VAPID_PRIVATE_KEY=` and `VAPID_PUBLIC_KEY=` entries and breaks subsequent server restarts.

Even without the filesystem race, `ensure_vapid_keys()` reads `settings.VAPID_PRIVATE_KEY` which is set once at module load time. Newly generated keys are only appended to the `.env`, not updated on the live `settings` instance, so the race condition means some dispatches succeed with one key pair and others succeed with a different key pair — resulting in push failures for subscriptions registered with the "other" key.

**Fix:** Cache the resolved key pair at module level after first call, and protect generation with an `asyncio.Lock`:

```python
_vapid_cache: tuple[str, str] | None = None
_vapid_lock = asyncio.Lock()

async def ensure_vapid_keys_async() -> tuple[str, str]:
    global _vapid_cache
    if _vapid_cache:
        return _vapid_cache
    async with _vapid_lock:
        if _vapid_cache:
            return _vapid_cache
        private_key, public_key = _generate_or_load_vapid_keys()
        _vapid_cache = (private_key, public_key)
        return _vapid_cache
```

Make `send_push_to_user` call the async variant. The sync `ensure_vapid_keys` used by the route layer for the public key endpoint should also check the cache first.

### HR-02: `GET /push/vapid-key` is fully unauthenticated

**File:** `server/backend/app/api/routes/push.py:26-29`

**Issue:** The `/push/vapid-key` endpoint returns the VAPID public key with no `CurrentUser` dependency. Every other push endpoint (`/subscribe`, `/unsubscribe`, `/preferences`, `/subscriptions`, `/respond`) requires authentication. The public key is not a secret per se, but serving it without auth means:

1. An unauthenticated attacker can probe whether a server uses push notifications and identify the deployment.
2. The `test_get_vapid_key` test in `test_push_routes.py` makes a request without credentials and asserts 200 — this test will pass but silently validates the unauthenticated behaviour as intentional when it may not be.

If the VAPID public key must be fetched before the user has a session (e.g., during registration), that is a deliberate design choice and should be documented. Otherwise, add `current_user: CurrentUser` to enforce auth parity with the rest of the push surface.

**Fix:**
```python
@router.get("/vapid-key", response_class=PlainTextResponse)
def get_vapid_key(current_user: CurrentUser) -> str:
    """Return VAPID public key for PushManager.subscribe() applicationServerKey."""
    return get_vapid_public_key()
```

---

## Medium Issues

### MR-01: Action token stored in service worker memory with no TTL; `requestId` collision risk

**File:** `server/frontend/public/sw.js:29-31`, `sw.js:83`

**Issue:** The service worker stores JWT action tokens in `_pushTokens[data.requestId]` indefinitely (until explicit `delete` on successful response). Two risks:

1. If a `notificationclick` event never fires (notification dismissed without clicking an action, or a different notification click path taken), the token remains in memory until the service worker restarts. Tokens are 5-minute JWTs so the exposure window is bounded, but the `_pushTokens` map grows unboundedly for unresponded notifications.
2. If two concurrent permission requests from different sessions happen to have the same `requestId` (the value comes from the node and is not guaranteed unique across sessions), the second push overwrites the token for the first request, causing the first action to use the wrong token and fail silently.

**Fix:** Add a timeout cleanup for stale entries, and namespace the key by both `sessionId` and `requestId`:

```javascript
// Key by sessionId+requestId to prevent cross-session collision
var tokenKey = data.sessionId + ':' + data.requestId;
_pushTokens[tokenKey] = data.token;
setTimeout(function() { delete _pushTokens[tokenKey]; }, 5 * 60 * 1000);
```

Update all reads/deletes to use the same compound key.

### MR-02: `PushSubscription.endpoint` column missing unique-per-user index; upsert logic relies on sequential scan

**File:** `server/backend/app/alembic/versions/p14_001_add_push_subscription.py:18-33`
**File:** `server/backend/app/api/routes/push.py:39-43`

**Issue:** The upsert in `subscribe()` queries `.where(PushSubscription.endpoint == body.endpoint)` to find an existing record. The migration adds an index only on `user_id`, not a composite index on `(user_id, endpoint)`. As subscription counts grow, each subscribe call will perform a sequential scan over all subscriptions for the user to find the matching endpoint. More importantly, the lack of a `UNIQUE(user_id, endpoint)` database constraint means a race condition (two concurrent subscribe calls for the same endpoint) can insert duplicate rows, violating the D-13 one-per-device-per-user requirement.

**Fix:** Add a composite unique constraint to the migration:

```python
sa.UniqueConstraint("user_id", "endpoint", name="uq_push_subscription_user_endpoint"),
```

And update the index to a composite one:

```python
op.create_index(
    "ix_push_subscription_user_endpoint",
    "push_subscription",
    ["user_id", "endpoint"],
    unique=True,
)
```

### MR-03: `asyncio.create_task` called without error handling; push failures are silently swallowed in production

**File:** `server/backend/app/api/routes/ws_node.py:315-319`

**Issue:** Push dispatches are fired as `asyncio.create_task(send_push_to_user(...))` with no exception handler attached to the task. If `send_push_to_user` raises an unhandled exception (e.g., `RuntimeError` from `ensure_vapid_keys` if the CR-01 fix is applied, or a connection error), the exception is logged by Python's default unraisable hook but not associated with any request context. In production this can be entirely silent depending on the logging configuration.

**Fix:** Wrap the task creation to log errors:

```python
async def _dispatch_push(user_id: str, event_type: str, payload: dict) -> None:
    try:
        await send_push_to_user(user_id=user_id, event_type=event_type, payload=payload)
    except Exception:
        logger.exception("Push dispatch failed for user %s event %s", user_id, event_type)

asyncio.create_task(_dispatch_push(
    user_id=node_conn.user_id,
    event_type=msg_type,
    payload=push_payload,
))
```

---

## Low Issues

### LR-01: `PushPermissionResponse.session_id` and `request_id` are unvalidated bare strings

**File:** `server/backend/app/models.py:334-337`

**Issue:** `session_id` and `request_id` in `PushPermissionResponse` are typed as `str` with no length or format constraints. The `/push/respond` endpoint forwards these values verbatim as JSON to the node over WebSocket (`msg["sessionId"]`, `msg["requestId"]`). A user with a valid JWT (the action token from the push payload) could send arbitrarily long strings or Unicode sequences that get forwarded to the node. Nodes are expected to validate incoming messages, but defense in depth at the API layer is appropriate.

**Fix:** Add length constraints matching the rest of the model layer:

```python
class PushPermissionResponse(SQLModel):
    session_id: str = Field(max_length=255)
    request_id: str = Field(max_length=255)
    approved: bool
```

### LR-02: Test coverage for push dispatch (`test_push_dispatch.py`) does not exercise actual ws_node.py logic

**File:** `server/backend/tests/test_push_dispatch.py`

**Issue:** Both tests in `test_push_dispatch.py` mock `send_push_to_user` and then call the mock directly — they do not import or exercise any code from `ws_node.py`. The tests assert that calling the mock with specific arguments produces those same arguments back, which is trivially true and tests nothing. The actual integration path (ws_node receives a WebSocket message → extracts fields → calls `create_task(send_push_to_user(...))`) is completely untested.

This is a test reliability issue: the tests will pass even if the dispatch logic in `ws_node.py` is completely broken or removed.

**Fix:** Restructure the dispatch tests to either:
1. Unit-test the `_activity_message` helper and the push payload construction logic in isolation by extracting it to a testable function, or
2. Write an integration test using `TestClient` + WebSocket that delivers a `permissionRequest` message and asserts `send_push_to_user` was called with the correct arguments (patching it at the `ws_node` import site: `app.api.routes.ws_node.send_push_to_user`).

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
