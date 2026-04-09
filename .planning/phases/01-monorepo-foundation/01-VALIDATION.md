---
phase: 1
slug: monorepo-foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
audited: 2026-04-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | go test + pnpm build |
| **Config file** | go.work (root), pnpm-workspace.yaml (root) |
| **Quick run command** | `go build ./... && pnpm build` |
| **Full suite command** | `go build ./... && pnpm install && pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `go build ./...` (Go tasks) or `pnpm build` (JS tasks)
- **After every plan wave:** Run `go build ./... && pnpm install && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | INFR-01 | — | N/A | build | `go build ./...` | ✅ go.work | ✅ green |
| 1-01-02 | 01 | 1 | INFR-01 | — | N/A | build | `pnpm install && pnpm build` | ✅ pnpm-workspace.yaml | ✅ green |
| 1-01-03 | 01 | 2 | INFR-02 | — | N/A | build | `go build ./...` | ✅ go.work | ✅ green |
| 1-01-04 | 01 | 2 | INFR-02 | — | N/A | build | `pnpm build` | ✅ package.json | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — builds validate correctness, no test framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All source code relocated (no orphaned files) | INFR-01 | Directory tree inspection | Run `ls` on old paths to confirm they no longer exist |
| No feature code changed | INFR-02 | Human review | Diff each file to confirm only paths/imports changed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-09

---

## Validation Audit 2026-04-09

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 4 tasks verified green: `go build ./node/daemon/...` ✅, `go test ./node/protocol-go/...` ✅, `pnpm install` ✅, `pnpm -r build` ✅
