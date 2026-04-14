// GSD Cloud -- user settings API calls (D-05)

import { apiRequest } from './client';

export interface UserSettings {
  theme: string;
  accent_color: string;
  ui_density: string;
  font_size_scale: string;
  font_family: string;
  notifications_enabled: boolean;
  notify_on_complete: boolean;
  notify_on_error: boolean;
  notify_cost_threshold: number | null;
  notify_on_phase_complete: boolean;
  notify_on_cost_warning: boolean;
  default_cost_limit: number;
  debug_logging: boolean;
  user_mode: string;
}

export async function getSettings(): Promise<UserSettings> {
  return apiRequest<UserSettings>('/users/me/settings');
}

export async function updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  return apiRequest<UserSettings>('/users/me/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
