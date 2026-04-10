# Phase 9: UI Wiring Completion - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect three orphaned/broken pieces: (1) `ReconnectionBanner` is built but not wired into `InteractiveTerminal`, (2) activity feed click-through navigates to `/sessions/:id` which has no route, (3) `first-launch-wizard.tsx` is a dead Tauri-era file that still imports from `@/lib/tauri`.

Requirements: RELY-05, VIBE-06
Gap Closure: PART-01, PART-02

</domain>

<decisions>
## Implementation Decisions

### ReconnectionBanner — Visibility Condition

- **D-01:** Show `ReconnectionBanner` only when re-connecting after a session was previously established. Specifically: `connectionState === 'connecting' || connectionState === 'replaying'` AND `state.sessionId !== null`. Do NOT show during initial connect — the existing `Loader2` spinner overlay handles that state. The banner is `position: absolute`, `z-10`, so it overlays the terminal without disrupting layout.
- **D-02:** `ReconnectionBanner` is imported and rendered inside `InteractiveTerminal`, inside the outer `<div className="relative h-full w-full ...">` wrapper, so the absolute positioning works correctly. Place it at the top of the JSX return, before the xterm container div.

### Activity Feed Click-Through — /sessions/:id Redirect

- **D-03:** Add a thin `/sessions/:id` route in `App.tsx`. The component fetches the session by ID using `GET /api/v1/sessions/:id` (already exists), extracts `node_id` from the response, then redirects to `/nodes/${node_id}/session`. This works regardless of whether `nodeId` is present in the `ActivityEvent`.
- **D-04:** While the session fetch is in-flight, show a minimal loading state (spinner or skeleton). On 404 or error, show an inline error message rather than crashing.
- **D-05:** The redirect is a hard `<Navigate>` replace (not push) so the back button goes to activity, not to the redirect page itself.

### first-launch-wizard.tsx — Full Deletion

- **D-06:** Delete `server/frontend/src/components/onboarding/first-launch-wizard.tsx` entirely.
- **D-07:** Delete `server/frontend/src/components/onboarding/__tests__/first-launch-wizard.test.tsx` entirely.
- **D-08:** Remove the `export { FirstLaunchWizard }` line from `server/frontend/src/components/onboarding/index.ts`. If index.ts has no remaining exports, delete it too.

### Claude's Discretion

- Exact loading state appearance in the `/sessions/:id` redirect component (spinner, skeleton, or blank with `null`)
- Whether `index.ts` in the onboarding directory should be deleted if it becomes empty, or kept as a placeholder

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Terminal and Session State
- `server/frontend/src/components/terminal/interactive-terminal.tsx` — render return at line 426+; `state.connectionState` and `state.sessionId` accessible from `useCloudSession`; existing `Loader2` overlay shows during `state.isLoading`
- `server/frontend/src/components/session/reconnection-banner.tsx` — `ReconnectionBanner` component; props: `{ visible: boolean }`; uses `position: absolute`, `z-10`, `top-0 left-0 right-0`
- `server/frontend/src/hooks/use-cloud-session.ts` — `CloudSessionState.connectionState: 'disconnected' | 'connecting' | 'connected' | 'replaying'`; `CloudSessionState.sessionId: string | null`

### Activity Feed and Routing
- `server/frontend/src/components/activity/activity-sidebar.tsx` — `handleEventClick` calls `navigate('/sessions/${sessionId}')` (line ~20); this is the dead-end to fix
- `server/frontend/src/App.tsx` — existing routes at lines 72-75; add `/sessions/:id` route here
- `server/frontend/src/lib/api/sessions.ts` — `getSession(id)` or equivalent for fetching a single session by ID

### Backend Session API
- `server/backend/app/api/routes/sessions.py` — `GET /{session_id}` returns `SessionPublic` including `node_id`

### Files to Delete
- `server/frontend/src/components/onboarding/first-launch-wizard.tsx` — delete
- `server/frontend/src/components/onboarding/__tests__/first-launch-wizard.test.tsx` — delete
- `server/frontend/src/components/onboarding/index.ts` — remove `FirstLaunchWizard` export (delete if empty)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ReconnectionBanner` (`components/session/reconnection-banner.tsx`) — ready to use, just needs import and `visible` prop wired in `InteractiveTerminal`
- `GET /api/v1/sessions/:id` endpoint — already implemented in backend; returns `SessionPublic` with `node_id`
- `useNavigate` + `<Navigate replace>` from `react-router-dom` — existing pattern throughout codebase for redirects

### Established Patterns
- Overlay placement: `absolute inset-0` for full overlays, `absolute top-0 left-0 right-0` for top banners — both patterns already used in `InteractiveTerminal`
- Route lazy loading: `App.tsx` uses `lazy(() => import(...))` for all page components — follow this pattern for the new `/sessions/:id` component
- API fetching: `useQuery` from TanStack React Query — use this in the redirect component for the session fetch

### Integration Points
- `App.tsx` — one new `<Route path="/sessions/:id" element={<SessionRedirectPage />} />` after the nodes routes
- `InteractiveTerminal` JSX — import `ReconnectionBanner`, add one `<ReconnectionBanner visible={...} />` before xterm container div
- `onboarding/index.ts` — remove one export line (or delete file)

</code_context>

<specifics>
## Specific Ideas

- The `/sessions/:id` redirect page is intentionally thin — its only job is fetch → redirect. It is not a real session detail page. Keep it minimal.
- The `ReconnectionBanner` visibility condition (`connectionState is connecting/replaying AND sessionId is set`) ensures the banner never overlaps the initial loading experience.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-ui-wiring-completion*
*Context gathered: 2026-04-10*
