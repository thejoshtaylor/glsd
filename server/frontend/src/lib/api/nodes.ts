// GSD Cloud — nodes API calls

import { apiRequest } from './client';

export interface NodePublic {
  id: string;
  name: string;
  machine_id: string | null;
  is_revoked: boolean;
  connected_at: string | null;
  disconnected_at: string | null;
  last_seen: string | null;
  os: string | null;
  arch: string | null;
  daemon_version: string | null;
  created_at: string | null;
}

export interface NodesPublic {
  data: NodePublic[];
  count: number;
}

export interface NodePairResponse {
  node_id: string;
  token: string;
  relay_url: string;
}

export async function listNodes(): Promise<NodesPublic> {
  return apiRequest<NodesPublic>('/nodes/');
}

export async function getNode(nodeId: string): Promise<NodePublic> {
  return apiRequest<NodePublic>(`/nodes/${nodeId}`);
}

export async function revokeNode(nodeId: string): Promise<NodePublic> {
  return apiRequest<NodePublic>(`/nodes/${nodeId}/revoke`, { method: 'POST' });
}

export async function createNodeToken(name: string): Promise<NodePairResponse> {
  return apiRequest<NodePairResponse>('/nodes/', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}
