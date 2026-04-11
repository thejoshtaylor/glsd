# Phase 11: Foundation -- Migrations and Stub Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 11-foundation-migrations-and-stub-cleanup
**Areas discussed:** Tauri Stub Bar, Email Error Surface, Migration Scope, 500 Error Audit Depth

---

## Tauri Stub Bar

| Option | Description | Selected |
|--------|-------------|----------|
| Hide in web | Remove or conditionally render UI elements that depend on Tauri. No 'not available' message — feature just doesn't appear. | |
| Show 'not available' | Keep UI elements but show disabled state or toast. More honest about what was lost. | |
| Wire to server API | Implement real web equivalents via REST API. Larger scope. | ✓ |

**User's choice:** Wire to server API

**Follow-up — which features to wire:**

| Option | Description | Selected |
|--------|-------------|----------|
| pickFolder / scaffoldProject | Project creation wizard | ✓ |
| readProjectFile | env-vars-tab reads project files | ✓ |
| ptyWrite / gsd-todos / snippets | Terminal input, todos, snippets | ✓ |
| secrets-manager / diagnostics | Settings and diagnostic panels | ✓ |

**Follow-up — scope of new endpoints:**

| Option | Description | Selected |
|--------|-------------|----------|
| Stub → real where server API exists | Wire existing endpoints; graceful no-op for missing infra | |
| All features, even if new endpoints needed | Add whatever backend needed | ✓ |

---

## Email Error Surface

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP 4xx/5xx to frontend | Raise in send_email() + callers return meaningful HTTP error. Frontend shows toast. | ✓ |
| Raise only, let FastAPI 500 | Add raise. Callers unchanged. Frontend gets generic 500. | |
| Server log only | Log failure. No UI signal. Doesn't meet FIX-03. | |

**User's choice:** HTTP 4xx/5xx to frontend

**Follow-up — misconfiguration vs. send failure:**

| Option | Description | Selected |
|--------|-------------|----------|
| Same path, different message | Both raise HTTPException. 503 for misconfigured, 502 for send failure. | ✓ |
| Same error for both | Generic error for any email failure. | |

---

## Migration Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Add new migrations only | Create migrations for new tables/columns. Leave stub in chain. | |
| Repair + add | Fix stub migration AND add new ones. | ✓ |

**Follow-up — how to repair stub safely:**

| Option | Description | Selected |
|--------|-------------|----------|
| Replace stub with real migration, same revision ID | Edit f9f573bd285c in place. Safe because same ID marks it applied on v1.0. | |
| New migration that repairs the gap | Add new migration that detects and fills what stub missed. | ✓ |

---

## 500 Error Audit Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Broader audit | Compare all SQLModel models vs. alembic output. Fix all gaps. | ✓ |
| Known gaps only | Target node.token_hash and explicitly mentioned columns. | |

**User's choice:** Broader audit — compare all models vs. migrations, fix all gaps in one Phase 11 migration.

---
