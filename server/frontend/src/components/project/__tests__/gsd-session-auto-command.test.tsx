import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, act, screen } from '@/test/test-utils';
import type { PendingLaunch } from '@/contexts/terminal-context';

// ── Shared test state for InteractiveTerminal mock ────────────────────────────

// Mutable refs captured from the most recent InteractiveTerminal render.
// The test helpers below drive them to simulate session creation and data events.
let capturedOnSessionCreated: ((sid: string) => void) | undefined;
let capturedOnData: ((text: string) => void) | undefined;
const sendTaskSpy = vi.fn();

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useGsd2Health: vi.fn(),
    useGsd2Models: vi.fn(),
  };
});

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    ptyWrite: vi.fn(),
  };
});

// react-resizable-panels uses ResizeObserver internally; stub the whole module
vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}));

// InteractiveTerminal test double: captures callbacks, exposes sendTask via ref.
// Must use React.forwardRef so useImperativeHandle can attach to the ref object.
vi.mock('@/components/terminal/interactive-terminal', () => ({
  InteractiveTerminal: React.forwardRef(function MockInteractiveTerminal(
    props: {
      onSessionCreated?: (sid: string) => void;
      onData?: (text: string) => void;
    },
    ref: React.ForwardedRef<{ sendTask: (prompt: string) => void }>
  ) {
    capturedOnSessionCreated = props.onSessionCreated;
    capturedOnData = props.onData;
    React.useImperativeHandle(ref, () => ({ sendTask: sendTaskSpy }));
    return <div data-testid="mock-terminal" />;
  }),
  clearTerminalCache: vi.fn(),
}));

// ── Context mock factory ──────────────────────────────────────────────────────

const mockSetPendingLaunch = vi.fn();

function makeContextValue(pendingLaunch: PendingLaunch | null, headlessRunning = true) {
  return {
    pendingLaunch,
    setPendingLaunch: mockSetPendingLaunch,
    headlessRunning,
    headlessSessionId: null,
    setHeadlessState: vi.fn(),
    terminalFontSize: 14,
    getProjectTerminals: vi.fn(() => ({ tabs: [], activeTabId: '' })),
    addTab: vi.fn(),
    closeTab: vi.fn(),
    setActiveTab: vi.fn(),
    renameTab: vi.fn(),
    setTabExited: vi.fn(),
    setTabReady: vi.fn(),
    hasTerminals: vi.fn(() => false),
    setTabSessionId: vi.fn(),
    setTabNodeId: vi.fn(),
    registerProject: vi.fn(),
    getProjectPaths: vi.fn(() => new Map()),
    getAllTerminals: vi.fn(() => new Map()),
    setTerminalFontSize: vi.fn(),
    shellProjectId: null,
    shellProjectPath: null,
    setShellProject: vi.fn(),
    shellPanelCollapsed: true,
    setShellPanelCollapsed: vi.fn(),
    toggleSplit: vi.fn(),
    setSplitSessionId: vi.fn(),
    setSplitExited: vi.fn(),
    broadcastMode: false,
    broadcastTabIds: new Set<string>(),
    toggleBroadcastMode: vi.fn(),
    toggleBroadcastTab: vi.fn(),
    broadcastWrite: vi.fn(),
    isRestored: true,
  };
}

vi.mock('@/contexts/terminal-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/terminal-context')>();
  return {
    ...actual,
    useTerminalContext: vi.fn(() => makeContextValue(null, false)),
  };
});

import { useGsd2Health, useGsd2Models } from '@/lib/queries';
import { useTerminalContext } from '@/contexts/terminal-context';
import { Gsd2SessionTab } from '../gsd2-session-tab';

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  sendTaskSpy.mockClear();
  mockSetPendingLaunch.mockClear();
  capturedOnSessionCreated = undefined;
  capturedOnData = undefined;

  (useGsd2Health as Mock).mockReturnValue({ data: undefined });
  (useGsd2Models as Mock).mockReturnValue({ data: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Helper: render with headlessRunning=true so InteractiveTerminal mounts ────
// Gsd2SessionTab only renders InteractiveTerminal when headlessRunning is true.

function renderWithPending(pending: PendingLaunch | null) {
  (useTerminalContext as Mock).mockReturnValue(makeContextValue(pending, /* headlessRunning */ true));
  return render(
    <Gsd2SessionTab
      projectId="proj-1"
      projectPath="/code/proj-1"
      session={{} as never}
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Gsd2SessionTab with no pendingLaunch', () => {
  it('renders without sending any command when pendingLaunch is null', () => {
    (useTerminalContext as Mock).mockReturnValue(makeContextValue(null, false));
    render(
      <Gsd2SessionTab
        projectId="proj-1"
        projectPath="/code/proj-1"
        session={{} as never}
      />
    );
    expect(sendTaskSpy).not.toHaveBeenCalled();
  });
});

describe('Gsd2SessionTab — new-milestone pending launch', () => {
  it('sends the pending command when onSessionCreated fires', () => {
    vi.useFakeTimers();

    renderWithPending({
      nodeId: 'node-a',
      command: '/gsd new-milestone\r',
      vision: 'build auth module',
    });

    expect(screen.getByTestId('mock-terminal')).toBeInTheDocument();

    // Trigger session creation
    act(() => {
      capturedOnSessionCreated?.('session-123');
    });

    // Advance past the 300ms settle delay
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(sendTaskSpy).toHaveBeenCalledWith('/gsd new-milestone\r');
  });

  it("sends vision when onData contains \"What's the vision?\"", () => {
    vi.useFakeTimers();

    renderWithPending({
      nodeId: 'node-a',
      command: '/gsd new-milestone\r',
      vision: 'build auth module',
    });

    act(() => { capturedOnSessionCreated?.('session-123'); });
    act(() => { vi.advanceTimersByTime(400); });

    // Simulate GSD output containing the vision prompt
    act(() => {
      capturedOnData?.("What's the vision? ");
    });

    expect(sendTaskSpy).toHaveBeenCalledWith('build auth module');
    expect(mockSetPendingLaunch).toHaveBeenCalledWith(null);
  });

  it('clears pending launch on vision timeout (15s without prompt)', () => {
    vi.useFakeTimers();

    renderWithPending({
      nodeId: 'node-a',
      command: '/gsd new-milestone\r',
      vision: 'build auth module',
    });

    act(() => { capturedOnSessionCreated?.('session-123'); });
    act(() => { vi.advanceTimersByTime(400); });

    // 15s timeout fires without vision prompt
    act(() => { vi.advanceTimersByTime(15_000); });

    expect(mockSetPendingLaunch).toHaveBeenCalledWith(null);
  });
});

describe('Gsd2SessionTab — quick task pending launch', () => {
  it('sends the quick task command and clears pending immediately (no vision wait)', () => {
    vi.useFakeTimers();

    renderWithPending({
      nodeId: 'node-a',
      command: '/gsd quick fix login bug\r',
      // no vision field
    });

    act(() => { capturedOnSessionCreated?.('session-456'); });
    act(() => { vi.advanceTimersByTime(400); });

    expect(sendTaskSpy).toHaveBeenCalledWith('/gsd quick fix login bug\r');
    expect(mockSetPendingLaunch).toHaveBeenCalledWith(null);
  });

  it('does not send vision response after Quick Task command is sent', () => {
    vi.useFakeTimers();

    renderWithPending({
      nodeId: 'node-a',
      command: '/gsd quick fix login bug\r',
    });

    act(() => { capturedOnSessionCreated?.('session-456'); });
    act(() => { vi.advanceTimersByTime(400); });

    const sendCallCount = sendTaskSpy.mock.calls.length;

    // Even if "What's the vision?" appears in stream output, it should not fire again
    act(() => { capturedOnData?.("What's the vision?"); });

    // sendTask should only have been called once (the initial command)
    expect(sendTaskSpy.mock.calls.length).toBe(sendCallCount);
  });
});
