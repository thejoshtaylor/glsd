# Requirements: GSD Cloud

**Defined:** 2026-04-09
**Core Value:** A unified GSD Vibe frontend that lets users run and manage Claude Code sessions on remote nodes from anywhere, via a self-hosted server they control.

## v1 Requirements

### Infrastructure

- [ ] **INFR-01**: Monorepo is organized into `server/` and `node/` top-level directories with all 4 source projects integrated
- [ ] **INFR-02**: Server frontend and backend share a pnpm workspace; node projects use go.work
- [ ] **INFR-03**: Server is deployable via `docker-compose up` with no ports exposed (port exposure handled externally)
- [ ] **INFR-04**: Node is deployable as a Go binary via `go build` plus a bash install/run script

### Authentication

- [ ] **AUTH-01**: User can create an account with email and password on the server
- [ ] **AUTH-02**: User can log in and stay logged in across browser sessions (JWT)
- [ ] **AUTH-03**: User can log out from any page
- [ ] **AUTH-04**: Node operator can pair a node to their server account using a user token
- [ ] **AUTH-05**: User can view all paired nodes in the UI
- [ ] **AUTH-06**: User can revoke (disconnect) a node from the UI

### Session Management

- [ ] **SESS-01**: User can start a Claude Code session on a selected node with a prompt and working directory
- [ ] **SESS-02**: User can stop (interrupt) a running Claude Code session
- [ ] **SESS-03**: User sees real-time stream output from a Claude Code session in the browser
- [ ] **SESS-04**: User can approve or deny Claude Code permission requests from the UI
- [ ] **SESS-05**: Session survives browser refresh — user can reconnect and replay missed events (WAL replay)
- [ ] **SESS-06**: User can run multiple Claude Code sessions on a single node simultaneously

### Relay Infrastructure

- [ ] **RELY-01**: Server maintains persistent WebSocket connections to each connected node daemon
- [ ] **RELY-02**: Server routes browser WebSocket messages to the correct node/session via channelId
- [ ] **RELY-03**: Server stores session state and stream events in PostgreSQL
- [ ] **RELY-04**: Node daemon reconnects to server automatically after connection loss
- [ ] **RELY-05**: Control messages (taskComplete, permissionRequest, question) are reliably delivered even after reconnection

### Daemon Reliability

- [ ] **DAEM-01**: Daemon terminates all Claude child processes when the daemon exits (no orphaned processes)
- [ ] **DAEM-02**: Daemon correctly processes the `welcome` message and resumes from acked WAL sequence after reconnect
- [ ] **DAEM-03**: WAL append and prune operations are race-condition free
- [ ] **DAEM-04**: Session actor resources are cleaned up when a session ends

### GSD Vibe Frontend

- [ ] **VIBE-01**: GSD Vibe frontend runs as a web app (Tauri IPC replaced with REST/WebSocket API client)
- [ ] **VIBE-02**: All GSD Vibe screens are adapted and functional: phases, plans, tasks, roadmaps, milestones
- [ ] **VIBE-03**: Frontend is mobile-first and usable on small screens
- [ ] **VIBE-04**: Node management dashboard shows connected nodes, their status, and active sessions
- [ ] **VIBE-05**: User can browse the filesystem of a connected node from the UI
- [ ] **VIBE-06**: Activity feed shows a stream of events across all active sessions

## v2 Requirements

### Notifications

- **NOTF-01**: User receives push notification (PWA/Web Push) when a permission request arrives
- **NOTF-02**: User receives push notification when a long-running session completes
- **NOTF-03**: User can configure which events trigger push notifications

### Cost & Usage

- **COST-01**: Server tracks per-session token usage from daemon usage events
- **COST-02**: User can view usage history per node and per session
- **COST-03**: User can set per-node token budget limits

### Advanced Auth

- **AUTH-07**: User can reset password via email link
- **AUTH-08**: Email verification on signup
- **AUTH-09**: API keys for programmatic server access

### Scalability

- **SCAL-01**: Server relay hub uses Redis pub/sub for multi-worker deployments
- **SCAL-02**: Stream event storage includes automatic pruning policy

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tauri desktop app shell | Web-only for server frontend; Tauri shell removed during integration |
| Multi-tenant SaaS / billing | Self-hosted only; each deployment is single-tenant |
| Multi-LLM support | Claude Code only; other LLMs are out of scope |
| Code editor in UI | Terminal streaming is the interface; no in-browser editor |
| Agent orchestration / swarm | Out of scope for this integration; daemon runs single Claude Code sessions |
| OAuth login (Google/GitHub) | Email/password sufficient for self-hosted v1 |
| Exposed ports on server | Handled by user's existing port exposure integration |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 1 | Pending |
| INFR-02 | Phase 1 | Pending |
| INFR-03 | Phase 6 | Pending |
| INFR-04 | Phase 6 | Pending |
| AUTH-01 | Phase 3 | Pending |
| AUTH-02 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| AUTH-04 | Phase 3 | Pending |
| AUTH-05 | Phase 4 | Pending |
| AUTH-06 | Phase 4 | Pending |
| SESS-01 | Phase 3 | Pending |
| SESS-02 | Phase 3 | Pending |
| SESS-03 | Phase 4 | Pending |
| SESS-04 | Phase 4 | Pending |
| SESS-05 | Phase 5 | Pending |
| SESS-06 | Phase 3 | Pending |
| RELY-01 | Phase 3 | Pending |
| RELY-02 | Phase 3 | Pending |
| RELY-03 | Phase 3 | Pending |
| RELY-04 | Phase 3 | Pending |
| RELY-05 | Phase 5 | Pending |
| DAEM-01 | Phase 2 | Pending |
| DAEM-02 | Phase 2 | Pending |
| DAEM-03 | Phase 2 | Pending |
| DAEM-04 | Phase 2 | Pending |
| VIBE-01 | Phase 4 | Pending |
| VIBE-02 | Phase 4 | Pending |
| VIBE-03 | Phase 4 | Pending |
| VIBE-04 | Phase 4 | Pending |
| VIBE-05 | Phase 4 | Pending |
| VIBE-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after initial definition*
