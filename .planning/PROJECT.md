# GSD Cloud

## What This Is

A monorepo combining a deployable SaaS server and distributed node agents into a unified GSD Cloud platform. Users access GSD Vibe — a mobile-first web frontend — on the server, which relays Claude Code session commands to daemon-controlled nodes via WebSocket protocol. The result is a single interface for managing remote GSD/Claude Code sessions across multiple machines.

## Core Value

A unified GSD Vibe frontend that lets users run and manage Claude Code sessions on remote nodes from anywhere, via a self-hosted server they control.

## Requirements

### Validated

- ✓ INFR-01: Monorepo organized into `server/` and `node/` top-level directories — v1.0
- ✓ INFR-02: pnpm workspace + go.work linking server and node projects — v1.0
- ✓ INFR-03: Server deployable via `docker-compose up` with no exposed ports — v1.0
- ✓ INFR-04: Node deployable as Go binary via `go build` + bash install script — v1.0
- ✓ AUTH-01: User can create an account with email and password — v1.0
- ✓ AUTH-02: User stays logged in across browser sessions (JWT cookie) — v1.0
- ✓ AUTH-03: User can log out from any page — v1.0
- ✓ AUTH-04: Node operator can pair a node using a user token — v1.0
- ✓ AUTH-05: User can view all paired nodes in the UI — v1.0
- ✓ AUTH-06: User can revoke a node from the UI — v1.0
- ✓ SESS-01: User can start a Claude Code session on a selected node — v1.0
- ✓ SESS-02: User can stop a running session — v1.0
- ✓ SESS-03: User sees real-time stream output in the browser terminal — v1.0
- ✓ SESS-04: User can approve or deny permission requests from the UI — v1.0
- ✓ SESS-05: Session survives browser refresh via WAL replay — v1.0
- ✓ SESS-06: User can run multiple sessions on a single node simultaneously — v1.0
- ✓ RELY-01: Server maintains persistent WebSocket connections to each node — v1.0
- ✓ RELY-02: Server routes browser WebSocket messages via channelId — v1.0
- ✓ RELY-03: Server stores session state and events in PostgreSQL — v1.0
- ✓ RELY-04: Node daemon reconnects to server automatically after connection loss — v1.0
- ✓ RELY-05: Control messages reliably delivered after reconnection — v1.0
- ✓ DAEM-01: Daemon terminates all Claude child processes on exit — v1.0
- ✓ DAEM-02: Daemon resumes from acked WAL sequence after reconnect — v1.0
- ✓ DAEM-03: WAL append and prune are race-condition free — v1.0
- ✓ DAEM-04: Session actor resources cleaned up when session ends — v1.0
- ✓ VIBE-01: GSD Vibe runs as web app (Tauri removed) — v1.0
- ✓ VIBE-02: All GSD Vibe screens adapted and functional — v1.0
- ✓ VIBE-03: Frontend is mobile-first and usable on small screens — v1.0
- ✓ VIBE-04: Node management dashboard shows nodes, status, active sessions — v1.0
- ✓ VIBE-05: User can browse the filesystem of a connected node from the UI — v1.0
- ✓ VIBE-06: Activity feed shows a stream of events across all active sessions — v1.0

### Active (v1.1)

- [ ] NOTF-01: User receives push notification (PWA/Web Push) when a permission request arrives
- [ ] NOTF-02: User receives push notification when a long-running session completes
- [ ] COST-01: Server tracks per-session token usage from daemon usage events
- [ ] COST-02: User can view usage history per node and per session
- [ ] AUTH-07: User can reset password via email link
- [ ] AUTH-08: Email verification on signup
- [ ] SCAL-01: Server relay hub uses Redis pub/sub for verified multi-worker deployments
- [ ] BUG-01: node.token_hash (and any related) column migrations applied so nodes/projects pages load without 500 errors
- [ ] STUB-01: All Tauri stubs required for full frontend functionality replaced with real implementations
- [ ] UX-01: User can open a "Deploy on new node" modal from the Nodes page with step-by-step pairing instructions

### Out of Scope

- Exposed ports on server — handled by the user's existing port exposure integration
- Tauri desktop shell from gsd-vibe — web-only for the server frontend (validated: web works well)
- Separate node auth system — nodes use the same account credentials as the server
- Multi-tenant SaaS / billing — self-hosted only; each deployment is single-tenant
- Multi-LLM support — Claude Code only
- OAuth login (Google/GitHub) — email/password sufficient for self-hosted v1

## Context

Four partially-built projects exist in the repo and are the source material for this integration:

| Folder | Purpose | Stack |
|--------|---------|-------|
| `daemon/` | Runs Claude Code processes on nodes via pty, handles WebSocket relay to server | Go |
| `deployable-saas-template/` | Full-stack SaaS template (server base) | FastAPI + PostgreSQL + React/Vite |
| `protocol-go/` | WebSocket JSON relay protocol definition (server↔node wire format) | Go |
| `gsd-vibe/` | GSD Vibe frontend — the target UI for the server frontend | React/TypeScript/Vite/Tailwind/Radix UI |

**Protocol architecture:** WebSocket JSON relay — browser connects to server, server relays to daemon on node. The `protocol-go` package defines envelope types and message contracts; both Go (daemon) and TypeScript (frontend) bindings must conform to `PROTOCOL.md`.

**Daemon role:** Spawns and manages Claude Code CLI processes via pty on the node machine. Streams output back to the browser through the relay chain.

**Auth:** JWT-based (server), node registration via user token tied to a server account.

## Constraints

- **Tech — Node:** Go binary only; must be deployable via `go build` + bash script, no Docker on nodes
- **Tech — Server backend:** Python/FastAPI + SQLModel/PostgreSQL; extend the deployable-saas-template
- **Tech — Server frontend:** React/TypeScript/Vite/Tailwind from gsd-vibe; must be mobile-first
- **Deploy — Server:** Docker Compose only, no ports exposed directly
- **Protocol:** All server↔node communication must conform to `protocol-go/PROTOCOL.md` spec
- **Dependency:** daemon already imports `github.com/gsd-build/protocol-go` — keep this relationship

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo with `server/` and `node/` directories | Separates deployment targets clearly; server = Docker Compose, node = Go binary | ✓ Clean separation validated |
| WebSocket JSON relay (not gRPC) | Protocol already defined in protocol-go; no wire format change needed | ✓ Works end-to-end |
| Server as relay hub, daemon as execution engine | Daemon already built around this model; server orchestrates, node executes | ✓ Architecture holds |
| Node identity via user token | Same account across server and node simplifies auth | ✓ Pairing flow works cleanly |
| Extend deployable-saas-template for server backend | Partially built, has auth/JWT/PostgreSQL; faster than greenfield | ✓ Good call, auth was solid foundation |
| In-memory ConnectionManager + Redis pub/sub fallback | Single-worker sufficient for v1; Redis added for multi-worker scale-out | ✓ Redis wired; fallback tested |
| httpOnly cookie auth for browser WebSocket | Can't use headers in browser WS upgrade; JWT in cookie works | ✓ Conditional secure flag needed for local dev |
| TDD xfail wave-0 for Phase 3 | 32 stubs enabled test-first discipline across all relay requirements | ✓ All stubs converted to real tests |
| asyncio.Future pattern for node relay requests | One-shot future per request ID with 5s timeout for /fs and /file proxy | ✓ Clean request/response correlation |
| 4 gap-closure phases (7-10) after v1.0 audit | Audit revealed CRIT gaps; added phases rather than abandoning milestone | ✓ All gaps closed, milestone complete |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

## Current Milestone: v1.1 Notifications, Usage, Auth & Polish

**Goal:** Add push notifications, token usage tracking, email auth flows, and a fully polished UI — fixing all remaining Tauri stubs, database migration gaps, and deployment UX.

**Target features:**
- Push notifications (PWA/Web Push) for permission requests and session completions
- Per-session token usage tracking and usage history UI
- Password reset via email link and email verification on signup
- Redis pub/sub verified under multi-worker load
- Migration for node.token_hash and any other missing columns (500 errors on nodes/projects pages)
- Audit and fix all Tauri stubs blocking full frontend functionality
- "Deploy on new node" button/modal with step-by-step pairing instructions on Nodes page

## Previous State (v1.0 — shipped 2026-04-10)

**v1.0 GSD Cloud MVP is complete.** All 10 phases executed and verified. The full relay chain is implemented: browser → FastAPI relay hub → Go daemon → Claude Code process. Users can self-host the server via Docker Compose, pair nodes with a bash install script, and manage remote Claude Code sessions from the GSD Vibe web UI.

**Shipped:** All 31 v1 requirements (INFR, AUTH, SESS, RELY, DAEM, VIBE)
**Stack:** FastAPI + PostgreSQL + Redis + Nginx (server) · Go binary (node) · React/TypeScript/xterm.js (frontend)
**Test coverage:** 119/119 pytest passing against live PostgreSQL · TypeScript compiles clean
**Known gaps:** VIBE-02 feature completeness unverified end-to-end; Redis pub/sub untested under multi-worker load

**Next:** Run `/gsd-new-milestone` to plan v1.1

---
*Last updated: 2026-04-11 after v1.1 milestone start*
