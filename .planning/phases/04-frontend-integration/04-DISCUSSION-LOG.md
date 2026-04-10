# Phase 4: Frontend Integration - Discussion Log

**Session:** 2026-04-09
**Areas discussed:** Tauri replacement strategy, Auth & login flow, Node selection UX, Node management dashboard

---

## Tauri Replacement Strategy

**Q: How should the replacement for lib/tauri.ts be organized?**
Options: Single module same filename / Domain-split modules
**Answer:** Domain-split modules (`lib/api/auth.ts`, `lib/api/nodes.ts`, `lib/api/sessions.ts`, `lib/api/ws.ts`)

**Q: How should use-pty-session.ts map to the server's WebSocket relay?**
Options: Rewrite hook keep interface / New hook from scratch
**Answer:** New hook from scratch (`useCloudSession`)

**Q: Where should the domain-split modules live?**
Options: `@/lib/api/*` / `@/api/*` top-level
**Answer:** `@/lib/api/*`

**Q: How should existing Tauri-backed features with no server equivalent be handled?**
Options: Stub + console.warn / Remove and let it break
**Answer:** Stub + console.warn

---

## Auth & Login Flow

**Q: How should the app handle unauthenticated users?**
Options: Protected route wrapper / App-level auth state check
**Answer:** Protected route wrapper — user noted: cookies for login

**Q: Where should the JWT be stored?**
Options: localStorage / sessionStorage
**Answer:** httpOnly cookies instead (user note: "Use cookies instead")

**Q: Phase 3 WS auth: cookie vs query param?**
Options: Cookie for HTTP + query param for WS / Cookie everywhere update Phase 3 WS / Non-httpOnly cookie
**Answer:** Cookie everywhere — update Phase 3 browser WS endpoint to read session cookie

**Q: What should the login page look like?**
Options: Email + password form / You decide
**Answer:** Email + password form

---

## Node Selection UX

**Q: How should users pick where to run a session?**
Options: Node dropdown + cwd text field / Node cards / You decide
**Answer:** Node dropdown + cwd text field

**Q: Does the server backend need a Projects API?**
Options: Projects go away (sessions reference node+cwd) / Keep projects as server concept
**Answer:** Keep projects as a server concept — server has `/api/v1/projects` endpoint

---

## Node Management Dashboard

**Q: Where does the node management dashboard live in navigation?**
Options: New /nodes route + nav item / Embed in Settings / Part of main Dashboard
**Answer:** New /nodes route + nav item

**Q: When a user clicks on a node, what do they see?**
Options: Inline expand / Node detail page
**Answer:** Node detail page at `/nodes/:nodeId`

**Q: VIBE-05 filesystem browser approach?**
Options: Adapt existing file-browser.tsx / New component from scratch
**Answer:** Adapt existing file-browser.tsx — replace Tauri fs calls with REST `GET /api/v1/nodes/:id/fs?path=...`
