// GSD Cloud — projects API calls

import { apiRequest } from './client';

export interface ProjectPublic {
  id: string;
  name: string;
  node_id: string;
  cwd: string;
  user_id: string;
  created_at: string | null;
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

export async function createProject(data: {
  name: string;
  node_id: string;
  cwd: string;
}): Promise<ProjectPublic> {
  return apiRequest<ProjectPublic>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  return apiRequest<void>(`/projects/${id}`, { method: 'DELETE' });
}
