---
phase: 15
slug: redis-multi-worker-and-deploy-modal
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-13
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → POST /nodes/code | Authenticated user generates pairing code | JWT cookie (httpOnly), node name |
| Daemon → POST /api/daemon/pair | Unauthenticated daemon exchanges code for credentials | Pairing code, hostname/OS/arch/version → machineId/authToken/relayUrl |
| External → GET /install | Unauthenticated shell script download | Static script content, no user data |
| Browser rendering | Install commands use window.location.origin | No user-controlled URL injection |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-15-01 | Spoofing | POST /api/daemon/pair | mitigate | 6-char code from 34-char alphabet (~1.5B combos) + 10min TTL via Redis TTL. `nx=True` prevents collision. `GETDEL` ensures single-use atomically. Evidence: `pairing.py:27` (`nx=True`), `pairing.py:32` (`getdel`) | closed |
| T-15-02 | Tampering | POST /api/daemon/pair | mitigate | Pydantic `DaemonPairRequest` validates all input fields. Code uppercased server-side before lookup. `GETDEL` atomicity prevents race conditions. Evidence: `daemon.py:24` (Pydantic model), `daemon.py:36` (`.upper()`) | closed |
| T-15-03 | Information Disclosure | POST /api/daemon/pair | mitigate | Returns HTTP 404 "Invalid or expired code" for both nonexistent and expired codes — no timing distinction. Evidence: `daemon.py:38` | closed |
| T-15-04 | Denial of Service | POST /nodes/code | accept | Auth required (JWT cookie). Each code expires in 10min via Redis TTL. Rate limiting is application-wide concern, not phase-specific. See Accepted Risks Log. | closed |
| T-15-05 | Tampering | GET /install | mitigate | Script served over same HTTPS origin as app via nginx `location = /install` → backend proxy. No external CDN. Content is static, not user-influenced. Evidence: `nginx.conf:30` | closed |
| T-15-06 | Elevation of Privilege | POST /api/daemon/pair | mitigate | `user_id` sourced from Redis payload stored during code generation — daemon cannot supply or override it. Node created under the user who generated the code. Evidence: `daemon.py` uses `pair_data["user_id"]`, not request body | closed |
| T-15-07 | Information Disclosure | deploy-node-modal.tsx | accept | Pairing code displayed in browser is intentional — user needs it to authenticate the target machine. Code is short-lived (10min TTL) and single-use (GETDEL). See Accepted Risks Log. | closed |
| T-15-08 | Spoofing | deploy-node-modal.tsx | mitigate | API calls use existing JWT httpOnly cookie auth (`credentials: 'include'` in fetch wrapper). No credentials stored in component state. Evidence: `api/client.ts:13` | closed |
| T-15-09 | Denial of Service | Polling loop (deploy-node-modal.tsx) | mitigate | Polling stops on modal close (`setIsPolling(false)` line 110), after node connection detected (line 61), and after 10min expiry timeout (line 72). Evidence: `deploy-node-modal.tsx:61,72,110` | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-04 | DoS via authenticated code generation is bounded by Redis TTL (10min expiry). Application-wide rate limiting is out of scope for this phase. Risk is low: requires valid JWT and all codes self-expire. | Josh Taylor | 2026-04-13 |
| AR-15-02 | T-15-07 | Pairing code displayed in browser is by design — user needs it to register a remote node. Short-lived (10min) and single-use. Exposure window is small and intentional. | Josh Taylor | 2026-04-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-13 | 9 | 9 | 0 | gsd-security-auditor (automated) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-13
