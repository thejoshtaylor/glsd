# GSD Cloud

## What This Is

A monorepo combining a deployable SaaS server and distributed node agents into a unified GSD Cloud platform. Users access GSD Vibe — a mobile-first web frontend — on the server, which relays Claude Code session commands to daemon-controlled nodes via WebSocket protocol. The result is a single interface for managing remote GSD/Claude Code sessions across multiple machines.

## Core Value

A unified GSD Vibe frontend that lets users run and manage Claude Code sessions on remote nodes from anywhere, via a self-hosted server they control.

## Requirements

### Validated

(None yet — ship to validate)

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

---
*Last updated: 2026-04-09 after initialization*
