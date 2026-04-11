# Requirements: GSD Cloud

**Defined:** 2026-04-11
**Core Value:** A unified GSD Vibe frontend that lets users run and manage Claude Code sessions on remote nodes from anywhere, via a self-hosted server they control.

## v1.1 Requirements

Requirements for the v1.1 milestone. Each maps to roadmap phases.

### Fixes

- [ ] **FIX-01**: Nodes and projects pages load without 500 errors (node.token_hash and all other missing columns present via migration)
- [ ] **FIX-02**: All Tauri stubs required for full frontend functionality replaced with web equivalents or graceful no-ops
- [ ] **FIX-03**: Email sends raise on non-success response so auth email failures are surfaced, not silently swallowed

### Authentication

- [ ] **AUTH-07**: User can request a password reset email and set a new password via the link
- [ ] **AUTH-08**: User receives an email verification link on signup; unverified users see a banner and enter read-only mode after 7 days; existing v1.0 users are not affected

### Cost / Usage

- [ ] **COST-01**: Server records inputTokens, outputTokens, costUsd, and durationMs from daemon taskComplete events into a usage_record table per session
- [ ] **COST-02**: User can view usage history — per-session breakdown and per-node totals with cost chart — at /usage

### Notifications

- [ ] **NOTF-01**: User receives a push notification (PWA/Web Push) when a permission request arrives on any active session
- [ ] **NOTF-02**: User receives a push notification when a session completes (taskComplete event)

### Scale

- [ ] **SCAL-01**: Server relay hub falls back to Redis pub/sub when the target browser connection is on a different worker; subscriber loop retries on disconnect; multi-worker docker-compose override provided

### UX

- [ ] **UX-01**: User can open a "Deploy on new node" modal from the Nodes page showing step-by-step OS-aware pairing instructions with copy buttons and a live connection indicator

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-03**: User can configure per-event notification preferences (which events trigger push vs. in-app only)
- **NOTF-04**: User receives push notification for Claude question events (not just permission requests)

### Cost / Usage

- **COST-03**: Usage budgets and alerts — user can set a cost threshold and receive notification when exceeded
- **COST-04**: Per-turn usage breakdown within a session (granular token cost per task)

### Authentication

- **AUTH-09**: OAuth login (Google/GitHub) for self-hosted deployments

### Infrastructure

- **INFR-05**: Automatic node binary update via server-pushed upgrade command

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant SaaS / billing | Self-hosted only; each deployment is single-tenant |
| Multi-LLM support | Claude Code only by design |
| Real-time usage alerts during a session | Requires websocket push of budget state; defer to v2 COST-03 |
| OAuth login | Email/password sufficient for self-hosted; deferred to v2 AUTH-09 |
| Hard email verification gate (block login immediately) | Hostile UX for self-hosted tool; soft-gate with 7-day grace period instead |
| Service worker offline mode / caching | Not needed for this app; adds complexity without user value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | — | Pending |
| FIX-02 | — | Pending |
| FIX-03 | — | Pending |
| AUTH-07 | — | Pending |
| AUTH-08 | — | Pending |
| COST-01 | — | Pending |
| COST-02 | — | Pending |
| NOTF-01 | — | Pending |
| NOTF-02 | — | Pending |
| SCAL-01 | — | Pending |
| UX-01 | — | Pending |

**Coverage:**
- v1.1 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after initial v1.1 definition*
