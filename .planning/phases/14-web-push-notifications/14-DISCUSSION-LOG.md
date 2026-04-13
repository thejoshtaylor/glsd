# Phase 14: Web Push Notifications - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 14-web-push-notifications
**Areas discussed:** Notification content & actions, PWA & installability scope, Settings & opt-in UX, VAPID keys & subscription storage

---

## Notification Content & Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Tap to open app | Notification shows tool name and session info. Tapping opens the app to the session where the permission modal is waiting. | |
| Approve/Deny action buttons | Notification has inline Approve and Deny buttons. Service worker calls the backend API directly. | ✓ |

**User's choice:** Approve/Deny action buttons
**Notes:** Service worker needs auth mechanism to call backend API without UI context.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, distinct content | permissionRequest: urgency-styled with tool name. taskComplete: informational with session name + cost. Different icons/badges. | ✓ |
| Same template, different text | Single notification template for both. Title always 'GSD Cloud'. Body varies. | |

**User's choice:** Yes, distinct content

| Option | Description | Selected |
|--------|-------------|----------|
| Open to session | Tapping notification body navigates to /sessions/{id} | ✓ |
| Open to dashboard | Tapping always opens the main dashboard | |

**User's choice:** Open to session

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, close on action | Service worker closes notification after successful API call. Brief replacement on error. | ✓ |
| Keep until manually dismissed | Notification stays after action. User must swipe away. | |

**User's choice:** Yes, close on action

---

## PWA & Installability Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full PWA | Manifest with icons, install prompt, service worker for push + offline fallback. No full offline cache. | ✓ |
| Minimal SW for push only | Service worker for push only. No manifest, no install prompt, no offline shell. | |
| Full PWA + offline cache | Everything in Full PWA plus Workbox caching for app shell. | |

**User's choice:** Full PWA

| Option | Description | Selected |
|--------|-------------|----------|
| Passive availability | Manifest makes it installable. Browser shows native install UI. No custom banner. | |
| Active install prompt | Intercept beforeinstallprompt and show custom banner. | ✓ |
| You decide | Claude picks the approach. | |

**User's choice:** Active install prompt

| Option | Description | Selected |
|--------|-------------|----------|
| Banner on first visit | Dismissible banner at top/bottom on first visit. Shows once, respects dismissal via localStorage. | ✓ |
| In settings only | Install button in Notifications settings section. | |
| After enabling push | Show install prompt immediately after user enables push in settings. | |

**User's choice:** Banner on first visit

---

## Settings & Opt-in UX

| Option | Description | Selected |
|--------|-------------|----------|
| New Notifications tab | Dedicated tab in Settings page. Houses push toggle, per-type controls, permission status. | ✓ |
| Within existing General tab | Add Notifications section inside General tab. | |
| Standalone page | Separate /settings/notifications route. | |

**User's choice:** New Notifications tab

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, per-type toggles | Master push toggle + sub-toggles for permission requests and session completions. | ✓ |
| Single toggle for all | One switch: push on or off for both types. | |

**User's choice:** Yes, per-type toggles

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger browser prompt immediately | Flipping toggle triggers requestPermission(). Granted → subscribe. Denied → revert toggle, inline message. | ✓ |
| Explain first, then prompt | Show explanation dialog before triggering browser prompt. | |
| You decide | Claude picks. | |

**User's choice:** Trigger browser prompt immediately

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side on subscription | Store preferences on push_subscription row. Server checks before sending. | ✓ |
| Client-side localStorage | Store in browser localStorage. Service worker checks before showing. | |

**User's choice:** Server-side on subscription

---

## VAPID Keys & Subscription Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate on first start | Server generates VAPID keypair on first boot if missing. Writes to .env. | ✓ |
| Manual generation via CLI | CLI command generates keys. User pastes into .env. | |
| Store in database | VAPID keys in server_config table in PostgreSQL. | |

**User's choice:** Auto-generate on first start

| Option | Description | Selected |
|--------|-------------|----------|
| One subscription per device | Each browser/device gets own row. Send to all matching. Clean up on 410. | ✓ |
| Latest device only | Only keep most recent subscription per user. | |

**User's choice:** One subscription per device

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, create in this phase | Alembic migration for push_subscription table in Phase 14. | ✓ |
| Backfill via Phase 11 fix | Add to Phase 11 first per roadmap, then Phase 14 uses it. | |

**User's choice:** Yes, create in this phase

---

## Claude's Discretion

- Offline fallback page design
- Exact install banner placement (top vs bottom)
- Service worker caching strategy for offline fallback
- PWA icon design
- VAPID contact email value

## Deferred Ideas

None — discussion stayed within phase scope
