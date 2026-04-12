# Project Research Summary

**Project:** GSD Cloud
**Domain:** Self-hosted multi-node AI agent management platform
**Researched:** 2026-04-09
**Confidence:** HIGH

---

## Executive Summary

GSD Cloud is a three-tier relay platform: a browser-based frontend talks to a FastAPI server, which relays WebSocket messages to headless Go daemon agents running on remote machines. The server is a stateful relay hub — not a transparent proxy — that authenticates users, persists session state, inspects every message envelope to update its own state, and routes between browser and node connections. This architecture is well-suited for the self-hosted single-team use case: a single Uvicorn process handles hundreds of concurrent WebSocket connections with no need for distributed infrastructure.

The recommended approach is integration, not greenfield. Four partially-built projects (a Go daemon with a working relay client and WAL, a FastAPI/PostgreSQL SaaS template, a React/Tailwind frontend, and a Go protocol library) provide the entire stack. The primary work is restructuring these into a coherent monorepo, implementing the missing server-side relay hub, and migrating the frontend away from Tauri IPC to REST/WebSocket calls against the FastAPI backend. Stack decisions are almost entirely locked by existing code — the critical new pieces are the FastAPI WebSocket connection registry, async database access patterns, and TypeScript protocol bindings.

The key risks are: (1) the monorepo restructure breaking all four build pipelines simultaneously if done carelessly, (2) the existing daemon having known bugs around message loss during reconnection (control messages bypass the WAL), orphaned Claude processes after daemon crashes, and a WAL prune race condition that can lose events. These bugs are well-understood and fixable but must be addressed before production use. Security needs a node-scoped token model — the current design gives node credentials the same trust level as user browser sessions, which is unsuitable for multi-user deployment.

---

## Key Findings

### Recommended Stack

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| Server backend | FastAPI + Uvicorn | >=0.114.2 | Existing code; native async WebSocket support via Starlette; no additional dependency needed for relay |
| Database | PostgreSQL + SQLModel + Alembic | PG 18, SQLModel >=0.0.21 | Existing code; must switch from sync to async engine for relay concurrency |
| DB driver | psycopg3 (binary) | >=3.1.13 | Existing; async-native; URL scheme change is the only migration needed |
| Auth | PyJWT + pwdlib (argon2) | Existing versions | Existing code; extend to issue machine-scoped tokens for nodes |
| WebSocket relay | Starlette WebSocket (built-in) | Bundled | No extra dependency; in-memory ConnectionManager sufficient for self-hosted single-process target |
| Server frontend | React 18 + Vite + Tailwind v3 + Radix UI | React 18.3.x, Vite 8.x, Tailwind 3.4.x | Stay on React 18 and Tailwind v3; defer major version upgrades until after Tauri removal stabilizes; Vite 8 is a free build-speed win |
| State / data fetching | TanStack React Query + React Context | >=5.62.0 | Existing; extend REST hooks to call FastAPI instead of Tauri invoke |
| WebSocket client | Native browser WebSocket API | Built-in | Protocol is raw JSON text frames; build thin TS client with reconnect + exponential backoff |
| Terminal rendering | xterm.js | 6.x | Existing in gsd-vibe with fit/search/serialize addons |
| Protocol types | Hand-written TS + Zod (frontend); Pydantic models (backend) | Current | ~15 message types; codegen overhead not justified |
| Node agent | Go + coder/websocket + creack/pty | Go 1.25, coder/websocket 1.8.14 | Existing; coder/websocket is the maintained successor to gorilla/websocket |
| Node build | go build + bash startup script | Go 1.25 toolchain | Single static binary; no Docker on nodes |
| Monorepo | pnpm workspaces + Go workspaces (go.work) | pnpm 9.x | Two deployment targets do not need Turborepo/Nx |
| Deployment | Docker Compose v2 + Nginx | PG 18 + Redis 7 alpine + Nginx alpine | Extend existing docker-compose.yml; no ports exposed by default |

**One critical version upgrade required:** Vite 6.0.5 to 8.x (low risk, free speed win via Rolldown bundler).

**Tauri removal is the largest frontend migration:** Five @tauri-apps/* packages must be removed and replaced with a lib/api.ts module wrapping fetch() and WebSocket calls.

---

### Expected Features

**Must Have (table stakes — missing means product does not function):**
- WebSocket relay hub (server accepts browser WS + node WS, routes by sessionId/channelId)
- Real-time stream rendering (xterm.js consuming stream events from relay)
- Node registration and pairing (6-char pairing code flow, hello/welcome handshake)
- Node health dashboard (heartbeat tracking, online/offline status)
- Session lifecycle management (create, task, stop, status)
- Permission request/response flow (modal approval UI for tool calls)
- Question/answer flow (inline response widget)
- JWT authentication (extend existing SaaS template auth)
- Multi-session view (all sessions across all nodes, single pane of glass)
- Mobile-responsive layout (approval flows and monitoring must work on phone)
- Task cost tracking (aggregate from taskComplete token/cost fields)
- File browsing on remote nodes (browseDir/readFile protocol already defined)
- Reconnection and WAL replay (browser reconnect catches up via server-buffered events)
- Session persistence (PostgreSQL-backed; survives server restarts)

**Should Have (differentiators for v1 polish):**
- GSD workflow integration (adapt gsd-vibe plan/milestone/todo views to server APIs)
- Project-scoped sessions
- Push notifications for permission requests (Web Push / PWA)
- Configurable autonomy levels (per-project permission mode presets)
- Activity feed (cross-project, cross-node stream)
- Command snippets and templates
- Guided project creation wizard
- Keyboard shortcuts
- Diagnostics / doctor panel
- Audit trail (full event log with timestamps and user attribution)

**Defer to v2+:**
- Multi-node broadcast, session recording/playback, GitHub integration, environment variable management per project, view-only session sharing

**Deliberate anti-features (never build):**
- Built-in code editor, multi-tenant SaaS, agent orchestration layer, custom LLM provider support, desktop app, automatic node provisioning, billing

---

### Architecture Approach

**Pattern:** Stateful relay hub. The server inspects every message envelope, updates its own state, enforces authorization, and then forwards to the appropriate destination. It is NOT a transparent byte forwarder.

**Core server components:**
- RelayHub singleton: two in-memory dicts — machineId->WebSocket (nodes) and channelId->WebSocket (browsers)
- /api/v1/ws/browser: browser WebSocket endpoint; JWT auth; one connection per browser client, multiplexed by channelId
- /api/v1/ws/node: node WebSocket endpoint; machine-scoped bearer token; one connection per node
- relay/protocol.py: Pydantic envelope types mirroring PROTOCOL.md

**New database models needed:** Machine, PairingCode, Session, StreamEvent (for WAL replay)

**Routing rules:**
- Browser to Node: resolve sessionId to machineId via DB, write to node_connections[machineId]
- Node to Browser: read channelId from envelope, write to browser_connections[channelId]
- Heartbeat: update machine.last_seen_at, do NOT forward
- TaskComplete: update session stats in DB, then forward

**Locked decisions:**
1. Frontend never talks to nodes directly
2. Nodes only make outbound connections (no inbound ports required)
3. One browser WebSocket per client, multiplexed by channelId
4. RelayHub is in-memory, single-process (no Redis for self-hosted target)
5. PROTOCOL.md is the authoritative spec; Python and TypeScript are consumers

---

### Critical Pitfalls

**Pitfall 1: Control messages dropped during WebSocket reconnection (CRITICAL)**
The daemon WAL only captures stream frames. taskComplete, taskError, permissionRequest, and question messages bypass the WAL and are silently dropped when the relay connection is down. Sessions appear hung; permission requests vanish.
Fix: WAL ALL outbound messages before relay send. Implement server-side session state sync on reconnect. Add integration test: kill WebSocket mid-task, verify taskComplete arrives after reconnection.

**Pitfall 2: Orphaned Claude processes after daemon crash (CRITICAL — unbounded cost)**
Claude processes use Setsid:true (detached from daemon process group). SIGKILL of the daemon leaves orphans running indefinitely, consuming API rate limit and money.
Fix: Write PID files per session. On daemon startup, scan for stale PIDs and send SIGTERM/SIGKILL before connecting to relay.

**Pitfall 3: WAL prune race condition (CRITICAL — event loss)**
PruneUpTo() releases the mutex between ReadFrom and the atomic rename, allowing Append to write entries that are then overwritten by the stale temp file.
Fix: Hold the lock for the entire read + write + rename operation in PruneUpTo.

**Pitfall 4: Monorepo restructure breaks all four build pipelines (CRITICAL — blocks all work)**
Each source project has its own module identity and import paths. Naive directory moves produce cascading breakage.
Fix: Dedicated phase with zero feature work. Validate each build pipeline independently. Use go.work and pnpm workspaces.

**Pitfall 5: Node credentials have user-level trust (SECURITY)**
Current design uses the user's JWT for node auth, giving compromised nodes full REST API access. No per-node revocation possible.
Fix: Machine-scoped JWT tokens with scope:"node:relay" claim. Server middleware rejects REST calls from node-scoped tokens. Implement per-node revocation.

---

## Implications for Roadmap

**Phase 1: Monorepo Foundation**
Rationale: Everything else breaks if this is wrong. Pure structural work, zero features.
Delivers: Clean monorepo with all four projects in target locations, all build pipelines passing.
Key work: Move daemon to node/internal/, extract protocol/ at top level with go/ and ts/ subdirs, server/backend/ from SaaS template, server/frontend/ from gsd-vibe (Tauri deps removed), go.work and pnpm-workspace.yaml, verify go build + pnpm build + docker compose build.
Pitfalls to avoid: Pitfall 4 (monorepo breakage).
Research flag: STANDARD — well-documented Go workspace and pnpm workspace patterns.

**Phase 2: Daemon Stabilization**
Rationale: Known production-blocking bugs in the node agent must be fixed before building the server relay that depends on reliable message delivery.
Delivers: Production-safe Go daemon with reliable message delivery, no orphaned processes, no WAL race.
Key work: WAL all outbound messages, PID file tracking for orphan cleanup, WAL prune race fix, actor removal from manager map, context threading through RestartWithGrant, implement the welcome handler (existing _ = welcome TODO).
Pitfalls to avoid: Pitfalls 1, 2, 3, 7, 11.
Research flag: STANDARD — all bugs identified with specific file locations and fix strategies.

**Phase 3: Server Relay + Auth**
Rationale: The core of the product. Nothing works without the relay hub.
Delivers: Working end-to-end relay. Node connects, browser connects, messages flow bidirectionally. Session creation and task dispatch functional.
Key work: Machine/PairingCode/Session/StreamEvent DB models + Alembic migrations, async DB migration, POST /api/daemon/pair pairing endpoint, RelayHub, /ws/node and /ws/browser endpoints, envelope routing logic, machine-scoped JWT claims.
Pitfalls to avoid: Pitfall 3 (bounded outbound queues for backpressure), Pitfall 5 (machine-scoped tokens).
Research flag: NEEDS RESEARCH — FastAPI async WebSocket relay with backpressure and connection lifecycle under production conditions.

**Phase 4: Frontend Integration**
Rationale: Frontend cannot function until server relay is complete.
Delivers: Working web UI with node management, session creation, real-time stream rendering, permission approval flows, mobile-responsive layout.
Key work: Replace lib/tauri.ts with lib/api.ts, update TanStack Query hooks to REST calls, implement WebSocket client with reconnect/backoff, xterm.js adapter for stream events, node list UI, session creation UI, permission modal, question/answer widget.
Pitfalls to avoid: Pitfall 8 (design stream event batching before building message display), Pitfall 13 (gsd-vibe is the authority frontend).
Research flag: STANDARD for React WebSocket client. NEEDS RESEARCH for event batching strategy at mobile scale.

**Phase 5: Reliability + Session Persistence**
Rationale: Makes the platform feel trustworthy rather than fragile. Build on a working E2E system.
Delivers: Sessions survive browser disconnects and server restarts. Cost tracking and multi-session dashboard.
Key work: Server persists StreamEvent records, tracks acked_sequence per session, sends replayRequest on reconnect, WAL replay through server relay, cost aggregation display, multi-session dashboard.
Pitfalls to avoid: Pitfall 1 (full reconnection/replay completion), Pitfall 14 (sequence number gaps — implement max(wal_seq, acked_seq) logic).
Research flag: STANDARD — WAL + sequence number replay is a well-documented pattern; protocol spec already defines message contracts.

**Phase 6: GSD Workflow + Polish**
Rationale: Differentiating features that build on a stable, reliable core.
Delivers: GSD project/plan/milestone/todo views, project-scoped sessions, file browsing, activity feed, push notifications, audit trail, production Docker Compose, node install script.
Key work: Server-side project CRUD APIs, project-session association, file browsing sandboxing, push notifications (Web Push + service worker), Docker Compose finalization with tested reverse proxy WebSocket config, curl-pipe node installer.
Pitfalls to avoid: Pitfall 15 (file system sandboxing — restrict browseDir/readFile to configured workspace root), Pitfall 9 (reverse proxy WebSocket timeout and header config).
Research flag: NEEDS RESEARCH for Web Push / PWA service worker implementation.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack choices | HIGH | Almost entirely constrained by existing code; validated against current versions |
| Feature set | HIGH | Protocol spec and existing daemon confirm feasibility and build order |
| Architecture — relay hub pattern | HIGH | Derived from existing daemon architecture and well-established FastAPI WebSocket patterns |
| Architecture — async DB migration | MEDIUM | psycopg3 supports async natively; migration touches every DB access point |
| Monorepo restructure plan | MEDIUM | go.work + pnpm workspaces is correct; reorganizing 4 independent projects is highest-risk operation |
| Daemon bug fixes | HIGH | All bugs identified from direct code analysis with specific line numbers and fix strategies |
| Relay hub implementation | MEDIUM | Pattern is sound; backpressure and connection lifecycle edge cases require careful implementation |
| Frontend Tauri removal | MEDIUM | Replacement pattern is clear; volume of Tauri invoke() calls throughout gsd-vibe needs audit |
| Security (node token scoping) | MEDIUM | JWT scope claim approach is standard; requires server middleware audit |
| Deployment / reverse proxy | MEDIUM | Docker Compose structure clear; WebSocket proxy config requires tested documentation per proxy type |

### Gaps to Address

1. **Tauri call audit:** Full count and distribution of @tauri-apps/api invoke() calls in gsd-vibe is unknown. Phase 4 estimate could expand if calls are deeply embedded beyond the lib/tauri.ts abstraction.

2. **Welcome handler TODO:** daemon.go has `_ = welcome` with a TODO comment. The daemon does not currently use ackedSequencesBySession from the server's welcome response. Must be implemented in Phase 2 before relay work begins.

3. **Stream event storage strategy:** Whether to store every StreamEvent in PostgreSQL or use a separate append-only log is unresolved. At high session volume, all-events-in-PG may become a bottleneck. Phase 5 should load-test before committing.

4. **PTY behavior on macOS vs. Linux:** The daemon uses Linux-specific Pdeathsig behavior. The cross-platform process cleanup strategy (PID files + startup scan) must be tested on both platforms.

5. **Node installer distribution:** Decision needed between GitHub Releases pre-built binaries (requires release pipeline) vs. build-from-source on the node (requires Go on node machine).

---

*Research completed: 2026-04-09*
*Ready for roadmap: yes*
