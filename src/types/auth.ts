/**
 * 认证相关类型定义
 * 基于原项目 src/modules/login.js 和 src/core/connection.js
 */

// 登录凭据
export interface LoginCredentials {
  apiBase: string;
  username: string;
  password: string;
  rememberPassword?: boolean;
}

export type ManagementRole = 'admin' | 'staff';

// 认证状态
export interface AuthState {
  isAuthenticated: boolean;
  apiBase: string;
  managementKey: string;
  username: string;
  role: ManagementRole | null;
  rememberPassword: boolean;
  serverVersion: string | null;
  serverBuildDate: string | null;
}

// 连接状态
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ConnectionInfo {
  status: ConnectionStatus;
  lastCheck: Date | null;
  error: string | null;
}

export interface ManagementLoginResponse {
  token: string;
  username: string;
  role: ManagementRole;
  expires_at: string;
}

export interface ManagementMeResponse {
  username: string;
  role: ManagementRole;
  auth_source: string;
}
