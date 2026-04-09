# Feature Landscape

**Domain:** Self-hosted multi-node AI coding agent management platform
**Researched:** 2026-04-09

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **WebSocket session relay** | Core value prop -- browser talks to remote Claude Code via server relay | High | Protocol already defined in PROTOCOL.md; daemon has working relay client, session actor, WAL. Server relay hub is the missing piece. |
| **Real-time stream rendering** | Users must see Claude output as it happens, not after completion; any delay kills trust | Med | xterm.js exists in gsd-vibe; needs adapter from WebSocket `stream` events to terminal writes instead of local pty |
| **Node registration and auth** | Nodes must identify themselves securely; server must know which nodes are alive | Med | `hello`/`welcome` handshake defined in protocol; JWT token-based auth planned. Server needs registration endpoint + token issuance. |
| **Node health dashboard** | Users need to see which machines are online, their OS/arch, active sessions | Low | `heartbeat` messages already in protocol; server stores last-seen + metadata from `hello` |
| **Session lifecycle management** | Create, resume, stop sessions on specific nodes | Med | `task`, `stop` messages exist. Server needs session CRUD APIs, mapping sessions to nodes, and forwarding. |
| **Permission request/response flow** | Claude asks to run tools; user must approve/deny from UI | Med | `permissionRequest`/`permissionResponse` already in protocol. UI needs modal or inline approval widget with tool name + input display. |
| **Question/answer flow** | Claude asks clarifying questions; user must respond | Low | `question`/`questionResponse` in protocol. Simpler than permissions -- text input + optional choices. |
| **JWT authentication** | Login, token refresh, session management for the web UI | Low | deployable-saas-template already has JWT auth with FastAPI. Extend to issue node tokens. |
| **Multi-session view** | See all active sessions across all nodes in one place | Med | Users managing multiple machines need a single pane of glass. List view with status, node, cost, duration. |
| **Mobile-responsive layout** | Manage sessions from phone/tablet; not just desktop | Med | gsd-vibe is already mobile-first with Tailwind. Terminal on mobile is inherently awkward but status/approvals must work. |
| **Task cost tracking** | Show token usage and USD cost per task and per session | Low | `taskComplete` already sends `inputTokens`, `outputTokens`, `costUsd`. Aggregate and display. |
| **File browsing on remote nodes** | Browse directories and read files on connected nodes | Low | `browseDir`/`readFile` and their result messages already in protocol. UI file tree component needed. |
| **Reconnection and replay** | If browser disconnects, catch up on missed events | High | WAL + `replayRequest`/`ack` in protocol. Server must buffer or relay WAL replay. This is what makes the platform feel reliable vs. fragile. |
| **Session persistence** | Sessions survive server restarts and browser refreshes | High | Daemon WAL handles node-side. Server needs PostgreSQL-backed session state. `lastSequenceBySession` / `ackedSequencesBySession` handshake enables this. |

## Differentiators

Features that set product apart. Not expected in v1 but create competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **GSD workflow integration** | Phases, milestones, plans, tasks, roadmaps -- structured project management layered on top of Claude Code sessions | High | gsd-vibe already has: project wizard, plan tabs, milestone tree, todos, validation plans, diagnostics. Must adapt from local Tauri to remote server API. |
| **Project-scoped sessions** | Sessions are tied to projects, not just nodes. Switch between projects and see their session history + roadmap progress. | Med | gsd-vibe has project model. Server needs project CRUD + session-project association. |
| **Push notifications for permission requests** | Mobile push or browser notifications when Claude needs approval -- respond from phone | Med | Critical for async workflows. Without this, user must stare at screen. Web Push API (service worker) + optional mobile PWA. |
| **Configurable autonomy levels** | Per-project or per-session permission modes: full auto, approve edits only, approve everything | Low | `permissionMode` already in `task` message. UI needs settings panel. Server stores per-project defaults. |
| **Multi-node broadcast** | Send the same task to multiple nodes simultaneously (e.g., run same refactor across repos) | Med | Not in current protocol. Would need server-side fan-out. Powerful for fleet management. |
| **Session recording and playback** | Record full session streams for review, auditing, or sharing | Med | WAL already captures ordered events. Server persists to PostgreSQL. Add playback UI that replays events at original timing. |
| **Activity feed** | Cross-project, cross-node activity stream showing what Claude is doing across all sessions | Low | gsd-vibe already has `activity-feed.tsx`. Adapt to aggregate from server API instead of local. |
| **GitHub integration** | PR status, CI checks, code review surface alongside Claude sessions | Med | gsd-vibe has `github-panel.tsx` and `review.tsx` page. Server needs GitHub OAuth + API proxy. |
| **Command snippets and templates** | Reusable prompt templates for common tasks | Low | gsd-vibe has `snippets-panel.tsx` and `snippet-editor-dialog.tsx`. Store server-side for cross-device access. |
| **Guided project creation** | Wizard-driven project setup that generates GSD structure | Low | gsd-vibe has `guided-project-wizard.tsx`. Adapt to work with server API. |
| **Diagnostics and doctor** | Health checks on project state, GSD config, node connectivity | Med | gsd-vibe has `diagnostics-panels.tsx` and `DoctorPanel`. Extend to include node health, relay latency, WAL sync status. |
| **Keyboard shortcuts** | Power-user keyboard navigation throughout the UI | Low | gsd-vibe already has `keyboard-shortcuts-provider.tsx` and dialog. Carry forward. |
| **Environment variable management** | Per-project env vars that get passed to Claude sessions on specific nodes | Med | gsd-vibe has `env-vars-tab.tsx`. Server stores encrypted. Daemon injects into Claude process env. |
| **Audit trail** | Full log of every action taken -- who approved what, when, which tool ran | Med | Protocol messages naturally form an audit trail. Server persists all relayed messages with timestamps and user attribution. |

## Anti-Features

Features to deliberately NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Built-in code editor** | Claude Code IS the editor. A browser code editor creates a confusing split-brain experience and massive complexity. | Provide file browsing (read-only) via `browseDir`/`readFile` for context. Let Claude do the editing. |
| **Multi-tenant SaaS** | Self-hosted is the value prop. Multi-tenancy adds auth complexity, data isolation concerns, and billing infrastructure for zero benefit to the target user. | Single-tenant self-hosted. One server = one user/team. |
| **Agent orchestration layer** | Don't build CrewAI/LangGraph inside this. GSD Cloud manages Claude Code sessions, not arbitrary agent graphs. | Keep session management clean. Let users compose workflows via GSD phases and prompts. |
| **Custom LLM provider support** | This is a Claude Code management platform. Supporting Copilot/Cursor/etc. fragments the UX and multiplies testing surface. | Optimize deeply for Claude Code CLI. Support model selection within Claude's offerings (`claude-opus-4-6`, `claude-sonnet-4`, etc.). |
| **Real-time collaborative editing** | Google Docs-style multiplayer on sessions adds enormous complexity (CRDTs, cursor sync) for a use case that barely exists. | One user per session. Multiple sessions per node is fine. View-only session sharing is a stretch goal. |
| **Desktop app (Tauri/Electron)** | gsd-vibe is currently Tauri. For GSD Cloud, the server hosts a web frontend. Desktop shell adds a build target with no benefit -- the whole point is web access from anywhere. | Progressive Web App (PWA) for mobile install. Web-only frontend. |
| **Automatic node provisioning** | Don't build cloud VM provisioning (spin up EC2/GCE instances). That's Terraform/Pulumi territory. | Provide clear docs for node deployment. Node is a Go binary + bash script -- keep it simple. |
| **Billing and payments** | Self-hosted. No billing needed. Users bring their own Anthropic API key. | Track costs for visibility (already in protocol) but don't build payment processing. |

## Feature Dependencies

```
JWT Authentication
  --> Node Registration (nodes auth with user token)
  --> Session Lifecycle (sessions require authed user)
  --> All UI features (require authed frontend)

WebSocket Relay Hub (server)
  --> Real-time Stream Rendering
  --> Permission Request/Response Flow
  --> Question/Answer Flow
  --> Session Lifecycle Management
  --> Reconnection and Replay
  --> File Browsing

Node Registration
  --> Node Health Dashboard
  --> Multi-session View (need to know which nodes exist)
  --> File Browsing (needs machineId routing)

Session Persistence (server DB)
  --> Session Lifecycle Management
  --> Reconnection and Replay
  --> Task Cost Tracking (aggregate stored results)
  --> Session Recording and Playback
  --> Audit Trail

Permission Request/Response Flow
  --> Push Notifications (notify on permission request)
  --> Configurable Autonomy Levels (controls which requests surface)

GSD Workflow Integration
  --> Project-scoped Sessions (projects own sessions)
  --> Guided Project Creation
  --> Activity Feed (per-project aggregation)

Mobile-responsive Layout
  --> Push Notifications (mobile approval flow)
```

## MVP Recommendation

### Phase 1: Core Relay (must work or nothing works)

Prioritize:
1. **JWT Authentication** -- gate everything behind auth. SaaS template provides this.
2. **WebSocket Relay Hub** -- the server's core function: accept browser WS, accept daemon WS, route messages between them.
3. **Node Registration + Health** -- `hello`/`welcome`/`heartbeat` handling. Nodes appear in server DB.
4. **Session Lifecycle** -- create session, send task, receive stream, stop session.
5. **Real-time Stream Rendering** -- xterm.js rendering of `stream` events from relay.
6. **Permission + Question flows** -- the minimum interactive loop.

### Phase 2: Reliability + Persistence

7. **Session Persistence** -- PostgreSQL-backed session state.
8. **Reconnection and Replay** -- WAL replay through server relay.
9. **Task Cost Tracking** -- aggregate from `taskComplete` events.
10. **Multi-session View** -- dashboard of all sessions across nodes.

### Phase 3: GSD Workflow

11. **GSD Workflow Integration** -- adapt gsd-vibe project/plan/milestone/todo views to server APIs.
12. **Project-scoped Sessions** -- tie sessions to projects.
13. **File Browsing** -- remote directory/file browsing via protocol.
14. **Activity Feed** -- cross-project stream.

### Phase 4: Mobile + Polish

15. **Mobile-responsive Layout** -- optimize approval flows and session monitoring for phone.
16. **Push Notifications** -- browser/PWA push for permission requests.
17. **Configurable Autonomy Levels** -- per-project permission presets.
18. **Audit Trail** -- full event log with search.

Defer:
- **Multi-node broadcast**: Powerful but niche. Revisit after core is solid.
- **Session recording/playback**: WAL makes this possible later without architectural changes.
- **GitHub integration**: Nice-to-have. Users can manage GitHub separately.
- **Environment variable management**: Useful but not blocking. Node env can be set via bash config initially.

## Complexity Summary

| Complexity | Count | Features |
|------------|-------|----------|
| **High** | 4 | WebSocket relay hub, reconnection/replay, session persistence, GSD workflow integration |
| **Medium** | 12 | Stream rendering, node registration, session lifecycle, permissions flow, multi-session view, mobile layout, project-scoped sessions, push notifications, multi-node broadcast, session recording, GitHub integration, diagnostics |
| **Low** | 8 | Node health dashboard, question/answer flow, JWT auth (exists), cost tracking, file browsing, configurable autonomy, activity feed, snippets/templates |

## Sources

- Protocol specification: `/Users/josh/code/glsd/protocol-go/PROTOCOL.md`
- Existing daemon implementation: `/Users/josh/code/glsd/daemon/internal/`
- Existing UI components: `/Users/josh/code/glsd/gsd-vibe/src/`
- SaaS template: `/Users/josh/code/glsd/deployable-saas-template/`
- [Top AI Agent tools in 2026 - Dust Blog](https://dust.tt/blog/top-ai-agent-tools)
- [AI Agent Management Platforms - Merge](https://www.merge.dev/blog/ai-agent-management-platform)
- [Human-in-the-Loop for AI Agents - Permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [10 Things Developers Want from Agentic IDEs - RedMonk](https://redmonk.com/kholterhoff/2025/12/22/10-things-developers-want-from-their-agentic-ides-in-2025/)
- [Human-in-the-Loop Guide 2026 - Strata](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)
