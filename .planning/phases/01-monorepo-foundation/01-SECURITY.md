---
phase: "01"
slug: monorepo-foundation
status: verified
threats_open: 0
asvs_level: L1
created: 2026-04-09
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| .gitignore coverage | Secrets (.env) must not be committed during restructure | Environment variables, DB credentials, API keys |
| Build pipeline | Build commands must not execute untrusted code from moved files | Package lifecycle scripts |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01 | Information Disclosure | .env files | mitigate | `.gitignore` contains `.env`, `.env.local`, `.env.*.local` (bare `.env` pattern added — original executor used `.env.*` glob which missed bare `.env`). `!.env.example` allows the example file. Verified: `.gitignore` lines 30–33. | closed |
| T-01-02 | Information Disclosure | git history | accept | `git mv` preserves history. Old paths visible in history are expected and not a security concern — no secrets in source files. | closed |
| T-01-03 | Tampering | pnpm install scripts | accept | pnpm install runs package lifecycle scripts. All packages are the same ones already in gsd-vibe's lockfile — no new dependencies added. Risk is pre-existing and unchanged by the restructure. | closed |
| T-01-04 | Information Disclosure | Docker .env in compose | mitigate | `.gitignore` bare `.env` pattern (line 30) covers `server/.env` referenced by `env_file` in `server/docker-compose.yml` (lines 14–15, 44–45, 76–77). Verified post-fix. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-01-02 | git history visibility of old paths is expected behavior for `git mv`; no secrets in tracked source files | Josh | 2026-04-09 |
| AR-01-02 | T-01-03 | pnpm lifecycle scripts run only pre-existing packages from gsd-vibe lockfile; no new dependencies introduced by the restructure | Josh | 2026-04-09 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-09 | 4 | 2 | 2 | gsd-security-auditor |
| 2026-04-09 | 4 | 4 | 0 | gsd-security-auditor (post-fix re-verify) |

**Fix applied between audits:** `.gitignore` line 30 changed from `.env.*` to `.env` (bare), with `.env.local` and `.env.*.local` added on lines 31–32. This closes T-01-01 and T-01-04.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-09
