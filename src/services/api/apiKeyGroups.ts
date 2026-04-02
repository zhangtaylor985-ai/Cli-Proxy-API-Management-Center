import { apiClient } from './client';

export interface ApiKeyGroupView {
  id: string;
  name: string;
  daily_budget_usd: number;
  weekly_budget_usd: number;
  is_system: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyGroupMutation {
  id?: string;
  name: string;
  daily_budget_usd: number;
  weekly_budget_usd: number;
}

export const apiKeyGroupsApi = {
  async list(): Promise<ApiKeyGroupView[]> {
    const response = await apiClient.get<{ items?: ApiKeyGroupView[] }>('/api-key-groups');
    return Array.isArray(response.items) ? response.items : [];
  },

  async create(payload: ApiKeyGroupMutation): Promise<ApiKeyGroupView> {
    return apiClient.post<ApiKeyGroupView>('/api-key-groups', payload);
  },

  async update(id: string, payload: ApiKeyGroupMutation): Promise<ApiKeyGroupView> {
    return apiClient.put<ApiKeyGroupView>(`/api-key-groups/${encodeURIComponent(id)}`, payload);
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/api-key-groups/${encodeURIComponent(id)}`);
  },
};
