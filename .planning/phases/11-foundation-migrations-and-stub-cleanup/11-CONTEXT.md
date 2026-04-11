# Phase 11: Foundation -- Migrations and Stub Cleanup - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Stabilize the v1.0 codebase into a v1.1 foundation: fix all 500 errors on Nodes/Projects pages, replace all Tauri stubs with real server API implementations (or graceful no-ops where infra doesn't yet exist), harden email error handling, and add all new database tables/columns needed by phases 12-14.

**This phase does NOT implement usage tracking, email auth flows, push notifications, or Redis scaling.** It creates the DB schema and wires the frontend so those features can be built cleanly.

</domain>

<decisions>
## Implementation Decisions

### Database Migrations (FIX-01)

- **D-01:** Perform a broader model-vs-DB audit — compare all SQLModel models against the current alembic migration chain output. Fix ALL model fields not covered by existing migrations in one consolidated Phase 11 migration. Do not scope only to known gaps like `node.token_hash`.
- **D-02:** Add all new tables/columns needed by future phases in Phase 11: `push_subscription` table, `usage_record` table, and User columns `email_verified`, `email_verification_token`, `email_verification_sent_at`. Use nullable/safe-default patterns so existing v1.0 rows are not affected.
- **D-03:** The stub migration `f9f573bd285c_stub_missing_revision.py` is already applied on v1.0 deployments. Repair it by adding a NEW migration (not editing the existing one) that detects and fills whatever the stub missed. This double-applies cleanly on fresh installs and is a no-op on v1.0 upgrades that already applied the stub.

### Tauri Stub Replacement (FIX-02)

- **D-04:** All Tauri function calls — including those requiring new backend infrastructure — should be wired to real server REST API implementations. This includes: project creation wizard (`pickFolder`, `scaffoldProject`, `checkProjectPath`), project file access (`readProjectFile`), terminal PTY input (`ptyWrite`), GSD todos, snippets, secrets manager, and diagnostics panels.
- **D-05:** Where a real implementation requires new server endpoints that don't yet exist, add those endpoints. Phase 11 scope explicitly includes adding whatever backend is needed to make the frontend fully functional without Tauri.
- **D-06:** Type-only imports from `lib/tauri.ts` (no runtime behavior) are acceptable as-is for Phase 11. Only function call stubs need replacement. The `lib/tauri.ts` stub layer can be incrementally replaced — no requirement to delete it all at once.
- **D-07:** Note: `ptyWrite` and PTY session management appear already wired via `useCloudSession` hook per code comments. Researcher should verify before re-implementing.

### Email Error Handling (FIX-03)

- **D-08:** `send_email()` in `utils.py` must raise on non-success response (check `response.status_code`). Do not silently swallow failures.
- **D-09:** Callers of `send_email()` must catch the error and return a meaningful HTTP exception:
  - SMTP misconfigured (`emails_enabled=False`): HTTP 503 "Email not configured"
  - Send failure (non-2xx from SMTP server or connection error): HTTP 502 "Email send failed"
  - Both are surfaced as error responses so the frontend can show a toast/error message to the user.
- **D-10:** Both error paths use the same structural code path (raise HTTPException) but with distinct status codes and messages for debuggability by self-hosted admins.

### Claude's Discretion

- Migration column defaults and nullability choices: use safe nullable/server-default patterns consistent with existing migrations — planner can decide exact SQL.
- Sub-plan breakdown: Phase 11 is large (migrations + Tauri wiring + email hardening). Planner should break into multiple sub-plans. Suggested split: (1) migrations + 500 fix, (2) Tauri stub wiring, (3) email error handling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — FIX-01, FIX-02, FIX-03 requirements and acceptance criteria
- `.planning/ROADMAP.md` §Phase 11 — Success criteria (4 items) and phase goal

### Database / Migrations
- `server/backend/app/models.py` — Authoritative SQLModel model definitions; compare vs. migration output
- `server/backend/app/alembic/versions/` — Full migration chain; note stub `f9f573bd285c`
- `server/backend/app/alembic/versions/a5b6c7d8e9f0_fix_missing_columns_in_project_table.py` — Example of `IF NOT EXISTS`/safe-upgrade migration pattern to follow
- `server/backend/app/alembic/versions/e3f4a5b6c7d8_add_user_id_to_node_if_missing.py` — Another example of safe column-add pattern

### Email
- `server/backend/app/utils.py` — `send_email()` function (line 33-55); target for FIX-03
- `server/backend/app/api/routes/users.py` — Callers of send_email; need HTTPException handling added
- `server/backend/app/api/routes/utils.py` — Additional email send callers

### Tauri Stubs
- `server/frontend/src/lib/tauri.ts` — Central stub layer (D-02 pattern); all Tauri imports route through here
- `server/frontend/src/components/projects/project-wizard-dialog.tsx` — Uses `pickFolder`, `scaffoldProject`, `checkProjectPath`
- `server/frontend/src/components/projects/guided-project-wizard.tsx` — Same Tauri calls as wizard dialog
- `server/frontend/src/components/projects/import-project-dialog.tsx` — Uses `pickFolder`
- `server/frontend/src/components/project/env-vars-tab.tsx` — Uses `readProjectFile`
- `server/frontend/src/components/settings/secrets-manager.tsx` — Imports from lib/tauri
- `server/frontend/src/components/project/diagnostics-panels.tsx` — Imports from lib/tauri

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useCloudSession` hook: Already handles PTY WebSocket communication — `ptyWrite` may already be wired; researcher should verify before adding new implementation
- Existing alembic migrations: Strong pattern of `IF NOT EXISTS` and nullable-column-add for safe upgrades; all new migrations should follow this pattern
- `lib/tauri.ts`: Central stub layer already exists — new web implementations can be added here or in `lib/api/` modules and re-exported

### Established Patterns
- Alembic migrations: Always use `op.execute("ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...")` or SQLAlchemy `add_column` with `existing_type` for safe upgrades
- FastAPI error handling: Routes use `HTTPException` with status codes; email handlers should follow same pattern
- Frontend API calls: TanStack React Query used for data fetching — new API endpoints should integrate with existing query hooks

### Integration Points
- `send_email()` callers: `app/api/routes/users.py`, `app/api/routes/utils.py`, `app/api/routes/login.py` — each needs HTTPException handling added
- Projects page and Nodes page: Must successfully render after DB migrations applied on v1.0 schema
- `server/frontend/src/lib/tauri.ts`: Entry point for replacing stubs with real API calls

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose to wire ALL Tauri stubs to real server APIs, even if it requires new endpoints. This is a deliberate scope expansion from FIX-02's "graceful no-ops" baseline.
- Migration repair for stub `f9f573bd285c`: Add a new follow-on migration that fills the gap, rather than editing the existing stub (safe for v1.0 upgraders).
- Email errors: distinct HTTP status codes (503 vs 502) are important for self-hosted admins debugging SMTP configuration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-foundation-migrations-and-stub-cleanup*
*Context gathered: 2026-04-11*
