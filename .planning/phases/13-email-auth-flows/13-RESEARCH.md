# Phase 13: Email Auth Flows - Research

**Researched:** 2026-04-12
**Domain:** Email authentication (password reset, email verification) for FastAPI + React SPA
**Confidence:** HIGH

## Summary

Phase 13 adds two email-based authentication flows: password reset and email verification on signup. The backend already has substantial infrastructure in place -- `generate_password_reset_token()`, `verify_password_reset_token()`, `generate_reset_password_email()`, the `/password-recovery/{email}` and `/reset-password/` API endpoints, the `python-emails` + Jinja2 email sending pipeline, and a pre-built HTML template for password reset emails. The backend password reset flow is **functionally complete** -- what is missing are the frontend pages (`/forgot-password` and `/reset-password`) and the entire email verification flow (model columns, migration, API endpoints, email template, and frontend components).

The User model currently lacks `email_verified`, `email_verification_token`, and `email_verification_sent_at` columns. Phase 11 success criteria mentioned these columns should exist, but they were never created -- this phase must add them via Alembic migration with `email_verified` defaulting to `True` for existing rows (so v1.0 users are unaffected).

**Primary recommendation:** Implement in two plans -- (1) Backend: add User columns + migration, email verification API endpoints, verification email template, and modify signup to trigger verification email; (2) Frontend: add `/forgot-password`, `/reset-password`, `/verify-email` pages, unverified user banner, and read-only mode enforcement after 7 days.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-07 | User can reset password via email link | Backend endpoints already exist (`/password-recovery/{email}`, `/reset-password/`). Email template exists. Missing: frontend `/forgot-password` page (form to request reset), `/reset-password` page (form to enter new password with token from URL). |
| AUTH-08 | Email verification on signup | Missing entirely: User model columns, Alembic migration, API endpoints (`/verify-email`, `/resend-verification`), email template, frontend verification banner, read-only enforcement after 7 days. |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| python-emails | >=0.6, <1.0 | SMTP email sending | Already in pyproject.toml and used by `send_email()` in `app/utils.py` [VERIFIED: codebase] |
| Jinja2 | >=3.1.4, <4.0 | Email template rendering | Already in pyproject.toml and used by `render_email_template()` [VERIFIED: codebase] |
| PyJWT | >=2.8.0, <3.0 | Token generation for reset/verification links | Already used for password reset tokens [VERIFIED: codebase] |
| Alembic | >=1.12.1, <2.0 | Database migrations | Already in project for schema changes [VERIFIED: codebase] |
| React Router | (bundled) | Client-side routing for new pages | Already used in App.tsx for all routes [VERIFIED: codebase] |
| Radix UI | various | UI primitives (Card, Input, Button, Label) | Already used in login-page.tsx [VERIFIED: codebase] |

### No New Dependencies Required

All functionality can be built with existing libraries. The `python-emails` library handles SMTP, Jinja2 renders templates, PyJWT creates secure time-limited tokens, and the frontend already has the component library and routing infrastructure. [VERIFIED: codebase audit]

## Architecture Patterns

### Existing Patterns to Follow

**Backend token pattern (password reset -- already implemented):**
```python
# Source: server/backend/app/utils.py
def generate_password_reset_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt
```
[VERIFIED: codebase -- this exact pattern exists and works]

**Email verification token pattern (new -- mirrors reset token):**
Use the same JWT-based token approach. Encode email as `sub`, set 48h expiry, add a `purpose: "email_verify"` claim to distinguish from reset tokens. Store token hash in DB column for single-use validation. [ASSUMED]

**Frontend page pattern (mirrors login-page.tsx):**
- Standalone page component outside `<ProtectedRoute>`
- Uses same Card/Input/Button/Label components from shadcn/ui
- Calls `apiRequest()` from `@/lib/api/client.ts`
- Shows toast on success/error via `sonner`
[VERIFIED: codebase -- login-page.tsx demonstrates this pattern]

### Recommended Project Structure (new files)

```
server/backend/
  app/
    api/routes/
      login.py              # Extend with /verify-email, /resend-verification
    models.py               # Add email_verified, email_verification_token, email_verification_sent_at to User
    utils.py                # Add generate_email_verification_token(), verify_email_verification_token(), generate_verification_email()
    email-templates/build/
      verify_email.html     # NEW email template
  app/alembic/versions/
    xxxx_add_email_verification_columns.py  # NEW migration

server/frontend/src/
  components/auth/
    forgot-password-page.tsx  # NEW
    reset-password-page.tsx   # NEW
    verify-email-page.tsx     # NEW
    email-verification-banner.tsx  # NEW -- shown in main layout for unverified users
  App.tsx                     # Add routes: /forgot-password, /reset-password, /verify-email
  contexts/auth-context.tsx   # Extend AuthUser with email_verified field
```

### Anti-Patterns to Avoid
- **Storing plain verification tokens in DB:** Use hashed tokens (same blake2b pattern as node token_index) to prevent token theft via DB breach [ASSUMED]
- **Blocking login for unverified users:** Per success criteria, unverified users CAN log in -- they see a banner and enter read-only mode after 7 days, not immediate lockout
- **Separate email verification endpoint from login router:** Keep all auth-adjacent routes in `login.py` for consistency with existing pattern [VERIFIED: codebase -- password recovery is in login.py]
- **Client-side only read-only enforcement:** The 7-day read-only must be enforced server-side (API returns 403 for write operations) not just via UI disabling [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token generation | Custom random string approach | PyJWT with expiry claims | Already used for password reset; tokens are self-validating with built-in expiry [VERIFIED: codebase] |
| Email sending | Direct SMTP via smtplib | `python-emails` library | Already configured with TLS/SSL, error handling. Tested path. [VERIFIED: codebase] |
| Email templates | Inline HTML strings | Jinja2 templates in email-templates/build/ | Existing pattern with proper HTML email formatting [VERIFIED: codebase] |
| Password hashing | bcrypt directly | pwdlib (argon2 + bcrypt) | Already handles hash upgrade path [VERIFIED: codebase] |
| Form components | Raw HTML inputs | Radix UI + shadcn/ui components | Already used throughout the frontend [VERIFIED: codebase] |

## Common Pitfalls

### Pitfall 1: Email Enumeration via Verification Endpoint
**What goes wrong:** `/verify-email` or `/resend-verification` reveals whether an email is registered
**Why it happens:** Different error messages for "user not found" vs "already verified"
**How to avoid:** Return generic success messages. The password recovery endpoint already does this correctly: `"If that email is registered, we sent a password recovery link"` [VERIFIED: codebase -- login.py line 131]
**Warning signs:** Different HTTP status codes for found vs not-found users

### Pitfall 2: Verification Token Reuse
**What goes wrong:** Same verification link can be used multiple times, or old links work after a new one is sent
**Why it happens:** Stateless JWT tokens are valid until expiry regardless of DB state
**How to avoid:** Store the token (or its hash) on the User model. On verification, check that the submitted token matches the stored one, then clear it. New token generation invalidates old tokens automatically by overwriting the stored hash.
**Warning signs:** Ability to verify with an old link after requesting a new one

### Pitfall 3: Existing Users Broken by Email Verification Migration
**What goes wrong:** v1.0 users marked as unverified, locked out or shown verification banner
**Why it happens:** Migration adds `email_verified` column defaulting to `False`
**How to avoid:** Migration MUST default `email_verified=True` for existing rows. Only new signups after this migration should default to `False` (handled in application code, not DB default). The Alembic migration should use `server_default='true'` and the SQLModel field should use `default=True`, but `crud.create_user()` must explicitly set `email_verified=False` for new registrations.
**Warning signs:** Existing users seeing verification banner after upgrade

### Pitfall 4: Read-Only Mode Not Enforced Server-Side
**What goes wrong:** Unverified users bypass read-only mode by calling API directly
**Why it happens:** Read-only enforcement only in frontend UI
**How to avoid:** Add a FastAPI dependency that checks `email_verified` + `created_at` for the 7-day window. Inject it on write endpoints (POST/PUT/PATCH/DELETE on sessions, nodes, projects). Do NOT block GET requests.
**Warning signs:** Curl commands bypassing read-only state

### Pitfall 5: Send Email Failure Blocking Signup
**What goes wrong:** Signup fails if SMTP is misconfigured
**Why it happens:** `send_email()` asserts `settings.emails_enabled`
**How to avoid:** Wrap verification email send in try/except. If emails are disabled, skip silently (user can still use the app). Phase 11 hardened email error handling -- follow the same pattern. [VERIFIED: codebase -- `emails_enabled` computed from SMTP_HOST and EMAILS_FROM_EMAIL]
**Warning signs:** 500 errors on signup when SMTP is not configured

## Code Examples

### Backend: Email Verification Token Generation (mirrors existing reset token)
```python
# Source: pattern from server/backend/app/utils.py generate_password_reset_token
def generate_email_verification_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)  # reuse same expiry
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email, "purpose": "email_verify"},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt

def verify_email_verification_token(token: str) -> str | None:
    try:
        decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=[security.ALGORITHM])
        if decoded.get("purpose") != "email_verify":
            return None
        return str(decoded["sub"])
    except InvalidTokenError:
        return None
```
[ASSUMED -- based on existing reset token pattern]

### Backend: Alembic Migration for Email Verification Columns
```python
# server/backend/app/alembic/versions/xxxx_add_email_verification_columns.py
def upgrade() -> None:
    op.add_column("user", sa.Column("email_verified", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("user", sa.Column("email_verification_token", sa.String(255), nullable=True))
    op.add_column("user", sa.Column("email_verification_sent_at", sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    op.drop_column("user", "email_verification_sent_at")
    op.drop_column("user", "email_verification_token")
    op.drop_column("user", "email_verified")
```
[ASSUMED -- follows existing migration patterns in codebase]

### Backend: Verify Email Endpoint
```python
# In login.py
@router.post("/verify-email")
def verify_email(session: SessionDep, token: str) -> Message:
    email = verify_email_verification_token(token=token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    if user.email_verified:
        return Message(message="Email already verified")
    user.email_verified = True
    user.email_verification_token = None
    session.add(user)
    session.commit()
    return Message(message="Email verified successfully")
```
[ASSUMED -- follows existing endpoint patterns]

### Frontend: Route additions in App.tsx
```tsx
// Outside ProtectedRoute (unauthenticated access needed)
<Route path="/login" element={<LoginPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />
<Route path="/verify-email" element={<VerifyEmailPage />} />
```
[ASSUMED -- follows existing route pattern in App.tsx]

### Frontend: Forgot Password Page (follows login-page.tsx pattern)
```tsx
// Minimal example -- follows Card/Input/Button pattern from login-page.tsx
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await apiRequest(`/password-recovery/${encodeURIComponent(email)}`, { method: 'POST' });
    setSubmitted(true); // Always show success to prevent enumeration
  }
  // ... render form or success message
}
```
[ASSUMED -- follows existing login-page.tsx component structure]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (backend), vitest (frontend) |
| Config file | server/backend/pyproject.toml, server/frontend/vite.config.ts |
| Quick run command | `cd server/backend && python -m pytest tests/api/routes/test_login.py -x` |
| Full suite command | `cd server/backend && python -m pytest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-07a | POST /password-recovery/{email} sends reset email | unit | `pytest tests/api/routes/test_login.py::test_recovery_password -x` | Exists |
| AUTH-07b | POST /reset-password/ changes password with valid token | unit | `pytest tests/api/routes/test_login.py::test_reset_password -x` | Exists |
| AUTH-07c | Frontend /forgot-password page submits email | unit | `cd server/frontend && npx vitest run --reporter=verbose -- forgot-password` | Wave 0 |
| AUTH-07d | Frontend /reset-password page submits new password | unit | `cd server/frontend && npx vitest run --reporter=verbose -- reset-password` | Wave 0 |
| AUTH-08a | POST /users/signup sends verification email | unit | `pytest tests/api/routes/test_users.py -x` | Needs extension |
| AUTH-08b | POST /verify-email marks user as verified | unit | `pytest tests/api/routes/test_login.py -x` | Wave 0 |
| AUTH-08c | Unverified user after 7 days gets 403 on writes | unit | `pytest tests/api/routes/test_login.py -x` | Wave 0 |
| AUTH-08d | Migration sets existing users as verified | unit | `pytest tests/test_foundation.py -x` | Wave 0 |
| AUTH-08e | Frontend verification banner shows for unverified | unit | `cd server/frontend && npx vitest run --reporter=verbose -- verification-banner` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/api/routes/test_login.py -x`
- **Per wave merge:** `cd server/backend && python -m pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/api/routes/test_login.py` -- extend with verify-email, resend-verification tests
- [ ] `tests/api/routes/test_users.py` -- extend signup test to check verification email sent
- [ ] `tests/test_email_verification_migration.py` -- test that existing rows get email_verified=True
- [ ] Frontend test files for forgot-password, reset-password, verify-email pages

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | PyJWT tokens with expiry for reset/verification links, pwdlib for password hashing |
| V3 Session Management | no | Cookie auth unchanged in this phase |
| V4 Access Control | yes | Read-only enforcement for unverified users (7-day grace) via FastAPI dependency |
| V5 Input Validation | yes | Pydantic models for all request bodies (email, password, token) |
| V6 Cryptography | no | Using existing PyJWT + pwdlib -- no new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Email enumeration via password reset | Information Disclosure | Return generic "if registered" message (already implemented) [VERIFIED: codebase] |
| Email enumeration via verification endpoint | Information Disclosure | Return generic success messages regardless of user existence |
| Token replay (verification link reused) | Spoofing | Store token hash on User model, clear on use, new token invalidates old |
| Password reset token brute force | Spoofing | JWT with short expiry (48h), HS256 signature prevents forgery [VERIFIED: codebase] |
| Unverified user bypass of read-only | Elevation of Privilege | Server-side enforcement via FastAPI dependency, not frontend-only |
| SMTP credential exposure in error messages | Information Disclosure | Catch SMTP errors, log server-side, return generic error to user |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Email verification token should use JWT with "purpose" claim to distinguish from reset tokens | Code Examples | LOW -- could use separate secret or different token format, but JWT with purpose claim is simplest |
| A2 | Store verification token hash on User model for single-use validation | Architecture Patterns | LOW -- alternative is stateless JWT only, but allows token reuse |
| A3 | 7-day read-only mode enforced via FastAPI dependency on write endpoints | Pitfalls | MEDIUM -- could be middleware instead, but dependency is more explicit and testable |
| A4 | `server_default='true'` in migration protects existing v1.0 users | Code Examples | HIGH if wrong -- v1.0 users would be locked out. Must test migration carefully. |
| A5 | Frontend pages go outside ProtectedRoute (unauthenticated access) | Architecture Patterns | LOW -- forgot-password and reset-password must be accessible without login; verify-email also needs unauthenticated access |

## Open Questions

1. **Should SMTP-disabled deployments skip verification entirely?**
   - What we know: `settings.emails_enabled` is False when SMTP_HOST is not set. Current signup works without email.
   - What's unclear: Should unverified users in SMTP-disabled deployments ever enter read-only mode?
   - Recommendation: If emails are disabled, auto-mark new users as verified (they cannot verify via email anyway). This preserves the self-hosted no-SMTP experience.

2. **Should the resend verification endpoint be rate-limited?**
   - What we know: No rate limiting exists on any current endpoint.
   - What's unclear: How aggressively to limit resend requests.
   - Recommendation: Simple cooldown -- check `email_verification_sent_at` and reject resend if < 60 seconds ago. No need for a full rate-limiting middleware.

## Sources

### Primary (HIGH confidence)
- Codebase audit: `server/backend/app/utils.py` -- existing email infrastructure (send_email, generate_password_reset_token, verify_password_reset_token, render_email_template)
- Codebase audit: `server/backend/app/api/routes/login.py` -- existing `/password-recovery/{email}` and `/reset-password/` endpoints
- Codebase audit: `server/backend/app/models.py` -- User model (no email_verified columns yet)
- Codebase audit: `server/backend/app/core/config.py` -- SMTP settings, EMAIL_RESET_TOKEN_EXPIRE_HOURS
- Codebase audit: `server/frontend/src/components/auth/login-page.tsx` -- frontend auth page pattern
- Codebase audit: `server/frontend/src/App.tsx` -- routing pattern, ProtectedRoute usage
- Codebase audit: `server/frontend/src/contexts/auth-context.tsx` -- AuthUser interface, AuthProvider

### Secondary (MEDIUM confidence)
- Phase 11 success criteria (ROADMAP.md) -- mentions email_verified columns should exist

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- backend password reset pattern fully implemented, just needs frontend pages and verification flow mirroring same pattern
- Pitfalls: HIGH -- common email auth pitfalls well-documented, existing codebase already handles enumeration prevention

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain, no fast-moving dependencies)
