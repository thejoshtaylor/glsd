---
phase: 15-redis-multi-worker-and-deploy-modal
plan: 02
subsystem: server-frontend
tags: [deploy-modal, pairing-code, ux, nodes, react]
dependency_graph:
  requires: [redis-subscriber-retry, pairing-code-flow]
  provides: [deploy-node-modal, frontend-pairing-ux]
  affects: [server/frontend/src/components/nodes, server/frontend/src/lib]
tech_stack:
  added: []
  patterns: [radix-dialog-modal, radix-tabs, polling-with-refetchInterval, useMutation-hook, initialNodeCount-snapshot]
key_files:
  created:
    - server/frontend/src/components/nodes/__tests__/deploy-modal.test.tsx
    - server/frontend/src/components/nodes/deploy-node-modal.tsx
  modified:
    - server/frontend/src/components/nodes/nodes-page.tsx
    - server/frontend/src/lib/api/nodes.ts
    - server/frontend/src/lib/queries.ts
decisions:
  - "OS detection via navigator.userAgent with macOS/Linux/Windows tabs; Windows shows WSL2 note"
  - "initialNodeCount captured in mutation onSuccess path (after code generation, before polling)"
  - "Polling shares queryKey ['nodes'] with useNodes for React Query deduplication"
  - "Copy buttons use existing useCopyToClipboard hook with showToast disabled (visual check icon instead)"
metrics:
  duration: 164s
  completed: "2026-04-13T20:21:10Z"
  tasks_completed: 2
  tasks_total: 2
  tests_passed: 6
  files_changed: 5
---

# Phase 15 Plan 02: Frontend Deploy Node Modal with Pairing Code Flow Summary

DeployNodeModal component with name input, 6-char pairing code display, OS-aware install command tabs with copy buttons, 3s polling for new node detection, and auto-close with success toast.

## Task Completion

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 0 | Deploy modal behavioral test stubs (UX-01c) | 46d36e1 | Complete |
| 1 | Deploy modal component, API functions, queries, and nodes page integration | 446d50d | Complete |
| 2 | Verify deploy modal flow end-to-end | -- | Checkpoint (human-verify) |

## What Was Built

### Task 0: Behavioral Test Stubs
- 6 vitest tests covering: modal open/close, name input, code generation mutation call, code display, OS tabs rendering, and install command content
- Mocks for useGeneratePairingCode, useCopyToClipboard, and sonner toast
- All tests written RED-first, then pass after Task 1 implementation

### Task 1: Full Modal Implementation
- **API function**: `generatePairingCode(name)` calls `POST /nodes/code` and returns `{ code: string }`
- **Mutation hook**: `useGeneratePairingCode()` wraps the API call in useMutation
- **DeployNodeModal component**: Two-step flow (name input -> code display + commands)
  - Step 1: Node name text input with Generate Code button
  - Step 2: Large monospace pairing code, OS tabs (macOS/Linux/Windows), install commands with per-line copy buttons
  - Polling: `refetchInterval: 3000` on useQuery when `isPolling` is true
  - Detection: compares `nodesQuery.data.count > initialNodeCount` (captured in onSuccess)
  - Auto-close: stops polling, closes modal, shows success toast
  - Expiry: 10-minute timeout sets expired state with regenerate button
  - Cleanup: polling stops on modal close (Pitfall 6 addressed)
- **Nodes page updates**: Deploy Node button in header, DeployNodeModal rendered, empty state replaced with "Deploy your first node" button (removed incorrect `gsd node pair --server` command)

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Copy button toast suppression**: Used `showToast: false` option on useCopyToClipboard to show a check icon instead of toast spam when copying multiple commands.
2. **Query deduplication**: Polling query uses same `['nodes']` queryKey as the parent page's useNodes, so React Query deduplicates network requests.
3. **initialNodeCount timing**: Captured in the handleGenerate callback right after mutateAsync resolves and before setIsPolling(true), per D-09.

## Known Stubs

None - all components are fully wired to backend API endpoints from Plan 01.

## Verification

- TypeScript compiles without errors (`npx tsc --noEmit` exits 0)
- All 6 behavioral tests pass (`npx vitest run` exits 0)
- DeployNodeModal imported and rendered in nodes-page.tsx
- generatePairingCode function exists in nodes.ts API
- refetchInterval and initialNodeCount present in deploy-node-modal.tsx

## Self-Check: PASSED

All 5 created/modified files verified present. Both commits (46d36e1, 446d50d) verified in git log.
