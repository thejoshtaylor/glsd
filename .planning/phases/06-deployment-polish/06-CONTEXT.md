# Phase 6: Deployment Polish - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

A new user can self-host the full GSD Cloud stack using only Docker Compose (server) and a bash script (node). This phase is purely operational — no new features, only packaging and configuration to make self-hosting a single-command experience.

Requirements: INFR-03, INFR-04

</domain>

<decisions>
## Implementation Decisions

### Node Install Script: Server URL Configuration

- **D-01:** The install script writes a `.env` file in the install directory (`$GSD_INSTALL_DIR`, default `$HOME/.gsd-cloud`) with `GSD_SERVER_URL` (and any other runtime config the daemon needs). The daemon reads this `.env` file at startup. Users can edit the `.env` post-install without reinstalling — no re-running the install script needed.
- **D-02:** The script should prompt for `GSD_SERVER_URL` if not already set in the environment, or accept it as a pre-set env var (`GSD_SERVER_URL=https://my.server curl -fsSL ... | sh`). Both interactive and non-interactive (CI/automated) paths work.

### Server Setup UX

- **D-03:** Ship a `.env.example` file alongside `docker-compose.yml` with all required variables documented inline (with comments explaining each). New users copy it: `cp .env.example .env` then edit. No setup script to maintain.
- **D-04:** The `.env.example` must cover at minimum: `SECRET_KEY`, `DOMAIN`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`, and any new vars required by Phase 6 additions (Nginx hostname, Redis URL).

### Adminer: Move to Dev Override

- **D-05:** Remove the `adminer` service from `docker-compose.yml`. Keep it in `compose.override.yml` for local development. Production compose stays clean. This aligns with the note already in CLAUDE.md: "Adminer service: Development tool, not production."

### Redis: Add and Wire Pub/Sub

- **D-06:** Add a `redis` service to `docker-compose.yml` (image: `redis:7-alpine`, restart: always). Wire up Redis pub/sub in the server's `ConnectionManager` so multi-worker Uvicorn deployments can fan out WebSocket messages across workers. The single-worker case continues to work (Redis pub/sub with one subscriber is equivalent to direct delivery).
- **D-07:** Backend gets a `REDIS_URL` env var (e.g., `redis://redis:6379/0`). Add to `.env.example`. Backend uses `redis-py` async client. `ConnectionManager.broadcast` publishes to a Redis channel keyed by `session_id`; each worker's subscriber delivers to its local browser connections.

### Frontend: Docker + Nginx

- **D-08:** Add a multi-stage `frontend/Dockerfile`: Stage 1 uses Node to build the React/Vite app; Stage 2 uses `nginx:alpine` to serve the static output. Nginx config proxies `/api/` and `/ws/` to the backend service, serves everything else as static files from the build output.
- **D-09:** Uncomment and complete the `frontend` service in `docker-compose.yml` (was stubbed with TODO Phase 6 comment). No ports exposed by default — access goes through the user's external reverse proxy.
- **D-10:** `VITE_API_URL` is not needed in production — frontend and API live behind the same Nginx, so relative paths work (`/api/v1/...`). Build arg is only needed for the dev override where frontend and backend run on different ports.

### Claude's Discretion

- Nginx config file structure (inline in Dockerfile vs separate `nginx.conf` in repo)
- Redis pub/sub channel naming convention (e.g., `session:{session_id}` vs flat channel)
- Whether the backend's `ConnectionManager` pub/sub fan-out is enabled only when `REDIS_URL` is set (graceful fallback to in-memory for development)
- Whether `compose.override.yml` retains Traefik or switches to direct port exposure for local dev
- Exact `systemd` unit file (optional, nice-to-have for production node operators)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Server Compose (extend)
- `server/docker-compose.yml` — Current compose; frontend service commented out, no Redis, Adminer present
- `server/compose.override.yml` — Dev override; has Traefik, frontend stub, Adminer ports
- `server/compose.traefik.yml` — Production Traefik config (already exists; don't break)

### Server Backend (extend)
- `server/backend/app/relay/connection_manager.py` — ConnectionManager; add Redis pub/sub fan-out
- `server/backend/app/core/config.py` — Settings; add `REDIS_URL`
- `server/backend/Dockerfile` — Existing backend Dockerfile (reference for style)

### Server Frontend (new Dockerfile)
- `server/frontend/` — Vite/React app; needs `frontend/Dockerfile` (multi-stage: Node build → Nginx)
- `server/frontend/vite.config.ts` — Vite config; verify relative API path works in production build

### Node Install Script (extend)
- `node/daemon/scripts/install.sh` — Existing install script; extend to write `.env` with `GSD_SERVER_URL`
- `node/daemon/scripts/install.test.sh` — Smoke test for install script; update alongside

### Tech Stack Reference
- `CLAUDE.md` §WebSocket Relay — Redis pub/sub pattern for ConnectionManager scale-out
- `CLAUDE.md` §Deployment — Docker Compose services target layout, Nginx reverse proxy, Redis

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `install.sh` — Well-built script with checksum verification, platform detection, and PATH hints. Extend it rather than replace it. The `.env` write step fits naturally after the binary install.
- `docker-compose.yml` — The `backend` and `db` services are production-ready. The `prestart` service handles migrations. Frontend and Redis just need to be added.
- `compose.override.yml` — Dev override already exists with Traefik. Adminer move goes here.
- `connection_manager.py` — Existing in-memory ConnectionManager; Redis pub/sub extends the `broadcast` method.

### Integration Points
- `docker-compose.yml` → add `redis` service, uncomment `frontend` service, remove `adminer`
- `compose.override.yml` → add `adminer` back (dev only), update frontend service for dev
- `frontend/Dockerfile` → new file; multi-stage Node → Nginx
- `connection_manager.py` → `broadcast` method publishes to Redis when `REDIS_URL` is set
- `config.py` → add `REDIS_URL: str | None = None`
- `install.sh` → add `.env` write step after binary install

### Patterns to Follow
- Existing `backend/Dockerfile` style for the frontend Dockerfile
- Existing env var pattern in `docker-compose.yml` (all vars via `env_file: .env` + explicit `environment:` overrides for service linking)
- Existing `install.sh` err() / say() pattern for any new prompts added to the script

</code_context>
