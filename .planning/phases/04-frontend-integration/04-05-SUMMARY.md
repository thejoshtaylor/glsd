---
phase: "04-frontend-integration"
plan: "05"
subsystem: "ui"
tags: [file-browser, rest-api, websocket-relay, asyncio, fastapi, react-query, mobile-responsive]
dependency_graph:
  requires:
    - phase: "04-01"
      provides: "nodes.ts API client, apiRequest helper"
    - phase: "04-03"
      provides: "ConnectionManager with send_to_node, ws_node.py message loop"
    - phase: "04-04"
      provides: "node detail page, /nodes routes"
  provides:
    - "GET /api/v1/nodes/:id/fs — browseDir relay with 5s asyncio timeout"
    - "GET /api/v1/nodes/:id/file — readFile relay with 5s asyncio timeout"
    - "register_response/resolve_response one-shot future pattern in ConnectionManager"
    - "FileBrowser component adapted for remote node filesystem via REST"
    - "NodeFileBrowserPage at /nodes/:nodeId/files"
    - "browseNodeFs and readNodeFile functions in nodes.ts"
  affects:
    - "server/frontend"
    - "server/backend"
tech-stack:
  added:
    - "asyncio.wait_for timeout pattern for REST-to-WebSocket bridging"
    - "One-shot Future pattern in ConnectionManager for request-response over WebSocket"
  patterns:
    - "REST endpoint registers asyncio.Future keyed by requestId, sends browseDir/readFile to node, awaits future with 5s timeout"
    - "ws_node.py resolves pending futures on browseDirResult/readFileResult before forwarding to browser channel"
    - "FileBrowser uses useQuery with browseNodeFs/readNodeFile; 503/504 error messages surfaced in UI"
    - "Legacy Tauri props (projectId, projectPath) retained as optional no-ops for backward compat"

key-files:
  created:
    - server/frontend/src/components/nodes/node-file-browser-page.tsx
  modified:
    - server/backend/app/api/routes/nodes.py
    - server/backend/app/relay/connection_manager.py
    - server/backend/app/api/routes/ws_node.py
    - server/backend/app/crud.py
    - server/frontend/src/lib/api/nodes.ts
    - server/frontend/src/components/project/file-browser.tsx
    - server/frontend/src/App.tsx

key-decisions:
  - "asyncio.Future registered before send_to_node call to avoid race where node responds before future is registered"
  - "channelId set equal to requestId for one-shot /fs and /file requests — ensures ws_node resolve_response is called before send_to_browser so future is resolved"
  - "FileBrowser nodeId prop is optional to preserve backward compat with project.tsx and gsd2-files-tab.tsx which pass legacy Tauri props — shows 'select a node' placeholder when nodeId absent"
  - "get_node_by_id added to crud.py to DRY up ownership validation shared by /fs and /file endpoints"

requirements-completed: [VIBE-05, VIBE-03]

duration: "~30 min"
completed: "2026-04-10"
---

# Phase 4 Plan 05: File Browser REST Bridge + Mobile Verification Summary

**Backend /fs and /file endpoints proxy browseDir/readFile to node via asyncio.Future pattern with 5s timeout; FileBrowser adapted to use REST API instead of Tauri IPC.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-10T03:00:00Z
- **Completed:** 2026-04-10T03:30:00Z
- **Tasks:** 2 of 3 complete (Task 3 is checkpoint:human-verify — awaiting user)
- **Files modified:** 7

## Accomplishments

- Backend: `GET /nodes/{node_id}/fs` and `GET /nodes/{node_id}/file` endpoints with asyncio.Future request-response bridging over WebSocket relay, 5s timeout, 504 on timeout, 503 on offline
- ConnectionManager: `register_response` / `resolve_response` one-shot future pattern for REST-to-WebSocket bridging
- ws_node.py: `browseDirResult` / `readFileResult` now call `resolve_response` before forwarding to browser channel
- Frontend: `FsEntry`, `browseNodeFs`, `readNodeFile` added to `nodes.ts`
- FileBrowser: fully rewritten for remote node REST API — breadcrumb navigation, 503/504 error handling, mobile-responsive layout
- NodeFileBrowserPage wrapper + `/nodes/:nodeId/files` route added to App.tsx
- `pnpm build` exits 0

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Backend /fs and /file REST proxy endpoints | 928ac92 | nodes.py, connection_manager.py, ws_node.py, crud.py |
| 2 | Adapt file-browser.tsx + add browseNodeFs API | fc300bc | nodes.ts, file-browser.tsx, node-file-browser-page.tsx, App.tsx |
| 3 | Visual verification (checkpoint) | pending | — |

## Files Created/Modified

- `server/backend/app/api/routes/nodes.py` — Added GET /{node_id}/fs and GET /{node_id}/file endpoints with asyncio.wait_for timeout, ownership/online checks
- `server/backend/app/relay/connection_manager.py` — Added `_pending_responses` dict, `register_response()` and `resolve_response()` methods
- `server/backend/app/api/routes/ws_node.py` — Updated browseDirResult/readFileResult handler to call `resolve_response` first
- `server/backend/app/crud.py` — Added `get_node_by_id(node_id, user_id)` helper
- `server/frontend/src/lib/api/nodes.ts` — Added `FsEntry` interface, `browseNodeFs()`, `readNodeFile()`
- `server/frontend/src/components/project/file-browser.tsx` — Rewritten: Tauri IPC removed, REST API via browseNodeFs/readNodeFile, breadcrumb nav, error states, mobile layout
- `server/frontend/src/components/nodes/node-file-browser-page.tsx` — New page wrapper reading nodeId from useParams
- `server/frontend/src/App.tsx` — Added /nodes/:nodeId/files route and NodeFileBrowserPage lazy import

## Decisions Made

- asyncio.Future registered before `send_to_node` to prevent race conditions where node responds before the future exists
- channelId == requestId for /fs and /file one-shot requests — ws_node resolve_response fires before send_to_browser ensuring the future resolves correctly
- FileBrowser `nodeId` made optional to preserve backward compat — legacy callers (project.tsx, gsd2-files-tab.tsx) pass old Tauri props and get a placeholder message
- `get_node_by_id` extracted to crud.py so both /fs and /file share the same ownership validation path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FileBrowser prop signature incompatible with existing callers**
- **Found during:** Task 2 (`pnpm build`)
- **Issue:** file-browser.tsx rewrite changed `FileBrowserProps` from `{ projectId, projectPath }` to `{ nodeId }`, breaking `gsd2-files-tab.tsx` and `project.tsx` which still pass the old props
- **Fix:** Made `nodeId` optional; added `projectId?` and `projectPath?` as optional no-op legacy props; added guard that renders a placeholder when `nodeId` is absent
- **Files modified:** `file-browser.tsx`
- **Verification:** `pnpm build` exits 0 after fix
- **Committed in:** fc300bc (Task 2 commit)

**2. [Rule 1 - Bug] Unused ChevronDown import in file-browser.tsx**
- **Found during:** Task 2 (`pnpm build` TypeScript error TS6133)
- **Issue:** ChevronDown was imported but not used in the rewritten component
- **Fix:** Removed ChevronDown from import list
- **Files modified:** `file-browser.tsx`
- **Verification:** `pnpm build` exits 0 after fix
- **Committed in:** fc300bc (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs found during build verification)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Known Stubs

None — browseNodeFs and readNodeFile call real backend endpoints. The FileBrowser placeholder for missing nodeId is intentional (legacy callers) and documented.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: path-traversal | nodes.py /fs endpoint | User-supplied `path` query param is relayed to node without server-side sanitization — per T-04-16, node daemon is responsible for path validation. Node ownership validated before relay. |

## Self-Check

### Created files exist:
- server/frontend/src/components/nodes/node-file-browser-page.tsx — FOUND (created in Task 2)

### Modified files exist:
- server/backend/app/api/routes/nodes.py — FOUND
- server/backend/app/relay/connection_manager.py — FOUND
- server/backend/app/api/routes/ws_node.py — FOUND
- server/backend/app/crud.py — FOUND
- server/frontend/src/lib/api/nodes.ts — FOUND
- server/frontend/src/components/project/file-browser.tsx — FOUND
- server/frontend/src/App.tsx — FOUND

### Commits exist:
- 928ac92 — Task 1 (backend /fs and /file endpoints)
- fc300bc — Task 2 (FileBrowser adaptation, nodes.ts, App.tsx)

### Build:
- `pnpm build` exits 0 — PASSED
- `browseNodeFs` in file-browser.tsx — PASSED
- `listCodeFiles` NOT in file-browser.tsx — PASSED
- `/nodes/{node_id}/fs` route in nodes.py — PASSED
- `asyncio.wait_for` in nodes.py — PASSED

## Self-Check: PASSED
