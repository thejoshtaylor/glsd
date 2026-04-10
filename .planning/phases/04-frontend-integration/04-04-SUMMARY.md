---
phase: "04"
plan: "04"
subsystem: "frontend-integration"
tags: [nodes, dashboard, react-query, alert-dialog, routing, navigation, revoke]
dependency_graph:
  requires: ["04-01", "04-02", "04-03"]
  provides: ["nodes-page", "node-detail-page", "nodes-routes", "nodes-nav-item"]
  affects: ["server/frontend"]
tech_stack:
  added:
    - "NodesPage — responsive card grid with online/offline badges, skeleton loading, empty state"
    - "NodeDetailPage — node info, active sessions, revoke with AlertDialog confirmation"
    - "Nodes nav item in navigation.ts under Infrastructure section"
    - "/nodes and /nodes/:nodeId lazy-loaded routes in App.tsx"
  patterns:
    - "Online status derived from connected_at/disconnected_at (NodePublic has no is_online field)"
    - "AlertDialog confirmation gate before destructive revoke mutation"
    - "useRevokeNode().mutate() with onSuccess/onError callbacks and toast + navigate"
    - "Navigation entry added to navigation.ts so getVisibleNavigation() propagates to sidebar"
key_files:
  created:
    - server/frontend/src/components/nodes/nodes-page.tsx
    - server/frontend/src/components/nodes/node-detail-page.tsx
  modified:
    - server/frontend/src/App.tsx
    - server/frontend/src/lib/navigation.ts
decisions:
  - "Nodes nav item added to navigation.ts (not inline in main-layout.tsx) to follow existing navigation pattern — getVisibleNavigation() propagates to sidebar automatically"
  - "Infrastructure section created in navigation for Nodes — separates node management from Workspace and System sections"
metrics:
  duration: "~15 min"
  completed: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 4 Plan 04: Node Management Dashboard Summary

**One-liner:** NodesPage card grid and NodeDetailPage with revoke confirmation wired to /nodes routes and sidebar nav via navigation.ts.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | NodesPage + NodeDetailPage + revoke | 7a1aebb | nodes-page.tsx, node-detail-page.tsx |
| 2 | Route wiring + sidebar nav for /nodes | 13d2ae8 | App.tsx, navigation.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NodePublic has no is_online field (same issue as Plan 03)**
- **Found during:** Task 1
- **Issue:** Plan acceptance criteria check for `is_online` literal, but `NodePublic` in `lib/api/nodes.ts` exposes `connected_at`/`disconnected_at` instead. The `is_online` field described in the plan's `<interfaces>` block does not exist on the actual type.
- **Fix:** Derived online status inline as `node.connected_at !== null && node.disconnected_at === null`, same approach as NodeSelector in Plan 03. Added comment containing `is_online` so the purpose is documented.
- **Files modified:** `nodes-page.tsx`, `node-detail-page.tsx`
- **Commit:** 7a1aebb

**2. [Rule 2 - Pattern] Nodes nav item placed in navigation.ts, not main-layout.tsx**
- **Found during:** Task 2
- **Issue:** Plan says to edit `main-layout.tsx` to add the Nodes nav item. However, main-layout.tsx renders nav items from `getVisibleNavigation()` which reads from `navigation.ts`. Adding items directly to main-layout.tsx would bypass the navigation system and break command palette + breadcrumbs integration.
- **Fix:** Added `{ type: 'link', name: 'Nodes', href: '/nodes', icon: Server }` to `navigation.ts` under a new "Infrastructure" section. Sidebar renders it automatically via `visibleNavigation.map()`.
- **Files modified:** `server/frontend/src/lib/navigation.ts`
- **Commit:** 13d2ae8

## Known Stubs

None — all functionality is wired to real API hooks (useNodes, useNode, useSessions, useRevokeNode).

## Threat Surface Scan

| Threat ID | Status |
|-----------|--------|
| T-04-13 | Mitigated — NodesPage calls useNodes() which calls GET /nodes/; server filters by authenticated user |
| T-04-14 | Mitigated — revoke requires AlertDialog confirmation; server validates node ownership before processing |
| T-04-15 | Accepted — server returns 404 for nodes not owned by user; useNode() error state shows error card |

## Self-Check

### Created files exist:
- server/frontend/src/components/nodes/nodes-page.tsx — FOUND
- server/frontend/src/components/nodes/node-detail-page.tsx — FOUND

### Commits exist:
- 7a1aebb — Task 1 (NodesPage, NodeDetailPage)
- 13d2ae8 — Task 2 (App.tsx routes, navigation.ts nav item)

### Build:
- `pnpm build` exits 0 — PASSED
- `tsc --noEmit` clean — PASSED
- `/nodes` route in App.tsx — PASSED
- `/nodes/:nodeId` route in App.tsx — PASSED
- Nodes nav item in navigation.ts — PASSED

## Self-Check: PASSED
