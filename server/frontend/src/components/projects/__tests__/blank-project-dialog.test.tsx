import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor, act } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { BlankProjectDialog } from '../blank-project-dialog';

// ---------------------------------------------------------------------------
// Mock Radix Select as native <select> — avoids JSDOM pointer-capture issues
// ---------------------------------------------------------------------------
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

// ---------------------------------------------------------------------------
// Mock API modules
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/projects', () => ({
  createProject: vi.fn(),
  createProjectGitConfig: vi.fn(),
}));

vi.mock('@/lib/api/github', () => ({
  listInstallations: vi.fn(),
  listInstallationRepos: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { createProject, createProjectGitConfig } from '@/lib/api/projects';
import { listInstallations, listInstallationRepos } from '@/lib/api/github';

const mockNavigate = vi.fn();

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

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
  (listInstallations as Mock).mockResolvedValue([]);
  (listInstallationRepos as Mock).mockResolvedValue([]);
  (createProject as Mock).mockResolvedValue(makeProject());
  (createProjectGitConfig as Mock).mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlankProjectDialog', () => {
  // ─── Test 1: Entry step renders two cards ─────────────────────────────────
  it('renders entry step with two cards', () => {
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText('Blank / Existing')).toBeInTheDocument();
    expect(screen.getByText('Smart Start')).toBeInTheDocument();
  });

  // ─── Test 2: Clicking Blank / Existing advances to name step ──────────────
  it('clicking Blank / Existing advances to name step', async () => {
    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    expect(screen.getByText('Project Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My project')).toBeInTheDocument();
  });

  // ─── Test 3: Create button disabled when name is empty ────────────────────
  it('Create button disabled when name is empty', async () => {
    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    const createBtn = screen.getByRole('button', { name: /create/i });
    expect(createBtn).toBeDisabled();
  });

  // ─── Test 4: No installations shows 'No GitHub apps connected' ────────────
  it('shows No GitHub apps connected when installations list is empty', async () => {
    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    await waitFor(() => {
      expect(screen.getByText(/No GitHub apps connected/i)).toBeInTheDocument();
    });
  });

  // ─── Test 5: With installations, shows installation select with account_login values
  it('with installations shows installation select with account_login values', async () => {
    (listInstallations as Mock).mockResolvedValue([
      makeInstallation({ id: 'inst-1', account_login: 'octocat' }),
      makeInstallation({ id: 'inst-2', account_login: 'torvalds' }),
    ]);

    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    const logins = options.map((o) => o.value);
    expect(logins).toContain('inst-1');
    expect(logins).toContain('inst-2');
    // Text content includes account_login
    expect(screen.getByText('octocat')).toBeInTheDocument();
    expect(screen.getByText('torvalds')).toBeInTheDocument();
  });

  // ─── Test 6: Selecting an installation shows repos select ─────────────────
  it('selecting an installation shows repos select', async () => {
    (listInstallations as Mock).mockResolvedValue([
      makeInstallation({ id: 'inst-1', account_login: 'octocat' }),
    ]);
    (listInstallationRepos as Mock).mockResolvedValue([
      makeRepo({ id: 1, full_name: 'octocat/hello-world' }),
    ]);

    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox'), 'inst-1');
    });

    // After selecting, a second combobox for repos should appear
    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Test 7: Selecting a repo shows full_name in confirmation text ─────────
  it('selecting a repo shows full_name in confirmation text', async () => {
    (listInstallations as Mock).mockResolvedValue([
      makeInstallation({ id: 'inst-1', account_login: 'octocat' }),
    ]);
    (listInstallationRepos as Mock).mockResolvedValue([
      makeRepo({ id: 1, full_name: 'octocat/hello-world', html_url: 'https://github.com/octocat/hello-world' }),
    ]);

    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox'), 'inst-1');
    });

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    });

    const [, repoSelect] = screen.getAllByRole('combobox');
    await act(async () => {
      await user.selectOptions(repoSelect, 'octocat/hello-world');
    });

    // Confirmation text: "Selected: octocat/hello-world"
    await waitFor(() => {
      expect(screen.getByText(/Selected:/i)).toBeInTheDocument();
    });
  });

  // ─── Test 8: Create with name only calls createProject, skips git config ───
  it('Create with name only calls createProject and skips createProjectGitConfig', async () => {
    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    await act(async () => {
      await user.type(screen.getByPlaceholderText('My project'), 'My Test Project');
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /create/i }));
    });

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: 'My Test Project' });
    });
    expect(createProjectGitConfig).not.toHaveBeenCalled();
  });

  // ─── Test 9: Create with repo calls createProject then createProjectGitConfig
  it('Create with repo selected calls createProject then createProjectGitConfig with defaults', async () => {
    (listInstallations as Mock).mockResolvedValue([
      makeInstallation({ id: 'inst-1', account_login: 'octocat' }),
    ]);
    (listInstallationRepos as Mock).mockResolvedValue([
      makeRepo({ id: 1, full_name: 'octocat/hello-world', html_url: 'https://github.com/octocat/hello-world' }),
    ]);

    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    await act(async () => {
      await user.type(screen.getByPlaceholderText('My project'), 'My Repo Project');
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox'), 'inst-1');
    });

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    });

    const [, repoSelect] = screen.getAllByRole('combobox');
    await act(async () => {
      await user.selectOptions(repoSelect, 'octocat/hello-world');
    });

    await waitFor(() => {
      expect(screen.getByText(/Selected:/i)).toBeInTheDocument();
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /create/i }));
    });

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({ name: 'My Repo Project' });
      expect(createProjectGitConfig).toHaveBeenCalledWith('proj-1', {
        repo_url: 'https://github.com/octocat/hello-world',
        pull_from_branch: 'main',
        push_to_branch: 'main',
        merge_mode: 'auto_pr',
        pr_target_branch: null,
      });
    });
  });

  // ─── Bonus: private repo shows Private badge ──────────────────────────────
  it('private repo shows a Private badge', async () => {
    (listInstallations as Mock).mockResolvedValue([
      makeInstallation({ id: 'inst-1', account_login: 'octocat' }),
    ]);
    (listInstallationRepos as Mock).mockResolvedValue([
      makeRepo({
        id: 2,
        full_name: 'octocat/secret-repo',
        html_url: 'https://github.com/octocat/secret-repo',
        private: true,
      }),
    ]);

    const user = userEvent.setup();
    render(<BlankProjectDialog {...DEFAULT_PROPS} />);

    await act(async () => {
      await user.click(screen.getByText('Blank / Existing'));
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox'), 'inst-1');
    });

    // Wait for repos to load and repo select to appear
    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    });

    // Open the repo select to see options
    const [, repoSelect] = screen.getAllByRole('combobox');
    await act(async () => {
      await user.click(repoSelect);
    });

    await waitFor(() => {
      expect(screen.getByText('Private')).toBeInTheDocument();
    });
  });
});
