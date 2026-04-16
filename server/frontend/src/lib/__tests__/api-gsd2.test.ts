// Tests for lib/api/gsd2.ts — WebSocket adapter for gsd2 commands
// Uses a hand-rolled mock ws object; no vi.mock needed because
// createGsd2Client accepts a GsdWebSocket instance as a parameter.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGsd2Client } from '../api/gsd2';
import type { GsdWebSocket } from '../api/ws';

// ============================================================
// Mock WebSocket
// ============================================================

type HandlerFn = (msg: unknown) => void;

function makeMockWs() {
  const handlers: Record<string, HandlerFn[]> = {};
  const sent: unknown[] = [];

  const ws = {
    on: vi.fn((type: string, handler: HandlerFn) => {
      if (!handlers[type]) handlers[type] = [];
      handlers[type].push(handler);
      return () => {
        handlers[type] = handlers[type].filter((h) => h !== handler);
      };
    }),
    send: vi.fn((msg: unknown) => {
      sent.push(msg);
    }),
    /** Simulate an incoming message from the server. */
    emit(msg: unknown) {
      const type = (msg as { type: string }).type;
      (handlers[type] ?? []).forEach((h) => h(msg));
    },
    /** All messages passed to send(). */
    get sent() {
      return sent;
    },
  };

  return ws as typeof ws & Pick<GsdWebSocket, 'on' | 'send'>;
}

// ============================================================
// Helpers
// ============================================================

const CHANNEL_ID = 'ch-test-001';
const MACHINE_ID = 'node-abc';

// ============================================================
// Tests
// ============================================================

describe('createGsd2Client', () => {
  let mockWs: ReturnType<typeof makeMockWs>;
  let client: ReturnType<typeof createGsd2Client>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWs = makeMockWs();
    client = createGsd2Client(mockWs as unknown as GsdWebSocket, CHANNEL_ID);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================
  // T1 — sendGsd2Query sends correct message shape
  // ============================================================

  it('sendGsd2Query sends a message with correct shape (machineId, command, channelId)', async () => {
    const queryPromise = client.sendGsd2Query(MACHINE_ID, 'health', { projectId: 'p1' });

    expect(mockWs.sent).toHaveLength(1);
    const sent = mockWs.sent[0] as Record<string, unknown>;
    expect(sent.type).toBe('gsd2Query');
    expect(sent.machineId).toBe(MACHINE_ID);
    expect(sent.command).toBe('health');
    expect(sent.channelId).toBe(CHANNEL_ID);
    expect(typeof sent.requestId).toBe('string');
    expect((sent.params as Record<string, string>).projectId).toBe('p1');

    // Resolve to avoid hanging
    mockWs.emit({ type: 'gsd2QueryResult', requestId: sent.requestId, channelId: CHANNEL_ID, ok: true, data: {} });
    await queryPromise;
  });

  // ============================================================
  // T2 — ok:true response resolves the Promise with data
  // ============================================================

  it('resolves with data when gsd2QueryResult ok:true is received', async () => {
    const queryPromise = client.sendGsd2Query(MACHINE_ID, 'list-milestones', { projectId: 'p2' });
    const sent = mockWs.sent[0] as Record<string, unknown>;
    const responseData = [{ id: 'M001', title: 'First' }];

    mockWs.emit({
      type: 'gsd2QueryResult',
      requestId: sent.requestId,
      channelId: CHANNEL_ID,
      ok: true,
      data: responseData,
    });

    const result = await queryPromise;
    expect(result).toEqual(responseData);
  });

  // ============================================================
  // T3 — ok:false response rejects the Promise with error string
  // ============================================================

  it('rejects with error message when gsd2QueryResult ok:false is received', async () => {
    const queryPromise = client.sendGsd2Query(MACHINE_ID, 'get-inspect', { projectId: 'p3' });
    const sent = mockWs.sent[0] as Record<string, unknown>;

    mockWs.emit({
      type: 'gsd2QueryResult',
      requestId: sent.requestId,
      channelId: CHANNEL_ID,
      ok: false,
      error: 'project not found',
    });

    await expect(queryPromise).rejects.toThrow('project not found');
  });

  // ============================================================
  // T4 — timeout: Promise rejects with timeout message
  // ============================================================

  it('rejects with timeout message when no response arrives within timeoutMs', async () => {
    const queryPromise = client.sendGsd2Query(MACHINE_ID, 'get-history', { projectId: 'p4' }, 5000);

    vi.advanceTimersByTime(5001);

    await expect(queryPromise).rejects.toThrow('gsd2Query timed out after 5000ms [get-history]');
  });

  // ============================================================
  // T5 — unmatched requestId: silently ignored
  // ============================================================

  it('silently ignores gsd2QueryResult with an unknown requestId', async () => {
    // Start a real query to keep the Promise open
    const queryPromise = client.sendGsd2Query(MACHINE_ID, 'get-hooks', { projectId: 'p5' });

    // Emit a result with a completely different requestId — should not resolve/reject queryPromise
    mockWs.emit({
      type: 'gsd2QueryResult',
      requestId: 'totally-unknown-id',
      channelId: CHANNEL_ID,
      ok: true,
      data: 'should not appear',
    });

    // queryPromise should still be pending — resolve it cleanly via timeout
    vi.advanceTimersByTime(30_001);
    await expect(queryPromise).rejects.toThrow('timed out');
  });

  // ============================================================
  // T6 — named function passes correct command and params
  // ============================================================

  it('gsd2GetHealth sends command "health" with projectId param', async () => {
    const healthPromise = client.gsd2GetHealth(MACHINE_ID, 'proj-xyz');

    expect(mockWs.sent).toHaveLength(1);
    const sent = mockWs.sent[0] as Record<string, unknown>;
    expect(sent.type).toBe('gsd2Query');
    expect(sent.command).toBe('health');
    expect(sent.machineId).toBe(MACHINE_ID);
    expect((sent.params as Record<string, string>).projectId).toBe('proj-xyz');

    const healthData = { budget_spent: 0.5, active_milestone_id: 'M001' };
    mockWs.emit({
      type: 'gsd2QueryResult',
      requestId: sent.requestId,
      channelId: CHANNEL_ID,
      ok: true,
      data: healthData,
    });

    const result = await healthPromise;
    expect(result).toEqual(healthData);
  });
});
