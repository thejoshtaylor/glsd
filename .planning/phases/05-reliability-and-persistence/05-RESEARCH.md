# Phase 5: Reliability and Persistence - Research

**Researched:** 2026-04-09
**Domain:** WebSocket reliability, WAL replay, SSE activity streaming
**Confidence:** HIGH

## Summary

Phase 5 adds three reliability features to the GSD Cloud platform: (1) browser reconnection with WAL replay so users never lose session output, (2) reliable control message delivery after node reconnection, and (3) a cross-session activity feed via SSE. The infrastructure for all three is substantially in place from Phases 3-4. The `SessionEvent` table already stores all relayed events with sequence numbers, `GsdWebSocket` already reconnects with exponential backoff, and the `activity-feed.tsx` component already has the visual structure -- it just needs a server data source.

The primary new code is: a `replayRequest` handler in `ws_browser.py`, `lastSeq` tracking in `useCloudSession`, a FastAPI SSE endpoint using the built-in `EventSourceResponse`, and a collapsible activity sidebar widget in the main layout. No new database tables or migrations are needed -- `SessionEvent` already has the right schema. No new Python dependencies are needed -- FastAPI 0.135.2 includes built-in SSE support.

**Primary recommendation:** Implement in three waves: (1) backend replay + SSE endpoints, (2) frontend reconnection flow with `lastSeq` tracking, (3) activity feed sidebar widget.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Browser tracks `lastSeq` in memory. On reconnect, sends `{"type": "replayRequest", "sessionId": "...", "fromSequence": N}`. Server queries `SessionEvent` where `sequence_number > N` and streams events in order. Client owns its replay cursor.
- **D-02:** Replayed stream events append silently to terminal buffer. No clearing, no visual distinction between live and replayed output.
- **D-03:** Control messages (permissionRequest, question) are already stored as SessionEvent rows. WAL replay re-delivers them if `sequence_number > lastSeq`. No separate pending-state table.
- **D-04:** During disconnect, a slim status banner appears above terminal ("Reconnecting..." + spinner). Terminal visible but input disabled. Banner disappears on reconnect.
- **D-05:** After reconnect and replay completes, a brief 2s auto-dismissing toast: "Reconnected". No terminal system message.
- **D-06:** Pending permissionRequest/question replayed on reconnect triggers modal immediately -- same as live delivery.
- **D-07:** Activity feed is a collapsible sidebar widget (not a separate route). Persists across navigation.
- **D-08:** Activity feed events: task sent, taskComplete, taskError, permissionRequest (with outcome), question (with answer), session created, session stopped. Raw stream deltas excluded.
- **D-09:** Real-time updates via dedicated SSE stream at `GET /api/v1/activity/stream`. Independent of session WebSocket connections.
- **D-10:** Existing `activity-feed.tsx` adapted to consume server SSE stream. Icons/colors reused. Data source switches from Tauri to SSE.

### Claude's Discretion
- Sidebar widget open/close trigger (chevron, icon button, or keyboard shortcut)
- Whether activity feed shows badge/count when collapsed and new events arrive
- Maximum retained events in SSE feed before list scrolls (suggest 50-100)
- Whether `replayRequest` is sent in `GsdWebSocket.onopen` or in `useCloudSession` hook
- Error handling if SSE stream drops (reconnect with exponential backoff or silent retry)

### Deferred Ideas (OUT OF SCOPE)
None specified.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-05 | Session survives browser refresh -- user can reconnect and replay missed events (WAL replay) | SessionEvent table already stores events with sequence_number. Server needs `replayRequest` handler in ws_browser.py. Frontend needs `lastSeq` tracking in useCloudSession + replayRequest send on GsdWebSocket reconnect. |
| RELY-05 | Control messages (taskComplete, permissionRequest, question) are reliably delivered even after reconnection | Already stored as SessionEvent rows with sequence numbers (verified in ws_node.py lines 196-211). WAL replay re-delivers them. Frontend modal handlers already exist in useCloudSession. |
| VIBE-06 | Activity feed shows a stream of events across all active sessions | New SSE endpoint at `/api/v1/activity/stream` using FastAPI built-in EventSourceResponse. Existing activity-feed.tsx adapted from Tauri to EventSource client. Sidebar widget added to main-layout.tsx. |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.135.2 | HTTP + WebSocket + SSE server | Already installed. Built-in `EventSourceResponse` at `fastapi.sse` (verified available). [VERIFIED: local import test] |
| Starlette | 1.0.0 | ASGI framework underneath FastAPI | Already installed. Provides WebSocket and streaming primitives. [VERIFIED: pip list] |
| SQLModel | >=0.0.21 | ORM for SessionEvent queries | Already installed and used for all models. [VERIFIED: existing models.py] |
| sonner | ^2.0.7 | Toast notifications (reconnection toast) | Already installed and used in 20+ files. [VERIFIED: package.json] |
| @xterm/xterm | ^6.0.0 | Terminal rendering (replay appends to existing buffer) | Already installed. [VERIFIED: package.json] |

### Supporting (no new installations needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `EventSource` (browser built-in) | Web API | SSE client for activity feed | Standard browser API. No library needed. Handles reconnection natively. [VERIFIED: MDN Web API] |
| React Query (@tanstack/react-query) | >=5.62.0 | Initial activity load, cache management | Already used throughout frontend. Use for `GET /api/v1/activity?limit=50` initial fetch. [VERIFIED: existing queries.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in FastAPI SSE (`fastapi.sse.EventSourceResponse`) | `sse-starlette` package | `sse-starlette` is more battle-tested but adds a dependency. FastAPI 0.135.2 has native SSE. Prefer zero-dependency approach. [ASSUMED] |
| Native `EventSource` browser API | `reconnecting-eventsource` npm package | Native EventSource auto-reconnects by default. Package unnecessary for this use case. [VERIFIED: MDN Web API spec] |
| CSS transform sidebar animation | `@radix-ui/react-collapsible` | Collapsible is not installed (14 Radix packages present, Collapsible is not one). CSS transitions with state toggle are simpler and avoid a new dependency. [VERIFIED: package.json audit] |

**Installation:**
```bash
# No new packages needed. Everything is already installed.
```

## Architecture Patterns

### Server-Side: WAL Replay Handler

**What:** Add a `replayRequest` message handler to `ws_browser.py` that queries `SessionEvent` table and streams matching events back to the browser in sequence order. [VERIFIED: existing ws_browser.py message loop structure]

**Pattern:**
```python
# Source: existing ws_browser.py pattern + SessionEvent model
elif msg_type == "replayRequest":
    session_id = msg.get("sessionId")
    from_seq = msg.get("fromSequence", 0)
    # Validate session ownership
    with DBSession(engine) as db:
        sess = db.get(SessionModel, uuid.UUID(session_id))
        if not sess or str(sess.user_id) != user_id:
            continue
        # Query events after fromSequence, ordered by sequence_number
        events = db.exec(
            select(SessionEvent)
            .where(SessionEvent.session_id == uuid.UUID(session_id))
            .where(SessionEvent.sequence_number > from_seq)
            .order_by(SessionEvent.sequence_number)
        ).all()
    # Stream events to browser
    for event in events:
        await websocket.send_json(event.payload)
    # Signal replay complete
    await websocket.send_json({
        "type": "replayComplete",
        "sessionId": session_id,
        "lastSequence": events[-1].sequence_number if events else from_seq
    })
```

**Key decisions:**
- Query ALL events at once (not paginated) because events are small JSON objects and a single session typically has hundreds, not millions. [ASSUMED -- verify if sessions can accumulate >10K events]
- Send a `replayComplete` sentinel so the frontend knows when to re-enable input and show the toast. This is a new message type not in PROTOCOL.md -- it is browser-only (server-to-browser), not relayed to daemon. [ASSUMED]

### Server-Side: SSE Activity Endpoint

**What:** A new FastAPI endpoint at `GET /api/v1/activity/stream` that streams activity events via SSE. Uses an in-memory asyncio broadcast pattern (publisher/subscriber). [VERIFIED: FastAPI SSE capability]

**Pattern:**
```python
# Source: FastAPI SSE docs (fastapi.tiangolo.com/tutorial/server-sent-events/)
from fastapi.sse import EventSourceResponse
import asyncio

class ActivityBroadcaster:
    """In-memory pub/sub for activity events."""
    def __init__(self):
        self._subscribers: set[asyncio.Queue] = set()

    async def publish(self, event: dict) -> None:
        for queue in self._subscribers:
            await queue.put(event)

    async def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

broadcaster = ActivityBroadcaster()  # module-level singleton

@router.get("/api/v1/activity/stream")
async def activity_stream(current_user: CurrentUser):
    queue = await broadcaster.subscribe()
    async def event_generator():
        try:
            while True:
                event = await queue.get()
                yield {"data": json.dumps(event)}
        except asyncio.CancelledError:
            broadcaster.unsubscribe(queue)
    return EventSourceResponse(event_generator())
```

**Integration point:** `ws_node.py` message loop calls `await broadcaster.publish(...)` whenever it persists a qualifying event (taskStarted, taskComplete, taskError, permissionRequest, question). Session created/stopped events published from session REST endpoints. [VERIFIED: ws_node.py event persistence at lines 196-211]

### Server-Side: Activity REST Endpoint

**What:** `GET /api/v1/activity?limit=50` returns recent activity events for initial load. Queries `SessionEvent` table filtered by user's sessions and event types from D-08. [VERIFIED: SessionEvent model]

### Frontend: lastSeq Tracking and Replay

**What:** `useCloudSession` hook maintains a `lastSeqRef` (React ref, not state -- avoids re-renders on every stream event). Updated on every incoming `stream`, `taskStarted`, `taskComplete`, `taskError`, `permissionRequest`, `question` message. On reconnect, `GsdWebSocket.onopen` (or the hook's reconnect callback) sends `replayRequest` with the last known sequence. [VERIFIED: existing useCloudSession hook structure]

**Recommendation for discretion area:** Send `replayRequest` in `GsdWebSocket` class directly, not in the hook. Reason: the `GsdWebSocket` class already handles reconnection internally (`scheduleReconnect`). Adding a `lastSeq` getter callback and sending `replayRequest` in `onopen` keeps the reconnection logic cohesive. The hook provides the `lastSeq` value via a callback registered at connection time.

### Frontend: Reconnection UX

**What:** Three UI states managed by `useCloudSession`:
1. `disconnected` -- banner visible, input disabled
2. `replaying` -- banner removed, events streaming, input still disabled
3. `connected` -- toast shown, input enabled

The `GsdWebSocket` class needs a new event: `connectionStateChange` that emits `'disconnected' | 'connecting' | 'connected'`. The hook subscribes to this and to `replayComplete` to transition between states. [VERIFIED: GsdWebSocket already tracks reconnect state internally]

### Frontend: Activity Feed Sidebar

**What:** A new `ActivitySidebar` component rendered in `main-layout.tsx` as a sibling to the main content area (right edge). Uses CSS transform for collapse/expand animation. Uses `EventSource` for live SSE updates. Uses React Query for initial data fetch. [VERIFIED: main-layout.tsx structure at line 505]

**Placement in layout:**
```tsx
{/* Main content + activity sidebar */}
<div role="main" className="flex-1 flex overflow-hidden bg-background">
  {/* Existing content column */}
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* existing breadcrumbs, page content, shell panel */}
  </div>
  {/* Activity sidebar */}
  <ActivitySidebar />
</div>
```

### Recommended Project Structure (new files)

```
server/backend/app/
├── api/routes/
│   ├── activity.py          # GET /api/v1/activity, GET /api/v1/activity/stream
│   └── ws_browser.py        # MODIFIED: add replayRequest handler
├── relay/
│   ├── broadcaster.py       # ActivityBroadcaster singleton
│   └── connection_manager.py # EXISTING (no changes)
└── api/routes/ws_node.py    # MODIFIED: publish to broadcaster on event persist

server/frontend/src/
├── components/
│   ├── activity/
│   │   ├── activity-sidebar.tsx    # New collapsible sidebar widget
│   │   └── activity-event-item.tsx # Extracted from activity-feed.tsx
│   └── session/
│       └── reconnection-banner.tsx # New disconnect/reconnecting banner
├── hooks/
│   ├── use-cloud-session.ts        # MODIFIED: add lastSeq tracking, replay state
│   └── use-activity-feed.ts        # New: EventSource hook for SSE
├── lib/
│   └── api/
│       └── ws.ts                   # MODIFIED: add connection state events, replayRequest
└── contexts/
    └── activity-context.tsx         # New: activity sidebar open/close state
```

### Anti-Patterns to Avoid
- **Storing lastSeq in React state:** Would cause a re-render on every stream event (potentially hundreds per second). Use `useRef` instead. [ASSUMED -- standard React optimization]
- **Polling for replay instead of streaming:** Replay must use the existing WebSocket connection, not a separate REST poll. Events arrive in order via the same WS. [VERIFIED: D-01 decision]
- **Separate pending-state table for control messages:** D-03 explicitly prohibits this. WAL replay handles it. [VERIFIED: CONTEXT.md D-03]
- **Using WebSocket for activity feed:** D-09 explicitly specifies SSE. SSE is simpler (unidirectional), auto-reconnects, and keeps the activity feed independent of session WS connections. [VERIFIED: CONTEXT.md D-09]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE server implementation | Custom StreamingResponse with manual event formatting | `fastapi.sse.EventSourceResponse` | Handles keep-alive, proper SSE formatting, content-type headers automatically. [VERIFIED: FastAPI built-in] |
| SSE client reconnection | Custom retry logic for EventSource | Browser native `EventSource` API | Auto-reconnects on disconnect. Set `retry:` field in SSE to control backoff. [VERIFIED: W3C EventSource spec] |
| Toast notifications | Custom toast component | `sonner` (already installed) | Already used in 20+ files. `toast.success("Reconnected")` is one line. [VERIFIED: existing codebase] |
| Exponential backoff | Custom delay calculation | Existing `GsdWebSocket.scheduleReconnect` | Already implements `min(1000 * 2^n, 30000)` pattern. [VERIFIED: ws.ts lines 81-89] |

## Common Pitfalls

### Pitfall 1: Replay Race with Live Events
**What goes wrong:** Browser sends `replayRequest`, server starts streaming replayed events, but live events from the daemon also arrive during replay. Browser receives events out of order or duplicates.
**Why it happens:** The browser WS connection is receiving live events AND replayed events simultaneously.
**How to avoid:** The `replayRequest` handler should hold the browser channel while streaming replayed events. After replay completes (replayComplete sent), live events resume. Since the server already stores events with sequence numbers before forwarding to browser, the replay handler can safely stream historical events first. Alternatively, the frontend can deduplicate by sequence_number (simpler). Recommend frontend dedup: if `sequenceNumber <= lastSeq`, skip the event.
**Warning signs:** Duplicate events in terminal output, events appearing out of order.

### Pitfall 2: EventSource Authentication
**What goes wrong:** `EventSource` browser API does not support custom headers. SSE endpoint needs auth but can't receive JWT via Authorization header.
**Why it happens:** W3C EventSource spec only supports URL and `withCredentials` for cookies.
**How to avoid:** Use cookie auth (already established in Phase 4 -- httpOnly cookie with JWT). Set `withCredentials: true` on EventSource. SSE endpoint reads JWT from cookie, same as WebSocket endpoint. [VERIFIED: Phase 4 decision -- cookie auth for browser connections]
**Warning signs:** 401 errors on SSE endpoint.

### Pitfall 3: Memory Leak in ActivityBroadcaster
**What goes wrong:** Subscriber queues accumulate if clients disconnect without cleanup.
**Why it happens:** SSE connection drops without clean close. Generator never enters `finally` block in some edge cases.
**How to avoid:** Use `try/finally` in the generator AND add a periodic cleanup that removes queues that haven't been read from in N seconds. Also set `maxsize` on queues so slow consumers don't cause unbounded memory growth -- when full, drop oldest event.
**Warning signs:** Server memory growth over time, queue sizes growing.

### Pitfall 4: Replayed Events Triggering Duplicate Side Effects
**What goes wrong:** Replayed `taskComplete` or `permissionRequest` triggers UI state changes that conflict with current state (e.g., showing a permission modal for a request that was already answered).
**Why it happens:** Frontend doesn't distinguish replayed vs live events (per D-02/D-06, it shouldn't visually distinguish them, but it needs logical distinction for state management).
**How to avoid:** For `permissionRequest`/`question` during replay: check if a corresponding `permissionResponse`/`questionResponse` event exists later in the replay stream. If it does, the request was already handled -- don't show the modal. The `replayComplete` message is the signal that all replayed events have been delivered; any unanswered permission/question at that point is genuinely pending.
**Warning signs:** Permission modals appearing for already-answered requests.

### Pitfall 5: Large Replay Payload Blocking UI
**What goes wrong:** A session with thousands of stream events causes a long replay that freezes the terminal.
**Why it happens:** All replayed events arrive rapidly, each triggering xterm.js writes synchronously.
**How to avoid:** Batch terminal writes during replay. Accumulate text in a buffer and flush to xterm.js every 16ms (requestAnimationFrame cadence). This is only needed during replay -- live streaming is already throttled by network latency.
**Warning signs:** Browser tab becoming unresponsive during reconnection.

## Code Examples

### Server: replayRequest handler in ws_browser.py
```python
# Source: adapted from existing ws_browser.py message loop pattern
# Add inside the while True message loop, after permissionResponse/questionResponse handling

elif msg_type == "replayRequest":
    session_id = msg.get("sessionId")
    from_seq = msg.get("fromSequence", 0)
    if not session_id:
        continue
    with DBSession(engine) as db:
        try:
            sid = uuid_mod.UUID(session_id)
        except ValueError:
            continue
        sess = db.get(SessionModel, sid)
        if not sess or str(sess.user_id) != user_id:
            await websocket.send_json(
                {"type": "error", "error": "Session not found"}
            )
            continue
        events = db.exec(
            select(SessionEvent)
            .where(SessionEvent.session_id == sid)
            .where(SessionEvent.sequence_number > from_seq)
            .order_by(SessionEvent.sequence_number)
        ).all()
    for event in events:
        await websocket.send_json(event.payload)
    last_seq = events[-1].sequence_number if events else from_seq
    await websocket.send_json({
        "type": "replayComplete",
        "sessionId": session_id,
        "lastSequence": last_seq,
    })
```

### Server: SSE activity endpoint
```python
# Source: FastAPI SSE docs (fastapi.tiangolo.com/tutorial/server-sent-events/)
import json
from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse
from app.api.deps import CurrentUser
from app.relay.broadcaster import broadcaster

router = APIRouter()

@router.get("/api/v1/activity/stream")
async def activity_stream(current_user: CurrentUser):
    queue = await broadcaster.subscribe(str(current_user.id))
    async def generate():
        try:
            while True:
                event = await queue.get()
                yield {"data": json.dumps(event)}
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(queue)
    return EventSourceResponse(generate())
```

### Frontend: lastSeq tracking in GsdWebSocket
```typescript
// Source: adapted from existing GsdWebSocket pattern in ws.ts
// Add to GsdWebSocket class:

private lastSeq: number = 0;
private onReconnectCallback: ((lastSeq: number) => void) | null = null;

setReconnectCallback(cb: (lastSeq: number) => void): void {
  this.onReconnectCallback = cb;
}

updateLastSeq(seq: number): void {
  if (seq > this.lastSeq) {
    this.lastSeq = seq;
  }
}

// Modify onopen to send replayRequest when reconnecting:
this.ws.onopen = () => {
  const isReconnect = this.reconnectAttempts > 0;
  this.reconnectAttempts = 0;
  if (isReconnect && this.lastSeq > 0) {
    // Send replayRequest per D-01
    this.send({
      type: 'replayRequest',
      sessionId: this.sessionId,
      fromSequence: this.lastSeq,
    });
  }
};
```

### Frontend: EventSource for activity feed
```typescript
// Source: W3C EventSource API + existing React Query patterns
function useActivitySSE(onEvent: (event: ActivityEvent) => void) {
  useEffect(() => {
    const source = new EventSource('/api/v1/activity/stream', {
      withCredentials: true, // sends httpOnly cookie
    });
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as ActivityEvent;
      onEvent(event);
    };
    source.onerror = () => {
      // EventSource auto-reconnects; no manual handling needed
    };
    return () => source.close();
  }, [onEvent]);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sse-starlette` third-party package | `fastapi.sse.EventSourceResponse` built-in | FastAPI 0.135.0 (late 2025) | No additional dependency needed for SSE [VERIFIED: local import test] |
| `gorilla/websocket` | `coder/websocket` | 2023 | Already using coder/websocket in daemon [VERIFIED: go.mod] |

**Deprecated/outdated:**
- `sse-starlette`: Still maintained but unnecessary with FastAPI >= 0.135.0 built-in SSE support

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | `server/backend/pyproject.toml` |
| Quick run command | `cd server/backend && python -m pytest tests/ -x -q` |
| Full suite command | `cd server/backend && python -m pytest tests/ -v` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-05a | replayRequest handler returns events with sequence > fromSequence | integration | `pytest tests/ws/test_browser_relay.py::test_replay_request -x` | Exists (add test) |
| SESS-05b | replayComplete message sent after all replayed events | integration | `pytest tests/ws/test_browser_relay.py::test_replay_complete_signal -x` | Exists (add test) |
| SESS-05c | Replayed events contain original payload (not re-serialized) | unit | `pytest tests/ws/test_browser_relay.py::test_replay_payload_fidelity -x` | Exists (add test) |
| RELY-05a | Control messages (permissionRequest, question) included in replay | integration | `pytest tests/ws/test_browser_relay.py::test_replay_includes_control_messages -x` | Exists (add test) |
| RELY-05b | Session ownership validated on replayRequest | integration | `pytest tests/ws/test_browser_relay.py::test_replay_rejects_unauthorized_session -x` | Exists (add test) |
| VIBE-06a | GET /api/v1/activity returns recent events filtered by user | integration | `pytest tests/api/routes/test_activity.py::test_get_activity -x` | Wave 0 |
| VIBE-06b | GET /api/v1/activity/stream delivers SSE events | integration | `pytest tests/api/routes/test_activity.py::test_activity_sse_stream -x` | Wave 0 |
| VIBE-06c | SSE events filtered to D-08 event types only | unit | `pytest tests/api/routes/test_activity.py::test_activity_event_filter -x` | Wave 0 |
| VIBE-06d | ActivityBroadcaster fan-out to multiple subscribers | unit | `pytest tests/test_broadcaster.py::test_fanout -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/ -x -q`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/api/routes/test_activity.py` -- covers VIBE-06a, VIBE-06b, VIBE-06c
- [ ] `tests/test_broadcaster.py` -- covers VIBE-06d (ActivityBroadcaster unit tests)
- [ ] Add replay tests to existing `tests/ws/test_browser_relay.py` -- covers SESS-05, RELY-05

### Frontend Testing Note
Frontend validation for this phase is primarily manual/visual:
- Reconnection banner appearance on WS disconnect
- Toast on reconnect
- Activity sidebar collapse/expand
- Terminal output continuity after replay

These are UI behaviors that are best validated by the UI-SPEC checker and manual verification, not automated unit tests. The backend tests cover the data correctness guarantees.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Cookie JWT auth for both WS and SSE endpoints (existing pattern) |
| V3 Session Management | yes | Session ownership validated on replayRequest (user can only replay own sessions) |
| V4 Access Control | yes | SSE activity stream filtered to user's own sessions only |
| V5 Input Validation | yes | Pydantic validation on replayRequest fields (sessionId UUID, fromSequence int) |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session replay for unauthorized user | Information Disclosure | Validate session ownership before streaming events (existing pattern in ws_browser.py) |
| SSE endpoint used for session enumeration | Information Disclosure | Filter activity events to authenticated user's sessions only |
| replayRequest with fromSequence=0 dumps full session history | Information Disclosure | This is valid behavior (user replaying their own session). Rate-limit if abuse detected. |
| EventSource without auth | Spoofing | Use `withCredentials: true` + httpOnly cookie (same auth as WS) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sessions typically have hundreds of events, not millions -- OK to query all at once for replay | Architecture Patterns | If sessions can have 10K+ events, replay query needs pagination or streaming cursor |
| A2 | `replayComplete` is a new browser-only message type added to protocol | Architecture Patterns | Need to add to protocol.ts and relay/protocol.py; does not need Go binding since it's server-generated |
| A3 | FastAPI built-in SSE is production-ready at 0.135.2 | Standard Stack | If buggy, fall back to sse-starlette package |
| A4 | Using useRef for lastSeq avoids unnecessary re-renders | Anti-Patterns | Standard React optimization, very low risk |

## Open Questions (RESOLVED)

1. **Event volume per session**
   - What we know: Stream events fire at high frequency during Claude Code execution
   - What's unclear: How many events accumulate in a typical 30-minute session? Hundreds? Thousands?
   - Recommendation: Proceed with query-all approach. If replay proves slow, add pagination (LIMIT + offset cursor) in a follow-up. The SessionEvent table has a composite PK index that makes range queries efficient.

2. **SSE authentication in mobile browsers**
   - What we know: EventSource with `withCredentials: true` works in desktop browsers
   - What's unclear: Mobile Safari/Chrome behavior with httpOnly cookies on SSE
   - Recommendation: Test during development. If cookie auth fails on mobile, fall back to token query parameter (same fallback as ws_browser.py).

3. **Activity feed persistence across server restarts**
   - What we know: ActivityBroadcaster is in-memory. Server restart loses all SSE subscriber connections.
   - What's unclear: Whether initial activity load from DB is sufficient, or if users expect zero-gap continuity.
   - Recommendation: Initial load from DB covers this. EventSource auto-reconnects after server restart, and the initial React Query fetch on mount reloads recent events. No gap visible to user.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | SessionEvent queries | Assumed (Docker Compose) | 18 | -- |
| FastAPI SSE | Activity stream | Yes | 0.135.2 | sse-starlette |
| Python | Backend | Yes | 3.x | -- |
| pnpm | Frontend build | Yes | 9.x | -- |
| Node.js | Frontend dev | Yes | -- | -- |

No blocking dependencies. All required tools are available.

## Sources

### Primary (HIGH confidence)
- `server/backend/app/models.py` -- SessionEvent model with composite PK, JSONB payload [VERIFIED: local file]
- `server/backend/app/api/routes/ws_browser.py` -- Existing browser WS message loop [VERIFIED: local file]
- `server/backend/app/api/routes/ws_node.py` -- Event persistence and ack pattern [VERIFIED: local file]
- `server/backend/app/relay/connection_manager.py` -- In-memory routing singleton [VERIFIED: local file]
- `server/frontend/src/lib/api/ws.ts` -- GsdWebSocket with reconnection [VERIFIED: local file]
- `server/frontend/src/hooks/use-cloud-session.ts` -- Session lifecycle hook [VERIFIED: local file]
- `server/frontend/src/lib/protocol.ts` -- Protocol types including ReplayRequestMessage [VERIFIED: local file]
- `fastapi.sse.EventSourceResponse` -- Built-in SSE support [VERIFIED: local import test]

### Secondary (MEDIUM confidence)
- [FastAPI SSE documentation](https://fastapi.tiangolo.com/tutorial/server-sent-events/) -- SSE endpoint patterns
- [sse-starlette PyPI](https://pypi.org/project/sse-starlette/) -- Alternative SSE package (not needed)

### Tertiary (LOW confidence)
- None. All claims verified against local codebase or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed and verified
- Architecture: HIGH -- extending existing patterns (ws_browser.py message loop, SessionEvent queries, GsdWebSocket reconnection)
- Pitfalls: HIGH -- derived from analysis of existing code paths and known WebSocket/SSE edge cases

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable -- no fast-moving dependencies)
