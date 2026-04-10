# Phase 5: Reliability and Persistence - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Sessions survive browser disconnects — users reconnect and catch up on missed events via WAL replay. Control messages (permissionRequest, question, taskComplete) are reliably delivered after reconnection. A collapsible sidebar activity feed shows live cross-session, cross-node events via a dedicated SSE stream.

Requirements: SESS-05, RELY-05, VIBE-06

</domain>

<decisions>
## Implementation Decisions

### WAL Replay — Reconnection Model

- **D-01:** Browser tracks `lastSeq` (last received sequence_number) in memory. On WebSocket reconnect (handled by the existing `GsdWebSocket` backoff loop in `lib/api/ws.ts`), browser sends `{"type": "replayRequest", "sessionId": "...", "fromSequence": N}`. Server queries `SessionEvent` where `sequence_number > N` and streams events in order. Client owns its replay cursor — server is stateless per browser.
- **D-02:** Replayed stream events append silently to the existing terminal buffer. No clearing, no visual distinction between live and replayed output. The mental model is "catching up" — output continues where it left off.
- **D-03:** Control messages (permissionRequest, question) are already stored as `SessionEvent` rows with sequence numbers. WAL replay on reconnect re-delivers them if their `sequence_number > lastSeq`. No separate pending-state table is needed.

### Reconnection UX

- **D-04:** During a WebSocket disconnect, a slim status banner appears above the terminal ("Reconnecting..." + spinner). Terminal remains visible but input is disabled. Banner disappears when WS reconnects.
- **D-05:** After successful reconnect and replay completes, a brief (~2s auto-dismissing) toast appears: "Reconnected". No terminal system message.
- **D-06:** If a pending `permissionRequest` or `question` is replayed on reconnect (i.e., Claude is still waiting for user action), the permission/question modal appears immediately — same behavior as if the message arrived live.

### Activity Feed

- **D-07:** The cross-session activity feed lives as a **collapsible sidebar widget** (not a separate /activity route). It can be opened/closed without leaving the current page and persists across navigation.
- **D-08:** Activity feed events shown (all others filtered): task sent, taskComplete, taskError, permissionRequest (with approved/denied outcome), question (with answer), session created, session stopped. Raw stream delta events are excluded — too granular.
- **D-09:** Real-time updates delivered via a **dedicated SSE stream** at `GET /api/v1/activity/stream`. This is independent of the session WebSocket connections — the feed stays live even when no session WS is open. React Query or a plain `EventSource` client subscribes.
- **D-10:** The existing `activity-feed.tsx` component (currently Tauri-backed and project-scoped) is adapted to consume the server SSE stream. Event type icons and color palette from the existing component are reused; data source switches from `onActivityLogged` (Tauri) to the SSE endpoint. `ActivityEntry` type is updated to reflect server event shape (nodeId, sessionId, event_type, message, created_at).

### Claude's Discretion

- Exact sidebar widget open/close trigger (chevron, icon button, or keyboard shortcut)
- Whether the activity feed widget shows a badge/count when collapsed and new events arrive
- Maximum retained events in the SSE feed before the list scrolls (suggest 50–100)
- Whether `replayRequest` is sent automatically in `GsdWebSocket.onopen` or in `useCloudSession` hook
- Error handling if SSE stream drops (reconnect with exponential backoff or silent retry)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol
- `node/protocol-go/PROTOCOL.md` — Wire format spec; replayRequest message type to be added
- `node/protocol-go/messages.go` — Authoritative field names for all protocol messages

### Server Backend (Phase 3/4 output — extend)
- `server/backend/app/api/routes/ws_browser.py` — Browser WS endpoint; add replayRequest handler
- `server/backend/app/api/routes/ws_node.py` — Node WS endpoint (reference for existing relay)
- `server/backend/app/models.py` — SessionEvent model with sequence_number (already exists)
- `server/backend/app/relay/connection_manager.py` — ConnectionManager (routing, browser registration)

### Server Frontend (Phase 4 output — extend)
- `server/frontend/src/lib/api/ws.ts` — GsdWebSocket class; add replayRequest send on reconnect
- `server/frontend/src/hooks/use-cloud-session.ts` — useCloudSession hook; integrate lastSeq tracking and reconnect replay
- `server/frontend/src/components/project/activity-feed.tsx` — Existing activity feed; adapt from Tauri to SSE
- `server/frontend/src/components/project/gsd2-activity-tab.tsx` — Activity tab wrapper; may need sidebar adaptation

### Tech Stack Reference
- `CLAUDE.md` §WebSocket Client — reconnection with exponential backoff (existing GsdWebSocket behavior)
- `CLAUDE.md` §Server Frontend — React 18, Tailwind v3, Radix UI, React Query

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GsdWebSocket` in `lib/api/ws.ts` — already has reconnection with exponential backoff; `onopen` callback is the hook point for sending replayRequest
- `SessionEvent` DB model (`app/models.py`) — composite PK (session_id, sequence_number); query for replay is `WHERE session_id = ? AND sequence_number > ?`
- `activity-feed.tsx` — component structure, icons, and color palette are reusable; only data source changes (Tauri → SSE)
- `useCloudSession` hook — manages session state; needs `lastSeq` ref to track highest received sequence_number

### Integration Points
- `ws_browser.py` message loop — add `replayRequest` case: query SessionEvent, stream events to browser
- `app/api/main.py` or routes — add `GET /api/v1/activity/stream` SSE endpoint
- Main layout sidebar — add collapsible activity widget alongside existing nav
- `GsdWebSocket.onopen` or `useCloudSession` reconnect path — send replayRequest after WS reconnects

### Patterns to Follow
- Phase 3 WS message envelope: `{"type": "<name>", ...fields}` — replayRequest follows same shape
- React Query `useQuery` for initial activity load; `EventSource` for live SSE updates
- Existing `components/ui/*` Radix UI primitives for collapsible sidebar widget (Collapsible component)

</code_context>
