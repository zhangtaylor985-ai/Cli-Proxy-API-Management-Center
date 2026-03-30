import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { apiKeyRecordsApi } from '@/services/api/apiKeyRecords';
import type {
  ApiKeyDailyLimitView,
  ApiKeyEventView,
  ApiKeyPolicyView,
  ApiKeyRecordDetailView,
  ApiKeyRecordMutation,
  ApiKeyRecordSummaryView,
} from '@/services/api/apiKeyRecords';
import { useNotificationStore } from '@/stores';
import styles from './APIKeysWorkbenchPage.module.scss';

type WorkbenchDraft = {
  apiKey: string;
  fastMode: boolean;
  enableClaudeModels: boolean;
  claudeUsageLimitUsd: string;
  claudeGptTargetFamily: string;
  enableClaudeOpus1M: boolean;
  upstreamBaseUrl: string;
  excludedModels: string;
  allowClaudeOpus46: boolean;
  dailyLimits: string;
  dailyBudgetUsd: string;
  weeklyBudgetUsd: string;
  weeklyBudgetAnchorAt: string;
  tokenPackageUsd: string;
  tokenPackageStartedAt: string;
  modelRoutingRules: string;
  claudeFailoverEnabled: boolean;
  claudeFailoverTarget: string;
  claudeFailoverRules: string;
};

const RANGE_OPTIONS = [
  { value: '7d', label: '近 7 天' },
  { value: '14d', label: '近 14 天' },
  { value: '30d', label: '近 30 天' },
];

const FAMILY_OPTIONS = [
  { value: '', label: '默认 gpt-5.4' },
  { value: 'gpt-5.4', label: 'gpt-5.4' },
  { value: 'gpt-5.2', label: 'gpt-5.2' },
  { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
];

function emptyDraft(): WorkbenchDraft {
  return {
    apiKey: '',
    fastMode: false,
    enableClaudeModels: false,
    claudeUsageLimitUsd: '',
    claudeGptTargetFamily: '',
    enableClaudeOpus1M: false,
    upstreamBaseUrl: '',
    excludedModels: '',
    allowClaudeOpus46: true,
    dailyLimits: '',
    dailyBudgetUsd: '',
    weeklyBudgetUsd: '',
    weeklyBudgetAnchorAt: '',
    tokenPackageUsd: '',
    tokenPackageStartedAt: '',
    modelRoutingRules: '[]',
    claudeFailoverEnabled: false,
    claudeFailoverTarget: '',
    claudeFailoverRules: '[]',
  };
}

function formatNumber(value: number | undefined | null): string {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

function formatCost(value: number | undefined | null): string {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatPercent(value: number | undefined | null): string {
  return `${Math.round(Number(value || 0))}%`;
}

function formatDateTime(value?: string): string {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDateTimeLocal(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoOrEmpty(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function linesFromMap(source: Record<string, number>): string {
  return Object.entries(source)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function mapFromLines(source: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of source.split('\n')) {
    const [keyPart, valuePart] = line.split('=');
    const key = String(keyPart ?? '').trim();
    const value = Number(String(valuePart ?? '').trim());
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    result[key] = Math.floor(value);
  }
  return result;
}

function linesFromList(source: string[]): string {
  return source.join('\n');
}

function listFromLines(source: string): string[] {
  return source
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray(source: string): Array<Record<string, unknown>> {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON 必须是数组');
  }
  return parsed as Array<Record<string, unknown>>;
}

function toDraft(policy: ApiKeyPolicyView, fallbackKey: string): WorkbenchDraft {
  return {
    apiKey: policy.api_key || fallbackKey,
    fastMode: Boolean(policy.fast_mode),
    enableClaudeModels: Boolean(policy.enable_claude_models),
    claudeUsageLimitUsd: policy.claude_usage_limit_usd ? String(policy.claude_usage_limit_usd) : '',
    claudeGptTargetFamily: policy.claude_gpt_target_family || '',
    enableClaudeOpus1M: Boolean(policy.enable_claude_opus_1m),
    upstreamBaseUrl: policy.upstream_base_url || '',
    excludedModels: linesFromList(policy.excluded_models || []),
    allowClaudeOpus46: policy.allow_claude_opus_46 !== false,
    dailyLimits: linesFromMap(policy.daily_limits || {}),
    dailyBudgetUsd: policy.daily_budget_usd ? String(policy.daily_budget_usd) : '',
    weeklyBudgetUsd: policy.weekly_budget_usd ? String(policy.weekly_budget_usd) : '',
    weeklyBudgetAnchorAt: formatDateTimeLocal(policy.weekly_budget_anchor_at),
    tokenPackageUsd: policy.token_package_usd ? String(policy.token_package_usd) : '',
    tokenPackageStartedAt: formatDateTimeLocal(policy.token_package_started_at),
    modelRoutingRules: JSON.stringify(policy.model_routing_rules || [], null, 2),
    claudeFailoverEnabled: Boolean(policy.claude_failover_enabled),
    claudeFailoverTarget: policy.claude_failover_target || '',
    claudeFailoverRules: JSON.stringify(policy.claude_failover_rules || [], null, 2),
  };
}

function toPolicyView(draft: WorkbenchDraft): ApiKeyPolicyView {
  return {
    api_key: draft.apiKey.trim(),
    fast_mode: draft.fastMode,
    enable_claude_models: draft.enableClaudeModels,
    claude_usage_limit_usd: Number(draft.claudeUsageLimitUsd || 0),
    claude_gpt_target_family: draft.claudeGptTargetFamily,
    enable_claude_opus_1m: draft.enableClaudeOpus1M,
    upstream_base_url: draft.upstreamBaseUrl.trim(),
    excluded_models: listFromLines(draft.excludedModels),
    allow_claude_opus_46: draft.allowClaudeOpus46,
    daily_limits: mapFromLines(draft.dailyLimits),
    daily_budget_usd: Number(draft.dailyBudgetUsd || 0),
    weekly_budget_usd: Number(draft.weeklyBudgetUsd || 0),
    weekly_budget_anchor_at: toIsoOrEmpty(draft.weeklyBudgetAnchorAt),
    token_package_usd: Number(draft.tokenPackageUsd || 0),
    token_package_started_at: toIsoOrEmpty(draft.tokenPackageStartedAt),
    model_routing_rules: parseJsonArray(draft.modelRoutingRules),
    claude_failover_enabled: draft.claudeFailoverEnabled,
    claude_failover_target: draft.claudeFailoverTarget.trim(),
    claude_failover_rules: parseJsonArray(draft.claudeFailoverRules),
  };
}

function budgetTone(percent: number): 'safe' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger';
  if (percent >= 60) return 'warn';
  return 'safe';
}

function renderWindow(windowView: ApiKeyRecordSummaryView['daily_budget']) {
  if (!windowView.enabled) {
    return '未配置';
  }
  return `${formatCost(windowView.used_usd)} / ${formatCost(windowView.limit_usd)}`;
}

function DailyLimitBar({ item }: { item: ApiKeyDailyLimitView }) {
  const usedPercent = item.limit > 0 ? Math.min(100, (item.used / item.limit) * 100) : 0;
  return (
    <div className={styles.limitItem}>
      <div className={styles.limitMeta}>
        <strong>{item.model}</strong>
        <span>
          {formatNumber(item.used)} / {formatNumber(item.limit)}
        </span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${styles[`tone${budgetTone(usedPercent)}`]}`}
          style={{ width: `${Math.max(4, usedPercent)}%` }}
        />
      </div>
      <div className={styles.limitFooter}>剩余 {formatNumber(item.remaining)}</div>
    </div>
  );
}

function RecentEventsTable({ items }: { items: ApiKeyEventView[] }) {
  if (!items.length) {
    return <div className={styles.emptyState}>暂无最近请求</div>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>时间</th>
            <th>模型</th>
            <th>Tokens</th>
            <th>费用</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.requested_at}-${item.model}-${index}`}>
              <td>{formatDateTime(item.requested_at)}</td>
              <td>{item.model}</td>
              <td>{formatNumber(item.total_tokens)}</td>
              <td>{formatCost(item.cost_usd)}</td>
              <td>
                <span
                  className={`${styles.badge} ${item.failed ? styles.badgeDanger : styles.badgeSuccess}`}
                >
                  {item.failed ? '失败' : '成功'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function APIKeysWorkbenchPage() {
  const { showNotification } = useNotificationStore();
  const [range, setRange] = useState('14d');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ApiKeyRecordSummaryView[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [detail, setDetail] = useState<ApiKeyRecordDetailView | null>(null);
  const [draft, setDraft] = useState<WorkbenchDraft>(emptyDraft);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<'reset' | 'delete' | null>(null);
  const [error, setError] = useState('');

  const selectedSummary = useMemo(
    () => items.find((item) => item.api_key === selectedKey) ?? detail?.summary ?? null,
    [detail?.summary, items, selectedKey]
  );

  const loadDetail = useCallback(
    async (apiKey: string, nextRange = range) => {
      if (!apiKey) {
        setDetail(null);
        setDraft(emptyDraft());
        return;
      }
      setDetailLoading(true);
      setError('');
      try {
        const response = await apiKeyRecordsApi.get(apiKey, nextRange, 100);
        setSelectedKey(apiKey);
        setDetail(response);
        setDraft(toDraft(response.explicit_policy, response.summary.api_key));
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : '加载详情失败';
        setError(message);
        showNotification(message, 'error');
      } finally {
        setDetailLoading(false);
      }
    },
    [range, showNotification]
  );

  const loadList = useCallback(
    async (preferredKey?: string, nextRange = range) => {
      setListLoading(true);
      setError('');
      try {
        const response = await apiKeyRecordsApi.list(nextRange, search);
        setItems(response);
        const candidate =
          preferredKey && response.some((item) => item.api_key === preferredKey)
            ? preferredKey
            : response[0]?.api_key ?? '';

        if (candidate) {
          void loadDetail(candidate, nextRange);
        } else {
          setSelectedKey('');
          setDetail(null);
          setDraft(emptyDraft());
        }
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : '加载 API Key 列表失败';
        setError(message);
        showNotification(message, 'error');
      } finally {
        setListLoading(false);
      }
    },
    [loadDetail, range, search, showNotification]
  );

  useEffect(() => {
    void loadList(selectedKey || undefined, range);
  }, [loadList, range]);

  useHeaderRefresh(() => {
    void loadList(selectedKey, range);
  });

  const trendDays = detail?.recent_days ?? [];
  const maxCost = Math.max(...trendDays.map((item) => Number(item.cost_usd || 0)), 0.0001);

  const overallStats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.todayCost += Number(item.today.cost_usd || 0);
        acc.periodCost += Number(item.current_period.cost_usd || 0);
        acc.tokens += Number(item.today.total_tokens || 0);
        return acc;
      },
      { todayCost: 0, periodCost: 0, tokens: 0 }
    );
  }, [items]);

  const updateDraft = useCallback(<K extends keyof WorkbenchDraft>(key: K, value: WorkbenchDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const createNew = useCallback(() => {
    setSelectedKey('');
    setDetail(null);
    setDraft(emptyDraft());
    setError('');
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedKey = draft.apiKey.trim();
    if (!trimmedKey) {
      setError('API Key 不能为空');
      return;
    }

    let payload: ApiKeyRecordMutation;
    try {
      payload = {
        new_api_key: trimmedKey,
        policy: toPolicyView(draft),
        clear_policy: false,
      };
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '策略格式无效';
      setError(message);
      showNotification(message, 'error');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (selectedKey) {
        await apiKeyRecordsApi.update(selectedKey, payload);
        showNotification('API Key 策略已保存', 'success');
      } else {
        await apiKeyRecordsApi.create(payload);
        showNotification('新 API Key 已创建', 'success');
      }
      await loadList(trimmedKey, range);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '保存失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, loadList, range, selectedKey, showNotification]);

  const handleResetPolicy = useCallback(async () => {
    if (!selectedKey) return;
    setBusyAction('reset');
    setError('');
    try {
      await apiKeyRecordsApi.update(selectedKey, {
        new_api_key: selectedKey,
        clear_policy: true,
      });
      showNotification('显式策略已清空', 'success');
      await loadList(selectedKey, range);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '清空策略失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setBusyAction(null);
    }
  }, [loadList, range, selectedKey, showNotification]);

  const handleDelete = useCallback(async () => {
    if (!selectedKey) return;
    if (!window.confirm(`确认删除 ${selectedKey}？`)) return;
    setBusyAction('delete');
    setError('');
    try {
      await apiKeyRecordsApi.remove(selectedKey);
      showNotification('API Key 已删除', 'success');
      await loadList('', range);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '删除失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setBusyAction(null);
    }
  }, [loadList, range, selectedKey, showNotification]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>API Keys 工作台</h1>
          <p className={styles.description}>
            用列表管理 key，用详情做策略编辑，再把今日、周期、Token 包和请求流水放在同一屏里。
          </p>
        </div>
        <div className={styles.headerActions}>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void loadList(selectedKey, range);
              }
            }}
            placeholder="搜索 API Key"
          />
          <Select value={range} options={RANGE_OPTIONS} onChange={setRange} fullWidth={false} />
          <Button variant="secondary" onClick={() => void loadList(selectedKey, range)} loading={listLoading}>
            刷新
          </Button>
          <Button variant="secondary" onClick={createNew}>
            新建 Key
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>Key 总数</span>
          <strong className={styles.metricValue}>{formatNumber(items.length)}</strong>
          <span className={styles.metricHint}>已注册与仅策略配置合并展示</span>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>今日总费用</span>
          <strong className={styles.metricValue}>{formatCost(overallStats.todayCost)}</strong>
          <span className={styles.metricHint}>所有 API Key 今日累计</span>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>当前周期费用</span>
          <strong className={styles.metricValue}>{formatCost(overallStats.periodCost)}</strong>
          <span className={styles.metricHint}>按每个 key 的周期窗口汇总</span>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>今日 Tokens</span>
          <strong className={styles.metricValue}>{formatNumber(overallStats.tokens)}</strong>
          <span className={styles.metricHint}>用于快速发现异常增长</span>
        </Card>
      </div>

      <div className={styles.layout}>
        <Card
          className={styles.listCard}
          title="API Key 列表"
          extra={<span className={styles.listMeta}>{listLoading ? '加载中...' : `${items.length} 项`}</span>}
        >
          <div className={styles.listPane}>
            {items.length === 0 ? (
              <div className={styles.emptyState}>没有匹配的 API Key。</div>
            ) : (
              items.map((item) => {
                const dailyTone = budgetTone(
                  Math.max(item.daily_budget.used_percent || 0, item.weekly_budget.used_percent || 0)
                );
                return (
                  <button
                    type="button"
                    key={item.api_key}
                    className={`${styles.listItem} ${selectedKey === item.api_key ? styles.listItemActive : ''}`}
                    onClick={() => void loadDetail(item.api_key, range)}
                  >
                    <div className={styles.listItemTop}>
                      <div>
                        <strong>{item.masked_api_key}</strong>
                        <div className={styles.listItemMeta}>
                          {item.registered ? '已注册' : '仅策略配置'} · {item.policy_family || 'default'}
                        </div>
                      </div>
                      <span className={`${styles.badge} ${styles[`badge${dailyTone}`]}`}>
                        {formatPercent(
                          Math.max(item.daily_budget.used_percent || 0, item.weekly_budget.used_percent || 0)
                        )}
                      </span>
                    </div>
                    <div className={styles.listMetrics}>
                      <span>{formatCost(item.today.cost_usd)} 今日</span>
                      <span>{formatCost(item.current_period.cost_usd)} 周期</span>
                      <span>{formatNumber(item.today.total_tokens)} tokens</span>
                    </div>
                    <div className={styles.listItemMeta}>最近使用: {formatDateTime(item.last_used_at)}</div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <div className={styles.detailColumn}>
          <Card
            className={styles.heroCard}
            title={selectedKey ? '详情与编辑' : '创建 API Key'}
            extra={
              <div className={styles.heroActions}>
                <Button variant="secondary" onClick={handleResetPolicy} disabled={!selectedKey} loading={busyAction === 'reset'}>
                  清空显式策略
                </Button>
                <Button variant="danger" onClick={handleDelete} disabled={!selectedKey} loading={busyAction === 'delete'}>
                  删除
                </Button>
                <Button onClick={handleSave} loading={saving}>
                  保存
                </Button>
              </div>
            }
          >
            <div className={styles.heroMetrics}>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>今日费用</span>
                <strong>{formatCost(selectedSummary?.today.cost_usd)}</strong>
              </div>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>今日 Tokens</span>
                <strong>{formatNumber(selectedSummary?.today.total_tokens)}</strong>
              </div>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>当前周期费用</span>
                <strong>{formatCost(selectedSummary?.current_period.cost_usd)}</strong>
              </div>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>Token 包余额</span>
                <strong>{selectedSummary ? formatCost(selectedSummary.token_package.remaining_usd) : '未配置'}</strong>
              </div>
            </div>

            <div className={styles.dualGrid}>
              <Input
                label="API Key"
                value={draft.apiKey}
                onChange={(event) => updateDraft('apiKey', event.target.value)}
                placeholder="输入 API Key"
              />
              <div className="form-group">
                <label>Claude 转 GPT 家族</label>
                <Select value={draft.claudeGptTargetFamily} options={FAMILY_OPTIONS} onChange={(value) => updateDraft('claudeGptTargetFamily', value)} />
              </div>
              <Input
                label="Upstream Base URL"
                value={draft.upstreamBaseUrl}
                onChange={(event) => updateDraft('upstreamBaseUrl', event.target.value)}
                placeholder="可选"
              />
              <Input
                label="Claude 累计预算 USD"
                type="number"
                min="0"
                step="0.01"
                value={draft.claudeUsageLimitUsd}
                onChange={(event) => updateDraft('claudeUsageLimitUsd', event.target.value)}
              />
              <Input
                label="每日预算 USD"
                type="number"
                min="0"
                step="0.01"
                value={draft.dailyBudgetUsd}
                onChange={(event) => updateDraft('dailyBudgetUsd', event.target.value)}
              />
              <Input
                label="每周期预算 USD"
                type="number"
                min="0"
                step="0.01"
                value={draft.weeklyBudgetUsd}
                onChange={(event) => updateDraft('weeklyBudgetUsd', event.target.value)}
              />
              <Input
                label="周期锚点"
                type="datetime-local"
                value={draft.weeklyBudgetAnchorAt}
                onChange={(event) => updateDraft('weeklyBudgetAnchorAt', event.target.value)}
              />
              <Input
                label="Token 包 USD"
                type="number"
                min="0"
                step="0.01"
                value={draft.tokenPackageUsd}
                onChange={(event) => updateDraft('tokenPackageUsd', event.target.value)}
              />
              <Input
                label="Token 包开始时间"
                type="datetime-local"
                value={draft.tokenPackageStartedAt}
                onChange={(event) => updateDraft('tokenPackageStartedAt', event.target.value)}
              />
              <Input
                label="Claude Failover Target"
                value={draft.claudeFailoverTarget}
                onChange={(event) => updateDraft('claudeFailoverTarget', event.target.value)}
                placeholder="例如 gpt-5.4(medium)"
              />
            </div>

            <div className={styles.toggleGrid}>
              <ToggleSwitch
                checked={draft.fastMode}
                onChange={(value) => updateDraft('fastMode', value)}
                label="Fast Mode"
              />
              <ToggleSwitch
                checked={draft.enableClaudeModels}
                onChange={(value) => updateDraft('enableClaudeModels', value)}
                label="允许 Claude 原生模型"
              />
              <ToggleSwitch
                checked={draft.enableClaudeOpus1M}
                onChange={(value) => updateDraft('enableClaudeOpus1M', value)}
                label="允许 Claude Opus 1M"
              />
              <ToggleSwitch
                checked={draft.allowClaudeOpus46}
                onChange={(value) => updateDraft('allowClaudeOpus46', value)}
                label="允许 Claude Opus 4.6"
              />
              <ToggleSwitch
                checked={draft.claudeFailoverEnabled}
                onChange={(value) => updateDraft('claudeFailoverEnabled', value)}
                label="Claude Failover"
              />
            </div>

            <div className={styles.textAreaGrid}>
              <label className={styles.textAreaField}>
                <span>每日模型限额</span>
                <textarea
                  value={draft.dailyLimits}
                  onChange={(event) => updateDraft('dailyLimits', event.target.value)}
                  placeholder={'gpt-5.4=120\nclaude-sonnet-4-6=40'}
                />
              </label>
              <label className={styles.textAreaField}>
                <span>禁止模型</span>
                <textarea
                  value={draft.excludedModels}
                  onChange={(event) => updateDraft('excludedModels', event.target.value)}
                  placeholder={'gpt-5.5*\nclaude-opus-4-6*'}
                />
              </label>
              <label className={styles.textAreaField}>
                <span>Model Routing Rules JSON</span>
                <textarea
                  value={draft.modelRoutingRules}
                  onChange={(event) => updateDraft('modelRoutingRules', event.target.value)}
                />
              </label>
              <label className={styles.textAreaField}>
                <span>Claude Failover Rules JSON</span>
                <textarea
                  value={draft.claudeFailoverRules}
                  onChange={(event) => updateDraft('claudeFailoverRules', event.target.value)}
                />
              </label>
            </div>
          </Card>

          <div className={styles.analyticsGrid}>
            <Card className={styles.analyticsCard} title="预算与限额">
              {selectedSummary ? (
                <div className={styles.windowGrid}>
                  <div className={styles.windowCard}>
                    <span className={styles.metricLabel}>每日预算</span>
                    <strong>{renderWindow(selectedSummary.daily_budget)}</strong>
                    <span className={styles.metricHint}>
                      占用 {formatPercent(selectedSummary.daily_budget.used_percent)}
                    </span>
                  </div>
                  <div className={styles.windowCard}>
                    <span className={styles.metricLabel}>当前周期预算</span>
                    <strong>{renderWindow(selectedSummary.weekly_budget)}</strong>
                    <span className={styles.metricHint}>
                      占用 {formatPercent(selectedSummary.weekly_budget.used_percent)}
                    </span>
                  </div>
                  <div className={styles.windowCard}>
                    <span className={styles.metricLabel}>Token 包</span>
                    <strong>
                      {selectedSummary.token_package.enabled
                        ? formatCost(selectedSummary.token_package.remaining_usd)
                        : '未配置'}
                    </strong>
                    <span className={styles.metricHint}>
                      {selectedSummary.token_package.enabled
                        ? `已用 ${formatCost(selectedSummary.token_package.used_usd)}`
                        : '预付流量包未启用'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyState}>请选择左侧 API Key。</div>
              )}

              <div className={styles.limitList}>
                {(detail?.daily_limits ?? []).length ? (
                  detail?.daily_limits.map((item) => <DailyLimitBar key={item.model} item={item} />)
                ) : (
                  <div className={styles.emptyState}>暂无每日限额配置</div>
                )}
              </div>
            </Card>

            <Card className={styles.analyticsCard} title="近时段费用走势">
              {detailLoading ? (
                <div className={styles.emptyState}>正在加载走势...</div>
              ) : trendDays.length ? (
                <div className={styles.trendBars}>
                  {trendDays.map((item) => (
                    <div key={item.day} className={styles.trendBar}>
                      <span className={styles.trendValue}>{formatCost(item.cost_usd)}</span>
                      <div className={styles.trendTrack}>
                        <div
                          className={styles.trendFill}
                          style={{ height: `${Math.max(8, (Number(item.cost_usd || 0) / maxCost) * 140)}px` }}
                        />
                      </div>
                      <span className={styles.trendLabel}>{item.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>暂无趋势数据</div>
              )}
            </Card>
          </div>

          <Card className={styles.analyticsCard} title="模型用量拆分">
            {(detail?.model_usage ?? []).length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>请求</th>
                      <th>Tokens</th>
                      <th>费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.model_usage.map((item) => (
                      <tr key={item.model}>
                        <td>{item.model}</td>
                        <td>{formatNumber(item.requests)}</td>
                        <td>{formatNumber(item.total_tokens)}</td>
                        <td>{formatCost(item.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>暂无模型用量</div>
            )}
          </Card>

          <Card className={styles.analyticsCard} title="最近请求">
            <RecentEventsTable items={detail?.recent_events ?? []} />
          </Card>
        </div>
      </div>
    </div>
  );
}
