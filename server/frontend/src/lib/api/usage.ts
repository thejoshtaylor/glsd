// GSD Cloud -- Usage API client
// TypeScript interfaces and fetch functions for /api/v1/usage/ endpoints

import { apiRequest } from './client';

export interface UsageRecord {
  id: string;
  session_id: string;
  node_name: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
}

export interface UsageListResponse {
  data: UsageRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface NodeUsage {
  node_id: string;
  node_name: string;
  cost_usd: number;
  session_count: number;
}

export interface DailyUsage {
  date: string;
  cost_usd: number;
}

export interface UsageSummary {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_sessions: number;
  by_node: NodeUsage[];
  daily: DailyUsage[];
}

export type Period = '7d' | '30d' | '90d' | 'all';

export async function getUsageList(period: Period, page: number): Promise<UsageListResponse> {
  return apiRequest<UsageListResponse>(`/usage/?period=${period}&page=${page}`);
}

export async function getUsageSummary(period: Period): Promise<UsageSummary> {
  return apiRequest<UsageSummary>(`/usage/summary?period=${period}`);
}
