// GLSD — projects API calls

import { apiRequest } from './client';

export interface ProjectPublic {
  id: string;
  name: string;
  node_id: string | null;
  cwd: string;
  /** Alias for cwd — backward compat with components that use project.path */
  path: string;
  user_id: string;
  created_at: string | null;
}

export interface ProjectGitConfigPublic {
  id: string;
  project_id: string;
  repo_url: string;
  pull_from_branch: string;
  push_to_branch: string;
  merge_mode: 'auto_pr' | 'auto_push';
  pr_target_branch: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectGitConfigCreate {
  repo_url: string;
  pull_from_branch: string;
  push_to_branch: string;
  merge_mode: 'auto_pr' | 'auto_push';
  pr_target_branch?: string | null;
}

export interface ProjectGitConfigUpdate {
  repo_url?: string;
  pull_from_branch?: string;
  push_to_branch?: string;
  merge_mode?: 'auto_pr' | 'auto_push';
  pr_target_branch?: string | null;
}

export interface ProjectNodePublic {
  id: string;
  project_id: string;
  node_id: string;
  local_path: string;
  is_primary: boolean;
  last_synced_at: string | null;
  last_session_run_at: string | null;
  created_at: string | null;
}

export interface ProjectNodeCreate {
  node_id: string;
  local_path: string;
  is_primary?: boolean;
}

export interface CloneToNodeRequest {
  repo_url: string;
  target_path: string;
}

export interface ProjectsPublic {
  data: ProjectPublic[];
  count: number;
}

/** Add backward-compat fields to a raw project from the API */
function enrichProject(raw: Omit<ProjectPublic, 'path'>): ProjectPublic {
  return { ...raw, path: raw.cwd };
}

export async function listProjects(): Promise<ProjectsPublic> {
  const result = await apiRequest<{ data: Omit<ProjectPublic, 'path'>[]; count: number }>('/projects');
  return {
    data: result.data.map(enrichProject),
    count: result.count,
  };
}

export async function getProject(id: string): Promise<ProjectPublic> {
  const raw = await apiRequest<Omit<ProjectPublic, 'path'>>(`/projects/${id}`);
  return enrichProject(raw);
}

export async function createProject(data: {
  name: string;
  node_id?: string | null;
  cwd?: string;
}): Promise<ProjectPublic> {
  const raw = await apiRequest<Omit<ProjectPublic, 'path'>>('/projects', {
    method: 'POST',
    body: JSON.stringify({ ...data, cwd: data.cwd ?? '.' }),
  });
  return enrichProject(raw);
}

export async function getProjectGitConfig(projectId: string): Promise<ProjectGitConfigPublic> {
  return apiRequest<ProjectGitConfigPublic>(`/projects/${projectId}/git-config`);
}

export async function createProjectGitConfig(projectId: string, data: ProjectGitConfigCreate): Promise<ProjectGitConfigPublic> {
  return apiRequest<ProjectGitConfigPublic>(`/projects/${projectId}/git-config`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProjectGitConfig(projectId: string, data: ProjectGitConfigUpdate): Promise<ProjectGitConfigPublic> {
  return apiRequest<ProjectGitConfigPublic>(`/projects/${projectId}/git-config`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProjectGitConfig(projectId: string): Promise<void> {
  return apiRequest<void>(`/projects/${projectId}/git-config`, { method: 'DELETE' });
}

export async function listProjectNodes(projectId: string): Promise<{ data: ProjectNodePublic[] }> {
  return apiRequest<{ data: ProjectNodePublic[] }>(`/projects/${projectId}/nodes`);
}

export async function addProjectNode(projectId: string, data: ProjectNodeCreate): Promise<ProjectNodePublic> {
  return apiRequest<ProjectNodePublic>(`/projects/${projectId}/nodes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeProjectNode(projectId: string, nodeId: string): Promise<void> {
  return apiRequest<void>(`/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' });
}

export async function cloneToNode(projectId: string, nodeId: string, data: CloneToNodeRequest): Promise<{ ok: boolean; error?: string }> {
  return apiRequest<{ ok: boolean; error?: string }>(`/projects/${projectId}/nodes/${nodeId}/clone`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  return apiRequest<void>(`/projects/${id}`, { method: 'DELETE' });
}
