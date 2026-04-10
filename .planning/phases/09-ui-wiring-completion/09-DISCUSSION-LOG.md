# Phase 9: UI Wiring Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 09-ui-wiring-completion
**Areas discussed:** ReconnectionBanner visibility, Activity click-through route, first-launch-wizard disposal

---

## ReconnectionBanner visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Only on re-connect | Show only when connectionState is 'connecting' or 'replaying' AND sessionId exists. Hides during initial connect — Loader2 handles that. | ✓ |
| All non-connected states | Show whenever connectionState !== 'connected', including first connect. Simpler but overlaps initial loading spinner. | |
| Only 'replaying' state | Show only when replaying WAL events. Most precise but misses the drop-to-replay window. | |

**User's choice:** Only on re-connect (Recommended)
**Notes:** None

---

## Activity click-through route

| Option | Description | Selected |
|--------|-------------|----------|
| /sessions/:id redirect page | Thin route that fetches session by ID, extracts node_id, redirects to /nodes/:nodeId/session. Works even if nodeId isn't in ActivityEvent. | ✓ |
| Use event.nodeId directly | Change navigate to use optional nodeId from ActivityEvent. Simpler but fragile — nodeId isn't guaranteed. | |
| New /sessions/:id page | Real session detail page at /sessions/:id with its own InteractiveTerminal. More complete but more work. | |

**User's choice:** /sessions/:id redirect page (Recommended)
**Notes:** None

---

## first-launch-wizard disposal

| Option | Description | Selected |
|--------|-------------|----------|
| Delete everything | Remove file + test + index.ts export. Component is Tauri-era, no longer rendered. Clean break. | ✓ |
| Convert to no-op stub | Replace with minimal stub that renders null. Preserves export shape but leaves dead code. | |

**User's choice:** Delete everything (Recommended)
**Notes:** None

---
