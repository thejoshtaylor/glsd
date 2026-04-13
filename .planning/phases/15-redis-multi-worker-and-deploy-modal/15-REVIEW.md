---
phase: 15
status: issues-found
critical: 0
high: 3
medium: 5
low: 4
---

# Phase 15: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 15 adds Redis pub/sub fan-out for multi-worker WebSocket relay, a pairing-code-based node registration flow, and a deploy node modal on the frontend. The overall architecture is sound and security-conscious (single-use codes via GETDEL, 404 for both missing and wrong-owner nodes, token hashes never exposed in responses). No critical vulnerabilities were found.

Three high-severity issues require attention: a Redis connection leak in `pairing.py` (a new connection is created on every request without pooling or cleanup), a race condition in the revoke flow where in-memory session data is read without the lock while mutating in the same operation, and unhandled promise rejections in `deploy-node-modal.tsx` that can cause React unhandled rejection events in users' consoles and error-tracking tools.

---

## High Issues

### HR-01: Redis connection leak — new client per request in `pairing.py`

**File:** `server/backend/app/core/pairing.py:38-44`
**Issue:** `get_redis()` calls `aioredis.from_url(...)` on every invocation without connection pooling, reuse, or explicit cleanup. In `daemon.py` and `nodes.py` the caller does `r = await get_redis()` and then uses it, but never closes it. Under any non-trivial load this exhausts file descriptors and Redis connection slots.

By contrast, `ConnectionManager._get_redis()` (line 164-185 of `connection_manager.py`) stores a singleton with lazy init — the same pattern should be applied here.

**Fix:**
```python
# pairing.py — use a module-level singleton instead of per-call from_url
_redis_client: aioredis.Redis | None = None
_redis_initialized: bool = False

async def get_redis() -> aioredis.Redis | None:
    global _redis_client, _redis_initialized
    if not _redis_initialized:
        _redis_initialized = True
        if settings.REDIS_URL:
            try:
                _redis_client = aioredis.from_url(
                    str(settings.REDIS_URL), decode_responses=True
                )
                await _redis_client.ping()
            except Exception:
                _redis_client = None
    return _redis_client
```

---

### HR-02: Race condition between lock-free read and locked write in revoke flow

**File:** `server/backend/app/api/routes/nodes.py:131-153`
**Issue:** `revoke_node` reads `manager.get_sessions_for_node()` (line 131) and `manager._browsers` (line 135) without holding `manager._lock`, while concurrent calls to `register_browser`, `unregister_browser`, and `bind_session_to_node` do acquire the lock. The `for channel_id, browser_conn in list(manager._browsers.items())` snapshot (line 135) is safer than iterating live, but `get_sessions_for_node` (line 134) iterates `_session_to_node` without any lock at all, and `bind_session_to_node` itself is not async-locked either.

In a multi-worker scenario this is mitigated by the fact that each worker has its own in-memory state, but within a single worker concurrent asyncio tasks can interleave here, producing a KeyError or missed notification.

**Fix:** Convert `get_sessions_for_node` and `bind_session_to_node` to acquire `_lock`, or lift the entire revoke notification block into a single `async with manager._lock:` section:
```python
async with manager._lock:
    active_session_ids = [
        sid for sid, mid in manager._session_to_node.items()
        if mid == node.machine_id
    ]
    browser_snapshot = dict(manager._browsers)
```

---

### HR-03: Unhandled promise rejection in `handleGenerate`

**File:** `server/frontend/src/components/nodes/deploy-node-modal.tsx:92-100`
**Issue:** `handleGenerate` is an `async` function that calls `generateCode.mutateAsync(...)`. If the mutation throws (network error, 503 Redis unavailable, validation error), the rejection propagates out of the `onClick` handler as an unhandled promise rejection because the caller uses `void handleGenerate()` (lines 143, 150). React does not catch unhandled promise rejections — they surface as console errors and are reported to error trackers as uncaught exceptions.

**Fix:** Add a try/catch in `handleGenerate`:
```typescript
const handleGenerate = useCallback(async () => {
  if (!nodeName.trim()) return;
  try {
    const result = await generateCode.mutateAsync(nodeName.trim());
    setCode(result.code);
    setInitialNodeCount(nodesQuery.data?.count ?? 0);
    setIsPolling(true);
    setStep(2);
  } catch (err) {
    toast.error("Failed to generate pairing code. Please try again.");
  }
}, [nodeName, generateCode, nodesQuery.data]);
```

---

## Medium Issues

### MR-01: `asyncio.get_event_loop()` is deprecated in Python 3.10+

**File:** `server/backend/app/relay/connection_manager.py:149`
**Issue:** `loop = asyncio.get_event_loop()` followed by `loop.create_future()` is deprecated since Python 3.10. In Python 3.12 this will emit a `DeprecationWarning` when called in a context where there is no running event loop, and the behavior diverges from `asyncio.get_running_loop()`. Since FastAPI runs within an asyncio event loop, `get_running_loop()` is the correct call and never creates a new loop accidentally.

**Fix:**
```python
# line 149
future: asyncio.Future[dict] = asyncio.get_running_loop().create_future()
```

---

### MR-02: `DaemonPairRequest` fields have no length or character constraints

**File:** `server/backend/app/models.py:192-198`
**Issue:** `DaemonPairRequest` fields `hostname`, `os`, `arch`, and `daemonVersion` accept unbounded strings. A malicious or buggy daemon could submit multi-megabyte values, which are then written directly to the `Node` table columns (`machine_id max_length=255`, `os max_length=50`, `arch max_length=50`, `daemon_version max_length=50`). SQLModel will truncate or error at the DB layer, but the error message may leak schema information.

**Fix:**
```python
class DaemonPairRequest(SQLModel):
    code: str = Field(min_length=1, max_length=16)
    hostname: str = Field(min_length=1, max_length=255)
    os: str = Field(min_length=1, max_length=50)
    arch: str = Field(min_length=1, max_length=50)
    daemonVersion: str = Field(min_length=1, max_length=50)
```

---

### MR-03: nginx missing `proxy_read_timeout` for `/api/` location

**File:** `server/frontend/nginx.conf:8-14`
**Issue:** The `/ws/` location sets `proxy_read_timeout 86400` (line 26) to keep WebSocket connections alive, but `/api/` uses nginx's default `proxy_read_timeout` of 60 seconds. The `GET /api/v1/nodes/{id}/fs` and `GET /api/v1/nodes/{id}/file` endpoints already have a 5s FastAPI timeout, so this is usually fine. However, if a slow node causes FastAPI to hold the connection past 60s (e.g., timeout extended in future), nginx will cut the connection with a 504 before FastAPI responds. A conservative value of 70s provides a safety margin.

**Fix:**
```nginx
location /api/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 70;
}
```

---

### MR-04: `isOnline` logic ignores revoked state — online badge possible for revoked nodes

**File:** `server/frontend/src/components/nodes/nodes-page.tsx:31-34`
**Issue:** `isOnline` returns `true` when `connected_at !== null && disconnected_at === null`. However, a revoked node that was connected at revocation time may retain `connected_at` set and `disconnected_at` null until the server closes the WebSocket and updates the record. `NodeCard` does check `node.is_revoked` first in the render path (line 57), so the badge display is correct. But `isOnline` itself is misleading and could cause incorrect behavior if reused elsewhere.

**Fix:** Include the revoke check in the function itself:
```typescript
function isOnline(node: NodePublic): boolean {
  return !node.is_revoked && node.connected_at !== null && node.disconnected_at === null;
}
```

---

### MR-05: `useGeneratePairingCode` mutation has no `onError` handler — failures are silent

**File:** `server/frontend/src/lib/queries.ts:1114-1118`
**Issue:** The `useGeneratePairingCode` mutation has no `onError` callback. Combined with HR-03, if error handling is added only in the component, the mutation's default behavior (swallowing the error silently after throwing from `mutateAsync`) means different calling patterns will behave inconsistently. The `useRevokeNode` mutation at line 1129 does include `onSuccess` invalidation but also has no `onError`. Centralized error handling at the mutation level is more reliable.

**Fix:**
```typescript
export function useGeneratePairingCode() {
  return useMutation({
    mutationFn: (name: string) => nodesApi.generatePairingCode(name),
    onError: () => {
      toast.error("Failed to generate pairing code. Please try again.");
    },
  });
}
```

---

## Low Issues

### LR-01: `daemon.py` builds relay URL using the same duplicated logic as `nodes.py`

**File:** `server/backend/app/api/routes/daemon.py:54-70` and `server/backend/app/api/routes/nodes.py:43-54`
**Issue:** The relay URL construction block (urlparse + scheme + port logic) is copy-pasted verbatim in both files. If the logic needs to change (e.g., to support custom paths or port stripping rules), it must be updated in two places.

**Fix:** Extract to a helper in `app/core/config.py` or a shared utility:
```python
# app/core/config.py
def get_relay_url() -> str:
    if settings.FRONTEND_HOST:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(settings.FRONTEND_HOST)
            host = parsed.hostname or "localhost"
            scheme = "wss" if parsed.scheme == "https" else "ws"
            port_part = f":{parsed.port}" if parsed.port and parsed.port not in (80, 443) else ""
            return f"{scheme}://{host}{port_part}/ws/node"
        except Exception:
            pass
    return "/ws/node"
```

---

### LR-02: `test_daemon_pair_valid_code` patches both `app.core.pairing.get_redis` and `app.api.routes.daemon.get_redis` but only one is needed

**File:** `server/backend/tests/api/routes/test_daemon_pair.py:52-53`
**Issue:** The test patches both `app.core.pairing.get_redis` and `app.api.routes.daemon.get_redis`, but `daemon.py` only imports and calls `get_redis` from `app.core.pairing`. The double patch is redundant and could mask import path errors in future refactors.

**Fix:** Remove the `app.core.pairing.get_redis` patch — only patch `app.api.routes.daemon.get_redis`.

---

### LR-03: `test_generate_pairing_code_returns_6_char` patches the wrong import path

**File:** `server/backend/tests/api/routes/test_nodes.py:198`
**Issue:** The test patches `app.core.pairing.get_redis` but the actual call in `nodes.py` line 69 is `from app.core.pairing import generate_pairing_code, get_redis, store_pairing_code` — the function is imported into `app.api.routes.nodes` namespace. The patch should target `app.api.routes.nodes.get_redis` for reliability (though because it's called via `await get_redis()` inside the same function scope after local import, the current patch works by coincidence for now).

**Fix:**
```python
with patch("app.api.routes.nodes.get_redis", new=AsyncMock(return_value=mock_redis)):
```

---

### LR-04: `docker-compose.multiworker.yml` scales to 2 workers with no sticky-session or load-balancer configuration

**File:** `server/docker-compose.multiworker.yml`
**Issue:** The file sets `replicas: 2` for the backend but the base `docker-compose.yml` nginx configuration proxies to `http://backend:8000`, which Docker Compose DNS round-robins across both replicas. WebSocket connections require sticky sessions (or hash-based load balancing by `$remote_addr`) at nginx level, otherwise a browser WebSocket might land on worker A while the node WebSocket is on worker B — requiring Redis pub/sub to bridge them. The current nginx.conf does not configure sticky sessions or IP hash.

This is an architectural note rather than a pure bug (Redis pub/sub is designed to handle this), but the multi-worker compose file should include a comment documenting this reliance and ideally the base nginx.conf should use `upstream` with `ip_hash` to reduce cross-worker relay for latency-sensitive connections.

**Fix (documentation):** Add a comment to `docker-compose.multiworker.yml`:
```yaml
# NOTE: WebSocket connections may land on different workers.
# Cross-worker message delivery relies on Redis pub/sub (ws:session:* channel).
# Ensure REDIS_URL is set in the environment before using this override.
```

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
