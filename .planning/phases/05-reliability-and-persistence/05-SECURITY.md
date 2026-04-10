---
phase: 05
slug: reliability-and-persistence
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-09
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser WS → replayRequest handler | Untrusted sessionId and fromSequence from browser client | Session event payloads (owned by authenticated user) |
| Browser HTTP → SSE activity endpoint | Cookie JWT auth required | Activity events filtered to user's own sessions |
| ws_node → ActivityBroadcaster | Node events published with node's user_id | Activity event metadata per qualifying event type |
| Server WS → browser (replayed events) | Events already authorized for the authenticated user | Session terminal output + control messages |
| Browser memory (lastSeq) | Client-controlled sequence number sent to server on reconnect | Integer sequence counter |
| Browser → SSE activity/stream endpoint | Cookie JWT auth; events filtered to user's own sessions | Activity event metadata |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Information Disclosure | ws_browser.py replayRequest | mitigate | `sess.user_id != user_id` ownership check before streaming any events; verified in ws_browser.py:93,151 | closed |
| T-05-02 | Information Disclosure | GET /api/v1/activity | mitigate | Query filters `SessionModel.user_id == current_user.id`; no cross-user leakage; verified in activity.py:33 | closed |
| T-05-03 | Information Disclosure | ActivityBroadcaster SSE stream | mitigate | `broadcaster.publish()` filters by user_id; subscribers only receive events for their own user_id; verified in broadcaster.py:34–36 | closed |
| T-05-04 | Denial of Service | ActivityBroadcaster queue | mitigate | `asyncio.Queue(maxsize=100)` with drop-oldest policy on `QueueFull`; prevents unbounded memory from slow consumers; verified in broadcaster.py:27,39–44 | closed |
| T-05-05 | Tampering | replayRequest fromSequence | accept | Client-controlled integer; worst case is user replaying their own full session (valid per D-01); server validates session ownership independently (T-05-01) | closed |
| T-05-06 | Spoofing | GET /api/v1/activity/stream SSE | mitigate | `CurrentUser` FastAPI dependency validates JWT cookie on every request; verified in activity.py:58 | closed |
| T-05-07 | Tampering | GsdWebSocket replayRequest (frontend) | accept | Client sends own lastSeq; server validates session ownership; no elevation possible | closed |
| T-05-08 | Information Disclosure | Replayed events in browser memory | accept | Events are already authorized for this user; replay introduces no new exposure surface | closed |
| T-05-09 | Denial of Service | xterm.js replay flood | accept | xterm.js 6.x uses internal rAF-based rendering buffering; large replay payloads do not block the main thread. No explicit application-level throttle added. Risk is UI jank only — DoS scope limited to the authenticated user's own browser session. Accepted 2026-04-09. | closed |
| T-05-10 | Information Disclosure | ActivitySidebar / useActivityFeed | mitigate | SSE endpoint and REST endpoint both enforce `current_user.id` server-side; no client-side filtering relied upon; verified in activity.py:25,33,58 | closed |
| T-05-11 | Denial of Service | useActivityFeed EventSource | accept | EventSource auto-reconnects natively; max 100 events retained client-side; SSE queue bounded at 100 server-side (T-05-04). Low residual risk. | closed |
| T-05-12 | Spoofing | SSE endpoint cookie auth (frontend) | mitigate | `new EventSource('/api/v1/activity/stream', { withCredentials: true })` sends httpOnly cookie; server validates JWT; verified in use-activity-feed.ts:46 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-05 | fromSequence is client-controlled but server validates session ownership before any events are streamed; worst case is user replaying their own authorized session | user | 2026-04-09 |
| AR-05-02 | T-05-07 | GsdWebSocket sends its own lastSeq; server validates session ownership; no cross-user replay possible | user | 2026-04-09 |
| AR-05-03 | T-05-08 | Replayed events are already scoped to the authenticated user; browser memory exposure is no greater than initial stream delivery | user | 2026-04-09 |
| AR-05-04 | T-05-09 | xterm.js 6.x rAF-based internal buffering handles large replay payloads without blocking. Risk is limited to transient UI jank for the authenticated user's own browser — not a cross-user or data integrity threat. Explicit application-level write-batching deferred. | user | 2026-04-09 |
| AR-05-05 | T-05-11 | EventSource auto-reconnection is browser-native and low-risk; server-side queue is bounded (maxsize=100) and client retains max 100 events | user | 2026-04-09 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-09 | 12 | 12 | 0 | gsd-security-auditor (orchestrated) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-09
