// GSD Cloud — api/gsd2.ts WebSocket adapter tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the ws module — tests supply their own mock ws instances directly
vi.mock('../api/ws', () => ({
  GsdWebSocket: vi.fn(),
}));

import { sendGsd2Query, gsd2GetHealth } from '../api/gsd2';
import type { GsdWebSocket } from '../api/ws';

// ============================================================
// Helpers
// ============================================================

/**
 * Build a minimal mock GsdWebSocket. The `on` handler captures the
 * registered gsd2QueryResult handler so tests can trigger it directly.
 */
function makeMockWs() {
  // Capture registered handlers by type
  const handlers = new Map<string, (msg: unknown) => void>();

  const ws = {
    on: vi.fn((type: string, handler: (msg: unknown) => void) => {
      handlers.set(type, handler);
      return () => { handlers.delete(type); };
    }),
    send: vi.fn(),
    // Helper: trigger a registered handler with a message
    _trigger: (type: string, msg: unknown) => {
      const h = handlers.get(type);
      if (h) h(msg);
    },
  } as unknown as GsdWebSocket & { _trigger: (type: string, msg: unknown) => void };

  return ws;
}

// ============================================================
// Tests
// ============================================================

describe('sendGsd2Query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends correct message shape including machineId and command', async () => {
    const ws = makeMockWs();
    const promise = sendGsd2Query(ws, 'ch-1', 'machine-abc', 'health', { projectId: 'proj-1' });

    // Verify the sent message shape
    expect(ws.send).toHaveBeenCalledOnce();
    const sent = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(sent.type).toBe('gsd2Query');
    expect(sent.machineId).toBe('machine-abc');
    expect(sent.command).toBe('health');
    expect(sent.channelId).toBe('ch-1');
    expect(typeof sent.requestId).toBe('string');
    expect(sent.params).toEqual({ projectId: 'proj-1' });

    // Resolve so no timer leak
    (ws as ReturnType<typeof makeMockWs>)._trigger('gsd2QueryResult', {
      type: 'gsd2QueryResult',
      requestId: sent.requestId,
      channelId: 'ch-1',
      ok: true,
      data: null,
    });
    await promise;
  });

  it('ok:true response resolves the Promise with data', async () => {
    const ws = makeMockWs();
    const promise = sendGsd2Query(ws, 'ch-1', 'machine-abc', 'list-milestones');

    const sent = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    const responseData = { milestones: ['M001', 'M002'] };

    (ws as ReturnType<typeof makeMockWs>)._trigger('gsd2QueryResult', {
      type: 'gsd2QueryResult',
      requestId: sent.requestId,
      channelId: 'ch-1',
      ok: true,
      data: responseData,
    });

    await expect(promise).resolves.toEqual(responseData);
  });

  it('ok:false response rejects the Promise with error string', async () => {
    const ws = makeMockWs();
    const promise = sendGsd2Query(ws, 'ch-1', 'machine-abc', 'get-milestone', { milestoneId: 'M999' });

    const sent = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;

    (ws as ReturnType<typeof makeMockWs>)._trigger('gsd2QueryResult', {
      type: 'gsd2QueryResult',
      requestId: sent.requestId,
      channelId: 'ch-1',
      ok: false,
      error: 'milestone not found',
    });

    await expect(promise).rejects.toThrow('milestone not found');
  });

  it('times out and rejects with timeout message including command name', async () => {
    const ws = makeMockWs();
    const promise = sendGsd2Query(ws, 'ch-1', 'machine-abc', 'derive-state', undefined, 5000);

    // Advance time past the timeout
    vi.advanceTimersByTime(6000);

    await expect(promise).rejects.toThrow('gsd2Query timed out after 5000ms [derive-state]');
  });

  it('silently ignores incoming result with unknown requestId', async () => {
    const ws = makeMockWs();
    const promise = sendGsd2Query(ws, 'ch-1', 'machine-abc', 'health');

    // Trigger result for a different (unknown) requestId — should not reject our promise
    (ws as ReturnType<typeof makeMockWs>)._trigger('gsd2QueryResult', {
      type: 'gsd2QueryResult',
      requestId: 'totally-unknown-id',
      channelId: 'ch-1',
      ok: true,
      data: null,
    });

    // Our promise is still pending — advance time to clean up
    vi.advanceTimersByTime(31000);
    await expect(promise).rejects.toThrow('timed out');
  });
});

describe('gsd2GetHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes correct command string "health" and projectId param', async () => {
    const ws = makeMockWs();
    const promise = gsd2GetHealth(ws, 'ch-1', 'machine-abc', 'proj-42');

    const sent = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(sent.command).toBe('health');
    expect(sent.params).toEqual({ projectId: 'proj-42' });

    // Resolve
    (ws as ReturnType<typeof makeMockWs>)._trigger('gsd2QueryResult', {
      type: 'gsd2QueryResult',
      requestId: sent.requestId,
      channelId: 'ch-1',
      ok: true,
      data: { status: 'ok' },
    });

    await expect(promise).resolves.toEqual({ status: 'ok' });
  });
});
