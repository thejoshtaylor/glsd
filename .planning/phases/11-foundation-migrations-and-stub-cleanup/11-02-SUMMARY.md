---
phase: 11-foundation-migrations-and-stub-cleanup
plan: 02
subsystem: frontend
tags: [tauri-stubs, react, typescript, project-wizard, cloud-mode, console-noise]

# Dependency graph
requires:
  - phase: 11-foundation-migrations-and-stub-cleanup
    plan: 01
    provides: Foundation migrations complete (push_subscription, usage_record, User email columns)
provides:
  - Zero console.warn('[tauri-stub]') calls across all frontend source files
  - project-wizard-dialog and guided-project-wizard use editable text inputs for remote paths
  - import-project-dialog has typed path entry with Continue button (no Browse-only dead end)
  - scaffoldProject throws a clear user-facing error (node selection required, Phase 11.1 will fix)
  - secrets-manager copy updated to remove false OS keychain claims
affects:
  - phase 11.1 (Cloud API endpoints will wire Category B stubs)
  - All frontend pages (zero console noise in normal use)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline tauri-stub removal: Python regex sweep across tauri.ts + 11 component files"
    - "Cloud-mode path input: editable Input with font-mono placeholder instead of readOnly + Browse"
    - "scaffoldProject clear-error pattern: throw descriptive Error so wizard scaffoldError state shows friendly message"

key-files:
  created: []
  modified:
    - server/frontend/src/lib/tauri.ts
    - server/frontend/src/components/projects/project-wizard-dialog.tsx
    - server/frontend/src/components/projects/guided-project-wizard.tsx
    - server/frontend/src/components/projects/import-project-dialog.tsx
    - server/frontend/src/components/settings/secrets-manager.tsx
    - server/frontend/src/components/error-boundary.tsx
    - server/frontend/src/components/projects/project-card.tsx
    - server/frontend/src/components/project/dependency-alerts-card.tsx
    - server/frontend/src/components/project/github-panel.tsx
    - server/frontend/src/components/project/gsd2-reports-tab.tsx
    - server/frontend/src/components/dashboard/project-card.tsx
    - server/frontend/src/components/knowledge/knowledge-viewer.tsx
    - server/frontend/src/hooks/use-close-warning.ts
    - server/frontend/src/hooks/use-gsd-file-watcher.ts
    - server/frontend/src/pages/inbox.tsx
    - server/frontend/src/pages/review.tsx

key-decisions:
  - "scaffoldProject throws descriptive Error instead of calling createProject with empty node_id — prevents silent 422 server error; Phase 11.1 wizard refactor will add node selection"
  - "parentDir inputs changed from readOnly to editable — cloud users type remote node paths manually, Browse button removed"
  - "import-project-dialog: added text Input + Continue button to replace Browse-only select step"
  - "11 inline tauri-stub files outside tauri.ts also cleaned — plan scope was tauri.ts but inline stubs in component files also violated FIX-02 goal"

requirements-completed: [FIX-02]

# Metrics
duration: 17min
completed: 2026-04-11
---

# Phase 11 Plan 02: Tauri Stub Replacement Summary

**Zero console.warn('[tauri-stub]') calls remain across all 75+ frontend files; project wizards use editable text inputs for remote node paths; scaffoldProject throws a clear node-selection error; secrets-manager copy updated to remove false OS keychain claims**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-11T23:18:00Z
- **Completed:** 2026-04-11T23:35:41Z
- **Tasks:** 2 (both auto)
- **Files modified:** 16

## Accomplishments

- Removed all 197 `console.warn('[tauri-stub]')` calls from `tauri.ts` (Task 1, completed in previous session)
- Removed `import { createProject as _apiCreateProject }` from tauri.ts (no longer needed)
- Updated `scaffoldProject` to throw a clear user-facing error instead of calling createProject with empty node_id
- Replaced readOnly parentDir inputs with editable inputs in both project wizard components
- Removed Browse buttons (pickFolder returns null) and handlePickFolder callbacks from both wizard components
- Updated import-project-dialog to show a text input for path entry with a Continue button (replacing Browse-only dead end)
- Updated secrets-manager CardDescription and dialog copy to remove false OS keychain claims
- Silenced 11 additional inline tauri-stub console.warn calls found in component files outside tauri.ts (Rule 2 deviation — required to fully satisfy FIX-02 goal)
- TypeScript compilation: zero errors

## Task Commits

1. **Task 1 (previous session):** `1141151` — silence all Tauri stub warnings and wire Category A stubs
2. **Task 2:** `69a6fbb` — update components for cloud-mode stub behavior

## Files Created/Modified

- `server/frontend/src/lib/tauri.ts` — scaffoldProject now throws clear error; removed unused _apiCreateProject import
- `server/frontend/src/components/projects/project-wizard-dialog.tsx` — editable parentDir input, removed Browse button + handlePickFolder, toast on scaffold error
- `server/frontend/src/components/projects/guided-project-wizard.tsx` — editable parentDir input, removed Browse button + handlePickFolder, toast on scaffold error
- `server/frontend/src/components/projects/import-project-dialog.tsx` — text input for path entry, Continue button, handleContinueWithPath callback, Input import added
- `server/frontend/src/components/settings/secrets-manager.tsx` — updated descriptions to remove OS keychain references; updated button label and toasts
- 11 inline stub files (error-boundary, project-card x2, dependency-alerts-card, github-panel, gsd2-reports-tab, knowledge-viewer, use-close-warning, use-gsd-file-watcher, inbox, review) — removed console.warn from local inline stubs

## Decisions Made

- `scaffoldProject` throws `Error('Select a node before creating a project...')` rather than calling `_apiCreateProject({ node_id: '' })`. Passing an empty string for a UUID FK causes a silent server 422 with a cryptic error. The thrown error surfaces as `scaffoldError` in the wizard's "creating" step UI, which already renders the message. Phase 11.1 will refactor the wizards to include node selection.
- Both wizard components had `readOnly` inputs for `parentDir` — made editable because in cloud mode the user types a path on the remote node (no local filesystem access). The `checkProjectPath` stub returns `true` so the path preview shows "available" once a name and path are both entered.
- import-project-dialog previously had Browse-only path entry with no text input — a dead end since pickFolder returns null. Added a text Input and Continue button so users can actually proceed.
- 11 inline tauri-stub files were outside the plan's explicit file list but produced console noise under FIX-02 scope. Fixed as auto-deviation (Rule 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Inline tauri-stub console.warn calls in 11 component files**
- **Found during:** Task 2 verification (`grep -r "console.warn.*tauri-stub" src/`)
- **Issue:** Plan specified tauri.ts as the target but FIX-02 goal is "no console noise during normal use." 11 component/hook/page files had their own inline local tauri stubs with console.warn calls that fire on every render or URL open.
- **Fix:** Python regex sweep removed console.warn from all 11 files; functional behavior (window.open fallbacks, no-ops) preserved unchanged
- **Files modified:** error-boundary.tsx, project-card.tsx (x2), dependency-alerts-card.tsx, github-panel.tsx, gsd2-reports-tab.tsx, knowledge-viewer.tsx, use-close-warning.ts, use-gsd-file-watcher.ts, inbox.tsx, review.tsx
- **Commit:** 69a6fbb

**2. [Rule 1 - Bug] scaffoldProject called createProject with empty node_id**
- **Found during:** Task 1 (previous session) — API call would produce server 422 on every wizard submit
- **Fix:** Changed to throw a clear user-facing error; Phase 11.1 will add node selection to the wizard
- **Commit:** 1141151 (previous session)

---

**Total deviations:** 2 auto-fixed
**Impact on plan:** Both fixes were required to meet FIX-02 goal. No scope creep beyond the plan's stated objectives.

## Known Stubs

The following Category B stubs remain as silent no-ops with TODO: Phase 11.1 comments — they do not block the plan goal but produce empty states rather than real data:

| Stub | File | Line | Status |
|------|------|------|--------|
| `checkProjectPath` | tauri.ts | ~591 | Returns `true` (permissive); Phase 11.1 wires to `/api/v1/nodes/{id}/check-path` |
| `readProjectFile` | tauri.ts | ~581 | Returns `''`; env-vars-tab shows empty state gracefully |
| `listSecretKeys` | tauri.ts | ~various | Returns `[]`; secrets-manager shows "No secrets stored" empty state |
| `setSecret/getSecret/deleteSecret` | tauri.ts | ~various | Silent no-ops; secrets-manager add/delete flows show toasts but don't persist |
| `getSettings/updateSettings/resetSettings` | tauri.ts | ~various | Silent no-ops; Phase 11.1 wires to `/api/v1/settings/*` |

These stubs are intentional for Phase 11 — Phase 11.1 will add the backend endpoints and wire them.

## Issues Encountered

None blocking. The TypeScript compilation passed on first attempt after adding the `Input` import to import-project-dialog.tsx.

## User Setup Required

None.

## Next Phase Readiness

- Phase 11 Plan 03 (email error handling) can proceed immediately
- Phase 11.1 planning can proceed — stubs are documented with TODO comments pointing to required endpoints

## Self-Check: PASSED

- FOUND: server/frontend/src/lib/tauri.ts (scaffoldProject throws, no console.warn calls)
- FOUND: server/frontend/src/components/projects/project-wizard-dialog.tsx (editable parentDir, no Browse button)
- FOUND: server/frontend/src/components/projects/guided-project-wizard.tsx (editable parentDir, no Browse button)
- FOUND: server/frontend/src/components/projects/import-project-dialog.tsx (text input + Continue button)
- FOUND: server/frontend/src/components/settings/secrets-manager.tsx (updated copy)
- Commit 1141151 (feat/11-02 Task 1): silence tauri stub warnings
- Commit 69a6fbb (feat/11-02 Task 2): update components for cloud-mode stub behavior
- TSC: PASS (zero errors)
- grep tauri-stub: PASS (zero matches across all src/)
- grep "not available" in components/projects/ and secrets-manager: PASS (zero matches)

---
*Phase: 11-foundation-migrations-and-stub-cleanup*
*Completed: 2026-04-11*
