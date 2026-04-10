---
phase: 09-ui-wiring-completion
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - server/frontend/src/pages/session-redirect.tsx
  - server/frontend/src/components/terminal/interactive-terminal.tsx
  - server/frontend/src/App.tsx
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-04-10
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed: the session redirect page, the interactive terminal component, and the main app router. The code is generally well-structured and follows React/TypeScript conventions. No security vulnerabilities or data-loss bugs were found. Four warnings were identified — two are logic errors that could silently produce incorrect runtime behavior (reconnect does not reset sequence tracking; the terminal cache hit does not guard against lineHeight mismatches when `persistKey` is absent), and two are edge cases in error handling. Three informational items flag dead code, a missing prop, and a magic number.

The cross-file relationship between `interactive-terminal.tsx` and `use-cloud-session.ts` was also checked, as the terminal's `reconnect` handler calls `disconnect()` then `connectToCloud()`, which depends on `useCloudSession` state being reset correctly.

---

## Warnings

### WR-01: `reconnect` does not reset `lastSeqRef` — replayed events will be dropped after reconnect

**File:** `server/frontend/src/components/terminal/interactive-terminal.tsx:181-188`

**Issue:** `reconnect()` calls `disconnect()` then `connectToCloud()`. `disconnect()` in `use-cloud-session.ts` calls `cleanupWs()` and resets React state to `initialState`, but `lastSeqRef` (line 150 in `use-cloud-session.ts`) is a `useRef` and is **not** reset by `disconnect()`. On the next `createSession` call, the new session starts with a stale `lastSeqRef.current > 0`, so the WebSocket handler's reconnection-state check at line 207 (`if (lastSeqRef.current > 0)`) will prematurely set `connectionState` to `'replaying'` and the deduplication guards at lines 219–223 will silently drop messages with sequence numbers ≤ the stale value. The terminal will show the reconnection banner and discard valid output.

**Fix:** Reset `lastSeqRef.current = 0` inside `cleanupWs()` (or at the top of `createSession`) in `use-cloud-session.ts`:

```typescript
// use-cloud-session.ts — createSession, before setState(initialState)
const createSession = useCallback(async (nodeId: string, cwd: string): Promise<string> => {
  cleanupWs();
  lastSeqRef.current = 0;   // ← add this line
  setState(initialState);
  // ...
}, [cleanupWs]);
```

---

### WR-02: Terminal cache restore skips `lineHeight` guard when `persistKey` is undefined

**File:** `server/frontend/src/components/terminal/interactive-terminal.tsx:215-216`

**Issue:** The cache lookup at line 215 is `const cached = key ? terminalInstanceCache.get(key) : undefined`. When `persistKey` is undefined, `key` is undefined and `cached` is always undefined — so the lineHeight guard at line 216 (`cached.lineHeight === lineHeight`) is never evaluated. This is benign for the terminal instance cache specifically. However, the `key` being undefined also means the cleanup path at line 394 (`if (persistKeyRef.current && terminalInstanceCache.has(...))`) will never match, so the terminal is always disposed on unmount — the correct fallback behavior. No actual bug here in the cache path, but the `onDataDisposable` created at line 304 is registered inside the cache entry at line 317–326 only when `key` is truthy. When `key` is undefined, `onDataDisposable` is created (line 304) but never stored — its `dispose()` is never called during cleanup (line 383–407 does not reference it). This is a resource leak: the `onData` subscription on the Terminal instance remains alive until the Terminal is disposed.

**Fix:** Store the disposable in a local ref or a separate variable so the cleanup can call `dispose()` regardless of whether `persistKey` is set:

```typescript
// Add a ref alongside terminalRef:
const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);

// In Path B, after creating onDataDisposable:
onDataDisposableRef.current = onDataDisposable;

// In the cleanup return:
return () => {
  onDataDisposableRef.current?.dispose();
  onDataDisposableRef.current = null;
  // ... rest of cleanup
};
```

---

### WR-03: `connectToCloud` fires on every remount when `autoConnect` is true — no guard against already-connected state

**File:** `server/frontend/src/components/terminal/interactive-terminal.tsx:371-380`

**Issue:** The initialization `useEffect` (line 203) has `[lineHeight]` as its only dependency. On any `lineHeight` change (or initial mount), it schedules `connectToCloud()` via `setTimeout`. If the terminal already has an active session (e.g., user changes `lineHeight` in settings while a session is running), a second `createSession` call is issued: the previous WebSocket is cleaned up and a brand-new session is started, discarding all in-flight state. The `cancelled` flag guards against the timeout firing after unmount, but not against firing when the session is already running.

**Fix:** Check session state before auto-connecting:

```typescript
if (autoConnect && nodeId && !state.sessionId) {
  autoConnectTimer = setTimeout(() => {
    if (!cancelled) {
      void connectToCloud();
    }
  }, isRestoredFromCache ? 50 : 100);
}
```

Because `state` is not available inside the effect without adding it as a dependency (which would re-run the full init on every state change), a cleaner approach is to keep a `hasConnectedRef`:

```typescript
const hasConnectedRef = useRef(false);
// In the effect:
if (autoConnect && nodeId && !hasConnectedRef.current) {
  hasConnectedRef.current = true;
  autoConnectTimer = setTimeout(...);
}
```

---

### WR-04: `ActivityProvider` indentation mismatch creates a misleading component nesting impression

**File:** `server/frontend/src/App.tsx:54-82`

**Issue:** `<ActivityProvider>` at line 54 is indented at the same level as `<MainLayout>` at line 55, but its closing tag at line 82 is inside the `<ProtectedRoute>` JSX. The actual nesting is correct (`ActivityProvider` wraps `MainLayout`), but the mismatched indentation makes it visually appear that `ActivityProvider` and `MainLayout` are siblings at the same level. This is a readability bug — a future refactor may introduce a genuine sibling by mistake.

**Fix:**

```tsx
<ProtectedRoute>
  <ActivityProvider>
    <MainLayout>
      <ErrorBoundary label="Page" inline>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ... routes ... */}
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  </ActivityProvider>
</ProtectedRoute>
```

---

## Info

### IN-01: Dead code — `onData` handler in `terminal.onData()` has a no-op broadcast branch

**File:** `server/frontend/src/components/terminal/interactive-terminal.tsx:304-309`

**Issue:** The `terminal.onData()` callback (line 304) registers a subscription for raw terminal input. Its only branch is:

```typescript
if (!readOnly && broadcastWriteRef.current) {
  // Broadcast is local terminal coordination — no-op for cloud sessions
}
```

The comment explicitly acknowledges it is a no-op. The entire subscription exists solely to store `onDataDisposable` in the cache — but as noted in WR-02, when `key` is undefined the disposable is never cleaned up anyway. This subscription fires on every keystroke and performs no work. Remove the body or remove the subscription entirely if raw input is genuinely unused for cloud sessions.

---

### IN-02: `SessionRedirectPage` does not pass `nodeId` context — the redirect destination may be a session-less node page

**File:** `server/frontend/src/pages/session-redirect.tsx:40`

**Issue:** The redirect at line 40 navigates to `/nodes/${session.node_id}/session` with no state or query params carrying the original session ID. `NodeSessionPage` (the route target) will have to re-fetch or re-derive the session, or it will start a fresh session. This may be intentional per the D-03 design decision referenced in the file header, but if `NodeSessionPage` needs to resume a specific session, it currently has no way to identify which one.

**Suggestion:** If resuming a specific session is needed, pass it via location state:

```tsx
return (
  <Navigate
    to={`/nodes/${session.node_id}/session`}
    state={{ sessionId: session.id }}
    replace
  />
);
```

---

### IN-03: Magic model string hardcoded in `sendTask`

**File:** `server/frontend/src/hooks/use-cloud-session.ts:326`

**Issue:** The default model string `'claude-sonnet-4-20250514'` is hardcoded inline. When Anthropic releases a new model, this requires a grep-and-replace across source files. Extract to a named constant in a shared config or protocol file.

```typescript
// e.g., in lib/protocol.ts or lib/constants.ts
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// in use-cloud-session.ts
model: opts?.model ?? DEFAULT_CLAUDE_MODEL,
```

---

_Reviewed: 2026-04-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
