---
status: partial
phase: 09-ui-wiring-completion
source: [09-VERIFICATION.md]
started: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. ReconnectionBanner live behavior
expected: Banner reading "Reconnecting..." with spinner appears at top of terminal while connectionState is 'connecting' or 'replaying' and sessionId is non-null. Banner disappears when session reconnects successfully.
result: [pending]

### 2. Activity feed end-to-end navigation
expected: Clicking an activity event navigates to /sessions/:id, shows a brief loading spinner, then performs a replace navigation to /nodes/:nodeId/session. Back button returns to activity feed (not redirect page).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
