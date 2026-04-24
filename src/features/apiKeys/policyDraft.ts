import type { ApiKeyPolicyView } from '@/services/api/apiKeyRecords';

export type ClaudeCodeOnlyMode = 'inherit' | 'enabled' | 'disabled';
export type CodexChannelMode = 'auto' | 'provider' | 'auth_file';

/**
 * PolicyDraft is the form-state shape used by the edit page. All fields are
 * strings so the native form inputs can bind directly; conversion back into
 * the wire-level `ApiKeyPolicyView` happens in {@link toPolicyView}.
 */
export type PolicyDraft = {
  apiKey: string;
  name: string;
  note: string;
  createdAt: string;
  expiresAt: string;
  disabled: boolean;
  groupId: string;
  allowClaudeFamily: boolean;
  allowGptFamily: boolean;
  fastMode: boolean;
  sessionTrajectoryDisabled: boolean;
  codexChannelMode: CodexChannelMode;
  enableClaudeModels: boolean;
  claudeGlobalFallbackEnabled: boolean;
  claudeUsageLimitUsd: string;
  claudeGptTargetFamily: string;
  enableClaudeOpus1M: boolean;
  claudeCodeOnlyMode: ClaudeCodeOnlyMode;
  upstreamBaseUrl: string;
  excludedModels: string;
  allowClaudeOpus46: boolean;
  dailyLimits: string;
  dailyBudgetUsd: string;
  weeklyBudgetUsd: string;
  weeklyBudgetAnchorAt: string;
  tokenPackageUsd: string;
  tokenPackageStartedAt: string;
  modelRoutingRules: string;
};

export const RANGE_OPTIONS = [
  { value: '7d', label: '近 7 天' },
  { value: '14d', label: '近 14 天' },
  { value: '30d', label: '近 30 天' },
];

export const FAMILY_OPTIONS = [
  { value: '', label: '默认 gpt-5.5' },
  { value: 'gpt-5.5', label: 'gpt-5.5' },
  { value: 'gpt-5.4', label: 'gpt-5.4' },
  { value: 'gpt-5.2', label: 'gpt-5.2' },
  { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
];

export const CLAUDE_CODE_ONLY_MODE_OPTIONS: Array<{ value: ClaudeCodeOnlyMode; label: string }> = [
  { value: 'inherit', label: '继承全局' },
  { value: 'enabled', label: '仅允许 Claude Code' },
  { value: 'disabled', label: '关闭限制' },
];

export const CODEX_CHANNEL_MODE_OPTIONS: Array<{ value: CodexChannelMode; label: string }> = [
  { value: 'auto', label: '自动选择' },
  { value: 'provider', label: '仅 AI Provider' },
  { value: 'auth_file', label: '仅 Codex auth file' },
];

export const EXPIRY_PRESET_OPTIONS = [
  { value: 'none', label: '不过期' },
  { value: '1d', label: '1 日' },
  { value: '1w', label: '1 周' },
  { value: '1m', label: '1 月' },
  { value: 'custom', label: '自定义' },
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getLocalHourInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:00`;
}

export function getCurrentHourInputValue(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return getLocalHourInputValue(now);
}

export function normalizeHourInputValue(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setMinutes(0, 0, 0);
  return getLocalHourInputValue(parsed);
}

export function addExpiryPreset(preset: string): string {
  if (preset === 'none') return '';
  const now = new Date();
  now.setSeconds(0, 0);
  switch (preset) {
    case '1d':
      now.setDate(now.getDate() + 1);
      break;
    case '1w':
      now.setDate(now.getDate() + 7);
      break;
    case '1m':
    default:
      now.setMonth(now.getMonth() + 1);
      break;
  }
  return formatDateTimeLocal(now.toISOString());
}

export function resolveExpiryPreset(value: string): string {
  if (!value.trim()) return 'none';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'custom';
  const now = new Date();
  const deltaMs = parsed.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (Math.abs(deltaMs - dayMs) < 5 * 60 * 1000) return '1d';
  if (Math.abs(deltaMs - 7 * dayMs) < 5 * 60 * 1000) return '1w';
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  if (Math.abs(parsed.getTime() - oneMonthLater.getTime()) < 5 * 60 * 1000) return '1m';
  return 'custom';
}

export function emptyDraft(): PolicyDraft {
  return {
    apiKey: '',
    name: '',
    note: '',
    createdAt: '',
    expiresAt: addExpiryPreset('1m'),
    disabled: false,
    groupId: '',
    allowClaudeFamily: true,
    allowGptFamily: false,
    fastMode: false,
    sessionTrajectoryDisabled: false,
    codexChannelMode: 'auto',
    enableClaudeModels: false,
    claudeGlobalFallbackEnabled: true,
    claudeUsageLimitUsd: '',
    claudeGptTargetFamily: '',
    enableClaudeOpus1M: false,
    claudeCodeOnlyMode: 'inherit',
    upstreamBaseUrl: '',
    excludedModels: '',
    allowClaudeOpus46: true,
    dailyLimits: '',
    dailyBudgetUsd: '',
    weeklyBudgetUsd: '',
    weeklyBudgetAnchorAt: getCurrentHourInputValue(),
    tokenPackageUsd: '',
    tokenPackageStartedAt: '',
    modelRoutingRules: '[]',
  };
}

export function formatNumber(value: number | undefined | null): string {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

export function formatCost(value: number | undefined | null): string {
  return `$${Number(value || 0).toFixed(4)}`;
}

export function formatPercent(value: number | undefined | null): string {
  return `${Math.round(Number(value || 0))}%`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function isExpired(value?: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

export function formatDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toIsoOrEmpty(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function toHourlyIsoOrEmpty(value: string): string {
  return toIsoOrEmpty(normalizeHourInputValue(value));
}

export function linesFromMap(source: Record<string, number>): string {
  return Object.entries(source)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function mapFromLines(source: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of source.split('\n')) {
    const [keyPart, valuePart] = line.split('=');
    const key = String(keyPart ?? '').trim();
    const value = Number(String(valuePart ?? '').trim());
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    result[key] = Math.floor(value);
  }
  return result;
}

export function linesFromList(source: string[]): string {
  return source.join('\n');
}

export function listFromLines(source: string): string[] {
  return source
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray(source: string): Array<Record<string, unknown>> {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON 必须是数组');
  }
  return parsed as Array<Record<string, unknown>>;
}

export function budgetTone(percent: number): 'Safe' | 'Warn' | 'Danger' {
  if (percent >= 90) return 'Danger';
  if (percent >= 60) return 'Warn';
  return 'Safe';
}

export function toDraft(policy: ApiKeyPolicyView, fallbackKey: string): PolicyDraft {
  const groupId = policy.group_id || '';
  return {
    apiKey: policy.api_key || fallbackKey,
    name: policy.name || '',
    note: policy.note || '',
    createdAt: policy.created_at || '',
    expiresAt: formatDateTimeLocal(policy.expires_at),
    disabled: Boolean(policy.disabled),
    groupId,
    allowClaudeFamily: policy.allow_claude_family !== false,
    allowGptFamily: Boolean(policy.allow_gpt_family),
    fastMode: Boolean(policy.fast_mode),
    sessionTrajectoryDisabled: Boolean(policy.session_trajectory_disabled),
    codexChannelMode: policy.codex_channel_mode || 'auto',
    enableClaudeModels: Boolean(policy.enable_claude_models),
    claudeGlobalFallbackEnabled: policy.claude_global_fallback_enabled !== false,
    claudeUsageLimitUsd: policy.claude_usage_limit_usd ? String(policy.claude_usage_limit_usd) : '',
    claudeGptTargetFamily: policy.claude_gpt_target_family || '',
    enableClaudeOpus1M: Boolean(policy.enable_claude_opus_1m),
    claudeCodeOnlyMode: policy.claude_code_only_mode || 'inherit',
    upstreamBaseUrl: policy.upstream_base_url || '',
    excludedModels: linesFromList(policy.excluded_models || []),
    allowClaudeOpus46: policy.allow_claude_opus_46 !== false,
    dailyLimits: linesFromMap(policy.daily_limits || {}),
    dailyBudgetUsd: groupId ? '' : policy.daily_budget_usd ? String(policy.daily_budget_usd) : '',
    weeklyBudgetUsd: groupId
      ? ''
      : policy.weekly_budget_usd
        ? String(policy.weekly_budget_usd)
        : '',
    weeklyBudgetAnchorAt: normalizeHourInputValue(policy.weekly_budget_anchor_at),
    tokenPackageUsd: policy.token_package_usd ? String(policy.token_package_usd) : '',
    tokenPackageStartedAt: formatDateTimeLocal(policy.token_package_started_at),
    modelRoutingRules: JSON.stringify(policy.model_routing_rules || [], null, 2),
  };
}

export function toPolicyView(draft: PolicyDraft): ApiKeyPolicyView {
  const groupId = draft.groupId.trim();
  const usesGroupBudget = Boolean(groupId);
  return {
    api_key: draft.apiKey.trim(),
    name: draft.name.trim(),
    note: draft.note.trim(),
    created_at: draft.createdAt.trim(),
    expires_at: toIsoOrEmpty(draft.expiresAt),
    disabled: draft.disabled,
    group_id: groupId,
    allow_claude_family: draft.allowClaudeFamily,
    allow_gpt_family: draft.allowGptFamily,
    fast_mode: draft.fastMode,
    session_trajectory_disabled: draft.sessionTrajectoryDisabled,
    codex_channel_mode: draft.codexChannelMode,
    enable_claude_models: draft.enableClaudeModels,
    claude_global_fallback_enabled: draft.claudeGlobalFallbackEnabled,
    claude_usage_limit_usd: Number(draft.claudeUsageLimitUsd || 0),
    claude_gpt_target_family: draft.claudeGptTargetFamily,
    enable_claude_opus_1m: draft.enableClaudeOpus1M,
    claude_code_only_mode: draft.claudeCodeOnlyMode,
    upstream_base_url: draft.upstreamBaseUrl.trim(),
    excluded_models: listFromLines(draft.excludedModels),
    allow_claude_opus_46: draft.allowClaudeOpus46,
    daily_limits: mapFromLines(draft.dailyLimits),
    daily_budget_usd: usesGroupBudget ? 0 : Number(draft.dailyBudgetUsd || 0),
    weekly_budget_usd: usesGroupBudget ? 0 : Number(draft.weeklyBudgetUsd || 0),
    weekly_budget_anchor_at: toHourlyIsoOrEmpty(draft.weeklyBudgetAnchorAt),
    token_package_usd: Number(draft.tokenPackageUsd || 0),
    token_package_started_at: toIsoOrEmpty(draft.tokenPackageStartedAt),
    model_routing_rules: parseJsonArray(draft.modelRoutingRules),
  };
}
