---
phase: 05-reliability-and-persistence
plan: 02
subsystem: ui
tags: [websocket, reconnection, replay, xterm, react, sonner]

# Dependency graph
requires:
  - phase: 05-reliability-and-persistence/01
    provides: WAL persistence and replay endpoint on server backend
provides:
  - GsdWebSocket with lastSeq tracking and replayRequest on reconnect
  - connectionState emission (disconnected/connecting/connected)
  - useCloudSession with sequence deduplication and replay state management
  - ReconnectionBanner component for disconnect UX
affects: [frontend-terminal, session-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [sequence-based deduplication, connectionState emission pattern, replay-then-toast flow]

key-files:
  created:
    - server/frontend/src/components/session/reconnection-banner.tsx
  modified:
    - server/frontend/src/lib/api/ws.ts
    - server/frontend/src/lib/protocol.ts
    - server/frontend/src/hooks/use-cloud-session.ts

key-decisions:
  - "Let replayed permissionRequest/question show and dismiss naturally rather than batch-tracking requestIds"
  - "connectionState 'replaying' state set when reconnecting with existing lastSeq, transitions to 'connected' on replayComplete"

patterns-established:
  - "Sequence dedup pattern: check seq <= lastSeqRef.current before processing any sequenced message"
  - "connectionState emission: GsdWebSocket emits state changes, hook subscribes and maps to richer states (adding 'replaying')"

requirements-completed: [SESS-05, RELY-05]

# Metrics
duration: 3min
completed: 2026-04-10
---

# Phase 5 Plan 2: Frontend Reconnection Flow Summary

**GsdWebSocket sends replayRequest on reconnect with lastSeq tracking, useCloudSession deduplicates replayed events by sequence number, and ReconnectionBanner provides disconnect UX feedback**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-10T04:36:02Z
- **Completed:** 2026-04-10T04:38:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- GsdWebSocket enhanced with lastSeq tracking, sessionId binding, replayRequest on reconnect, and connectionState emission
- ReplayCompleteMessage type and isReplayComplete type guard added to protocol types
- useCloudSession tracks sequence numbers via useRef, deduplicates all sequenced message handlers during replay
- ReconnectionBanner component renders per UI-SPEC (32px, muted bg, Loader2 spinner, "Reconnecting..." text)
- Toast notification ("Reconnected", 2s auto-dismiss) fires on replayComplete

## Task Commits

Each task was committed atomically:

1. **Task 1: GsdWebSocket reconnection enhancements + protocol types** - `1a864d4` (feat)
2. **Task 2: useCloudSession replay integration + reconnection banner** - `406274a` (feat)

## Files Created/Modified
- `server/frontend/src/lib/protocol.ts` - Added ReplayCompleteMessage interface, union member, and type guard
- `server/frontend/src/lib/api/ws.ts` - Added lastSeq, sessionId, connectionState emission, replayRequest on reconnect
- `server/frontend/src/hooks/use-cloud-session.ts` - Added lastSeqRef, sequence dedup on all handlers, connectionState, replayComplete handler with toast
- `server/frontend/src/components/session/reconnection-banner.tsx` - New disconnect indicator component

## Decisions Made
- Let replayed permissionRequest/question modals show and dismiss naturally during fast replay rather than implementing requestId batch-tracking -- simplifies implementation without visible UX impact
- connectionState uses four values in the hook ('disconnected', 'connecting', 'connected', 'replaying') while GsdWebSocket emits three ('disconnected', 'connecting', 'connected') -- the hook derives 'replaying' from lastSeqRef > 0 at connect time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend reconnection flow is complete and ready for integration testing with the backend WAL replay endpoint from plan 05-01
- ReconnectionBanner needs to be wired into the terminal container component (parent must have position: relative)
- Next plan (05-03) can build on this connectionState for additional reliability UX

## Self-Check: PASSED

All 4 files verified present. Both task commits (1a864d4, 406274a) verified in git log.

---
*Phase: 05-reliability-and-persistence*
*Completed: 2026-04-10*
