# Technology Stack -- v1.1 Additions

**Project:** GSD Cloud v1.1
**Researched:** 2026-04-11
**Scope:** New dependencies for PWA/Web Push, transactional email, token usage tracking, multi-worker Redis

## What Already Exists (DO NOT add again)

These are already in the stack and sufficient. Listed to prevent duplication:

| Capability | Already Have | Notes |
|------------|-------------|-------|
| SMTP email sending | `emails` lib + Jinja2 templates | `server/backend/app/utils.py` has `send_email()`, `generate_reset_password_email()`, `generate_password_reset_token()`, `verify_password_reset_token()` |
| Password reset flow | `/password-recovery/{email}` + `/reset-password/` routes | Already in `login.py`. Templates exist in `email-templates/build/reset_password.html` |
| Password reset token | PyJWT-based token generation/verification | Already implemented in `utils.py` |
| SMTP config | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS/SSL` | Already in `Settings` model |
| Charts library | `recharts ^2.15.0` | Already in frontend package.json -- use for usage history charts |
| Notification UI | `NotificationBell`, `NotificationPanel`, `NotificationItem` components | Already built, currently wired to Tauri stubs |
| Redis | `redis >=5.0.0,<8.0.0` | Already in pyproject.toml and docker-compose |
| Session events table | `SessionEvent` model with JSONB payload | Stores all session events including potential usage data |

## New Server Backend Dependencies

### Web Push Notifications

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pywebpush | >=2.3.0,<3.0.0 | Send push notifications to browser push endpoints | The standard Python Web Push library. Part of the `web-push-libs` organization (same org maintains the Node.js, Ruby, Java, and PHP equivalents). Handles VAPID authentication and payload encryption (aes128gcm per RFC 8188). Designated a PyPI Critical Project. Released Feb 2026, requires Python >=3.10 (matches our constraint). | HIGH |
| py-vapid | (transitive via pywebpush) | VAPID key generation and JWT claims | Installed automatically as a pywebpush dependency. Use `py_vapid.Vapid().generate_keys()` once to create the VAPID keypair, then store in env vars. | HIGH |

**How it works:**
1. Generate VAPID keypair once (store `VAPID_PRIVATE_KEY` and `VAPID_PUBLIC_KEY` in `.env`)
2. Frontend subscribes via Push API, sends `PushSubscription` JSON to backend
3. Backend stores subscription in a new `PushSubscription` table (per-user, per-device)
4. On events (permission request, session complete), backend calls `webpush(subscription_info, data, vapid_private_key, vapid_claims)` which encrypts and sends to the browser's push service endpoint

**Config additions to Settings:**
```python
VAPID_PRIVATE_KEY: str | None = None
VAPID_PUBLIC_KEY: str | None = None
VAPID_CLAIMS_EMAIL: str | None = None  # mailto: contact for push service
```

### Transactional Email

**No new dependencies needed.** The existing stack covers everything:

| Need | Already Have | Gap |
|------|-------------|-----|
| Send email | `emails` library | None |
| HTML templates | Jinja2 + MJML build pipeline | Need new `email_verification.mjml` template |
| Reset token generation | `generate_password_reset_token()` in utils.py | Reuse same pattern for verification tokens |
| Reset token verification | `verify_password_reset_token()` in utils.py | Reuse same pattern |
| SMTP transport | `send_email()` in utils.py | None |
| Config | SMTP settings in Settings | None |

**What to build (code, not deps):**
- New `generate_email_verification_token(email)` function (clone reset token pattern, different expiry)
- New `verify_email_verification_token(token)` function
- New `email_verification.mjml` / `email_verification.html` template
- New `email_verified: bool = False` field on User model + migration
- New `/verify-email?token=...` endpoint
- Modify registration to send verification email and set `email_verified=False`
- Guard login on `email_verified=True` (or allow login but restrict features)

**Why NOT fastapi-mail:** The project already has a working `emails` + Jinja2 email pipeline. `fastapi-mail` would add a parallel email system. The existing code in `utils.py` is 50 lines and works. Adding `fastapi-mail` creates two ways to send email.

### Token Usage Tracking

**No new dependencies needed.** The data already flows through the system:

| Data Point | Source | Where It Lands |
|------------|--------|---------------|
| `inputTokens` (int64) | `TaskDone` message in protocol-go `messages.go` | Arrives on node WebSocket, persisted as `SessionEvent` with JSONB payload |
| `outputTokens` (int64) | `TaskDone` message | Same |
| `costUsd` (string) | `TaskDone` message | Same |

**What to build (code, not deps):**
- New `SessionUsage` model: `session_id`, `input_tokens`, `output_tokens`, `cost_usd`, `recorded_at` -- denormalized from SessionEvent for fast queries
- Or: aggregate query against `session_event` table where `event_type = 'task_done'`, extracting from JSONB payload. Simpler, but slower for usage dashboards.
- **Recommendation:** Dedicated `SessionUsage` table. PostgreSQL JSONB aggregation is powerful but the usage dashboard will query across all sessions for a user -- a flat table with proper indexes is faster and simpler to query.
- New API endpoints: `GET /api/v1/usage/sessions/{session_id}`, `GET /api/v1/usage/nodes/{node_id}`, `GET /api/v1/usage/summary` (date range, totals)
- Relay handler: when processing `task_done` events, also upsert into `SessionUsage` table

## New Server Frontend Dependencies

### PWA / Service Worker

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| vite-plugin-pwa | >=1.0.0 | Service worker generation, PWA manifest, precaching | The standard Vite PWA plugin. Zero-config for basic PWA. Uses Workbox under the hood for precaching and runtime caching. Supports Vite 6 (`^3.1.0 \|\| ^4.0.0 \|\| ^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0` peer dep). Active maintenance, 3k+ GitHub stars. | HIGH |

**How it integrates:**
1. Add to `vite.config.ts` with `VitePWA()` plugin
2. Configure `manifest` for app name, icons, theme color
3. Use `injectManifest` strategy (not `generateSW`) because we need custom service worker logic for push event handling
4. Custom service worker handles `push` event to show notifications and `notificationclick` to route to the correct session/permission page
5. Plugin generates the manifest.json and handles precache manifest injection

**What NOT to add:**
- `workbox-cli` / `workbox-build` standalone: `vite-plugin-pwa` wraps Workbox internally
- `@nicolo-ribaudo/pwa` or other PWA helpers: unnecessary abstraction
- `web-push` (npm): that is the Node.js server-side library; our server is Python, frontend only needs the Push API

### Push Subscription Management

**No new npm dependencies needed.** The browser Push API and Service Worker API are built-in:

```typescript
// Subscribe to push (browser-native API)
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
});
// Send subscription to backend
await fetch('/api/v1/push/subscribe', {
  method: 'POST',
  body: JSON.stringify(subscription.toJSON())
});
```

**What to build (code, not deps):**
- `usePushSubscription()` hook: manages subscribe/unsubscribe, sends subscription to backend
- Replace `onNotificationNew` Tauri stub in `NotificationBell` with push-based invalidation
- Service worker `push` event handler: parse payload, call `self.registration.showNotification()`
- Service worker `notificationclick` handler: focus/open the app at the right URL

### Token Usage UI

**No new npm dependencies needed:**
- `recharts` already installed for charting
- `@tanstack/react-query` already installed for data fetching
- `date-fns` already installed for date formatting/grouping

**What to build (code, not deps):**
- `useSessionUsage(sessionId)` and `useNodeUsage(nodeId)` query hooks
- Usage summary card component (total tokens, total cost)
- Usage history chart (recharts BarChart or AreaChart, grouped by day/session)
- Usage detail table per session

## New Infrastructure

### Multi-Worker Redis Pub/Sub Verification

**No new services needed.** Redis is already in docker-compose.

**What to verify/build:**
- Uvicorn with `--workers N` (N > 1) + Redis pub/sub for WebSocket message fan-out
- The `ConnectionManager` already has Redis pub/sub wiring -- this is a testing/verification task, not a dependency task
- Load test with 2+ workers to confirm messages route correctly

### VAPID Key Generation (one-time setup)

```bash
# Generate VAPID keys (run once, store in .env)
python -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print('PRIVATE:', v.private_pem()); print('PUBLIC:', v.public_key)"
```

Or use the `openssl` approach (no Python dependency needed for generation):
```bash
openssl ecparam -genkey -name prime256v1 -out vapid_private.pem
openssl ec -in vapid_private.pem -pubout -out vapid_public.pem
```

## New Database Models

### PushSubscription (for Web Push)

```python
class PushSubscription(SQLModel, table=True):
    __tablename__ = "push_subscription"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    endpoint: str = Field(max_length=2048)  # Push service URL
    p256dh: str = Field(max_length=255)     # Client public key
    auth: str = Field(max_length=255)       # Auth secret
    created_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
```

### SessionUsage (for token tracking)

```python
class SessionUsage(SQLModel, table=True):
    __tablename__ = "session_usage"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="session.id", nullable=False, index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    node_id: uuid.UUID = Field(foreign_key="node.id", nullable=False, index=True)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    cost_usd: str = Field(default="0.00", max_length=20)  # String to match protocol format
    recorded_at: datetime | None = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
```

### User Model Addition

```python
# Add to existing User model:
email_verified: bool = Field(default=False)
```

## Installation Summary

### Server Backend (pyproject.toml addition)

```toml
# Add to dependencies list:
"pywebpush>=2.3.0,<3.0.0",
```

That is the ONLY new Python dependency. Everything else uses existing libraries.

### Server Frontend (package.json addition)

```bash
pnpm add vite-plugin-pwa
```

That is the ONLY new npm dependency. Everything else uses existing packages or browser-native APIs.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Web Push (Python) | pywebpush | Manual HTTP/aes128gcm | pywebpush handles encryption, VAPID JWT, and push service quirks. Rolling your own is error-prone (payload encryption alone is ~100 lines). |
| Web Push (Python) | pywebpush | django-webpush | Wrong framework -- we use FastAPI, not Django. |
| Email sending | Keep `emails` lib | fastapi-mail | Already have a working email pipeline. fastapi-mail would create a second email system. Zero benefit for the added complexity. |
| Email sending | Keep `emails` lib | Resend SDK | Resend is a hosted service. This is a self-hosted product -- users need SMTP, not a SaaS dependency. |
| PWA plugin | vite-plugin-pwa | Manual service worker + manifest | vite-plugin-pwa handles manifest generation, precache manifest injection, and dev mode service worker. Manual approach requires ~200 lines of build config for the same result. |
| PWA plugin | vite-plugin-pwa | @nicolo-ribaudo/pwa | Less mature, smaller community, fewer features. |
| Usage storage | Dedicated SessionUsage table | Query SessionEvent JSONB | JSONB aggregation across all sessions for usage dashboards will be slow without materialized views. Flat table with indexes is simpler and faster. |
| Usage storage | Dedicated SessionUsage table | Time-series DB (TimescaleDB) | Overkill. Usage events are low-volume (one per task completion). PostgreSQL handles this fine. |
| Push subscription mgmt | Browser-native Push API | push.js / web-push-notifications npm | Unnecessary abstraction over a simple API. The Push API is 10 lines of code. |

## Version Summary

| New Dependency | Version | Where | Upgrade Risk |
|---------------|---------|-------|-------------|
| pywebpush | >=2.3.0,<3.0.0 | pyproject.toml | Low -- stable, mature library |
| vite-plugin-pwa | >=1.0.0 | package.json | Low -- supports Vite 6, actively maintained |

**Total new dependencies: 2.** Everything else is built on existing stack.

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| pywebpush for Web Push | HIGH | Verified on PyPI: v2.3.0, Feb 2026, Python >=3.10. Standard library in the web-push-libs ecosystem. |
| vite-plugin-pwa for PWA | HIGH | Verified: supports Vite 6 peer dep. Active maintenance. Standard approach for Vite PWA. |
| No new email deps needed | HIGH | Verified: `emails` lib + Jinja2 + SMTP config + reset token utilities all present in codebase. |
| No new usage tracking deps | HIGH | Verified: `TaskDone` message already carries `inputTokens`, `outputTokens`, `costUsd` in protocol-go. SessionEvent table stores JSONB payloads. |
| Browser Push API (no npm pkg) | HIGH | Push API is a W3C standard, supported in all modern browsers. No wrapper library needed. |

## Sources

- [pywebpush on PyPI](https://pypi.org/project/pywebpush/) -- v2.3.0, Feb 2026
- [pywebpush GitHub](https://github.com/web-push-libs/pywebpush) -- web-push-libs org
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/) -- official docs
- [vite-plugin-pwa GitHub releases](https://github.com/vite-pwa/vite-plugin-pwa/releases) -- Vite 6 support in v0.21.1+
- [vite-plugin-pwa Vite 6 issue #800](https://github.com/vite-pwa/vite-plugin-pwa/issues/800) -- confirmed fixed
- [fastapi-mail on PyPI](https://pypi.org/project/fastapi-mail/) -- v1.6.2, considered and rejected
- [Push API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) -- browser-native, no npm package needed
