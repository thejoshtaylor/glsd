---
phase: 01-monorepo-foundation
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - .gitignore
  - go.work
  - pnpm-workspace.yaml
  - package.json
  - server/frontend/package.json
  - server/docker-compose.yml
  - server/compose.override.yml
  - server/frontend/src/lib/tauri.ts
  - server/frontend/src/lib/query-keys.ts
  - server/frontend/src/lib/queries.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 01 was a structural scaffolding phase: establishing the monorepo layout, wiring up pnpm and Go workspaces, and adding the `useProjectWorkflows` TypeScript hook as a precursor to the Tauri removal work planned for Phase 4. The Docker Compose changes correctly comment out services not yet ready for production.

The primary risk identified is that `tauri.ts` still imports directly from `@tauri-apps/api/core` and `@tauri-apps/api/event`, and the newly added `getProjectWorkflows` function calls `invoke()` just like every other Tauri command. Despite the phase summary describing this as a "stub," there is no stub — it is a live Tauri IPC call that will throw at runtime in the web (non-Tauri) deployment context. All existing Tauri calls share this same problem, but the phase's own description of this as a stub is factually incorrect and creates a false sense of safety.

Three secondary warnings cover: the `"tauri"` npm script left in `server/frontend/package.json` (dead and misleading), the `@tauri-apps/*` packages remaining in `dependencies` rather than being moved to `devDependencies` now that they are scheduled for removal, and the `.gitignore` missing `.env.production` coverage.

---

## Critical Issues

### CR-01: `getProjectWorkflows` is a live Tauri IPC call, not a stub — will crash in web context

**File:** `server/frontend/src/lib/tauri.ts:561`

**Issue:** The phase summary and task description characterize `useProjectWorkflows` as a "stub" that is "safe in a non-Tauri context." It is not. `getProjectWorkflows` calls `invoke<ProjectWorkflows>("get_project_workflows", { path })`, which is identical in structure to every other Tauri command in this file. When this code runs in a browser against the FastAPI backend (the target deployment), `invoke` will throw because the Tauri IPC bridge is not present. The `useQuery` wrapper in `queries.ts` will surface this as a query error, not a graceful empty state.

This matters because `pnpm-workspace.yaml` now lists `server/frontend` as a workspace package and the root `package.json` exposes a `build` script that runs `pnpm -r build` — meaning this code will be built and shipped to production. If any component mounts that calls `useProjectWorkflows`, the query will fail at runtime in the deployed web app.

**Fix:** Replace the `invoke` call with a fetch-based implementation targeting the FastAPI backend, or add an explicit guard that returns a safe empty value until the REST endpoint exists:

```typescript
// Option A: safe stub until REST endpoint is built in Phase 4+
export const getProjectWorkflows = (_path: string): Promise<ProjectWorkflows> =>
  Promise.resolve({
    has_any_ai_config: false,
    tools: [],
    tool_count: 0,
    file_count: 0,
  });

// Option B: REST implementation (when endpoint exists)
export const getProjectWorkflows = (path: string): Promise<ProjectWorkflows> =>
  fetch(`/api/v1/projects/workflows?path=${encodeURIComponent(path)}`)
    .then((r) => r.json());
```

The same pattern applies to every other `invoke()` call in `tauri.ts`, but those are pre-existing and outside this phase's scope. The newly added function is in scope and should not introduce a new instance of the known-broken pattern.

---

## Warnings

### WR-01: `"tauri"` script remains in `server/frontend/package.json` after `@tauri-apps/cli` removal

**File:** `server/frontend/package.json:23`

**Issue:** The `@tauri-apps/cli` devDependency was removed (correctly), but the `"tauri": "tauri"` script entry was left in place. Running `pnpm run tauri` now produces a confusing error: `sh: tauri: command not found`. This is dead code in the build manifest and misleads future contributors about what build tooling is available.

**Fix:** Remove the `"tauri": "tauri"` line from the `scripts` block.

---

### WR-02: `@tauri-apps/*` runtime dependencies not moved to `devDependencies`

**File:** `server/frontend/package.json:49-52`

**Issue:** Four Tauri packages remain in `dependencies` (production bundle):
- `@tauri-apps/api`
- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-shell`

These packages are slated for removal in Phase 4, but in the meantime they will be included in the production bundle built by `vite build`. Vite tree-shakes based on actual imports, so this may not inflate the bundle significantly — but they remain as production dependencies, meaning `pnpm audit --prod` will flag their CVEs, and downstream consumers of the workspace will treat them as runtime requirements.

**Fix:** Move all four to `devDependencies` now, since they are only used in `tauri.ts` which itself is in the process of being replaced. This makes the intent explicit and keeps `pnpm audit --prod` clean.

---

### WR-03: `.gitignore` does not cover `.env.production` or bare `.env.*`

**File:** `.gitignore:30-33`

**Issue:** The current environment file patterns are:
```
.env
.env.local
.env.*.local
!.env.example
```

The pattern `.env.*.local` covers `.env.development.local` but not `.env.production`, `.env.staging`, `.env.test`, or `.env.development` (without the `.local` suffix). Vite's [env file loading order](https://vitejs.dev/guide/env-and-mode) includes `.env.production` and `.env.development` as valid files that developers commonly create and that may contain real credentials or DSN values.

**Fix:** Add a broader pattern:
```
.env.*
!.env.example
```
This replaces the three current `.env` lines and covers all `.env.production`, `.env.staging`, `.env.test`, and `.env.development` variants while still allowing `.env.example` to be committed.

---

## Info

### IN-01: Root `package.json` pins a specific pnpm patch version

**File:** `package.json:4`

**Issue:** `"packageManager": "pnpm@9.15.0"` pins to a specific patch release. The `server/frontend/package.json` uses `"pnpm@9.0.0"` (a different version). The two files now coexist in the same workspace, and Corepack will use the root declaration when invoked from the root, but the sub-package declaration when invoked from `server/frontend/`. This version mismatch is harmless today but can cause subtle lock-file divergence if contributors run `pnpm` from within the `server/frontend/` directory.

**Fix:** Align both to the same version, preferring the higher root value: set `server/frontend/package.json` `packageManager` field to `pnpm@9.15.0`.

---

### IN-02: `pnpm-workspace.yaml` does not include a future `packages/protocol-ts` path

**File:** `pnpm-workspace.yaml`

**Issue:** The tech-stack document and CLAUDE.md both describe a future `packages/protocol-ts/` shared package for TypeScript protocol bindings. The workspace file currently only lists `server/frontend`. When `packages/protocol-ts` is created, a developer must remember to add it here. This is low risk but easy to forget.

**Fix:** Pre-emptively add the glob pattern so new packages under `packages/` are automatically included:
```yaml
packages:
  - "server/frontend"
  - "packages/*"
```

---

### IN-03: `adminer` service exposed in `compose.override.yml` without authentication

**File:** `server/compose.override.yml:53-55`

**Issue:** The override file maps Adminer to `0.0.0.0:8080` (all interfaces). Adminer has no authentication layer of its own — it provides direct PostgreSQL access to anyone who can reach port 8080. For local development this is a known and accepted trade-off, but it should be explicitly noted as a dev-only service.

This is low severity (override file is explicitly dev-only) but warrants documentation so it is not accidentally copied into a production compose file.

**Fix:** Add a comment marking the service as strictly local-dev:
```yaml
adminer:
  restart: "no"
  # DEV ONLY — Adminer has no auth; never expose this port in production
  ports:
    - "8080:8080"
```

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
