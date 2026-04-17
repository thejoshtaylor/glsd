// GLSD — nodes API calls

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
  default_code_dir: string | null;
}

export interface NodeUpdateRequest {
  default_code_dir: string | null;
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

export async function updateNode(nodeId: string, req: NodeUpdateRequest): Promise<NodePublic> {
  return apiRequest<NodePublic>(`/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
}

export async function createNodeToken(name: string): Promise<NodePairResponse> {
  return apiRequest<NodePairResponse>('/nodes/', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export function browseNodeFs(nodeId: string, path: string = '/'): Promise<{ entries: FsEntry[] }> {
  return apiRequest<{ entries: FsEntry[] }>(`/nodes/${nodeId}/fs?path=${encodeURIComponent(path)}`);
}

export function readNodeFile(nodeId: string, path: string): Promise<{ content: string; truncated: boolean }> {
  return apiRequest<{ content: string; truncated: boolean }>(`/nodes/${nodeId}/file?path=${encodeURIComponent(path)}`);
}

export interface NodeCodeResponse {
  code: string;
}

export async function generatePairingCode(name: string): Promise<NodeCodeResponse> {
  return apiRequest<NodeCodeResponse>('/nodes/code', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}
