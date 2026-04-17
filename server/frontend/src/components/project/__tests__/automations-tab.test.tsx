// VCCA - Automations Tab Tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { AutomationsTab } from '../automations-tab';

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useTriggers: vi.fn(),
    useCreateTrigger: vi.fn(),
    useUpdateTrigger: vi.fn(),
    useDeleteTrigger: vi.fn(),
    useTriggerChains: vi.fn(),
    useCreateChain: vi.fn(),
    useDeleteChain: vi.fn(),
    useTriggerActions: vi.fn(),
    useCreateAction: vi.fn(),
    useDeleteAction: vi.fn(),
    useTriggerExecutions: vi.fn(),
  };
});

import {
  useTriggers,
  useCreateTrigger,
  useUpdateTrigger,
  useDeleteTrigger,
  useTriggerChains,
  useCreateChain,
  useDeleteChain,
  useTriggerActions,
  useCreateAction,
  useDeleteAction,
  useTriggerExecutions,
} from '@/lib/queries';

const MOCK_TRIGGER_ENABLED = {
  id: 'trigger-1',
  project_id: 'proj-1',
  name: 'My Trigger',
  event_type: 'taskComplete',
  conditions: null,
  enabled: true,
  cooldown_seconds: 0,
  last_fired_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const MOCK_TRIGGER_DISABLED = {
  ...MOCK_TRIGGER_ENABLED,
  id: 'trigger-2',
  name: 'Disabled Trigger',
  enabled: false,
};

const MOCK_EXECUTION = {
  id: 'exec-1',
  trigger_id: 'trigger-1',
  fired_at: '2026-04-17T01:00:00Z',
  status: 'SUCCESS',
  chain_results: {},
  event_payload: {},
};

function setupDefaultMocks() {
  (useTriggers as Mock).mockReturnValue({ data: { data: [], count: 0 } });
  (useCreateTrigger as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useUpdateTrigger as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useDeleteTrigger as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useTriggerChains as Mock).mockReturnValue({ data: { data: [], count: 0 } });
  (useCreateChain as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useDeleteChain as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useTriggerActions as Mock).mockReturnValue({ data: { data: [], count: 0 } });
  (useCreateAction as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useDeleteAction as Mock).mockReturnValue({ isPending: false, mutate: vi.fn() });
  (useTriggerExecutions as Mock).mockReturnValue({ data: { data: [], count: 0 } });
}

describe('AutomationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders trigger list with name, event_type badge, and enabled state', () => {
    (useTriggers as Mock).mockReturnValue({
      data: { data: [MOCK_TRIGGER_ENABLED], count: 1 },
    });

    render(<AutomationsTab projectId="proj-1" />);

    expect(screen.getByText('My Trigger')).toBeInTheDocument();
    expect(screen.getByText('taskComplete')).toBeInTheDocument();

    // Switch should be checked (enabled=true)
    const switchEl = screen.getByRole('switch', { name: /My Trigger enabled/ });
    expect(switchEl).toHaveAttribute('data-state', 'checked');
  });

  it('enable toggle calls updateTrigger with enabled:true', () => {
    const mockMutate = vi.fn();
    (useUpdateTrigger as Mock).mockReturnValue({ isPending: false, mutate: mockMutate });
    (useTriggers as Mock).mockReturnValue({
      data: { data: [MOCK_TRIGGER_DISABLED], count: 1 },
    });

    render(<AutomationsTab projectId="proj-1" />);

    const switchEl = screen.getByRole('switch', { name: /Disabled Trigger enabled/ });
    fireEvent.click(switchEl);

    expect(mockMutate).toHaveBeenCalledWith({
      triggerId: 'trigger-2',
      data: { enabled: true },
      projectId: 'proj-1',
    });
  });

  it('disable toggle calls updateTrigger with enabled:false', () => {
    const mockMutate = vi.fn();
    (useUpdateTrigger as Mock).mockReturnValue({ isPending: false, mutate: mockMutate });
    (useTriggers as Mock).mockReturnValue({
      data: { data: [MOCK_TRIGGER_ENABLED], count: 1 },
    });

    render(<AutomationsTab projectId="proj-1" />);

    const switchEl = screen.getByRole('switch', { name: /My Trigger enabled/ });
    fireEvent.click(switchEl);

    expect(mockMutate).toHaveBeenCalledWith({
      triggerId: 'trigger-1',
      data: { enabled: false },
      projectId: 'proj-1',
    });
  });

  it('New Trigger button opens create dialog', () => {
    render(<AutomationsTab projectId="proj-1" />);

    const btn = screen.getByRole('button', { name: /New Trigger/i });
    fireEvent.click(btn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
  });

  it('create trigger form submits with correct fields', () => {
    const mockMutate = vi.fn();
    (useCreateTrigger as Mock).mockReturnValue({ isPending: false, mutate: mockMutate });

    render(<AutomationsTab projectId="proj-1" />);

    fireEvent.click(screen.getByRole('button', { name: /New Trigger/i }));

    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Test Trigger' } });

    const submitBtn = screen.getByRole('button', { name: /Create Trigger/i });
    fireEvent.click(submitBtn);

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        data: expect.objectContaining({
          name: 'Test Trigger',
          event_type: 'taskComplete',
        }),
      }),
      expect.any(Object)
    );
  });

  it('execution history renders status badge and fired_at', () => {
    (useTriggers as Mock).mockReturnValue({
      data: { data: [MOCK_TRIGGER_ENABLED], count: 1 },
    });
    (useTriggerExecutions as Mock).mockReturnValue({
      data: { data: [MOCK_EXECUTION], count: 1 },
    });

    render(<AutomationsTab projectId="proj-1" />);

    // Expand the trigger to show execution history
    const expandBtn = screen.getByRole('button', { name: /Expand/i });
    fireEvent.click(expandBtn);

    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    // The fired_at date should appear in some locale format
    expect(
      screen.getByText(new Date(MOCK_EXECUTION.fired_at).toLocaleString())
    ).toBeInTheDocument();
  });
});
