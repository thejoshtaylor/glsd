// GSD Cloud — authentication API calls
// Cookie-based auth (D-04): login sets httpOnly cookie, logout clears it

import { apiRequest } from './client';

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
  email_verified: boolean;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  // OAuth2PasswordRequestForm expects application/x-www-form-urlencoded
  const response = await fetch('/api/v1/login/cookie', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ username: email, password }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  return response.json() as Promise<CurrentUser>;
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/logout', { method: 'POST' });
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/me');
}
