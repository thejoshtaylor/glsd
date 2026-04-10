# Phase 8: WebSocket Auth and Session Wiring - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three concrete integration gaps so end-to-end WebSocket sessions work in local HTTP dev: (1) cookie `secure=` flag blocks WS auth in HTTP dev, (2) `cwd` is not threaded through to the daemon in `sendTask`, (3) no routable page to start a session on a node.

Requirements: RELY-02, SESS-03, SESS-01, VIBE-02
Gap Closure: CRIT-04, CRIT-02, PART-03

</domain>

<decisions>
## Implementation Decisions

### WebSocket Auth — Cookie-Only Approach

- **D-01:** **Do NOT add token to the WS URL.** The Phase 4 httpOnly cookie approach is correct and secure. The root cause is that `secure=True` is hardcoded in `login.py` — cookies are not sent over HTTP in local dev. Fix: make `secure=` conditional on `settings.ENVIRONMENT != "local"`. In production (HTTPS), `secure=True` remains; in local dev (HTTP), `secure=False` allows the cookie to be sent with the WS handshake automatically.
- **D-02:** `GsdWebSocket.connect()` comment and code remain unchanged — "cookie auth, no token in URL" stays the approach. No `token=` query param is added to the WS URL. No `/auth/token` endpoint is needed.
- **D-03:** The cookie fix in `login.py` mirrors the existing pattern already present in `config.py` line 103 (`if self.ENVIRONMENT == "local"`). Use `settings.ENVIRONMENT` from the same config object.

### cwd Threading — Read from Session Response

- **D-04:** `createSession()` in `sessionsApi` returns `SessionPublic` which already includes `cwd` (field confirmed in `app/models.py:218`). The `POST /api/v1/sessions` endpoint returns `SessionPublic` directly — no backend changes needed.
- **D-05:** In `useCloudSession`, after `createSession` resolves, store the returned `session.cwd` in a `useRef` (not state — no re-render needed). `sendTask` reads from this ref to populate the `cwd` field in the task message. The current `cwd: ''` hardcode on line 326 of `use-cloud-session.ts` is the specific line to fix.
- **D-06:** `useCloudSession` state type (`CloudSessionState`) gets a `cwd: string` field alongside the existing `sessionId`, `channelId`, etc. fields. Initialized to `''`, set to `session.cwd` after successful `createSession`.

### Session Start Page — URL Query Param

- **D-07:** `/nodes/:nodeId/session` is a new route in `App.tsx`. It reads `cwd` from the URL query param (`?cwd=<encoded-path>`). If `cwd` is present, the page auto-starts a session immediately (no form). If `cwd` is absent, render a minimal cwd input form with a "Start" button.
- **D-08:** The "New Session" flow lives on the node detail page (`/nodes/:nodeId`). A `[ + New Session ]` button opens a small inline input (or a Radix Dialog) prompting for cwd, then navigates to `/nodes/:nodeId/session?cwd=<encoded-path>`. The existing `SessionRow` component in `node-detail-page.tsx` is preserved — this is additive.
- **D-09:** `/nodes/:nodeId/session` renders `InteractiveTerminal` (already exists at `server/frontend/src/components/terminal/interactive-terminal.tsx`) wired to a real cloud session via `useCloudSession`. The `nodeId` comes from the route param; `cwd` comes from the query param.

### Claude's Discretion

- Whether the cwd prompt on node detail page is an inline input or a Radix Dialog
- Whether the session page shows a back-link to `/nodes/:nodeId`
- What the fallback state looks like if `createSession` fails on the session page (error message vs. redirect)
- Whether `useCloudSession`'s cwd is a `useRef` or part of the state object (either works — just be consistent)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Server Backend
- `server/backend/app/api/routes/login.py` — `set_cookie` call with hardcoded `secure=True` (line 67); fix here
- `server/backend/app/core/config.py` — `settings.ENVIRONMENT` is a `Literal["local", "staging", "production"]`; existing `if self.ENVIRONMENT == "local"` pattern at line 103

### Server Frontend (hooks and WebSocket)
- `server/frontend/src/lib/api/ws.ts` — `GsdWebSocket.connect()` — cookie auth, no changes needed to URL construction
- `server/frontend/src/hooks/use-cloud-session.ts` — `createSession` at line 175, `sendTask` cwd hardcode at line 326; both change here
- `server/frontend/src/lib/api/sessions.ts` — `createSession` returns `SessionPublic` including `cwd` (line 22-29)

### Server Frontend (routing and components)
- `server/frontend/src/App.tsx` — existing routes at lines 72-73; add `/nodes/:nodeId/session` here
- `server/frontend/src/components/nodes/node-detail-page.tsx` — `SessionRow` component and sessions list (line 49+); add "New Session" button here
- `server/frontend/src/components/terminal/interactive-terminal.tsx` — the terminal component to render on the new session page

### Backend Models
- `server/backend/app/models.py` — `SessionPublic` at line 213 includes `cwd: str` at line 218 — backend already returns it

### Protocol
- `node/protocol-go/PROTOCOL.md` — wire format for task message; confirm `cwd` field name in the task envelope

</canonical_refs>

<code_context>
## Existing Code Insights

### What's Broken (Specific Lines)
- `server/backend/app/api/routes/login.py:67` — `secure=True` hardcoded; needs `secure=(settings.ENVIRONMENT != "local")`
- `server/frontend/src/hooks/use-cloud-session.ts:326` — `cwd: ''` hardcoded in sendTask; needs real cwd from session response
- `server/frontend/src/App.tsx` — `/nodes/:nodeId/session` route missing; add after line 73

### Reusable Assets
- `GsdWebSocket` (`lib/api/ws.ts`) — no changes needed; cookie auth works once secure flag is fixed
- `InteractiveTerminal` (`components/terminal/interactive-terminal.tsx`) — reuse as-is on the new session page
- `SessionPublic` type (`lib/api/sessions.ts`) — already typed with `cwd: string`; import in use-cloud-session
- Radix UI `Dialog` or inline form pattern — use existing Radix patterns from `components/ui/` for the cwd prompt on node detail page
- `node-detail-page.tsx` `SessionRow` + sessions list — preserved; "New Session" button is additive

### Integration Points
- `App.tsx` — one new `<Route>` entry for `/nodes/:nodeId/session`
- `node-detail-page.tsx` — "New Session" button → navigates to new route with cwd query param
- `use-cloud-session.ts` — store cwd from `createSession` response, thread into `sendTask`
- `login.py` — one-line fix to the `set_cookie` call

### Patterns to Follow
- Config-conditional flags: see `config.py:103` for existing `ENVIRONMENT == "local"` pattern
- Route params: use `useParams()` for `nodeId` and `useSearchParams()` for `cwd` query param
- Session state: existing `CloudSessionState` interface — add `cwd` field alongside `sessionId`

</code_context>
