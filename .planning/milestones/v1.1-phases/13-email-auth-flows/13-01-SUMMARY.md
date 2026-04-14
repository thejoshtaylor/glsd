---
phase: 13-email-auth-flows
plan: 01
subsystem: server-backend-auth
tags: [email-verification, auth, security, alembic]
dependency_graph:
  requires: []
  provides: [email-verification-endpoints, verified-or-grace-dep, email-verification-model-columns]
  affects: [server/backend/app/models.py, server/backend/app/api/deps.py]
tech_stack:
  added: []
  patterns: [jwt-purpose-claim, grace-period-enforcement, rate-limited-resend]
key_files:
  created:
    - server/backend/app/email-templates/build/verify_email.html
    - server/backend/app/alembic/versions/g1a2b3c4d5e6_add_email_verification_columns.py
  modified:
    - server/backend/app/models.py
    - server/backend/app/utils.py
    - server/backend/app/api/routes/login.py
    - server/backend/app/api/routes/users.py
    - server/backend/app/api/routes/nodes.py
    - server/backend/app/api/deps.py
    - server/backend/tests/api/routes/test_login.py
    - server/backend/tests/api/routes/test_users.py
decisions:
  - JWT purpose claim ("email_verify") prevents cross-use with password reset tokens
  - server_default="true" in migration so existing users are auto-verified
  - 60-second cooldown on resend-verification to prevent abuse
  - 7-day grace period for unverified users before write endpoints are blocked
  - Generic response messages on resend-verification to prevent email enumeration
metrics:
  duration_seconds: 421
  completed: "2026-04-13T20:57:54Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 8
---

# Phase 13 Plan 01: Email Verification Infrastructure Summary

JWT-based email verification with purpose-claim isolation, 7-day grace period enforcement, and rate-limited resend endpoint.

## Commits

| Hash | Message |
|------|---------|
| 27bdd36 | test(13-01): add failing tests for email verification endpoints |
| 54e70a3 | feat(13-01): add email verification infrastructure |
| cb42901 | test(13-01): add failing tests for signup verification and grace period |
| 4b842d9 | feat(13-01): signup verification email and read-only enforcement |

## Task 1: Email Verification Infrastructure

Added three columns to User model (email_verified, email_verification_token, email_verification_sent_at) with Alembic migration that defaults existing users to verified via server_default="true". Token utilities use JWT with "purpose": "email_verify" claim to prevent cross-use with password reset tokens. POST /verify-email validates token and marks user verified. POST /resend-verification has 60-second cooldown and returns generic messages regardless of user state. Email template follows same style as reset_password.html.

## Task 2: Signup Integration and Read-Only Enforcement

Modified signup to send verification email when SMTP is configured, or auto-verify when SMTP is disabled. Added require_verified_or_grace FastAPI dependency that blocks write operations (POST/PATCH/DELETE) for unverified users past a 7-day grace period. Applied to PATCH /users/me, DELETE /users/me, and POST /nodes/. UserPublic model now includes email_verified field for frontend consumption.

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **JWT purpose claim isolation** -- email verification tokens include `"purpose": "email_verify"` so password reset tokens cannot be used for verification (T-13-01 mitigation).
2. **Generic resend response** -- POST /resend-verification returns the same message whether user is verified or not, preventing email enumeration (T-13-02 mitigation).
3. **Grace period enforcement** -- 7-day window from account creation before write endpoints return 403, giving users time to verify without losing immediate access (T-13-03 mitigation).
4. **Rate limiting** -- 60-second cooldown on resend-verification using email_verification_sent_at timestamp (T-13-04 mitigation).
5. **Error-safe email sending** -- try/except wraps send_email in signup so SMTP failures don't block account creation (T-13-05 mitigation).

## Self-Check: PASSED
