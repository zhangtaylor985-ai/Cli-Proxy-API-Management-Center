/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from './provider';
import type { AmpcodeConfig } from './ampcode';

export interface QuotaExceededConfig {
  switchProject?: boolean;
  switchPreviewModel?: boolean;
}

export interface Config {
  debug?: boolean;
  proxyUrl?: string;
  claudeToGptRoutingEnabled?: boolean;
  claudeStyleEnabled?: boolean;
  claudeStylePrompt?: string;
  claudeToGptTargetFamily?: string;
  claudeToGptReasoningEffort?: string;
  disableClaudeOpus1M?: boolean;
  claudeCodeOnlyEnabled?: boolean;
  anthropicBaseUrl?: string;
  anthropicOAuthTokenUrl?: string;
  requestRetry?: number;
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  requestLog?: boolean;
  sessionTrajectoryEnabled?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  forceModelPrefix?: boolean;
  routingStrategy?: string;
  apiKeys?: string[];
  ampcode?: AmpcodeConfig;
  geminiApiKeys?: GeminiKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  vertexApiKeys?: ProviderKeyConfig[];
  openaiCompatibility?: OpenAIProviderConfig[];
  oauthExcludedModels?: Record<string, string[]>;
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | 'debug'
  | 'proxy-url'
  | 'claude-to-gpt-routing-enabled'
  | 'claude-style-enabled'
  | 'claude-style-prompt'
  | 'claude-to-gpt-target-family'
  | 'claude-to-gpt-reasoning-effort'
  | 'disable-claude-opus-1m'
  | 'claude-code-only-enabled'
  | 'anthropic-base-url'
  | 'anthropic-oauth-token-url'
  | 'request-retry'
  | 'quota-exceeded'
  | 'usage-statistics-enabled'
  | 'request-log'
  | 'session-trajectory-enabled'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'ws-auth'
  | 'force-model-prefix'
  | 'routing/strategy'
  | 'api-keys'
  | 'ampcode'
  | 'gemini-api-key'
  | 'codex-api-key'
  | 'claude-api-key'
  | 'vertex-api-key'
  | 'openai-compatibility'
  | 'oauth-excluded-models';

export interface ConfigCache {
  data: Config;
  timestamp: number;
}
