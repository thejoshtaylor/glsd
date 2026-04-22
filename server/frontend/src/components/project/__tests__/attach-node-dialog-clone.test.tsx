import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@/test/test-utils';
import { AttachNodeDialog } from '../attach-node-dialog';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useNodes: vi.fn(),
    useAddProjectNode: vi.fn(),
  };
});

vi.mock('@/lib/api/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/projects')>();
  return {
    ...actual,
    getProjectGitConfig: vi.fn(),
  };
});

const mockWsSend = vi.fn();
const mockWsConnect = vi.fn();
const mockWsDisconnect = vi.fn();

vi.mock('@/lib/api/ws', () => ({
  GsdWebSocket: vi.fn().mockImplementation(() => ({
    connect: mockWsConnect,
    send: mockWsSend,
    disconnect: mockWsDisconnect,
    on: vi.fn(),
    onConnectionState: vi.fn(),
  })),
}));

// Mock Radix Select with a native <select> to avoid JSDOM pointer-event issues.
// SelectTrigger and SelectValue are rendered outside the <select> to avoid nesting issues;
// SelectContent passes its children (SelectItem → <option>) into the <select> via context.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => {
    // Collect only SelectItem-originated <option> children by rendering children in a hidden div,
    // but the simplest approach: render a plain <select> with options extracted from children via
    // a wrapper that passes through SelectContent → SelectItem → option correctly.
    return (
      <select
        data-testid="node-select"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {children}
      </select>
    );
  },
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

// Mock NodeDirPicker to avoid unrelated render complexity
vi.mock('@/components/shared/node-dir-picker', () => ({
  default: () => null,
}));

import { useNodes, useAddProjectNode } from '@/lib/queries';
import { getProjectGitConfig } from '@/lib/api/projects';
import { GsdWebSocket } from '@/lib/api/ws';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_NODE = {
  id: 'node-1',
  name: 'My Node',
  machine_id: 'machine-abc',
  default_code_dir: '/home/user/code',
  status: 'online',
  created_at: null,
};

const MOCK_GIT_CONFIG = {
  id: 'gc-1',
  project_id: 'proj-1',
  repo_url: 'https://github.com/org/repo.git',
  pull_from_branch: 'main',
  push_to_branch: 'main',
  merge_mode: 'auto_pr' as const,
  pr_target_branch: null,
  created_at: null,
  updated_at: null,
};

const BASE_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  projectId: 'proj-1',
  existingNodeCount: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Select the first option via the native <select> mock, then click Submit.
 */
async function selectFirstNodeAndSubmit() {
  const select = screen.getByTestId('node-select');

  // Pick first option (value = MOCK_NODE.id)
  fireEvent.change(select, { target: { value: MOCK_NODE.id } });
  await act(async () => {});

  // Submit button should now be enabled
  const submitBtn = screen.getByRole('button', { name: /connect node/i });
  fireEvent.click(submitBtn);
  await act(async () => {});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AttachNodeDialog — gitClone emission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() resets constructor mock implementations in vitest 4;
    // restore using a regular function (not arrow) so new GsdWebSocket() works.
    vi.mocked(GsdWebSocket).mockImplementation(function mockGsdWs() {
      return {
        connect: mockWsConnect,
        send: mockWsSend,
        disconnect: mockWsDisconnect,
        on: vi.fn(),
        onConnectionState: vi.fn(),
      } as unknown as InstanceType<typeof GsdWebSocket>;
    });
  });

  it('sends gitClone message when git config is present after successful attach', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    (useNodes as Mock).mockReturnValue({ data: { data: [MOCK_NODE] }, isLoading: false });
    (useAddProjectNode as Mock).mockReturnValue({ mutateAsync, isPending: false });
    (getProjectGitConfig as Mock).mockResolvedValue(MOCK_GIT_CONFIG);

    render(<AttachNodeDialog {...BASE_PROPS} />);
    await selectFirstNodeAndSubmit();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(getProjectGitConfig).toHaveBeenCalledWith('proj-1'), { timeout: 3000 });

    await waitFor(
      () =>
        expect(mockWsSend).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'gitClone',
            machineId: 'machine-abc',
            repoUrl: 'https://github.com/org/repo.git',
            targetPath: '/home/user/code',
          }),
        ),
      { timeout: 2000 },
    );
    expect(mockWsConnect).toHaveBeenCalled();
  });

  it('does not send gitClone when git config is absent', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    (useNodes as Mock).mockReturnValue({ data: { data: [MOCK_NODE] }, isLoading: false });
    (useAddProjectNode as Mock).mockReturnValue({ mutateAsync, isPending: false });
    (getProjectGitConfig as Mock).mockResolvedValue(null);

    render(<AttachNodeDialog {...BASE_PROPS} />);
    await selectFirstNodeAndSubmit();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(getProjectGitConfig).toHaveBeenCalledWith('proj-1'), { timeout: 3000 });

    expect(mockWsSend).not.toHaveBeenCalled();
  });

  it('does not send gitClone when node has no machine_id', async () => {
    const nodeNoMachineId = { ...MOCK_NODE, machine_id: null };
    const mutateAsync = vi.fn().mockResolvedValue({});
    (useNodes as Mock).mockReturnValue({ data: { data: [nodeNoMachineId] }, isLoading: false });
    (useAddProjectNode as Mock).mockReturnValue({ mutateAsync, isPending: false });
    (getProjectGitConfig as Mock).mockResolvedValue(MOCK_GIT_CONFIG);

    render(<AttachNodeDialog {...BASE_PROPS} />);
    await selectFirstNodeAndSubmit();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockWsSend).not.toHaveBeenCalled();
  });

  it('closes dialog even when git config fetch fails', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    (useNodes as Mock).mockReturnValue({ data: { data: [MOCK_NODE] }, isLoading: false });
    (useAddProjectNode as Mock).mockReturnValue({ mutateAsync, isPending: false });
    (getProjectGitConfig as Mock).mockRejectedValue(new Error('network error'));

    const onOpenChange = vi.fn();
    render(<AttachNodeDialog {...BASE_PROPS} onOpenChange={onOpenChange} />);
    await selectFirstNodeAndSubmit();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: 3000 });
    expect(mockWsSend).not.toHaveBeenCalled();
  });
});
