# GSD Cloud

## What This Is

A monorepo combining a deployable SaaS server and distributed node agents into a unified GSD Cloud platform. Users access GSD Vibe — a mobile-first web frontend — on the server, which relays Claude Code session commands to daemon-controlled nodes via WebSocket protocol. The result is a single interface for managing remote GSD/Claude Code sessions across multiple machines.

## Core Value

A unified GSD Vibe frontend that lets users run and manage Claude Code sessions on remote nodes from anywhere, via a self-hosted server they control.

## Requirements

### Validated

All 29 active requirements validated (AUTH-05, AUTH-06, SESS-03, SESS-04, VIBE-01, VIBE-02, VIBE-03, VIBE-04, VIBE-05, SESS-05, RELY-05, VIBE-06 — validated in Phase 10; remainder across Phases 1–9). INFR-03 and INFR-04 remain pending (CI pipeline test coverage and cross-platform testing).

### Active

- [ ] Monorepo organized into `server/` and `node/` top-level directories
- [ ] Server is Docker Compose deployable with no exposed ports (port exposure handled externally)
- [ ] Server frontend: GSD Vibe (React/TypeScript/Vite/Tailwind) integrated, mobile-first, all GSD Vibe features included
- [ ] Server backend: FastAPI + PostgreSQL, handles auth, session management, and WebSocket relay to nodes
- [ ] Node is a Go binary deployable individually with a bash startup script
- [ ] Node bundles the daemon (Claude Code process runner via pty) and protocol-go (WebSocket relay)
- [ ] Node registers with the server using a user token — same account as the server login
- [ ] Server backend supports all GSD Vibe functionality via REST + WebSocket APIs
- [ ] Server UI includes node management: view connected nodes, monitor sessions, control execution

### Out of Scope

- Exposed ports on server — handled by the user's existing port exposure integration
- Tauri desktop shell from gsd-vibe — web-only for the server frontend
- Separate node auth system — nodes use the same account credentials as the server

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
| Monorepo with `server/` and `node/` directories | Separates deployment targets clearly; server = Docker Compose, node = Go binary | — Pending |
| WebSocket JSON relay (not gRPC) | Protocol already defined and implemented this way in protocol-go | — Pending |
| Server as relay hub, daemon as execution engine | Daemon is already built around this model; server orchestrates, node executes | — Pending |
| Node identity via user token | Same account across server and node simplifies auth; no separate node credential system | — Pending |
| Extend deployable-saas-template for server backend | Partially built, has auth/JWT/PostgreSQL already; faster than greenfield | — Pending |

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

## Current State (v1.0 — shipped 2026-04-09)

Monorepo foundation is complete. All four source projects are in place with passing build pipelines. No feature code has been written yet — the project is ready for Phase 2 (Daemon Stabilization).

**Shipped:** INFR-01 (monorepo structure), INFR-02 (build pipelines green)
**Next:** Phase 2 — fix known production-blocking bugs in the Go daemon before relay work begins

**Key decisions validated by v1.0:**
- `server/` + `node/` directory split maps cleanly to Docker Compose vs Go binary deployment targets
- WebSocket JSON relay protocol is unchanged and intact in `node/protocol-go/`
- pnpm workspace + go.work combination works cleanly with no cross-contamination

## Requirements Evolution (at v1.0)

**Validated:** INFR-01, INFR-02
**Still active:** All others (AUTH, SESS, RELY, DAEM, VIBE — 29 of 31 v1 requirements)
**Out of Scope updates:** None since initialization

## Phase 7 Completion (2026-04-10)

Phase 7 complete — five backend API gaps closed. GET /nodes/{node_id} endpoint added with ownership check (T-07-01: no info leak). node_id filter added to GET /sessions/ with user scoping. channel_id field added to SessionPublic (ephemeral, not persisted). All three xfail stubs in test_auth.py converted to real passing tests.

**Validated in Phase 7:** AUTH-05 (GET /nodes/{id} ownership), AUTH-06 (404 for unowned), VIBE-04 (node_id session filter), SESS-06 (partial — node_id filtering), SESS-01 (partial — channel_id on SessionPublic)

## Phase 10 Completion (2026-04-10)

Phase 10 (verification closure) complete — all 5 ROADMAP success criteria met. VERIFICATION.md files created for phases 4 and 5. REQUIREMENTS.md synchronized (29/31 requirements checked). Nyquist validation resolved for phases 2, 3, and 4 (all VALIDATION.md files have `nyquist_compliant: true` with completed sign-off checklists). pytest suite confirmed running against live PostgreSQL (119/119 passing, zero SQLite references). All 23 plans complete across v1.0 milestone.

**Validated in Phase 10:** AUTH-05, AUTH-06, SESS-03, SESS-04, VIBE-01, VIBE-02, VIBE-03, VIBE-04, VIBE-05, SESS-05, RELY-05, VIBE-06 (final traceability closure)
**Milestone v1.0 complete** — all planned phases executed and verified.

---
*Last updated: 2026-04-10 after Phase 10 completion (milestone v1.0 complete)*
