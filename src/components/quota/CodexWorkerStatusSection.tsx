import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw } from '@/components/ui/icons';
import { codexWorkersApi } from '@/services/api';
import type { AuthFileItem, CodexWorkerAuthFile, CodexWorkerItem } from '@/types';
import { downloadBlob } from '@/utils/download';
import styles from '@/pages/QuotaPage.module.scss';

interface CodexWorkerStatusSectionProps {
  files: AuthFileItem[];
  disabled: boolean;
}

type WorkerStatus = 'ready' | 'cooling' | 'error' | 'stopped' | 'unknown';

type QuotaWindow = {
  id: string;
  label: string;
  usedPercent: number | null;
  resetLabel: string;
};

type AuthEditorState = {
  worker: CodexWorkerItem;
  fileName: string;
  content: string;
} | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const lower = (value: unknown): string => normalizeText(value).toLowerCase();

const getAuthFiles = (worker: CodexWorkerItem): CodexWorkerAuthFile[] =>
  worker.auth_files ?? worker.authFiles ?? [];

const getProxyURL = (worker: CodexWorkerItem): string =>
  normalizeText(worker.proxy_url ?? worker.proxyUrl);

const getBaseURL = (worker: CodexWorkerItem): string =>
  normalizeText(worker.base_url ?? worker.baseUrl);

const getContainerStatus = (worker: CodexWorkerItem): string =>
  normalizeText(worker.container_status ?? worker.containerStatus);

const getRouteConfigured = (worker: CodexWorkerItem): boolean =>
  Boolean(worker.route_configured ?? worker.routeConfigured);

const getRouteEnabled = (worker: CodexWorkerItem): boolean =>
  Boolean(worker.route_enabled ?? worker.routeEnabled);

const getStatus = (worker: CodexWorkerItem): WorkerStatus => {
  const containerStatus = lower(getContainerStatus(worker));
  if (containerStatus === 'exited' || containerStatus === 'created' || containerStatus === 'dead') {
    return 'stopped';
  }
  if (worker.error || worker.health === 'degraded') return 'error';
  const quotaError = normalizeText(worker.quota?.error);
  if (quotaError) return lower(quotaError).includes('quota') ? 'cooling' : 'error';
  if (worker.quota?.body) return 'ready';
  return containerStatus === 'running' ? 'ready' : 'unknown';
};

const statusClassName = (status: WorkerStatus): string => {
  switch (status) {
    case 'ready':
      return styles.workerStatusReady;
    case 'cooling':
      return styles.workerStatusCooling;
    case 'error':
      return styles.workerStatusError;
    case 'stopped':
      return styles.workerStatusDisabled;
    default:
      return styles.workerStatusUnknown;
  }
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readWindowReset = (window: Record<string, unknown>): string => {
  const resetAfter = toNumber(window.reset_after_seconds ?? window.resetAfterSeconds);
  if (resetAfter !== null) {
    return new Date(Date.now() + resetAfter * 1000).toLocaleString();
  }
  const resetAt = window.reset_at ?? window.resetAt;
  if (typeof resetAt === 'string' && resetAt.trim()) {
    const date = new Date(resetAt);
    return Number.isNaN(date.getTime()) ? resetAt : date.toLocaleString();
  }
  const resetAtNumber = toNumber(resetAt);
  if (resetAtNumber !== null) {
    const millis = resetAtNumber > 1e12 ? resetAtNumber : resetAtNumber * 1000;
    return new Date(millis).toLocaleString();
  }
  return '-';
};

const normalizeWindow = (id: string, label: string, raw: unknown): QuotaWindow | null => {
  if (!isRecord(raw)) return null;
  const usedPercent = toNumber(raw.used_percent ?? raw.usedPercent);
  return {
    id,
    label,
    usedPercent: usedPercent === null ? null : Math.max(0, Math.min(100, usedPercent)),
    resetLabel: readWindowReset(raw),
  };
};

const appendRateWindows = (
  windows: QuotaWindow[],
  prefix: string,
  labelPrefix: string,
  raw: unknown
) => {
  if (!isRecord(raw)) return;
  const primary = normalizeWindow(`${prefix}-primary`, `${labelPrefix} 5h`, raw.primary_window ?? raw.primaryWindow);
  const secondary = normalizeWindow(`${prefix}-secondary`, `${labelPrefix} 7d`, raw.secondary_window ?? raw.secondaryWindow);
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
};

const buildQuotaWindows = (worker: CodexWorkerItem): QuotaWindow[] => {
  const body = worker.quota?.body;
  if (!isRecord(body)) return [];
  const windows: QuotaWindow[] = [];
  appendRateWindows(windows, 'code', 'Code', body.rate_limit ?? body.rateLimit);
  appendRateWindows(windows, 'review', 'Review', body.code_review_rate_limit ?? body.codeReviewRateLimit);
  const additional = body.additional_rate_limits ?? body.additionalRateLimits;
  if (Array.isArray(additional)) {
    additional.forEach((item, index) => {
      if (!isRecord(item)) return;
      const name = normalizeText(item.limit_name ?? item.limitName ?? item.metered_feature ?? item.meteredFeature) || `Extra ${index + 1}`;
      appendRateWindows(windows, `extra-${index}`, name, item.rate_limit ?? item.rateLimit);
    });
  }
  return windows;
};

const formatPercent = (value: number | null): string => {
  if (value === null) return '-';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
};

const firstAuthFile = (worker: CodexWorkerItem): CodexWorkerAuthFile | undefined => getAuthFiles(worker)[0];

export function CodexWorkerStatusSection({ disabled }: CodexWorkerStatusSectionProps) {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<CodexWorkerItem[]>([]);
  const [proxyDrafts, setProxyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingProxy, setSavingProxy] = useState('');
  const [savingRoute, setSavingRoute] = useState('');
  const [actingWorker, setActingWorker] = useState('');
  const [authEditor, setAuthEditor] = useState<AuthEditorState>(null);
  const [authSaving, setAuthSaving] = useState(false);
  const [error, setError] = useState('');

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await codexWorkersApi.list();
      const items = response.workers || [];
      setWorkers(items);
      setProxyDrafts((prev) => {
        const next = { ...prev };
        items.forEach((worker) => {
          if (!(worker.id in next)) next[worker.id] = getProxyURL(worker);
        });
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  const summary = useMemo(() => {
    const ready = workers.filter((worker) => getStatus(worker) === 'ready').length;
    const cooling = workers.filter((worker) => getStatus(worker) === 'cooling').length;
    const failed = workers.filter((worker) => ['error', 'unknown', 'stopped'].includes(getStatus(worker))).length;
    return { ready, cooling, failed };
  }, [workers]);

  const saveProxy = async (worker: CodexWorkerItem) => {
    setSavingProxy(worker.id);
    setError('');
    try {
      await codexWorkersApi.updateProxy(worker.id, proxyDrafts[worker.id] ?? '');
      await loadWorkers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setSavingProxy('');
    }
  };

  const runAction = async (worker: CodexWorkerItem, action: 'start' | 'stop' | 'restart') => {
    setActingWorker(`${worker.id}:${action}`);
    setError('');
    try {
      await codexWorkersApi.containerAction(worker.id, action);
      await loadWorkers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setActingWorker('');
    }
  };

  const toggleRouting = async (worker: CodexWorkerItem, enabled: boolean) => {
    setSavingRoute(worker.id);
    setError('');
    try {
      await codexWorkersApi.updateRouting(worker.id, enabled);
      await loadWorkers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setSavingRoute('');
    }
  };

  const downloadAuth = async (worker: CodexWorkerItem) => {
    const auth = firstAuthFile(worker);
    const fileName = auth?.name || `${worker.id}.json`;
    try {
      const content = await codexWorkersApi.downloadAuthText(worker.id, auth?.name);
      downloadBlob({ filename: fileName, blob: new Blob([content], { type: 'application/json' }) });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    }
  };

  const openAuthEditor = async (worker: CodexWorkerItem) => {
    const auth = firstAuthFile(worker);
    const fileName = auth?.name || `${worker.id}.json`;
    setError('');
    try {
      const content = await codexWorkersApi.downloadAuthText(worker.id, auth?.name);
      setAuthEditor({ worker, fileName, content });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    }
  };

  const saveAuth = async () => {
    if (!authEditor) return;
    setAuthSaving(true);
    setError('');
    try {
      JSON.parse(authEditor.content);
      await codexWorkersApi.saveAuthText(authEditor.worker.id, authEditor.fileName, authEditor.content);
      setAuthEditor(null);
      await loadWorkers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setAuthSaving(false);
    }
  };

  return (
    <Card
      title={
        <div className={styles.titleWrapper}>
          <span>{t('worker_quota.title', { defaultValue: 'Codex Worker 状态与额度' })}</span>
          {workers.length > 0 && <span className={styles.countBadge}>{workers.length}</span>}
        </div>
      }
      extra={
        <Button
          variant="secondary"
          size="sm"
          onClick={loadWorkers}
          disabled={disabled || loading}
          loading={loading}
          title={t('worker_quota.refresh', { defaultValue: '刷新 worker 状态' })}
          aria-label={t('worker_quota.refresh', { defaultValue: '刷新 worker 状态' })}
        >
          {!loading && <IconRefreshCw size={16} />}
        </Button>
      }
    >
      {error && <div className={styles.errorBox}>{error}</div>}
      {workers.length === 0 ? (
        <EmptyState
          title={t('worker_quota.empty_title', { defaultValue: '没有发现 Codex worker' })}
          description={t('worker_quota.empty_desc', {
            defaultValue: '主程序尚未配置 codex-worker-management.json。',
          })}
        />
      ) : (
        <>
          <div className={styles.workerSummary}>
            <span className={styles.workerSummaryReady}>可用: {summary.ready}</span>
            <span className={styles.workerSummaryCooling}>冷却: {summary.cooling}</span>
            <span className={styles.workerSummaryError}>异常/停止: {summary.failed}</span>
          </div>
          <div className={styles.workerGrid}>
            {workers.map((worker) => {
              const status = getStatus(worker);
              const auth = firstAuthFile(worker);
              const windows = buildQuotaWindows(worker);
              const quotaError = normalizeText(worker.quota?.error);
              return (
                <div key={worker.id} className={styles.workerCard}>
                  <div className={styles.workerHeader}>
                    <div>
                      <div className={styles.workerName}>{worker.name || worker.id}</div>
                      <div className={styles.workerSubName}>{worker.container}</div>
                    </div>
                    <span className={`${styles.workerStatusBadge} ${statusClassName(status)}`}>{status}</span>
                  </div>

                  <div className={styles.workerMeta}>
                    <span>{getBaseURL(worker)}</span>
                    <span>容器: {getContainerStatus(worker) || '-'}</span>
                    <span>主程序路由: {getRouteConfigured(worker) ? (getRouteEnabled(worker) ? '启用' : '停用') : '未配置'}</span>
                    <span>Auth: {auth?.email || auth?.account || auth?.name || '-'}</span>
                    {worker.error && <span className={styles.workerInlineError}>{worker.error}</span>}
                  </div>

                  <div className={styles.workerRouteRow}>
                    <span>{getRouteEnabled(worker) ? '参与主程序路由' : '不参与主程序路由'}</span>
                    <ToggleSwitch
                      checked={getRouteEnabled(worker)}
                      onChange={(enabled) => void toggleRouting(worker, enabled)}
                      disabled={disabled || !getRouteConfigured(worker) || savingRoute === worker.id}
                      ariaLabel="切换 worker 路由"
                      label={getRouteEnabled(worker) ? '启用' : '停用'}
                      labelPosition="left"
                    />
                  </div>

                  <div className={styles.workerQuotaList}>
                    {quotaError ? <div className={styles.quotaError}>{quotaError}</div> : null}
                    {windows.length === 0 && !quotaError ? (
                      <div className={styles.quotaMessage}>暂无精确额度数据</div>
                    ) : (
                      windows.map((window) => {
                        const remaining = window.usedPercent === null ? null : 100 - window.usedPercent;
                        return (
                          <div key={window.id} className={styles.workerQuotaRow}>
                            <div className={styles.quotaRowHeader}>
                              <span className={styles.quotaModel}>{window.label}</span>
                              <span className={styles.quotaMeta}>
                                <span className={styles.quotaPercent}>剩余 {formatPercent(remaining)}</span>
                                <span className={styles.quotaReset}>已用 {formatPercent(window.usedPercent)}</span>
                              </span>
                            </div>
                            <div className={styles.quotaBar}>
                              <div
                                className={`${styles.quotaBarFill} ${
                                  remaining !== null && remaining < 20
                                    ? styles.quotaBarFillLow
                                    : remaining !== null && remaining < 50
                                      ? styles.quotaBarFillMedium
                                      : styles.quotaBarFillHigh
                                }`}
                                style={{ width: `${Math.max(0, Math.min(100, remaining ?? 0))}%` }}
                              />
                            </div>
                            <div className={styles.workerQuotaReset}>恢复: {window.resetLabel}</div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className={styles.workerProxyEditor}>
                    <label>代理</label>
                    <div className={styles.workerProxyRow}>
                      <input
                        value={proxyDrafts[worker.id] ?? getProxyURL(worker)}
                        onChange={(event) => setProxyDrafts((prev) => ({ ...prev, [worker.id]: event.target.value }))}
                        disabled={disabled || savingProxy === worker.id}
                        placeholder="socks5://user:pass@host:port"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void saveProxy(worker)}
                        loading={savingProxy === worker.id}
                        disabled={disabled}
                      >
                        保存
                      </Button>
                    </div>
                  </div>

                  <div className={styles.workerActions}>
                    <Button size="sm" variant="secondary" onClick={() => void openAuthEditor(worker)} disabled={disabled || !auth}>
                      编辑 Auth
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void downloadAuth(worker)} disabled={disabled || !auth}>
                      下载 Auth
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void runAction(worker, 'start')}
                      loading={actingWorker === `${worker.id}:start`}
                      disabled={disabled}
                    >
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void runAction(worker, 'restart')}
                      loading={actingWorker === `${worker.id}:restart`}
                      disabled={disabled}
                    >
                      Restart
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void runAction(worker, 'stop')}
                      loading={actingWorker === `${worker.id}:stop`}
                      disabled={disabled}
                    >
                      Stop
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={Boolean(authEditor)}
        title={authEditor ? `编辑 ${authEditor.fileName}` : ''}
        onClose={() => setAuthEditor(null)}
        width={860}
        closeDisabled={authSaving}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAuthEditor(null)} disabled={authSaving}>
              取消
            </Button>
            <Button onClick={() => void saveAuth()} loading={authSaving}>
              保存 Auth
            </Button>
          </>
        }
      >
        {authEditor && (
          <textarea
            className={styles.workerAuthTextarea}
            value={authEditor.content}
            onChange={(event) => setAuthEditor((prev) => (prev ? { ...prev, content: event.target.value } : prev))}
            spellCheck={false}
          />
        )}
      </Modal>
    </Card>
  );
}
