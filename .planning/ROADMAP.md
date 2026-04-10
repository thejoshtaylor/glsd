# Roadmap: GSD Cloud

## Overview

GSD Cloud integrates four existing projects (daemon, protocol-go, deployable-saas-template, gsd-vibe) into a monorepo that delivers a self-hosted relay platform for managing remote Claude Code sessions. The roadmap moves from structural foundation through daemon reliability, server relay implementation, frontend integration, session persistence, and deployment polish -- each phase delivering a verifiable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Monorepo Foundation** - Restructure four projects into server/ and node/ directories with all builds passing (completed 2026-04-09) — [v1.0 archive](.planning/milestones/v1.0-ROADMAP.md)
- [ ] **Phase 2: Daemon Stabilization** - Fix known production-blocking bugs in the Go daemon before relay work begins
- [ ] **Phase 3: Server Relay and Auth** - Implement the FastAPI relay hub, auth system, and core session lifecycle
- [x] **Phase 4: Frontend Integration** - Replace Tauri with REST/WebSocket API client and deliver the working web UI (completed 2026-04-10)
- [ ] **Phase 5: Reliability and Persistence** - Sessions survive disconnects; reconnection replay and activity feed operational
- [ ] **Phase 6: Deployment Polish** - Docker Compose production config and node install script ready for self-hosting

## Phase Details

### Phase 1: Monorepo Foundation *(archived — see [v1.0 milestone](.planning/milestones/v1.0-ROADMAP.md))*

Completed 2026-04-09. 2/2 plans done. Requirements INFR-01, INFR-02 satisfied. All builds green.

### Phase 2: Daemon Stabilization
**Goal**: The Go daemon reliably manages Claude Code processes with no orphans, no WAL race conditions, and correct reconnection behavior
**Depends on**: Phase 1
**Requirements**: DAEM-01, DAEM-02, DAEM-03, DAEM-04
**Success Criteria** (what must be TRUE):
  1. Killing the daemon process results in all child Claude processes being terminated (no orphaned PIDs)
  2. WAL prune operation does not lose events under concurrent append load
  3. Daemon processes the welcome message and resumes from the server-acked WAL sequence on reconnect
  4. Session actor goroutines and resources are cleaned up after session end (no goroutine leaks)
**Plans:** 2 plans
Plans:
- [x] 02-01-PLAN.md — WAL RWMutex race fix and session actor cleanup on exit
- [x] 02-02-PLAN.md — Signal handler orphan prevention and welcome message WAL replay

### Phase 3: Server Relay and Auth
**Goal**: End-to-end message relay works -- a browser client authenticates, creates a session on a paired node, and receives responses through the server relay hub
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, SESS-01, SESS-02, SESS-06, RELY-01, RELY-02, RELY-03, RELY-04
**Success Criteria** (what must be TRUE):
  1. User can create an account, log in (persisting across browser sessions), and log out
  2. Node operator can pair a node to their server account using a token, and the server maintains a persistent WebSocket connection to that node
  3. User can start a Claude Code session on a selected node and stop a running session
  4. Browser WebSocket messages are routed to the correct node/session via channelId, and node responses route back to the correct browser
  5. Session state and stream events are persisted in PostgreSQL
**Plans:** 5 plans
Plans:
- [x] 03-00-PLAN.md — Wave 0 test stubs (xfail) for all Phase 3 requirement IDs (TDD foundation)
- [x] 03-01-PLAN.md — Database models, ConnectionManager, protocol Pydantic models, and test fixtures
- [x] 03-02-PLAN.md — Node pairing REST API (create/list/revoke tokens) with D-03 immediate disconnect
- [x] 03-03-PLAN.md — Session lifecycle REST endpoints and node daemon WebSocket (hello/welcome)
- [x] 03-04-PLAN.md — Browser WebSocket relay with JWT auth, message routing, and event storage tests

### Phase 4: Frontend Integration
**Goal**: GSD Vibe runs as a web app against the FastAPI backend with real-time session streaming, node management, and mobile-responsive layout
**Depends on**: Phase 3
**Requirements**: AUTH-05, AUTH-06, SESS-03, SESS-04, VIBE-01, VIBE-02, VIBE-03, VIBE-04, VIBE-05
**Success Criteria** (what must be TRUE):
  1. GSD Vibe loads in a browser with no Tauri dependencies -- all API calls go through REST/WebSocket to the FastAPI server
  2. User sees real-time Claude Code output rendered in an xterm.js terminal in the browser
  3. User can approve or deny permission requests and answer questions from the UI
  4. Node management dashboard shows connected nodes, their online/offline status, and active sessions; user can revoke a node
  5. User can browse the filesystem of a connected node from the UI
  6. All screens are usable on mobile (approval flows, session monitoring, node management)
**Plans:** 5/5 plans complete
Plans:
- [x] 04-01-PLAN.md — API client foundation, protocol types, backend cookie auth, Tauri stub gutting
- [x] 04-02-PLAN.md — Auth flow: login page, ProtectedRoute, App.tsx restructuring
- [x] 04-03-PLAN.md — Real-time session streaming: useCloudSession hook, terminal adaptation, permission/question prompts
- [x] 04-04-PLAN.md — Node management dashboard: /nodes list, /nodes/:nodeId detail, sidebar nav
- [x] 04-05-PLAN.md — Filesystem browser adaptation and mobile responsiveness verification
**UI hint**: yes

### Phase 5: Reliability and Persistence
**Goal**: Sessions survive browser disconnects and server restarts -- users can reconnect and catch up on missed events
**Depends on**: Phase 4
**Requirements**: SESS-05, RELY-05, VIBE-06
**Success Criteria** (what must be TRUE):
  1. User can refresh the browser mid-session and reconnect without losing any stream events (WAL replay through server)
  2. Control messages (taskComplete, permissionRequest, question) are reliably delivered after node reconnection
  3. Activity feed shows a live stream of events across all active sessions on all nodes
**Plans:** 3 plans
Plans:
- [x] 05-01-PLAN.md — Backend replay handler, activity broadcaster, SSE/REST activity endpoints with tests
- [x] 05-02-PLAN.md — Frontend reconnection flow: GsdWebSocket replayRequest, useCloudSession lastSeq tracking, reconnection banner/toast
- [x] 05-03-PLAN.md — Activity feed sidebar widget with SSE live streaming and main layout integration
**UI hint**: yes

### Phase 6: Deployment Polish
**Goal**: A new user can self-host the full GSD Cloud stack using only Docker Compose and a bash script
**Depends on**: Phase 5
**Requirements**: INFR-03, INFR-04
**Success Criteria** (what must be TRUE):
  1. `docker-compose up` starts the full server stack (FastAPI + PostgreSQL + Nginx) with no manual configuration beyond environment variables
  2. A bash install script downloads/builds the node binary and starts the daemon with a single command
  3. No ports are exposed by default in the Docker Compose config (port exposure handled externally by the user)
**Plans**: 1 plan
Plans:
- [x] 07-01-PLAN.md — GET /nodes/{node_id}, node_id session filter, channel_id on SessionPublic, xfail stub conversion

### Phase 7: Backend API Completion
**Goal**: All backend API routes are fully implemented — nodes are individually retrievable, sessions are filterable by node, and channel IDs are properly assigned to sessions
**Depends on**: Phase 3
**Requirements**: AUTH-05, AUTH-06, VIBE-04, SESS-06 (partial), SESS-01 (partial)
**Gap Closure**: Closes gaps from v1.0 audit (CRIT-01, CRIT-03, CRIT-05)
**Success Criteria** (what must be TRUE):
  1. `GET /api/v1/nodes/{node_id}` returns the node or 404 — NodeDetailPage renders without error
  2. `GET /api/v1/sessions/?node_id={id}` filters sessions by node — per-node session lists work correctly
  3. `SessionPublic` includes `channel_id: str` — browser uses real channel ID, not sessionId fallback
  4. All Phase 3 `@pytest.mark.xfail` stubs in `test_auth.py` are converted to real assertions or removed
  5. Sequence type annotation mismatch (Python `dict[str, int]` vs Go `map[string]int64`) is resolved
**Plans**: 1 plan
Plans:
- [x] 07-01-PLAN.md — GET /nodes/{node_id}, node_id session filter, channel_id on SessionPublic, xfail stub conversion

### Phase 8: WebSocket Auth and Session Wiring
**Goal**: End-to-end WebSocket sessions work in local HTTP dev — auth is not blocked by secure cookies, cwd is threaded through to the daemon, and there is a routable page to start a session on a node
**Depends on**: Phase 7
**Requirements**: RELY-02, SESS-03, SESS-01, VIBE-02
**Gap Closure**: Closes gaps from v1.0 audit (CRIT-04, CRIT-02, PART-03)
**Success Criteria** (what must be TRUE):
  1. Cookie auth works for WebSocket in local HTTP dev — browser sends httpOnly cookie with WS upgrade request (no token in URL per D-01)
  2. Cookie `secure=` flag is conditional on `settings.ENVIRONMENT != "local"` — local HTTP dev works
  3. `cwd` from `createSession` response is stored in local state and sent in `sendTask` — daemon starts Claude in the correct directory
  4. `/nodes/:nodeId/session` route renders `InteractiveTerminal` wired to a live cloud session
**Plans**: 1 plan
Plans:
- [x] 08-01-PLAN.md — Cookie secure flag fix, cwd threading in useCloudSession, session page + route + New Session button

### Phase 9: UI Wiring Completion
**Goal**: Orphaned UI components are connected, navigation dead-ends are fixed, and deferred Tauri stubs are removed
**Depends on**: Phase 8
**Requirements**: RELY-05, VIBE-06
**Gap Closure**: Closes gaps from v1.0 audit (PART-01, PART-02)
**Success Criteria** (what must be TRUE):
  1. `ReconnectionBanner` is imported and rendered in `InteractiveTerminal` when `connectionState !== 'connected'`
  2. Activity feed click-through navigates to a valid route (either `/nodes/:nodeId/session` or a new `/sessions/:id` page)
  3. `first-launch-wizard.tsx` Tauri stub is cleaned up or removed
**Plans**: 1 plan
Plans:
- [ ] 09-01-PLAN.md — ReconnectionBanner wiring, /sessions/:id redirect route, first-launch-wizard deletion

### Phase 10: Phase Verification Closure
**Goal**: All executed phases have VERIFICATION.md files; Nyquist compliance is complete; REQUIREMENTS.md reflects ground truth
**Depends on**: Phase 9
**Requirements**: AUTH-05, AUTH-06, SESS-03, SESS-04, VIBE-01, VIBE-02, VIBE-03, VIBE-04, VIBE-05, SESS-05, RELY-05, VIBE-06
**Gap Closure**: Closes audit blockers — VERIFICATION.md missing for phases 04 and 05
**Success Criteria** (what must be TRUE):
  1. `04-VERIFICATION.md` exists and verifies all 9 Phase 4 requirements
  2. `05-VERIFICATION.md` exists and verifies all 3 Phase 5 requirements
  3. REQUIREMENTS.md checkboxes for Phase 2 and Phase 3 reflect their verified status
  4. Nyquist validation passes for phases 2, 3, and 4 (`/gsd-validate-phase 2`, `3`, `4`)
  5. Full pytest suite runs clean against live PostgreSQL
**Plans:** 1/2 plans executed
Plans:
- [x] 10-01-PLAN.md — Create 04-VERIFICATION.md and 05-VERIFICATION.md from codebase inspection
- [ ] 10-02-PLAN.md — Sync REQUIREMENTS.md checkboxes and run pytest suite

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Monorepo Foundation | 2/2 | Complete   | 2026-04-09 |
| 2. Daemon Stabilization | 2/2 | Planned | - |
| 3. Server Relay and Auth | 0/5 | Planned | - |
| 4. Frontend Integration | 5/5 | Complete   | 2026-04-10 |
| 5. Reliability and Persistence | 0/3 | Planned | - |
| 6. Deployment Polish | 0/0 | Not started | - |
| 7. Backend API Completion | 1/1 | Complete   | 2026-04-10 |
| 8. WebSocket Auth and Session Wiring | 0/1 | Planned | - |
| 9. UI Wiring Completion | 0/1 | Not started | - |
| 10. Phase Verification Closure | 1/2 | In Progress|  |
