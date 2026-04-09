# Phase 3: Server Relay and Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 03-server-relay-and-auth
**Areas discussed:** Node pairing token, Session start flow, Stream event storage, Node online/offline state

---

## Node Pairing Token

| Option | Description | Selected |
|--------|-------------|----------|
| Long-lived + revocable | Token persists until revoked; node stores once | ✓ |
| Short-lived (15-60 min) | Time-windowed setup token | |

**User's choice:** Long-lived + revocable

| Option | Description | Selected |
|--------|-------------|----------|
| Reveal once on generation | UI shows once, server stores hash | ✓ |
| Always visible in UI | Token readable anytime | |

**User's choice:** Reveal once on generation

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate disconnect | Close WS + active sessions get taskError | ✓ |
| Block reconnect only | Current sessions finish, then can't reconnect | |

**User's choice:** Immediate disconnect on revoke

| Option | Description | Selected |
|--------|-------------|----------|
| Tied to user account | Each token belongs to one user | ✓ |
| Server-wide (superuser only) | Shared node resources | |

**User's choice:** Tied to user account

---

## Session Start Flow

| Option | Description | Selected |
|--------|-------------|----------|
| REST-first | POST /api/sessions → sessionId, then WS task | ✓ |
| WS-only, implicit creation | Session created on first task message | |

**User's choice:** REST-first

| Option | Description | Selected |
|--------|-------------|----------|
| JWT in query param | ws://...?token=<jwt> | ✓ |
| Cookie-based auth | httpOnly cookie on WS upgrade | |

**User's choice:** JWT in query param

| Option | Description | Selected |
|--------|-------------|----------|
| Forward + mark stopping in DB | Optimistic stopping state | |
| Forward only, DB on daemon response | DB updated when taskComplete/taskError arrives | ✓ |

**User's choice:** Forward only — DB updated on daemon response

---

## Stream Event Storage

| Option | Description | Selected |
|--------|-------------|----------|
| All events from day one | stream chunks + control events stored | ✓ |
| Control events only for now | stream chunks deferred to Phase 5 | |

**User's choice:** All events from day one

| Option | Description | Selected |
|--------|-------------|----------|
| One row per event, JSONB payload | session_id, seq, type, payload JSONB | ✓ |
| Batch rows (N events per row) | Reduced write amplification | |

**User's choice:** One row per event, JSONB payload

| Option | Description | Selected |
|--------|-------------|----------|
| After DB write | ack sent after PostgreSQL confirms | ✓ |
| Fire-and-forget ack | ack immediately, DB write async | |

**User's choice:** After DB write

---

## Node Online/Offline State

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory + DB on connect/disconnect | ConnectionManager in-memory, last_seen in DB | ✓ |
| DB-only, polled | Heartbeat writes to DB, UI polls | |

**User's choice:** In-memory + DB hybrid

| Option | Description | Selected |
|--------|-------------|----------|
| Update last_seen in DB | Heartbeat updates nodes.last_seen | ✓ |
| Ignore heartbeats in Phase 3 | WS presence is the only signal | |

**User's choice:** Update last_seen in DB on heartbeat

---

## Claude's Discretion

- ConnectionManager placement within FastAPI app structure
- sequence_number semantics (daemon WAL seq vs server-assigned)
- Alembic migration ordering
- Node status representation (enum vs string column)

## Deferred Ideas

None
