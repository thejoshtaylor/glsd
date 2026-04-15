// GSD Cloud — gsd2 WebSocket adapter
//
// Design note: GsdWebSocket has no module-level singleton — each session creates
// its own instance via `new GsdWebSocket()` in use-cloud-session.ts. Therefore
// sendGsd2Query (and the 28 named wrappers) accept `ws` and `channelId` as explicit
// parameters rather than closing over a module-level reference.
//
// machineId also comes from the caller — it identifies which node to route the query
// to. Callers obtain it from the NodePublic.machine_id field (from nodes.ts / the
// /nodes/ REST endpoint) and pass it through query functions.
//
// _pending is module-level (shared across ws instances). requestId is crypto.randomUUID()
// so UUID4 collision probability is negligible even across concurrent sessions.
// _initialized tracks which ws instances have had the gsd2QueryResult handler registered
// so we register exactly once per instance.

import type { GsdWebSocket } from './ws';
import type { Gsd2QueryResultMessage } from '../protocol';

// ============================================================
// Module-level pending request registry
// ============================================================

const _pending = new Map<string, {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

// Tracks which GsdWebSocket instances have had the gsd2QueryResult handler installed.
const _initialized = new WeakSet<GsdWebSocket>();

function ensureHandler(ws: GsdWebSocket): void {
  if (_initialized.has(ws)) return;
  _initialized.add(ws);
  ws.on('gsd2QueryResult', (msg) => {
    const result = msg as unknown as Gsd2QueryResultMessage;
    const entry = _pending.get(result.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    _pending.delete(result.requestId);
    if (result.ok) {
      entry.resolve(result.data);
    } else {
      entry.reject(new Error(result.error ?? 'gsd2Query failed'));
    }
  });
}

// ============================================================
// Core send primitive
// ============================================================

export async function sendGsd2Query(
  ws: GsdWebSocket,
  channelId: string,
  machineId: string,
  command: string,
  params?: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<unknown> {
  ensureHandler(ws);
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(requestId);
      reject(new Error(`gsd2Query timed out after ${timeoutMs}ms [${command}]`));
    }, timeoutMs);
    _pending.set(requestId, { resolve, reject, timer });
    ws.send({ type: 'gsd2Query', requestId, channelId, machineId, command, params });
  });
}

// ============================================================
// Named gsd2 wrappers (28 functions)
// ============================================================

export function gsd2GetHealth(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'health', { projectId });
}

export function gsd2ListMilestones(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'list-milestones', { projectId });
}

export function gsd2GetMilestone(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string, milestoneId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-milestone', { projectId, milestoneId });
}

export function gsd2ListSessions(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'list-sessions', { projectId });
}

export function gsd2DeriveState(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'derive-state', { projectId });
}

export function gsd2GetDoctorReport(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-doctor-report', { projectId });
}

export function gsd2GetForensicsReport(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-forensics-report', { projectId });
}

export function gsd2GetSkillHealth(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-skill-health', { projectId });
}

export function gsd2GetKnowledge(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-knowledge', { projectId });
}

export function gsd2GetCaptures(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-captures', { projectId });
}

export function gsd2ResolveCapture(
  ws: GsdWebSocket,
  channelId: string,
  machineId: string,
  projectId: string,
  captureId: string,
  classification: string,
  resolution: string,
  rationale: string,
): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'resolve-capture', { projectId, captureId, classification, resolution, rationale });
}

export function gsd2GetInspect(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-inspect', { projectId });
}

export function gsd2GetSteerContent(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-steer-content', { projectId });
}

export function gsd2SetSteerContent(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string, content: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'set-steer-content', { projectId, content });
}

export function gsd2GetUndoInfo(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-undo-info', { projectId });
}

export function gsd2GetRecoveryInfo(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-recovery-info', { projectId });
}

export function gsd2GetHistory(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-history', { projectId });
}

export function gsd2GetHooks(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-hooks', { projectId });
}

export function gsd2GetGitSummary(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-git-summary', { projectId });
}

export function gsd2ExportProgress(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'export-progress', { projectId });
}

export function gsd2GenerateHtmlReport(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'generate-html-report', { projectId });
}

export function gsd2GetReportsIndex(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-reports-index', { projectId });
}

export function gsd2GetPreferences(ws: GsdWebSocket, channelId: string, machineId: string, projectPath: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-preferences', { projectPath });
}

export function gsd2SavePreferences(
  ws: GsdWebSocket,
  channelId: string,
  machineId: string,
  projectPath: string,
  scope: string,
  payload: unknown,
): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'save-preferences', { projectPath, scope, payload });
}

export function gsd2ListWorktrees(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'list-worktrees', { projectId });
}

export function gsd2GetWorktreeDiff(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string, worktreeName: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-worktree-diff', { projectId, worktreeName });
}

export function gsd2GetVisualizerData(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-visualizer-data', { projectId });
}

export function gsd2GetSlice(ws: GsdWebSocket, channelId: string, machineId: string, projectId: string, milestoneId: string, sliceId: string): Promise<unknown> {
  return sendGsd2Query(ws, channelId, machineId, 'get-slice', { projectId, milestoneId, sliceId });
}
