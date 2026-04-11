# Feature Landscape

**Domain:** GSD Cloud v1.1 -- Notifications, Usage Tracking, Email Auth, and Polish
**Researched:** 2026-04-11

## Table Stakes

Features users expect once v1.0 exists. Missing = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Depends On (v1.0) | Notes |
|---------|--------------|------------|-------------------|-------|
| Password reset via email (AUTH-07) | Users forget passwords. No reset = locked out forever. Self-hosted means no admin backdoor. | **Low** | JWT auth, User model, SMTP config | Backend already 90% built: `POST /password-recovery/{email}`, token generation, `POST /reset-password/`, email template, anti-enumeration response. Frontend `/reset-password?token=` page needed. |
| Email verification on signup (AUTH-08) | Prevents typo emails that lock users out of password reset. Critical for self-hosted where there is no admin to fix email addresses. | **Medium** | User registration, SMTP config | Requires new `email_verified` field on User model, verification token generation, verification email template, `/verify-email?token=` page. |
| Per-session token usage display (COST-01) | Users paying for Claude API usage need to see what each session costs. Without this, running sessions feels like a blank check. | **Low** | `taskComplete` events already stored in `session_event` with `inputTokens`, `outputTokens`, `costUsd`, `durationMs` | Data already in DB. Need: extraction query, REST endpoint, UI display on session detail view. |
| Usage history per node/session (COST-02) | Aggregated view to understand spending patterns. Table stakes for any tool that incurs API costs. | **Medium** | COST-01, SessionModel, Node model | Aggregation queries across `session_event` where `event_type = 'taskComplete'`. Group by session, node, time period. |
| "Deploy on new node" instructions modal (UX-01) | After creating a node and getting a pairing token, users need clear steps to actually install the daemon. Without this, the token is useless unless they read external docs. | **Low** | Node pairing (token generation), NodePairResponse returning `token` and `relay_url` | Modal triggered from Nodes page. Shows: download binary, run install script with token + relay URL, verify connection. |
| Tauri stub replacement (STUB-01) | Any remaining Tauri stubs that throw errors or show "not available" break the impression of a finished product. | **Low-Med** | Full frontend audit | Scope depends on how many stubs remain. Each stub is small but there may be many. |
| Missing column migrations (BUG-01) | 500 errors on nodes/projects pages. Literally broken. | **Low** | Alembic migration system | Straightforward column additions. |

## Differentiators

Features that set the product apart. Not expected by every user, but valued by power users and distinguish GSD Cloud from "just SSH into your machine."

| Feature | Value Proposition | Complexity | Depends On (v1.0) | Notes |
|---------|-------------------|------------|-------------------|-------|
| Push notifications for permission requests (NOTF-01) | The killer use case: start a long task, walk away, get notified when Claude needs approval. Without this, users must keep the browser tab open and visible. | **High** | WebSocket relay, PermissionRequest messages, Service Worker | Full Web Push stack: VAPID key generation, service worker registration, push subscription storage, pywebpush on server, notification click routing to correct session. |
| Push notifications for session completion (NOTF-02) | "Your build is done" -- lets users batch work across nodes without babysitting. | **Medium** | NOTF-01 infrastructure, `taskComplete` events | Incremental on NOTF-01. Same push infrastructure, different trigger (taskComplete instead of permissionRequest). |
| Redis pub/sub multi-worker verification (SCAL-01) | Proves horizontal scaling works. Differentiator for users running GSD Cloud as a team tool with multiple workers. | **Medium** | Redis already wired in Docker Compose, ConnectionManager, broadcaster | Test infrastructure: multi-worker Uvicorn config, verify messages route across workers via Redis. |

## Feature Details

### 1. Web Push Notifications (NOTF-01, NOTF-02)

**How the browser UX works:**

1. **Permission prompt timing:** Do NOT request notification permission on first page load. Trigger the browser permission prompt only after the user takes a meaningful action -- e.g., starting their first session, or clicking an explicit "Enable notifications" toggle in Settings. Pre-prompt with an in-app explanation: "Get notified when Claude needs your approval or finishes a task."

2. **Subscribe flow:**
   - User clicks "Enable push notifications" in Settings (or on first session start, an in-app prompt appears)
   - Browser shows native permission dialog ("GSD Cloud wants to send notifications")
   - If granted: JS calls `PushManager.subscribe()` with the server's VAPID public key, sends the resulting `PushSubscription` object (endpoint + keys) to `POST /api/push-subscriptions`
   - Server stores subscription per user (a user may have multiple devices/browsers)

3. **What triggers a push vs in-app notification:**
   - **Push (out-of-tab):** Permission requests (`permissionRequest` message type) and session completions (`taskComplete`). These are the "you walked away" scenarios.
   - **In-app (tab is open):** Everything. Stream output, questions, errors, heartbeat status. The existing WebSocket feed handles this already.
   - **Logic:** Server checks if the user has an active browser WebSocket connection for that session's channel. If yes, skip push (they are already watching). If no active connection, fire push notification.

4. **Notification content:**
   - Permission request: "Claude needs approval: [toolName] on [nodeName]" with action buttons "Approve" / "View"
   - Session complete: "[Session CWD] completed -- [inputTokens + outputTokens] tokens, $[costUsd]"
   - Click action: Opens/focuses the GSD Cloud tab at the correct session URL

5. **Unsubscribe:** Toggle in Settings page. Calls `DELETE /api/push-subscriptions/{id}`. Also handle subscription expiry server-side (push services return 410 Gone for expired subscriptions -- delete on receipt).

6. **Fallback when push is denied:**
   - Show a persistent in-app banner: "Notifications are blocked. You can enable them in browser settings."
   - No nagging re-prompts. Once denied, browsers block re-asking. The only path is manual browser settings.
   - The app continues to work normally -- all events are still visible in the activity feed and terminal view when the tab is open.

7. **iOS PWA caveat:** iOS requires the app to be installed to Home Screen before push works. Show a one-time "Add to Home Screen for notifications" prompt on iOS Safari. If they decline, in-app notifications only.

**Server-side implementation:**
- `pywebpush` library for VAPID-signed push delivery
- VAPID key pair generated once, stored in environment variables
- `PushSubscription` table: `id`, `user_id`, `endpoint`, `p256dh_key`, `auth_key`, `created_at`
- On `permissionRequest` or `taskComplete` arriving at the relay hub: check if user has active browser WS for that channel. If not, query `PushSubscription` rows for that user and fire push via `pywebpush.webpush()`
- Handle push failures: 410 Gone = delete subscription. 429 = backoff and retry.

**Service Worker:**
- Registered from frontend on app load (even before push permission, for future PWA capabilities)
- `push` event handler: parse payload, show `self.registration.showNotification()`
- `notificationclick` event handler: `clients.openWindow(url)` to route to correct session

**Complexity breakdown:**
- Service worker + registration: Medium
- Backend push subscription CRUD + VAPID: Medium
- Trigger logic (check active connections, decide push vs skip): Medium
- iOS PWA install prompt: Low
- Total: **High** (many moving parts, cross-browser testing required)

### 2. Per-Session Token Usage Tracking (COST-01, COST-02)

**What data the daemon already sends:**

The `taskComplete` message (already in protocol) carries:
```json
{
  "type": "taskComplete",
  "inputTokens": 15234,
  "outputTokens": 3891,
  "costUsd": "0.0847",
  "durationMs": 12500,
  "resultSummary": "Added authentication middleware..."
}
```

This is already stored in `session_event.payload` as JSONB. No protocol changes needed.

**Data model approach:**

Two options:
- **Option A (recommended): Query-time aggregation from `session_event`.** No new table. Use PostgreSQL JSONB extraction: `payload->>'costUsd'` cast to numeric, aggregated by session/node/time. Add a database index on `(event_type, session_id)` filtered to `event_type = 'taskComplete'` for performance.
- **Option B: Materialized `task_usage` table.** Denormalize on `taskComplete` write. Better query performance at scale but adds write-time complexity. Only needed if session_event table grows very large (10K+ completions).

Start with Option A. Migrate to B if queries become slow.

**Aggregation dimensions:**
- **Per-session:** Sum of all taskComplete events for a session. Show on session detail page.
- **Per-node:** Sum across all sessions on a node. Show on node detail page.
- **Per-day/week/month:** Time-series aggregation. Show on a dedicated Usage page.
- **Per-user total:** Running total. Show in Settings or a Usage dashboard.

**REST API endpoints:**
- `GET /api/sessions/{id}/usage` -- single session usage summary
- `GET /api/usage?group_by=node|day|session&start=&end=` -- aggregated usage with filters
- Response shape: `{ inputTokens, outputTokens, totalTokens, costUsd, taskCount, totalDurationMs }`

**Usage history UI -- what makes it useful:**

1. **Session detail view:** Below the terminal, show a summary bar: "15,234 input / 3,891 output tokens -- $0.08 -- 12.5s". If a session has multiple tasks (resume), show per-task breakdown in an expandable table.

2. **Usage dashboard page (new route `/usage`):**
   - **Summary cards at top:** Total tokens today, total cost today, total cost this month, average cost per session
   - **Bar chart:** Daily cost over last 30 days (stacked: input vs output tokens, or cost by node)
   - **Table below:** Recent sessions with columns: Date, Node, Session CWD (truncated), Input Tokens, Output Tokens, Cost, Duration. Sortable and filterable by node and date range.
   - **Node breakdown:** Pie or horizontal bar showing cost distribution across nodes

3. **Node detail view:** Show "Total usage: X tokens, $Y.ZZ across N sessions" summary.

4. **Key UX principle:** Show cost prominently but not alarmingly. Users want awareness, not anxiety. Use neutral colors, not red.

**Complexity:** Low for basic per-session display (data exists, just needs an endpoint and UI component). Medium for the full usage dashboard with charts and aggregations.

### 3. Transactional Email Auth Flows (AUTH-07, AUTH-08)

**Password reset flow -- step by step (AUTH-07):**

The backend is already 90% complete. Here is the full expected flow:

1. User clicks "Forgot password?" on login page
2. Frontend shows email input form
3. User enters email, clicks "Send reset link"
4. Frontend calls `POST /api/password-recovery/{email}` (already implemented)
5. Backend generates JWT token with email as subject, 1-hour expiry (already implemented)
6. Backend sends email with reset link `{FRONTEND_HOST}/reset-password?token={token}` (already implemented, uses `python-emails` library)
7. Backend always returns "If that email is registered, we sent a password recovery link" (anti-enumeration, already implemented)
8. User clicks link in email, opens `/reset-password?token=xxx`
9. Frontend shows "New password" + "Confirm password" form
10. Frontend calls `POST /api/reset-password/` with `{ token, new_password }` (already implemented)
11. Backend verifies token, updates password, returns success (already implemented)
12. Frontend shows "Password updated" message with link to login

**What is missing (frontend only):**
- `/reset-password` page component (form + token extraction from URL params)
- "Forgot password?" link on login page
- Success/error states on both forms
- Rate limiting on the recovery endpoint (backend -- add `slowapi` or simple in-memory counter)

**Security details already handled:**
- Anti-enumeration: same response whether email exists or not
- Token expiry: configurable via `EMAIL_RESET_TOKEN_EXPIRE_HOURS`
- Token invalidation: JWT is single-use by nature (password change invalidates the claim)

**Email verification on signup (AUTH-08):**

This is NOT yet implemented. Recommended flow:

1. **On registration:** After creating the user, generate a verification token (JWT with email as subject, 24-hour expiry). Send verification email with link: `{FRONTEND_HOST}/verify-email?token={token}`

2. **User model change:** Add `email_verified: bool = False` to `User` table. Requires Alembic migration.

3. **Verification behavior -- use soft-gate, not hard-block:**
   - Let users log in and use the app immediately after signup (do not block login)
   - Show a persistent banner: "Please verify your email. [Resend verification email]"
   - Gate only sensitive actions behind verification: password reset will not work without a verified email (prevents account takeover via typo email)
   - After 7 days unverified, downgrade to read-only (can view sessions but not start new ones)
   - Rationale: Hard-blocking login on a self-hosted tool is hostile UX. The user just deployed this themselves. But soft-gating protects password reset integrity.

4. **Re-send option:** `POST /api/resend-verification` endpoint. Rate-limited to 1 per 5 minutes. Available from the banner and from Settings page.

5. **Verification endpoint:** `GET /api/verify-email?token={token}` -- verifies JWT, sets `email_verified = True`, redirects to app with success toast.

6. **Email template:** New `verify_email.html` template. Content: "Welcome to GSD Cloud. Click to verify your email address. Link expires in 24 hours."

**SMTP dependency:** Both AUTH-07 and AUTH-08 require working SMTP configuration. The `.env.example` already has SMTP variables. The `emails` library is already a dependency. For self-hosted users without SMTP: provide clear documentation that email features require SMTP config, and gracefully degrade (show "Email not configured" instead of crashing).

### 4. Redis Pub/Sub Multi-Worker Verification (SCAL-01)

**What needs verification:**
- The relay hub already uses Redis pub/sub via a broadcaster
- The question is: does it actually work with multiple Uvicorn workers?
- Specific scenarios to verify:
  1. Browser connects to worker A, node connects to worker B -- does a `stream` message reach the browser?
  2. Worker restart -- do WebSocket connections on surviving workers continue to receive messages?
  3. Message ordering preserved across pub/sub?

**Approach:** Add a `docker-compose.multiworker.yml` override that runs Uvicorn with `--workers 4`. Write integration tests that connect browser and node WebSockets and verify cross-worker relay.

### 5. "Deploy on New Node" Instructions Modal (UX-01)

**What makes deployment instructions excellent:**

1. **Context-aware:** The modal should pre-fill the relay URL and show the just-generated pairing token. Do not make the user copy values from one page to another.

2. **Step-by-step with copy buttons:**
   - Step 1: Download the daemon binary (show `curl` or `wget` command with correct OS/arch -- detect from browser User-Agent as a default, let user switch between Linux/macOS/ARM/x86)
   - Step 2: Run the install script (one-liner `bash` command with embedded token and relay URL)
   - Step 3: Verify connection (the modal should show a live status indicator -- "Waiting for node to connect..." that updates to "Connected" when the daemon's `hello` message arrives)

3. **What users need to know:**
   - Where to download the binary (GitHub release URL or self-hosted artifact)
   - What the pairing token is (one-time-use, ties this node to their account)
   - What the relay URL is (the WebSocket endpoint the daemon connects to)
   - Prerequisites: Go runtime NOT needed (it is a pre-compiled binary), Claude Code CLI must be installed on the node
   - Firewall: the daemon initiates outbound WebSocket connections only, no inbound ports needed

4. **UX flow:**
   - User clicks "Add Node" on Nodes page
   - Backend creates Node record, generates token, returns `NodePairResponse` (already implemented)
   - Modal appears with the instructions, token pre-filled
   - Token shown once with prominent "copy" button and warning: "This token is shown only once"
   - Live connection indicator at bottom of modal
   - "Done" button closes modal (available immediately, does not block on connection)

5. **Anti-pattern to avoid:** Do NOT show a wall of text. Use a numbered stepper with expandable details. Each step should be completable with a single copy-paste.

## Anti-Features

Features to explicitly NOT build in v1.1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Email-based notifications (email on permission request) | Slow delivery (seconds to minutes), not actionable (user must open browser anyway). Push notifications are the correct channel for time-sensitive events. | Web Push for urgent events. Email only for auth flows. |
| In-app notification preferences per event type | Over-engineering for v1.1. Two notification types (permission request + session complete) do not warrant a preference matrix. | Single toggle: push on/off. Add granular preferences if/when notification types grow beyond 5. |
| Token usage budgets/alerts | Useful eventually, but requires defining alert thresholds, notification channels, and "what happens when budget exceeded." Too much scope for v1.1. | Show usage data clearly. Let users self-regulate. Add budgets in v1.2. |
| OAuth/social login | Out of scope per PROJECT.md. Self-hosted single-tenant does not benefit from Google/GitHub auth. | Email/password is sufficient. |
| SMS verification | Requires Twilio or equivalent. Overkill for self-hosted tool. | Email verification only. |
| Push notification scheduling/batching | Premature optimization. GSD Cloud does not generate enough notifications to warrant batching. | Send immediately on trigger. |
| Automatic node binary updates | Complex update mechanism with rollback. Out of scope. | Show daemon version in node detail. User manually updates. |

## Feature Dependencies

```
BUG-01 (migrations)         --> No deps, do first
STUB-01 (Tauri stubs)       --> No deps, do early

AUTH-07 (password reset)     --> SMTP config working (already in .env.example)
                             --> Frontend /reset-password page (NEW)
                             --> "Forgot password?" link on login page (NEW)

AUTH-08 (email verification) --> AUTH-07 (same SMTP infra)
                             --> User model migration (email_verified column)
                             --> Verification email template (NEW)
                             --> Frontend /verify-email page (NEW)
                             --> Banner component for unverified state (NEW)

COST-01 (session usage)      --> taskComplete events in session_event (EXISTING)
                             --> Usage REST endpoint (NEW)
                             --> Session detail UI enhancement (NEW)

COST-02 (usage history)      --> COST-01
                             --> Usage dashboard page (NEW)
                             --> Aggregation queries (NEW)

NOTF-01 (push: permissions)  --> Service Worker registration (NEW)
                             --> VAPID key generation + env config (NEW)
                             --> PushSubscription table + CRUD (NEW)
                             --> pywebpush integration (NEW)
                             --> Push trigger logic in relay hub (NEW)
                             --> Settings page toggle (NEW)

NOTF-02 (push: completion)   --> NOTF-01 (all infrastructure)
                             --> Additional trigger on taskComplete (incremental)

SCAL-01 (Redis multi-worker) --> Redis already in docker-compose
                             --> Multi-worker Uvicorn config (NEW)
                             --> Integration test harness (NEW)

UX-01 (deploy modal)         --> Node pairing API (EXISTING)
                             --> Modal component (NEW)
                             --> Live connection status indicator (NEW)
```

## MVP Recommendation

**Phase 1 -- Fix and polish (do first, unblocks confidence):**
1. BUG-01: Migration fixes (blocks basic usage)
2. STUB-01: Tauri stub audit and replacement (blocks frontend completeness)

**Phase 2 -- Email auth (high value, low complexity, backend mostly done):**
3. AUTH-07: Password reset frontend (backend exists, just needs UI)
4. AUTH-08: Email verification (builds on same SMTP infra)

**Phase 3 -- Usage tracking (data exists, needs extraction and display):**
5. COST-01: Per-session usage display
6. COST-02: Usage history dashboard

**Phase 4 -- Push notifications (highest complexity, most moving parts):**
7. NOTF-01: Push for permission requests
8. NOTF-02: Push for session completions

**Phase 5 -- Scale and UX:**
9. UX-01: Deploy instructions modal
10. SCAL-01: Redis multi-worker verification

**Defer:** Token budgets/alerts, notification preferences matrix, OAuth login, SMS verification.

**Rationale for ordering:**
- Bugs/stubs first: cannot demo or test new features on a broken base
- Email auth second: password reset is table stakes and backend is 90% done -- fastest path to user-visible improvement
- Usage tracking third: data already exists in DB, pure extraction and display work, no new infrastructure
- Push notifications fourth: highest complexity, requires service worker, VAPID, new DB table, cross-browser testing. Needs the most time and the most stable base to build on.
- Deploy modal and multi-worker last: nice polish but not blocking core functionality

## Sources

- [Push Notifications in React PWAs](https://oneuptime.com/blog/post/2026-01-15-push-notifications-react-pwa/view)
- [PWA Push Reliability on iOS and Android](https://edana.ch/en/2026/03/19/push-notifications-on-web-applications-pwa-is-it-really-reliable-on-ios-and-android/)
- [MDN: Notifications and Push APIs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Re-engageable_Notifications_Push)
- [FastAPI + Web Push (VAPID)](https://medium.com/@kaushalsinh73/fastapi-web-push-vapid-real-time-notifications-without-vendor-lock-in-43540ec855f6)
- [pywebpush on PyPI](https://pypi.org/project/pywebpush/)
- [Password Reset Best Practices -- Postmark](https://postmarkapp.com/guides/password-reset-email-best-practices)
- [Secure Password Reset Tokens and Expiry](https://vjnvisakh.medium.com/secure-password-reset-tokens-expiry-and-system-design-best-practices-337c6161af5a)
- [2026 NIST Password Guidelines](https://scytale.ai/resources/2024-nist-password-guidelines-enhancing-security-practices/)
- [Email Verification UX -- SuperTokens](https://supertokens.medium.com/implementing-the-right-email-verification-flow-bba9283e1d63)
- [Email Verification During Signup](https://billionverify.com/en/blog/email-verification-during-signup)
- [Langfuse Token and Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
- [LLM Observability Tools 2026](https://www.braintrust.dev/articles/best-llm-monitoring-tools-2026)
- [fastapi-mail on PyPI](https://pypi.org/project/fastapi-mail/)
- [FastAPI Production Email Service](https://davidmuraya.com/blog/python-fastapi-production-email-service/)
