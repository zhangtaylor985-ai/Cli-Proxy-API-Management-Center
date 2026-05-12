export interface CodexWorkerAuthFile {
  id?: string;
  name?: string;
  email?: string;
  provider?: string;
  type?: string;
  auth_index?: string;
  authIndex?: string;
  disabled?: boolean;
  status?: string;
  account?: string;
  id_token?: Record<string, unknown>;
}

export interface CodexWorkerQuota {
  status_code?: number;
  statusCode?: number;
  error?: string;
  body?: Record<string, unknown>;
}

export interface CodexWorkerItem {
  id: string;
  name: string;
  container: string;
  base_url: string;
  baseUrl?: string;
  ssh_configured?: boolean;
  sshConfigured?: boolean;
  container_status?: string;
  containerStatus?: string;
  proxy_url?: string;
  proxyUrl?: string;
  health?: string;
  error?: string;
  auth_files?: CodexWorkerAuthFile[];
  authFiles?: CodexWorkerAuthFile[];
  quota?: CodexWorkerQuota | null;
}

export interface CodexWorkersResponse {
  workers: CodexWorkerItem[];
}
