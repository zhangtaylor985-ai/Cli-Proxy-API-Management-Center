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

export interface ApiKeyTokenPackagePolicyView {
  id: string;
  started_at: string;
  usd: number;
  note: string;
}

export interface ApiKeyTokenPackageLedgerView {
  id: string;
  started_at: string;
  total_usd: number;
  used_usd: number;
  remaining_usd: number;
  active: boolean;
  note?: string;
}

export interface ApiKeyTokenPackageUsageEventView {
  requested_at: string;
  package_id: string;
  cost_usd: number;
  cost_micro_usd: number;
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
  name: string;
  note: string;
  created_at: string;
  expires_at: string;
  disabled: boolean;
  owner_username: string;
  owner_role: 'admin' | 'staff' | string;
  group_id: string;
  group_name?: string;
  allow_claude_family: boolean;
  allow_gpt_family: boolean;
  fast_mode: boolean;
  session_trajectory_disabled: boolean;
  codex_channel_mode: 'auto' | 'provider' | 'auth_file';
  enable_claude_models: boolean;
  claude_global_fallback_enabled: boolean;
  claude_usage_limit_usd: number;
  claude_gpt_target_family: string;
  enable_claude_opus_1m: boolean;
  claude_code_only_mode: 'inherit' | 'enabled' | 'disabled';
  upstream_base_url: string;
  excluded_models: string[];
  allow_claude_opus_46: boolean;
  daily_limits: Record<string, number>;
  daily_budget_usd: number;
  weekly_budget_usd: number;
  weekly_budget_anchor_at: string;
  token_package_usd: number;
  token_package_started_at: string;
  token_packages: ApiKeyTokenPackagePolicyView[];
  model_routing_rules: Array<Record<string, unknown>>;
}

export interface ApiKeyRecordSummaryLiteView {
  api_key: string;
  masked_api_key: string;
  name: string;
  note: string;
  created_at: string;
  expires_at: string;
  disabled: boolean;
  owner_username: string;
  owner_role: 'admin' | 'staff' | string;
  group_id: string;
  group_name?: string;
  registered: boolean;
  has_explicit_policy: boolean;
  last_used_at?: string;
  daily_limit_count: number;
  policy_family: string;
  enable_claude_models: boolean;
  fast_mode: boolean;
  session_trajectory_disabled: boolean;
  expired: boolean;
}

// ApiKeyRecordSummaryView is the full summary returned inside the single-key
// detail endpoint. The list endpoint now returns the lite variant above.
export interface ApiKeyRecordSummaryView {
  api_key: string;
  masked_api_key: string;
  name: string;
  note: string;
  created_at: string;
  expires_at: string;
  disabled: boolean;
  owner_username: string;
  owner_role: 'admin' | 'staff' | string;
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
  token_packages: ApiKeyTokenPackageLedgerView[];
  daily_limit_count: number;
  policy_family: string;
  enable_claude_models: boolean;
  fast_mode: boolean;
  session_trajectory_disabled: boolean;
}

export interface ApiKeyRecordListPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ApiKeyRecordListResponse {
  items: ApiKeyRecordSummaryLiteView[];
  pagination: ApiKeyRecordListPagination;
  ownership_stats: ApiKeyOwnershipStatsView;
}

export interface ApiKeyOwnerCountView {
  username: string;
  role: 'admin' | 'staff' | string;
  count: number;
}

export interface ApiKeyOwnershipStatsView {
  admin_total: number;
  owners: ApiKeyOwnerCountView[];
}

export interface ApiKeyRecordListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'all' | 'active' | 'disabled' | 'expired';
  groupId?: string;
  owner?: string;
  sort?: 'last_used' | 'created' | 'expires' | 'api_key';
  order?: 'asc' | 'desc';
}

export interface ApiKeyRecordStatsItem {
  api_key: string;
  today: ApiKeyUsageTotals;
  current_period: ApiKeyUsageTotals;
  daily_budget: ApiKeyBudgetWindowView;
  weekly_budget: ApiKeyBudgetWindowView;
  token_package: ApiKeyTokenPackageView;
  token_packages: ApiKeyTokenPackageLedgerView[];
}

export interface ApiKeyRecordStatsResponse {
  items: ApiKeyRecordStatsItem[];
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
  token_package_usage_events: ApiKeyTokenPackageUsageEventView[];
  recent_events: ApiKeyEventView[];
}

export interface ApiKeyInsightSummaryView {
  masked_api_key: string;
  created_at: string;
  expires_at: string;
  last_used_at?: string;
  today: ApiKeyUsageTotals;
  current_period: ApiKeyUsageTotals;
  daily_budget: ApiKeyBudgetWindowView;
  weekly_budget: ApiKeyBudgetWindowView;
  token_package: ApiKeyTokenPackageView;
  token_packages: ApiKeyTokenPackageLedgerView[];
}

export interface ApiKeyInsightDetailView {
  summary: ApiKeyInsightSummaryView;
  today_report: ApiKeyUsageTotals;
  current_period_report: ApiKeyUsageTotals;
  recent_days: ApiKeyRecentDayView[];
}

export interface ApiKeyRecordMutation {
  new_api_key?: string;
  policy?: ApiKeyPolicyView;
  clear_policy?: boolean;
}

export interface ApiKeyInsightsQueryResult {
  items: ApiKeyInsightDetailView[];
  invalid_keys: string[];
}

const API_KEY_QUERY_TIMEOUT_MS = 20_000;

export const apiKeyRecordsApi = {
  async list(params: ApiKeyRecordListParams = {}): Promise<ApiKeyRecordListResponse> {
    const query = new URLSearchParams();
    if (params.page && params.page > 0) query.set('page', String(params.page));
    if (params.pageSize && params.pageSize > 0) query.set('page_size', String(params.pageSize));
    if (params.search && params.search.trim()) query.set('search', params.search.trim());
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.groupId && params.groupId.trim()) query.set('group_id', params.groupId.trim());
    if (params.owner && params.owner.trim()) query.set('owner', params.owner.trim());
    if (params.sort) query.set('sort', params.sort);
    if (params.order) query.set('order', params.order);
    const suffix = query.toString();
    const url = suffix ? `/api-key-records?${suffix}` : '/api-key-records';
    const response = await apiClient.get<ApiKeyRecordListResponse>(url);
    return {
      items: Array.isArray(response?.items) ? response.items : [],
      pagination: response?.pagination ?? { page: 1, page_size: 0, total: 0, total_pages: 0 },
      ownership_stats: response?.ownership_stats ?? { admin_total: 0, owners: [] },
    };
  },

  async stats(apiKeys: string[], range = '14d'): Promise<ApiKeyRecordStatsItem[]> {
    const unique = Array.from(new Set(apiKeys.map((key) => key.trim()).filter(Boolean)));
    if (unique.length === 0) return [];
    const response = await apiClient.post<ApiKeyRecordStatsResponse>('/api-key-records/stats', {
      api_keys: unique,
      range,
    });
    return Array.isArray(response?.items) ? response.items : [];
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
