import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { ProjectOverviewTab } from '../project-overview-tab';
import type { Project } from '@/lib/tauri';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useGsdState: vi.fn(),
    useGsdTodos: vi.fn(),
    useGsdConfig: vi.fn(),
    useGsdSync: vi.fn(),
    useEnvironmentInfo: vi.fn(),
    useScannerSummary: vi.fn(),
    useProjectDocs: vi.fn(),
    useDetectTechStack: vi.fn(),
    useProjectWorkflows: vi.fn(),
    useProjectNodes: vi.fn(),
    useGsd2Health: vi.fn(),
    useGsd2Models: vi.fn(),
    useActivityFeed: vi.fn(),
    useGitStatus: vi.fn(),
    useDependencyAlerts: vi.fn(),
    useProjectRequirements: vi.fn(),
    useProjectVision: vi.fn(),
    useRoadmapProgress: vi.fn(),
  };
});

// Mock heavy sub-components to avoid rendering their internals
vi.mock('@/components/project', () => ({
  ActivityFeed: () => <div data-testid="activity-feed" />,
}));

vi.mock('../quick-actions-bar', () => ({
  QuickActionsBar: ({
    onNewMilestone,
    onQueueMilestone,
    onQuickTask,
  }: {
    onNewMilestone?: () => void;
    onQueueMilestone?: () => void;
    onQuickTask?: () => void;
  }) => (
    <div>
      <button onClick={onNewMilestone} data-testid="trigger-new-milestone">New Milestone</button>
      <button onClick={onQueueMilestone} data-testid="trigger-queue-milestone">Queue Milestone</button>
      <button onClick={onQuickTask} data-testid="trigger-quick-task">Quick Task</button>
    </div>
  ),
}));

vi.mock('../git-status-widget', () => ({
  GitStatusWidget: () => <div data-testid="git-status" />,
}));

vi.mock('../dependency-alerts-card', () => ({
  DependencyAlertsCard: () => <div data-testid="dep-alerts" />,
}));

vi.mock('../requirements-card', () => ({
  RequirementsCard: () => <div data-testid="requirements" />,
}));

vi.mock('../vision-card', () => ({
  VisionCard: () => <div data-testid="vision-card" />,
}));

vi.mock('../roadmap-progress-card', () => ({
  RoadmapProgressCard: () => <div data-testid="roadmap-progress" />,
}));

vi.mock('../attach-node-dialog', () => ({
  AttachNodeDialog: () => <div data-testid="attach-node-dialog" />,
}));

vi.mock('@/components/shared/voice-input-button', () => ({
  VoiceInputButton: ({ onTranscribed }: { onTranscribed: (text: string) => void }) => (
    <button data-testid="voice-btn" onClick={() => onTranscribed('voice text')}>Voice</button>
  ),
}));

// Radix Select: native <select> to avoid JSDOM pointer-event issues
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select data-testid="node-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

// Spy on setPendingLaunch from useTerminalContext
const mockSetPendingLaunch = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/contexts/terminal-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/terminal-context')>();
  return {
    ...actual,
    useTerminalContext: vi.fn(() => ({
      setPendingLaunch: mockSetPendingLaunch,
      pendingLaunch: null,
      headlessRunning: false,
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
    })),
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import {
  useProjectNodes,
  useGsdSync,
  useGsdState,
  useGsdTodos,
  useGsdConfig,
  useEnvironmentInfo,
  useScannerSummary,
  useProjectDocs,
  useDetectTechStack,
  useProjectWorkflows,
} from '@/lib/queries';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NODE_A = { id: 'node-a', local_path: '/code/a', clone_status: 'ready' as const };

const MOCK_PROJECT: Project = {
  id: 'proj-1',
  name: 'Test Project',
  path: '/code/test',
  status: 'active',
  description: null,
  tech_stack: {
    has_planning: false,
    framework: null,
    language: null,
    package_manager: null,
    database: null,
    test_framework: null,
  },
  gsd_version: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderOverviewTab() {
  return render(
    <ProjectOverviewTab
      project={MOCK_PROJECT}
      onOpenShell={vi.fn()}
    />
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSetPendingLaunch.mockClear();
  mockNavigate.mockClear();
  (useProjectNodes as Mock).mockReturnValue({ data: [NODE_A] });
  (useGsdSync as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useGsdState as Mock).mockReturnValue({ data: undefined });
  (useGsdTodos as Mock).mockReturnValue({ data: [] });
  (useGsdConfig as Mock).mockReturnValue({ data: undefined });
  (useEnvironmentInfo as Mock).mockReturnValue({ data: undefined, isLoading: false, error: null });
  (useScannerSummary as Mock).mockReturnValue({ data: undefined });
  (useProjectDocs as Mock).mockReturnValue({ data: undefined });
  (useDetectTechStack as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useProjectWorkflows as Mock).mockReturnValue({ data: undefined });
});

// ── NewMilestoneModal confirm → setPendingLaunch + navigate ───────────────────

describe('handleNewMilestoneConfirm', () => {
  it('calls setPendingLaunch with command, vision, and nodeId', () => {
    renderOverviewTab();
    fireEvent.click(screen.getByTestId('trigger-new-milestone'));
    fireEvent.change(screen.getByPlaceholderText('Describe the milestone vision…'), {
      target: { value: 'build auth module' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockSetPendingLaunch).toHaveBeenCalledWith({
      nodeId: NODE_A.id,
      command: '/gsd new-milestone\r',
      vision: 'build auth module',
    });
  });

  it('calls navigate to gsd2-headless view after confirm', () => {
    renderOverviewTab();
    fireEvent.click(screen.getByTestId('trigger-new-milestone'));
    fireEvent.change(screen.getByPlaceholderText('Describe the milestone vision…'), {
      target: { value: 'ship v2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      `/projects/${MOCK_PROJECT.id}?view=gsd2-headless`
    );
  });
});

// ── QueueMilestoneModal confirm ───────────────────────────────────────────────

describe('handleQueueMilestoneConfirm', () => {
  it('calls setPendingLaunch with /gsd queue\\r command, vision, and nodeId', () => {
    renderOverviewTab();
    fireEvent.click(screen.getByTestId('trigger-queue-milestone'));
    fireEvent.change(screen.getByPlaceholderText('Describe the milestone vision…'), {
      target: { value: 'refactor auth' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockSetPendingLaunch).toHaveBeenCalledWith({
      nodeId: NODE_A.id,
      command: '/gsd queue\r',
      vision: 'refactor auth',
    });
  });

  it('calls navigate to gsd2-headless view after queue confirm', () => {
    renderOverviewTab();
    fireEvent.click(screen.getByTestId('trigger-queue-milestone'));
    fireEvent.change(screen.getByPlaceholderText('Describe the milestone vision…'), {
      target: { value: 'add payments' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      `/projects/${MOCK_PROJECT.id}?view=gsd2-headless`
    );
  });
});

// ── QuickTaskModal confirm ────────────────────────────────────────────────────

describe('handleQuickTaskConfirm', () => {
  it('calls setPendingLaunch with /gsd quick {task}\\r and no vision field', () => {
    renderOverviewTab();
    fireEvent.click(screen.getByTestId('trigger-quick-task'));
    fireEvent.change(screen.getByPlaceholderText('Describe the task…'), {
      target: { value: 'fix login bug' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockSetPendingLaunch).toHaveBeenCalledWith({
      nodeId: NODE_A.id,
      command: '/gsd quick fix login bug\r',
    });
  });

  it('pendingLaunch for QuickTask has no vision field', () => {
    renderOverviewTab();
    fireEvent.click(screen.getByTestId('trigger-quick-task'));
    fireEvent.change(screen.getByPlaceholderText('Describe the task…'), {
      target: { value: 'update tests' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    const call = mockSetPendingLaunch.mock.calls[0][0] as Record<string, unknown>;
    expect(call.vision).toBeUndefined();
  });

  it('calls navigate to gsd2-headless view after quick task confirm', () => {
    renderOverviewTab();
    fireEvent.click(screen.getByTestId('trigger-quick-task'));
    fireEvent.change(screen.getByPlaceholderText('Describe the task…'), {
      target: { value: 'fix tests' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      `/projects/${MOCK_PROJECT.id}?view=gsd2-headless`
    );
  });
});
