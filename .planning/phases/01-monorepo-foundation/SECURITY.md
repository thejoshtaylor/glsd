# Security Audit — Phase 01: Monorepo Foundation

**Phase:** 01 — monorepo-foundation
**Plans Audited:** 01-01, 01-02
**ASVS Level:** L1
**Audit Date:** 2026-04-09
**Auditor:** gsd-security-auditor

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-01-01 | Information Disclosure | mitigate | OPEN | `.gitignore` uses `.env.*` (line 30) — covers `.env.local` and `.env.*.local` but does NOT match a bare `.env` file. Bare `.env` at any repo path is unprotected. |
| T-01-02 | Information Disclosure | accept | CLOSED | Accepted risk documented — git mv preserves history, no secrets in source files. |
| T-01-03 | Tampering | accept | CLOSED | Accepted risk documented — all pnpm packages are from pre-existing gsd-vibe lockfile, no new dependencies introduced. |
| T-01-04 | Information Disclosure | mitigate | OPEN | `server/docker-compose.yml` correctly uses `env_file: - .env` (not hardcoded vars) for db, prestart, and backend services. However the gitignore gap from T-01-01 means `server/.env` is not covered — `.env.*` does not match a bare `.env` filename. |

---

## Open Threats Detail

### T-01-01: Bare `.env` not matched by `.gitignore`

**File:** `/Users/josh/code/glsd/.gitignore`, line 30
**Current pattern:** `.env.*`
**Required patterns (per mitigation plan):** `.env`, `.env.local`, `.env.*.local`

The glob `.env.*` matches filenames of the form `.env.<something>` (e.g. `.env.local`, `.env.production`). It does not match a file named exactly `.env` because `.env` has no dot-separated suffix after `env`. A `server/.env` or root `.env` file would not be caught by git and could be committed if created.

**Required fix:** Replace `.env.*` with the three explicit patterns from the mitigation plan:
```
.env
.env.local
.env.*.local
!.env.example
```

### T-01-04: Depends on T-01-01 fix

Once `.env` is added to `.gitignore`, T-01-04 closes. The Docker Compose `env_file` references are correctly structured (file references, not hardcoded values).

---

## Accepted Risks Log

| Threat ID | Category | Rationale | Accepted By |
|-----------|----------|-----------|-------------|
| T-01-02 | Information Disclosure (git history) | `git mv` preserves history by design. Old paths visible in git log is expected behavior. No secrets exist in tracked source files — only in `.env` files which are gitignored. | Plan 01-01 threat model |
| T-01-03 | Tampering (pnpm lifecycle scripts) | All packages originate from the pre-existing gsd-vibe lockfile. No new third-party dependencies were introduced in Phase 01. The attack surface is identical to the pre-restructure state. | Plan 01-02 threat model |

---

## Unregistered Threat Flags

None — neither 01-01-SUMMARY.md nor 01-02-SUMMARY.md contain a `## Threat Flags` section.
