/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  modified?: number;
  maskedApiKey?: string;
  baseUrl?: string;
  healthSummary?: AuthFileHealthSummary | null;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}

export interface AuthFileHealthSummary {
  model?: string;
  status?: string;
  statusMessage?: string;
  unavailable?: boolean;
  degraded?: boolean;
  nextRetryAfter?: string | number;
  lastFirstActivityMs?: number;
  lastCompletedMs?: number;
  lastProbeAt?: string | number;
  lastProbeLatencyMs?: number;
  lastProbeSlow?: boolean;
  lastProbeError?: string;
  consecutiveSlowProbes?: number;
  lastCanaryAt?: string | number;
  lastCanaryLatencyMs?: number;
  lastCanarySlow?: boolean;
  lastCanaryError?: string;
  consecutiveSlowCanaries?: number;
  backoffLevel?: number;
  lastSwitchAt?: string | number;
  lastSwitchToProvider?: string;
  lastSwitchToAuthId?: string;
  lastSwitchToAuthIndex?: string;
  lastSwitchToMaskedApiKey?: string;
  lastSwitchToBaseUrl?: string;
}
