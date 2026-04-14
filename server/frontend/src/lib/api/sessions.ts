// GSD Cloud — sessions API calls

import { apiRequest } from './client';

export interface SessionPublic {
  id: string;
  user_id: string;
  node_id: string;
  project_id: string | null;
  status: string;
  cwd: string;
  channel_id: string | null;
  claude_session_id: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface SessionsPublic {
  data: SessionPublic[];
  count: number;
}

export async function createSession(
  nodeId: string,
  cwd: string,
  prompt?: string,
): Promise<SessionPublic> {
  return apiRequest<SessionPublic>('/sessions/', {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId, cwd, prompt }),
  });
}

export async function listSessions(params?: {
  nodeId?: string;
  projectId?: string;
}): Promise<SessionsPublic> {
  const searchParams = new URLSearchParams();
  if (params?.nodeId) searchParams.set('node_id', params.nodeId);
  if (params?.projectId) searchParams.set('project_id', params.projectId);
  const qs = searchParams.toString();
  return apiRequest<SessionsPublic>(`/sessions/${qs ? '?' + qs : ''}`);
}

export async function getSession(sessionId: string): Promise<SessionPublic> {
  return apiRequest<SessionPublic>(`/sessions/${sessionId}`);
}

export async function stopSession(sessionId: string): Promise<SessionPublic> {
  return apiRequest<SessionPublic>(`/sessions/${sessionId}/stop`, { method: 'POST' });
}
