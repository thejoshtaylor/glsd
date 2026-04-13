# Phase 15: Redis Multi-Worker and Deploy Modal - Research

**Researched:** 2026-04-13
**Domain:** Redis pub/sub retry logic, Docker Compose multi-worker, frontend pairing modal
**Confidence:** HIGH

## Summary

Phase 15 has two independent deliverables: (1) making the existing Redis pub/sub subscriber loop resilient with finite retries and providing a multi-worker Docker Compose override, and (2) building a "Deploy on new node" modal with 6-char pairing code flow, OS-aware install commands, copy buttons, and a live connection indicator.

The existing codebase already has Redis pub/sub infrastructure in `connection_manager.py` (lines 187-215), the `_get_redis()` lazy-init pattern, and all required frontend UI primitives (Radix Dialog, Tabs, sonner toast, copy-to-clipboard hook). The daemon already implements `gsd-cloud login <CODE>` in `login.go` calling `POST /api/daemon/pair`. The work is primarily: adding retry logic to the subscriber loop, adding two new backend endpoints (`POST /nodes/code` and `POST /api/daemon/pair`), creating the modal component, and writing a minimal Docker Compose override file.

**Primary recommendation:** Implement in two independent tracks -- backend retry + compose override (SCAL-01), then pairing code endpoints + deploy modal (UX-01). No new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01**: 6-char pairing code via `POST /nodes/code`, displayed in modal, daemon runs `gsd-cloud login <CODE>`
- **D-02**: Code lifetime is 10 minutes
- **D-03**: Codes stored in Redis with 10-minute TTL. Key: `pair:<CODE>`, value: `{user_id, node_name}`
- **D-04**: Modal has required node name text input before code generation
- **D-05**: Daemon exchange endpoint `POST /api/v1/nodes/pair` (new). Server looks up code in Redis, creates node row via existing `crud.create_node_token`, returns `{machine_id, auth_token, relay_url}`. Code deleted after successful exchange.
- **D-06**: OS detection via `navigator.userAgent`, pre-selecting macOS or Linux tab. Windows tab shows WSL2 instructions.
- **D-07**: Install source is self-hosted script at `GET /install`. Uses `window.location.origin`.
- **D-08**: `window.location.origin` used as server URL -- no user input needed.
- **D-09**: Poll `GET /nodes/` every 3 seconds during modal display. Detect success by comparing node count before vs after.
- **D-10**: On success: auto-close modal + show success toast "Node `<name>` connected." On 10-min expiry: show "Expired -- regenerate" state.
- **D-11**: Finite retries -- 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s), then log error and stop.
- **D-12**: `docker-compose.multiworker.yml` sets `backend.deploy.replicas: 2` only. No nginx changes.

### Claude's Discretion
- Visual design of the modal (step layout, code display, spinner states)
- `/install` script content and format
- Exact backoff algorithm implementation details
- Copy button implementation (Clipboard API)
- Code character set (uppercase alphanumeric, excluding ambiguous chars like 0/O/I/1)

### Deferred Ideas (OUT OF SCOPE)
None raised during discussion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCAL-01 | Server relay hub uses Redis pub/sub for verified multi-worker deployments | Existing `_subscriber_loop()` in connection_manager.py needs retry wrapping; Docker Compose override with `deploy.replicas: 2`; Nginx already round-robins to `backend` service |
| UX-01 | User can open "Deploy on new node" modal with OS-aware install commands, pairing code, and live connection indicator | New `POST /nodes/code` + `POST /api/daemon/pair` endpoints; modal uses existing Radix Dialog, Tabs, sonner toast, useCopyToClipboard hook; polling via React Query `refetchInterval` |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| redis-py (async) | >=5.0.0, <8.0.0 | Redis client for pairing codes + pub/sub retry | Already in pyproject.toml. `redis.asyncio` module used in connection_manager.py | [VERIFIED: pyproject.toml] |
| FastAPI | >=0.114.2 | HTTP endpoints + WebSocket | Already in project | [VERIFIED: codebase] |
| Radix Dialog | @radix-ui/react-dialog | Modal component | Already in package.json | [VERIFIED: package.json] |
| Radix Tabs | @radix-ui/react-tabs | OS selection tabs in modal | Already in package.json | [VERIFIED: package.json] |
| sonner | current | Toast notifications | Already in package.json, used by useCopyToClipboard | [VERIFIED: package.json] |
| React Query | >=5.62.0 | Polling with refetchInterval | Already used for `useNodes` query | [VERIFIED: queries.ts] |

### No New Dependencies Needed
All required functionality is covered by existing dependencies. No `npm install` or `pip install` needed.

## Architecture Patterns

### Backend: New Endpoints

**1. Pairing code generation: `POST /api/v1/nodes/code`**
- Authenticated endpoint (uses `CurrentUser` dep)
- Generates 6-char code, stores in Redis with 10-min TTL
- Key pattern: `pair:<CODE>` -> JSON `{"user_id": "<uuid>", "node_name": "<name>"}`
- Returns `{"code": "<CODE>"}` [VERIFIED: D-01, D-03 from CONTEXT.md]

**2. Daemon pairing exchange: `POST /api/daemon/pair`**
- Unauthenticated (daemon doesn't have a token yet -- the code IS the auth)
- Receives `{code, hostname, os, arch, daemonVersion}` [VERIFIED: pair.go PairRequest struct]
- Looks up `pair:<CODE>` in Redis
- Calls existing `crud.create_node_token()` to create node row
- Updates node with `machine_id=hostname`, `os`, `arch`, `daemon_version`
- Deletes Redis key (single-use)
- Returns `{machineId, authToken, relayUrl}` [VERIFIED: pair.go PairResponse struct]

**CRITICAL: Route path must be `/api/daemon/pair`** -- the daemon client hardcodes `c.baseURL+"/api/daemon/pair"` in `pair.go:52`. This is NOT under the `/api/v1` prefix. Mount on the FastAPI app directly or create a separate router. [VERIFIED: node/daemon/internal/api/pair.go line 52]

**3. Install script: `GET /install`**
- Unauthenticated (needs to be curled)
- Returns shell script content (Content-Type: text/plain)
- Script detects OS/arch and downloads daemon binary
- Mount at app root, not under `/api/v1` [VERIFIED: D-07]

### Backend: Subscriber Retry Logic

The existing `_subscriber_loop()` (connection_manager.py:193-213) catches only `CancelledError`. It needs wrapping with retry logic:

```python
# Source: D-11 from CONTEXT.md
async def _subscriber_loop() -> None:
    max_retries = 5
    for attempt in range(max_retries):
        try:
            pubsub = r.pubsub()
            await pubsub.psubscribe("ws:session:*")
            async for msg in pubsub.listen():
                # ... existing message handling ...
                pass
        except asyncio.CancelledError:
            # Clean shutdown -- propagate
            raise
        except Exception:
            delay = 2 ** attempt  # 1, 2, 4, 8, 16
            logger.warning(
                "Redis subscriber disconnected (attempt %d/%d), "
                "retrying in %ds",
                attempt + 1, max_retries, delay,
            )
            await asyncio.sleep(delay)
    else:
        logger.error(
            "Redis subscriber failed after %d attempts "
            "-- cross-worker relay disabled",
            max_retries,
        )
```
[ASSUMED: exact implementation pattern -- follows D-11 spec]

### Backend: Lifespan Hook

`start_subscriber()` is never called in `main.py`. Need a FastAPI lifespan context manager:

```python
# Source: FastAPI docs pattern
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    await manager.start_subscriber()
    yield
    await manager.stop_subscriber()

app = FastAPI(lifespan=lifespan, ...)
```
[CITED: https://fastapi.tiangolo.com/advanced/events/]

### Frontend: Deploy Modal Structure

```
DeployNodeModal (Radix Dialog)
  |- Step 1: Node name input + "Generate Code" button
  |- Step 2: (shown after code generated)
      |- Tabs (macOS | Linux | Windows/WSL)
      |    |- Install command with copy button
      |    |- Login command with copy button  
      |    |- Start command with copy button
      |- Pairing code display (large, monospace)
      |- Live status indicator (polling)
      |- Expired state (regenerate button)
```

### Frontend: Polling Pattern

Use React Query's `refetchInterval` option, already used elsewhere in the codebase:

```typescript
// Source: existing pattern in queries.ts
const { data: nodesBefore } = useNodes(); // snapshot count before code gen
const initialCount = nodesBefore?.count ?? 0;

// During polling:
const { data } = useQuery({
  queryKey: ['nodes'],
  queryFn: nodesApi.listNodes,
  refetchInterval: isPolling ? 3000 : false, // D-09: 3s polling
});
```
[VERIFIED: queries.ts uses refetchInterval pattern]

### Docker Compose Override

```yaml
# docker-compose.multiworker.yml
services:
  backend:
    deploy:
      replicas: 2
```

Run with: `docker compose -f docker-compose.yml -f docker-compose.multiworker.yml up`

Nginx already proxies to `http://backend:8000` -- Docker Compose DNS round-robins across replicas automatically. No nginx config changes needed. [VERIFIED: nginx.conf line 9, D-12]

### Anti-Patterns to Avoid
- **Putting `/api/daemon/pair` under the `/api/v1` prefix:** The daemon client hardcodes `/api/daemon/pair` -- breaking this path breaks all existing daemon installs.
- **Using DB instead of Redis for pairing codes:** D-03 explicitly requires Redis with TTL. No migration needed, no new table.
- **Starting subscriber in module scope:** Must use FastAPI lifespan to ensure proper async context and cleanup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Copy to clipboard | Custom clipboard logic | `useCopyToClipboard` hook | Already exists in codebase, handles fallbacks and toast |
| Toast notifications | Custom notification system | `sonner` (already imported) | Already used throughout the app |
| OS detection | Server-side UA parsing | `navigator.userAgent` client-side | D-06 specifies browser-side detection. Simple regex: `/mac/i` for macOS, default Linux |
| Modal component | Custom overlay | Radix Dialog | Already used in project, handles accessibility and focus management |
| Tab switching | Custom tab state | Radix Tabs | Already in package.json |
| Redis TTL management | Manual expiry checks | Redis `SETEX` / `SET ... EX` | Native Redis TTL -- automatic cleanup, no cron needed |
| Code generation | uuid/crypto | `secrets.token_hex(3).upper()` or custom charset | 6 chars from safe charset (A-Z, 2-9 excluding ambiguous) |

## Common Pitfalls

### Pitfall 1: Daemon Route Path Mismatch
**What goes wrong:** New endpoint mounted at wrong path, all daemon `login` commands fail.
**Why it happens:** Backend routes are under `/api/v1` but daemon hardcodes `/api/daemon/pair`.
**How to avoid:** Mount the daemon pair endpoint on the FastAPI `app` directly (not the `api_router`), or create a dedicated router at `/api/daemon`. Verify with the pair.go source.
**Warning signs:** Daemon gets 404 on login.

### Pitfall 2: Redis Key Collision with Pairing Codes
**What goes wrong:** Two users generate the same 6-char code simultaneously.
**Why it happens:** 6 chars from a 34-char alphabet is ~1.5 billion combinations, but collisions are possible.
**How to avoid:** Use `SET pair:<CODE> ... NX` (only set if not exists). If NX fails, regenerate. Retry up to 3 times.
**Warning signs:** User's code overwrites another user's code, wrong node gets paired to wrong account.

### Pitfall 3: Subscriber Loop Not Started
**What goes wrong:** Redis pub/sub messages published but never consumed -- cross-worker relay silently fails.
**Why it happens:** `start_subscriber()` is defined but never called. No lifespan hook in current `main.py`.
**How to avoid:** Add FastAPI lifespan context manager that calls `start_subscriber()` on startup and `stop_subscriber()` on shutdown.
**Warning signs:** Multi-worker messages don't arrive at browsers.

### Pitfall 4: Nginx WebSocket Round-Robin Breaking Sessions
**What goes wrong:** Browser WebSocket connects to worker A, then reconnects to worker B. Session state lost.
**Why it happens:** Default Nginx round-robin distributes new connections randomly across workers.
**How to avoid:** This is exactly what Redis pub/sub solves. The subscriber on each worker delivers messages to locally-connected browsers. No sticky sessions needed because the pub/sub fan-out handles cross-worker routing.
**Warning signs:** Intermittent message delivery failures in multi-worker mode.

### Pitfall 5: Code Expiry Race During Daemon Exchange
**What goes wrong:** Code expires between Redis GET and DELETE in the exchange endpoint.
**Why it happens:** Non-atomic read-then-delete.
**How to avoid:** Use `GETDEL` (Redis 6.2+) to atomically get and delete the key. Redis 7 is in docker-compose.yml, so GETDEL is available.
**Warning signs:** Daemon gets "code expired" even though it was submitted in time.

### Pitfall 6: Polling Continues After Modal Close
**What goes wrong:** 3-second polling to `/nodes/` keeps running after user closes modal without pairing.
**Why it happens:** React Query refetchInterval not disabled when modal unmounts.
**How to avoid:** Set `refetchInterval: isPolling ? 3000 : false` and set `isPolling = false` on modal close. Or use `enabled: isOpen` on the query.
**Warning signs:** Excessive API calls visible in network tab.

## Code Examples

### Pairing Code Generation (Backend)

```python
# Source: D-01, D-03 from CONTEXT.md + redis-py docs
import secrets
import json
import redis.asyncio as aioredis

# Character set: uppercase alphanumeric minus ambiguous (0, O, I, 1, L)
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
CODE_TTL_SECONDS = 600  # 10 minutes

def generate_pairing_code() -> str:
    return "".join(secrets.choice(CODE_CHARS) for _ in range(CODE_LENGTH))

async def store_pairing_code(
    redis: aioredis.Redis, code: str, user_id: str, node_name: str
) -> bool:
    """Store code with NX (only if not exists) to prevent collisions."""
    payload = json.dumps({"user_id": user_id, "node_name": node_name})
    return await redis.set(f"pair:{code}", payload, ex=CODE_TTL_SECONDS, nx=True)
```
[ASSUMED: exact implementation -- follows D-01/D-03 constraints]

### Daemon Exchange Endpoint (Backend)

```python
# Source: pair.go PairRequest/PairResponse structures
from pydantic import BaseModel

class DaemonPairRequest(BaseModel):
    code: str
    hostname: str
    os: str
    arch: str
    daemonVersion: str  # camelCase to match Go client

class DaemonPairResponse(BaseModel):
    machineId: str      # camelCase to match Go client
    authToken: str
    relayUrl: str
```
[VERIFIED: node/daemon/internal/api/pair.go PairRequest/PairResponse structs]

### OS Detection (Frontend)

```typescript
// Source: D-06
function detectOS(): 'macos' | 'linux' | 'windows' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('win')) return 'windows';
  return 'linux';
}
```
[ASSUMED: standard navigator.userAgent pattern]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `aioredis` separate package | `redis.asyncio` (merged into redis-py 5+) | redis-py 4.2+ (2022) | Use `import redis.asyncio as aioredis` -- already done in codebase |
| Redis GETDEL unavailable | `GETDEL` command | Redis 6.2 (2021) | Atomic get-and-delete for pairing codes |
| FastAPI startup/shutdown events | FastAPI lifespan context manager | FastAPI 0.93+ (2023) | Use `lifespan` param instead of deprecated `on_event` |

[VERIFIED: connection_manager.py already uses `redis.asyncio`; docker-compose.yml uses Redis 7]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GETDEL` available in Redis 7 alpine image | Pitfall 5 | Low -- can fall back to GET + DEL pipeline; Redis 7 definitely supports it |
| A2 | Docker Compose DNS round-robins across replicas without extra config | Architecture Patterns | Medium -- if it uses IP hash instead, multi-worker won't distribute. Verify with `docker compose up --scale backend=2` |
| A3 | Daemon binary hosting not yet established | Code Context gap | Medium -- install script may need to be a placeholder pointing to build-from-source instructions |

## Open Questions (RESOLVED)

1. **Where are daemon binaries hosted?**
   - What we know: The `/install` script needs to download a binary. The daemon builds with `go build`.
   - What's unclear: No binary release hosting (GitHub Releases, S3, etc.) is set up yet.
   - RESOLVED: Install script is a placeholder with build-from-source instructions. Real binary hosting is a separate concern outside Phase 15 scope.

2. **Should the subscriber retry reset on success?**
   - What we know: D-11 says 5 attempts then stop. After successful reconnection, should the counter reset?
   - What's unclear: Whether "5 attempts" means total or consecutive.
   - RESOLVED: Reset counter on successful reconnection (each new disconnection gets a fresh 5 attempts). Implemented in Plan 01 Task 1.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 (backend), vitest (frontend) |
| Config file | server/backend/pyproject.toml, server/frontend/vitest.config.ts |
| Quick run command | `cd server/backend && python -m pytest tests/api/routes/test_nodes.py -x` |
| Full suite command | `cd server/backend && python -m pytest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCAL-01a | Subscriber retries on Redis disconnect | unit | `pytest tests/relay/test_subscriber_retry.py -x` | Wave 0 |
| SCAL-01b | Messages delivered cross-worker via Redis pub/sub | integration | Manual -- requires 2 workers + Redis | manual-only |
| SCAL-01c | docker-compose.multiworker.yml valid | smoke | `docker compose -f docker-compose.yml -f docker-compose.multiworker.yml config` | Wave 0 |
| UX-01a | POST /nodes/code generates code in Redis | unit | `pytest tests/api/routes/test_nodes.py::test_generate_pairing_code -x` | Wave 0 |
| UX-01b | POST /api/daemon/pair exchanges code for token | unit | `pytest tests/api/routes/test_daemon_pair.py -x` | Wave 0 |
| UX-01c | Deploy modal renders with OS tabs | unit (vitest) | `cd server/frontend && npx vitest run --reporter=verbose src/components/nodes/__tests__/deploy-modal.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/api/routes/test_nodes.py -x`
- **Per wave merge:** `cd server/backend && python -m pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/relay/test_subscriber_retry.py` -- covers SCAL-01a retry logic
- [ ] `tests/api/routes/test_daemon_pair.py` -- covers UX-01b daemon exchange
- [ ] Test additions to `tests/api/routes/test_nodes.py` -- covers UX-01a code generation

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Pairing code is short-lived auth credential -- 10min TTL, single-use, stored in Redis not DB |
| V3 Session Management | no | No session changes in this phase |
| V4 Access Control | yes | `POST /nodes/code` requires authenticated user; `POST /api/daemon/pair` authenticates via code |
| V5 Input Validation | yes | Pydantic models validate all inputs; code length/charset enforced |
| V6 Cryptography | no | No new crypto -- reuses existing `create_node_token` with Argon2 hashing |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pairing code brute force | Spoofing | 6 chars from 34-char set = ~1.5B combos. 10min TTL limits window. Rate limit the exchange endpoint. |
| Code reuse after exchange | Tampering | `GETDEL` ensures single-use atomically |
| Install script MITM | Tampering | Script served over HTTPS (same origin as app). No external CDN. |
| Unauthenticated daemon endpoint abuse | Denial of Service | Rate limit `POST /api/daemon/pair`. Invalid codes return 404 quickly (Redis lookup is O(1)). |

## Sources

### Primary (HIGH confidence)
- `server/backend/app/relay/connection_manager.py` -- existing Redis pub/sub, subscriber loop, lazy init pattern
- `server/backend/app/api/routes/nodes.py` -- existing node CRUD endpoints
- `server/backend/app/models.py` -- existing Node, NodePairResponse models
- `node/daemon/internal/api/pair.go` -- daemon PairRequest/PairResponse structs, endpoint path `/api/daemon/pair`
- `node/daemon/cmd/login.go` -- daemon login flow
- `server/docker-compose.yml` -- existing Redis 7 service
- `server/frontend/nginx.conf` -- existing proxy config
- `server/frontend/src/hooks/use-copy-to-clipboard.ts` -- existing clipboard hook
- `server/frontend/src/components/nodes/nodes-page.tsx` -- existing nodes page
- `server/frontend/src/lib/api/nodes.ts` -- existing nodes API client
- `server/frontend/src/lib/queries.ts` -- existing useNodes query with refetchInterval pattern

### Secondary (MEDIUM confidence)
- FastAPI lifespan docs -- https://fastapi.tiangolo.com/advanced/events/
- Redis GETDEL command -- https://redis.io/commands/getdel/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new deps
- Architecture: HIGH -- patterns follow existing codebase conventions exactly
- Pitfalls: HIGH -- identified from direct code reading (route path mismatch, missing lifespan hook)

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable -- no moving targets)
