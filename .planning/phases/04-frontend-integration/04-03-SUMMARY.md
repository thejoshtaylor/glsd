---
phase: "04"
plan: "03"
subsystem: "frontend-integration"
tags: [websocket, streaming, claude-code, terminal, permission-prompt, question-prompt, node-selector, tauri-removal]
dependency_graph:
  requires: ["04-01", "04-02"]
  provides: ["use-cloud-session-hook", "permission-prompt", "question-prompt", "node-selector", "cloud-terminal-streaming"]
  affects: ["server/frontend"]
tech_stack:
  added:
    - "useCloudSession hook — REST createSession + WebSocket streaming lifecycle"
    - "PermissionPrompt component — amber-tinted inline tool approval UI"
    - "QuestionPrompt component — blue-tinted inline question/answer UI"
    - "NodeSelector component — select dropdown from useNodes() with online/offline status"
    - "extractStreamText — Claude content_block_delta / text event text extraction"
  patterns:
    - "Cloud session: REST POST /sessions -> WebSocket ws.connect(channelId)"
    - "Stream event text extracted from content_block_delta.delta.text (Anthropic SSE format)"
    - "PermissionPrompt/QuestionPrompt render inline below xterm.js terminal container"
    - "Terminal is output-only for cloud sessions — no raw PTY keystroke forwarding"
    - "NodePublic online status derived from connected_at != null && disconnected_at == null"
key_files:
  created:
    - server/frontend/src/hooks/use-cloud-session.ts
    - server/frontend/src/components/terminal/permission-prompt.tsx
    - server/frontend/src/components/terminal/question-prompt.tsx
    - server/frontend/src/components/nodes/node-selector.tsx
  modified:
    - server/frontend/src/components/terminal/interactive-terminal.tsx
    - server/frontend/src/contexts/terminal-context.tsx
    - server/frontend/src/components/terminal/shell-view.tsx
    - server/frontend/src/components/terminal/terminal-tabs.tsx
    - server/frontend/src/components/terminal/global-terminals.tsx
    - server/frontend/src/hooks/use-close-warning.ts
    - server/frontend/src/components/project/gsd2-session-tab.tsx
decisions:
  - "NodePublic.is_online derived from connected_at/disconnected_at fields — backend does not expose is_online directly"
  - "Cloud terminal is output-only — user sends prompts via sendTask, not raw terminal keystrokes"
  - "extractStreamText handles content_block_delta, text, and JSON.stringify fallback — matches Anthropic SSE event shapes"
  - "TerminalTab.tmuxSession replaced with nodeId/cwd — cloud sessions do not use tmux"
  - "isRestored always true in cloud TerminalContext — no Tauri session restore needed"
  - "gsd2-session-tab.tsx command/onExit props removed — InteractiveTerminal no longer accepts PTY command or exit callback"
metrics:
  duration: "~25 min"
  completed: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 7
---

# Phase 4 Plan 03: Session Streaming Pipeline Summary

**One-liner:** useCloudSession hook wires REST session creation and WebSocket streaming to xterm.js; PermissionPrompt and QuestionPrompt render inline; NodeSelector lets users pick a remote node; all PTY/tmux code removed from terminal components.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | useCloudSession hook + permission/question prompts | b85906a | use-cloud-session.ts, permission-prompt.tsx, question-prompt.tsx |
| 2 | Adapt terminal components + NodeSelector | 2f9af73 | interactive-terminal.tsx, terminal-context.tsx, shell-view.tsx, node-selector.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NodePublic has no is_online field**
- **Found during:** Task 2, TypeScript check after writing NodeSelector
- **Issue:** Plan specified rendering `node.is_online` but `NodePublic` in `lib/api/nodes.ts` has no such field — it exposes `connected_at` and `disconnected_at` instead
- **Fix:** Derived `is_online` inline: `node.connected_at !== null && node.disconnected_at === null`
- **Files modified:** `src/components/nodes/node-selector.tsx`
- **Commit:** 2f9af73

**2. [Rule 1 - Bug] global-terminals.tsx referenced removed context API**
- **Found during:** Task 2, TypeScript check after adapting terminal-context.tsx
- **Issue:** `global-terminals.tsx` destructured `setTabTmuxSession`, `setSplitExited` and passed `tmuxSession`, `existingSessionId`, `onTmuxSessionCreated`, `onExit` props that no longer exist on `InteractiveTerminal`
- **Fix:** Removed all PTY/tmux props from `InteractiveTerminal` usages; removed unused context destructures
- **Files modified:** `src/components/terminal/global-terminals.tsx`
- **Commit:** 2f9af73

**3. [Rule 1 - Bug] terminal-tabs.tsx rendered tmux session badge**
- **Found during:** Task 2, TypeScript check
- **Issue:** `terminal-tabs.tsx` rendered a green tmux dot and "tmux" Badge referencing `tab.tmuxSession` which no longer exists on `TerminalTab`
- **Fix:** Removed tmux indicator elements
- **Files modified:** `src/components/terminal/terminal-tabs.tsx`
- **Commit:** 2f9af73

**4. [Rule 1 - Bug] gsd2-session-tab.tsx used removed InteractiveTerminal props**
- **Found during:** Task 2, TypeScript check
- **Issue:** `gsd2-session-tab.tsx` passed `command={headlessCommand}` and `onExit={handleHeadlessExit}` to `InteractiveTerminal`, both props removed in this plan's rewrite
- **Fix:** Removed `command`, `onExit`, and the now-unused `headlessCommand`/`handleHeadlessExit` variables
- **Files modified:** `src/components/project/gsd2-session-tab.tsx`
- **Commit:** 2f9af73

**5. [Rule 1 - Bug] use-close-warning.ts referenced tab.tmuxSession**
- **Found during:** Task 2, TypeScript check
- **Issue:** `use-close-warning.ts` built a session save payload referencing `tab.tmuxSession` which was removed from `TerminalTab`
- **Fix:** Set `tmux_session: undefined` (field still present in the save payload type but no longer populated from tab state)
- **Files modified:** `src/hooks/use-close-warning.ts`
- **Commit:** 2f9af73

## Known Stubs

- `useCloudSession.sendTask` is implemented but not yet wired to any UI input — the terminal is currently output-only. A prompt input field (to call `sendTask`) is deferred to Plan 04 or UI polish phase.
- `gsd2-session-tab.tsx` `writeToHeadless` still calls `ptyWrite` from `lib/tauri` (stub) — this component is legacy GSD-2 code not yet migrated to cloud sessions.

## Threat Surface Scan

| Threat ID | Status |
|-----------|--------|
| T-04-09 | Mitigated — sendTask sends sessionId/channelId from server-validated state; server overwrites channelId |
| T-04-10 | Mitigated — toolInput JSON displayed read-only in pre block; no editable submission path |
| T-04-11 | Mitigated — requestId comes from server permissionRequest message; server validates match |
| T-04-12 | Accepted — unrecognised stream events fall back to JSON.stringify; no crash path |

## Self-Check

### Created files exist:
- server/frontend/src/hooks/use-cloud-session.ts — FOUND
- server/frontend/src/components/terminal/permission-prompt.tsx — FOUND
- server/frontend/src/components/terminal/question-prompt.tsx — FOUND
- server/frontend/src/components/nodes/node-selector.tsx — FOUND

### Commits exist:
- b85906a — Task 1 (useCloudSession, PermissionPrompt, QuestionPrompt)
- 2f9af73 — Task 2 (terminal component adaptation, NodeSelector)

### Build:
- `pnpm build` exits 0 — PASSED
- `tsc --noEmit` clean — PASSED
- No `usePtySession` in terminal components — PASSED

## Self-Check: PASSED
