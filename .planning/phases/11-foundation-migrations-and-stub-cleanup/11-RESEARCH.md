# Phase 11: Foundation -- Migrations and Stub Cleanup - Research

**Researched:** 2026-04-11
**Domain:** Database migrations (Alembic/SQLModel), frontend API wiring (React/TypeScript), email error handling (FastAPI/Python)
**Confidence:** HIGH

## Summary

Phase 11 is a stabilization phase with three distinct workstreams: (1) database migration audit and repair, (2) Tauri stub replacement with real server API calls, and (3) email error handling hardening. The codebase is well-understood -- all three workstreams operate on existing code with established patterns.

The migration work is straightforward: the existing migration chain uses a safe `IF NOT EXISTS` / inspector-based pattern that should be replicated. The Tauri stub replacement is the largest workstream by volume (~130 exported stub functions in `lib/tauri.ts`, ~75 files importing from it), but many stubs only need to return empty/default data since the features they power (GSD project management, local file operations) are Tauri-desktop concepts that don't map to the cloud architecture. The email fix is surgical: 3 call sites, one utility function, add status code checking and HTTPException wrapping.

**Primary recommendation:** Split into 3 sub-plans: (1) migrations + 500 fix, (2) Tauri stub wiring, (3) email error handling. Execute in that order since the migration sub-plan unblocks page rendering which is needed to verify Tauri stub replacements.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Perform a broader model-vs-DB audit -- compare all SQLModel models against the current alembic migration chain output. Fix ALL model fields not covered by existing migrations in one consolidated Phase 11 migration.
- **D-02:** Add all new tables/columns needed by future phases in Phase 11: `push_subscription` table, `usage_record` table, and User columns `email_verified`, `email_verification_token`, `email_verification_sent_at`. Use nullable/safe-default patterns.
- **D-03:** The stub migration `f9f573bd285c` is already applied on v1.0 deployments. Repair it by adding a NEW migration (not editing the existing one) that detects and fills whatever the stub missed.
- **D-04:** All Tauri function calls -- including those requiring new backend infrastructure -- should be wired to real server REST API implementations.
- **D-05:** Where a real implementation requires new server endpoints that don't yet exist, add those endpoints.
- **D-06:** Type-only imports from `lib/tauri.ts` are acceptable as-is. Only function call stubs need replacement.
- **D-07:** `ptyWrite` and PTY session management may already be wired via `useCloudSession` hook -- verify before re-implementing.
- **D-08:** `send_email()` must raise on non-success response.
- **D-09:** Callers must catch and return HTTP 503 (SMTP misconfigured) or HTTP 502 (send failure).
- **D-10:** Both error paths use HTTPException with distinct status codes.

### Claude's Discretion
- Migration column defaults and nullability choices
- Sub-plan breakdown (suggested: 3 sub-plans)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-01 | Nodes and projects pages load without 500 errors (node.token_hash and all other missing columns present via migration) | Migration audit findings (Section: Architecture Patterns > Migration Chain Analysis); safe column-add pattern documented |
| FIX-02 | All Tauri stubs required for full frontend functionality replaced with web equivalents or graceful no-ops | Tauri stub inventory (Section: Architecture Patterns > Tauri Stub Inventory); categorization of which stubs need real APIs vs. no-ops |
| FIX-03 | Email sends raise on non-success response so auth email failures are surfaced | Email call site analysis (Section: Architecture Patterns > Email Error Handling); exact code locations and fix pattern |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Alembic | >=1.12.1 | Database migrations | Already in pyproject.toml, established migration chain [VERIFIED: pyproject.toml] |
| SQLModel | >=0.0.21 | ORM / model definitions | Already in use, all models defined in models.py [VERIFIED: models.py] |
| FastAPI | >=0.114.2 | HTTP + WebSocket server | Already running, routes established [VERIFIED: pyproject.toml] |
| React | 18.3.x | Frontend framework | Already in use [VERIFIED: CLAUDE.md] |
| TanStack React Query | >=5.62.0 | Data fetching | Already used for API calls [VERIFIED: CLAUDE.md] |
| sonner | (installed) | Toast notifications | Already used for error/success toasts [VERIFIED: use-cloud-session.ts] |

### Supporting (no new installs needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| emails | >=0.6 | SMTP email sending | Already in pyproject.toml, used by send_email() [VERIFIED: utils.py] |
| Pydantic | >2.0 | Request/response validation | Already in pyproject.toml [VERIFIED: pyproject.toml] |

**Installation:** No new packages required for Phase 11.

## Architecture Patterns

### Migration Chain Analysis

The current Alembic migration chain (verified from source):

```
e2412789c190 (init)
  -> 9c0a54914c78 (max_length)
    -> d98dd8ec85a3 (uuid IDs)
      -> 1a31ce608336 (cascade delete)
        -> fe56fa70289e (created_at)
          -> f9f573bd285c (STUB - empty)
            -> a1b2c3d4e5f6 (node/session/session_event tables)
              -> b3c4d5e6f7a8 (token_index on node)
                -> c1d2e3f4a5b6 (projects table)
                  -> d2e3f4a5b6c7 (name on node)
                    -> e3f4a5b6c7d8 (user_id on node)
                      -> f4a5b6c7d8e9 (machine_id on node)
                        -> a5b6c7d8e9f0 (HEAD - fix project columns)
```

[VERIFIED: alembic/versions/ directory listing + revision chain grep]

**Stub migration f9f573bd285c:** Empty upgrade/downgrade -- it's a placeholder that repaired a broken revision chain. The original migration content is unknown. Per D-03, a NEW migration must be added after HEAD (a5b6c7d8e9f0) that detects and fills anything the stub missed.

**Model-vs-migration audit:** Current SQLModel models define these tables: `user`, `item`, `node`, `session`, `session_event`, `project`. The migration chain creates all of them. The key question for FIX-01 is whether all COLUMNS on each table match between models.py and the cumulative migration output.

Key columns to verify (from models.py vs migration chain):

| Table | Column | In models.py | Migration that adds it | Status |
|-------|--------|-------------|----------------------|--------|
| node | token_hash | Yes | a1b2c3d4e5f6 | Should exist [VERIFIED: models.py line 145] |
| node | token_index | Yes | b3c4d5e6f7a8 | Should exist [VERIFIED: models.py line 146] |
| node | name | Yes | d2e3f4a5b6c7 | Should exist [VERIFIED: models.py line 138] |
| node | user_id | Yes | e3f4a5b6c7d8 | Should exist [VERIFIED: models.py line 143] |
| node | machine_id | Yes | f4a5b6c7d8e9 | Should exist [VERIFIED: models.py line 144] |
| project | node_id | Yes | a5b6c7d8e9f0 (fix) | Should exist [VERIFIED: models.py line 242] |
| project | cwd | Yes | a5b6c7d8e9f0 (fix) | Should exist [VERIFIED: models.py line 243] |
| project | user_id | Yes | a5b6c7d8e9f0 (fix) | Should exist [VERIFIED: models.py line 247] |

**New tables/columns for Phase 11 (D-02):**

These do NOT exist in models.py yet. Phase 11 must add both the models AND the migration:

| Table/Column | Type | Default | Purpose | Phase |
|-------------|------|---------|---------|-------|
| `push_subscription` (new table) | Table | N/A | Web Push subscription storage | Phase 14 |
| `usage_record` (new table) | Table | N/A | Per-session token usage tracking | Phase 12 |
| `user.email_verified` | Boolean | `False` (existing v1.0 users: `True` per AUTH-08) | Email verification status | Phase 13 |
| `user.email_verification_token` | String, nullable | `None` | Pending verification token | Phase 13 |
| `user.email_verification_sent_at` | DateTime, nullable | `None` | When verification was sent | Phase 13 |

[ASSUMED: exact column types for push_subscription and usage_record -- will need to be designed based on future phase requirements]

### Pattern 1: Safe Column-Add Migration

**What:** Alembic migration that uses inspector to check column existence before adding
**When to use:** Always -- every new column/table addition in Phase 11
**Example:**
```python
# Source: a5b6c7d8e9f0_fix_missing_columns_in_project_table.py (verified)
def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("user")]
    
    if "email_verified" not in columns:
        op.add_column("user", sa.Column("email_verified", sa.Boolean(), 
                       nullable=False, server_default=sa.text("true")))
    # server_default="true" so existing v1.0 users are treated as verified (AUTH-08)
```

### Pattern 2: Tauri Stub Replacement via lib/api/ Modules

**What:** Replace tauri.ts stub exports with real server API calls
**When to use:** For each functional stub that has a corresponding backend API

The frontend already has a `lib/api/` directory with:
- `client.ts` -- shared fetch wrapper with cookie auth [VERIFIED]
- `auth.ts` -- authentication API calls [VERIFIED: directory listing]
- `nodes.ts` -- node API calls [VERIFIED]
- `projects.ts` -- project CRUD API calls [VERIFIED]
- `sessions.ts` -- session API calls [VERIFIED]
- `ws.ts` -- WebSocket client [VERIFIED]

**Strategy:** For each Tauri stub that needs real wiring, either:
1. Add the implementation to an existing `lib/api/*.ts` module
2. Update the stub in `lib/tauri.ts` to delegate to the `lib/api/` module
3. OR update the importing component to import from `lib/api/` directly

Per D-06, type-only imports from tauri.ts are acceptable. Only function call stubs need replacement.

### Tauri Stub Inventory

Total exported function stubs in `lib/tauri.ts`: ~130 [VERIFIED: grep output]
Total files importing from `lib/tauri.ts`: ~75 [VERIFIED: grep output]

**Category breakdown of stubs by implementation strategy:**

**Category A -- Already have backend APIs (wire to existing endpoints):**
- `listProjects`, `getProject`, `deleteProject` -- already in `lib/api/projects.ts` [VERIFIED]
- Session operations -- already in `lib/api/sessions.ts` [VERIFIED]
- Node operations -- already in `lib/api/nodes.ts` [VERIFIED]

**Category B -- Need new backend endpoints (D-05):**
- `pickFolder` -- Node-side folder browsing. Needs new endpoint: POST `/api/v1/nodes/{node_id}/browse` that sends a command to the daemon via WebSocket
- `checkProjectPath` -- Path existence check on node. Needs endpoint: POST `/api/v1/nodes/{node_id}/check-path`
- `scaffoldProject` -- Project scaffold on node. Needs endpoint or can be done via session
- `readProjectFile` -- File read on node. Needs endpoint: GET `/api/v1/nodes/{node_id}/files?path=...`
- Secrets management (`setSecret`, `getSecret`, `deleteSecret`, `listSecretKeys`, `hasSecret`, `getPredefinedSecretKeys`) -- Needs server-side secrets storage (Node secrets stored server-side, synced to node on connection)
- Snippets (`listSnippets`, `createSnippet`, `updateSnippet`, `deleteSnippet`) -- Needs server-side snippet storage

**Category C -- PTY operations (verify D-07 status):**
`ptyWrite` is imported directly from `lib/tauri.ts` in:
- `gsd2-session-tab.tsx` (line 31, 67) -- uses it to write to a headless session [VERIFIED]
- `gsd2-chat-tab.tsx` (line 24, 321) -- uses it to send text to PTY [VERIFIED]
- `use-pty-session.ts` (line 8, 368) -- general PTY write hook [VERIFIED]

The `useCloudSession` hook does NOT use `ptyWrite` -- it uses its own WebSocket-based `sendTask` method. These are different pathways:
- `useCloudSession.sendTask()` = send a new task prompt via WebSocket protocol message [VERIFIED: use-cloud-session.ts]
- `ptyWrite()` = write raw bytes to a PTY session (Tauri-only concept) [VERIFIED: tauri.ts line 649]

**D-07 verdict: `ptyWrite` is NOT already wired via useCloudSession.** The cloud session uses protocol-level messages (task, stop, permissionResponse), not raw PTY byte writes. Components that call `ptyWrite` directly need to be re-wired to use the cloud session's WebSocket-based input mechanism, or a new PTY-over-WebSocket endpoint.

**Category D -- GSD project management (Tauri-desktop only, graceful no-ops):**
These are Tauri-desktop features that read local `.planning/` directories. In cloud mode, these don't apply because project management happens on the node. These stubs should return safe empty/default values (they already do). Examples:
- `gsdGetState`, `gsdGetConfig`, `gsdListRequirements`, `gsdListMilestones`, etc. (~30 stubs)
- `gsd2GetHealth`, `gsd2ListWorktrees`, `gsd2GetVisualizerData`, etc. (~25 stubs)
- `gsd2GetDoctorReport`, `gsd2GetForensicsReport`, `gsd2GetSkillHealth` (~5 stubs)

**Category E -- Local-only features (no cloud equivalent, graceful no-ops):**
- Git operations (`gitPush`, `gitPull`, `gitFetch`, `gitCommit`, etc.) -- run on node, not through server
- File watching (`watchProjectFiles`, `unwatchProjectFiles`) -- Tauri filesystem watcher
- App logs (`getAppLogs`, `logFrontendEvent`) -- Tauri-local logging
- Onboarding (`onboardingGetStatus`, `onboardingDetectDependencies`) -- Tauri-local setup
- Close warning (`canSafelyClose`, `forceCloseAll`) -- Tauri window management
- Data export/clear (`exportData`, `clearAllData`) -- Tauri-local data
- Settings (`getSettings`, `updateSettings`, `resetSettings`) -- Tauri-local settings
- Notifications (`getNotifications`, `createNotification`) -- Tauri-local notifications (Phase 14 will add server-side Web Push)

**Per D-04, ALL stubs should be wired to real implementations.** This is a significant scope expansion -- many Category D and E stubs would need entirely new backend endpoints to implement properly. The planner needs to prioritize:
1. Category A (already have APIs) -- quick wins
2. Category B (need new endpoints but are actively used in the UI) -- medium effort
3. Category C (PTY wiring) -- needs design decision on cloud PTY input
4. Category D+E stubs that are actively rendering in the UI vs. those that return empty data to unused UI panels

### Pattern 3: Email Error Handling

**Current code (verified from utils.py):**
```python
# Line 39: assert raises AssertionError when emails_enabled=False
assert settings.emails_enabled, "no provided configuration for email variables"
# Line 54-55: response logged but status not checked
response = message.send(to=email_to, smtp=smtp_options)
logger.info(f"send email result: {response}")
```

**Problems:**
1. `assert` is stripped in optimized Python (`python -O`). Use explicit check instead. [VERIFIED: utils.py line 39]
2. `response` status code is never checked. `emails.Message.send()` returns a response object with `.status_code` attribute. [VERIFIED: utils.py line 54-55]
3. Callers don't wrap `send_email()` in try/except. [VERIFIED: login.py line 126, users.py line 72, utils.py line 21]

**Call sites (3 total):**
1. `login.py:126` -- password recovery email (inside `if user:` block)
2. `users.py:72` -- new account email (inside `if settings.emails_enabled:` block)
3. `utils.py:21` -- test email endpoint

**Fix pattern:**
```python
# In utils.py send_email():
if not settings.emails_enabled:
    raise ValueError("Email sending is not configured")
response = message.send(to=email_to, smtp=smtp_options)
if response.status_code not in (250, 251, 252):  # SMTP success codes
    raise RuntimeError(f"Email send failed: {response.status_code}")

# In each caller route:
try:
    send_email(...)
except ValueError:
    raise HTTPException(status_code=503, detail="Email not configured")
except (RuntimeError, Exception) as e:
    raise HTTPException(status_code=502, detail="Email send failed")
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database migration safety | Manual ALTER TABLE SQL | Alembic + inspector pattern from a5b6c7d8e9f0 | The existing pattern handles column existence checks, index creation, foreign keys correctly |
| API client wrapper | New fetch utilities | Existing `lib/api/client.ts` `apiRequest()` function | Already handles auth cookies, error extraction, 204 responses |
| Toast notifications | Custom notification system | `sonner` `toast.error()` | Already used in 10+ places across the codebase |
| WebSocket communication | New WS wrapper | Existing `GsdWebSocket` class in `lib/api/ws.ts` | Already handles reconnection, heartbeat, message routing |

## Common Pitfalls

### Pitfall 1: Editing the Stub Migration
**What goes wrong:** Editing `f9f573bd285c` breaks v1.0 deployments where it's already been applied as a no-op
**Why it happens:** Intuition says "fix the broken file"
**How to avoid:** D-03 explicitly requires a NEW migration. Always append, never edit applied migrations.
**Warning signs:** Any edit to `f9f573bd285c_stub_missing_revision.py`

### Pitfall 2: Existing User email_verified Default
**What goes wrong:** Setting `email_verified` default to `False` locks out all existing v1.0 users when Phase 13 adds verification checks
**Why it happens:** Boolean columns commonly default to False
**How to avoid:** Use `server_default=sa.text("true")` so existing rows get `True`. Phase 13's signup flow will explicitly set `False` for new users.
**Warning signs:** AUTH-08 explicitly states "existing v1.0 users are not affected"

### Pitfall 3: Scope Creep on Tauri Stubs
**What goes wrong:** Trying to implement full-featured equivalents for 130+ Tauri stubs delays the phase indefinitely
**Why it happens:** D-04 says "wire ALL Tauri function calls to real server REST API implementations"
**How to avoid:** Prioritize stubs that cause visible errors in the UI. Many stubs (Category D: GSD project management, Category E: local-only features) return empty arrays/null which causes empty states, not errors. Focus on Category A (existing APIs), B (new endpoints for actively-used UI), and C (PTY) first.
**Warning signs:** Phase exceeds 3 sub-plans

### Pitfall 4: PTY Write vs Cloud Session Confusion
**What goes wrong:** Assuming `useCloudSession` already handles `ptyWrite` because the context comment says so
**Why it happens:** `terminal-context.tsx` line 3 says "Tauri save/restore/ptyWrite removed -- cloud sessions via useCloudSession"
**How to avoid:** This comment means the terminal context no longer calls ptyWrite directly -- it delegates to useCloudSession. But `gsd2-session-tab.tsx` and `gsd2-chat-tab.tsx` STILL import and call `ptyWrite` directly from tauri.ts. These need to be rewired.
**Warning signs:** `ptyWrite` imports remaining in component files after "wiring complete"

### Pitfall 5: Assert in Production Python
**What goes wrong:** `assert settings.emails_enabled` is silently skipped when Python runs with `-O` flag
**Why it happens:** Python `assert` statements are removed in optimized mode
**How to avoid:** Replace with explicit `if not settings.emails_enabled: raise ValueError(...)`
**Warning signs:** Email sends silently attempted with no SMTP config in production

## Code Examples

### Migration: Add New Column with Safe Default
```python
# Source: server/backend/app/alembic/versions/a5b6c7d8e9f0 (verified pattern)
def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    user_columns = [col["name"] for col in inspector.get_columns("user")]
    
    if "email_verified" not in user_columns:
        op.add_column("user", sa.Column(
            "email_verified", sa.Boolean(), nullable=False,
            server_default=sa.text("true")  # existing users treated as verified
        ))
    
    if "email_verification_token" not in user_columns:
        op.add_column("user", sa.Column(
            "email_verification_token",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True
        ))
    
    if "email_verification_sent_at" not in user_columns:
        op.add_column("user", sa.Column(
            "email_verification_sent_at",
            sa.DateTime(timezone=True),
            nullable=True
        ))
```

### Migration: Create New Table with IF NOT EXISTS
```python
# Source: a1b2c3d4e5f6 pattern (verified)
def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if "usage_record" not in existing_tables:
        op.create_table(
            "usage_record",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("session_id", sa.Uuid(), sa.ForeignKey("session.id"), nullable=False),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_usd", sa.Numeric(precision=10, scale=6), nullable=False, server_default="0"),
            sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_usage_record_session_id", "usage_record", ["session_id"])
        op.create_index("ix_usage_record_user_id", "usage_record", ["user_id"])
```

### Tauri Stub Replacement: Delegate to lib/api/
```typescript
// Source: existing pattern in lib/api/projects.ts (verified)
// In lib/tauri.ts, replace the stub:

// BEFORE:
export const listProjects = (): Promise<Project[]> => {
  console.warn('[tauri-stub] listProjects called');
  return Promise.resolve([]);
};

// AFTER: delegate to existing API module
import { listProjects as apiListProjects } from './api/projects';
export const listProjects = async (): Promise<Project[]> => {
  const result = await apiListProjects();
  return result.data; // adapt shape if needed
};
```

### Email Error Handling Fix
```python
# Source: server/backend/app/utils.py (verified, then modified per D-08/D-09)
def send_email(*, email_to: str, subject: str = "", html_content: str = "") -> None:
    if not settings.emails_enabled:
        raise ValueError("Email sending is not configured on this server")
    
    message = emails.Message(
        subject=subject,
        html=html_content,
        mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    )
    smtp_options = {"host": settings.SMTP_HOST, "port": settings.SMTP_PORT}
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        smtp_options["password"] = settings.SMTP_PASSWORD
    
    response = message.send(to=email_to, smtp=smtp_options)
    logger.info(f"send email result: {response}")
    
    if response.status_code not in (250, 251, 252):
        raise RuntimeError(
            f"Email send failed with status {response.status_code}"
        )
```

```python
# Caller pattern (e.g., in login.py):
from fastapi import HTTPException

try:
    send_email(
        email_to=user.email,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
except ValueError:
    raise HTTPException(status_code=503, detail="Email not configured")
except Exception:
    raise HTTPException(status_code=502, detail="Email send failed")
```

### Toast Error Pattern (Frontend)
```typescript
// Source: 11-UI-SPEC.md copywriting contract (verified)
import { toast } from 'sonner';

// On catching a 503 from email endpoint:
toast.error("Email not available", {
  description: "Email sending is not configured on this server. Contact your server admin.",
});

// On catching a 502:
toast.error("Email failed to send", {
  description: "The server could not deliver the email. Check SMTP settings and try again.",
});
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | pytest >=7.4.3 |
| Framework (frontend) | vitest (inferred from .test.tsx files) |
| Config file (backend) | pyproject.toml [tool.pytest] section |
| Config file (frontend) | vite.config.ts (inferred) |
| Quick run command (backend) | `cd server/backend && python -m pytest tests/ -x -q` |
| Quick run command (frontend) | `cd server/frontend && pnpm test -- --run` |
| Full suite command | `cd server/backend && python -m pytest tests/ && cd ../../server/frontend && pnpm test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIX-01 | Nodes/Projects pages load after migration | integration | `cd server/backend && python -m pytest tests/test_foundation.py -x` | Exists (test_foundation.py) |
| FIX-01 | Migration adds all missing columns | integration | `cd server/backend && python -m pytest tests/api/ -x -k "node or project"` | Exists (tests/api/) |
| FIX-02 | No Tauri stub warnings in console | manual | grep for `[tauri-stub]` console.warn calls remaining in actively-used components | Manual only |
| FIX-02 | Project wizard works without Tauri | unit | `cd server/frontend && pnpm test -- --run -t "wizard"` | Exists (project-wizard-dialog.test.tsx) |
| FIX-03 | Email raises on misconfigured SMTP | unit | `cd server/backend && python -m pytest tests/ -x -k "email"` | Wave 0 gap |
| FIX-03 | Email raises on send failure | unit | `cd server/backend && python -m pytest tests/ -x -k "email"` | Wave 0 gap |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/ -x -q`
- **Per wave merge:** Full backend + frontend test suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_email_error_handling.py` -- covers FIX-03 (email raises on failure, callers return correct HTTP status)
- [ ] Verify `tests/test_foundation.py` covers the new migration columns (may need extension)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (no auth changes) | Existing PyJWT + cookie auth unchanged |
| V3 Session Management | No (no session changes) | Existing cookie-based sessions unchanged |
| V4 Access Control | Yes (new endpoints need auth) | FastAPI `Depends(CurrentUser)` on all new routes |
| V5 Input Validation | Yes (new API endpoints) | Pydantic models for request validation, path sanitization on file read endpoints |
| V6 Cryptography | No | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal on `readProjectFile` | Tampering | Validate file path is within project cwd; reject `..` segments |
| SMTP credential exposure in error messages | Information Disclosure | Generic error messages per D-09 (502/503), never expose SMTP connection details |
| Unauthenticated access to new endpoints | Elevation of Privilege | All new endpoints must use `Depends(CurrentUser)` or `Depends(get_current_active_superuser)` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `push_subscription` table schema (columns: id, user_id, endpoint, p256dh, auth, created_at) | Architecture Patterns | Low -- Phase 14 will refine; only table creation matters now |
| A2 | `usage_record` table schema (columns: id, session_id, user_id, input_tokens, output_tokens, cost_usd, duration_ms, created_at) | Architecture Patterns | Low -- Phase 12 will refine; schema can be altered later |
| A3 | `emails.Message.send()` returns object with `.status_code` attribute | Email Error Handling | Medium -- if API differs, the check pattern changes. Library is `emails` (python-emails) |
| A4 | SMTP success codes are 250, 251, 252 | Code Examples | Low -- standard SMTP; 250 is by far the most common |

## Open Questions

1. **How should PTY write work in cloud mode?**
   - What we know: `ptyWrite` is called directly from `gsd2-session-tab.tsx` and `gsd2-chat-tab.tsx`. `useCloudSession` does NOT cover this -- it handles task/stop/permission protocol messages, not raw PTY byte writes.
   - What's unclear: Should PTY write go through a new WebSocket message type, a REST endpoint, or should these components be rewired to use `useCloudSession.sendTask()` instead?
   - Recommendation: These components are for headless GSD2 sessions (a Tauri-desktop concept). In cloud mode, the user interacts via `useCloudSession` which sends protocol-level `task` messages. The planner should determine if `gsd2-session-tab` and `gsd2-chat-tab` are even reachable in cloud mode -- if not, the stubs can remain as no-ops.

2. **Which Category D+E stubs are actively rendered in the cloud UI?**
   - What we know: ~75 files import from tauri.ts, but many are for Tauri-desktop features (GSD project management, local file operations, etc.)
   - What's unclear: Which pages/components are actually navigable in the cloud frontend? The cloud app may not expose routes to all these features.
   - Recommendation: The planner should audit the router to determine which pages are reachable and prioritize stubs used by those pages.

3. **Exact push_subscription and usage_record schema**
   - What we know: These tables are needed by Phase 12 (usage) and Phase 14 (push notifications)
   - What's unclear: Exact column names, types, and constraints haven't been designed yet
   - Recommendation: Use the requirements (COST-01, NOTF-01) to derive minimal schema. Can be altered in later phases if needed.

## Sources

### Primary (HIGH confidence)
- `server/backend/app/models.py` -- all SQLModel model definitions [VERIFIED: read file]
- `server/backend/app/utils.py` -- send_email() implementation [VERIFIED: read file]
- `server/frontend/src/lib/tauri.ts` -- all Tauri stub exports [VERIFIED: grep + read]
- `server/backend/app/alembic/versions/` -- full migration chain [VERIFIED: directory listing + revision grep]
- `server/frontend/src/lib/api/` -- existing API modules [VERIFIED: directory listing + read]
- `server/frontend/src/hooks/use-cloud-session.ts` -- cloud session hook [VERIFIED: read file]
- `server/backend/app/api/routes/` -- all route files [VERIFIED: directory listing + read]

### Secondary (MEDIUM confidence)
- `11-CONTEXT.md` -- user decisions from discuss phase [VERIFIED: read file]
- `11-UI-SPEC.md` -- UI design contract [VERIFIED: read file]
- `.planning/REQUIREMENTS.md` -- requirement definitions [VERIFIED: read file]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new installs
- Architecture (migrations): HIGH -- established pattern with verified examples
- Architecture (Tauri stubs): MEDIUM -- scope is large (130+ stubs), prioritization strategy needs planner judgment
- Architecture (email): HIGH -- surgical fix, 3 call sites, clear pattern
- Pitfalls: HIGH -- all based on verified code analysis

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable codebase, no external dependency changes expected)
