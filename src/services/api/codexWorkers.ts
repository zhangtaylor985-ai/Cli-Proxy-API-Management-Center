import { apiClient } from './client';
import type { CodexWorkersResponse } from '@/types/codexWorker';

export const codexWorkersApi = {
  list: () => apiClient.get<CodexWorkersResponse>('/codex-workers'),

  updateProxy: (id: string, proxyUrl: string) =>
    apiClient.put(`/codex-workers/${encodeURIComponent(id)}/proxy`, { proxy_url: proxyUrl }),

  containerAction: (id: string, action: 'start' | 'stop' | 'restart') =>
    apiClient.post(`/codex-workers/${encodeURIComponent(id)}/container`, { action }),

  downloadAuthText: async (id: string, name?: string): Promise<string> => {
    const query = name ? `?name=${encodeURIComponent(name)}` : '';
    const response = await apiClient.getRaw(
      `/codex-workers/${encodeURIComponent(id)}/auth-file${query}`,
      { responseType: 'text' }
    );
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
  },

  saveAuthText: (id: string, name: string, content: string) =>
    apiClient.put(`/codex-workers/${encodeURIComponent(id)}/auth-file`, { name, content }),
};
