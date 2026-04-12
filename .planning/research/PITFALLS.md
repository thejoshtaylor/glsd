# Domain Pitfalls

**Domain:** Self-hosted multi-node Claude Code session management (WebSocket relay, Go daemon, FastAPI server, React frontend)
**Researched:** 2026-04-09

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: WebSocket Relay Chain Message Loss During Reconnection

**What goes wrong:** The daemon loses its WebSocket connection to the server mid-stream. During reconnection, the browser shows a spinner forever because a `taskComplete` or `permissionRequest` message was dropped. The WAL has the `stream` frames but control messages (`taskComplete`, `taskError`, `permissionRequest`, `question`) are NOT written to WAL -- they are sent directly via `relay.Send()` in `actor.go` without WAL persistence. If the relay connection is down at the exact moment a control message fires, it is lost permanently.

**Why it happens:** The current WAL only captures `stream` frames (see `actor.go:handleEvent` -- it appends to WAL then sends to relay). But `taskComplete`, `taskError`, `permissionRequest`, and `question` messages bypass the WAL entirely -- they are sent via `a.opts.Relay.Send()` directly in `handleResult()` and `SendTask()`. The relay `Send()` method drops messages silently when the connection is down (returns error, caller ignores or returns nil).

**Consequences:** User sees `taskStarted` then nothing. Session appears hung. No way to recover without killing the session and starting over. Permission requests silently vanish -- Claude is waiting for approval that the user never sees.

**Warning signs:**
- Users report sessions "hanging" after network blips
- `taskStarted` events in the browser with no corresponding `taskComplete`
- Permission requests that never arrive at the frontend

**Prevention:**
- WAL ALL outbound messages, not just `stream` frames. On reconnect, replay the full WAL (control messages included) from the last acked sequence.
- Alternatively, implement an outbound queue that buffers during disconnection and drains on reconnect. The current `sendCh` in `relay/client.go` is a best-effort channel with `select/default` drop semantics (line 122-126).
- Add a "session state sync" message that the server can request after reconnection, asking the daemon for the current state of each active session (idle, running, awaiting permission, etc.).

**Detection:** Integration test that kills the WebSocket mid-task and verifies `taskComplete` arrives after reconnection.

**Phase:** Must be addressed in the relay/protocol phase -- before any frontend work relies on message delivery guarantees.

---

### Pitfall 2: Orphaned Claude Processes After Actor Cleanup Failures

**What goes wrong:** The Go daemon spawns `claude` CLI processes via pty. When the daemon crashes, gets SIGKILL, or the `Stop()` path fails, child processes keep running as orphans. Each `claude` process consumes an Anthropic API key's rate limit and can accumulate unbounded token costs. Since nodes are remote machines the user may not be monitoring, orphans can run for hours.

**Why it happens:** `actor.Stop()` closes `stopCh` and then calls `exec.Close()` which closes stdin. This is a cooperative shutdown -- it depends on the claude process noticing EOF on stdin and exiting. If the daemon itself is killed (SIGKILL, OOM, panic without recovery), no cleanup runs. The child process inherits a new session via `Setsid: true` in `ptySysProcAttr()`, so it is explicitly detached from the daemon's process group and will NOT receive the daemon's SIGTERM.

**Consequences:** Unbounded API cost from orphaned Claude processes. Rate limit exhaustion blocks legitimate sessions. On machines with many sessions, memory/CPU exhaustion.

**Warning signs:**
- `ps aux | grep claude` shows processes not associated with a running daemon
- Anthropic API usage spikes after daemon restarts
- Nodes becoming unresponsive after daemon crashes

**Prevention:**
- Write a PID file for each spawned claude process (e.g., `~/.gsd-cloud/pids/<sessionID>.pid`). On daemon startup, scan for stale PIDs and send SIGTERM/SIGKILL.
- Set `Pdeathsig: syscall.SIGTERM` in `SysProcAttr` (Linux only -- does not work on macOS). For macOS, use a supervisor goroutine that polls the parent PID.
- Alternatively, use `Setpgid: true` instead of `Setsid: true` and kill the entire process group on shutdown. This trades controlling-terminal isolation for reliable cleanup.
- Add a startup health check in the daemon `Run()` loop that scans for orphaned claude processes before connecting to the relay.

**Detection:** Integration test: start a session, SIGKILL the daemon, verify no claude processes survive after daemon restart.

**Phase:** Must be addressed in the daemon/node phase. This is a cost-safety issue that should be solved before any multi-user deployment.

---

### Pitfall 3: Server Relay Becomes a Single Point of Failure with No Backpressure

**What goes wrong:** The FastAPI server must relay WebSocket frames between N browsers and M daemons. A single Claude session can produce hundreds of stream events per second (partial messages, tool calls, diffs). With multiple concurrent sessions across multiple nodes, the server becomes a bottleneck. FastAPI's async WebSocket handling is single-threaded per connection; if the browser is slow to consume (mobile on 3G), backpressure propagates backward through the relay to the daemon, stalling Claude output.

**Why it happens:** The protocol uses text frames with JSON payloads (no binary, no compression). A single `stream` event containing a large diff or tool output can be 100KB+. The relay must parse, route, and forward every frame. Python's asyncio event loop handles all WebSocket I/O for a connection in a single coroutine -- there is no parallelism within a connection.

**Consequences:** Slow browsers cause daemon-side stalls. Server memory grows unboundedly queuing messages for slow consumers. Under load, all sessions degrade, not just the slow one.

**Warning signs:**
- Server memory climbing steadily during active sessions
- Stream events arriving in bursts at the browser (buffered then flushed)
- Daemon WAL files growing because the relay is not ACKing (it cannot forward fast enough)

**Prevention:**
- Implement per-connection outbound queues with bounded size and drop policy (drop oldest stream frames, never drop control messages).
- Add WebSocket compression (`permessage-deflate`) -- JSON stream events compress 5-10x.
- Consider making the relay "dumb" -- forward raw bytes without JSON parsing. The server only needs to parse the `type` and routing fields (`sessionId`, `channelId`), not the full payload.
- Set explicit WebSocket message size limits on both sides (the daemon parser already uses 4MB max in `parser.go` line 22).
- Implement flow control: if the browser's outbound queue exceeds a threshold, send a `pause` signal to the daemon for that session.

**Detection:** Load test with 10+ concurrent sessions and a throttled browser client. Monitor server memory and relay latency.

**Phase:** Server relay implementation phase. Must be designed correctly from the start -- retrofitting backpressure is a rewrite.

---

### Pitfall 4: Token-as-Node-Identity Creates Unsegmented Trust

**What goes wrong:** Nodes authenticate using the user's JWT token -- the same token used for browser authentication. A compromised node has the same permissions as the user's browser session. There is no distinction between "this token can manage sessions on this node" and "this token can access all API endpoints." A malicious or compromised node can hit the REST API, access other users' data, or register additional fake nodes.

**Why it happens:** The design explicitly chose "node identity via user token" to avoid a separate credential system (PROJECT.md line 51). The daemon sends the auth token as a Bearer header in `relay/client.go:69` and as a query parameter in `loop/daemon.go:43`. The server has no concept of node-scoped permissions vs user-scoped permissions.

**Consequences:** A compromised node (or intercepted token on the wire between node and server) grants full account access. Token rotation requires updating every node. No way to revoke a single node without invalidating the user's session everywhere.

**Warning signs:**
- No differentiation in server logs between browser API calls and node API calls
- Token exposure on node machines (config files, process arguments, env vars)
- Inability to revoke node access without logging out the user

**Prevention:**
- Introduce node registration tokens: short-lived tokens issued by the server specifically for node registration. After registration, the server issues a node-specific credential (machine token) scoped to WebSocket relay operations only.
- At minimum, add a `scope` claim to node JWTs: `scope: "node:relay"` vs `scope: "user:full"`. The server middleware rejects REST API calls from node-scoped tokens.
- Store the auth token encrypted at rest on the node (the current `config.go` likely writes it to `~/.gsd-cloud/config.json` in plaintext).
- Implement per-node revocation in the server database.

**Detection:** Security review: attempt to call REST API endpoints using a node's auth token. If it succeeds, the trust boundary is broken.

**Phase:** Auth/security phase. Must be designed before multi-user deployment but can use the simple single-token approach for initial single-user development.

---

### Pitfall 5: Monorepo Integration Breaks Import Paths and Build Pipelines

**What goes wrong:** The four source projects each have their own build systems, dependency trees, and import conventions. Merging them into a monorepo creates immediate breakage: the Go daemon imports `github.com/gsd-build/protocol-go` as an external module, the SaaS template frontend has its own `vite.config.ts` and `package.json`, gsd-vibe has a separate `package.json` with potentially conflicting dependencies, and the Python backend has its own `pyproject.toml`. Naive directory reorganization into `server/` and `node/` breaks all of these simultaneously.

**Why it happens:** Each project was developed independently with its own module identity. The Go daemon's `go.mod` references `github.com/gsd-build/daemon` with a dependency on `github.com/gsd-build/protocol-go`. Moving to `node/daemon/` and `node/protocol-go/` requires updating `go.mod` module paths, all internal imports, and the `replace` directive between them. The two JavaScript projects (SaaS template frontend + gsd-vibe) have separate `node_modules` trees that may have incompatible versions of React, Vite, or Tailwind.

**Consequences:** Builds fail immediately. Go module resolution breaks. TypeScript compilation fails on conflicting type definitions. Docker build contexts change. CI/CD pipelines that referenced old paths break. Days of untangling instead of building features.

**Warning signs:**
- `go build` fails with "cannot find module providing package" errors
- Two `package.json` files with different versions of the same dependency
- Docker build context no longer includes required files after restructuring
- Import paths in the Go code still reference old module names

**Prevention:**
- Do the monorepo restructure as a dedicated, isolated phase with no feature work. Test each build pipeline (Go, Python, TypeScript) independently after restructuring.
- For Go: use a Go workspace (`go.work`) at the repo root with `use ./node/daemon` and `use ./node/protocol-go`. Update `go.mod` module paths and use `replace` directives for local development.
- For JavaScript: choose ONE package.json strategy -- either a single root `package.json` with workspaces (npm/pnpm workspaces) or keep them separate. Do not try to merge `gsd-vibe` and the SaaS template frontend into one package.json in the first phase -- integrate gsd-vibe as source files into the SaaS template's frontend directory.
- For Python: the backend stays self-contained in `server/backend/` with its own `pyproject.toml`. No changes needed to Python imports.
- For Docker: update `docker-compose.yml` build contexts to reference the new paths. Test `docker compose build` as part of the restructuring phase.

**Detection:** CI pipeline that runs `go build ./...`, `npm run build`, `docker compose build` on every PR.

**Phase:** Phase 1, before any feature development. This is pure infrastructure and must be stable before anything else proceeds.

---

## Moderate Pitfalls

### Pitfall 6: PTY Buffering Regressions Silently Break Stream Output

**What goes wrong:** The daemon uses a carefully tuned PTY setup to work around Node.js stdout buffering (see `pty_unix.go` comments). Any change to the PTY configuration -- window size, raw mode, SysProcAttr flags, or even upgrading the `creack/pty` dependency -- can silently break streaming. The symptom is Claude output arriving in large batches instead of line-by-line, or not arriving at all until the process exits.

**Why it happens:** The PTY setup has three interlocking requirements documented in executor.go: (1) stdin must be a pipe (not TTY) for stream-json mode, (2) stdout must be a TTY for line buffering, (3) the master must be in raw mode to prevent echo. Getting any one wrong produces subtle failures that look like "Claude is slow" rather than "the buffering is broken."

**Prevention:**
- Do not touch the PTY setup code unless you are fixing a specific bug. Treat `pty_unix.go` and the stdio wiring in `executor.go` as frozen infrastructure.
- Add a smoke test that spawns a fake claude process producing known output and verifies line-by-line delivery timing (events should arrive within milliseconds, not batched).
- Document the PTY constraints prominently -- the existing comments are excellent but easy to miss during a refactor.

**Detection:** Smoke test that measures time-to-first-event after sending a prompt. If it exceeds 1 second, the buffering is broken.

**Phase:** Relevant during any daemon refactoring. Add the smoke test in the daemon/node phase.

---

### Pitfall 7: Session Actor Leaks When Actors Are Never Removed from the Manager Map

**What goes wrong:** The `session.Manager` stores actors in a `map[string]*Actor`. Actors are added by `Spawn()` but only removed by `StopAll()` (daemon shutdown). There is no per-session cleanup. A stopped actor remains in the map forever. Over time, the daemon accumulates dead actors holding open WAL file handles and occupying memory.

**Why it happens:** `handleStop` in `daemon.go` calls `actor.Stop()` but does not remove the actor from the manager. `handleTask` checks `manager.Get()` first and reuses existing actors, so a stopped actor that receives a new task will fail because its executor is closed.

**Prevention:**
- Add a `Remove(sessionID)` method to the manager that stops the actor and deletes it from the map.
- Call `Remove()` from `handleStop()` after `actor.Stop()`.
- Implement a session timeout: if an actor has had no activity for N minutes, auto-remove it. This handles the case where the browser disconnects without sending a `stop`.

**Detection:** Monitor the size of `manager.actors` map over time. If it grows monotonically, actors are leaking.

**Phase:** Daemon/node phase. Low effort, high impact.

---

### Pitfall 8: Mobile Frontend Overwhelmed by High-Frequency Stream Events

**What goes wrong:** A single Claude session can emit 50-200+ stream events per second (partial assistant messages, tool use progress, content blocks). The React frontend re-renders on each event. On mobile devices with limited CPU and memory, this causes frame drops, UI freezes, and eventually an unresponsive tab that the mobile OS kills.

**Why it happens:** The protocol sends every partial message as a separate `stream` frame with an opaque `event` object. The frontend must parse each event, update state, and re-render the message display. React's reconciliation is fast on desktop but mobile browsers have 2-4x less CPU headroom. Combined with mobile network jitter causing event bursts (100 events arriving at once after a brief stall), the UI thread is saturated.

**Prevention:**
- Batch stream events on the frontend: accumulate events in a buffer and flush to React state at a capped rate (e.g., 10-15 fps for text updates). Use `requestAnimationFrame` or a 66ms debounce.
- Virtualize the message display: only render visible messages. Long Claude outputs with tool calls can produce hundreds of DOM elements.
- On the server relay: optionally coalesce consecutive `stream` events for the same session into a single WebSocket frame containing an array of events. This reduces frame overhead and browser event handler invocations.
- Use `React.memo` aggressively on message components. Avoid re-rendering the entire message list when only the latest message changed.

**Detection:** Test the frontend on a throttled mobile device (Chrome DevTools device emulation with CPU throttle at 4x slowdown). If scrolling stutters during active streaming, batching is needed.

**Phase:** Frontend integration phase. Design the event consumption pattern before building the message display components.

---

### Pitfall 9: Docker Compose with No Exposed Ports Breaks Health Checks and Reverse Proxy Integration

**What goes wrong:** The project constraint says "no exposed ports" on the Docker Compose server. But the existing `docker-compose.yml` has a health check that curls `http://localhost:8000` inside the container (line 99). With no exposed ports, the user must configure a reverse proxy (Traefik, nginx, Cloudflare Tunnel) to route traffic. WebSocket connections through reverse proxies require specific configuration (`Upgrade` header forwarding, increased timeouts, `Connection: keep-alive`). Users who deploy without proper WebSocket proxy config will see HTTP connections work but WebSocket connections fail silently.

**Why it happens:** HTTP reverse proxies default to HTTP/1.0 behavior that strips the `Upgrade` header. WebSocket connections timeout at the proxy's default (often 60 seconds) rather than staying open for hours like a Claude session requires. The `compose.traefik.yml` exists but may not cover all proxy scenarios.

**Prevention:**
- Ship a `compose.traefik.yml` override that is tested and documented for WebSocket relay.
- Add WebSocket-specific health checks: the server should expose a `/ws/health` endpoint that does a WebSocket upgrade and immediate close, verifiable from the proxy layer.
- Set explicit `proxy_read_timeout` / `proxy_send_timeout` values in the documentation (at least 3600s for long-running Claude sessions).
- Add a startup self-test: on server boot, attempt a loopback WebSocket connection to verify the upgrade path works.
- Document minimum proxy requirements: WebSocket upgrade support, timeout configuration, and maximum frame size.

**Detection:** Deploy with default nginx/Traefik config and verify WebSocket connections survive for 10+ minutes with no traffic (idle keepalive).

**Phase:** Server deployment phase. Must be tested before any remote node tries to connect.

---

### Pitfall 10: WAL Pruning Race Condition During Concurrent Append and Prune

**What goes wrong:** The WAL `PruneUpTo()` method reads remaining entries, writes them to a temp file, then renames over the original. But `PruneUpTo` calls `ReadFrom` which acquires and releases the mutex, then re-acquires it for the rename. Between the two lock acquisitions, `Append()` can write new entries to the original file. The rename then overwrites those entries with the stale temp file, causing data loss.

**Why it happens:** `PruneUpTo` at line 112 calls `l.ReadFrom(upTo)` which takes and releases the lock internally (line 74-76). Then `PruneUpTo` takes the lock again at line 118. Any `Append` call between these two lock acquisitions writes to the old file, which is then overwritten by the rename at line 148.

**Prevention:**
- Refactor `PruneUpTo` to hold the lock for the entire operation (read + write temp + rename) instead of releasing it between `ReadFrom` and the rename. Use an internal `readFromLocked()` that assumes the lock is held.
- Alternatively, append-only and compact periodically: instead of rewriting in place, truncate after reaching a size threshold in a single locked operation.

**Detection:** Concurrent stress test: hammer `Append` and `PruneUpTo` simultaneously and verify no entries are lost.

**Phase:** Daemon/node phase. Fix before production use with multiple concurrent sessions.

---

### Pitfall 11: RestartWithGrant Uses context.Background() Permanently

**What goes wrong:** When a user approves a permission request, `HandlePermissionResponse` calls `RestartWithGrant(context.Background(), ...)`. The new executor runs under `context.Background()` which is never canceled. If the daemon shuts down, the session manager's `StopAll()` calls `actor.Stop()` which closes stdin, but the context is never canceled. The new executor's `Start` method checks `ctx.Err()` to distinguish expected shutdown from crashes (executor.go line 241). With `context.Background()`, it will never see cancellation and may report a clean exit as a crash or vice versa.

**Why it happens:** The original `Run()` method receives a proper context from the daemon loop, but `RestartWithGrant` does not thread that context through. This is a latent bug that surfaces as incorrect error handling during shutdown.

**Prevention:**
- Store the parent context in the Actor struct (from `Run(ctx)`) and use it for all subsequent executor starts, including `RestartWithGrant`.
- Add a test that starts an actor, triggers a permission grant restart, then cancels the context, and verifies clean shutdown.

**Detection:** Daemon shutdown with an active permission-granted session. Check logs for unexpected error messages.

**Phase:** Daemon/node phase. Low effort fix.

---

## Minor Pitfalls

### Pitfall 12: Send Channel Drop Semantics Hide Backpressure

**What goes wrong:** The relay client's `Send` method uses `select/default` on a 256-element buffered channel (client.go line 121-126). When the channel is full, messages are silently dropped with an error return that callers often ignore (e.g., `handleEvent` returns nil on relay send failure at line 238).

**Prevention:** Log dropped messages with session context. Consider blocking sends for control messages (taskComplete, permissionRequest) while using non-blocking for stream frames.

**Phase:** Relay implementation phase.

---

### Pitfall 13: Two Frontend Codebases with Divergent Conventions

**What goes wrong:** gsd-vibe uses its own component library, routing, state management, and styling conventions. The SaaS template frontend has its own patterns. Merging them produces inconsistent UX, duplicate components, and conflicting styles.

**Prevention:** Designate ONE frontend as the authority. Since gsd-vibe is the target UI, port its components INTO the SaaS template's frontend structure, adopting the SaaS template's auth/routing/layout patterns as the shell. Do not try to run both frontends side by side.

**Phase:** Frontend integration phase. Make the architectural decision before writing any integration code.

---

### Pitfall 14: Sequence Number Gaps After Daemon Restart

**What goes wrong:** The WAL stores sequence numbers per session. On daemon restart, `wal.ScanDirectory` reads the highest sequence from each WAL file and reports it in the `hello` message. But if the WAL was pruned before the crash, the starting sequence may be lower than what the relay expects, causing duplicate or out-of-order delivery.

**Prevention:** The relay's `welcome` response includes `ackedSequencesBySession` (protocol line 210). The daemon should use `max(wal_seq, acked_seq)` as the starting point. The current code has `_ = welcome` with a TODO comment (daemon.go line 131) -- this must be implemented.

**Phase:** Relay protocol implementation phase.

---

### Pitfall 15: File System Operations (browseDir, readFile) Have No Sandboxing

**What goes wrong:** The `browseDir` and `readFile` protocol messages allow the browser to read arbitrary files on the node machine. There is no path validation or sandboxing in `fs/browse.go` or `fs/read.go`. A malicious or compromised server could read `/etc/shadow`, `~/.ssh/id_rsa`, or any sensitive file on the node.

**Prevention:** Restrict file operations to a configured workspace root. Validate that resolved paths (after symlink resolution) remain within the workspace. Deny access to dotfiles and known sensitive paths.

**Phase:** Security hardening phase. Critical for any multi-user deployment.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Monorepo restructure | Import path breakage across all 4 projects (Pitfall 5) | Dedicated phase, no feature work mixed in. Go workspace + npm workspaces. |
| Daemon/node stabilization | Orphaned processes (Pitfall 2), actor leaks (Pitfall 7), WAL race (Pitfall 10) | PID tracking, actor removal, lock refactor. |
| Server relay implementation | Message loss during reconnection (Pitfall 1), backpressure (Pitfall 3) | WAL all messages, bounded queues, compression. |
| Auth/security | Token trust boundary (Pitfall 4), file system access (Pitfall 15) | Node-scoped tokens, path sandboxing. |
| Frontend integration | Stream event overload on mobile (Pitfall 8), dual codebase merge (Pitfall 13) | Event batching, single-authority frontend decision. |
| Deployment | Reverse proxy WebSocket config (Pitfall 9) | Tested Traefik/nginx configs, WebSocket health checks. |
| Protocol implementation | Sequence number gaps (Pitfall 14), welcome TODO (Pitfall 14) | Implement the welcome handler before anything else. |

## Sources

- Direct code analysis of `/Users/josh/code/glsd/daemon/` (Go daemon internals)
- Protocol specification at `/Users/josh/code/glsd/protocol-go/PROTOCOL.md`
- Project definition at `/Users/josh/code/glsd/.planning/PROJECT.md`
- Docker Compose configuration at `/Users/josh/code/glsd/deployable-saas-template/docker-compose.yml`
- Node.js stdout buffering behavior: well-documented in libuv internals and confirmed by the daemon's own PTY comments
- FastAPI WebSocket handling characteristics: training data, MEDIUM confidence (FastAPI async WebSocket is single-coroutine per connection)
- Confidence: HIGH for code-derived pitfalls (1-2, 5-7, 10-12, 14-15), MEDIUM for deployment/performance pitfalls (3, 8-9), MEDIUM for security pitfall (4)
