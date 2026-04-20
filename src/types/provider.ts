/**
 * AI 提供商相关类型
 * 基于原项目 src/modules/ai-providers.js
 */

export interface ModelAlias {
  name: string;
  alias?: string;
  priority?: number;
  testModel?: string;
}

export interface ApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
}

export interface GeminiKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  probeMode?: string;
  probePath?: string;
  canaryEnabled?: boolean;
  canaryPrompt?: string;
  canaryIntervalSeconds?: number;
  models?: ModelAlias[];
  headers?: Record<string, string>;
  excludedModels?: string[];
}

export interface ProviderKeyConfig {
  apiKey: string;
  priority?: number;
  fastRecovery?: boolean;
  fastMode?: boolean;
  opusBaseOnly?: boolean;
  opus47To46?: boolean;
  probeTarget?: boolean;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  proxyUrl?: string;
  probeMode?: string;
  probePath?: string;
  canaryEnabled?: boolean;
  canaryPrompt?: string;
  canaryIntervalSeconds?: number;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  cloak?: CloakConfig;
}

export interface OpenAIProviderConfig {
  name: string;
  prefix?: string;
  baseUrl: string;
  probeMode?: string;
  probePath?: string;
  canaryEnabled?: boolean;
  canaryPrompt?: string;
  canaryIntervalSeconds?: number;
  apiKeyEntries: ApiKeyEntry[];
  headers?: Record<string, string>;
  models?: ModelAlias[];
  priority?: number;
  testModel?: string;
  [key: string]: unknown;
}
