// GSD Cloud — gsd2 WebSocket adapter
//
// Design: createGsd2Client(ws, channelId) returns a typed client bound to a
// specific GsdWebSocket session. Call it once per session (inside
// useCloudSession or equivalent) and discard when the session closes.
//
// machineId resolution: machineId must be supplied by each caller because
// there is no global "active node" context — the caller (e.g., a React hook
// or page component) already holds the machineId for the node it is targeting.
// The relay uses machineId to forward the message to the correct daemon; the
// daemon never sees it.
//
// channelId resolution: taken from the GsdWebSocket connect() parameter and
// passed into the factory. Stored in the closure so callers never touch it.

import type { GsdWebSocket } from './ws';
import type { Gsd2QueryResultMessage } from '../protocol';

// ============================================================
// Internal pending-request registry types
// ============================================================

type PendingEntry = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// ============================================================
// Factory
// ============================================================

/**
 * Bind a gsd2 client to an active WebSocket session.
 *
 * @param ws        The GsdWebSocket instance for the current session.
 * @param channelId The channelId used when ws.connect() was called.
 *
 * @returns A typed client exposing sendGsd2Query and all 28 named commands.
 *          The gsd2QueryResult handler is registered exactly once per client.
 */
export function createGsd2Client(ws: GsdWebSocket, channelId: string) {
  const _pending = new Map<string, PendingEntry>();

  // Register once — routes incoming gsd2QueryResult to waiting callers.
  ws.on('gsd2QueryResult', (msg) => {
    const result = msg as Gsd2QueryResultMessage;
    const entry = _pending.get(result.requestId);
    if (!entry) return; // silently ignore unmatched requestId
    clearTimeout(entry.timer);
    _pending.delete(result.requestId);
    if (result.ok) {
      entry.resolve(result.data);
    } else {
      entry.reject(new Error(result.error ?? 'gsd2Query failed'));
    }
  });

  // ============================================================
  // Core send primitive
  // ============================================================

  /**
   * Send a gsd2Query and return a Promise that resolves with the daemon's
   * data payload or rejects on error or timeout.
   *
   * Observability: _pending.size reflects in-flight request count.
   * Timeout errors include the command name for fast triage.
   */
  async function sendGsd2Query(
    machineId: string,
    command: string,
    params?: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    const requestId = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        _pending.delete(requestId);
        reject(new Error(`gsd2Query timed out after ${timeoutMs}ms [${command}]`));
      }, timeoutMs);
      _pending.set(requestId, { resolve, reject, timer });
      ws.send({
        type: 'gsd2Query',
        requestId,
        channelId,
        machineId,
        command,
        ...(params !== undefined ? { params } : {}),
      });
    });
  }

  // ============================================================
  // Named command wrappers (28 in-scope gsd2 functions)
  // ============================================================

  return {
    sendGsd2Query,

    /** Project health summary — budget, milestone/slice/task progress, phase. */
    gsd2GetHealth: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'health', { projectId }),

    /** List all milestones for a project. */
    gsd2ListMilestones: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'list-milestones', { projectId }),

    /** Fetch a single milestone by ID. */
    gsd2GetMilestone: (machineId: string, projectId: string, milestoneId: string) =>
      sendGsd2Query(machineId, 'get-milestone', { projectId, milestoneId }),

    /** List all sessions for a project. */
    gsd2ListSessions: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'list-sessions', { projectId }),

    /** Derive the current project state from the GSD database. */
    gsd2DeriveState: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'derive-state', { projectId }),

    /** Retrieve the latest doctor report for a project. */
    gsd2GetDoctorReport: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-doctor-report', { projectId }),

    /** Retrieve the latest forensics report for a project. */
    gsd2GetForensicsReport: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-forensics-report', { projectId }),

    /** Retrieve skill health status for a project. */
    gsd2GetSkillHealth: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-skill-health', { projectId }),

    /** Retrieve the KNOWLEDGE.md content for a project. */
    gsd2GetKnowledge: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-knowledge', { projectId }),

    /** List open captures (inbox items) for a project. */
    gsd2GetCaptures: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-captures', { projectId }),

    /** Resolve (triage) a capture item. */
    gsd2ResolveCapture: (
      machineId: string,
      projectId: string,
      captureId: string,
      classification: string,
      resolution: string,
      rationale: string,
    ) =>
      sendGsd2Query(machineId, 'resolve-capture', {
        projectId,
        captureId,
        classification,
        resolution,
        rationale,
      }),

    /** Retrieve the current inspection report for a project. */
    gsd2GetInspect: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-inspect', { projectId }),

    /** Read the steer (STEER.md) content for a project. */
    gsd2GetSteerContent: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-steer-content', { projectId }),

    /** Write new steer content for a project. */
    gsd2SetSteerContent: (machineId: string, projectId: string, content: string) =>
      sendGsd2Query(machineId, 'set-steer-content', { projectId, content }),

    /** Retrieve undo metadata for a project. */
    gsd2GetUndoInfo: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-undo-info', { projectId }),

    /** Retrieve recovery metadata for a project. */
    gsd2GetRecoveryInfo: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-recovery-info', { projectId }),

    /** Retrieve the GSD event history for a project. */
    gsd2GetHistory: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-history', { projectId }),

    /** List configured hooks for a project. */
    gsd2GetHooks: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-hooks', { projectId }),

    /** Retrieve a git log summary for a project. */
    gsd2GetGitSummary: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-git-summary', { projectId }),

    /** Export current progress to a shareable artifact. */
    gsd2ExportProgress: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'export-progress', { projectId }),

    /** Generate an HTML progress report for a project. */
    gsd2GenerateHtmlReport: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'generate-html-report', { projectId }),

    /** List all generated report files for a project. */
    gsd2GetReportsIndex: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-reports-index', { projectId }),

    /** Read user/project preferences. projectPath is the absolute path on the node. */
    gsd2GetPreferences: (machineId: string, projectPath: string) =>
      sendGsd2Query(machineId, 'get-preferences', { projectPath }),

    /** Write user/project preferences. scope: "user" | "project". */
    gsd2SavePreferences: (
      machineId: string,
      projectPath: string,
      scope: string,
      payload: Record<string, unknown>,
    ) => sendGsd2Query(machineId, 'save-preferences', { projectPath, scope, payload }),

    /** List git worktrees for a project. */
    gsd2ListWorktrees: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'list-worktrees', { projectId }),

    /** Retrieve the diff for a specific worktree. */
    gsd2GetWorktreeDiff: (machineId: string, projectId: string, worktreeName: string) =>
      sendGsd2Query(machineId, 'get-worktree-diff', { projectId, worktreeName }),

    /** Retrieve data for the visualizer view of a project. */
    gsd2GetVisualizerData: (machineId: string, projectId: string) =>
      sendGsd2Query(machineId, 'get-visualizer-data', { projectId }),

    /** Fetch a single slice within a milestone. */
    gsd2GetSlice: (
      machineId: string,
      projectId: string,
      milestoneId: string,
      sliceId: string,
    ) => sendGsd2Query(machineId, 'get-slice', { projectId, milestoneId, sliceId }),
  };
}

/** Convenience type alias for the client returned by createGsd2Client. */
export type Gsd2Client = ReturnType<typeof createGsd2Client>;
