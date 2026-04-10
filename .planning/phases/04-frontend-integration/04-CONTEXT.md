# Phase 4: Frontend Integration - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Tauri IPC with REST/WebSocket API client; deliver the working web UI with real-time session streaming, permission request handling, node management, and filesystem browsing. All GSD Vibe screens run in the browser against the FastAPI backend. No Tauri dependencies remain.

Requirements: AUTH-05, AUTH-06, SESS-03, SESS-04, VIBE-01, VIBE-02, VIBE-03, VIBE-04, VIBE-05

</domain>

<decisions>
## Implementation Decisions

### Tauri Replacement — API Client Structure

- **D-01:** Replace `lib/tauri.ts` with **domain-split modules** at `lib/api/`: `lib/api/auth.ts`, `lib/api/nodes.ts`, `lib/api/sessions.ts`, `lib/api/ws.ts`. All 18 Tauri import sites are updated to the new paths.
- **D-02:** Tauri-backed functions with no server equivalent (e.g., local tmux session names, local filesystem reads) are **stubbed with `console.warn`** — they return null/empty and log a warning rather than crashing. This keeps the app functional during migration.
- **D-03:** Write a **new `useCloudSession` hook** to replace `use-pty-session.ts`. The hook manages: `POST /api/v1/sessions` to create a session, opening a browser WebSocket for streaming, writing `task` messages, and receiving `stream` events. Terminal component callers are updated to the new hook interface.

### Auth & Login Flow

- **D-04:** Authentication uses **httpOnly cookies** throughout — including for WebSocket connections. The Phase 3 FastAPI WS endpoint (`/ws/browser`) is updated to read the session cookie instead of a JWT query param. This approach is cleaner (no token in URL/logs) and requires a small update to the Phase 3 WS implementation.
- **D-05:** Unauthenticated users are gated via a **`ProtectedRoute` wrapper component**. All app routes are protected. Unauthenticated users are redirected to `/login`. On successful login, they are redirected back to their original destination.
- **D-06:** The `FirstLaunchWizard` (Tauri-based onboarding) is removed. In its place, `/login` is the entry point for new users. Registration (AUTH-01) and login (AUTH-02) both live at `/login` (toggled by a tab or link).
- **D-07:** Login page: centered email + password form, clean minimal layout consistent with existing Radix UI + Tailwind patterns.

### Node Selection UX

- **D-08:** The "projects" concept is **preserved on the server** — `POST /api/v1/projects` lets users register named projects (name + nodeId + cwd) for quick access. The existing `useProjects` / `useProject` query patterns in gsd-vibe are pointed at the server's Projects API.
- **D-09:** On the shell page, `ProjectSelector` is replaced with: a **NodeSelector dropdown** (populated from `GET /api/v1/nodes`) + a **cwd text input** + a **Project name field** (optional, for saving). User picks a node, enters a working directory, and optionally saves it as a named project for future quick-access.
- **D-10:** The `ProjectSelector` component is updated (not rewritten) to load from the server Projects API instead of the Tauri projects store.

### Node Management Dashboard

- **D-11:** Node management lives at **`/nodes`** — a new route with a nav item in the main sidebar.
- **D-12:** Clicking a node navigates to **`/nodes/:nodeId`** — a dedicated node detail page showing: node info (name, last seen, status), active sessions list, revoke button, and a link to the filesystem browser.
- **D-13:** The existing `components/project/file-browser.tsx` is **adapted** (not rewritten) to use `GET /api/v1/nodes/:id/fs?path=...` for directory listings. The REST endpoint streams the node's filesystem via the server relay. Component structure and UI patterns are preserved.
- **D-14:** Node online/offline status is derived from the server's in-memory `ConnectionManager` state via `GET /api/v1/nodes` — the `is_online` field reflects whether the node has an active WebSocket connection to the server (per Phase 3 D-11).

### Claude's Discretion

- Exact sidebar nav item icon and label for /nodes
- Whether /nodes shows an empty state illustration or a prompt to pair a node when no nodes exist
- Pagination vs. infinite scroll for the sessions list on the node detail page
- Whether the filesystem browser opens inline on the node detail page or as a separate /nodes/:id/files route
- Error boundary placement for the new WS-connected terminal components

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol (from Phase 3)
- `node/protocol-go/PROTOCOL.md` — Wire format spec; all message types including stream, task, stop, permissionRequest, question, permissionResponse
- `node/protocol-go/messages.go` — Authoritative field names for all protocol messages

### Server Backend (Phase 3 output — extend)
- `server/backend/app/api/routes/nodes.py` — Node pairing, listing, revocation endpoints
- `server/backend/app/api/routes/sessions.py` — Session create, list, stop endpoints
- `server/backend/app/ws/browser_relay.py` — Browser WebSocket endpoint (to be updated for cookie auth per D-04)
- `server/backend/app/api/deps.py` — Dependency injection patterns (CurrentUser, SessionDep)

### Frontend (existing — replace/adapt)
- `server/frontend/src/lib/tauri.ts` — Full Tauri abstraction; all exported types and functions must be accounted for in the domain-split replacement
- `server/frontend/src/hooks/use-pty-session.ts` — Hook interface to understand what useCloudSession must replace
- `server/frontend/src/contexts/terminal-context.tsx` — Terminal session state management; heavy Tauri dependency; needs adaptation
- `server/frontend/src/components/terminal/interactive-terminal.tsx` — xterm.js integration; Tauri PTY calls to replace
- `server/frontend/src/components/project/file-browser.tsx` — Filesystem browser to adapt for server REST API
- `server/frontend/src/App.tsx` — Route structure; ProtectedRoute wrapper goes here
- `server/frontend/src/lib/queries.ts` — React Query hooks; useProjects/useProject patterns to extend for server API

### Tech Stack Reference
- `CLAUDE.md` §Server Frontend — React 18, Tailwind v3, Radix UI, xterm.js, React Query, native WebSocket API
- `CLAUDE.md` §WebSocket Client — raw WebSocket JSON frames, thin TypeScript client, reconnection with exponential backoff

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@xterm/xterm` with fit, search, serialize, web-links addons — already integrated in interactive-terminal.tsx; terminal rendering needs no library changes
- `components/ui/*` — Full Radix UI + Tailwind component library; use for login form, node cards, detail pages
- `lib/queries.ts` — React Query setup with useProjects, useProject, useOnboardingStatus; extend with useNodes, useNode, useSessions patterns
- `components/project/file-browser.tsx` — Existing file browser; adapt REST calls, keep UI
- `hooks/use-keyboard-shortcuts.ts`, `contexts/terminal-context.tsx` — Keep structure; strip Tauri calls

### Integration Points
- `App.tsx` routes — Add /login (unprotected), /nodes, /nodes/:nodeId; wrap existing routes in ProtectedRoute
- `main-layout.tsx` sidebar — Add Nodes nav item
- `lib/api/ws.ts` — New WebSocket client module; manages browser↔server WS connection, message routing by type field, reconnection with exponential backoff per CLAUDE.md guidance

### Patterns to Follow
- React Query for all REST API calls (`useQuery`, `useMutation` with optimistic updates)
- `app/api/deps.py` `CurrentUser` pattern → frontend cookie auth flows through Axios/fetch interceptors
- Phase 3 WS message envelope: `{"type": "<name>", ...fields}` — frontend WS client routes on `type` field

</code_context>
