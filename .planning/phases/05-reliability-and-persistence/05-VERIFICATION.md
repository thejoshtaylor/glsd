---
phase: 05-reliability-and-persistence
verified: 2026-04-10T12:00:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Open a session, refresh the browser mid-stream, confirm the session reconnects and replays missed events"
    expected: "xterm.js terminal shows replayed events after reconnect; toast confirms replay complete"
    why_human: "Requires live WebSocket session with streaming data to test reconnection"
  - test: "Open the activity sidebar, confirm SSE events appear in real-time as sessions run on connected nodes"
    expected: "Activity events stream into the sidebar widget without page refresh"
    why_human: "Requires live backend with active sessions generating events"
---

# Phase 5: Reliability and Persistence — Verification Report

**Phase Goal:** Sessions survive browser disconnects and server restarts — users can reconnect and catch up on missed events
**Verified:** 2026-04-10
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can refresh browser mid-session and reconnect without losing stream events (WAL replay through server) | VERIFIED | `server/backend/app/api/routes/ws_browser.py` lines 139-169: `replayRequest` handler queries `SessionEvent` table with `WHERE sequence_number > from_seq` (line 157-160) ordered by sequence_number, streams events to browser, then sends `replayComplete` sentinel with `lastSequence` (lines 163-168). `server/frontend/src/lib/api/ws.ts` lines 31-38: `GsdWebSocket.onopen` sends `replayRequest` on reconnect when `wasReconnect && this.sessionId && this.lastSeq > 0`. `use-cloud-session.ts` line 150: `const lastSeqRef = useRef<number>(0)` — tracks highest-seen sequence number across all message handlers (lines 221-227, 237, 245, 252, 261, 268). |
| 2 | Control messages (taskComplete, permissionRequest, question) are reliably delivered after node reconnection | VERIFIED | `server/backend/app/api/routes/ws_node.py` lines 163-227: message loop handles `stream`, `taskStarted`, `taskComplete`, `taskError`, `permissionRequest`, `question` message types. Lines 212-219: `SessionEvent` is created with `event_type=msg_type` and `payload=msg` and committed to DB. Line 220: ack sent ONLY after successful DB write (`D-10: ack only after successful DB write`). All six message types (including permissionRequest and question) are persisted before ack, ensuring they survive reconnection. |
| 3 | Activity feed shows a live stream of events across all active sessions on all nodes | VERIFIED | `server/backend/app/relay/broadcaster.py` lines 22-48: `ActivityBroadcaster` class with `subscribe()`, `unsubscribe()`, `publish()` methods. `server/backend/app/api/routes/activity.py` lines 57-73: `GET /api/v1/activity/stream` endpoint uses `broadcaster.subscribe()` and returns `StreamingResponse` with SSE generator. `server/frontend/src/hooks/use-activity-feed.ts` line 45: `const source = new EventSource('/api/v1/activity/stream', { withCredentials: true })` — SSE stream with cookie auth. `activity-sidebar.tsx` line 14: `const { events, sseError } = useActivityFeed()`. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/backend/app/relay/broadcaster.py` | ActivityBroadcaster with pub/sub | VERIFIED | 49 lines. `ACTIVITY_EVENT_TYPES` frozenset at line 11 (7 types). `ActivityBroadcaster` class at line 22. `subscribe()` at line 26, `unsubscribe()` at line 31, `publish()` at line 34. Queue maxsize=100 with drop-oldest policy (lines 37-44). Module-level singleton `broadcaster = ActivityBroadcaster()` at line 48. |
| `server/backend/app/api/routes/activity.py` | REST + SSE activity endpoints | VERIFIED | 74 lines. `GET /activity` at line 23 with D-08 event type filtering (line 41: `.where(col(SessionEvent.event_type).in_(ACTIVITY_EVENT_TYPES))`). `GET /activity/stream` at line 57 with `StreamingResponse` and `text/event-stream` media type (line 73). Auth enforced via `CurrentUser` dependency on both endpoints. |
| `server/backend/tests/test_broadcaster.py` | Broadcaster unit tests | VERIFIED | Confirmed FOUND via `test -f` check. 4 broadcaster unit tests per 05-01 SUMMARY. Tests cover subscribe/publish/unsubscribe behavior and drop-oldest queue policy. |
| `server/backend/tests/ws/test_browser_replay.py` | Replay handler integration tests | VERIFIED | Confirmed FOUND via `test -f` check. 5 replay integration tests per 05-01 SUMMARY. Tests cover replay query, sequence ordering, and replayComplete sentinel. |
| `server/backend/tests/api/routes/test_activity.py` | Activity endpoint tests | VERIFIED | Confirmed FOUND via `test -f` check. 5 activity endpoint tests per 05-01 SUMMARY. Tests cover REST load, auth enforcement on SSE endpoint. |
| `server/frontend/src/components/session/reconnection-banner.tsx` | ReconnectionBanner component | VERIFIED | Confirmed FOUND via `test -f` check. Per 05-02 SUMMARY: 32px height, muted bg, Loader2 spinner, "Reconnecting..." text. Used in `interactive-terminal.tsx` at lines 437-442. |
| `server/frontend/src/components/activity/activity-sidebar.tsx` | ActivitySidebar collapsible widget | VERIFIED | File confirmed FOUND. 40px collapsed / 320px expanded. `useActivityFeed()` at line 14. Navigate to `/sessions/${sessionId}` on event click at line 19-22. |
| `server/frontend/src/hooks/use-activity-feed.ts` | SSE hook with React Query initial load | VERIFIED | File read at source. Line 45: `EventSource('/api/v1/activity/stream', { withCredentials: true })`. Line 31-34: React Query initial load from `/activity?limit=50`. `MAX_EVENTS = 100` at line 9. `isOpenRef` pattern at line 27-28 for stale closure avoidance. |
| `server/frontend/src/lib/api/ws.ts` | GsdWebSocket with replayRequest on reconnect | VERIFIED | Lines 15-17: `lastSeq`, `sessionId`, `connectionStateHandlers` fields. Lines 31-38: `onopen` sends `replayRequest` with `fromSequence: this.lastSeq` on reconnect (when `wasReconnect && sessionId && lastSeq > 0`). Line 85: `updateLastSeq()`. Line 92: `setSessionId()`. Line 97: `onConnectionState()`. |
| `server/frontend/src/hooks/use-cloud-session.ts` | useCloudSession with lastSeq tracking and replay state | VERIFIED | Line 150: `const lastSeqRef = useRef<number>(0)`. Lines 201-214: `connectionState` transitions include `'replaying'` (when `lastSeqRef.current > 0` at reconnect). Lines 221-227: sequence dedup check `if (seq != null && seq <= lastSeqRef.current) return`. Line 277-281: `ws.on('replayComplete', ...)` transitions to `'connected'` and fires toast. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ws_browser.py` replayRequest handler | `SessionEvent` DB query | `db.exec(select(SessionEvent).where(...sequence_number > from_seq).order_by(...))` | WIRED | Lines 156-161: queries SessionEvent for session_id owned by requesting user, sequence_number > from_seq, ordered by sequence_number. Streams `event.payload` for each row. |
| `GsdWebSocket` (ws.ts) | `/ws/browser` WebSocket | `send({ type: 'replayRequest', sessionId, fromSequence: this.lastSeq })` on reconnect | WIRED | `ws.ts` lines 31-38: `onopen` handler sends replayRequest when `wasReconnect && this.sessionId && this.lastSeq > 0`. Connect URL at line 22: `wss://.../ws/browser?channelId=...`. |
| `useCloudSession` (use-cloud-session.ts) | `GsdWebSocket` instance | `ws.onConnectionState(...)` at line 201; `ws.on(...)` handlers; `ws.updateLastSeq(seq)` per message | WIRED | Lines 201-214: subscribes to connectionState transitions, derives 'replaying' state from `lastSeqRef.current > 0`. Lines 216-281: all message handlers call `ws.updateLastSeq(seq)` after dedup check. |
| `ActivityBroadcaster` (broadcaster.py) | SSE endpoint (activity.py) | `await broadcaster.subscribe(user_id)` in `activity_stream()` + `queue.get()` in generator | WIRED | `activity.py` line 60: `queue = await broadcaster.subscribe(str(current_user.id))`. Lines 62-68: async generator awaits `queue.get()`, formats as `data: {json}\n\n`. |
| `activity-sidebar.tsx` | `/api/v1/activity/stream` SSE endpoint | `EventSource` in `use-activity-feed.ts` line 45 | WIRED | `activity-sidebar.tsx` imports `useActivityFeed` at line 7; `use-activity-feed.ts` line 45 creates `EventSource('/api/v1/activity/stream', { withCredentials: true })`. SSE events parsed in `source.onmessage` and appended to `events` state. |
| `ws_node.py` message loop | `ActivityBroadcaster.publish()` | lines 229-238: after DB commit, calls `broadcaster.publish(...)` for ACTIVITY_EVENT_TYPES | WIRED | `ws_node.py` line 230: `if msg_type in ACTIVITY_EVENT_TYPES:`. Lines 232-238: calls `broadcaster.publish({ event_type, sessionId, nodeId, message, created_at })`. Publish happens AFTER `db.commit()` (line 220), ensuring event is persisted before broadcast. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ws_browser.py` replayRequest | `events` list from SessionEvent table | `db.exec(select(SessionEvent).where(...))` | Yes — PostgreSQL DB query returning persisted events | FLOWING |
| `useCloudSession` lastSeqRef | `lastSeqRef.current` | Updated on every sequenced message (`ws.on('stream', ...), ws.on('taskComplete', ...) etc.`) | Yes — reflects highest server-assigned sequence number received | FLOWING |
| `use-activity-feed.ts` SSE stream | `events` state | `EventSource('/api/v1/activity/stream')` → `broadcaster.publish()` → `queue.get()` | Yes — live events from active sessions via pub/sub queue | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| test_browser_replay.py exists | `test -f server/backend/tests/ws/test_browser_replay.py` | FOUND | PASS |
| test_activity.py exists | `test -f server/backend/tests/api/routes/test_activity.py` | FOUND | PASS |
| test_broadcaster.py exists | `test -f server/backend/tests/test_broadcaster.py` | FOUND | PASS |
| ReconnectionBanner exists | `test -f server/frontend/src/components/session/reconnection-banner.tsx` | FOUND | PASS |
| ActivitySidebar exists | `test -f server/frontend/src/components/activity/activity-sidebar.tsx` | FOUND | PASS |
| ActivityBroadcaster is module-level singleton | `grep "^broadcaster = " server/backend/app/relay/broadcaster.py` | Line 48: `broadcaster = ActivityBroadcaster()` | PASS |
| SSE endpoint uses StreamingResponse | `grep "StreamingResponse" server/backend/app/api/routes/activity.py` | Line 73: `return StreamingResponse(generate(), media_type="text/event-stream")` | PASS |
| replayRequest handler in ws_browser.py | `grep "replayRequest" server/backend/app/api/routes/ws_browser.py` | Line 139: `elif msg_type == "replayRequest":` | PASS |
| GsdWebSocket sends replayRequest on reconnect | `grep "replayRequest" server/frontend/src/lib/api/ws.ts` | Lines 32-37: sends replayRequest in `onopen` when `wasReconnect && sessionId && lastSeq > 0` | PASS |
| EventSource with withCredentials in useActivityFeed | `grep "withCredentials" server/frontend/src/hooks/use-activity-feed.ts` | Line 46: `withCredentials: true` | PASS |
| ACTIVITY_EVENT_TYPES frozenset in broadcaster | `grep "ACTIVITY_EVENT_TYPES" server/backend/app/relay/broadcaster.py` | Line 11: `ACTIVITY_EVENT_TYPES = frozenset({...})` with 7 event types | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SESS-05 | 05-01 (ws_browser.py), 05-02 (ws.ts, use-cloud-session.ts) | Browser reconnects and replays missed events via WAL | SATISFIED | Server: `ws_browser.py` replayRequest handler queries SessionEvent by `sequence_number > fromSequence` (lines 156-168). Client: `GsdWebSocket` sends replayRequest on reconnect with `lastSeq` (ws.ts lines 31-38). `useCloudSession` tracks `lastSeqRef` and deduplicates replayed events (lines 150, 221-227). |
| RELY-05 | 05-01 (ws_node.py persistence), 05-02 (reconnection banner) | Control messages reliably delivered after reconnection | SATISFIED | `ws_node.py` persists permissionRequest and question events (among all 6 types) to DB before acking (line 220). `ws_browser.py` replayRequest replays ALL stored event types including control messages. `ReconnectionBanner` provides disconnect UX at `interactive-terminal.tsx` lines 437-442. |
| VIBE-06 | 05-03 (activity-sidebar.tsx, use-activity-feed.ts, activity-context.tsx) | Activity feed shows live stream of events across all active sessions | SATISFIED | `ActivityBroadcaster` (broadcaster.py) publishes events per user. `GET /api/v1/activity/stream` (activity.py) delivers SSE. `useActivityFeed` (use-activity-feed.ts line 45) subscribes via EventSource with `withCredentials:true`. `ActivitySidebar` renders events with click-through to session. `ActivityProvider` context manages unread badge count. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | - |

No stubs, placeholders, hardcoded empty returns, or TODO/FIXME markers found in modified or created files.

### Gaps Summary

No code gaps found. All three Phase 5 success criteria are satisfied at the code level:

1. WAL replay: replayRequest handler queries SessionEvent by sequence number, streams events in order, sends replayComplete sentinel. Frontend GsdWebSocket sends replayRequest on reconnect with lastSeq tracking; useCloudSession deduplicates replayed events.
2. Control message reliability: ws_node.py persists ALL 6 message types (including permissionRequest and question) to DB before acking. Replay includes these messages, ensuring delivery after reconnection.
3. Activity feed: ActivityBroadcaster publishes qualifying event types per-user; SSE stream delivers live events to browser; ActivitySidebar widget renders with click-through navigation; unread badge count tracks new events.

Two human verification items required to confirm live runtime behavior (reconnect replay and SSE activity stream with an active backend).

---

_Verified: 2026-04-10_
_Verifier: Claude (gsd-verifier)_
