# Phase 14: Web Push Notifications - Research

**Researched:** 2026-04-13
**Domain:** Web Push API, PWA, Service Workers, VAPID, pywebpush
**Confidence:** HIGH

## Summary

This phase adds OS-level push notifications so users can walk away from active Claude Code sessions and receive alerts when permission approval is needed or a session completes. The implementation spans three layers: (1) a Python backend that generates VAPID keys, stores push subscriptions, and dispatches push messages via `pywebpush`, (2) a service worker that receives push events, renders notifications with action buttons, and handles click/action routing, and (3) frontend UI for opt-in settings, browser permission prompts, and a PWA install banner.

The critical architectural challenge is **service worker authentication**: the app uses httpOnly JWT cookies (set in `login.py` line 66), which service workers cannot access. The Approve/Deny action buttons on permission request notifications (D-01) must call a REST API endpoint, but no such endpoint exists today -- permission responses currently flow only through the browser WebSocket (`ws_browser.py` line 129). A new REST endpoint is needed, and the service worker needs an auth token delivered via `postMessage` or embedded in the push payload.

**Primary recommendation:** Use `pywebpush` 2.3.x for server-side push dispatch, hand-write the service worker (no Workbox -- scope is minimal), create a new REST endpoint for permission responses from service worker context, and deliver a short-lived JWT in the push payload for service worker auth.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Permission request notifications show inline Approve/Deny action buttons. Service worker calls the backend API directly (no UI context). Tapping the notification body opens the app to the specific session (`/sessions/{id}`).
- **D-02:** Notification content is distinct per event type. `permissionRequest`: urgency-styled, title "Approval needed", body shows tool name + session/project name, warning icon. `taskComplete`: informational, title "Session finished", body shows project name + cost summary, check icon.
- **D-03:** Notifications use the `tag` field for deduplication (e.g., `session-abc-perm`, `session-abc-done`).
- **D-04:** After an Approve/Deny action button tap, the notification auto-dismisses on successful API call. On API error, show a brief replacement notification indicating failure.
- **D-05:** Full PWA -- web app manifest with icons (192x192, 512x512), `display: standalone`, service worker for push event handling + notification click routing + offline fallback page. No full offline cache.
- **D-06:** Active install prompt -- intercept `beforeinstallprompt` event and show a custom dismissible banner on first visit. Banner text: "Install GSD Cloud for push notifications". Dismissal stored in `localStorage`. Shows once.
- **D-07:** Banner appears at top or bottom of the app layout.
- **D-08:** Push notification controls live in a new "Notifications" tab in the Settings page, alongside existing tabs.
- **D-09:** Per-type toggles: master push toggle + sub-toggles for permission requests and session completions. Disabling master disables both sub-toggles.
- **D-10:** Enabling the master push toggle immediately triggers `Notification.requestPermission()`. If granted, subscribe and save subscription to server. If denied, revert toggle to OFF, show inline message.
- **D-11:** Per-type toggle preferences stored server-side on the `push_subscription` row (`notify_permissions`, `notify_completions` booleans). Server checks preferences before sending push.
- **D-12:** VAPID key pair auto-generated on first server boot if `VAPID_PRIVATE_KEY` env var is missing. Written to `.env` file. Subsequent boots read from env vars.
- **D-13:** One subscription per device per user. Each browser/device gets its own `push_subscription` row. Expired/invalid subscriptions cleaned up on 410 response.
- **D-14:** `push_subscription` table created in this phase via Alembic migration. Schema: `id` (UUID PK), `user_id` (UUID FK), `endpoint` (TEXT), `p256dh` (TEXT), `auth` (TEXT), `notify_permissions` (BOOL default true), `notify_completions` (BOOL default true), `created_at` (TIMESTAMPTZ).

### Claude's Discretion
- Offline fallback page design and content
- Exact placement of install banner (top vs bottom)
- Service worker caching strategy for the offline fallback
- PWA icon design (can use existing app icons or generate new ones)
- VAPID contact email value

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTF-01 | User receives push notification (PWA/Web Push) when a permission request arrives | pywebpush dispatch from ws_node.py permissionRequest handler; service worker push event + showNotification with action buttons |
| NOTF-02 | User receives push notification when a long-running session completes | pywebpush dispatch from ws_node.py taskComplete handler; service worker push event + showNotification |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pywebpush | 2.3.x | Server-side Web Push message encryption and delivery | Standard Python Web Push library from web-push-libs org. Handles VAPID signing, payload encryption (aes128gcm), and HTTP POST to push endpoints. [VERIFIED: locally installed 2.3.0, PyPI confirms latest] |
| py-vapid | (dep of pywebpush) | VAPID key generation and JWT claims | Bundled dependency. Provides `Vapid().generate_keys()` for auto-generation on first boot. [VERIFIED: transitive dependency of pywebpush] |
| Native Service Worker API | (browser built-in) | Push event reception, notification display, click handling | No library needed. Service worker is a single TypeScript file compiled separately. [CITED: MDN Web APIs] |
| Web App Manifest | (browser built-in) | PWA installability, home screen icon, standalone display | JSON file served at `/manifest.webmanifest`. Required fields: name, short_name, start_url, display, icons. [CITED: Chrome Lighthouse PWA requirements] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cryptography | (dep of pywebpush) | EC key operations for VAPID | Already a transitive dependency. No direct usage needed. [VERIFIED: pywebpush dependency] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pywebpush | webpush (PyPI) | Newer library with async support built-in, but less mature. pywebpush is the canonical web-push-libs implementation. |
| Hand-written service worker | Workbox (Google) | Workbox adds caching strategies and push helpers, but is overkill for a single offline fallback page + push handler. Adds build complexity. |
| vite-plugin-pwa | Manual manifest + SW | Plugin auto-generates manifest and SW registration, but fights our need for a custom push handler with action button logic. Manual approach gives full control. |

**Installation:**
```bash
# Backend -- add to pyproject.toml dependencies
pip install pywebpush>=2.3.0,<3.0.0
```

No frontend npm packages needed. Service worker and manifest are hand-written.

## Architecture Patterns

### Recommended Project Structure

```
server/backend/app/
  api/routes/
    push.py              # REST endpoints: subscribe, unsubscribe, update prefs, permission-respond
  core/
    config.py            # Add VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_CONTACT_EMAIL
    push.py              # VAPID key auto-gen on boot, send_push() helper
  models.py              # PushSubscription table model

server/frontend/
  public/
    manifest.webmanifest # PWA manifest
    sw.js                # Service worker (plain JS, not bundled by Vite)
    offline.html         # Offline fallback page
    icons/
      icon-192.png       # PWA icon 192x192
      icon-512.png       # PWA icon 512x512
  src/
    hooks/
      use-push-notifications.ts  # Subscribe/unsubscribe logic, permission handling
      use-install-prompt.ts      # beforeinstallprompt interception
    components/
      install-banner.tsx          # PWA install prompt banner
    pages/
      settings.tsx               # Extend Notifications tab with push toggles
  index.html                     # Add <link rel="manifest">
```

### Pattern 1: Push Dispatch from WebSocket Handler

**What:** When ws_node.py processes a `permissionRequest` or `taskComplete` event, it dispatches a push notification to all of the user's subscriptions in a background task.
**When to use:** Every time these events arrive from a node daemon.
**Example:**
```python
# In ws_node.py, after broadcasting to browser channel:
from app.core.push import send_push_to_user

# Use asyncio.create_task so WS handler is not blocked
if msg_type == "permissionRequest":
    asyncio.create_task(send_push_to_user(
        user_id=user_id,
        event_type="permissionRequest",
        payload={
            "sessionId": session_id,
            "toolName": msg.get("toolName", ""),
            "requestId": msg.get("requestId", ""),
            "projectName": "...",  # lookup from session -> project
        }
    ))
elif msg_type == "taskComplete":
    asyncio.create_task(send_push_to_user(
        user_id=user_id,
        event_type="taskComplete",
        payload={
            "sessionId": session_id,
            "costUsd": msg.get("costUsd", "0"),
            "projectName": "...",
        }
    ))
```
Source: [VERIFIED: ws_node.py lines 190-300 existing event dispatch pattern]

### Pattern 2: Service Worker Auth via Push Payload Token

**What:** The push payload includes a short-lived JWT token that the service worker uses for REST API calls (Approve/Deny). This avoids the httpOnly cookie problem.
**When to use:** Every push notification that may require a service worker API call.
**Example:**
```python
# In core/push.py send_push_to_user():
from app.core.security import create_access_token
from datetime import timedelta

# Generate a 5-minute token scoped to this action
action_token = create_access_token(
    subject=user_id,
    expires_delta=timedelta(minutes=5),
)
push_data = {
    "type": event_type,
    "token": action_token,  # SW uses this for API auth
    ...payload,
}
```
```javascript
// In sw.js push event handler:
self.addEventListener('push', (event) => {
  const data = event.data.json();
  // Store token for action button use
  self._pushTokens = self._pushTokens || {};
  self._pushTokens[data.requestId] = data.token;
  // ... showNotification
});
```
Source: [VERIFIED: login.py confirms httpOnly cookie pattern; CITED: CONTEXT.md code_context notes this gap]

### Pattern 3: REST Endpoint for Service Worker Permission Response

**What:** New POST endpoint `/api/v1/push/respond` that accepts a permission response from the service worker, authenticates via Bearer token from push payload, and routes to the correct node via ConnectionManager.
**When to use:** When user taps Approve/Deny action button on a push notification.
**Example:**
```python
# In api/routes/push.py
@router.post("/respond")
async def push_permission_respond(
    body: PushPermissionResponse,
    current_user: CurrentUser,
):
    """Service worker calls this with the token from push payload."""
    machine_id = manager.get_node_for_session(body.session_id)
    if not machine_id:
        raise HTTPException(404, "Session not connected")
    msg = {
        "type": "permissionResponse",
        "sessionId": body.session_id,
        "requestId": body.request_id,
        "approved": body.approved,
    }
    sent = await manager.send_to_node(machine_id, msg)
    if not sent:
        raise HTTPException(502, "Node not connected")
    return {"status": "sent"}
```
Source: [VERIFIED: ws_browser.py lines 129-137 show existing WS-based permission response flow; connection_manager.py confirms send_to_node and get_node_for_session methods]

### Pattern 4: Service Worker as Standalone JS File

**What:** The service worker lives in `public/sw.js` as plain JavaScript (not TypeScript, not bundled by Vite). Vite serves files in `public/` as-is at the root URL.
**When to use:** Always for this project. Service workers must be served from the root scope.
**Why:** Service workers cannot be ES modules in all browsers yet. Vite's bundler does not process `public/` files. The SW needs root scope (`/sw.js`) to intercept all routes.
Source: [VERIFIED: vite.config.ts confirms `public/` directory convention; CITED: Vite docs -- public directory served as-is]

### Anti-Patterns to Avoid
- **Bundling service worker with Vite:** SW must be a standalone file at root scope. Do not import it or add it to the Vite entry points.
- **Using Socket.IO or WebSocket from service worker:** Service workers cannot maintain long-lived WebSocket connections. Use REST API calls with short-lived tokens.
- **Sending push from the WebSocket handler synchronously:** pywebpush makes an HTTP call to the push endpoint (Google/Mozilla servers). This MUST be done in a background task (`asyncio.create_task`) or it will block the WS message loop.
- **Storing VAPID private key in source code or git:** Key must be in `.env` only. Auto-generation writes to `.env`, Docker Compose passes via environment block.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web Push encryption (aes128gcm + VAPID) | Custom encryption | pywebpush | RFC 8291 + RFC 8188 + RFC 8292 compliance. Cryptographic edge cases. |
| VAPID key generation | Manual EC key generation | py-vapid (via pywebpush) | P-256 curve key pair generation with proper encoding. |
| Push subscription management | Custom subscription protocol | Browser PushManager API | `navigator.serviceWorker.ready.then(r => r.pushManager.subscribe())` handles everything. |
| PWA installability detection | Custom heuristics | `beforeinstallprompt` event | Browser-native event fired when installability criteria are met. |

**Key insight:** The Web Push protocol is a stack of three RFCs (encryption, content encoding, VAPID auth). pywebpush handles all three. Rolling any of this by hand would be a multi-week effort with security implications.

## Common Pitfalls

### Pitfall 1: Service Worker Scope and Registration Path
**What goes wrong:** Service worker registered from a nested path (e.g., `/src/sw.js`) cannot intercept root-level navigations or receive push events for the whole app.
**Why it happens:** SW scope is limited to its own directory and below.
**How to avoid:** Place `sw.js` in `public/` so Vite serves it at `/sw.js`. Register with `navigator.serviceWorker.register('/sw.js')`.
**Warning signs:** Push events not firing; `navigator.serviceWorker.ready` never resolves.

### Pitfall 2: httpOnly Cookie Inaccessible from Service Worker
**What goes wrong:** Service worker tries to call API with `credentials: 'include'` but httpOnly cookies are not sent from service worker `fetch()` in all contexts (especially notification action handlers where there is no window).
**Why it happens:** Service worker `notificationclick` event runs in a windowless context. Cookie behavior varies by browser.
**How to avoid:** Include a short-lived JWT in the push payload. Service worker uses `Authorization: Bearer <token>` header for API calls. The existing `CurrentUser` dependency already falls back to Authorization header (confirmed in login.py).
**Warning signs:** 401 errors from service worker API calls; works in some browsers but not others.

### Pitfall 3: VAPID Key Format Mismatch
**What goes wrong:** Server generates VAPID keys but frontend `applicationServerKey` in `pushManager.subscribe()` expects URL-safe base64 without padding, while pywebpush may output standard base64.
**Why it happens:** Different parts of the stack expect different encodings of the same P-256 public key.
**How to avoid:** Use py-vapid's built-in encoding. Expose public key via a GET endpoint (e.g., `/api/v1/push/vapid-key`) that returns the URL-safe base64 string. Frontend passes it directly to `pushManager.subscribe({ applicationServerKey })`.
**Warning signs:** `DOMException: Registration failed - push service error` on subscribe.

### Pitfall 4: Push Subscription Endpoint Expiry (410 Gone)
**What goes wrong:** Push service returns 410 for expired subscriptions. If not handled, server keeps trying to send to dead endpoints.
**Why it happens:** Subscriptions expire when the browser clears data, the user uninstalls the PWA, or the push service rotates endpoints.
**How to avoid:** Catch 410 responses in `send_push_to_user()` and delete the corresponding `push_subscription` row. pywebpush raises `WebPushException` with response code.
**Warning signs:** Growing error rate in push dispatch; wasted server resources.

### Pitfall 5: Notification Not Shown -- Missing event.waitUntil()
**What goes wrong:** Push event handler returns before `showNotification()` resolves. Browser kills the service worker, notification never appears.
**Why it happens:** Service worker lifecycle -- browser can terminate SW at any time after event handler returns.
**How to avoid:** Always wrap async work in `event.waitUntil(promise)`.
**Warning signs:** Intermittent missing notifications; works in dev (SW stays alive longer).

### Pitfall 6: Vite Dev Server Does Not Serve Service Worker Correctly
**What goes wrong:** During development, service worker caching or stale SW versions cause confusion.
**Why it happens:** Vite HMR and the service worker lifecycle interact poorly. SW updates require explicit `skipWaiting()` or manual unregister.
**How to avoid:** During development, register SW only in production mode, or include `self.skipWaiting()` in the SW install event. Add a version constant to SW so changes trigger updates.
**Warning signs:** Code changes not reflected; old notifications appearing.

## Code Examples

### Service Worker Push Event Handler
```javascript
// public/sw.js
// Source: MDN ServiceWorkerGlobalScope push event + notificationclick event

const ACTIONS_APPROVE_DENY = [
  { action: 'approve', title: 'Approve' },
  { action: 'deny', title: 'Deny' },
];

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  // Store auth token for action button API calls
  self._pushTokens = self._pushTokens || {};
  if (data.requestId && data.token) {
    self._pushTokens[data.requestId] = data.token;
  }

  let options = {};
  if (data.type === 'permissionRequest') {
    options = {
      body: `${data.toolName} on ${data.projectName}`,
      tag: `session-${data.sessionId}-perm`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { type: data.type, sessionId: data.sessionId, requestId: data.requestId },
      actions: ACTIONS_APPROVE_DENY,
      requireInteraction: true,
    };
    event.waitUntil(self.registration.showNotification('Approval needed', options));
  } else if (data.type === 'taskComplete') {
    options = {
      body: `${data.projectName} · $${data.costUsd}`,
      tag: `session-${data.sessionId}-done`,
      icon: '/icons/icon-192.png',
      data: { type: data.type, sessionId: data.sessionId },
    };
    event.waitUntil(self.registration.showNotification('Session finished', options));
  }
});

self.addEventListener('notificationclick', (event) => {
  const { action } = event;
  const { type, sessionId, requestId } = event.notification.data;
  event.notification.close();

  if (type === 'permissionRequest' && (action === 'approve' || action === 'deny')) {
    const token = (self._pushTokens || {})[requestId];
    event.waitUntil(
      fetch('/api/v1/push/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          request_id: requestId,
          approved: action === 'approve',
        }),
      }).then((res) => {
        if (!res.ok) {
          return self.registration.showNotification('Action failed', {
            body: 'Could not send response. Open the app to retry.',
            tag: `session-${sessionId}-error`,
          });
        }
        // Clean up stored token
        delete (self._pushTokens || {})[requestId];
      })
    );
  } else {
    // Open app to session page
    event.waitUntil(
      clients.openWindow(`/sessions/${sessionId}`)
    );
  }
});

// Offline fallback
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    );
  }
});

self.addEventListener('install', () => {
  self.skipWaiting();
  caches.open('offline-v1').then((cache) => cache.add('/offline.html'));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
```
Source: [CITED: MDN push event, notificationclick event, showNotification()]

### VAPID Key Auto-Generation
```python
# server/backend/app/core/push.py
# Source: pywebpush README + py-vapid docs

import json
import logging
from pathlib import Path
from py_vapid import Vapid

from app.core.config import settings

logger = logging.getLogger(__name__)

def ensure_vapid_keys() -> tuple[str, str]:
    """Return (private_key_b64, public_key_b64). Generate if missing."""
    if settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY:
        return settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY

    logger.warning("VAPID keys not found in env. Generating new key pair...")
    vapid = Vapid()
    vapid.generate_keys()
    private_raw = vapid.private_pem()
    public_raw = vapid.public_key_urlsafe_base64()

    # Write to .env file so subsequent boots use the same keys
    env_path = Path(settings.model_config.get("env_file", "../.env"))
    with open(env_path, "a") as f:
        f.write(f"\nVAPID_PRIVATE_KEY={private_raw}\n")
        f.write(f"VAPID_PUBLIC_KEY={public_raw}\n")

    return private_raw, public_raw
```
Source: [VERIFIED: pywebpush GitHub README; VERIFIED: config.py reads from ../.env]

### Push Subscription API
```python
# server/backend/app/api/routes/push.py
from fastapi import APIRouter, HTTPException
from sqlmodel import Session as DBSession, select
from app.api.deps import CurrentUser, SessionDep
from app.models import PushSubscription

router = APIRouter()

@router.post("/subscribe")
def subscribe(
    body: PushSubscribeRequest,
    session: SessionDep,
    current_user: CurrentUser,
):
    # Upsert: if same endpoint exists for user, update keys
    existing = session.exec(
        select(PushSubscription)
        .where(PushSubscription.user_id == current_user.id)
        .where(PushSubscription.endpoint == body.endpoint)
    ).first()
    if existing:
        existing.p256dh = body.p256dh
        existing.auth = body.auth
        session.add(existing)
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.p256dh,
            auth=body.auth,
        )
        session.add(sub)
    session.commit()
    return {"status": "subscribed"}
```
Source: [VERIFIED: existing CRUD patterns in models.py and sessions.py]

### Frontend Push Subscription Hook
```typescript
// src/hooks/use-push-notifications.ts
export function usePushNotifications() {
  const subscribe = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { granted: false };

    const reg = await navigator.serviceWorker.ready;
    const vapidKey = await fetch('/api/v1/push/vapid-key').then(r => r.text());

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    const { endpoint, keys } = sub.toJSON();
    await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        endpoint,
        p256dh: keys?.p256dh,
        auth: keys?.auth,
      }),
    });
    return { granted: true };
  };

  return { subscribe };
}
```
Source: [CITED: MDN PushManager.subscribe()]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GCM (Google Cloud Messaging) | FCM / Web Push Protocol (RFC 8030) | 2019 | pywebpush handles RFC 8030 natively; no GCM setup needed |
| aesgcm content encoding | aes128gcm (RFC 8188) | 2020 | pywebpush defaults to aes128gcm; no config needed |
| SW required for PWA install | Manifest-only install (Chrome/Edge) | 2023+ | SW still needed for push events, but install works without fetch handler |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | py-vapid's `generate_keys()` outputs format compatible with both pywebpush and browser `applicationServerKey` | Code Examples | Would need manual key format conversion; medium risk |
| A2 | Service worker `fetch()` with `Authorization` header works reliably in `notificationclick` handler across Chrome, Safari, Firefox | Pitfalls | Would need alternative auth mechanism; high risk |
| A3 | pywebpush 2.3.x is compatible with Python 3.10+ and all current push service endpoints (Google, Apple, Mozilla) | Standard Stack | Would need alternative library; medium risk |
| A4 | `self.skipWaiting()` in install event is acceptable for this app (no complex caching to invalidate) | Code Examples | Could cause unexpected behavior with stale cached offline page; low risk |

## Open Questions

1. **Project name in notification body**
   - What we know: `permissionRequest` messages contain `toolName` and `sessionId`, but not project name directly
   - What's unclear: How to resolve session -> project name for notification body text
   - Recommendation: Join `SessionModel` -> `Project` table by `node_id + cwd` match, or add project_name to the push payload lookup

2. **VAPID contact email value**
   - What we know: VAPID claims require a `sub` (subject) field with a `mailto:` or `https:` URL
   - What's unclear: What email to use (user-configurable? hardcoded?)
   - Recommendation: Use `settings.EMAILS_FROM_EMAIL` or `settings.FIRST_SUPERUSER` as default; make it configurable via `VAPID_CONTACT_EMAIL` env var

3. **Safari/iOS push support**
   - What we know: Safari 16.4+ supports Web Push on iOS (since March 2023). Requires PWA to be installed to home screen.
   - What's unclear: Whether Safari supports notification action buttons (Approve/Deny)
   - Recommendation: Implement action buttons; fall back gracefully if `actions` not supported (user taps notification body to open app)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pywebpush | Push dispatch | Needs install | 2.3.0 (PyPI) | None -- required |
| Redis | Pub/sub (existing) | Already in docker-compose.yml | 7.x | In-memory for single worker |
| PostgreSQL | push_subscription table | Already running | 18 | None -- required |
| Alembic | Migration | Already in pyproject.toml | >=1.12.1 | None -- required |

**Missing dependencies with no fallback:**
- `pywebpush` must be added to `pyproject.toml` dependencies

**Missing dependencies with fallback:**
- None

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 7.x (backend), vitest 4.x (frontend) |
| Config file | `server/backend/pyproject.toml`, `server/frontend/vite.config.ts` |
| Quick run command | `cd server/backend && python -m pytest tests/ -x -q` |
| Full suite command | `cd server/backend && python -m pytest tests/ -v` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTF-01 | Push sent on permissionRequest event | unit | `pytest tests/test_push.py::test_push_on_permission_request -x` | Wave 0 |
| NOTF-01 | Service worker shows notification with action buttons | manual-only | N/A (browser required) | N/A |
| NOTF-01 | Approve/Deny action calls REST API | unit | `pytest tests/api/routes/test_push.py::test_permission_respond -x` | Wave 0 |
| NOTF-02 | Push sent on taskComplete event | unit | `pytest tests/test_push.py::test_push_on_task_complete -x` | Wave 0 |
| NOTF-02 | Notification preferences respected | unit | `pytest tests/test_push.py::test_preferences_filter -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/ -x -q`
- **Per wave merge:** Full backend + frontend lint
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_push.py` -- push dispatch unit tests (mock pywebpush)
- [ ] `tests/api/routes/test_push.py` -- subscribe/unsubscribe/respond endpoint tests
- [ ] `pywebpush` added to pyproject.toml dependencies

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Short-lived JWT in push payload for SW auth; existing CurrentUser dep for REST endpoints |
| V3 Session Management | no | Push subscriptions are device-level, not session-level |
| V4 Access Control | yes | push_subscription rows scoped to user_id; respond endpoint verifies user owns session |
| V5 Input Validation | yes | Pydantic models for all push API request bodies |
| V6 Cryptography | yes | pywebpush handles RFC 8291 encryption; VAPID keys via py-vapid (never hand-rolled) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Push payload token theft | Information Disclosure | 5-minute expiry on action tokens; single-use if possible |
| Subscription endpoint abuse | Denial of Service | Rate limit push dispatch; one subscription per device per user (D-13) |
| VAPID private key leak | Spoofing | Key in .env only; never in source; Docker Compose env block |
| Unauthorized permission response | Elevation of Privilege | Respond endpoint validates JWT user_id matches session owner |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: ws_node.py] -- lines 190-300 permissionRequest/taskComplete event handlers
- [VERIFIED: ws_browser.py] -- lines 129-137 permission response forwarding via WebSocket
- [VERIFIED: connection_manager.py] -- `send_to_node`, `get_node_for_session` methods
- [VERIFIED: models.py] -- existing table patterns for PushSubscription model
- [VERIFIED: login.py line 66] -- httpOnly cookie confirms SW auth gap
- [VERIFIED: config.py line 59] -- existing REDIS_URL pattern for adding VAPID env vars
- [VERIFIED: vite.config.ts] -- public directory and build config
- [VERIFIED: settings.tsx] -- existing Notifications tab with SettingsField component pattern
- [VERIFIED: nginx.conf] -- reverse proxy config for /api/ and /ws/ routing
- [VERIFIED: docker-compose.yml] -- backend environment block for adding VAPID vars
- [VERIFIED: pywebpush 2.3.0 on PyPI] -- current version confirmed

### Secondary (MEDIUM confidence)
- [CITED: MDN ServiceWorkerGlobalScope push event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event)
- [CITED: MDN showNotification()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
- [CITED: MDN NotificationEvent action](https://developer.mozilla.org/en-US/docs/Web/API/NotificationEvent/action)
- [CITED: MDN notificationclick event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event)
- [CITED: MDN Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [CITED: Chrome Lighthouse installable manifest](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest)
- [CITED: pywebpush GitHub README](https://github.com/web-push-libs/pywebpush/blob/main/README.md)
- [CITED: pywebpush PyPI](https://pypi.org/project/pywebpush/)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- pywebpush is the canonical Python web push library, verified on PyPI
- Architecture: HIGH -- all integration points verified in existing codebase
- Pitfalls: HIGH -- httpOnly cookie gap confirmed in code; SW scope rules well-documented
- Service worker action button cross-browser: MEDIUM -- Chrome/Edge confirmed, Safari support for actions unclear

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable domain; Web Push API is mature)
