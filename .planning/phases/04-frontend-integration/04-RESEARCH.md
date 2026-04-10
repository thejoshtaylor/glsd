# Phase 4: Frontend Integration - Research

**Researched:** 2026-04-09
**Domain:** React/TypeScript frontend integration -- Tauri removal, REST/WebSocket API client, real-time streaming, node management
**Confidence:** HIGH

## Summary

Phase 4 converts gsd-vibe from a Tauri desktop app into a web-only SPA that communicates with the FastAPI backend via REST and WebSocket. The codebase has 80+ import sites referencing `@/lib/tauri` or `@tauri-apps/*` across ~60 files. The core challenge is replacing these with domain-split API modules (`lib/api/auth.ts`, `lib/api/nodes.ts`, `lib/api/sessions.ts`, `lib/api/ws.ts`) and a new `useCloudSession` hook that manages WebSocket-based session streaming.

The Phase 3 backend already provides all needed endpoints: `POST /api/v1/sessions`, `GET /api/v1/nodes`, `POST /api/v1/nodes/:id/revoke`, and the `/ws/browser` WebSocket endpoint with full message routing. The browser WS endpoint currently authenticates via JWT query param (D-06 in Phase 3); CONTEXT.md D-04 requires updating it to httpOnly cookie auth. The protocol is fully defined in `PROTOCOL.md` with 16 message types -- the frontend needs TypeScript types mirroring `messages.go` field names exactly.

**Primary recommendation:** Work in layers: (1) create the API client foundation + auth flow, (2) build the WebSocket client with session streaming, (3) adapt existing screens file-by-file, (4) add new screens (login, nodes, node detail). Stub Tauri functions that have no server equivalent rather than removing them, per D-02.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Replace `lib/tauri.ts` with domain-split modules at `lib/api/`: `lib/api/auth.ts`, `lib/api/nodes.ts`, `lib/api/sessions.ts`, `lib/api/ws.ts`. All 18 Tauri import sites are updated to the new paths.
- **D-02:** Tauri-backed functions with no server equivalent are stubbed with `console.warn` -- they return null/empty and log a warning rather than crashing.
- **D-03:** Write a new `useCloudSession` hook to replace `use-pty-session.ts`. The hook manages: `POST /api/v1/sessions` to create a session, opening a browser WebSocket for streaming, writing `task` messages, and receiving `stream` events.
- **D-04:** Authentication uses httpOnly cookies throughout -- including for WebSocket connections. The Phase 3 FastAPI WS endpoint (`/ws/browser`) is updated to read the session cookie instead of a JWT query param.
- **D-05:** Unauthenticated users are gated via a `ProtectedRoute` wrapper component. All app routes are protected. Unauthenticated users are redirected to `/login`.
- **D-06:** The `FirstLaunchWizard` (Tauri-based onboarding) is removed. `/login` is the entry point for new users. Registration and login both live at `/login`.
- **D-07:** Login page: centered email + password form, clean minimal layout consistent with existing Radix UI + Tailwind patterns.
- **D-08:** The "projects" concept is preserved on the server -- `POST /api/v1/projects` lets users register named projects.
- **D-09:** On the shell page, `ProjectSelector` is replaced with: a NodeSelector dropdown + a cwd text input + a Project name field (optional).
- **D-10:** The `ProjectSelector` component is updated (not rewritten) to load from the server Projects API.
- **D-11:** Node management lives at `/nodes` -- a new route with a nav item in the main sidebar.
- **D-12:** Clicking a node navigates to `/nodes/:nodeId` -- a dedicated node detail page.
- **D-13:** The existing `components/project/file-browser.tsx` is adapted (not rewritten) to use `GET /api/v1/nodes/:id/fs?path=...` for directory listings.
- **D-14:** Node online/offline status is derived from the server's in-memory `ConnectionManager` state via `GET /api/v1/nodes` -- the `is_online` field.

### Claude's Discretion
- Exact sidebar nav item icon and label for /nodes
- Whether /nodes shows an empty state illustration or a prompt to pair a node when no nodes exist
- Pagination vs. infinite scroll for the sessions list on the node detail page
- Whether the filesystem browser opens inline on the node detail page or as a separate /nodes/:id/files route
- Error boundary placement for the new WS-connected terminal components

### Deferred Ideas (OUT OF SCOPE)
None listed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-05 | User can view all paired nodes in the UI | D-11/D-14: `/nodes` page consuming `GET /api/v1/nodes` with `is_online` field |
| AUTH-06 | User can revoke (disconnect) a node from the UI | D-12: Node detail page with revoke button calling `POST /api/v1/nodes/:id/revoke` |
| SESS-03 | User sees real-time stream output from a Claude Code session in the browser | D-03: `useCloudSession` hook + WebSocket client receiving `stream` messages + xterm.js rendering |
| SESS-04 | User can approve or deny Claude Code permission requests from the UI | Protocol `permissionRequest`/`permissionResponse` + `question`/`questionResponse` message handling in WS client |
| VIBE-01 | GSD Vibe frontend runs as a web app (Tauri IPC replaced with REST/WebSocket API client) | D-01/D-02: Domain-split API modules + Tauri stub strategy |
| VIBE-02 | All GSD Vibe screens are adapted and functional | D-02 stub strategy + per-file Tauri import replacement |
| VIBE-03 | Frontend is mobile-first and usable on small screens | Existing Tailwind v3 responsive utilities; specific touch targets for approval flows |
| VIBE-04 | Node management dashboard shows connected nodes, their status, and active sessions | D-11/D-12/D-14: `/nodes` list + `/nodes/:nodeId` detail + `is_online` from ConnectionManager |
| VIBE-05 | User can browse the filesystem of a connected node from the UI | D-13: Adapted `file-browser.tsx` using REST endpoint for directory listing via server relay |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.x | UI framework | Locked in CLAUDE.md. Already installed. | [VERIFIED: package.json] |
| TypeScript | ~5.7 | Type safety | Already in devDependencies. | [VERIFIED: package.json] |
| Vite | 6.0.5 | Build tool + dev server | Already installed. Vite 8 upgrade deferred. | [VERIFIED: package.json] |
| @tanstack/react-query | ^5.62.0 | Server state management | Already used for all data fetching. Extend for new REST endpoints. | [VERIFIED: package.json] |
| react-router-dom | ^7.1.1 | Client-side routing | Already used. Add /login, /nodes, /nodes/:nodeId routes. | [VERIFIED: package.json] |
| @xterm/xterm | ^6.0.0 | Terminal emulator | Already integrated with fit, search, serialize, web-links addons. | [VERIFIED: package.json] |
| Radix UI | various | Accessible UI primitives | 14 packages already installed. Use for login form, node cards. | [VERIFIED: package.json] |
| Tailwind CSS | 3.4.17 | Utility CSS | Locked to v3 per CLAUDE.md. | [VERIFIED: package.json] |
| sonner | ^2.0.7 | Toast notifications | Already in use. | [VERIFIED: package.json] |
| lucide-react | ^0.468.0 | Icons | Already in use. | [VERIFIED: package.json] |

### No new dependencies needed

The frontend already has everything required. The WebSocket client uses the browser-native `WebSocket` API per CLAUDE.md guidance. No new npm packages are needed for this phase.

### Packages to REMOVE from devDependencies
| Package | Reason |
|---------|--------|
| `@tauri-apps/api` | No longer needed -- all Tauri IPC removed |
| `@tauri-apps/plugin-dialog` | Native dialog replaced by Radix Dialog |
| `@tauri-apps/plugin-fs` | Filesystem access via REST API |
| `@tauri-apps/plugin-shell` | Shell access not needed -- sessions on remote nodes |

**Note:** Tauri packages are in `devDependencies`, not `dependencies`. Removing them is safe and unblocks builds on machines without Rust. [VERIFIED: package.json]

## Architecture Patterns

### New Module Structure
```
src/
├── lib/
│   ├── api/
│   │   ├── client.ts        # Shared fetch wrapper with cookie auth, base URL, error handling
│   │   ├── auth.ts          # login(), register(), logout(), getCurrentUser()
│   │   ├── nodes.ts         # listNodes(), getNode(), revokeNode(), createNodeToken()
│   │   ├── sessions.ts      # createSession(), listSessions(), getSession(), stopSession()
│   │   ├── ws.ts            # WebSocket client class: connect, reconnect, message routing
│   │   └── projects.ts      # createProject(), listProjects(), getProject() (D-08)
│   ├── protocol.ts          # TypeScript discriminated union types for all protocol messages
│   └── tauri.ts             # RETAINED but gutted: all exports become console.warn stubs (D-02)
├── hooks/
│   ├── use-cloud-session.ts  # Replaces use-pty-session.ts (D-03)
│   └── use-auth.ts           # Auth state management (login, logout, current user)
├── contexts/
│   ├── auth-context.tsx       # AuthProvider wrapping app
│   └── terminal-context.tsx   # Adapted: remove Tauri save/restore, keep tab management
├── components/
│   ├── auth/
│   │   ├── login-page.tsx     # D-06/D-07: Email + password form
│   │   └── protected-route.tsx # D-05: Redirect to /login if unauthenticated
│   ├── nodes/
│   │   ├── nodes-page.tsx     # D-11: Node list dashboard
│   │   ├── node-detail-page.tsx # D-12: Node detail with sessions + revoke
│   │   └── node-selector.tsx  # D-09: Dropdown for shell page
│   ├── terminal/
│   │   └── interactive-terminal.tsx # Adapted: use useCloudSession instead of usePtySession
│   └── project/
│       └── file-browser.tsx   # D-13: Adapted for REST API
└── pages/
    └── (existing pages adapted)
```

### Pattern 1: API Client with Cookie Auth (D-04)

**What:** A shared fetch wrapper that sends credentials with every request and handles 401 redirects.
**When to use:** All REST API calls.

```typescript
// src/lib/api/client.ts
const API_BASE = '/api/v1';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // sends httpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    // Redirect to login
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }

  return response.json();
}
```
[ASSUMED] -- httpOnly cookie approach requires Phase 3 backend modification (D-04 says "update Phase 3 WS endpoint"). The exact cookie-setting mechanism (Set-Cookie on login response) needs to be added to the login endpoint.

### Pattern 2: WebSocket Client with Message Routing

**What:** A thin TypeScript WebSocket wrapper that routes incoming messages by `type` field to registered handlers.
**When to use:** Browser-to-server WebSocket connection for session streaming.

```typescript
// src/lib/api/ws.ts
type MessageHandler = (msg: ProtocolMessage) => void;

export class GsdWebSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30_000; // 30s cap

  connect(channelId: string): void {
    // Cookie auth: browser sends httpOnly cookie automatically on WS upgrade
    const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/browser?channelId=${channelId}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const handlers = this.handlers.get(msg.type);
      handlers?.forEach(h => h(msg));
    };

    this.ws.onclose = () => this.scheduleReconnect(channelId);
    this.ws.onopen = () => { this.reconnectAttempts = 0; };
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  send(msg: object): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private scheduleReconnect(channelId: string): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts++;
    setTimeout(() => this.connect(channelId), delay);
  }
}
```
[CITED: CLAUDE.md WebSocket Client section -- "raw WebSocket JSON frames, thin TypeScript client, reconnection with exponential backoff"]

### Pattern 3: useCloudSession Hook (D-03)

**What:** React hook replacing `usePtySession` that manages session lifecycle via REST + WebSocket.
**When to use:** Every terminal component that needs to run a Claude Code session.

```typescript
// src/hooks/use-cloud-session.ts
interface UseCloudSessionReturn {
  state: CloudSessionState;
  createSession: (nodeId: string, cwd: string) => Promise<string>;
  sendTask: (prompt: string, opts: TaskOptions) => void;
  sendStop: () => void;
  sendPermissionResponse: (requestId: string, approved: boolean) => void;
  sendQuestionResponse: (requestId: string, answer: string) => void;
}

// Hook creates session via POST /api/v1/sessions,
// opens WebSocket, routes incoming messages to xterm.js
```
[ASSUMED] -- hook interface derived from protocol message types and existing usePtySession interface

### Pattern 4: Protocol TypeScript Types

**What:** TypeScript discriminated unions mirroring `protocol-go/messages.go` exactly.
**When to use:** All WebSocket message handling.

```typescript
// src/lib/protocol.ts
// Browser -> Server
interface TaskMessage {
  type: 'task';
  taskId: string;
  sessionId: string;
  channelId: string;
  prompt: string;
  model: string;
  effort: 'low' | 'medium' | 'high' | 'max';
  permissionMode: string;
  personaSystemPrompt?: string;
  cwd: string;
  claudeSessionId?: string;
}

// Server -> Browser
interface StreamMessage {
  type: 'stream';
  sessionId: string;
  channelId: string;
  sequenceNumber: number;
  event: Record<string, unknown>; // opaque Claude event
}

interface PermissionRequestMessage {
  type: 'permissionRequest';
  sessionId: string;
  channelId: string;
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

// ... all 16 types as discriminated union
type ProtocolMessage =
  | TaskMessage | StopMessage | PermissionResponseMessage | QuestionResponseMessage
  | BrowseDirMessage | ReadFileMessage
  | StreamMessage | TaskStartedMessage | TaskCompleteMessage | TaskErrorMessage
  | PermissionRequestMessage | QuestionMessage
  | HeartbeatMessage | BrowseDirResultMessage | ReadFileResultMessage;
```
[VERIFIED: protocol-go/messages.go -- field names match exactly]

### Pattern 5: ProtectedRoute (D-05)

**What:** Route wrapper that checks auth state and redirects to `/login`.
**When to use:** Wraps all routes except `/login`.

```typescript
// src/components/auth/protected-route.tsx
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return <>{children}</>;
}
```
[ASSUMED] -- standard React Router pattern

### Anti-Patterns to Avoid
- **Importing from `@tauri-apps/*` directly:** All remaining direct Tauri imports (`invoke`, `listen`, `open`) in ~15 files must be replaced. Grep audit found 80+ import lines across 60+ files.
- **Storing JWT in localStorage:** D-04 explicitly requires httpOnly cookies. Never expose tokens to JavaScript.
- **Building a Socket.IO wrapper:** Protocol specifies raw WebSocket JSON frames. Socket.IO adds its own protocol layer that conflicts.
- **Rewriting file-browser.tsx from scratch:** D-13 says adapt, not rewrite. Change the data source from `api.listCodeFiles()` to a REST call, keep the UI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal emulation | Custom ANSI parser | @xterm/xterm (already installed) | Handles 10,000+ ANSI escape codes, cursor movement, selection |
| Reconnecting WebSocket | Complex reconnection state machine | Simple exponential backoff in GsdWebSocket class | Protocol is stateless (no sequence tracking at WS layer); reconnect is just re-open |
| Form validation | Custom validation | HTML5 native + minimal inline checks | Login form has two fields; Zod/react-hook-form is overkill |
| Route protection | Custom auth interceptors | React Router Navigate + context | Standard pattern; no need for middleware |
| Toast notifications | Custom notification system | sonner (already installed) | Already integrated throughout the app |

## Common Pitfalls

### Pitfall 1: Cookie Auth on WebSocket Upgrade
**What goes wrong:** Browser WebSocket API does not support custom headers. The current Phase 3 code reads JWT from query param (`?token=<jwt>`).
**Why it happens:** D-04 requires switching to httpOnly cookies. The FastAPI WS endpoint must read the cookie from the upgrade request headers (automatic in browsers).
**How to avoid:** Update `ws_browser.py` to extract JWT from the `Cookie` header instead of `query_params.get("token")`. The browser automatically sends cookies on WebSocket upgrade to the same origin. Login endpoint must `Set-Cookie` with `httpOnly=True, secure=True, sameSite='lax', path='/'`.
**Warning signs:** WebSocket connections fail with 1008 after login works fine via REST.

### Pitfall 2: Stale xterm.js Terminal Instances
**What goes wrong:** The existing `interactive-terminal.tsx` has a complex caching system (`terminalInstanceCache`, `terminalInputWriters`, etc.) designed for Tauri's PTY model. When switching to WebSocket streaming, these caches may hold stale references.
**Why it happens:** The current code caches Terminal instances across page navigations and re-registers PTY event listeners on remount. The new model receives data via WebSocket message handlers, not Tauri event listeners.
**How to avoid:** Simplify the terminal component: remove PTY reconnection logic, remove tmux reattach, keep the Terminal instance caching for DOM preservation but route data through WebSocket handlers instead of Tauri event callbacks.
**Warning signs:** Terminal shows no output after navigation, or shows output from a previous session.

### Pitfall 3: 80+ Tauri Import Sites
**What goes wrong:** Missing or broken imports cause build failures. The grep audit shows `@/lib/tauri` is imported in 60+ files, and direct `@tauri-apps/*` imports exist in ~15 files.
**Why it happens:** gsd-vibe was a Tauri desktop app. Every feature used Tauri IPC.
**How to avoid:** Keep `lib/tauri.ts` as a stub file (D-02). All existing type exports remain. All function exports become `console.warn` stubs returning null/empty. This lets the entire codebase compile without touching every file in Wave 1. Replace imports incrementally per screen.
**Warning signs:** `tsc` fails with missing module errors.

### Pitfall 4: Claude Stream Event Rendering
**What goes wrong:** `stream` messages contain opaque `event` objects from Claude's JSON stream output. The frontend must parse and render these appropriately (text content, tool use, thinking, etc.).
**Why it happens:** The protocol treats `event` as pass-through (`json.RawMessage` in Go). The frontend must understand Claude's event format to render it in xterm.js.
**How to avoid:** Study Claude Code's stream-json output format. At minimum, extract `text` content from events and write it to the terminal. Permission requests and questions arrive as separate protocol messages (`permissionRequest`, `question`), not inside stream events.
**Warning signs:** Terminal shows raw JSON instead of formatted output; permission prompts don't appear.

### Pitfall 5: Vite Config Still Tauri-Oriented
**What goes wrong:** Build targets Chromium/WebKit based on `TAURI_ENV_PLATFORM`, env prefix includes `TAURI_`, server port is hardcoded to 1420.
**Why it happens:** `vite.config.ts` was written for Tauri.
**How to avoid:** Update build target to modern browsers (e.g., `es2022`), remove `TAURI_` env prefix, change server port to standard (e.g., 5173), remove `src-tauri` watch ignore, add API proxy for `/api/` and `/ws/` to FastAPI dev server.
**Warning signs:** Build produces incompatible output; dev server can't reach backend.

### Pitfall 6: File Browser Assumes Local Filesystem
**What goes wrong:** `file-browser.tsx` calls `api.listCodeFiles(projectPath)` and `api.readProjectFile()` which invoke Tauri commands that read the local filesystem. In the cloud model, files are on a remote node.
**Why it happens:** The original app had direct filesystem access.
**How to avoid:** Per D-13, adapt the file browser to use the protocol's `browseDir` / `readFile` messages via a REST wrapper endpoint (`GET /api/v1/nodes/:id/fs?path=...`). The server relays the request to the node via WebSocket. This is async (request/response via WebSocket), so the REST endpoint must await the `browseDirResult` / `readFileResult` from the node.
**Warning signs:** File browser shows loading spinner forever; timeouts on directory listing.

## Code Examples

### Backend: Cookie-Based Login Endpoint (D-04)
```python
# Addition to server/backend/app/api/routes/login.py
from fastapi.responses import JSONResponse

@router.post("/login/cookie")
def login_cookie(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> JSONResponse:
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(user.id, expires_delta=access_token_expires)
    response = JSONResponse(content={"email": user.email, "id": str(user.id)})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,      # requires HTTPS in production
        samesite="lax",
        max_age=int(access_token_expires.total_seconds()),
        path="/",
    )
    return response
```
[ASSUMED] -- exact endpoint shape; the existing login returns `Token(access_token=...)` as JSON body

### Backend: WebSocket Cookie Auth (D-04 update to ws_browser.py)
```python
# Updated auth in ws_browser.py
token = websocket.cookies.get("access_token", "")
# Falls back to query param for backward compat during migration
if not token:
    token = websocket.query_params.get("token", "")
```
[VERIFIED: FastAPI WebSocket object exposes `.cookies` dict from upgrade request headers]

### Frontend: React Query Hook for Nodes
```typescript
// src/lib/api/nodes.ts
import { apiRequest } from './client';

export interface NodePublic {
  id: string;
  name: string;
  machine_id: string | null;
  is_online: boolean;
  created_at: string;
  last_seen: string | null;
  revoked: boolean;
}

export const listNodes = () => apiRequest<{ data: NodePublic[]; count: number }>('/nodes');
export const revokeNode = (nodeId: string) => apiRequest<NodePublic>(`/nodes/${nodeId}/revoke`, { method: 'POST' });
```
[VERIFIED: server/backend/app/api/routes/nodes.py endpoint signatures]

### Frontend: Permission Request UI Component
```typescript
// Renders inline in terminal area when permissionRequest arrives
function PermissionPrompt({ request, onRespond }: {
  request: PermissionRequestMessage;
  onRespond: (approved: boolean) => void;
}) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mx-4 my-2">
      <p className="text-sm font-medium">Permission Request</p>
      <p className="text-xs text-muted-foreground mt-1">
        Tool: <code>{request.toolName}</code>
      </p>
      <pre className="text-xs mt-2 bg-muted/50 p-2 rounded max-h-32 overflow-auto">
        {JSON.stringify(request.toolInput, null, 2)}
      </pre>
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={() => onRespond(true)}>Approve</Button>
        <Button size="sm" variant="destructive" onClick={() => onRespond(false)}>Deny</Button>
      </div>
    </div>
  );
}
```
[ASSUMED] -- UI pattern; exact component structure is Claude's discretion

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri `invoke()` IPC | REST fetch + WebSocket | This phase | All data fetching changes |
| Tauri `listen()` events | WebSocket message handlers | This phase | All real-time features change |
| JWT in Authorization header | httpOnly cookies | This phase (D-04) | More secure; simpler WS auth |
| Local PTY via Tauri | Remote PTY via WebSocket relay | This phase | Terminal component simplified |
| `@tauri-apps/plugin-shell` `open()` | `window.open()` | This phase | External links |
| `@tauri-apps/plugin-fs` | REST API to node via server relay | This phase | File browser |

**Deprecated/outdated:**
- `FirstLaunchWizard` component: Removed per D-06. Replace with `/login` page.
- `use-pty-session.ts`: Replaced by `use-cloud-session.ts` per D-03.
- `use-close-warning.ts`: Tauri window close interception not applicable in browser. Remove or stub.
- `useOnboardingStatus` query: References Tauri onboarding flow. Remove.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | httpOnly cookie auth requires adding a new login endpoint that sets Set-Cookie | Code Examples | Medium -- if backend team prefers a different cookie mechanism, login flow changes |
| A2 | Claude stream events contain extractable text content for terminal rendering | Pitfalls | High -- if events are binary/encoded differently, rendering logic needs rework |
| A3 | `file-browser.tsx` adaptation will use a REST wrapper around browseDir/readFile protocol messages | Pitfalls | Medium -- if direct WebSocket request/response is preferred, the REST wrapper endpoint must be built differently |
| A4 | Existing Tauri packages can be removed from devDependencies without breaking the build | Standard Stack | Low -- they're devDeps and not imported after stubs are in place |
| A5 | `useCloudSession` hook interface matches the needs of `interactive-terminal.tsx` | Architecture Patterns | Medium -- terminal component is complex; interface may need adjustment during implementation |

## Open Questions (RESOLVED)

1. **Claude stream event format** (RESOLVED)
   - The `event` field in `stream` messages is an opaque `json.RawMessage` / `object` per PROTOCOL.md: "The `event` field is an opaque JSON object passed through from Claude's stream-json output."
   - **Resolution:** The frontend xterm.js terminal should write the raw event to the terminal. Claude's stream-json format emits structured events (text_delta, thinking, tool_use, etc.) but the exact nesting is implementation-defined at runtime. The terminal component should pass the full event to xterm.js — xterm renders raw text output. For richer rendering, `event.delta?.text` or `event.content[0]?.text` are the common paths; handle both defensively.

2. **File browser REST wrapper endpoint** (RESOLVED)
   - Phase 3 plans do NOT build a REST endpoint for file browsing. Phase 3 only wires the WebSocket relay for `browseDirResult` / `readFileResult` pass-through (see Plan 03-03 which routes those message types).
   - **Resolution:** Phase 4 Plan 05 must add a backend REST endpoint `GET /api/v1/nodes/{node_id}/fs?path=...` that bridges REST→WebSocket: sends `browseDir` to the node via ConnectionManager and awaits the `browseDirResult` response. A 5-second timeout is appropriate.

3. **Projects API endpoint** (RESOLVED)
   - Phase 3 plans (03-00 through 03-04) do NOT include a Projects API. Phase 3 scope is server relay + auth only.
   - **Resolution:** Phase 4 Plan 01 must add a backend Projects CRUD resource: model `{ id, user_id, name, node_id, cwd }`, endpoints `GET /api/v1/projects`, `POST /api/v1/projects`, `DELETE /api/v1/projects/{id}`. This is a prerequisite for the frontend `lib/api/projects.ts` module and D-08.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured in vite.config.ts `test` block) |
| Config file | `server/frontend/vite.config.ts` (inline `test` section) |
| Quick run command | `cd server/frontend && pnpm test` |
| Full suite command | `cd server/frontend && pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIBE-01 | No Tauri imports remain; API client works | unit | `cd server/frontend && pnpm vitest run src/lib/api/ -x` | No -- Wave 0 |
| SESS-03 | useCloudSession hook sends/receives WS messages | unit | `cd server/frontend && pnpm vitest run src/hooks/use-cloud-session.test.ts -x` | No -- Wave 0 |
| SESS-04 | Permission response sent correctly | unit | `cd server/frontend && pnpm vitest run src/hooks/use-cloud-session.test.ts -x` | No -- Wave 0 |
| AUTH-05 | Nodes page renders node list | unit | `cd server/frontend && pnpm vitest run src/components/nodes/ -x` | No -- Wave 0 |
| AUTH-06 | Revoke node calls correct API | unit | `cd server/frontend && pnpm vitest run src/components/nodes/ -x` | No -- Wave 0 |
| VIBE-03 | Mobile viewport renders correctly | manual-only | Visual check at 375px viewport | N/A |
| VIBE-04 | Node dashboard shows status | unit | `cd server/frontend && pnpm vitest run src/components/nodes/ -x` | No -- Wave 0 |
| VIBE-05 | File browser uses REST API | unit | `cd server/frontend && pnpm vitest run src/components/project/file-browser.test.tsx -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server/frontend && pnpm vitest run --reporter=verbose`
- **Per wave merge:** `cd server/frontend && pnpm test`
- **Phase gate:** Full suite green + `pnpm run typecheck` passes

### Wave 0 Gaps
- [ ] `src/lib/api/__tests__/client.test.ts` -- covers API client fetch wrapper
- [ ] `src/hooks/use-cloud-session.test.ts` -- covers SESS-03, SESS-04
- [ ] `src/components/nodes/__tests__/nodes-page.test.tsx` -- covers AUTH-05, VIBE-04
- [ ] `src/components/auth/__tests__/protected-route.test.tsx` -- covers D-05 route protection
- [ ] Mock WebSocket class for unit tests (vitest lacks native WS; use manual mock)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | httpOnly cookie JWT via FastAPI; never expose token to JS |
| V3 Session Management | Yes | Cookie `secure`, `httpOnly`, `sameSite=lax`; expiration via `max_age` |
| V4 Access Control | Yes | ProtectedRoute on all routes; backend validates user ownership of sessions/nodes |
| V5 Input Validation | Yes | Pydantic on backend; TypeScript types on frontend; protocol message type discrimination |
| V6 Cryptography | No | No crypto on frontend; JWT signing is backend-only |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via terminal output | Tampering | xterm.js renders ANSI escapes safely; never use `dangerouslySetInnerHTML` for terminal content |
| CSRF on cookie-auth endpoints | Tampering | `sameSite=lax` cookie; state-changing operations use POST (not GET) |
| WebSocket hijacking | Spoofing | Cookie auth on WS upgrade; channelId overwritten server-side (T-03-19 in ws_browser.py) |
| JWT in URL (if query param fallback kept) | Information Disclosure | Remove query param fallback after cookie auth is confirmed working; tokens in URLs leak to logs/referer |
| Node impersonation via file browser | Spoofing | Server validates node ownership before relaying browseDir/readFile |

## Tauri Import Audit

Complete grep of all Tauri import sites (80+ lines across 60+ files). Categorized by replacement strategy:

### Category A: Type-only imports from `@/lib/tauri` (~30 files)
These import TypeScript types/interfaces only. Keep types in `lib/tauri.ts` or move to `lib/types.ts`. No runtime change needed.

### Category B: Function imports from `@/lib/tauri` (~25 files)
These call Tauri `invoke()` wrappers. Replace with domain-split API modules or stub per D-02. Key files:
- `lib/queries.ts` -- imports `* as api from "./tauri"`. Re-point to new API modules for server-backed queries; stub the rest.
- `contexts/terminal-context.tsx` -- imports `saveTerminalSessions`, `restoreTerminalSessions`, `ptyWrite`. Remove save/restore (server-side); replace ptyWrite with WS send.
- `components/terminal/interactive-terminal.tsx` -- imports `ptyResize`, `ptyIsActive`, `ptyDetach`. Replace with useCloudSession hook.
- `components/project/file-browser.tsx` -- imports `listCodeFiles`, `readProjectFile`, `writeProjectFile`. Replace with REST API calls via server relay.

### Category C: Direct `@tauri-apps/*` imports (~15 files)
- `@tauri-apps/api/core` (invoke): 3 files -- `lib/tauri.ts`, `components/error-boundary.tsx`, test files
- `@tauri-apps/api/event` (listen): 4 files -- `lib/tauri.ts`, `hooks/use-gsd-file-watcher.ts`, `components/knowledge/knowledge-viewer.tsx`, `components/project/dependency-alerts-card.tsx`
- `@tauri-apps/plugin-shell` (open): 5 files -- `pages/review.tsx`, `pages/inbox.tsx`, `components/project/gsd2-reports-tab.tsx`, `components/project/github-panel.tsx`, `components/projects/project-card.tsx`, `components/dashboard/project-card.tsx`
- `@tauri-apps/plugin-fs`: Not directly imported (uses `lib/tauri.ts` wrapper)
- `@tauri-apps/api/window`: 1 file -- `hooks/use-close-warning.ts`

### Category D: Test files referencing Tauri mocks (~8 files)
These mock `@tauri-apps/api/core` invoke. Update mocks to use new API modules instead.

## Sources

### Primary (HIGH confidence)
- `server/frontend/package.json` -- verified all dependency versions
- `server/frontend/src/lib/tauri.ts` -- verified all exported functions (200+ exports)
- `node/protocol-go/messages.go` -- verified all protocol message field names
- `node/protocol-go/PROTOCOL.md` -- verified all 16 message types
- `server/backend/app/api/routes/nodes.py` -- verified endpoint signatures
- `server/backend/app/api/routes/sessions.py` -- verified endpoint signatures
- `server/backend/app/api/routes/ws_browser.py` -- verified WS auth and message routing
- `server/backend/app/relay/connection_manager.py` -- verified routing architecture
- `server/backend/app/api/deps.py` -- verified auth dependency injection pattern
- `server/backend/app/api/routes/login.py` -- verified existing login endpoint
- `server/frontend/vite.config.ts` -- verified build config and test setup

### Secondary (MEDIUM confidence)
- CLAUDE.md technology stack table -- verified against actual package.json
- Phase 3 CONTEXT.md canonical refs -- cross-referenced with actual code

### Tertiary (LOW confidence)
- Claude stream event format -- only training knowledge, not verified against actual Claude Code output

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified in package.json, no new deps needed
- Architecture: HIGH -- patterns derived from existing code analysis + protocol spec
- Pitfalls: HIGH -- identified from actual code review (grep audit, file analysis)
- Security: HIGH -- cookie auth pattern is well-established; backend code reviewed

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable stack, no version changes expected)
