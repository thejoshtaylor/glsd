// GSD Cloud — sessions API calls

import { apiRequest } from './client';

export interface SessionPublic {
  id: string;
  user_id: string;
  node_id: string;
  status: string;
  cwd: string;
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

export async function listSessions(nodeId?: string): Promise<SessionsPublic> {
  const url = nodeId ? `/sessions/?node_id=${encodeURIComponent(nodeId)}` : '/sessions/';
  return apiRequest<SessionsPublic>(url);
}

export async function getSession(sessionId: string): Promise<SessionPublic> {
  return apiRequest<SessionPublic>(`/sessions/${sessionId}`);
}

export async function stopSession(sessionId: string): Promise<SessionPublic> {
  return apiRequest<SessionPublic>(`/sessions/${sessionId}/stop`, { method: 'POST' });
}
