// GLSD — projects API calls

import { apiRequest } from './client';

export interface ProjectPublic {
  id: string;
  name: string;
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

export async function listProjects(): Promise<ProjectsPublic> {
  return apiRequest<ProjectsPublic>('/projects');
}

export async function getProject(id: string): Promise<ProjectPublic> {
  return apiRequest<ProjectPublic>(`/projects/${id}`);
}

export async function createProject(data: { name: string }): Promise<ProjectPublic> {
  return apiRequest<ProjectPublic>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getProjectGitConfig(projectId: string): Promise<ProjectGitConfigPublic | null> {
  try {
    return await apiRequest<ProjectGitConfigPublic>(`/projects/${projectId}/git-config`);
  } catch (err) {
    if (err instanceof Error && err.message === 'GitConfig not found') return null;
    throw err;
  }
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

export async function listProjectNodes(projectId: string): Promise<ProjectNodePublic[]> {
  return apiRequest<ProjectNodePublic[]>(`/projects/${projectId}/nodes`);
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

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  category: string;
  archetype: string;
  tags?: string[];
}

export interface GsdPlanningTemplate {
  id: string;
  name: string;
  description: string;
  archetype: string;
}

export async function listProjectTemplates(): Promise<ProjectTemplate[]> {
  return apiRequest<ProjectTemplate[]>('/projects/templates');
}

export async function listGsdPlanningTemplates(): Promise<GsdPlanningTemplate[]> {
  return apiRequest<GsdPlanningTemplate[]>('/projects/planning-templates');
}

export interface Gsd2PlanPreviewSlice {
  id: string;
  title: string;
  goal: string;
  risk: string | null;
  depends_on: string[];
}

export interface Gsd2PlanPreviewMilestone {
  title: string;
  summary: string;
  slices: Gsd2PlanPreviewSlice[];
}

export interface Gsd2PlanPreview {
  intent: string;
  milestone: Gsd2PlanPreviewMilestone;
}
