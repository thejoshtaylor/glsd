---
phase: 06-deployment-polish
plan: 02
subsystem: infra
tags: [docker, nginx, vite, pnpm, frontend, multi-stage-build, reverse-proxy]

# Dependency graph
requires:
  - phase: 06-deployment-polish
    provides: Redis service and restructured Docker Compose (06-01)
provides:
  - Frontend Dockerfile with multi-stage Node build and Nginx serving
  - Nginx reverse proxy config with API/WebSocket proxying and SPA fallback
  - Active frontend service in production and dev Docker Compose files
affects: [06-03]

# Tech tracking
tech-stack:
  added: [node:22-alpine, nginx:alpine]
  patterns: [multi-stage Docker build for frontend, Nginx reverse proxy with WebSocket upgrade]

key-files:
  created:
    - server/frontend/Dockerfile
    - server/frontend/nginx.conf
  modified:
    - server/docker-compose.yml
    - server/compose.override.yml

key-decisions:
  - "Build context set to repo root (..) so Dockerfile can access pnpm-lock.yaml and pnpm-workspace.yaml at the repo root"
  - "No VITE_API_URL build arg needed -- frontend uses relative /api/v1 paths which Nginx proxies to backend"
  - "Frontend service has no ports in production compose -- access via external reverse proxy"

patterns-established:
  - "Per-service build context: backend uses context=. (server/), frontend uses context=.. (repo root) -- each service owns its own build context"
  - "WebSocket proxy pattern: proxy_http_version 1.1 + Upgrade/Connection headers + 86400s read timeout"

requirements-completed: [INFR-03]

# Metrics
duration: 2min
completed: 2026-04-10
---

# Phase 06 Plan 02: Frontend Dockerfile & Nginx Summary

**Multi-stage Dockerfile (node:22-alpine + nginx:alpine) with Nginx reverse proxy for API/WebSocket and SPA fallback**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-10T17:56:38Z
- **Completed:** 2026-04-10T17:58:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created multi-stage frontend Dockerfile: node:22-alpine builds via pnpm, nginx:alpine serves static files
- Created Nginx config with /api/ and /ws/ reverse proxying to backend:8000, WebSocket upgrade headers, and SPA fallback
- Activated frontend service in docker-compose.yml with backend health dependency and no exposed ports
- Added dev override with port 5173 for local development access
- Security headers configured: X-Frame-Options, X-Content-Type-Options, Referrer-Policy

## Task Commits

Each task was committed atomically:

1. **Task 1: Create frontend Dockerfile and nginx.conf** - `389f619` (feat)
2. **Task 2: Wire frontend service in docker-compose and dev override** - `d861714` (feat)

## Files Created/Modified
- `server/frontend/Dockerfile` - Multi-stage build: pnpm install + build in node:22-alpine, serve from nginx:alpine
- `server/frontend/nginx.conf` - Nginx config with /api/ proxy, /ws/ WebSocket proxy, SPA try_files fallback, security headers
- `server/docker-compose.yml` - Active frontend service with build context=.., depends_on backend healthy, no ports
- `server/compose.override.yml` - Dev frontend service with port 5173:80 exposed

## Decisions Made
- Build context set to repo root (`..` from server/) because pnpm-lock.yaml and pnpm-workspace.yaml live at the repo root, not inside server/frontend/
- No VITE_API_URL build arg -- the frontend already uses relative `/api/v1` paths via the api client, and Nginx proxies these to the backend
- Production compose has no ports on frontend -- users expose ports via their own external reverse proxy per PROJECT.md constraints

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Frontend Dockerfile and Nginx config ready for `docker-compose up` full-stack deployment
- docker compose config validates cleanly (exit 0)
- Ready for 06-03 (environment bootstrap script and final polish)

## Self-Check: PASSED

All 4 files verified present. Both commit hashes verified in git log.

---
*Phase: 06-deployment-polish*
*Completed: 2026-04-10*
