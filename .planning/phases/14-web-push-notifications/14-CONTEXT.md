# Phase 14: Web Push Notifications - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver OS-level push notifications so users can walk away from active Claude Code sessions and get alerted when Claude needs permission approval or a session finishes. Includes PWA installability for mobile home screen delivery.

</domain>

<decisions>
## Implementation Decisions

### Notification Content & Actions
- **D-01:** Permission request notifications show inline **Approve/Deny action buttons**. Service worker calls the backend API directly (no UI context). Tapping the notification body opens the app to the specific session (`/sessions/{id}`).
- **D-02:** Notification content is **distinct per event type**. `permissionRequest`: urgency-styled, title "Approval needed", body shows tool name + session/project name, warning icon. `taskComplete`: informational, title "Session finished", body shows project name + cost summary, check icon.
- **D-03:** Notifications use the `tag` field for deduplication (e.g., `session-abc-perm`, `session-abc-done`).
- **D-04:** After an Approve/Deny action button tap, the notification **auto-dismisses** on successful API call. On API error, show a brief replacement notification indicating failure.

### PWA & Installability
- **D-05:** **Full PWA** — web app manifest with icons (192x192, 512x512), `display: standalone`, service worker for push event handling + notification click routing + offline fallback page. No full offline cache (app requires server connection).
- **D-06:** **Active install prompt** — intercept `beforeinstallprompt` event and show a custom dismissible banner on first visit. Banner text: "Install GSD Cloud for push notifications". Dismissal stored in `localStorage`. Shows once.
- **D-07:** Banner appears at top or bottom of the app layout (researcher/planner decides exact placement).

### Settings & Opt-in UX
- **D-08:** Push notification controls live in a **new "Notifications" tab** in the Settings page, alongside existing General/Data/Logs tabs.
- **D-09:** **Per-type toggles**: master push toggle + sub-toggles for permission requests and session completions. Disabling master disables both sub-toggles.
- **D-10:** Enabling the master push toggle **immediately triggers** `Notification.requestPermission()`. If granted → subscribe and save subscription to server. If denied → revert toggle to OFF, show inline message explaining how to re-enable in browser settings.
- **D-11:** Per-type toggle preferences stored **server-side** on the `push_subscription` row (`notify_permissions`, `notify_completions` booleans). Server checks preferences before sending push.

### VAPID Keys & Subscription Storage
- **D-12:** VAPID key pair **auto-generated on first server boot** if `VAPID_PRIVATE_KEY` env var is missing. Written to `.env` file. Subsequent boots read from env vars. Docker Compose passes them via environment block.
- **D-13:** **One subscription per device per user**. Each browser/device gets its own `push_subscription` row. Notifications sent to all matching subscriptions. Expired/invalid subscriptions cleaned up on 410 response from push service.
- **D-14:** `push_subscription` table created in **this phase** (Phase 14) via Alembic migration, not Phase 11. Schema: `id` (UUID PK), `user_id` (UUID FK → user), `endpoint` (TEXT), `p256dh` (TEXT), `auth` (TEXT), `notify_permissions` (BOOL default true), `notify_completions` (BOOL default true), `created_at` (TIMESTAMPTZ).

### Claude's Discretion
- Offline fallback page design and content
- Exact placement of install banner (top vs bottom)
- Service worker caching strategy for the offline fallback
- PWA icon design (can use existing app icons or generate new ones)
- VAPID contact email value

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol & Wire Format
- `node/protocol-go/PROTOCOL.md` — Defines `permissionRequest` and `taskComplete` message types that trigger push notifications

### Backend Integration Points
- `server/backend/app/api/routes/ws_node.py` — Lines 69, 190-196, 258-300: where `permissionRequest` and `taskComplete` events are processed. Push notification dispatch hooks here.
- `server/backend/app/api/routes/sessions.py` — Session model and permission response endpoint (needed for service worker Approve/Deny API calls)
- `server/backend/app/models.py` — Existing models; `push_subscription` table to be added here

### Frontend Integration Points
- `server/frontend/src/pages/settings.tsx` — Settings page where Notifications tab will be added
- `server/frontend/src/lib/protocol.ts` — Frontend protocol types
- `server/frontend/src/hooks/use-cloud-session.ts` — Cloud session hook (context for notification routing)

### Requirements
- `.planning/PROJECT.md` §Active (v1.1) — NOTF-01, NOTF-02 requirement definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Settings page tab structure** (`settings.tsx`): Already uses Radix Tabs with General/Data/Logs pattern. New Notifications tab follows same pattern.
- **SettingsField component** (`settings.tsx`): Switch-based toggle component with title/description. Reuse for push toggle and per-type sub-toggles.
- **In-app notification system** (`notifications.tsx`, `components/notifications/`): Separate concern from OS push — no conflict, but Bell icon in nav already exists.
- **Radix UI primitives**: Switch, Tabs, Card, Badge all available for settings UI.

### Established Patterns
- **ws_node.py event dispatch**: `permissionRequest` and `taskComplete` already handled with broadcast pattern. Push notification dispatch follows same hook point.
- **Alembic migrations**: Existing migration chain in `server/backend/app/alembic/versions/`. New push_subscription migration follows same pattern.
- **SQLModel table models**: All models in single `models.py` file. PushSubscription model goes here.
- **Cookie auth (httpOnly JWT)**: Service worker cannot access httpOnly cookies for API calls — will need a separate auth mechanism (e.g., store a token in service worker scope via `postMessage`, or use a short-lived token in the push payload).

### Integration Points
- **ws_node.py lines 190-300**: After broadcasting to browser channel, add push notification dispatch for backgrounded users
- **Settings page**: Add Notifications tab to existing TabsList
- **Vite config**: No PWA plugin currently — service worker and manifest are net-new additions
- **Docker Compose**: Add VAPID env vars to backend service environment block
- **Nginx config**: May need to serve manifest.webmanifest and service worker with correct headers

</code_context>

<specifics>
## Specific Ideas

- Permission request notification: title "Approval needed", body "{toolName} on {projectName}", warning icon, Approve/Deny action buttons
- Task complete notification: title "Session finished", body "{projectName} · ${costUsd}", check icon
- Install banner: dismissible, shows on first visit, text "Install GSD Cloud for push notifications" with [Install] and [Dismiss] buttons
- Settings Notifications tab layout: master toggle at top, per-type toggles indented below, browser permission status indicator at bottom

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-web-push-notifications*
*Context gathered: 2026-04-13*
