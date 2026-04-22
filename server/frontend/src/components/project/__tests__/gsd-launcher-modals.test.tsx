import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { NewMilestoneModal } from '../new-milestone-modal';
import { QuickTaskModal } from '../quick-task-modal';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useProjectNodes: vi.fn(),
  };
});

// VoiceInputButton: stub to avoid MediaRecorder / mic setup in these tests
vi.mock('@/components/shared/voice-input-button', () => ({
  VoiceInputButton: ({ onTranscribed }: { onTranscribed: (text: string) => void }) => (
    <button data-testid="voice-btn" onClick={() => onTranscribed('voice text')}>
      Voice
    </button>
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
    children: ReactNode;
  }) => (
    <select data-testid="node-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { useProjectNodes } from '@/lib/queries';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NODE_A = { id: 'node-a', local_path: '/code/a', clone_status: 'ready' as const };
const NODE_B = { id: 'node-b', local_path: '/code/b', clone_status: 'ready' as const };

const BASE_MODAL_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  projectId: 'proj-1',
  onConfirm: vi.fn(),
};

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (useProjectNodes as Mock).mockReturnValue({ data: [NODE_A] });
});

// ── NewMilestoneModal ─────────────────────────────────────────────────────────

describe('NewMilestoneModal', () => {
  it('renders vision textarea and voice button', () => {
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" />);
    expect(screen.getByPlaceholderText('Describe the milestone vision…')).toBeInTheDocument();
    expect(screen.getByTestId('voice-btn')).toBeInTheDocument();
  });

  it('Confirm is disabled when vision is empty', () => {
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('Confirm is enabled after typing in vision textarea', () => {
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" />);
    fireEvent.change(screen.getByPlaceholderText('Describe the milestone vision…'), {
      target: { value: 'build auth' },
    });
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled();
  });

  it('node picker is hidden when only one node', () => {
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" />);
    expect(screen.queryByTestId('node-select')).not.toBeInTheDocument();
  });

  it('node picker is shown when two nodes exist', () => {
    (useProjectNodes as Mock).mockReturnValue({ data: [NODE_A, NODE_B] });
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" />);
    expect(screen.getByTestId('node-select')).toBeInTheDocument();
  });

  it('calls onConfirm with vision and node id on Confirm', () => {
    const onConfirm = vi.fn();
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText('Describe the milestone vision…'), {
      target: { value: 'ship it' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('ship it', NODE_A.id);
  });

  it('calls onConfirm with selected node id when multiple nodes', () => {
    (useProjectNodes as Mock).mockReturnValue({ data: [NODE_A, NODE_B] });
    const onConfirm = vi.fn();
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText('Describe the milestone vision…'), {
      target: { value: 'add feature' },
    });
    fireEvent.change(screen.getByTestId('node-select'), { target: { value: NODE_B.id } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('add feature', NODE_B.id);
  });
});

// ── QueueMilestoneModal variant ───────────────────────────────────────────────

describe('QueueMilestoneModal (variant=queue)', () => {
  it('shows title Queue Milestone', () => {
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="queue" />);
    expect(screen.getByRole('heading', { name: /queue milestone/i })).toBeInTheDocument();
  });

  it('shows title New Milestone for variant=new', () => {
    render(<NewMilestoneModal {...BASE_MODAL_PROPS} variant="new" />);
    expect(screen.getByRole('heading', { name: /new milestone/i })).toBeInTheDocument();
  });
});

// ── QuickTaskModal ────────────────────────────────────────────────────────────

describe('QuickTaskModal', () => {
  it('renders task textarea and voice button', () => {
    render(<QuickTaskModal {...BASE_MODAL_PROPS} />);
    expect(screen.getByPlaceholderText('Describe the task…')).toBeInTheDocument();
    expect(screen.getByTestId('voice-btn')).toBeInTheDocument();
  });

  it('Confirm is disabled when task is empty', () => {
    render(<QuickTaskModal {...BASE_MODAL_PROPS} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('Confirm is enabled after typing in task textarea', () => {
    render(<QuickTaskModal {...BASE_MODAL_PROPS} />);
    fireEvent.change(screen.getByPlaceholderText('Describe the task…'), {
      target: { value: 'fix bug' },
    });
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled();
  });

  it('node picker hidden when only one node', () => {
    render(<QuickTaskModal {...BASE_MODAL_PROPS} />);
    expect(screen.queryByTestId('node-select')).not.toBeInTheDocument();
  });

  it('node picker shown when two nodes exist', () => {
    (useProjectNodes as Mock).mockReturnValue({ data: [NODE_A, NODE_B] });
    render(<QuickTaskModal {...BASE_MODAL_PROPS} />);
    expect(screen.getByTestId('node-select')).toBeInTheDocument();
  });

  it('calls onConfirm with task and node id', () => {
    const onConfirm = vi.fn();
    render(<QuickTaskModal {...BASE_MODAL_PROPS} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText('Describe the task…'), {
      target: { value: 'refactor auth' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('refactor auth', NODE_A.id);
  });
});
