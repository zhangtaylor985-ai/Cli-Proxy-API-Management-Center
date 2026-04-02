import axios from 'axios';
import { apiClient } from './client';
import { normalizeApiBase } from '@/utils/connection';

export interface ApiKeyUsageTotals {
  requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost_micro_usd: number;
  cost_usd: number;
}

export interface ApiKeyBudgetWindowView {
  enabled: boolean;
  label: string;
  limit_usd: number;
  used_usd: number;
  remaining_usd: number;
  used_percent: number;
  start_at: string;
  end_at: string;
}

export interface ApiKeyTokenPackageView {
  enabled: boolean;
  started_at?: string;
  total_usd: number;
  used_usd: number;
  remaining_usd: number;
  active: boolean;
}

export interface ApiKeyDailyLimitView {
  model: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface ApiKeyRecentDayView {
  day: string;
  requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface ApiKeyModelUsageView {
  model: string;
  requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface ApiKeyEventView {
  requested_at: string;
  source: string;
  auth_index: string;
  model: string;
  failed: boolean;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface ApiKeyPolicyView {
  api_key: string;
  group_id: string;
  group_name?: string;
  fast_mode: boolean;
  enable_claude_models: boolean;
  claude_usage_limit_usd: number;
  claude_gpt_target_family: string;
  enable_claude_opus_1m: boolean;
  upstream_base_url: string;
  excluded_models: string[];
  allow_claude_opus_46: boolean;
  daily_limits: Record<string, number>;
  daily_budget_usd: number;
  weekly_budget_usd: number;
  weekly_budget_anchor_at: string;
  token_package_usd: number;
  token_package_started_at: string;
  model_routing_rules: Array<Record<string, unknown>>;
  claude_failover_enabled: boolean;
  claude_failover_target: string;
  claude_failover_rules: Array<Record<string, unknown>>;
}

export interface ApiKeyRecordSummaryView {
  api_key: string;
  masked_api_key: string;
  group_id: string;
  group_name?: string;
  registered: boolean;
  has_explicit_policy: boolean;
  last_used_at?: string;
  today: ApiKeyUsageTotals;
  current_period: ApiKeyUsageTotals;
  daily_budget: ApiKeyBudgetWindowView;
  weekly_budget: ApiKeyBudgetWindowView;
  token_package: ApiKeyTokenPackageView;
  daily_limit_count: number;
  policy_family: string;
  enable_claude_models: boolean;
  fast_mode: boolean;
}

export interface ApiKeyRecordDetailView {
  summary: ApiKeyRecordSummaryView;
  group?: {
    id: string;
    name: string;
    daily_budget_usd: number;
    weekly_budget_usd: number;
    is_system: boolean;
    member_count: number;
    created_at: string;
    updated_at: string;
  };
  explicit_policy: ApiKeyPolicyView;
  effective_policy: ApiKeyPolicyView;
  today_report: ApiKeyUsageTotals;
  current_period_report: ApiKeyUsageTotals;
  recent_days: ApiKeyRecentDayView[];
  model_usage: ApiKeyModelUsageView[];
  daily_limits: ApiKeyDailyLimitView[];
  recent_events: ApiKeyEventView[];
}

export interface ApiKeyRecordMutation {
  new_api_key?: string;
  policy?: ApiKeyPolicyView;
  clear_policy?: boolean;
}

export interface ApiKeyInsightsQueryResult {
  items: ApiKeyRecordDetailView[];
  invalid_keys: string[];
}

const API_KEY_QUERY_TIMEOUT_MS = 20_000;

export const apiKeyRecordsApi = {
  async list(range = '14d', search = ''): Promise<ApiKeyRecordSummaryView[]> {
    const query = new URLSearchParams();
    query.set('range', range);
    if (search.trim()) {
      query.set('search', search.trim());
    }
    const response = await apiClient.get<{ items?: ApiKeyRecordSummaryView[] }>(
      `/api-key-records?${query.toString()}`
    );
    return Array.isArray(response.items) ? response.items : [];
  },

  async get(apiKey: string, range = '14d', eventsLimit = 100): Promise<ApiKeyRecordDetailView> {
    const query = new URLSearchParams({
      range,
      events_limit: String(eventsLimit),
    });
    return apiClient.get<ApiKeyRecordDetailView>(
      `/api-key-records/${encodeURIComponent(apiKey)}?${query.toString()}`
    );
  },

  async create(payload: ApiKeyRecordMutation): Promise<void> {
    await apiClient.post('/api-key-records', payload);
  },

  async update(apiKey: string, payload: ApiKeyRecordMutation): Promise<void> {
    await apiClient.patch(`/api-key-records/${encodeURIComponent(apiKey)}`, payload);
  },

  async remove(apiKey: string): Promise<void> {
    await apiClient.delete(`/api-key-records/${encodeURIComponent(apiKey)}`);
  },
};

export async function queryApiKeyInsights(
  apiBase: string,
  payload: { api_keys: string[]; range: string }
): Promise<ApiKeyInsightsQueryResult> {
  const normalizedBase = normalizeApiBase(apiBase);
  const response = await axios.post<ApiKeyInsightsQueryResult>(
    `${normalizedBase}/v0/api-key-insights/query`,
    payload,
    {
      timeout: API_KEY_QUERY_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}
