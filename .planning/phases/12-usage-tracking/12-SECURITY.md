---
phase: 12
slug: usage-tracking
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-12
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Node WebSocket -> Server | Cost data from daemon arrives via authenticated node connection | Token counts, cost_usd, duration — could be manipulated by compromised node |
| Browser -> REST API | Usage endpoints accessed via JWT cookie auth | User-scoped usage records, aggregated cost data |
| Browser -> GET /usage/session/{id} | Per-session usage lookup via JWT cookie auth | Single session cost breakdown |
| activity.py -> UsageRecord table | Batch query enriches activity feed with cost data | Usage records joined to activity events |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-12-01 | Information Disclosure | GET /usage/, GET /usage/summary | mitigate | All queries filter `UsageRecord.user_id == current_user.id` from JWT. Verified at usage.py:56,105. Test: test_usage_isolation. | closed |
| T-12-02 | Tampering | period query param on usage endpoints | mitigate | FastAPI Query validation regex `^(7d|30d|90d|all)$` rejects arbitrary input. Verified at usage.py:38,99. | closed |
| T-12-03 | Tampering | cost_usd from node WebSocket | accept | Cost data from authenticated node connection; node ownership verified at session creation. Rogue node can only affect its own sessions — inherent trust model. | closed |
| T-12-04 | Denial of Service | UsageRecord insert failure | mitigate | Separate `DBSession(engine)` block isolates usage write from session status update. try/except with logging prevents handler crash. Verified at ws_node.py:301. | closed |
| T-12-05 | Spoofing | Unauthenticated access to /usage endpoints | mitigate | All three endpoints require `CurrentUser` dependency (JWT cookie auth). Verified at usage.py:37,98,173. Test: test_list_usage_unauthenticated, test_get_session_usage_unauthenticated. | closed |
| T-12-06 | Information Disclosure | GET /usage/session/{session_id} | mitigate | Query filters by both `session_id` AND `user_id == current_user.id`. Returns 404 (not 403) to avoid confirming existence. Verified at usage.py:179,183. Test: test_get_session_usage_other_user_returns_404. | closed |
| T-12-07 | Spoofing | GET /usage/session/{session_id} unauthenticated | mitigate | Endpoint requires `CurrentUser` dependency. Verified at usage.py:173. Test: test_get_session_usage_unauthenticated. | closed |
| T-12-08 | Information Disclosure | activity.py UsageRecord batch query | mitigate | Added `UsageRecord.user_id == current_user.id` filter to batch query (M-02 fix). Defense-in-depth: independent ownership enforcement. Verified at activity.py:54. | closed |
| T-12-09 | Denial of Service | ws_node.py UsageRecord insert race condition | mitigate | Uses pre-captured `user_id` local variable (line 136) instead of re-querying `manager.get_node()`. Eliminates race window during node disconnect. Outer try/except catches DB failures. Verified at ws_node.py:313. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-03 | Node owner controls the node binary and can send arbitrary cost data for their own sessions. This is inherent to the architecture — the server trusts authenticated nodes for their own session data. No cross-user impact. | Plan author | 2026-04-12 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-12 | 9 | 9 | 0 | gsd-secure-phase (code verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-12
