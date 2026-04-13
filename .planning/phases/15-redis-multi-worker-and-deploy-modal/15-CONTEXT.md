# Phase 15: Redis Multi-Worker and Deploy Modal — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Two independent deliverables:

1. **Redis multi-worker relay** — Make the existing Redis pub/sub subscriber loop retry on disconnect, and provide a `docker-compose.multiworker.yml` override for multi-worker deployment.
2. **Deploy modal** — "Deploy on new node" modal on the Nodes page with OS-aware install commands, a 6-char pairing code, copy buttons, and a live connection indicator.

</domain>

<decisions>
## Implementation Decisions

### Pairing Flow (D-01 to D-05)

- **D-01: 6-char pairing code.** Add a new backend endpoint (`POST /nodes/code`) that generates a short-lived 6-char alphanumeric code. The modal displays this code. The daemon user runs `gsd-cloud login <CODE>` on the target machine. This matches the daemon's existing `login.go` flow exactly.

- **D-02: Code lifetime is 10 minutes.** Code expires 10 minutes after generation. If the modal is closed before the node connects, the code simply expires.

- **D-03: Codes stored in Redis** with a 10-minute TTL. Key: `pair:<CODE>`, value: `{user_id, node_name}`. Works across multiple Uvicorn workers. No new DB table needed.

- **D-04: Node name.** Modal has a text input for the node name (required, entered before the code is generated). Code generation calls `POST /nodes/code` with `{name}` and returns the code.

- **D-05: Daemon exchange endpoint.** The daemon's `gsd-cloud login <CODE>` calls `POST /api/v1/nodes/pair` (new endpoint). Server looks up code in Redis, creates the node row (re-using existing `crud.create_node_token` logic), returns `{machine_id, auth_token, relay_url}`. Code is deleted from Redis after successful exchange (single-use enforced server-side).

### Install Commands (D-06 to D-08)

- **D-06: OS detection via browser `navigator.userAgent`**, pre-selecting macOS or Linux tab. User can switch tabs manually. Windows tab shows WSL2 instructions (same as Linux commands).

- **D-07: Install source is a self-hosted install script** served by the server at `GET /install`. Script URL uses `window.location.origin` so it works for any self-hosted deployment without configuration. Commands shown in modal:
  ```
  # Step 1 — Install
  curl -fsSL <origin>/install | sh

  # Step 2 — Log in
  gsd-cloud login <CODE>

  # Step 3 — Start
  gsd-cloud start
  ```

- **D-08: Server URL substitution.** `window.location.origin` is used as the server URL in the install script URL. No user input required — the frontend already knows its own origin.

### Live Connection Indicator (D-09 to D-10)

- **D-09: Poll `GET /nodes/` every 3 seconds** from the moment the code is displayed. Detect success by comparing node count before code generation vs. after — if a new node appears, the connection succeeded.

- **D-10: On success: auto-close modal + show success toast.** Toast text: "Node `<name>` connected." The new node card appears in the grid as the modal closes. If the 10-minute code expires with no connection, the modal shows an "Expired — regenerate" state with a button to request a new code.

### Redis Subscriber Retry (D-11)

- **D-11: Finite retries — 5 attempts with exponential backoff**, then log a clear error and stop. Backoff: 1s, 2s, 4s, 8s, 16s. After 5 failures, log: `"Redis subscriber failed after 5 attempts — cross-worker relay disabled"`. Admin restarts the worker to recover. Matches the existing lazy-init fallback pattern (server stays up, degrades gracefully).

### Multi-Worker Compose (D-12)

- **D-12: `docker-compose.multiworker.yml` sets `backend.deploy.replicas: 2` only.** No nginx changes. File is a Compose override — run with:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.multiworker.yml up
  ```
  Nginx load balancing is out of scope — users who need it configure their own upstream. This keeps the override file minimal and unambiguous.

### Claude's Discretion

- Visual design of the modal (step layout, code display, spinner states)
- `/install` script content and format
- Exact backoff algorithm implementation details
- Copy button implementation (Clipboard API)
- Code character set (uppercase alphanumeric, excluding ambiguous chars like 0/O/I/1)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Pairing Backend
- `server/backend/app/api/routes/nodes.py` — Existing `POST /nodes/` (token flow), `NodePairResponse`, `NodeCreateRequest`. New endpoints extend this router.
- `server/backend/app/models.py` — `NodePairResponse`, `NodeCreateRequest` models. New `NodeCodeRequest`, `NodeCodeResponse`, `DaemonPairRequest` models go here.
- `server/backend/app/crud.py` — `create_node_token` logic to reuse in the daemon exchange endpoint.

### Existing Redis + Connection Manager
- `server/backend/app/relay/connection_manager.py` — `start_subscriber()` and `_subscriber_loop()` (lines 187–215): retry logic added here. `_get_redis()` lazy init pattern to follow.
- `server/backend/app/core/config.py` — `REDIS_URL` setting already defined.

### Existing Nodes Frontend
- `server/frontend/src/components/nodes/nodes-page.tsx` — "Deploy on new node" button and modal added here.
- `server/frontend/src/lib/queries.ts` — `useNodes` query to drive polling in modal.

### Daemon Login Flow
- `node/daemon/cmd/login.go` — Existing `gsd-cloud login <code>` implementation. The new `POST /nodes/pair` endpoint must match what `client.Pair(api.PairRequest{Code, Hostname, OS, Arch, DaemonVersion})` expects.
- `node/daemon/internal/api/` — HTTP client used by login.go. Check `Pair()` method signature.

### Docker Compose
- `server/docker-compose.yml` — Base compose file. Override adds `backend.deploy.replicas: 2`.

### Requirements
- `.planning/ROADMAP.md` Phase 15 — SCAL-01, UX-01 success criteria (4 criteria)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Radix Dialog** — Already imported in multiple pages. Modal uses `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`.
- **Copy button pattern** — Phase 14's push endpoint returned VAPID keys with copy UX. Same pattern applies to code + install commands.
- **useNodes query** (`lib/queries.ts`) — Already refetches nodes. Modal polling calls `queryClient.invalidateQueries(['nodes'])` or uses `refetchInterval`.
- **connection_manager._get_redis()** — Lazy Redis init pattern with try/except. Retry loop follows the same defensive pattern.

### Gap: `/install` Script Endpoint
- No `GET /install` endpoint exists yet. Needs to be added to the FastAPI router. Script content: detect OS/arch, download the right binary from wherever binaries are hosted, make executable, print next steps.
- **Open question for planner:** Where are daemon binaries hosted? If not yet released anywhere, the install script may need to build from source or be a placeholder.

### Existing Node Pairing in UI
- **Empty state in `nodes-page.tsx`** shows incorrect command (`gsd node pair --server`). This will be replaced by the modal flow.
- **No "Add Node" button** currently exists. Add to the page header area alongside the existing title.

</code_context>

<deferred>
## Deferred Ideas

None raised during discussion.
</deferred>
