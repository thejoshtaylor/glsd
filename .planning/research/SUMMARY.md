# Project Research Summary

**Project:** GSD Cloud v1.1
**Domain:** SaaS feature additions to an existing FastAPI + React WebSocket relay platform
**Researched:** 2026-04-11
**Confidence:** HIGH

## Executive Summary

GSD Cloud v1.1 is a focused feature iteration on a working v1.0 relay platform. The v1.0 base (FastAPI backend, React/xterm.js frontend, Go daemon nodes, PostgreSQL, Redis) is already deployed and serving real users. The v1.1 work adds four capability areas: Web Push notifications (the product's primary differentiator for remote session management), per-session token usage tracking, transactional email auth flows (password reset frontend + email verification), and Redis pub/sub multi-worker verification. The research finding that matters most: all new capabilities build on data and infrastructure that already exists in v1.0. No new third-party services, no protocol changes, and only two new dependencies (pywebpush, vite-plugin-pwa).

The recommended build approach is strictly additive and conservative. The existing stack handles every requirement without framework changes, state management additions, or major rewrites. The most complex feature (Web Push notifications) requires a new service worker, VAPID key management, a new DB table, and careful integration with the existing ws_node.py message loop but follows well-documented patterns. The simplest feature (password reset frontend) requires only a React page and a link; the backend is already complete. Token usage data already flows through the system and sits in session_event JSONB; it needs a flat usage_record table and extraction endpoints.

The dominant risk across all features is database migration safety. The project was already bitten by NOT NULL column additions on existing tables (BUG-01 introduced node.token_hash and node.machine_id failures). Every new column on an existing table must use server_default in the migration, and all migrations must be tested against a v1.0-shaped database, not a fresh one. A second systemic risk is silent failure: SMTP sends do not raise on failure, Redis pub/sub subscriber loops die silently on disconnect, and push delivery failures are invisible unless the server explicitly checks HTTP response codes from push services.

## Key Findings

### Recommended Stack

The v1.1 stack adds exactly two new dependencies to the locked v1.0 base. On the backend: pywebpush>=2.3.0,<3.0.0 for Web Push delivery (VAPID signing + payload encryption). On the frontend: vite-plugin-pwa>=1.0.0 for service worker generation and PWA manifest. Everything else is handled by libraries already present in the codebase.

**Core technologies (new additions only):**
- pywebpush: Web Push notification delivery -- only Python library in the web-push-libs ecosystem, handles VAPID JWT and aes128gcm encryption
- vite-plugin-pwa: Service worker generation and PWA manifest -- wraps Workbox, supports Vite 6 peer dep, replaces ~200 lines of manual config
- Browser Push API (no npm package): push subscription management -- W3C standard, built-in, no wrapper needed

**Technologies confirmed as already sufficient (no additions):**
- emails + Jinja2: email sending for auth flows (existing send_email() + generate_password_reset_token() in utils.py)
- recharts: usage charts (already in package.json)
- @tanstack/react-query: usage data fetching (already in use)
- SessionEvent JSONB: usage data source (already stores taskComplete payloads)
- Redis + redis-py: pub/sub for multi-worker relay (already in docker-compose.yml and pyproject.toml)

### Expected Features

**Must have (table stakes):**
- BUG-01: Missing column migrations -- the product is literally broken on nodes/projects pages without these
- STUB-01: Tauri stub replacement -- any "not available" errors break the impression of a finished product
- AUTH-07: Password reset frontend -- backend is 90% done; users cannot recover locked accounts without this
- COST-01: Per-session token usage display -- data already exists in DB; users need cost visibility when running Claude API sessions
- COST-02: Usage history dashboard -- aggregated view for spending patterns; table stakes for any API-cost tool
- UX-01: Deploy on new node instructions modal -- pairing token is useless without clear installation steps

**Should have (differentiators):**
- AUTH-08: Email verification on signup -- prevents typo-locked accounts; protects password reset integrity
- NOTF-01: Push notifications for permission requests -- the killer use case: walk away from a long task, get notified when Claude needs approval
- NOTF-02: Push notifications for session completion -- batch work across nodes without babysitting

**Defer (v2+):**
- Token usage budgets/alerts -- requires threshold definition, alert channels, enforcement logic
- Granular notification preferences matrix -- premature for two notification types
- OAuth/social login -- out of scope for self-hosted single-tenant
- Automatic node binary updates -- complex rollback mechanism, out of scope
- SCAL-01: Redis multi-worker verification -- important for scaling but not blocking core functionality; last in phase order

### Architecture Approach

All v1.1 features integrate at a single chokepoint: the ws_node.py message loop. This is where every node-originated event arrives, and it is already the place where session status updates and DB persistence happen. Adding push notification triggers and usage record writes is a matter of inserting async task calls after existing handlers, not a structural change. The connection manager Redis pub/sub is already wired but untested; the gap is that send_to_browser() in ws_node.py currently bypasses Redis for direct in-memory delivery, which fails in multi-worker deployments. All new database objects (2 new tables + 3 new columns on User) are independent and their migrations can be run together in Phase 1.

**Major components and v1.1 changes:**
1. ws_node.py -- intercept taskComplete/permissionRequest for push triggers and usage record writes (core integration point for NOTF and COST features)
2. push/service.py (NEW) -- send_push_for_event() dispatched via asyncio.create_task() to avoid blocking the message loop
3. connection_manager.py -- fix direct send_to_browser() to fall back to Redis pub/sub when browser connection is on a different worker; add retry loop on subscriber disconnect
4. login.py -- add email verification check + new GET /verify-email endpoint
5. models.py -- two new tables (push_subscription, usage_record) + three new columns on user (email_verified, email_verification_token, email_verification_sent_at)
6. Frontend -- new pages: /forgot-password, /reset-password, /verify-email, /usage; service worker (sw.js) + PWA manifest; push subscription management; usage charts using existing recharts

### Critical Pitfalls

1. **NOT NULL column migrations on existing tables** -- Any new column without server_default causes the prestart container to exit with code 1. Use server_default in every migration; test against v1.0-shaped DB. This already caused BUG-01 with node.token_hash and node.machine_id.

2. **Email verification locks out existing users** -- The email_verified column must default to True for existing rows (server_default='true'), then the Python model default changes to False for new signups. Otherwise all v1.0 users are locked out after the migration runs.

3. **Redis pub/sub subscriber dies silently** -- The _subscriber_loop() does not catch ConnectionError or TimeoutError. Wrap in retry loop with exponential backoff; add /health/ws-relay liveness endpoint. Without this, multi-worker routing silently breaks when Redis hiccups.

4. **SMTP sends fail silently** -- The emails library message.send() returns a status object; existing code only logs it. Check response.status_code and raise on non-250. Add a superuser test-email endpoint to verify SMTP config before relying on auth email flows.

5. **Blocking push sends in the WebSocket loop** -- pywebpush.webpush() makes external HTTP calls to push service endpoints. Calling it synchronously in ws_node.py stalls the entire message loop. Always dispatch via asyncio.create_task().

## Implications for Roadmap

Based on the combined research, a 5-phase structure matches the dependency graph, risk surface, and effort sizing.

### Phase 1: Foundation -- Migrations and Stub Cleanup
**Rationale:** Nothing else can be built or tested reliably until the database is in the correct shape and Tauri stubs are removed. This phase has zero external dependencies and unblocks everything downstream.
**Delivers:** Working nodes/projects pages (BUG-01 fixed); all new tables created (push_subscription, usage_record); all new User columns added (email_verified, email_verification_token, email_verification_sent_at); Tauri stubs replaced with web equivalents or graceful no-ops.
**Addresses:** BUG-01, STUB-01
**Avoids:** Pitfall 2 (NOT NULL migrations) -- all migrations bundled here; Pitfall 7 (verification locks out existing users) -- server_default='true' applied at migration creation time

### Phase 2: Usage Tracking
**Rationale:** The data already exists in the system (taskComplete events in session_event). This is the highest-value, lowest-risk feature: one new table, ~10 lines changed in ws_node.py, one new route file, one new frontend page. Completing this early validates the ws_node.py integration pattern before tackling more complex features.
**Delivers:** crud.record_usage() writes on taskComplete in ws_node.py; GET /api/v1/usage/ + /api/v1/usage/summary endpoints; per-session usage display on session detail view; usage dashboard at /usage with recharts bar chart and sortable table.
**Uses:** UsageRecord table from Phase 1, recharts + React Query (existing)
**Avoids:** Pitfall 6 (write amplification) -- dedicated usage_record table with flat indexed writes; Pitfall 14 (reconnection gaps) -- cumulative totals not deltas

### Phase 3: Email Auth Flows
**Rationale:** Password reset frontend is the fastest user-visible improvement (backend already complete). Email verification builds on the same SMTP infrastructure and the User columns created in Phase 1.
**Delivers:** /forgot-password and /reset-password?token= React pages; email verification flow (send-on-signup, /verify-email page, resend endpoint, unverified banner with 7-day soft gate); SMTP health check for superusers; password_changed_at timestamp on User model; new verify_email.html email template.
**Uses:** Existing emails + Jinja2 + generate_password_reset_token() + SMTP config -- no new dependencies
**Avoids:** Pitfall 4 (SMTP silent failure); Pitfall 8 (token reuse) -- password_changed_at invalidation; Pitfall 13 (email change race) -- token sub comparison on verify

### Phase 4: Web Push Notifications
**Rationale:** The highest-complexity feature. Deferred until Phase 3 is stable so the ws_node.py integration point is well-understood and the User model is finalized. Requires HTTPS in production -- document this requirement prominently.
**Delivers:** VAPID keypair generation + .env storage; PushSubscription CRUD endpoints; push/service.py with async send_push_for_event(); service worker (sw.js) with push + notificationclick handlers; PWA manifest; Settings toggle for notifications; iOS PWA install prompt; subscription staleness management.
**Uses:** pywebpush>=2.3.0, vite-plugin-pwa>=1.0.0, asyncio.create_task() dispatch pattern
**Avoids:** Pitfall 1 (subscription staleness) -- delete on 410/404 + pushsubscriptionchange re-subscribe; Pitfall 5 (HTTPS check) -- gate push UI on location.protocol; Pitfall 10 (payload size) -- push payload under 1KB; Pitfall 11 (SW + Vite dev) -- service worker disabled in dev; Pitfall 12 (VAPID key persistence) -- keys in .env; Pitfall 15 (notification source fragmentation) -- React Query invalidation as single source of truth

### Phase 5: Redis Multi-Worker and Deploy Modal
**Rationale:** Multi-worker verification is a stress test, not a feature build. Runs after all features work in single-worker mode. Deploy modal is pure frontend with no backend dependencies and can be parallelized.
**Delivers:** Fixed send_to_browser() with Redis fallback; Redis-backed session-to-channel mapping; subscriber retry loop; /health/ws-relay liveness endpoint; ActivityBroadcaster migrated to Redis; docker-compose.multiworker.yml override; cross-worker integration test harness; DeployNodeModal.tsx with OS-aware install commands and live connection status.
**Avoids:** Pitfall 3 (subscriber silent disconnect) -- retry loop + liveness endpoint; Pitfall 9 (ActivityBroadcaster gap) -- migrated to Redis in same phase

### Phase Ordering Rationale

- Migrations must come first: all features except deploy modal require new tables or columns. Bundling in Phase 1 eliminates cross-phase ordering problems.
- Usage tracking before notifications: the ws_node.py integration pattern for usage (one DB write) is simpler than for push (async dispatch + external HTTP). Phase 2 validates the pattern before Phase 4's complexity.
- Email auth before push: push builds on a stable User model. Email auth stabilizes it and validates the SMTP pipeline. Inverting this risks double-touching User migrations.
- Multi-worker last: requires all features working in single-worker mode. It is a verification pass, not a feature build.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Web Push):** Cross-browser service worker behavior, iOS PWA Home Screen requirement, Safari VAPID mailto: vs https: subject format quirks. Recommend /gsd-research-phase before detailed task breakdown.
- **Phase 5 (Redis multi-worker):** Redis-backed session-to-channel mapping strategy needs design work -- current in-memory _session_to_channel dict has no Redis equivalent. Routing logic under worker restart needs investigation.

Phases with standard patterns (skip research):
- **Phase 1 (Migrations):** Alembic two-step migration pattern is well-documented; existing migrations serve as templates.
- **Phase 2 (Usage tracking):** All data already in the system; PostgreSQL write patterns and React Query are standard.
- **Phase 3 (Email auth):** Backend is 90% built; React form + URL param patterns are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 2 new dependencies, both verified on PyPI/npm. Everything else confirmed present in existing codebase. |
| Features | HIGH | Feature list grounded in existing protocol messages, existing DB tables, and existing stubs. No speculative features. |
| Architecture | HIGH | Based on direct codebase inspection of ws_node.py, connection_manager.py, and models.py. Integration points cited with specific line numbers. |
| Pitfalls | HIGH | All critical pitfalls grounded in existing codebase bugs (BUG-01 already happened) or well-documented failure modes with specific prevention steps. |

**Overall confidence:** HIGH

### Gaps to Address

- **Usage write strategy under load:** At v1.1 scale (few concurrent sessions), direct crud.record_usage() writes on every taskComplete are fine. If session volume grows, revisit buffering via Redis before flushing. Flag this decision in Phase 2 implementation notes.
- **VAPID subject format for Safari:** Safari requires mailto: VAPID subject, not an https:// URL. Ensure VAPID_SUBJECT in config.py is documented and validated as mailto:admin@example.com format. Must be caught at VAPID key setup time, not during user testing.
- **Push active-connection check under multi-worker:** The logic "skip push if user has active browser WS for this channel" queries ConnectionManager state, which is per-worker. In Phase 4 (single-worker), this works. In Phase 5 (multi-worker), the check needs to query Redis. Document as a known Phase 4 limitation.

## Sources

### Primary (HIGH confidence)
- Existing codebase (ws_node.py, connection_manager.py, models.py, utils.py, login.py) -- direct inspection, integration points and line numbers verified
- node/protocol-go/messages.go lines 111-122 -- TaskComplete message schema with usage fields confirmed
- https://pypi.org/project/pywebpush/ -- v2.3.0, Feb 2026, Python >=3.10 confirmed
- https://vite-pwa-org.netlify.app/guide/ -- Vite 6 peer dep confirmed

### Secondary (MEDIUM confidence)
- https://oneuptime.com/blog/post/2026-01-25-websocket-servers-fastapi-redis/view -- cross-worker routing pattern
- https://medium.com/@kaushalsinh73/fastapi-web-push-vapid-real-time-notifications-without-vendor-lock-in-43540ec855f6 -- Web Push + FastAPI integration pattern
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API -- service worker patterns
- https://pushpad.xyz/blog/web-push-error-410-the-push-subscription-has-expired-or-the-user-has-unsubscribed -- subscription lifecycle management

### Tertiary (LOW confidence)
- https://github.com/vite-pwa/vite-plugin-pwa/issues/800 -- Vite 6 support confirmed fixed, but not validated against this project's specific Vite config
- Redis pub/sub multi-worker behavior -- architecture is sound per documentation, but existing ConnectionManager code has not been load-tested; actual behavior under 4 workers is unverified until Phase 5

---
*Research completed: 2026-04-11*
*Ready for roadmap: yes*
