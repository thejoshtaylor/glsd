// GSD Cloud — Authentication Context
// Manages user auth state via httpOnly cookie (D-04, D-05)
// No tokens stored in React state or localStorage — only user email+id (T-04-06)

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getCurrentUser, login as apiLogin, logout as apiLogout } from '@/lib/api/auth';
import { apiRequest } from '@/lib/api/client';

export interface AuthUser {
  email: string;
  id: string;
  email_verified: boolean;
  created_at: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check if the user is already authenticated via cookie
  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        setUser({ email: u.email, id: u.id, email_verified: u.email_verified ?? true, created_at: u.created_at ?? null });
      })
      .catch(() => {
        // 401 or network error — not authenticated
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    // Re-fetch current user to populate React state
    const u = await getCurrentUser();
    setUser({ email: u.email, id: u.id, email_verified: u.email_verified ?? true, created_at: u.created_at ?? null });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await apiRequest<{ id: string; email: string }>('/users/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    // Auto-login after successful registration
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
