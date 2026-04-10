---
status: testing
phase: 04-frontend-integration
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md
started: 2026-04-10T03:10:00.000Z
updated: 2026-04-10T03:10:00.000Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files).
  Start the application from scratch. Server boots without errors, any seed/migration
  completes, and a primary query (health check, homepage load, or basic API call) returns
  live data.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state. Start from scratch — server boots without errors, migrations complete, and a basic API call returns live data.
result: [pending]

### 2. Login Form
expected: Navigate to /login — see an email/password form. Enter valid credentials and submit. App redirects you to the main protected view. No Tauri errors or import failures in the console.
result: [pending]

### 3. Register Tab Toggle
expected: On the login page, there is a tab or toggle to switch to a Register form. Clicking it shows a registration form with email/password fields.
result: [pending]

### 4. Logout Button
expected: Inside the app, the sidebar shows your logged-in email. There is a logout button. Clicking it clears your session and redirects you to /login.
result: [pending]

### 5. Protected Route / Auth Redirect
expected: While not logged in, navigate directly to a protected page (e.g., /nodes). You are redirected to /login. After login, you are sent back to where you tried to go. A brief loading spinner appears while auth status is being checked.
result: [pending]

### 6. Node Selector Dropdown
expected: In the session view, there is a dropdown to select a remote node. Each option shows the node name and an online/offline status badge. Offline nodes appear visually distinct from online ones.
result: [pending]

### 7. Cloud Terminal Streaming
expected: Start a cloud session on an online node. A terminal area appears and shows live output from Claude Code running on the remote node. Output streams in as it's produced — not a static blob.
result: [pending]

### 8. Permission Prompt
expected: When Claude Code requests tool use permission, an amber-tinted inline prompt appears inside the terminal area showing the tool name and details. You can approve or deny it from the UI.
result: [pending]

### 9. Question Prompt
expected: When Claude Code asks a clarifying question, a blue-tinted inline prompt appears. You can type a response and submit it from the UI.
result: [pending]

### 10. Nodes Page Grid
expected: Navigate to /nodes. You see a card grid of your registered nodes, each showing the node name, online/offline badge, and last connected time. If no nodes exist, an empty state is shown. Cards show a skeleton loader while data is fetching.
result: [pending]

### 11. Node Detail Page
expected: Click a node card. You see a detail page with the node's UUID, key fingerprint, and connection timestamps. Active sessions running on this node are listed.
result: [pending]

### 12. Revoke Node with Confirmation
expected: On a node detail page, there is a Revoke button. Clicking it opens a confirmation dialog. Confirming shows a toast notification and navigates back to /nodes. The revoked node no longer appears (or shows as disconnected).
result: [pending]

### 13. Node File Browser
expected: Navigate to /nodes/:nodeId/files. You see a file/folder listing for the remote node's filesystem. Clicking a folder navigates into it, with breadcrumb navigation showing the path. Clicking a file opens it. Layout works on mobile.
result: [pending]

### 14. File Browser Error States
expected: If the node is offline, the file browser shows a readable "node offline" message (not a raw error). If a request takes too long, a "request timed out" message is shown instead of a spinner that never resolves.
result: [pending]

## Summary

total: 14
passed: 0
issues: 0
pending: 14
skipped: 0
blocked: 0

## Gaps

[none yet]
