import { apiRequest } from './client';

export interface GitHubInstallation {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: 'Organization' | 'User';
  app_id: number;
  token_expires_at: string;
  created_at: string;
}

export async function getInstallUrl(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/github/install-url');
}

export async function listInstallations(): Promise<GitHubInstallation[]> {
  return apiRequest<GitHubInstallation[]>('/github/installations');
}

export async function deleteInstallation(id: string): Promise<void> {
  return apiRequest<void>(`/github/installations/${id}`, { method: 'DELETE' });
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  private: boolean;
}

export async function listInstallationRepos(installationId: string): Promise<GitHubRepo[]> {
  return apiRequest<GitHubRepo[]>(`/github/installations/${installationId}/repos`);
}
