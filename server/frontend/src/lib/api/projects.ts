// GSD Cloud — projects API calls

import { apiRequest } from './client';

export interface ProjectPublic {
  id: string;
  name: string;
  node_id: string;
  cwd: string;
  /** Alias for cwd — backward compat with components that use project.path */
  path: string;
  user_id: string;
  created_at: string | null;
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
  node_id: string;
  cwd: string;
}): Promise<ProjectPublic> {
  const raw = await apiRequest<Omit<ProjectPublic, 'path'>>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return enrichProject(raw);
}

export async function deleteProject(id: string): Promise<void> {
  return apiRequest<void>(`/projects/${id}`, { method: 'DELETE' });
}
