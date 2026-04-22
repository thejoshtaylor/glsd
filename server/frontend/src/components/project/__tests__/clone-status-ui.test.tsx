import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { QuickActionsBar } from '../quick-actions-bar';
import { ProjectOverviewTab } from '../project-overview-tab';
import type { ProjectNodePublic } from '@/lib/api/projects';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Tooltip requires TooltipProvider context — mock to passthrough in tests
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useProjectSessions: vi.fn(),
    useProjectNodes: vi.fn(),
    useGsdSync: vi.fn(),
    useGsdState: vi.fn(),
    useGsdTodos: vi.fn(),
    useGsdConfig: vi.fn(),
    useEnvironmentInfo: vi.fn(),
    useScannerSummary: vi.fn(),
    useProjectDocs: vi.fn(),
    useDetectTechStack: vi.fn(),
    useProjectWorkflows: vi.fn(),
    useGsdFileWatcher: vi.fn(),
    useActivityLog: vi.fn(),
  };
});

// Mock sub-components to avoid deep dependency chains
vi.mock('../git-status-widget', () => ({ GitStatusWidget: () => null }));
vi.mock('../dependency-alerts-card', () => ({ DependencyAlertsCard: () => null }));
vi.mock('../requirements-card', () => ({ RequirementsCard: () => null }));
vi.mock('../vision-card', () => ({ VisionCard: () => null }));
vi.mock('../roadmap-progress-card', () => ({ RoadmapProgressCard: () => null }));
vi.mock('../attach-node-dialog', () => ({ AttachNodeDialog: () => null }));
vi.mock('@/components/project', () => ({ ActivityFeed: () => null }));

import {
  useProjectSessions,
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

function makeNode(overrides: Partial<ProjectNodePublic> = {}): ProjectNodePublic {
  return {
    id: 'node-1',
    project_id: 'proj-1',
    node_id: 'n-1',
    local_path: '/home/user/code',
    is_primary: true,
    last_synced_at: null,
    last_session_run_at: null,
    created_at: null,
    clone_status: null,
    ...overrides,
  };
}

const MOCK_PROJECT = {
  id: 'proj-1',
  name: 'Test Project',
  path: '/home/user/code',
  status: 'active',
  tech_stack: { has_planning: false, framework: null, language: null, package_manager: null, database: null, test_framework: null },
  gsd_version: null,
  description: null,
} as any;

function setupOverviewDefaults() {
  (useGsdSync as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false });
  (useGsdState as Mock).mockReturnValue({ data: null });
  (useGsdTodos as Mock).mockReturnValue({ data: [] });
  (useGsdConfig as Mock).mockReturnValue({ data: null });
  (useEnvironmentInfo as Mock).mockReturnValue({ data: null, isLoading: false, error: null });
  (useScannerSummary as Mock).mockReturnValue({ data: null });
  (useProjectDocs as Mock).mockReturnValue({ data: null });
  (useDetectTechStack as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false });
  (useProjectWorkflows as Mock).mockReturnValue({ data: null });
  (useProjectSessions as Mock).mockReturnValue({ data: { data: [], count: 0 } });
  (useProjectNodes as Mock).mockReturnValue({ data: [] });
}

// ── QuickActionsBar tests ─────────────────────────────────────────────────────

describe('QuickActionsBar — smart GSD launcher buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useProjectSessions as Mock).mockReturnValue({ data: { data: [], count: 0 } });
  });

  it('renders New Milestone button when no active sessions', () => {
    (useProjectSessions as Mock).mockReturnValue({ data: { data: [], count: 0 } });

    render(
      <QuickActionsBar
        onOpenShell={vi.fn()}
        projectId="proj-1"
        onNewMilestone={vi.fn()}
        onQueueMilestone={vi.fn()}
        onQuickTask={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /new milestone/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /queue milestone/i })).not.toBeInTheDocument();
  });

  it('renders Queue Milestone button when sessions are active', () => {
    (useProjectSessions as Mock).mockReturnValue({
      data: { data: [{ id: 's-1', status: 'active' }], count: 1 },
    });

    render(
      <QuickActionsBar
        onOpenShell={vi.fn()}
        projectId="proj-1"
        onNewMilestone={vi.fn()}
        onQueueMilestone={vi.fn()}
        onQuickTask={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /queue milestone/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new milestone/i })).not.toBeInTheDocument();
  });

  it('renders Queue Milestone button when sessions are running', () => {
    (useProjectSessions as Mock).mockReturnValue({
      data: { data: [{ id: 's-1', status: 'running' }], count: 1 },
    });

    render(
      <QuickActionsBar
        onOpenShell={vi.fn()}
        projectId="proj-1"
        onNewMilestone={vi.fn()}
        onQueueMilestone={vi.fn()}
        onQuickTask={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /queue milestone/i })).toBeInTheDocument();
  });

  it('always renders Quick Task button when projectId and onQuickTask provided', () => {
    (useProjectSessions as Mock).mockReturnValue({ data: { data: [], count: 0 } });

    render(
      <QuickActionsBar
        onOpenShell={vi.fn()}
        projectId="proj-1"
        onQuickTask={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /quick task/i })).toBeInTheDocument();
  });

  it('always renders Quick Task button when sessions are active', () => {
    (useProjectSessions as Mock).mockReturnValue({
      data: { data: [{ id: 's-1', status: 'active' }], count: 1 },
    });

    render(
      <QuickActionsBar
        onOpenShell={vi.fn()}
        projectId="proj-1"
        onQuickTask={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /quick task/i })).toBeInTheDocument();
  });
});

// ── Node card clone status tests ──────────────────────────────────────────────

describe('ProjectOverviewTab — node card clone status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupOverviewDefaults();
  });

  it('renders spinner and Cloning text when clone_status is cloning', () => {
    (useProjectNodes as Mock).mockReturnValue({
      data: [makeNode({ clone_status: 'cloning' })],
    });

    render(<ProjectOverviewTab project={MOCK_PROJECT} onOpenShell={vi.fn()} />);

    expect(screen.getByText(/cloning/i)).toBeInTheDocument();
  });

  it('renders ready indicator when clone_status is ready', () => {
    (useProjectNodes as Mock).mockReturnValue({
      data: [makeNode({ clone_status: 'ready' })],
    });

    render(<ProjectOverviewTab project={MOCK_PROJECT} onOpenShell={vi.fn()} />);

    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });

  it('renders failed indicator when clone_status is failed', () => {
    (useProjectNodes as Mock).mockReturnValue({
      data: [makeNode({ clone_status: 'failed' })],
    });

    render(<ProjectOverviewTab project={MOCK_PROJECT} onOpenShell={vi.fn()} />);

    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('disables Start session button when clone_status is cloning', () => {
    (useProjectNodes as Mock).mockReturnValue({
      data: [makeNode({ clone_status: 'cloning' })],
    });

    render(<ProjectOverviewTab project={MOCK_PROJECT} onOpenShell={vi.fn()} />);

    const startBtn = screen.getByRole('button', { name: /start session/i });
    expect(startBtn).toBeDisabled();
  });

  it('does not disable Start session button when clone_status is ready', () => {
    (useProjectNodes as Mock).mockReturnValue({
      data: [makeNode({ clone_status: 'ready' })],
    });

    render(<ProjectOverviewTab project={MOCK_PROJECT} onOpenShell={vi.fn()} />);

    const startBtn = screen.getByRole('button', { name: /start session/i });
    expect(startBtn).not.toBeDisabled();
  });

  it('does not disable Start session button when clone_status is null', () => {
    (useProjectNodes as Mock).mockReturnValue({
      data: [makeNode({ clone_status: null })],
    });

    render(<ProjectOverviewTab project={MOCK_PROJECT} onOpenShell={vi.fn()} />);

    const startBtn = screen.getByRole('button', { name: /start session/i });
    expect(startBtn).not.toBeDisabled();
  });
});
