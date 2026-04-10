import { apiClient } from './client';
import type { ManagementLoginResponse, ManagementMeResponse } from '@/types';

export const authApi = {
  login: (payload: { username: string; password: string }) =>
    apiClient.post<ManagementLoginResponse>('/login', payload),

  me: () => apiClient.get<ManagementMeResponse>('/me'),

  logout: () => apiClient.post('/logout'),
};
