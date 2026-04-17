// GLSD — Automations (triggers, chains, actions, executions) API calls

import { apiRequest } from './client';

export interface TriggerPublic {
  id: string;
  project_id: string;
  name: string;
  event_type: 'taskComplete' | 'taskError';
  conditions: Record<string, unknown> | null;
  enabled: boolean;
  cooldown_seconds: number;
  last_fired_at: string | null;
  created_at: string;
}

export interface ActionChainPublic {
  id: string;
  trigger_id: string;
  name: string;
  display_order: number;
}

export interface ActionPublic {
  id: string;
  chain_id: string;
  action_type: 'send_notification' | 'run_bash' | 'run_gsd2_command' | 'git_push' | 'switch_node';
  config: Record<string, unknown>;
  sequence_order: number;
}

export interface TriggerExecutionPublic {
  id: string;
  trigger_id: string;
  fired_at: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  chain_results: Record<string, { ok: boolean; error?: string }>;
  event_payload: Record<string, unknown>;
}

export interface TriggersPublic {
  data: TriggerPublic[];
  count: number;
}

export interface ActionChainsPublic {
  data: ActionChainPublic[];
  count: number;
}

export interface ActionsPublic {
  data: ActionPublic[];
  count: number;
}

export interface TriggerExecutionsPublic {
  data: TriggerExecutionPublic[];
  count: number;
}

export interface TriggerCreate {
  name: string;
  event_type: 'taskComplete' | 'taskError';
  conditions?: Record<string, unknown> | null;
  enabled?: boolean;
  cooldown_seconds?: number;
}

export interface TriggerUpdate {
  name?: string;
  event_type?: 'taskComplete' | 'taskError';
  conditions?: Record<string, unknown> | null;
  enabled?: boolean;
  cooldown_seconds?: number;
}

export interface ActionChainCreate {
  name: string;
  display_order?: number;
}

export interface ActionCreate {
  action_type: 'send_notification' | 'run_bash' | 'run_gsd2_command' | 'git_push' | 'switch_node';
  config: Record<string, unknown>;
  sequence_order?: number;
}

export async function getTriggers(projectId: string): Promise<TriggersPublic> {
  return apiRequest<TriggersPublic>(`/projects/${projectId}/triggers`);
}

export async function createTrigger(projectId: string, data: TriggerCreate): Promise<TriggerPublic> {
  return apiRequest<TriggerPublic>(`/projects/${projectId}/triggers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getTrigger(triggerId: string): Promise<TriggerPublic> {
  return apiRequest<TriggerPublic>(`/triggers/${triggerId}`);
}

export async function updateTrigger(triggerId: string, data: TriggerUpdate): Promise<TriggerPublic> {
  return apiRequest<TriggerPublic>(`/triggers/${triggerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTrigger(triggerId: string): Promise<void> {
  return apiRequest<void>(`/triggers/${triggerId}`, { method: 'DELETE' });
}

export async function getChains(triggerId: string): Promise<ActionChainsPublic> {
  return apiRequest<ActionChainsPublic>(`/triggers/${triggerId}/chains`);
}

export async function createChain(triggerId: string, data: ActionChainCreate): Promise<ActionChainPublic> {
  return apiRequest<ActionChainPublic>(`/triggers/${triggerId}/chains`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteChain(chainId: string): Promise<void> {
  return apiRequest<void>(`/chains/${chainId}`, { method: 'DELETE' });
}

export async function getActions(chainId: string): Promise<ActionsPublic> {
  return apiRequest<ActionsPublic>(`/chains/${chainId}/actions`);
}

export async function createAction(chainId: string, data: ActionCreate): Promise<ActionPublic> {
  return apiRequest<ActionPublic>(`/chains/${chainId}/actions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteAction(actionId: string): Promise<void> {
  return apiRequest<void>(`/actions/${actionId}`, { method: 'DELETE' });
}

export async function getExecutions(triggerId: string): Promise<TriggerExecutionsPublic> {
  return apiRequest<TriggerExecutionsPublic>(`/triggers/${triggerId}/executions`);
}
