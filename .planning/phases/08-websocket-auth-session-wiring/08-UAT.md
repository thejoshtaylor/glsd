---
status: testing
phase: 08-websocket-auth-session-wiring
source: [08-01-SUMMARY.md]
started: 2026-04-10T07:30:00.000Z
updated: 2026-04-10T07:30:00.000Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Login Cookie Works on Local HTTP
expected: |
  With the backend running at http://localhost:8000 (plain HTTP, not HTTPS),
  log in with valid credentials. The login succeeds, the auth cookie is set in
  the browser (visible in DevTools > Application > Cookies), and subsequent
  page loads / API calls are authenticated normally. Previously this would fail
  silently because the cookie had secure=True but the connection was HTTP.
awaiting: user response

## Tests

### 1. Login Cookie Works on Local HTTP
expected: With the backend running at http://localhost:8000 (plain HTTP, not HTTPS), log in with valid credentials. The login succeeds, the auth cookie is set in the browser (visible in DevTools > Application > Cookies), and subsequent page loads / API calls are authenticated normally. Previously this would fail silently because the cookie had secure=True but the connection was HTTP.
result: [pending]

### 2. New Session Button Visible on Online Node
expected: Navigate to the detail page of a node that is online (green status, not revoked). A "New Session" button with a Plus icon is visible. The button is NOT shown when the node is offline or revoked.
result: [pending]

### 3. New Session Button Reveals cwd Input
expected: Click the "New Session" button on an online node's detail page. An inline form appears with a text input for entering an absolute path. No modal/dialog appears — the form is inline on the page.
result: [pending]

### 4. New Session Form Navigates to Session Page
expected: In the inline cwd form on the node detail page, enter an absolute path (e.g. /home/user/myproject) and submit. The browser navigates to /nodes/:nodeId/session?cwd=%2Fhome%2Fuser%2Fmyproject (URL-encoded path). No full page reload — in-app navigation via React Router.
result: [pending]

### 5. Session Page Without cwd Shows Path Form
expected: Navigate directly to /nodes/:nodeId/session (without a ?cwd= query param). A form is displayed asking for an absolute path to use as the working directory. A back link to the node detail page is in the header.
result: [pending]

### 6. Session Page With cwd Renders Terminal
expected: Navigate to /nodes/:nodeId/session?cwd=/some/path. The interactive terminal is rendered filling the available space, with the working directory set to /some/path. A header bar shows the cwd and a back link to the node detail page.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
