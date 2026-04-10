# Milestones

## v1.0 GSD Cloud MVP (Shipped: 2026-04-10)

**Phases completed:** 10 phases, 26 plans, 37 tasks
**Timeline:** 2026-04-09 → 2026-04-10 (2 days)
**Commits:** 152

**Key accomplishments:**

- Four-project monorepo established with go.work + pnpm workspaces; all build pipelines green (Go, pnpm, Docker Compose)
- Go daemon made production-reliable: RWMutex WAL race fix, pdeathsig Linux orphan prevention, welcome-message WAL replay with ack-driven pruning
- FastAPI relay hub implemented: JWT auth, node pairing with argon2 tokens, browser/node WebSocket relay, PostgreSQL session/event persistence
- GSD Vibe web app: Tauri IPC fully removed, real-time xterm.js terminal streaming, permission/question prompts, node management dashboard, file browser via REST relay
- Session resilience: WAL replay on browser reconnect (lastSeq dedup), SSE activity feed, collapsible activity sidebar with badge count
- Production deployment stack: Docker Compose with Redis pub/sub for multi-worker relay, Nginx reverse proxy with SPA fallback, node bash install script with .env config
- Backend API gap closure: GET /nodes/{node_id} endpoint, node_id session filter, channel_id on SessionPublic, xfail stub conversion to real tests
- WebSocket auth wiring: conditional cookie secure flag (local HTTP dev works), cwd threaded from createSession to sendTask, session page at /nodes/:nodeId/session
- UI wiring complete: ReconnectionBanner connected to InteractiveTerminal, /sessions/:id redirect route, first-launch-wizard Tauri stub removed
- Verification closure: VERIFICATION.md for phases 4 and 5, Nyquist compliance for phases 2/3/4, 119/119 pytest passing against live PostgreSQL

**Requirements delivered:** 31/31 v1 requirements complete
**Archive:** [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

---
