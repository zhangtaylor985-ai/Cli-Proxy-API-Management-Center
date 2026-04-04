import { apiClient } from './client';

const SESSION_TRAJECTORY_TIMEOUT_MS = 60 * 1000;

const appendQueryParam = (
  searchParams: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined
) => {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === 'boolean') {
    if (value) {
      searchParams.set(key, '1');
    }
    return;
  }
  const text = String(value).trim();
  if (!text) {
    return;
  }
  searchParams.set(key, text);
};

const buildQueryString = <T extends object>(params: T) => {
  const searchParams = new URLSearchParams();
  Object.entries(params as Record<string, string | number | boolean | null | undefined>).forEach(
    ([key, value]) => appendQueryParam(searchParams, key, value)
  );
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

export interface SessionTrajectorySummary {
  session_id: string;
  user_id: string;
  source: string;
  call_type: string;
  provider: string;
  canonical_model_family: string;
  provider_session_id?: string;
  session_name?: string;
  message_count: number;
  request_count: number;
  started_at: string;
  last_activity_at: string;
  closed_at?: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
}

export interface SessionTrajectoryRequest {
  id: string;
  request_id: string;
  session_id: string;
  user_id: string;
  provider_request_id?: string;
  upstream_log_id?: string;
  request_index: number;
  source: string;
  call_type: string;
  provider: string;
  model: string;
  user_agent?: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost_micro_usd: number;
  request_json?: unknown;
  response_json?: unknown;
  normalized_json?: unknown;
  error_json?: unknown;
}

export interface SessionTrajectoryTokenRound {
  request_id: string;
  request_index: number;
  started_at: string;
  ended_at?: string | null;
  model: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface SessionTrajectoryTokenSummary {
  round_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface SessionTrajectoryTokenRoundsResponse {
  summary: SessionTrajectoryTokenSummary;
  items: SessionTrajectoryTokenRound[];
}

export interface SessionTrajectoryExportedFile {
  request_id: string;
  request_index: number;
  export_index: number;
  export_path: string;
}

export interface SessionTrajectoryExportResult {
  session_id: string;
  user_id: string;
  export_dir: string;
  file_count: number;
  exported_at: string;
  files: SessionTrajectoryExportedFile[];
}

export interface SessionTrajectoryExportPayload {
  version?: number;
  exported_at?: string;
  items: SessionTrajectoryExportResult[];
}

export interface SessionTrajectoryListParams {
  user_id?: string;
  source?: string;
  call_type?: string;
  status?: string;
  provider?: string;
  canonical_model_family?: string;
  limit?: number;
  before?: string;
}

export interface SessionTrajectoryRequestParams {
  limit?: number;
  after_request_index?: number;
  include_payloads?: boolean;
}

export const sessionTrajectoriesApi = {
  listSessions(params: SessionTrajectoryListParams = {}) {
    return apiClient.get<{ items: SessionTrajectorySummary[] }>(
      `/session-trajectories/sessions${buildQueryString(params)}`,
      { timeout: SESSION_TRAJECTORY_TIMEOUT_MS }
    );
  },

  getSession(sessionId: string) {
    return apiClient.get<{ item: SessionTrajectorySummary }>(
      `/session-trajectories/sessions/${encodeURIComponent(sessionId)}`,
      { timeout: SESSION_TRAJECTORY_TIMEOUT_MS }
    );
  },

  listSessionRequests(sessionId: string, params: SessionTrajectoryRequestParams = {}) {
    return apiClient.get<{ items: SessionTrajectoryRequest[] }>(
      `/session-trajectories/sessions/${encodeURIComponent(sessionId)}/requests${buildQueryString(params)}`,
      { timeout: SESSION_TRAJECTORY_TIMEOUT_MS }
    );
  },

  getSessionTokenRounds(sessionId: string, limit = 100) {
    return apiClient.get<SessionTrajectoryTokenRoundsResponse>(
      `/session-trajectories/sessions/${encodeURIComponent(sessionId)}/token-rounds${buildQueryString({ limit })}`,
      { timeout: SESSION_TRAJECTORY_TIMEOUT_MS }
    );
  },

  exportSession(sessionId: string) {
    return apiClient.post<{ item: SessionTrajectoryExportResult }>(
      `/session-trajectories/sessions/${encodeURIComponent(sessionId)}/export`,
      undefined,
      { timeout: SESSION_TRAJECTORY_TIMEOUT_MS }
    );
  },

  exportSessions(params: SessionTrajectoryListParams = {}) {
    return apiClient.post<SessionTrajectoryExportPayload>(
      `/session-trajectories/export${buildQueryString(params)}`,
      undefined,
      { timeout: SESSION_TRAJECTORY_TIMEOUT_MS }
    );
  },
};
