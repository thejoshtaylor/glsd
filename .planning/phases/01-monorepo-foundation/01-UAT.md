---
status: testing
phase: 01-monorepo-foundation
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md]
started: 2026-04-09T21:42:49Z
updated: 2026-04-09T21:42:49Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files).
  Start the application from scratch. Server boots without errors, any seed/migration
  completes, and a primary query (health check, homepage load, or basic API call)
  returns live data.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: [pending]

### 2. Monorepo Directory Layout
expected: The repo root contains .gitignore, go.work, pnpm-workspace.yaml, package.json, and pnpm-lock.yaml. Four source dirs exist at server/backend/, server/frontend/, node/daemon/, and node/protocol-go/. No deployable-saas-template/, gsd-vibe/, daemon/, or protocol-go/ directories remain at root.
result: [pending]

### 3. Go Workspace Build
expected: Running `go build ./node/daemon/...` from the repo root exits 0 with no errors. The Go workspace resolves both modules (daemon and protocol-go) without any replace directives needed.
result: [pending]

### 4. Go Protocol Tests
expected: Running `go test ./node/protocol-go/...` from the repo root exits 0. All tests pass (expected ~0.4s).
result: [pending]

### 5. pnpm Workspace Install
expected: Running `pnpm install` from the repo root exits 0 and installs ~588 packages. No missing workspace errors.
result: [pending]

### 6. Frontend Build
expected: Running `pnpm -r build` from the repo root exits 0. TypeScript compiles cleanly and Vite bundles successfully (~3110 modules). File `server/frontend/dist/index.html` exists after the build.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
