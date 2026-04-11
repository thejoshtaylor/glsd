# Domain Pitfalls

**Domain:** Adding v1.1 features (push notifications, usage tracking, email auth, Redis multi-worker) to an existing FastAPI + React SaaS
**Researched:** 2026-04-11
**Context:** All pitfalls are specific to adding features to the existing GSD Cloud v1.0 codebase -- not greenfield advice.

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or production outages.

### Pitfall 1: Web Push Subscriptions Stored Without Staleness Management

**What goes wrong:** Push subscriptions are stored in PostgreSQL when the user grants permission, but subscriptions silently become invalid over time. The push endpoint URL changes when the browser profile changes, the user reinstalls the browser, or the push service rotates endpoints. Sending to a stale endpoint returns HTTP 410 (Gone) or 404, and if the server does not handle this, it accumulates dead subscriptions and wastes resources retrying.

**Why it happens:** The `PushSubscription.expirationTime` property is almost always `null` in practice (Chrome never sets it, Firefox rarely does). Developers assume subscriptions are permanent because there is no explicit expiry signal.

**Consequences:** Notification delivery rates silently degrade. Users report "I never got the notification" but the server thinks it sent successfully. Database fills with dead subscriptions.

**Prevention:**
1. On every `pywebpush.webpush()` call, catch HTTP 404 and 410 responses and immediately delete that subscription from the DB.
2. Add a `last_successful_push` timestamp column to the subscription table. Periodically prune subscriptions that have not received a successful push in 30+ days.
3. On the frontend, re-subscribe on every app load (`registration.pushManager.subscribe()` is idempotent) and POST the subscription to the server. If the endpoint changed, the server upserts.
4. Implement the `pushsubscriptionchange` service worker event to automatically re-subscribe and update the server.

**Detection:** Monitor the ratio of 410/404 responses to total push attempts. Alert if it exceeds 10%.

### Pitfall 2: Adding NOT NULL Columns to Existing Tables Without Two-Step Migration

**What goes wrong:** The `node` table already has data in production (v1.0 shipped). Adding a new NOT NULL column (e.g., for push subscription FK, usage counters, email verification status) in a single migration fails with `column "X" of relation "Y" contains null values` because existing rows have no value for the new column.

**Why it happens:** SQLModel/Alembic autogenerate creates `op.add_column(..., nullable=False)` when the model field has no `Optional` type hint. The developer tests with a fresh database where the migration creates the table from scratch, so the error never appears locally.

**Consequences:** `docker-compose up` fails on the `prestart` service (which runs Alembic). The server does not start. This is exactly the BUG-01 pattern that already bit the project with `node.token_hash` and `node.machine_id`.

**Prevention:**
1. Always use a two-step migration for NOT NULL columns on existing tables:
   - Step 1: `op.add_column('table', sa.Column('col', sa.String(), nullable=True, server_default='value'))`
   - Step 2: `op.execute("UPDATE table SET col = 'value' WHERE col IS NULL")`
   - Step 3: `op.alter_column('table', 'col', nullable=False)`
2. All three steps can be in one migration file, but the order matters.
3. Test every migration against a database seeded with v1.0 data, not just a fresh database.
4. Add a CI step that runs `alembic upgrade head` against a snapshot of the production schema.

**Detection:** The `prestart` container exits with code 1. Check `docker-compose logs prestart` for Alembic errors.

### Pitfall 3: Redis Pub/Sub Subscriber Silently Disconnects Under Multi-Worker Load

**What goes wrong:** The existing `ConnectionManager._subscriber_loop()` subscribes to `ws:session:*` via `psubscribe`. When Redis disconnects (restart, memory pressure, network blip), the `async for msg in pubsub.listen()` loop raises a `ConnectionError` that is not caught. The subscriber task dies silently. The worker continues running and serving HTTP, but WebSocket messages from other workers are never received. Users on that worker stop getting real-time updates.

**Why it happens:** The current code (line 197-214 of `connection_manager.py`) only catches `asyncio.CancelledError` for graceful shutdown. It does not handle `redis.exceptions.ConnectionError` or `redis.exceptions.TimeoutError`.

**Consequences:** Partial message delivery. Some users get updates, others do not, depending on which Uvicorn worker they are connected to. Extremely hard to debug because the HTTP health check still passes.

**Prevention:**
1. Wrap the subscriber loop in a retry loop with exponential backoff:
   ```python
   async def _subscriber_loop(self) -> None:
       while True:
           try:
               pubsub = r.pubsub()
               await pubsub.psubscribe("ws:session:*")
               async for msg in pubsub.listen():
                   # ... handle message ...
           except (ConnectionError, TimeoutError):
               logger.warning("Redis subscriber disconnected, reconnecting in 2s")
               await asyncio.sleep(2)
           except asyncio.CancelledError:
               break
   ```
2. Add a Redis PING health check that runs every 30 seconds inside the subscriber loop.
3. Add a `/health/ws-relay` endpoint that verifies the subscriber task is alive (`not self._pubsub_task.done()`).
4. Log a WARNING every time the subscriber reconnects so operators can see Redis instability.

**Detection:** Add a metric for "subscriber reconnect count." Alert if it exceeds 3 in 5 minutes.

### Pitfall 4: SMTP Delivery Fails Silently in Docker Compose

**What goes wrong:** The existing `send_email()` function in `app/utils.py` (line 33-54) uses the `emails` library to send via SMTP. In Docker Compose, the backend container resolves `SMTP_HOST` to an external mail service. But the `emails` library `message.send()` returns a response object that is only logged (`logger.info(f"send email result: {response}")`) -- it is never checked for success. If SMTP credentials are wrong, the host is unreachable, or the provider rejects the message, the function completes without error. The user sees "Password reset email sent" but nothing arrives.

**Why it happens:** The `emails` library does not raise exceptions on SMTP failures by default. It returns a status object. The existing code logs it but does not check `response.status_code`.

**Consequences:** Password reset and email verification flows appear to work but emails never arrive. Users cannot recover accounts. Support burden increases.

**Prevention:**
1. Check the response status after `message.send()`:
   ```python
   response = message.send(to=email_to, smtp=smtp_options)
   if response.status_code not in (250, None):
       raise RuntimeError(f"SMTP send failed: {response.status_code} {response.error}")
   ```
2. Add a `/api/v1/utils/test-email/` endpoint (the template already has `generate_test_email()`) that is accessible to superusers for verifying SMTP config.
3. Document clearly in `.env.example` that self-hosted deployments need either:
   - An external SMTP relay (Mailgun, Resend, AWS SES) -- recommended.
   - A sidecar SMTP container (postfix) with proper SPF/DKIM -- complex.
4. For development, use MailHog or Mailpit as a docker-compose service that catches all outbound email.

**Detection:** Add structured logging for email send results. Monitor for non-250 status codes.

## Moderate Pitfalls

### Pitfall 5: Web Push Requires HTTPS but GSD Cloud Runs Behind User's Own Proxy

**What goes wrong:** The Push API requires a secure context (HTTPS). GSD Cloud's Docker Compose does not expose ports directly -- the user's reverse proxy handles TLS. If the user accesses the app via HTTP (common in home lab setups), `navigator.serviceWorker.register()` fails silently (or is not available), and push subscription is impossible. The UI shows no error; the push permission button simply does nothing.

**Why it happens:** The constraint "no ports exposed directly" means GSD Cloud cannot guarantee HTTPS. `localhost` is the only exception where service workers work over HTTP.

**Prevention:**
1. On the frontend, check `'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')` before showing push notification UI.
2. If the check fails, show a clear message: "Push notifications require HTTPS. Configure your reverse proxy with TLS."
3. For local development, `localhost` works without HTTPS -- no special workaround needed.
4. Safari has a known bug where VAPID subjects with `https://localhost` URIs cause `BadJwtToken` errors. Use `mailto:` VAPID subject format instead: `mailto:admin@yourdomain.com`.
5. Document this in the deployment guide.

**Prevention cost:** Low. Frontend conditional + user-facing message.

### Pitfall 6: Usage Event Writes Overwhelm PostgreSQL During Active Sessions

**What goes wrong:** Token usage events from the daemon arrive as WebSocket messages at high frequency (every API call Claude Code makes). Naively inserting each event as a separate row in PostgreSQL creates write amplification: one INSERT per event, each requiring WAL write, index update, and fsync. With 5-10 concurrent sessions, this can saturate the PostgreSQL connection pool.

**Why it happens:** The existing `SessionEvent` table uses a composite primary key `(session_id, sequence_number)` with a JSONB `payload` column. Storing every usage event as a SessionEvent would dramatically increase table size and write pressure.

**Prevention:**
1. Do NOT store raw usage events in `session_event`. Create a separate `usage_summary` table with columns: `session_id`, `input_tokens`, `output_tokens`, `api_calls`, `last_updated_at`.
2. Buffer usage events in memory (or Redis) and flush aggregated totals to PostgreSQL on a timer (every 30 seconds) or on session end.
3. Use `INSERT ... ON CONFLICT (session_id) DO UPDATE SET input_tokens = usage_summary.input_tokens + EXCLUDED.input_tokens` for atomic upsert.
4. If a session crashes mid-flight, the last flushed total is "close enough." Exact-to-the-token accuracy is not worth the write amplification.

**Prevention cost:** Medium. Requires a new table, a buffering mechanism, and a flush timer.

### Pitfall 7: Email Verification Blocks Login on Existing Users

**What goes wrong:** Adding `is_email_verified: bool = False` to the `User` model and then requiring verification on login retroactively locks out all existing v1.0 users. Their `is_email_verified` column defaults to `False`, and they cannot log in to verify their email.

**Why it happens:** The developer thinks about the signup flow (new users verify before accessing the app) but forgets that existing users were created before verification existed.

**Consequences:** All existing users are locked out after the migration runs.

**Prevention:**
1. Migration must set `is_email_verified = True` for all existing users:
   ```python
   op.add_column('user', sa.Column('is_email_verified', sa.Boolean(), server_default='true'))
   ```
   Note: `server_default='true'` ensures existing rows get `True`. Then change the Python model default to `False` for new signups.
2. Alternatively, make email verification optional for the first release. Users who signed up pre-verification are grandfathered in.
3. Add a "resend verification email" button in the settings page for users who want to verify retroactively.

**Detection:** If you deploy and immediately cannot log in with any account, this is the cause.

### Pitfall 8: Password Reset Token Reuse and Race Conditions

**What goes wrong:** The existing `generate_password_reset_token()` (line 103-113 of `utils.py`) creates a JWT with the user's email as the `sub` claim and an expiry. But the token has no nonce or one-time-use tracking. If an attacker intercepts the email, they can use the token multiple times within the expiry window. Worse, two concurrent reset requests create two valid tokens, and using the first does not invalidate the second.

**Why it happens:** JWT-based reset tokens are stateless by design. The existing implementation relies solely on expiry for invalidation.

**Prevention:**
1. Add a `password_changed_at` timestamp to the `User` model.
2. Include the `password_changed_at` value in the reset token's `iat` (issued-at) claim.
3. On password reset, verify that `token.iat >= user.password_changed_at`. If the password was changed after the token was issued, reject it. This makes all previously issued tokens invalid after a password change.
4. This approach avoids a separate "used tokens" table while still preventing reuse.

**Prevention cost:** Low. One column addition + one comparison in the verify function.

### Pitfall 9: ActivityBroadcaster Does Not Scale to Multiple Workers

**What goes wrong:** The `ActivityBroadcaster` in `broadcaster.py` is an in-memory pub/sub for SSE activity feeds. It uses `asyncio.Queue` per subscriber. When running multiple Uvicorn workers, each worker has its own broadcaster instance. Events published in worker 1 are never seen by subscribers in worker 2.

**Why it happens:** The same architectural gap as the WebSocket relay, but for the SSE activity feed. The WebSocket relay already has Redis pub/sub wired; the broadcaster does not.

**Prevention:**
1. When implementing Redis pub/sub for the WebSocket relay (SCAL-01), also route activity events through Redis.
2. Use a separate Redis channel prefix: `activity:user:{user_id}`.
3. The SSE endpoint subscribes to Redis, not to the in-memory queue.
4. Keep the in-memory fallback for single-worker deployments.

**Prevention cost:** Medium. Must be done alongside the Redis relay work, not after.

### Pitfall 10: Push Notification Payload Size Limit Causes Silent Failures

**What goes wrong:** Web Push payloads are limited to approximately 4KB (varies by push service: FCM ~4KB, APNs ~5KB). If you try to include the full permission request details or session output in the push payload, `pywebpush.webpush()` may succeed on the server side but the push service silently truncates or rejects the message.

**Why it happens:** Developers treat push payloads like WebSocket messages and try to include rich data.

**Prevention:**
1. Push payloads should contain only a notification type, session ID, and a short title/body string. Total under 1KB.
2. The frontend service worker receives the push, shows a native notification, and when clicked, opens the app which fetches full details via the REST API.
3. Never include session output, file contents, or long error messages in push payloads.

**Prevention cost:** Low. Design decision enforced at the API level.

## Minor Pitfalls

### Pitfall 11: Service Worker Registration Conflicts with Vite Dev Server

**What goes wrong:** During development, `vite dev` serves the app from `localhost:5173`. Registering a service worker in dev mode causes caching issues -- the service worker intercepts requests and serves stale assets, breaking hot module replacement (HMR).

**Prevention:**
1. Only register the service worker in production builds (`import.meta.env.PROD`).
2. In dev, mock the push notification API to return canned responses.
3. Use the `vite-plugin-pwa` plugin if PWA features are needed in dev, but configure it with `devOptions: { enabled: false }` by default.

### Pitfall 12: Missing VAPID Key Persistence Across Deploys

**What goes wrong:** VAPID keys are generated once and used to sign push messages. If the keys are generated at startup and not persisted, every redeployment invalidates all existing push subscriptions. Users must re-grant notification permission.

**Prevention:**
1. Generate VAPID keys once: `vapid.generate_key()` or `openssl ecparam -genkey -name prime256v1`.
2. Store the private key in the `.env` file (`VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`).
3. Add these to `docker-compose.yml` environment passthrough.
4. The public key is sent to the frontend for `pushManager.subscribe({ applicationServerKey })`.
5. Document in setup guide that these keys must be generated once and kept stable.

### Pitfall 13: Race Condition Between Email Change and Pending Verification

**What goes wrong:** User requests email verification, then changes their email in settings before clicking the verification link. The link still contains the old email. If the server verifies based on the token's `sub` claim (email), it verifies the old email, not the new one.

**Prevention:**
1. When the user changes their email, set `is_email_verified = False` and invalidate any pending verification tokens.
2. Store the email-to-verify in the token itself and compare it against the user's current email. If they differ, reject the token and prompt re-verification.

### Pitfall 14: Usage Events Lost During WebSocket Reconnection

**What goes wrong:** The daemon tracks token usage per session and sends usage events over the WebSocket. During a reconnection (node loses network briefly), usage events that occurred during the gap are lost because the daemon's WAL is designed for session control messages, not usage telemetry.

**Prevention:**
1. The daemon should accumulate usage totals locally and send cumulative totals (not deltas) in usage events.
2. The server stores the latest cumulative total, not a running sum of deltas. This makes the system idempotent -- replaying a usage event does not double-count.
3. On reconnection, the daemon sends a `usageSync` message with the current cumulative total for each active session.

### Pitfall 15: Frontend Notification API State Complexity

**What goes wrong:** The existing notification system uses Tauri stubs (`getNotifications`, `markNotificationRead`, etc. in `tauri.ts` lines 843-846) that return empty data. Replacing these stubs with real API calls requires coordinating three notification sources: (1) in-app notifications from the REST API, (2) push notifications from the service worker, and (3) SSE activity feed events. If these are not unified, the user sees duplicate or inconsistent notification counts.

**Prevention:**
1. Use a single notification state source of truth: the server's notification table, fetched via React Query.
2. Push notifications trigger a React Query invalidation (via `postMessage` from the service worker to the main thread), not a separate state update.
3. SSE activity events also trigger React Query invalidation, not a parallel notification list.
4. The notification bell count comes from one source: `useUnreadNotificationCount()` backed by the server API.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Push notifications | Pitfall 1 (staleness), Pitfall 5 (HTTPS), Pitfall 10 (payload size), Pitfall 12 (VAPID keys) | Design subscription lifecycle before writing code. Start with VAPID key generation and `.env` persistence. |
| Email auth (reset + verify) | Pitfall 4 (SMTP silent failure), Pitfall 7 (existing users locked out), Pitfall 8 (token reuse), Pitfall 13 (email change race) | Add SMTP health check first. Migrate existing users as verified. Add `password_changed_at` before building reset flow. |
| Usage tracking | Pitfall 6 (write amplification), Pitfall 14 (reconnection gaps), Pitfall 2 (new table migration) | Design the `usage_summary` table and buffering strategy before implementing. Use cumulative totals, not deltas. |
| Redis multi-worker | Pitfall 3 (subscriber disconnect), Pitfall 9 (broadcaster gap) | Add retry loop to subscriber. Migrate ActivityBroadcaster to Redis in the same phase. Add health endpoint for subscriber liveness. |
| Database migrations | Pitfall 2 (NOT NULL on existing data), Pitfall 7 (verification column) | Test every migration against a v1.0-shaped database. Use `server_default` for all new columns on existing tables. |
| Frontend integration | Pitfall 11 (SW + Vite), Pitfall 15 (notification sources) | Keep service worker out of dev mode. Unify all notification sources through React Query. |

## Sources

- [PushSubscription: expirationTime -- MDN](https://developer.mozilla.org/en-US/docs/Web/API/PushSubscription/expirationTime)
- [pushsubscriptionchange event -- MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event)
- [Web Push Error 410 -- Pushpad](https://pushpad.xyz/blog/web-push-error-410-the-push-subscription-has-expired-or-the-user-has-unsubscribed)
- [Web Push Payload Encryption -- Chrome Developers](https://developer.chrome.com/blog/web-push-encryption)
- [Scaling WebSockets with Pub/Sub -- FastAPI + Redis](https://medium.com/@nandagopal05/scaling-websockets-with-pub-sub-using-python-redis-fastapi-b16392ffe291)
- [WebSocket servers FastAPI Redis -- OneUptime](https://oneuptime.com/blog/post/2026-01-25-websocket-servers-fastapi-redis/view)
- [FastAPI WebSocket multiple workers -- GitHub Issue #4199](https://github.com/fastapi/fastapi/issues/4199)
- [Fastest Postgres inserts -- Hatchet](https://docs.hatchet.run/blog/fastest-postgres-inserts)
- [pywebpush -- GitHub](https://github.com/web-push-libs/pywebpush)
- [FastAPI + Web Push VAPID -- Medium](https://medium.com/@kaushalsinh73/fastapi-web-push-vapid-real-time-notifications-without-vendor-lock-in-43540ec855f6)
- [SMTP deliverability with Docker -- Docker Mailserver docs](https://docker-mailserver.github.io/docker-mailserver/latest/config/best-practices/dkim_dmarc_spf/)
- [mkcert for local HTTPS](https://dev.to/_d7eb1c1703182e3ce1782/how-to-set-up-a-local-https-development-environment-in-2025-mkcert-guide-1h8c)
