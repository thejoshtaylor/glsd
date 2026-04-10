// GSD Cloud — useCloudSession hook
// Manages full session lifecycle: REST create + WebSocket streaming
// Handles permission requests and questions from Claude Code

import { useState, useCallback, useRef, useEffect } from 'react';
import { GsdWebSocket } from '@/lib/api/ws';
import * as sessionsApi from '@/lib/api/sessions';
import type {
  PermissionRequestMessage,
  QuestionMessage,
  TaskCompleteMessage,
} from '@/lib/protocol';

// ============================================================
// State
// ============================================================

interface CloudSessionState {
  sessionId: string | null;
  channelId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  pendingPermission: PermissionRequestMessage | null;
  pendingQuestion: QuestionMessage | null;
}

// ============================================================
// Options / Return
// ============================================================

interface UseCloudSessionOptions {
  /** Called with text content extracted from a stream event */
  onData?: (data: string) => void;
  /** Called when the task completes */
  onTaskComplete?: (result: TaskCompleteMessage) => void;
  /** Called when the task errors */
  onTaskError?: (error: string) => void;
  /** Called on general WebSocket/session errors */
  onError?: (error: string) => void;
}

interface UseCloudSessionReturn {
  state: CloudSessionState;
  /** Create a server session and open WebSocket; returns sessionId */
  createSession: (nodeId: string, cwd: string) => Promise<string>;
  /** Send a task message over the WebSocket */
  sendTask: (
    prompt: string,
    opts?: { model?: string; effort?: string; permissionMode?: string },
  ) => void;
  /** Send a stop message over the WebSocket */
  sendStop: () => void;
  /** Respond to a pending permission request */
  respondPermission: (requestId: string, approved: boolean) => void;
  /** Respond to a pending question */
  respondQuestion: (requestId: string, answer: string) => void;
  /** Disconnect the WebSocket and reset state */
  disconnect: () => void;
}

// ============================================================
// Stream event text extraction
// ============================================================

/**
 * Extract human-readable text from a Claude streaming event object.
 * Handles the most common Anthropic SSE event shapes; falls back to
 * JSON.stringify for unrecognised shapes so nothing is silently swallowed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStreamText(event: any): string {
  if (!event || typeof event !== 'object') return '';

  // content_block_delta carries text deltas
  if (event.type === 'content_block_delta') {
    const delta = event.delta;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return delta.text;
    }
    return '';
  }

  // Legacy / direct text event
  if (event.type === 'text' && typeof event.text === 'string') {
    return event.text;
  }

  // message_delta with stop reason — no text to emit
  if (event.type === 'message_delta' || event.type === 'message_start' || event.type === 'message_stop') {
    return '';
  }

  // content_block_start — no text content yet
  if (event.type === 'content_block_start') {
    return '';
  }

  // ping — ignore
  if (event.type === 'ping') {
    return '';
  }

  // Fallback: stringify for debugging unrecognised shapes
  return JSON.stringify(event);
}

// ============================================================
// Hook
// ============================================================

const initialState: CloudSessionState = {
  sessionId: null,
  channelId: null,
  isConnected: false,
  isLoading: false,
  error: null,
  pendingPermission: null,
  pendingQuestion: null,
};

export function useCloudSession(options: UseCloudSessionOptions = {}): UseCloudSessionReturn {
  const { onData, onTaskComplete, onTaskError, onError } = options;

  const [state, setState] = useState<CloudSessionState>(initialState);

  // Keep option callbacks in refs to avoid stale closures
  const onDataRef = useRef(onData);
  const onTaskCompleteRef = useRef(onTaskComplete);
  const onTaskErrorRef = useRef(onTaskError);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDataRef.current = onData;
    onTaskCompleteRef.current = onTaskComplete;
    onTaskErrorRef.current = onTaskError;
    onErrorRef.current = onError;
  }, [onData, onTaskComplete, onTaskError, onError]);

  // WebSocket instance — persisted across renders
  const wsRef = useRef<GsdWebSocket | null>(null);
  // Unsubscribe functions returned by ws.on()
  const unsubscribeRefs = useRef<Array<() => void>>([]);

  // ============================================================
  // Helpers
  // ============================================================

  const cleanupWs = useCallback(() => {
    // Call all unsubscribers
    for (const unsub of unsubscribeRefs.current) {
      unsub();
    }
    unsubscribeRefs.current = [];
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
  }, []);

  // ============================================================
  // createSession
  // ============================================================

  const createSession = useCallback(async (nodeId: string, cwd: string): Promise<string> => {
    // Clean up any previous session
    cleanupWs();
    setState(initialState);

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const session = await sessionsApi.createSession(nodeId, cwd);
      const sessionId = session.id;
      // The backend returns channel_id on session creation; fall back to id if absent
      // (real backend per Phase 3 routes the channel by sessionId)
      const channelId = (session as { channel_id?: string }).channel_id ?? sessionId;

      // Open WebSocket
      const ws = new GsdWebSocket();
      wsRef.current = ws;

      // Register all message handlers
      const unsubs: Array<() => void> = [];

      unsubs.push(ws.on('stream', (msg) => {
        // msg is ProtocolMessage — narrow to stream
        const stream = msg as { type: 'stream'; event: unknown };
        const text = extractStreamText(stream.event);
        if (text) {
          onDataRef.current?.(text);
        }
      }));

      unsubs.push(ws.on('taskStarted', () => {
        setState((prev) => ({ ...prev, isConnected: true }));
      }));

      unsubs.push(ws.on('taskComplete', (msg) => {
        const complete = msg as TaskCompleteMessage;
        onTaskCompleteRef.current?.(complete);
        setState((prev) => ({ ...prev, isConnected: false }));
      }));

      unsubs.push(ws.on('taskError', (msg) => {
        const errMsg = msg as { type: 'taskError'; error: string };
        onTaskErrorRef.current?.(errMsg.error);
        setState((prev) => ({ ...prev, error: errMsg.error, isConnected: false }));
      }));

      unsubs.push(ws.on('permissionRequest', (msg) => {
        const req = msg as PermissionRequestMessage;
        setState((prev) => ({ ...prev, pendingPermission: req }));
      }));

      unsubs.push(ws.on('question', (msg) => {
        const q = msg as QuestionMessage;
        setState((prev) => ({ ...prev, pendingQuestion: q }));
      }));

      unsubscribeRefs.current = unsubs;

      ws.connect(channelId);

      setState({
        sessionId,
        channelId,
        isConnected: false, // becomes true on taskStarted
        isLoading: false,
        error: null,
        pendingPermission: null,
        pendingQuestion: null,
      });

      return sessionId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      onErrorRef.current?.(message);
      throw err;
    }
  }, [cleanupWs]);

  // ============================================================
  // sendTask
  // ============================================================

  const sendTask = useCallback(
    (
      prompt: string,
      opts?: { model?: string; effort?: string; permissionMode?: string },
    ) => {
      const ws = wsRef.current;
      if (!ws) return;

      setState((prev) => {
        const msg = {
          type: 'task' as const,
          taskId: crypto.randomUUID(),
          sessionId: prev.sessionId ?? '',
          channelId: prev.channelId ?? '',
          prompt,
          model: opts?.model ?? 'claude-sonnet-4-20250514',
          effort: opts?.effort ?? 'high',
          permissionMode: opts?.permissionMode ?? 'default',
          cwd: '',
        };
        ws.send(msg);
        return prev;
      });
    },
    [],
  );

  // ============================================================
  // sendStop
  // ============================================================

  const sendStop = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;

    setState((prev) => {
      ws.send({
        type: 'stop',
        sessionId: prev.sessionId ?? '',
        channelId: prev.channelId ?? '',
      });
      return prev;
    });
  }, []);

  // ============================================================
  // respondPermission
  // ============================================================

  const respondPermission = useCallback((requestId: string, approved: boolean) => {
    const ws = wsRef.current;
    if (!ws) return;

    setState((prev) => {
      ws.send({
        type: 'permissionResponse',
        sessionId: prev.sessionId ?? '',
        channelId: prev.channelId ?? '',
        requestId,
        approved,
      });
      return { ...prev, pendingPermission: null };
    });
  }, []);

  // ============================================================
  // respondQuestion
  // ============================================================

  const respondQuestion = useCallback((requestId: string, answer: string) => {
    const ws = wsRef.current;
    if (!ws) return;

    setState((prev) => {
      ws.send({
        type: 'questionResponse',
        sessionId: prev.sessionId ?? '',
        channelId: prev.channelId ?? '',
        requestId,
        answer,
      });
      return { ...prev, pendingQuestion: null };
    });
  }, []);

  // ============================================================
  // disconnect
  // ============================================================

  const disconnect = useCallback(() => {
    cleanupWs();
    setState(initialState);
  }, [cleanupWs]);

  // ============================================================
  // Cleanup on unmount
  // ============================================================

  useEffect(() => {
    return () => {
      cleanupWs();
    };
  }, [cleanupWs]);

  return {
    state,
    createSession,
    sendTask,
    sendStop,
    respondPermission,
    respondQuestion,
    disconnect,
  };
}
