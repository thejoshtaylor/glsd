# Phase 6: Deployment Polish - Research

**Researched:** 2026-04-10
**Domain:** Docker Compose deployment, Nginx reverse proxy, Redis pub/sub, bash install scripts
**Confidence:** HIGH

## Summary

Phase 6 is a packaging/operations phase with no new features. The goal is making self-hosting a single-command experience: `docker-compose up` for the server stack and a bash install script for nodes. The codebase is already 95% functional -- this phase adds the missing infrastructure glue: a frontend Dockerfile with Nginx, a Redis service for WebSocket fan-out, Adminer cleanup, `.env.example` documentation, and install script enhancements for server URL configuration.

All decisions are locked via CONTEXT.md. The existing `docker-compose.yml` already has the backend, db, and prestart services production-ready. The frontend service is commented out with a Phase 6 TODO. The install script is well-built with checksum verification and platform detection -- it just needs a `.env` write step.

**Primary recommendation:** Execute as 3 plans: (1) Docker Compose restructuring (Redis, Adminer, .env.example), (2) Frontend Dockerfile + Nginx, (3) Install script .env enhancement.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Install script writes `.env` in `$GSD_INSTALL_DIR` (default `$HOME/.gsd-cloud`) with `GSD_SERVER_URL`. Daemon reads `.env` at startup. Users edit `.env` post-install without reinstalling.
- D-02: Script prompts for `GSD_SERVER_URL` if not set in environment. Accepts pre-set env var for non-interactive use (`GSD_SERVER_URL=https://my.server curl -fsSL ... | sh`).
- D-03: Ship `.env.example` alongside `docker-compose.yml` with all required vars documented inline with comments.
- D-04: `.env.example` covers at minimum: `SECRET_KEY`, `DOMAIN`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`, plus new vars (Nginx hostname, Redis URL).
- D-05: Remove `adminer` service from `docker-compose.yml`. Keep in `compose.override.yml` for dev.
- D-06: Add `redis` service to `docker-compose.yml` (image: `redis:7-alpine`, restart: always). Wire Redis pub/sub in ConnectionManager for multi-worker fan-out.
- D-07: Backend gets `REDIS_URL` env var. Backend uses `redis-py` async client. `ConnectionManager.broadcast` publishes to Redis channel keyed by `session_id`.
- D-08: Multi-stage `frontend/Dockerfile`: Stage 1 Node build, Stage 2 `nginx:alpine` serves static output. Nginx proxies `/api/` and `/ws/` to backend.
- D-09: Uncomment and complete `frontend` service in `docker-compose.yml`. No ports exposed.
- D-10: `VITE_API_URL` not needed in production -- relative paths work. Build arg only for dev override.

### Claude's Discretion
- Nginx config file structure (inline in Dockerfile vs separate `nginx.conf`)
- Redis pub/sub channel naming convention
- Whether ConnectionManager pub/sub is enabled only when `REDIS_URL` is set (graceful fallback)
- Whether `compose.override.yml` retains Traefik or switches to direct port exposure
- Exact systemd unit file (optional)

### Deferred Ideas (OUT OF SCOPE)
None specified.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFR-03 | Server deployable via `docker-compose up` with no ports exposed | D-05 (adminer removal), D-06/D-07 (Redis), D-08/D-09 (frontend Dockerfile + Nginx), D-03/D-04 (.env.example) |
| INFR-04 | Node deployable as Go binary via `go build` + bash install/run script | D-01/D-02 (install script .env write with server URL prompt) |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.114.2 | Backend server | Already in pyproject.toml [VERIFIED: server/backend/pyproject.toml] |
| PostgreSQL | 18 | Database | Already in docker-compose.yml [VERIFIED: server/docker-compose.yml] |
| Nginx | alpine (latest) | Reverse proxy + static serving | Standard for containerized React apps behind API [ASSUMED] |
| Redis | 7-alpine | Pub/sub message bus | Per D-06, multi-worker WebSocket fan-out [VERIFIED: CONTEXT.md] |

### New Dependencies to Add
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| redis-py (async) | >=5.0 | Python Redis client | ConnectionManager pub/sub fan-out [VERIFIED: redis-py 7.4.0 available locally] |

**Installation (backend):**
Add to `server/backend/pyproject.toml` dependencies:
```
"redis>=5.0.0,<8.0.0",
```

**Note:** redis-py 5.x+ includes the async client natively (the old `aioredis` package was merged in). No separate aioredis install needed. [ASSUMED]

## Architecture Patterns

### Recommended Discretion Choices

**Nginx config: Separate file (not inline).** Keep `server/frontend/nginx.conf` in the repo. Rationale: easier to review, test, and modify than a multi-line `RUN echo` in a Dockerfile. The Dockerfile `COPY`s it into place. [ASSUMED]

**Redis pub/sub channel naming: `ws:session:{session_id}`** prefix. The `ws:` namespace prevents collision if Redis is later used for caching. [ASSUMED]

**ConnectionManager graceful fallback: Yes, enable pub/sub only when `REDIS_URL` is set.** This means `docker-compose up` in production uses Redis (since the service is defined), but local dev without Redis still works (in-memory only). Implementation: check `settings.REDIS_URL` at startup; if None, `broadcast` stays in-memory. [ASSUMED]

**compose.override.yml: Retain Traefik.** The existing dev override already has Traefik configured and working. Replacing it with direct port exposure would break existing dev workflows. Just add adminer and update frontend service. [VERIFIED: server/compose.override.yml has Traefik already]

**systemd unit file: Skip for this phase.** It's marked optional and adds no value to the success criteria. Node operators can write their own. [ASSUMED]

### Frontend Dockerfile Pattern (Multi-Stage)

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Key detail:** The build context for Docker is `server/` (same as backend). So paths in the Dockerfile are relative to `server/`. The existing backend Dockerfile follows this pattern (`COPY ./backend/...`). The frontend Dockerfile should follow suit (`COPY ./frontend/...`). [VERIFIED: server/backend/Dockerfile uses `COPY ./backend/` pattern]

### Nginx Configuration Pattern

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy
    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Critical:** `proxy_http_version 1.1` and `Upgrade`/`Connection` headers are mandatory for WebSocket proxying. Without them, WebSocket upgrade requests fail silently. [ASSUMED]

**Critical:** `proxy_read_timeout 86400` (24h) prevents Nginx from closing idle WebSocket connections after the default 60-second timeout. [ASSUMED]

### Redis Pub/Sub in ConnectionManager

The existing `ConnectionManager` is a module-level singleton (`manager = ConnectionManager()`). The Redis client should be initialized lazily at first use, not at import time, because `settings` may not be available during module import in all contexts.

```python
# Pattern for ConnectionManager Redis integration
import redis.asyncio as redis

class ConnectionManager:
    def __init__(self) -> None:
        # ... existing fields ...
        self._redis: redis.Redis | None = None
        self._pubsub_task: asyncio.Task | None = None

    async def _get_redis(self) -> redis.Redis | None:
        if self._redis is None:
            from app.core.config import settings
            if settings.REDIS_URL:
                self._redis = redis.from_url(settings.REDIS_URL)
        return self._redis

    async def broadcast_to_session(self, session_id: str, message: dict) -> None:
        """Publish message to Redis channel for cross-worker delivery."""
        r = await self._get_redis()
        if r:
            import json
            await r.publish(f"ws:session:{session_id}", json.dumps(message))
        else:
            # Fallback: deliver locally only
            channel_id = self._session_to_channel.get(session_id)
            if channel_id:
                await self.send_to_browser(channel_id, message)
```

**Key insight:** Each Uvicorn worker runs its own `ConnectionManager` instance. Redis pub/sub ensures that when Worker A receives a message from a node, it publishes to Redis, and Worker B (which holds the browser connection) receives and delivers it. [ASSUMED]

### Install Script .env Pattern

The existing script uses `say()` and `err()` helpers. The `.env` write step should follow this pattern:

```sh
write_env() {
    ENV_DIR="${GSD_INSTALL_DIR:-$HOME/.gsd-cloud}"
    ENV_FILE="$ENV_DIR/.env"
    
    if [ -f "$ENV_FILE" ]; then
        say "  .env already exists at $ENV_FILE, skipping"
        return
    fi

    # Get server URL from env or prompt
    if [ -z "${GSD_SERVER_URL:-}" ]; then
        if [ -t 0 ]; then
            printf '%s' "GSD Server URL: "
            read -r GSD_SERVER_URL
        else
            err "GSD_SERVER_URL not set and stdin is not a terminal"
        fi
    fi

    cat > "$ENV_FILE" <<EOF
# GSD Cloud daemon configuration
GSD_SERVER_URL=${GSD_SERVER_URL}
EOF
    say "  wrote $ENV_FILE"
}
```

**Key detail:** The `-t 0` check distinguishes interactive vs piped/CI usage per D-02. If stdin is not a terminal and the env var is not set, it's an error rather than hanging. [ASSUMED]

**Key detail:** If `.env` already exists, skip the write. This supports the D-01 requirement that users edit `.env` post-install without re-running the script. [ASSUMED]

### Anti-Patterns to Avoid
- **Exposing ports in docker-compose.yml:** Per project constraint, no ports exposed by default. The `frontend` and `backend` services must NOT have `ports:` in the production compose file.
- **Using `VITE_API_URL` in production build:** The frontend already uses relative `/api/v1` paths. Setting a build arg would break the Nginx proxy setup. [VERIFIED: server/frontend/src/lib/api/client.ts uses `const API_BASE = '/api/v1'`]
- **Inline Nginx config in Dockerfile:** Harder to maintain, harder to review.
- **Starting Redis subscriber in `__init__`:** Would fail if Redis is unavailable. Use lazy initialization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket proxy | Custom Node.js proxy | Nginx `proxy_pass` with `Upgrade` headers | Battle-tested, handles connection lifecycle, buffering, timeouts |
| Redis async client | Raw socket protocol | `redis.asyncio` (redis-py) | Protocol complexity, connection pooling, reconnection |
| Multi-stage Docker builds | Shell script to build + copy | Docker multi-stage `FROM ... AS build` | Standard pattern, cached layers, reproducible |
| Checksum verification in install script | Already built | Existing `verify_checksum()` in install.sh | Already handles sha256sum/shasum portability |

## Common Pitfalls

### Pitfall 1: Nginx WebSocket Upgrade Failure
**What goes wrong:** WebSocket connections fail with 400 or hang with no error
**Why it happens:** Missing `proxy_http_version 1.1` or `Upgrade`/`Connection` headers in Nginx config
**How to avoid:** Always include all three headers in the `/ws/` location block
**Warning signs:** Browser console shows WebSocket connection closed immediately after open

### Pitfall 2: Nginx Default Config Collision
**What goes wrong:** Custom nginx.conf is ignored or partially applied
**Why it happens:** `nginx:alpine` ships with a default config in `/etc/nginx/conf.d/default.conf`. If you COPY to a different filename, both configs load.
**How to avoid:** COPY to `/etc/nginx/conf.d/default.conf` (replacing the default) or remove `/etc/nginx/conf.d/default.conf` before adding your own.
**Warning signs:** Nginx serves "Welcome to nginx!" instead of the app

### Pitfall 3: Docker Build Context Mismatch
**What goes wrong:** `COPY frontend/package.json .` fails with "file not found"
**Why it happens:** The `build.context` in docker-compose.yml is `.` (the `server/` directory), but the Dockerfile is at `frontend/Dockerfile`. Paths in the Dockerfile must be relative to the context, not the Dockerfile location.
**How to avoid:** Use `context: .` and `dockerfile: frontend/Dockerfile`. All COPY paths are relative to `server/`.
**Warning signs:** Docker build fails at COPY step

### Pitfall 4: pnpm Not Available in Node Alpine
**What goes wrong:** `pnpm install` fails in Docker build
**Why it happens:** pnpm is not bundled with Node.js by default. Need `corepack enable` first.
**How to avoid:** Add `RUN corepack enable` before `pnpm install` in the Dockerfile. Node 22+ ships with corepack. [ASSUMED]
**Warning signs:** "pnpm: not found" during Docker build

### Pitfall 5: Redis Connection on Import
**What goes wrong:** Backend fails to start when Redis is not yet ready
**Why it happens:** If Redis client is created at module import time, and Redis container hasn't started yet, the connection fails and crashes the backend.
**How to avoid:** Lazy initialization -- create Redis client on first use, not at import. Also ensure `depends_on` in docker-compose, but that only waits for container start, not Redis readiness.
**Warning signs:** Backend crash loops with "Connection refused" to Redis

### Pitfall 6: Install Script read Command Compatibility
**What goes wrong:** `read -r` fails in some shells or piped contexts
**Why it happens:** The script uses `#!/bin/sh` (POSIX). `read -p "prompt"` is a bash-ism. Must use `printf` then `read -r`.
**How to avoid:** Use `printf '%s' "prompt: "` followed by `read -r VAR`. Already compatible with the script's POSIX style. [VERIFIED: existing script uses `#!/bin/sh` and POSIX patterns]
**Warning signs:** Prompt not displayed or read fails in dash/ash

## Code Examples

### Existing ConnectionManager Singleton
```python
# Source: server/backend/app/relay/connection_manager.py
# Module-level singleton -- all workers share this instance within a single worker process
manager = ConnectionManager()
```
[VERIFIED: server/backend/app/relay/connection_manager.py line 158]

### Existing API Client (Relative Paths)
```typescript
// Source: server/frontend/src/lib/api/client.ts
const API_BASE = '/api/v1';
```
[VERIFIED: server/frontend/src/lib/api/client.ts line 5]

### Existing .env.example Variables
```bash
# Source: server/.env.example (current state)
DOMAIN=localhost
FRONTEND_HOST=http://localhost:5173
ENVIRONMENT=local
PROJECT_NAME="Full Stack FastAPI Project"
SECRET_KEY=changethis
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=changethis
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changethis
DOCKER_IMAGE_BACKEND=backend
DOCKER_IMAGE_FRONTEND=frontend
```
[VERIFIED: server/.env.example]

**New vars to add per D-04:**
- `REDIS_URL=redis://redis:6379/0` (Docker internal)
- Comments explaining each variable's purpose

### Existing Backend Dockerfile Style
```dockerfile
# Source: server/backend/Dockerfile
FROM python:3.10
# Uses uv for dependency management
# Uses --mount=type=cache for layer caching
# CMD ["fastapi", "run", "--workers", "4", "app/main.py"]
```
[VERIFIED: server/backend/Dockerfile]

### Docker Compose Service Pattern
```yaml
# Source: server/docker-compose.yml
# All services use env_file + explicit environment overrides
# Backend uses healthcheck with curl
# Prestart service runs migrations before backend starts
```
[VERIFIED: server/docker-compose.yml]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| aioredis separate package | redis-py includes async natively (redis.asyncio) | redis-py 4.2+ (2022) | Single dependency, no aioredis needed |
| Nginx config via envsubst at runtime | Static nginx.conf with Docker DNS | Current best practice | Simpler, no runtime template processing needed for this use case |
| `COPY --from=node:22` for Node in multi-stage | Explicit `FROM node:22-alpine AS build` stage | Standard practice | Clearer, better caching |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nginx alpine latest is sufficient (no specific version pin needed) | Standard Stack | LOW -- alpine tags are stable |
| A2 | redis-py 5.x+ includes async client natively | Standard Stack | LOW -- well-documented, but verify import works |
| A3 | `corepack enable` is available in Node 22 alpine | Pitfalls | MEDIUM -- must verify in Docker build |
| A4 | `proxy_read_timeout 86400` is correct for long-lived WS | Architecture | LOW -- standard Nginx WS pattern |
| A5 | Lazy Redis init avoids startup crashes | Architecture | LOW -- standard async pattern |
| A6 | ConnectionManager broadcast method is the right integration point for Redis | Architecture | MEDIUM -- need to verify actual message flow in ws_browser.py and ws_node.py |

## Open Questions

1. **Does the daemon currently read a `.env` file at startup?**
   - What we know: The install script installs a binary. The binary uses cobra CLI.
   - What's unclear: Whether the daemon already has `.env` loading built in, or if this needs to be added to the Go code too.
   - Recommendation: Check `node/daemon/cmd/` for existing env/config loading. If not present, the install script can export vars before launching the binary, or the binary needs a config loading enhancement.

2. **What messages does ConnectionManager need to broadcast via Redis?**
   - What we know: `send_to_browser` sends to a specific channel_id. Node-to-browser messages go through this path.
   - What's unclear: Whether ALL node-to-browser messages should go through Redis, or only specific broadcast types.
   - Recommendation: All `send_to_browser` calls that result from node messages should publish to Redis when available. The subscriber delivers locally.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Server deployment | Yes | 29.3.1 | -- |
| Go | Node binary build | Yes | 1.26.1 | -- |
| Node.js | Frontend build (in Docker) | Yes (local) | 25.8.1 | Built inside Docker container |
| pnpm | Frontend build (in Docker) | Yes (local) | 9.15.0 | Built inside Docker container via corepack |
| Redis | WebSocket fan-out | No (not running locally) | -- | In-memory fallback (D-07 graceful degradation) |
| PostgreSQL | Database | Running in Docker | 18 | -- |

**Missing dependencies with no fallback:** None -- all blocking dependencies are available.

**Missing dependencies with fallback:**
- Redis not running locally, but ConnectionManager graceful fallback handles this for dev. Production uses the Docker Redis service.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 7.x (backend), vitest 4.x (frontend) |
| Config file | `server/backend/pyproject.toml`, `server/frontend/vite.config.ts` |
| Quick run command | `cd server/backend && python -m pytest tests/ -x --timeout=30` |
| Full suite command | `cd server && docker compose run --rm prestart && cd backend && python -m pytest tests/` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFR-03 | docker-compose up starts full stack | smoke | `cd server && docker compose config --quiet` (validates compose syntax) | No -- Wave 0 |
| INFR-03 | No ports exposed in production compose | unit | grep-based check: `grep -c "ports:" docker-compose.yml` should match 0 for backend/frontend services | No -- Wave 0 |
| INFR-03 | Nginx proxies /api/ to backend | integration | `docker compose up -d && curl -f http://localhost:80/api/v1/utils/health-check/` | No -- manual |
| INFR-04 | Install script writes .env | unit | Extend `install.test.sh` to verify .env creation | No -- Wave 0 |
| INFR-04 | Install script prompts for GSD_SERVER_URL | unit | Extend `install.test.sh` with piped input test | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `docker compose config --quiet` (validates compose YAML)
- **Per wave merge:** `cd server/backend && python -m pytest tests/ -x`
- **Phase gate:** Full `docker compose up` smoke test + install script test

### Wave 0 Gaps
- [ ] Extend `node/daemon/scripts/install.test.sh` -- add .env write verification
- [ ] `docker compose config` validation as CI-runnable check
- [ ] Manual smoke test procedure documented for full stack `docker compose up`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (no auth changes) | Existing JWT/cookie auth unchanged |
| V3 Session Management | No | Existing session management unchanged |
| V4 Access Control | No | No new access control surfaces |
| V5 Input Validation | Yes (install script) | Shell input validation for GSD_SERVER_URL (URL format check) |
| V6 Cryptography | No | No crypto changes |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Redis unauthenticated access | Information Disclosure | Redis listens on Docker internal network only (no ports exposed). Add `requirepass` if desired but not needed for Docker-internal. |
| Install script URL injection | Tampering | Validate GSD_SERVER_URL is a valid URL before writing to .env. Don't interpolate into shell commands. |
| Nginx proxy to unintended backends | Spoofing | Use explicit `proxy_pass http://backend:8000` with Docker DNS -- no user-controlled proxy targets. |

## Sources

### Primary (HIGH confidence)
- `server/docker-compose.yml` -- current compose structure, frontend TODO comment [VERIFIED]
- `server/compose.override.yml` -- dev override with Traefik, adminer ports [VERIFIED]
- `server/backend/Dockerfile` -- backend Docker pattern with uv [VERIFIED]
- `server/backend/app/relay/connection_manager.py` -- current ConnectionManager implementation [VERIFIED]
- `server/backend/app/core/config.py` -- current Settings class [VERIFIED]
- `server/frontend/src/lib/api/client.ts` -- confirms relative API paths [VERIFIED]
- `server/frontend/vite.config.ts` -- Vite dev proxy config, build settings [VERIFIED]
- `server/frontend/package.json` -- Node >=22, pnpm 9, dependencies [VERIFIED]
- `node/daemon/scripts/install.sh` -- current install script with checksums [VERIFIED]
- `node/daemon/scripts/install.test.sh` -- current install smoke test [VERIFIED]
- `server/.env.example` -- current env vars [VERIFIED]

### Secondary (MEDIUM confidence)
- CLAUDE.md technology stack documentation -- Redis pub/sub pattern, Nginx reverse proxy guidance [VERIFIED]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all locked decisions, existing code verified
- Architecture: HIGH -- patterns are straightforward Docker/Nginx/Redis, well-understood
- Pitfalls: HIGH -- common Docker and Nginx issues, well-documented in industry

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable infrastructure tooling, 30-day validity)
