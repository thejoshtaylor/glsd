import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor, act } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { ImportProjectDialog } from '../import-project-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Mock NodeDirPicker — fires onSelect immediately when rendered
// ---------------------------------------------------------------------------
vi.mock('@/components/shared/node-dir-picker', () => ({
  default: ({
    onSelect,
  }: {
    nodeId: string;
    selectedPath: string;
    onSelect: (path: string) => void;
  }) => (
    <button
      data-testid="node-dir-picker"
      onClick={() => onSelect('/home/user/myapp')}
    >
      Pick /home/user/myapp
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/queries — spread real module, override only useNodes
// ---------------------------------------------------------------------------
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useNodes: vi.fn(),
  };
});

import { useNodes } from '@/lib/queries';

// ---------------------------------------------------------------------------
// Mock API modules
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/projects', () => ({
  createProject: vi.fn(),
  addProjectNode: vi.fn(),
  createProjectGitConfig: vi.fn(),
}));

vi.mock('@/lib/api/github', () => ({
  listInstallations: vi.fn(),
  listInstallationRepos: vi.fn(),
  getInstallUrl: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createProject, addProjectNode, createProjectGitConfig } from '@/lib/api/projects';
import { listInstallations, listInstallationRepos } from '@/lib/api/github';

const mockNavigate = vi.fn();

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeNode(overrides = {}) {
  return {
    id: 'node-1',
    name: 'My Node',
    is_revoked: false,
    machine_id: null,
    ...overrides,
  };
}

function makeInstallation(overrides = {}) {
  return {
    id: 'inst-1',
    installation_id: 111,
    account_login: 'octocat',
    account_type: 'User' as const,
    app_id: 1,
    token_expires_at: '2030-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeRepo(overrides = {}) {
  return {
    id: 1,
    full_name: 'octocat/hello-world',
    html_url: 'https://github.com/octocat/hello-world',
    private: false,
    ...overrides,
  };
}

function makeProject(overrides = {}) {
  return {
    id: 'proj-1',
    name: 'My Project',
    node_id: null,
    cwd: '.',
    path: '.',
    user_id: 'user-1',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockReset();
  (useNodes as Mock).mockReturnValue({
    data: { data: [makeNode()], count: 1 },
    isLoading: false,
  });
  (listInstallations as Mock).mockResolvedValue([]);
  (listInstallationRepos as Mock).mockResolvedValue([]);
  (createProject as Mock).mockResolvedValue(makeProject());
  (addProjectNode as Mock).mockResolvedValue({});
  (createProjectGitConfig as Mock).mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportProjectDialog', () => {
  // ─── Test 1: mode selector shows both import paths ────────────────────────
  it('renders mode selector with node-first and GitHub options', () => {
    render(<ImportProjectDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText('Import from Node')).toBeInTheDocument();
    expect(screen.getByText('Import from GitHub')).toBeInTheDocument();
  });

  // ─── Test 2: Cancel on mode step closes dialog ────────────────────────────
  it('Cancel on mode step closes dialog', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ImportProjectDialog open={true} onOpenChange={onOpenChange} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /cancel/i }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ─── Test 3: node path full flow ──────────────────────────────────────────
  it('node path: selects node, browses, confirms, calls createProject + addProjectNode', async () => {
    const user = userEvent.setup();
    render(<ImportProjectDialog {...DEFAULT_PROPS} />);

    // Click "Import from Node" mode card
    await act(async () => {
      await user.click(screen.getByText('Import from Node'));
    });

    // Node-select step: My Node button visible
    expect(screen.getByText('My Node')).toBeInTheDocument();

    // Click the node
    await act(async () => {
      await user.click(screen.getByText('My Node'));
    });

    // Node-browse step: NodeDirPicker mock renders — click it to fire onSelect
    expect(screen.getByTestId('node-dir-picker')).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByTestId('node-dir-picker'));
    });

    // Node-confirm step: derived name 'myapp' pre-filled
    await waitFor(() => {
      expect(screen.getByDisplayValue('myapp')).toBeInTheDocument();
    });

    // Click Import Project
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /import project/i }));
    });

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: 'myapp' });
      expect(addProjectNode).toHaveBeenCalledWith('proj-1', {
        node_id: 'node-1',
        local_path: '/home/user/myapp',
        is_primary: true,
      });
    });

    // Complete step
    expect(screen.getByText('Project Imported')).toBeInTheDocument();
  });

  // ─── Test 4: GitHub path full flow ────────────────────────────────────────
  it('github path: selects installation, selects repo, confirms, calls createProject + createProjectGitConfig', async () => {
    (listInstallations as Mock).mockResolvedValue([
      makeInstallation({ id: 'inst-1', account_login: 'octocat' }),
    ]);
    (listInstallationRepos as Mock).mockResolvedValue([
      makeRepo({ id: 1, full_name: 'octocat/hello-world', html_url: 'https://github.com/octocat/hello-world' }),
    ]);

    const user = userEvent.setup();
    render(<ImportProjectDialog {...DEFAULT_PROPS} />);

    // Click "Import from GitHub" mode card
    await act(async () => {
      await user.click(screen.getByText('Import from GitHub'));
    });

    // Wait for installations to load and render
    await waitFor(() => {
      expect(screen.getByText('octocat')).toBeInTheDocument();
    });

    // Click the installation button
    await act(async () => {
      await user.click(screen.getByText('octocat'));
    });

    // Wait for repos to load and render
    await waitFor(() => {
      expect(screen.getByText('octocat/hello-world')).toBeInTheDocument();
    });

    // Click the repo button
    await act(async () => {
      await user.click(screen.getByText('octocat/hello-world'));
    });

    // GitHub-confirm step: derived name 'hello-world' pre-filled
    await waitFor(() => {
      expect(screen.getByDisplayValue('hello-world')).toBeInTheDocument();
    });

    // Click Import Project
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /import project/i }));
    });

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: 'hello-world' });
      expect(createProjectGitConfig).toHaveBeenCalledWith('proj-1', {
        repo_url: 'https://github.com/octocat/hello-world',
        pull_from_branch: 'main',
        push_to_branch: 'main',
        merge_mode: 'auto_pr',
      });
    });

    // Complete step
    expect(screen.getByText('Project Imported')).toBeInTheDocument();
  });

  // ─── Test 5: error step shows Try Again which resets to mode ──────────────
  it('error step shows Try Again which resets to mode', async () => {
    (createProject as Mock).mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    render(<ImportProjectDialog {...DEFAULT_PROPS} />);

    // Take node path to trigger error
    await act(async () => {
      await user.click(screen.getByText('Import from Node'));
    });

    await act(async () => {
      await user.click(screen.getByText('My Node'));
    });

    await act(async () => {
      await user.click(screen.getByTestId('node-dir-picker'));
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('myapp')).toBeInTheDocument();
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /import project/i }));
    });

    // Error step
    await waitFor(() => {
      expect(screen.getByText('Import Failed')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    // Click Try Again → back to mode step
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /try again/i }));
    });

    expect(screen.getByText('Import from Node')).toBeInTheDocument();
    expect(screen.getByText('Import from GitHub')).toBeInTheDocument();
  });

  // ─── Test 6: inline mode renders without Dialog wrapper ───────────────────
  // inline=true is used inside a parent Dialog (e.g. project-wizard-dialog).
  // We wrap in a Dialog+DialogContent to satisfy Radix context, then assert
  // that ImportProjectDialog itself does NOT add another [role=dialog] element.
  it('inline mode renders without Dialog wrapper', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <DialogContent>
          <ImportProjectDialog open={true} onOpenChange={vi.fn()} inline={true} />
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('Import Existing Project')).toBeInTheDocument();
    // Only one [role=dialog] (the outer wrapper), not a second nested one from ImportProjectDialog
    expect(screen.getAllByRole('dialog').length).toBe(1);
  });
});
