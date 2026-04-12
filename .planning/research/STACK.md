# Stack Research -- GSD Cloud

**Project:** GSD Cloud (self-hosted multi-node Claude Code session management)
**Researched:** 2026-04-09
**Mode:** Ecosystem -- constrained by existing partial implementations

## Existing Constraints

Four partially-built projects dictate most stack decisions. This research validates those choices, identifies version upgrades, and fills gaps (especially the WebSocket relay layer and deployment pipeline).

| Constraint | Source | Impact |
|------------|--------|--------|
| FastAPI + SQLModel + PostgreSQL | `deployable-saas-template` | Server backend is locked to Python |
| React 18 + Vite + Tailwind v3 + Radix UI | `gsd-vibe` | Server frontend framework is locked |
| Go 1.25 + `coder/websocket` + `creack/pty` | `daemon` + `protocol-go` | Node agent language and key libs are locked |
| WebSocket JSON text frames | `protocol-go/PROTOCOL.md` | Wire format is locked -- no gRPC, no binary frames |
| Docker Compose, no exposed ports | `PROJECT.md` | Server deployment model is locked |
| pnpm 9 | `gsd-vibe/package.json` | JS package manager is locked |

**Bottom line:** This is not a greenfield stack selection. It is a validation-and-gap-fill exercise. The major gaps are: (1) server-side WebSocket relay implementation, (2) async database layer, (3) Tailwind v3-to-v4 decision, (4) React 18-to-19 decision, and (5) monorepo tooling.

---

## Server Backend

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| FastAPI | >=0.114.2, <1.0.0 | HTTP + WebSocket server | Already implemented in template. Native WebSocket support via Starlette. Async-first. | HIGH -- existing code |
| Python | >=3.10, <4.0 | Runtime | Pinned in pyproject.toml. FastAPI dropped 3.9 in Feb 2026. | HIGH |
| Uvicorn | latest (via `fastapi[standard]`) | ASGI server | Bundled with fastapi[standard]. Handles WebSocket upgrade natively. | HIGH |

### Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL | 18 | Primary datastore | Already in docker-compose.yml. PG 18 is current. | HIGH -- existing code |
| SQLModel | >=0.0.21, <1.0.0 | ORM | Already in pyproject.toml. Pydantic + SQLAlchemy hybrid. | HIGH -- existing code |
| Alembic | >=1.12.1, <2.0.0 | Migrations | Already in pyproject.toml and project structure. | HIGH -- existing code |
| psycopg | >=3.1.13 (binary) | PostgreSQL driver | Already in pyproject.toml. psycopg3 supports both sync and async. | HIGH -- existing code |

**Critical upgrade: Switch to async database access.** The existing template uses synchronous SQLModel (`create_engine`). For a WebSocket relay server handling concurrent node connections, this blocks the event loop. Upgrade to `create_async_engine` with `AsyncSession`. psycopg3 already supports async natively -- no driver change needed, just switch the SQLAlchemy URL scheme to `postgresql+psycopg_async://`.

### Authentication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PyJWT | >=2.8.0, <3.0.0 | JWT token generation/validation | Already in pyproject.toml. Used for both HTTP auth and node registration tokens. | HIGH -- existing code |
| pwdlib (argon2 + bcrypt) | >=0.3.0 | Password hashing | Already in pyproject.toml. Argon2 is the current best practice for password hashing. | HIGH -- existing code |

### WebSocket Relay (NEW -- gap to fill)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Starlette WebSocket | (bundled with FastAPI) | Server-side WebSocket handling | FastAPI's native WebSocket support. No additional dependency needed. Supports `@app.websocket()` decorator pattern. | HIGH |
| Redis | 7.x | Pub/sub message bus for relay fan-out | Required if running multiple Uvicorn workers. Each worker maintains its own WebSocket connections; Redis pub/sub distributes messages across workers. Even single-worker, Redis provides connection state persistence across deploys. | MEDIUM |
| redis-py (async) | >=5.0 | Python Redis client | Async-native. Use `aioredis` pattern (now merged into redis-py). | MEDIUM |

**WebSocket relay architecture:**
- Browser connects to FastAPI WebSocket endpoint, authenticated via JWT query param (cannot use headers in browser WebSocket API).
- Node daemon connects to a separate FastAPI WebSocket endpoint, authenticated via registration token.
- FastAPI ConnectionManager tracks browser-to-node routing by sessionId/channelId.
- Messages are JSON text frames per PROTOCOL.md. Server parses envelope `type` field to route.
- For single-worker deployment (likely initial): in-memory ConnectionManager suffices.
- For multi-worker: add Redis pub/sub. Each worker subscribes; publishes route to correct local connection.

**What NOT to use:**
- `python-socketio` / Socket.IO: Adds its own protocol layer on top of WebSocket. The protocol is already defined in PROTOCOL.md as raw WebSocket JSON frames. Socket.IO would fight this.
- `channels` (Django Channels): Wrong framework. FastAPI already handles WebSocket natively.
- gRPC: Protocol is explicitly WebSocket JSON. gRPC would require rewriting protocol-go.

### Additional Server Dependencies (NEW)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Pydantic | >2.0 | Request/response validation, protocol message models | Already in pyproject.toml. Use to define TypeScript-equivalent protocol message types on server side. | HIGH |
| httpx | >=0.25.1 | Async HTTP client | Already in pyproject.toml. Useful for health checks and webhook integrations. | HIGH |
| Sentry SDK | >=2.0.0 | Error tracking | Already in pyproject.toml. Keep for production observability. | HIGH |

---

## Server Frontend

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 18.3.x | UI framework | Stay on React 18. Do NOT upgrade to React 19 during integration. Rationale below. | HIGH |
| TypeScript | ~5.7 | Type safety | Already in devDependencies. Current stable. | HIGH |
| Vite | 8.x | Build tool + dev server | Upgrade from 6.0.5. Vite 8 (March 2026) ships Rolldown bundler -- 10-30x faster builds. Drop-in upgrade. | MEDIUM |
| pnpm | 9.x | Package manager | Already specified in packageManager field. Superior monorepo workspace support. | HIGH |

**Why NOT React 19:** gsd-vibe has deep Radix UI integration (14 Radix packages), Tauri API imports (to be removed/abstracted), and React Router v7. Upgrading React 18 to 19 while simultaneously ripping out Tauri and integrating into a new backend is too many moving parts. React 18 is fully supported and will be for years. Upgrade React after the integration stabilizes.

**Why Vite 8 over staying on 6:** Rolldown bundler is a free speed win. The migration path from Vite 6 to 8 is straightforward -- no plugin API breakage for standard React setups. The gsd-vibe config is vanilla (`@vitejs/plugin-react`).

### UI Libraries

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Radix UI | various (see gsd-vibe package.json) | Accessible UI primitives | Already used extensively (14 packages). Core of the component library. Keep as-is. | HIGH |
| Tailwind CSS | 3.4.x (stay on v3) | Utility CSS | Do NOT upgrade to Tailwind v4 during integration. v4 replaces JS config with CSS-first config -- nontrivial migration. gsd-vibe uses v3 patterns throughout. Upgrade after integration. | HIGH |
| Lucide React | >=0.468.0 | Icons | Already in use. Standard icon library. | HIGH |
| class-variance-authority | >=0.7.1 | Component variant management | Already in use. shadcn/ui pattern. | HIGH |
| clsx + tailwind-merge | current | Conditional class merging | Already in use. Standard pattern with shadcn/ui. | HIGH |

### State Management and Data Fetching

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| TanStack React Query | >=5.62.0 | Server state management, caching | Already in use for data fetching in gsd-vibe. Extend for REST API calls to FastAPI backend. | HIGH |
| React Context | (built-in) | Local UI state (terminal sessions, theme) | Already used in gsd-vibe for terminal context. Sufficient for this app's complexity. | HIGH |
| Zustand | 5.x | Client-side global state (if needed) | Add ONLY if React Context becomes unwieldy for WebSocket connection state. Do not add preemptively. | LOW -- conditional |

**What NOT to use:**
- Redux/Redux Toolkit: Overkill. The app's client state is mostly server-derived (React Query handles that) plus WebSocket stream state.
- Jotai/Recoil: Atomic state managers add complexity without clear benefit here.
- MobX: Different paradigm from what gsd-vibe already uses.

### WebSocket Client

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Native WebSocket API | (browser built-in) | WebSocket connection to server | PROTOCOL.md defines raw WebSocket JSON frames. No wrapper library needed. Build a thin TypeScript client that handles reconnection with exponential backoff, heartbeat monitoring, and message routing by `type` field. | HIGH |
| reconnecting-websocket | 4.x | Reconnection wrapper (optional) | Small library that adds automatic reconnection to native WebSocket. Consider if hand-rolling reconnection logic proves bug-prone. | LOW -- optional |

**What NOT to use:**
- Socket.IO client: Adds its own protocol. Incompatible with raw WebSocket JSON relay.
- SWR: React Query already handles server state. Two cache layers would conflict.

### Terminal Rendering

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| xterm.js (@xterm/xterm) | 6.x | Terminal emulator in browser | Already in gsd-vibe with fit, search, serialize, and web-links addons. Core to rendering Claude Code output streams. | HIGH |

### Key Removals from gsd-vibe

These dependencies must be removed or abstracted when integrating into the server frontend:

| Remove | Reason | Replace With |
|--------|--------|-------------|
| `@tauri-apps/api` | Tauri IPC not available in web | Fetch/WebSocket calls to FastAPI |
| `@tauri-apps/plugin-dialog` | Native dialog | Browser-native or Radix Dialog |
| `@tauri-apps/plugin-fs` | Native filesystem | REST API to server backend |
| `@tauri-apps/plugin-shell` | Native shell | Not needed -- sessions run on remote nodes |
| `@tauri-apps/cli` (devDep) | Tauri build tooling | Remove entirely |

**Abstraction pattern:** Create a `lib/api.ts` module that replaces `lib/tauri.ts`. All Tauri `invoke()` calls become `fetch()` or WebSocket message sends. TanStack Query hooks in `lib/queries.ts` change their query functions from Tauri invoke wrappers to REST API calls.

---

## Node Agent

### Core

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Go | 1.25.0 | Language runtime | Already in go.mod. Released Aug 2025. Current stable. Container-aware GOMAXPROCS, json/v2 experimental. | HIGH |
| `github.com/coder/websocket` | v1.8.14 | WebSocket client to server relay | Already in daemon go.mod. Minimal, idiomatic, well-maintained by Coder. Superior to gorilla/websocket (unmaintained). | HIGH |
| `github.com/creack/pty` | v1.1.24 | PTY spawning for Claude Code CLI | Already in daemon go.mod. Standard Go PTY library. | HIGH |
| `github.com/spf13/cobra` | v1.10.2 | CLI argument parsing | Already in daemon go.mod. Standard Go CLI framework. | HIGH |
| `github.com/gsd-build/protocol-go` | v0.1.0 | Wire protocol types | Already imported by daemon. Local module in monorepo. | HIGH |

### Build and Distribution

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `go build` | (Go toolchain) | Binary compilation | Single static binary. Cross-compile with GOOS/GOARCH. No Docker on nodes. | HIGH |
| Bash startup script | N/A | Node bootstrapping | Per PROJECT.md constraint. Script handles: config loading, env setup, binary execution. | HIGH |
| Go workspace (`go.work`) | Go 1.25 | Monorepo module linking | Use Go workspaces to link `daemon` and `protocol-go` locally during development without `replace` directives in go.mod. | HIGH |

**What NOT to use:**
- Docker on nodes: Explicitly out of scope per PROJECT.md.
- Mage/Task/Make for Go builds: `go build` is sufficient. The node binary is a single main package.
- gorilla/websocket: Unmaintained since 2023. `coder/websocket` is the maintained fork/successor.

---

## Protocol Layer

### Wire Format

| Aspect | Choice | Why | Confidence |
|--------|--------|-----|------------|
| Transport | WebSocket text frames | Defined in PROTOCOL.md. Browser-native. | HIGH -- locked |
| Serialization | JSON | Defined in PROTOCOL.md. Human-readable, debuggable. | HIGH -- locked |
| Envelope pattern | `{"type": "<name>", ...fields}` | Defined in PROTOCOL.md. Simple discriminated union. | HIGH -- locked |
| Sequence numbers | Per-session int64 | For WAL replay and exactly-once delivery. Defined in PROTOCOL.md. | HIGH -- locked |

### TypeScript Protocol Bindings (NEW -- gap to fill)

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Hand-written TypeScript types | Frontend protocol types | Mirror `protocol-go/messages.go` as TypeScript discriminated unions. Use `type` field as discriminant. Keep in a shared `packages/protocol-ts/` directory in the monorepo. | HIGH |
| Zod | Runtime message validation | Validate incoming WebSocket messages at the frontend boundary. Catches protocol mismatches early. Generates TypeScript types. | MEDIUM |

**Why hand-written over codegen:** The protocol has ~15 message types. Codegen tooling (protobuf, JSON Schema) adds build complexity disproportionate to the type count. Hand-written types with Zod runtime validation provide equivalent safety with less machinery.

### Python Protocol Bindings (NEW -- gap to fill)

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Pydantic models | Server-side protocol message types | FastAPI already uses Pydantic. Define protocol messages as Pydantic models with discriminated union via `type` field. Validates incoming WebSocket frames automatically. | HIGH |

---

## Deployment

### Server (Docker Compose)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker Compose | v2 (Compose spec) | Service orchestration | Already in deployable-saas-template. | HIGH |
| PostgreSQL 18 | 18.x | Database | Already in docker-compose.yml. | HIGH |
| Nginx | latest alpine | Reverse proxy + static file serving | Serve built frontend static files. Proxy `/api/` to FastAPI. Proxy `/ws/` WebSocket upgrade to FastAPI. Single container serves both frontend and API. No ports exposed by default -- user maps ports externally. | MEDIUM |
| Redis | 7.x alpine | Pub/sub + optional caching | Add to docker-compose.yml for WebSocket relay fan-out. Lightweight. | MEDIUM |

### Docker Compose Services (target)

```
services:
  db:         PostgreSQL 18 (existing)
  redis:      Redis 7 alpine (NEW)
  backend:    FastAPI + Uvicorn (existing, extend)
  frontend:   Nginx serving static build (reworked from existing)
  prestart:   Migration runner (existing)
```

**What to remove from existing docker-compose.yml:**
- `adminer` service: Development tool, not production. Move to a `docker-compose.dev.yml` override.

**No exposed ports pattern:** The docker-compose.yml defines NO port mappings. Users add port exposure via:
- A `docker-compose.override.yml` with their port mappings
- An external reverse proxy (Caddy, Traefik, nginx on host)
- Cloud provider load balancer

### Node Deployment

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Single Go binary | Node runtime | `go build -o gsd-node ./cmd/node` produces a static binary. | HIGH |
| Bash startup script | Bootstrap + config | Reads config from env vars or config file. Starts binary with correct flags. | HIGH |
| systemd unit file (optional) | Process management | For production Linux nodes. Auto-restart on crash. Standard practice. | MEDIUM |

---

## Monorepo Structure

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| pnpm workspaces | Frontend package management | Already using pnpm. Workspaces link `packages/protocol-ts` and `server/frontend`. | HIGH |
| Go workspaces (`go.work`) | Go module linking | Links `node/daemon` and `node/protocol-go` without `replace` directives. | HIGH |
| No monorepo orchestrator (no Turborepo, no Nx) | Simplicity | Two deployment targets (server Docker, node binary). pnpm workspaces + Go workspaces cover the linking needs. A monorepo orchestrator adds complexity without proportional benefit for this project size. | MEDIUM |

### Target Directory Layout

```
glsd/
  server/
    backend/          # FastAPI (Python)
    frontend/         # React/Vite (TypeScript)
  node/
    daemon/           # Go binary
    protocol-go/      # Go protocol types
  packages/
    protocol-ts/      # TypeScript protocol types + Zod schemas
  docker-compose.yml
  go.work
  pnpm-workspace.yaml
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend framework | FastAPI | Django + Channels | Existing codebase is FastAPI. Django would be a rewrite. |
| Backend framework | FastAPI | Go for server too | Python backend is already partially built. Two-language project is the existing reality. |
| Database | PostgreSQL | SQLite | Multi-user SaaS needs concurrent writes, ACID, connection pooling. SQLite max 1 writer. |
| Frontend framework | React 18 | Next.js / Remix | Server-side rendering unnecessary -- this is an SPA behind auth. Extra complexity for no benefit. |
| Frontend framework | React 18 | Svelte / Vue | Existing codebase is React with 14 Radix UI components. Migration cost is prohibitive. |
| CSS framework | Tailwind v3 | Tailwind v4 | v4 migration is nontrivial (JS config to CSS-first). Do after integration stabilizes. |
| React version | React 18 | React 19 | Too many concurrent migrations. React 19 after Tauri removal and backend integration stabilize. |
| Node WebSocket | coder/websocket | gorilla/websocket | gorilla/websocket is unmaintained since 2023. coder/websocket is the successor. |
| Monorepo tool | pnpm workspaces + go.work | Turborepo / Nx | Two deployment targets, no shared build caching needs. Orchestrator is overhead. |
| Message format | JSON text frames | MessagePack / Protobuf | Protocol already specifies JSON. Human-readable debugging outweighs serialization speed for this message volume. |
| State management | React Query + Context | Redux Toolkit | App state is primarily server-derived. React Query handles that. Redux adds ceremony without benefit. |

---

## Installation

### Server Backend

```bash
# In server/backend/
pip install -e ".[dev]"
# or with uv (recommended for speed):
uv pip install -e ".[dev]"
```

New dependency to add to pyproject.toml:
```toml
"redis[hiredis]>=5.0.0,<6.0.0",
```

### Server Frontend

```bash
# In server/frontend/
pnpm install
```

New dependency to add:
```bash
pnpm add zod  # Protocol message validation
```

Dependencies to remove:
```bash
pnpm remove @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-shell
pnpm remove -D @tauri-apps/cli
```

### Node Agent

```bash
# In node/
go work init ./daemon ./protocol-go
# Build
cd daemon && go build -o ../bin/gsd-node ./cmd/node
```

---

## Version Summary

| Component | Current (in repo) | Target | Upgrade Required |
|-----------|--------------------|--------|-----------------|
| Python | >=3.10 | >=3.10 | No |
| FastAPI | >=0.114.2 | >=0.114.2 | No (pin to latest 0.x at integration time) |
| PostgreSQL | 18 | 18 | No |
| SQLModel | >=0.0.21 | >=0.0.21 | No, but add async session pattern |
| React | 18.3.1 | 18.3.x | No |
| Vite | 6.0.5 | 8.x | Yes -- free perf win, low risk |
| Tailwind CSS | 3.4.17 | 3.4.x | No -- defer v4 |
| pnpm | 9.0.0 | 9.x | No |
| TypeScript | 5.7.2 | 5.7.x | No |
| Go | 1.25.0 | 1.25.0 | No |
| coder/websocket | 1.8.14 | 1.8.x | No |

---

## Confidence Levels

| Area | Confidence | Reason |
|------|------------|--------|
| Server backend (FastAPI + PG) | HIGH | Existing code, well-understood stack, verified current |
| Server frontend (React + Vite) | HIGH | Existing code, deliberate decision to defer React 19 and Tailwind v4 |
| Node agent (Go) | HIGH | Existing code, Go 1.25 confirmed current, all deps verified |
| WebSocket relay pattern | MEDIUM | Architecture is sound (FastAPI native WS + ConnectionManager), but implementation is net-new. Redis pub/sub adds complexity that may not be needed initially. |
| Protocol TypeScript bindings | MEDIUM | Approach (hand-written + Zod) is standard, but no existing code to validate against |
| Async database migration | MEDIUM | psycopg3 supports async, but migrating existing sync SQLModel code requires touching every database access point |
| Monorepo structure | MEDIUM | pnpm workspaces + go.work is the right choice, but restructuring 4 projects into this layout is the riskiest part of integration |
| Deployment (Docker Compose) | HIGH | Existing docker-compose.yml is close to target. Modifications are additive (Redis, Nginx). |
| Vite 8 upgrade | MEDIUM | Straightforward for standard setups, but gsd-vibe has not been tested with Vite 8 |

---

## Sources

- [FastAPI WebSocket documentation](https://fastapi.tiangolo.com/advanced/websockets/)
- [FastAPI WebSocket relay with Redis pub/sub](https://oneuptime.com/blog/post/2026-01-25-websocket-servers-fastapi-redis/view)
- [WebSocket/SSE with FastAPI -- connection management and scale-out](https://blog.greeden.me/en/2025/10/28/weaponizing-real-time-websocket-sse-notifications-with-fastapi-connection-management-rooms-reconnection-scale-out-and-observability/)
- [Go 1.25 release notes](https://go.dev/doc/go1.25)
- [coder/websocket on pkg.go.dev](https://pkg.go.dev/github.com/coder/websocket)
- [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [Tailwind CSS v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [Vite 8 release -- Rolldown bundler](https://vite.dev/releases)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [SQLModel async with FastAPI and PostgreSQL](https://daniel.feldroy.com/posts/til-2025-08-using-sqlmodel-asynchronously-with-fastapi-and-air-with-postgresql)
- [FastAPI SQLModel async best practices discussion](https://github.com/fastapi/fastapi/discussions/9936)
