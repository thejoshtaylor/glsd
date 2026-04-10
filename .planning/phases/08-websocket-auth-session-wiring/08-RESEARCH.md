# Phase 8: WebSocket Auth and Session Wiring - Research

**Researched:** 2026-04-10
**Domain:** FastAPI cookie auth, React WebSocket client, React Router v6 routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**WebSocket Auth — Cookie-Only Approach**
- D-01: Do NOT add token to the WS URL. Fix the `secure=True` hardcode in `login.py` line 67 — make `secure=` conditional on `settings.ENVIRONMENT != "local"`. In production (HTTPS), `secure=True` remains; in local dev (HTTP), `secure=False` allows the cookie to be sent with the WS handshake automatically.
- D-02: `GsdWebSocket.connect()` comment and code remain unchanged. No `token=` query param, no `/auth/token` endpoint.
- D-03: Use `settings.ENVIRONMENT` from the same config object — mirrors the existing `if self.ENVIRONMENT == "local"` pattern already at config.py line 103.

**cwd Threading — Read from Session Response**
- D-04: `createSession()` returns `SessionPublic` which already includes `cwd`. The `POST /api/v1/sessions` endpoint returns `SessionPublic` directly — no backend changes needed.
- D-05: In `useCloudSession`, store `session.cwd` after `createSession` resolves. `sendTask` reads from this to populate the `cwd` field. The `cwd: ''` hardcode at line 326 of `use-cloud-session.ts` is the specific line to fix.
- D-06: `CloudSessionState` gets a `cwd: string` field. Initialized to `''`, set to `session.cwd` after successful `createSession`.

**Session Start Page — URL Query Param**
- D-07: `/nodes/:nodeId/session` route in `App.tsx`. Reads `cwd` from query param (`?cwd=<encoded-path>`). If `cwd` present, auto-starts a session immediately (no form). If absent, render a minimal cwd input form with a "Start" button.
- D-08: "New Session" flow lives on node detail page (`/nodes/:nodeId`). `[ + New Session ]` button opens inline input or Radix Dialog prompting for cwd, then navigates to `/nodes/:nodeId/session?cwd=<encoded-path>`. `SessionRow` preserved — additive.
- D-09: `/nodes/:nodeId/session` renders `InteractiveTerminal` (already exists) wired to a real cloud session via `useCloudSession`. `nodeId` from route param; `cwd` from query param.

### Claude's Discretion
- Whether the cwd prompt on node detail page is an inline input or a Radix Dialog
- Whether the session page shows a back-link to `/nodes/:nodeId`
- What the fallback state looks like if `createSession` fails on the session page (error message vs. redirect)
- Whether `useCloudSession`'s cwd is a `useRef` or part of the state object (either works — just be consistent)

### Deferred Ideas (OUT OF SCOPE)
None listed in CONTEXT.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RELY-02 | Server routes browser WebSocket messages to the correct node/session via channelId | Cookie fix enables the WS handshake to authenticate; cookie is sent automatically once `secure=False` in local dev |
| SESS-03 | User sees real-time stream output from a Claude Code session in the browser | cwd threading fix ensures daemon starts Claude in the correct directory; session page renders InteractiveTerminal with live stream |
| SESS-01 | User can start a Claude Code session on a selected node with a prompt and working directory | `/nodes/:nodeId/session` route + "New Session" button + cwd form closes this gap |
| VIBE-02 | All GSD Vibe screens adapted and functional | Session page is the last missing screen for the core session flow |
</phase_requirements>

---

## Summary

Phase 8 closes three concrete integration gaps that prevent end-to-end WebSocket sessions from working in local HTTP dev. The gaps are surgical: one hardcoded boolean in the backend cookie handler, one hardcoded empty string in the frontend task sender, and one missing React route + page component. No new libraries are needed. All changes are either single-line fixes or additive new components that reuse existing infrastructure.

The `InteractiveTerminal` component, `useCloudSession` hook, `GsdWebSocket` class, and `SessionPublic` type are all production-ready. The phase is a wiring exercise: connect what already exists and fix two concrete bugs.

**Primary recommendation:** Implement in the order: (1) cookie fix, (2) cwd threading, (3) session page + route. The first two are prerequisites for testing the third end-to-end.

---

## Findings

### Finding 1: Cookie Bug — Exact Code Location Confirmed

`server/backend/app/api/routes/login.py` lines 63–71:

```python
response.set_cookie(
    key="access_token",
    value=token,
    httponly=True,
    secure=True,          # <-- CRIT-04: hardcoded, blocks HTTP local dev
    samesite="lax",
    max_age=int(access_token_expires.total_seconds()),
    path="/",
)
```

The fix is one line. The existing pattern in `config.py` line 103 (`if self.ENVIRONMENT == "local": warnings.warn(...)`) confirms `settings.ENVIRONMENT` is already imported and used in `login.py` (line 14: `from app.core.config import settings`).

Fix: `secure=(settings.ENVIRONMENT != "local")`

`ENVIRONMENT` is typed as `Literal["local", "staging", "production"]` with default `"local"` — so local dev requires no `.env` change. `[VERIFIED: read from source]`

### Finding 2: GsdWebSocket.connect() Needs No Changes

`ws.ts` already uses `location.protocol === 'https:' ? 'wss:' : 'ws:'` to pick the right protocol and passes `channelId` as a query param. Cookie auth is implicit: the browser attaches the httpOnly cookie to the WebSocket upgrade request on the same origin automatically — once `secure=False` in local HTTP, this works without any changes to the WS client. `[VERIFIED: read from source]`

### Finding 3: cwd Threading — State Design

`CloudSessionState` (line 19 of `use-cloud-session.ts`) currently has: `sessionId`, `channelId`, `isConnected`, `isLoading`, `error`, `pendingPermission`, `pendingQuestion`, `connectionState`. No `cwd` field.

The `sendTask` callback at line 308 is a `useCallback` with `[]` dependencies (stable, no captures from state). It reads `prev.sessionId` and `prev.channelId` via the `setState` functional updater pattern — this is why it can read those fields without them being in the dependency array.

D-06 says add `cwd: string` to `CloudSessionState`. This is consistent: `sendTask` can read `prev.cwd` the same way it reads `prev.sessionId`. No `useRef` needed if the state approach is used.

The `SessionPublic` type in `sessions.ts` already has `cwd: string` (line 10). The `createSession` call returns this value. The fix:
1. Add `cwd: string` to `CloudSessionState` interface, initialize to `''`
2. After `const session = await sessionsApi.createSession(...)`, include `cwd: session.cwd` in the setState call (line ~284)
3. In `sendTask`, change `cwd: ''` to `cwd: prev.cwd ?? ''`

`[VERIFIED: read from source]`

### Finding 4: Protocol cwd Field Name Confirmed

PROTOCOL.md confirms the `task` message field is exactly `cwd` (lowercase, no underscore variant):

```
| cwd | string | Absolute path on the daemon's machine |
```

The existing `sendTask` already uses `cwd:` as the field name — just the value is wrong (hardcoded `''`). No field name change needed. `[VERIFIED: read from source]`

### Finding 5: App.tsx Route Structure

Current routes (lines 56–73) use React Router v6 nested `<Routes>` inside the outer protected route. The existing pattern for lazy-loaded page components:

```tsx
const NodeDetailPage = lazy(() => import("./components/nodes/node-detail-page").then(m => ({ default: m.NodeDetailPage })));
```

The new `NodeSessionPage` follows this exact pattern. It goes into the `<Routes>` block after the existing `/nodes/:nodeId/files` route (line 73). `[VERIFIED: read from source]`

### Finding 6: InteractiveTerminal Props

`InteractiveTerminalProps` (line 63 of `interactive-terminal.tsx`):
- `nodeId?: string | null` — the node to connect to
- `workingDirectory: string` — the cwd (required)
- `autoConnect?: boolean` — defaults to `true`; auto-starts on mount if `nodeId` is set

The session page only needs to pass `nodeId` and `workingDirectory` and `InteractiveTerminal` handles the full connect lifecycle via `useCloudSession` internally. `persistKey` is optional (use `nodeId` as the key so terminal buffer survives navigation). `[VERIFIED: read from source]`

### Finding 7: node-detail-page.tsx Addition Point

The "New Session" button should go in the `Active Sessions` card (lines 194–209), alongside the empty state. The button triggers navigation to `/nodes/:nodeId/session?cwd=<encoded>`. The `useNavigate` hook is already imported (line 4). No new imports needed for routing.

For the cwd input: `Radix UI Dialog` is already available at `@/components/ui/dialog` (confirmed in codebase). Inline input is simpler for a single text field, but Dialog avoids layout reflow in the card. Either works per discretion.

### Finding 8: No New Backend Changes Needed

`SessionPublic` at `models.py` line 213 already includes `channel_id: str | None = None` and `cwd: str` (lines 218–219). The `POST /api/v1/sessions` endpoint already returns `SessionPublic`. The frontend `SessionPublic` type in `sessions.ts` already includes both fields. No backend changes required. `[VERIFIED: read from source]`

### Finding 9: useSearchParams Pattern for cwd Query Param

React Router v6 provides `useSearchParams()` for reading query params. Pattern:

```tsx
const [searchParams] = useSearchParams();
const cwd = searchParams.get('cwd') ?? '';
```

This is consistent with how `useParams()` is used for `nodeId` throughout the codebase (see `node-detail-page.tsx` line 74). `[ASSUMED: standard React Router v6 API, consistent with existing codebase patterns]`

---

## Approach Options

### Option A: cwd in CloudSessionState (D-06 choice)
Add `cwd: string` to `CloudSessionState`. `sendTask` reads `prev.cwd` via functional updater. Consistent with how `sessionId` and `channelId` are already read.

**Pro:** One source of truth, triggers re-renders if UI ever needs to display cwd.
**Con:** State update causes one extra render on session create (negligible).

### Option B: cwd in useRef
Store `cwdRef = useRef('')`, set it after `createSession` resolves, read it in `sendTask` directly.

**Pro:** No re-render on cwd set.
**Con:** Inconsistent with the existing state pattern for sessionId/channelId. CONTEXT.md says "either works — just be consistent."

**Recommendation:** Option A (state) — consistent with existing CloudSessionState pattern.

### Option C: Session page cwd input — inline vs Dialog
- **Inline input:** Simpler, fewer lines, no modal overhead. Renders a `<form>` inside the sessions card.
- **Radix Dialog:** Cleaner UX, no layout shift in the card. `dialog.tsx` already exists.

**Recommendation:** Inline Dialog — the sessions card doesn't need to grow, and Dialog is already available. But this is Claude's discretion per CONTEXT.md.

---

## Recommended Approach

1. **Fix cookie** (`login.py` line 67): `secure=(settings.ENVIRONMENT != "local")` — one character change in production behavior.

2. **Thread cwd** (`use-cloud-session.ts`):
   - Add `cwd: string` to `CloudSessionState` interface (initialize `''`)
   - In `createSession`, set `cwd: session.cwd` in the setState call after session creation succeeds
   - In `sendTask`, change `cwd: ''` to `cwd: prev.cwd ?? ''`

3. **Add session page** (new file `server/frontend/src/components/nodes/node-session-page.tsx`):
   - `useParams()` for `nodeId`, `useSearchParams()` for `cwd`
   - If `cwd` is non-empty, render `<InteractiveTerminal nodeId={nodeId} workingDirectory={cwd} persistKey={nodeId} />`
   - If `cwd` is empty, render a simple form with a path input + "Start" button that navigates with cwd in the query string

4. **Add "New Session" button** to `node-detail-page.tsx` sessions card — navigates to `/nodes/:nodeId/session?cwd=<encoded>`

5. **Register route** in `App.tsx` after line 73: `<Route path="/nodes/:nodeId/session" element={<NodeSessionPage />} />`

---

## Risk and Unknowns

### Risk 1: cookie fix breaks existing tests
`test_login_returns_jwt` (from Phase 7 notes) tests the `/login/cookie` endpoint. If tests call the endpoint with `ENVIRONMENT=local` (the default), the cookie will now be `secure=False`. If any test asserts `secure=True` on the cookie, it will fail.

**Mitigation:** Search test file for `secure` assertions before implementing. The fix is correct behavior — tests asserting the wrong thing should be updated.

### Risk 2: InteractiveTerminal auto-connect fires before WS handshake succeeds
`InteractiveTerminal` calls `connectToCloud()` via a 100ms `setTimeout` after mount. If the cookie is not being sent (e.g., in a cross-origin dev setup), the WS will fail immediately and the error overlay will show. Once the cookie fix is in, this should resolve.

**Mitigation:** No code change needed — the error overlay with "Retry" already handles this case.

### Risk 3: cwd query param encoding
Paths containing spaces, `#`, or `?` must be `encodeURIComponent`-encoded in the URL. The session page must decode with `searchParams.get('cwd')` (React Router handles decoding automatically). The "New Session" button must encode with `encodeURIComponent(cwd)`.

**Mitigation:** Use `encodeURIComponent` at navigation time; `useSearchParams().get('cwd')` at decode time. Standard pattern.

### Risk 4: InteractiveTerminal with no nodeId
`InteractiveTerminal` already handles `!nodeId` gracefully — `connectToCloud` returns early if `!nodeId || !workingDirectory`. The session page should only navigate to this route with a valid `nodeId`, but the component is safe if it somehow renders without one.

### Risk 5: VIBE-02 scope
VIBE-02 says "all GSD Vibe screens are adapted and functional: phases, plans, tasks, roadmaps, milestones." The phase description scopes this requirement to the session page specifically. The existing pages (phases, plans, tasks, etc.) are stubs from gsd-vibe that were not adapted — this is the broader VIBE-02 backlog. Phase 8 only needs to close the session flow portion. The planner should note this scoping.

---

## File Map

| File | Change | Type |
|------|--------|------|
| `server/backend/app/api/routes/login.py` | Line 67: `secure=True` → `secure=(settings.ENVIRONMENT != "local")` | Edit (1 line) |
| `server/frontend/src/hooks/use-cloud-session.ts` | Add `cwd: string` to `CloudSessionState`; set `cwd: session.cwd` in createSession; fix `cwd: ''` in sendTask | Edit (3 locations) |
| `server/frontend/src/components/nodes/node-session-page.tsx` | New component: session page with InteractiveTerminal, reads nodeId from params, cwd from query | Create |
| `server/frontend/src/components/nodes/node-detail-page.tsx` | Add "New Session" button to sessions card that navigates to `/nodes/:nodeId/session?cwd=<encoded>` with a cwd input | Edit (additive) |
| `server/frontend/src/App.tsx` | Add lazy import for NodeSessionPage + `<Route path="/nodes/:nodeId/session" element={<NodeSessionPage />} />` | Edit (additive) |

**No backend changes needed.** `SessionPublic` already has `cwd`. `POST /api/v1/sessions` already returns it. `channel_id` already returned (Phase 7 added it). `[VERIFIED: read from source]`

---

## Project Constraints (from CLAUDE.md)

- Files must stay under 500 lines
- No Docker on nodes (not relevant to this phase)
- React 18 + Vite + Tailwind v3 + Radix UI — use existing component library
- pnpm 9 — package manager locked
- New files go in appropriate subdirectories (no root saves)
- ALWAYS run tests after making code changes
- Security: do not hardcode secrets

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (backend) / vitest (frontend) |
| Quick run command | `cd server/backend && python -m pytest tests/ -x -q` |
| Full suite command | `cd server/backend && python -m pytest tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| D-01 cookie fix | `ENVIRONMENT=local` sets `secure=False` on cookie | unit | `pytest tests/api/routes/test_login.py -x -k cookie` | Existing test — verify no `secure=True` assertion conflict |
| SESS-01 / D-07 | Session page renders with cwd query param | manual smoke | N/A — requires running local stack | Verify end-to-end in browser |
| RELY-02 | WS connects in local HTTP dev after cookie fix | manual smoke | N/A | Verify cookie is sent in WS handshake |

### Wave 0 Gaps
- No new test files needed for the cookie fix — existing login tests cover the endpoint
- The cwd threading change has no dedicated test; the existing `use-cloud-session.ts` has no test file — this is an existing gap, not introduced by Phase 8
- The session page is UI-only; manual smoke test is the validation method

---

## Sources

### Primary (HIGH confidence)
- `server/backend/app/api/routes/login.py` — confirmed exact line, confirmed `settings` already imported
- `server/backend/app/core/config.py` — confirmed `ENVIRONMENT: Literal["local", "staging", "production"]` with `"local"` default, confirmed existing conditional pattern at line 103
- `server/frontend/src/lib/api/ws.ts` — confirmed cookie-only auth, no URL token, no changes needed
- `server/frontend/src/hooks/use-cloud-session.ts` — confirmed `cwd: ''` hardcode at line 326, confirmed setState functional updater pattern for sessionId/channelId
- `server/frontend/src/lib/api/sessions.ts` — confirmed `SessionPublic` has `cwd: string`, confirmed `createSession` returns it
- `server/frontend/src/App.tsx` — confirmed route structure, confirmed lazy import pattern
- `server/frontend/src/components/nodes/node-detail-page.tsx` — confirmed SessionRow, confirmed `useNavigate` already imported
- `server/frontend/src/components/terminal/interactive-terminal.tsx` — confirmed `nodeId` and `workingDirectory` props, confirmed auto-connect behavior
- `server/backend/app/models.py` — confirmed `SessionPublic` has `cwd: str` and `channel_id: str | None`
- `node/protocol-go/PROTOCOL.md` — confirmed `cwd` field name in `task` message is exactly `cwd`

### Assumed
- A1: `useSearchParams()` from React Router v6 for reading `?cwd=` query param — standard API, consistent with existing `useParams()` usage, not explicitly verified against installed version
