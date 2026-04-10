---
phase: 09-ui-wiring-completion
fixed_at: 2026-04-10T00:00:00Z
review_path: .planning/phases/09-ui-wiring-completion/09-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-04-10
**Source review:** .planning/phases/09-ui-wiring-completion/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: `reconnect` does not reset `lastSeqRef` — replayed events will be dropped after reconnect

**Files modified:** `server/frontend/src/hooks/use-cloud-session.ts`
**Commit:** 27916fe
**Applied fix:** Added `lastSeqRef.current = 0;` immediately after `cleanupWs()` and before `setState(initialState)` inside `createSession`. This ensures the sequence deduplication counter is cleared on every new session, preventing stale sequence numbers from causing new messages to be dropped or the connection state to prematurely enter `'replaying'`.

---

### WR-02: Resource leak — `onDataDisposable` created but never cleaned up when `persistKey` is undefined

**Files modified:** `server/frontend/src/components/terminal/interactive-terminal.tsx`
**Commit:** ab7c1e7
**Applied fix:** Added `onDataDisposableRef = useRef<{ dispose: () => void } | null>(null)` alongside the other refs. After `terminal.onData(...)` creates the disposable in Path B, it is stored into `onDataDisposableRef.current`. The cleanup `return` at the end of the `useEffect` now calls `onDataDisposableRef.current?.dispose()` and nulls the ref, ensuring the `onData` subscription is always released regardless of whether `persistKey` is set.

---

### WR-03: `connectToCloud` fires on every remount when `autoConnect` is true — no guard against already-connected state

**Files modified:** `server/frontend/src/components/terminal/interactive-terminal.tsx`
**Commit:** e1a17ca
**Applied fix:** Added `hasConnectedRef = useRef(false)` alongside the other refs. The auto-connect block now checks `!hasConnectedRef.current` before scheduling `connectToCloud`, and sets `hasConnectedRef.current = true` immediately when scheduling. This prevents a second `createSession` call when `lineHeight` changes (triggering effect re-run) while a session is already active.

---

### WR-04: `ActivityProvider` indentation mismatch creates a misleading component nesting impression

**Files modified:** `server/frontend/src/App.tsx`
**Commit:** ccd9a7f
**Applied fix:** Re-indented the `<ActivityProvider>`, `<MainLayout>`, `<ErrorBoundary>`, `<Suspense>`, `<Routes>`, and all child `<Route>` elements so indentation visually matches the actual JSX nesting: `ProtectedRoute > ActivityProvider > MainLayout > ErrorBoundary > Suspense > Routes`.

---

_Fixed: 2026-04-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
