---
phase: 13-email-auth-flows
verified: 2026-04-13T22:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Request password reset email from /forgot-password, receive email, click link, set new password at /reset-password"
    expected: "Email arrives with reset link; clicking link opens reset form; submitting new password succeeds; can login with new password"
    why_human: "Requires running SMTP server and email delivery -- cannot be verified statically"
  - test: "Register a new user with SMTP enabled, verify email verification email arrives, click link, confirm account marked verified"
    expected: "Verification email arrives; clicking link marks email_verified=true; banner disappears"
    why_human: "Requires running SMTP and a real browser session"
  - test: "Wait 7+ days with unverified account (or set created_at to 8 days ago), attempt POST /nodes/ -- verify 403"
    expected: "403 Forbidden with grace period message"
    why_human: "Requires running backend with PostgreSQL"
---

# Phase 13: Email Auth Flows Verification Report

**Phase Goal:** Users can recover locked accounts via password reset and new signups are verified via email
**Verified:** 2026-04-13T22:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can request a password reset email from /forgot-password and set a new password via the emailed link at /reset-password | VERIFIED | Backend: `POST /password-recovery/{email}` at login.py:115, `POST /reset-password/` at login.py:139, `generate_password_reset_token` and `verify_password_reset_token` in utils.py, reset_password.html template. Frontend: forgot-password-page.tsx, reset-password-page.tsx, lazy routes in App.tsx:36,56, "Forgot password?" link in login-page.tsx. Tests: test_recovery_password, test_reset_password in test_login.py |
| 2 | New users receive an email verification link on signup; clicking it marks the account as verified | VERIFIED | Backend: signup in users.py sets email_verified=False and sends verification email when SMTP enabled. `POST /verify-email` at login.py:188 validates token and marks verified. `POST /resend-verification` at login.py:210 with 60s cooldown. Frontend: verify-email-page.tsx auto-verifies on mount. Tests: test_verify_email_valid_token, test_signup_sends_verification_email in test_login.py and test_users.py |
| 3 | Unverified users see a banner prompting verification; after 7 days unverified accounts enter read-only mode | VERIFIED | Backend: `require_verified_or_grace` dependency in deps.py:71 blocks POST/PATCH/DELETE after 7-day grace. Frontend: email-verification-banner.tsx renders standard/urgent text variants based on grace period, wired in main-layout.tsx. Tests: test_unverified_user_past_grace_gets_403, test_unverified_user_within_grace_allowed in test_users.py |
| 4 | Existing v1.0 users are not affected by the email verification migration (treated as already verified) | VERIFIED | Migration g1a2b3c4d5e6 adds email_verified column with `server_default="true"` -- all existing rows get email_verified=True. UserPublic model has `email_verified: bool = True` default |

**Score:** 4/4 truths verified

### Required Artifacts

#### AUTH-07: Password Reset Flow

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/backend/app/api/routes/login.py:115` | `POST /password-recovery/{email}` endpoint | VERIFIED | Sends password reset email when user exists; generic response when user not found to prevent enumeration |
| `server/backend/app/api/routes/login.py:139` | `POST /reset-password/` endpoint | VERIFIED | Validates JWT reset token with purpose claim, updates password hash, returns success |
| `server/backend/app/utils.py` | `generate_password_reset_token()` function | VERIFIED | Generates JWT with `"purpose": "password_reset"` claim and expiry; used by recovery endpoint |
| `server/backend/app/utils.py` | `verify_password_reset_token()` function | VERIFIED | Decodes JWT, checks purpose claim; returns email on success or None on invalid/expired token |
| `server/backend/app/email-templates/build/reset_password.html` | HTML password reset email template | VERIFIED | Template file exists; follows same style as other email templates |
| `server/frontend/src/components/auth/forgot-password-page.tsx` | Forgot password form UI page | VERIFIED | File exists; exports `ForgotPasswordPage`; always transitions to success state on submit to prevent enumeration (T-13-07) |
| `server/frontend/src/components/auth/reset-password-page.tsx` | Reset password form UI page | VERIFIED | File exists; exports `ResetPasswordPage`; handles token error, password mismatch validation, success/invalid states |
| `server/frontend/src/App.tsx:36,56` | Lazy-loaded routes for forgot/reset password pages | VERIFIED | Lazy imports for ForgotPasswordPage and ResetPasswordPage; `/forgot-password` and `/reset-password` routes outside ProtectedRoute |
| `server/frontend/src/components/auth/login-page.tsx` | "Forgot password?" link to /forgot-password | VERIFIED | Contains "Forgot password?" link rendered only on Sign In tab |
| `server/backend/tests/api/routes/test_login.py` | Backend tests for password reset flow | VERIFIED | `test_recovery_password` and `test_reset_password` tests exist |

#### AUTH-08: Email Verification, Banner, Grace Period

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/backend/app/models.py:57-61` | User model email verification columns | VERIFIED | `email_verified`, `email_verification_token`, `email_verification_sent_at` fields present |
| `server/backend/app/models.py:71` | UserPublic email_verified field | VERIFIED | `email_verified: bool = True` in UserPublic for frontend consumption |
| `server/backend/app/alembic/versions/g1a2b3c4d5e6_add_email_verification_columns.py` | Alembic migration for email verification columns | VERIFIED | Adds 3 columns with `server_default="true"` so existing rows are auto-verified |
| `server/backend/app/utils.py:126,139,151` | Email verification token utilities | VERIFIED | `generate_email_verification_token`, `verify_email_verification_token`, `generate_verification_email` all present |
| `server/backend/app/api/routes/login.py:188` | `POST /verify-email` endpoint | VERIFIED | Validates token, checks purpose claim `"email_verify"`, sets `email_verified=True` |
| `server/backend/app/api/routes/login.py:210` | `POST /resend-verification` endpoint | VERIFIED | 60-second cooldown via email_verification_sent_at; returns generic response regardless of user state to prevent enumeration |
| `server/backend/app/api/routes/users.py` | Signup modification to send verification email | VERIFIED | Sets `email_verified=False` when SMTP enabled, sends verification email; auto-verifies when SMTP disabled |
| `server/backend/app/api/deps.py:71,88` | `require_verified_or_grace` dependency | VERIFIED | Blocks POST/PATCH/DELETE for unverified users past 7-day grace period; `VerifiedOrGraceDep` type alias |
| `server/backend/app/email-templates/build/verify_email.html` | HTML email verification template | VERIFIED | Template file exists |
| `server/frontend/src/components/auth/verify-email-page.tsx` | Email verification UI page | VERIFIED | File exists; exports `VerifyEmailPage`; auto-verifies on mount with verifying/success/already-verified/error states |
| `server/frontend/src/components/auth/email-verification-banner.tsx` | Email verification banner component | VERIFIED | File exists; exports `EmailVerificationBanner`; renders standard/urgent text variants based on 7-day grace period; 60-second resend cooldown |
| `server/frontend/src/components/layout/main-layout.tsx` | EmailVerificationBanner wired into main layout | VERIFIED | Imports and renders `EmailVerificationBanner`; hidden on shell routes |
| `server/frontend/src/contexts/auth-context.tsx` | AuthUser email_verified and created_at fields | VERIFIED | `AuthUser` has `email_verified` and `created_at`; propagated through all setUser calls in AuthProvider |
| `server/frontend/src/lib/api/auth.ts` | CurrentUser email_verified API type | VERIFIED | `CurrentUser` has `email_verified` field |
| `server/backend/tests/api/routes/test_login.py` | Backend tests for verify/resend endpoints | VERIFIED | `test_verify_email_valid_token`, `test_verify_email_invalid_token`, `test_verify_email_already_verified`, `test_resend_verification_rate_limit`, `test_resend_verification_success`, `test_verify_email_verification_token_rejects_reset_token` |
| `server/backend/tests/api/routes/test_users.py` | Backend tests for signup verification and grace period | VERIFIED | `test_signup_sends_verification_email`, `test_unverified_user_past_grace_gets_403`, `test_unverified_user_within_grace_allowed` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `login.py` password-recovery | `utils.py generate_password_reset_token` | direct call | WIRED | Recovery endpoint calls token generator and passes result to send_email |
| `login.py` password-recovery | email send | `generate_password_reset_token` result | WIRED | Token embedded in email link sent to user |
| `login.py` reset-password | `utils.py verify_password_reset_token` | direct call | WIRED | Reset endpoint validates JWT before updating password |
| `login.py` reset-password | password update | verified token email | WIRED | User record password hash updated on valid token |
| `forgot-password-page.tsx` | `POST /password-recovery/{email}` | fetch | WIRED | Form submits to recovery endpoint; always shows success state |
| `reset-password-page.tsx` | `POST /reset-password/` | fetch | WIRED | Form submits with token from URL query param and new password |
| `App.tsx` | `forgot-password-page.tsx` | lazy route `/forgot-password` | WIRED | Route at App.tsx:36 outside ProtectedRoute |
| `App.tsx` | `reset-password-page.tsx` | lazy route `/reset-password` | WIRED | Route at App.tsx:56 outside ProtectedRoute |
| `App.tsx` | `verify-email-page.tsx` | lazy route `/verify-email` | WIRED | Route outside ProtectedRoute; auto-verifies on mount |
| `login-page.tsx` | `/forgot-password` | React Router Link | WIRED | "Forgot password?" link visible only on Sign In tab |
| `users.py` signup | `utils.py generate_email_verification_token` | direct call | WIRED | Signup sets email_verified=False and calls token generator when SMTP enabled |
| `users.py` signup | email send | `generate_verification_email` result | WIRED | Verification link emailed on account creation |
| `login.py` verify-email | `utils.py verify_email_verification_token` | direct call | WIRED | Verify endpoint decodes JWT and checks `"email_verify"` purpose claim |
| `login.py` verify-email | `email_verified=True` | db update after valid token | WIRED | User.email_verified set to True and committed on successful verification |
| `email-verification-banner.tsx` | `POST /resend-verification` | fetch | WIRED | Resend button calls endpoint with 60s client-side cooldown |
| `main-layout.tsx` | `EmailVerificationBanner` | import + render | WIRED | Banner rendered after Breadcrumbs; hidden on shell routes |
| `deps.py require_verified_or_grace` | `User.email_verified` + `created_at` check | FastAPI dependency | WIRED | Blocks write operations 7 days after account creation if email_verified is False |
| `auth-context.tsx` | `CurrentUser.email_verified` | AuthUser interface propagation | WIRED | email_verified from API response flows into React auth state |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AUTH-07 | 13-01, 13-02 | Password reset via email link | SATISFIED | Full backend+frontend flow: token generation in utils.py, recovery endpoint sends email, reset endpoint validates token and updates password, forgot-password-page.tsx and reset-password-page.tsx implement UI, lazy routes in App.tsx, "Forgot password?" link in login-page.tsx, backend tests in test_login.py |
| AUTH-08 | 13-01, 13-02 | Email verification on signup with banner and grace period | SATISFIED | Model columns (email_verified, email_verification_token, email_verification_sent_at) in models.py, Alembic migration g1a2b3c4d5e6 with server_default="true", verify-email and resend-verification endpoints in login.py, signup modification in users.py, require_verified_or_grace dependency in deps.py, verify-email-page.tsx, email-verification-banner.tsx wired in main-layout.tsx, 9+ backend tests covering token validation, rate limiting, grace period enforcement |

### Anti-Patterns Found

No stub patterns found. No `TODO/FIXME` blocking issues in auth-related files. No hardcoded credentials or secrets.

JWT purpose claim isolation prevents cross-use of reset tokens for email verification (T-13-01 mitigation from plan). Generic resend response prevents email enumeration regardless of user state (T-13-02 mitigation). 60-second resend cooldown prevents abuse (T-13-04 mitigation). Error-safe email sending in signup prevents SMTP failures from blocking account creation (T-13-05 mitigation). ForgotPasswordPage always shows success state regardless of email existence (T-13-07 mitigation).

### Human Verification Required

#### 1. Password Reset End-to-End Flow

**Test:** Start Docker Compose stack with SMTP configured. Navigate to /forgot-password. Submit email for an existing user. Receive email with reset link. Click link to open /reset-password. Submit new password. Attempt login with new password.
**Expected:** Email arrives with reset link; clicking link opens reset form with token pre-filled from URL; submitting new password succeeds; can login with new password; old password rejected
**Why human:** Requires running SMTP server and actual email delivery -- cannot be verified statically. Backend token and endpoint logic is code-verified.

#### 2. Email Verification End-to-End Flow

**Test:** Start Docker Compose stack with SMTP configured. Register a new user. Receive verification email. Click verification link to open /verify-email. Confirm account is marked verified (banner disappears).
**Expected:** Verification email arrives after signup; clicking link auto-verifies on page load with success state; EmailVerificationBanner no longer renders after verification; email_verified=true in user record
**Why human:** Requires running SMTP and a real browser session. Backend endpoint and frontend page are code-verified.

#### 3. Grace Period Enforcement

**Test:** With running backend and PostgreSQL: set a test user's created_at to 8 days ago and email_verified=false. Attempt POST /nodes/ -- verify 403 Forbidden response. Attempt GET /nodes/ -- verify 200 OK (read-only, not blocked).
**Expected:** 403 Forbidden with grace period message for write operations; GET requests unaffected
**Why human:** Requires running backend with PostgreSQL. The require_verified_or_grace dependency implementation is code-verified at deps.py:71,88.

## Gaps Summary

No code gaps were identified. All required artifacts exist, are substantive, and are wired correctly. The three items requiring human action are operational (SMTP email delivery, live browser session, and grace period enforcement on a running database) -- not code defects.

JWT purpose claim isolation is correctly implemented: `"email_verify"` and `"password_reset"` purpose claims prevent cross-use of tokens, test `test_verify_email_verification_token_rejects_reset_token` confirms this. The migration's `server_default="true"` ensures all existing v1.0 users retain full access without re-verification.

---

_Verified: 2026-04-13T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
