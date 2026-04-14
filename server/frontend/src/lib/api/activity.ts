// GSD Cloud -- activity API calls (D-08)

import { apiRequest } from './client';

export interface ActivityEvent {
  session_id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
}

export async function getActivity(params?: {
  projectId?: string;
  limit?: number;
}): Promise<ActivityEvent[]> {
  const searchParams = new URLSearchParams();
  if (params?.projectId) searchParams.set('project_id', params.projectId);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return apiRequest<ActivityEvent[]>(`/activity${qs ? '?' + qs : ''}`);
}
