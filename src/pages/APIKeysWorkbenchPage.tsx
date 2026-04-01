import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { apiKeyGroupsApi } from '@/services/api/apiKeyGroups';
import type { ApiKeyGroupView } from '@/services/api/apiKeyGroups';
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
import { generateSecureApiKey } from '@/utils/apiKeys';
import { isValidApiKeyCharset } from '@/utils/validation';
import styles from './APIKeysWorkbenchPage.module.scss';

type WorkbenchDraft = {
  apiKey: string;
  groupId: string;
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

type GroupDraft = {
  id: string;
  name: string;
  dailyBudgetUsd: string;
  weeklyBudgetUsd: string;
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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getLocalHourInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:00`;
}

function getCurrentHourInputValue(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return getLocalHourInputValue(now);
}

function normalizeHourInputValue(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setMinutes(0, 0, 0);
  return getLocalHourInputValue(parsed);
}

function emptyDraft(): WorkbenchDraft {
  return {
    apiKey: '',
    groupId: '',
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
    weeklyBudgetAnchorAt: getCurrentHourInputValue(),
    tokenPackageUsd: '',
    tokenPackageStartedAt: '',
    modelRoutingRules: '[]',
    claudeFailoverEnabled: false,
    claudeFailoverTarget: '',
    claudeFailoverRules: '[]',
  };
}

function emptyGroupDraft(): GroupDraft {
  return {
    id: '',
    name: '',
    dailyBudgetUsd: '',
    weeklyBudgetUsd: '',
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

function toHourlyIsoOrEmpty(value: string): string {
  return toIsoOrEmpty(normalizeHourInputValue(value));
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
    groupId: policy.group_id || '',
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
    weeklyBudgetAnchorAt: normalizeHourInputValue(policy.weekly_budget_anchor_at),
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
    group_id: draft.groupId.trim(),
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
    weekly_budget_anchor_at:
      Number(draft.weeklyBudgetUsd || 0) > 0 ? toHourlyIsoOrEmpty(draft.weeklyBudgetAnchorAt) : '',
    token_package_usd: Number(draft.tokenPackageUsd || 0),
    token_package_started_at: toIsoOrEmpty(draft.tokenPackageStartedAt),
    model_routing_rules: parseJsonArray(draft.modelRoutingRules),
    claude_failover_enabled: draft.claudeFailoverEnabled,
    claude_failover_target: draft.claudeFailoverTarget.trim(),
    claude_failover_rules: parseJsonArray(draft.claudeFailoverRules),
  };
}

function toGroupDraft(group: ApiKeyGroupView | null): GroupDraft {
  if (!group) {
    return emptyGroupDraft();
  }
  return {
    id: group.id,
    name: group.name,
    dailyBudgetUsd: String(group.daily_budget_usd || 0),
    weeklyBudgetUsd: String(group.weekly_budget_usd || 0),
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

function formatWindowRange(windowView: ApiKeyRecordSummaryView['daily_budget']) {
  if (!windowView.enabled || (!windowView.start_at && !windowView.end_at)) {
    return '未配置';
  }
  return `${formatDateTime(windowView.start_at)} - ${formatDateTime(windowView.end_at)}`;
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
  const [groups, setGroups] = useState<ApiKeyGroupView[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [detail, setDetail] = useState<ApiKeyRecordDetailView | null>(null);
  const [draft, setDraft] = useState<WorkbenchDraft>(emptyDraft);
  const [listLoading, setListLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<'reset' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalKey, setCreateModalKey] = useState('');
  const [createModalError, setCreateModalError] = useState('');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ApiKeyGroupView | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupDeletingId, setGroupDeletingId] = useState('');
  const [groupModalError, setGroupModalError] = useState('');
  const createModalInputId = useId();

  const selectedSummary = useMemo(
    () => items.find((item) => item.api_key === selectedKey) ?? detail?.summary ?? null,
    [detail?.summary, items, selectedKey]
  );
  const activeGroup = useMemo(
    () => groups.find((item) => item.id === draft.groupId) ?? detail?.group ?? null,
    [detail?.group, draft.groupId, groups]
  );
  const groupOptions = useMemo(
    () => [
      { value: '', label: '不绑定账户组' },
      ...groups.map((item) => ({
        value: item.id,
        label: `${item.name} · 日 $${item.daily_budget_usd} / 周 $${item.weekly_budget_usd}`,
      })),
    ],
    [groups]
  );
  const groupManagedBudget = Boolean(activeGroup);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const response = await apiKeyGroupsApi.list();
      setGroups(response);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '加载账户组失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setGroupsLoading(false);
    }
  }, [showNotification]);

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
            : (response[0]?.api_key ?? '');

        if (candidate) {
          void loadDetail(candidate, nextRange);
        } else {
          setSelectedKey('');
          setDetail(null);
          setDraft(emptyDraft());
        }
      } catch (requestError) {
        const message =
          requestError instanceof Error ? requestError.message : '加载 API Key 列表失败';
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

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useHeaderRefresh(() => {
    void loadList(selectedKey, range);
    void loadGroups();
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

  const updateDraft = useCallback(
    <K extends keyof WorkbenchDraft>(key: K, value: WorkbenchDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const updateGroupDraft = useCallback(
    <K extends keyof GroupDraft>(key: K, value: GroupDraft[K]) => {
      setGroupDraft((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const createNew = useCallback(() => {
    setCreateModalKey(generateSecureApiKey());
    setCreateModalError('');
    setCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setCreateModalOpen(false);
    setCreateModalKey('');
    setCreateModalError('');
  }, []);

  const handleGenerateCreateKey = useCallback(() => {
    setCreateModalKey(generateSecureApiKey());
    setCreateModalError('');
  }, []);

  const handleConfirmCreate = useCallback(() => {
    const trimmedKey = createModalKey.trim();
    if (!trimmedKey) {
      setCreateModalError('API Key 不能为空');
      return;
    }
    if (!isValidApiKeyCharset(trimmedKey)) {
      setCreateModalError('API Key 包含无效字符');
      return;
    }
    if (items.some((item) => item.api_key === trimmedKey)) {
      setCreateModalError('API Key 已存在');
      return;
    }

    setSelectedKey('');
    setDetail(null);
    setDraft({
      ...emptyDraft(),
      apiKey: trimmedKey,
    });
    setError('');
    closeCreateModal();
  }, [closeCreateModal, createModalKey, items]);

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

  const openCreateGroup = useCallback(() => {
    setEditingGroup(null);
    setGroupDraft(emptyGroupDraft());
    setGroupModalError('');
    setGroupModalOpen(true);
  }, []);

  const openEditGroup = useCallback((group: ApiKeyGroupView) => {
    setEditingGroup(group);
    setGroupDraft(toGroupDraft(group));
    setGroupModalError('');
    setGroupModalOpen(true);
  }, []);

  const closeGroupModal = useCallback(() => {
    setGroupModalOpen(false);
    setEditingGroup(null);
    setGroupDraft(emptyGroupDraft());
    setGroupModalError('');
  }, []);

  const handleSaveGroup = useCallback(async () => {
    const trimmedName = groupDraft.name.trim();
    if (!trimmedName) {
      setGroupModalError('账户组名称不能为空');
      return;
    }
    const payload = {
      id: groupDraft.id.trim(),
      name: trimmedName,
      daily_budget_usd: Number(groupDraft.dailyBudgetUsd || 0),
      weekly_budget_usd: Number(groupDraft.weeklyBudgetUsd || 0),
    };
    if (!Number.isFinite(payload.daily_budget_usd) || payload.daily_budget_usd < 0) {
      setGroupModalError('每日额度必须是大于等于 0 的数字');
      return;
    }
    if (!Number.isFinite(payload.weekly_budget_usd) || payload.weekly_budget_usd < 0) {
      setGroupModalError('每周额度必须是大于等于 0 的数字');
      return;
    }

    setGroupSaving(true);
    setGroupModalError('');
    try {
      if (editingGroup) {
        await apiKeyGroupsApi.update(editingGroup.id, payload);
        showNotification('账户组已更新', 'success');
      } else {
        await apiKeyGroupsApi.create(payload);
        showNotification('账户组已创建', 'success');
      }
      await loadGroups();
      closeGroupModal();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '保存账户组失败';
      setGroupModalError(message);
      showNotification(message, 'error');
    } finally {
      setGroupSaving(false);
    }
  }, [closeGroupModal, editingGroup, groupDraft, loadGroups, showNotification]);

  const handleDeleteGroup = useCallback(
    async (group: ApiKeyGroupView) => {
      if (group.is_system) {
        showNotification('系统账户组不允许删除', 'error');
        return;
      }
      if (!window.confirm(`确认删除账户组 ${group.name}？`)) return;
      setGroupDeletingId(group.id);
      try {
        await apiKeyGroupsApi.remove(group.id);
        if (draft.groupId === group.id) {
          updateDraft('groupId', '');
        }
        showNotification('账户组已删除', 'success');
        await loadGroups();
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : '删除账户组失败';
        showNotification(message, 'error');
      } finally {
        setGroupDeletingId('');
      }
    },
    [draft.groupId, loadGroups, showNotification, updateDraft]
  );

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
          <Button
            variant="secondary"
            onClick={() => void loadList(selectedKey, range)}
            loading={listLoading}
          >
            刷新
          </Button>
          <Button variant="secondary" onClick={createNew}>
            新建 Key
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <Modal
        open={createModalOpen}
        onClose={closeCreateModal}
        title="新建 API Key"
        footer={
          <>
            <Button variant="secondary" onClick={closeCreateModal}>
              取消
            </Button>
            <Button onClick={handleConfirmCreate}>继续配置</Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={createModalInputId}>API Key</label>
          <div className={styles.createModalInputRow}>
            <input
              id={createModalInputId}
              className="input"
              value={createModalKey}
              onChange={(event) => {
                setCreateModalKey(event.target.value);
                if (createModalError) setCreateModalError('');
              }}
              placeholder="输入或生成 API Key"
              aria-invalid={Boolean(createModalError)}
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleGenerateCreateKey}>
              生成
            </Button>
          </div>
          <div className="hint">
            已自动生成一个安全 API Key。你可以手动修改，或点击“生成”重新创建。
          </div>
          {createModalError && <div className="error-box">{createModalError}</div>}
        </div>
        <div className={styles.createModalHint}>
          确认后会进入右侧编辑态，只有点击页面上的“保存”才会真正创建并持久化。
        </div>
      </Modal>

      <Modal
        open={groupModalOpen}
        onClose={closeGroupModal}
        title={editingGroup ? '编辑账户组' : '新建账户组'}
        footer={
          <>
            <Button variant="secondary" onClick={closeGroupModal}>
              取消
            </Button>
            <Button onClick={handleSaveGroup} loading={groupSaving}>
              保存账户组
            </Button>
          </>
        }
      >
        <div className={styles.groupModalGrid}>
          <Input
            label="账户组 ID"
            value={groupDraft.id}
            onChange={(event) => updateGroupDraft('id', event.target.value)}
            placeholder={editingGroup ? editingGroup.id : '例如 dedicated-v2'}
            disabled={Boolean(editingGroup)}
            hint={editingGroup ? '已有账户组不允许修改 ID。' : '可留空，系统会基于名称自动生成。'}
          />
          <Input
            label="账户组名称"
            value={groupDraft.name}
            onChange={(event) => updateGroupDraft('name', event.target.value)}
            placeholder="例如 双人车"
          />
          <Input
            label="每日额度 USD"
            type="number"
            min="0"
            step="0.01"
            value={groupDraft.dailyBudgetUsd}
            onChange={(event) => updateGroupDraft('dailyBudgetUsd', event.target.value)}
          />
          <Input
            label="每周额度 USD"
            type="number"
            min="0"
            step="0.01"
            value={groupDraft.weeklyBudgetUsd}
            onChange={(event) => updateGroupDraft('weeklyBudgetUsd', event.target.value)}
          />
        </div>
        {groupModalError && <div className="error-box">{groupModalError}</div>}
      </Modal>

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

      <Card
        className={styles.groupCard}
        title="账户组"
        extra={
          <div className={styles.groupHeaderActions}>
            <span className={styles.listMeta}>
              {groupsLoading ? '加载中...' : `${groups.length} 组`}
            </span>
            <Button variant="secondary" onClick={() => void loadGroups()} loading={groupsLoading}>
              刷新账户组
            </Button>
            <Button variant="secondary" onClick={openCreateGroup}>
              新建账户组
            </Button>
          </div>
        }
      >
        {groups.length ? (
          <div className={styles.groupGrid}>
            {groups.map((group) => {
              const selected = draft.groupId === group.id || selectedSummary?.group_id === group.id;
              return (
                <div
                  key={group.id}
                  className={`${styles.groupItem} ${selected ? styles.groupItemActive : ''}`}
                >
                  <div className={styles.groupItemTop}>
                    <div>
                      <strong>{group.name}</strong>
                      <div className={styles.listItemMeta}>
                        ID: {group.id} · {group.member_count} 个 API Key
                      </div>
                    </div>
                    <div className={styles.groupItemBadges}>
                      {group.is_system && (
                        <span className={`${styles.badge} ${styles.badgeSafe}`}>系统组</span>
                      )}
                      {selected && (
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>当前绑定</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.groupBudgetRow}>
                    <span>日额度 {formatCost(group.daily_budget_usd)}</span>
                    <span>周额度 {formatCost(group.weekly_budget_usd)}</span>
                  </div>
                  <div className={styles.groupActions}>
                    <Button variant="secondary" size="sm" onClick={() => openEditGroup(group)}>
                      编辑
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateDraft('groupId', group.id)}
                      disabled={draft.groupId === group.id}
                    >
                      绑定到当前草稿
                    </Button>
                    {!group.is_system && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleDeleteGroup(group)}
                        loading={groupDeletingId === group.id}
                      >
                        删除
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            暂无账户组。创建后即可把多个 API Key 归到同一预算模板下。
          </div>
        )}
      </Card>

      <div className={styles.layout}>
        <Card
          className={styles.listCard}
          title="API Key 列表"
          extra={
            <span className={styles.listMeta}>
              {listLoading ? '加载中...' : `${items.length} 项`}
            </span>
          }
        >
          <div className={styles.listPane}>
            {items.length === 0 ? (
              <div className={styles.emptyState}>没有匹配的 API Key。</div>
            ) : (
              items.map((item) => {
                const dailyTone = budgetTone(
                  Math.max(
                    item.daily_budget.used_percent || 0,
                    item.weekly_budget.used_percent || 0
                  )
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
                          {item.registered ? '已注册' : '仅策略配置'} ·{' '}
                          {item.policy_family || 'default'}
                          {item.group_name ? ` · ${item.group_name}` : ''}
                        </div>
                      </div>
                      <span className={`${styles.badge} ${styles[`badge${dailyTone}`]}`}>
                        {formatPercent(
                          Math.max(
                            item.daily_budget.used_percent || 0,
                            item.weekly_budget.used_percent || 0
                          )
                        )}
                      </span>
                    </div>
                    <div className={styles.listMetrics}>
                      <span>{formatCost(item.today.cost_usd)} 今日</span>
                      <span>{formatCost(item.current_period.cost_usd)} 周期</span>
                      <span>{formatNumber(item.today.total_tokens)} tokens</span>
                    </div>
                    <div className={styles.listItemMeta}>
                      最近使用: {formatDateTime(item.last_used_at)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <div className={styles.detailColumn}>
          <Card
            className={styles.heroCard}
            title={selectedKey ? '策略编辑工作台' : '创建 API Key'}
            extra={
              <div className={styles.heroActions}>
                <Button
                  variant="secondary"
                  onClick={handleResetPolicy}
                  disabled={!selectedKey}
                  loading={busyAction === 'reset'}
                >
                  清空显式策略
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={!selectedKey}
                  loading={busyAction === 'delete'}
                >
                  删除
                </Button>
                <Button onClick={handleSave} loading={saving}>
                  保存
                </Button>
              </div>
            }
          >
            <div className={styles.editorLead}>
              <div>
                <span className={styles.sectionKicker}>
                  {selectedKey ? '当前编辑' : '创建草稿'}
                </span>
                <h3>{selectedSummary?.masked_api_key ?? draft.apiKey ?? '新 API Key'}</h3>
              </div>
              <div className={styles.editorLeadMeta}>
                <span>账户组：{activeGroup?.name ?? '未绑定'}</span>
                <span>最近使用：{formatDateTime(selectedSummary?.last_used_at)}</span>
              </div>
            </div>

            <div className={styles.heroMetrics}>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>今日费用</span>
                <strong>{formatCost(selectedSummary?.today.cost_usd)}</strong>
                <span className={styles.heroMetricHint}>最近 24 小时累计</span>
              </div>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>今日 Tokens</span>
                <strong>{formatNumber(selectedSummary?.today.total_tokens)}</strong>
                <span className={styles.heroMetricHint}>快速判断请求量是否异常</span>
              </div>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>当前周期费用</span>
                <strong>{formatCost(selectedSummary?.current_period.cost_usd)}</strong>
                <span className={styles.heroMetricHint}>
                  {selectedSummary ? formatWindowRange(selectedSummary.weekly_budget) : '未配置'}
                </span>
              </div>
              <div className={styles.heroMetric}>
                <span className={styles.metricLabel}>Token 包余额</span>
                <strong>
                  {selectedSummary
                    ? formatCost(selectedSummary.token_package.remaining_usd)
                    : '未配置'}
                </strong>
                <span className={styles.heroMetricHint}>
                  {selectedSummary?.token_package.started_at
                    ? `开始于 ${formatDateTime(selectedSummary.token_package.started_at)}`
                    : '预付流量包未启用'}
                </span>
              </div>
            </div>

            {!selectedKey && (
              <div className={styles.createHint}>
                点击“新建 Key”只会进入草稿态，填写完成后点击“保存”才会真正创建并持久化。
              </div>
            )}

            <div className={styles.editorSections}>
              <section className={styles.editorSection}>
                <div className={styles.editorSectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>基础信息</span>
                    <h4>身份、归属与上游入口</h4>
                  </div>
                  <p>先确认这把 key 自身是谁、归属哪个账户组，以及是否走单独的上游地址。</p>
                </div>

                <div className={styles.sectionGrid}>
                  <Input
                    label="API Key"
                    value={draft.apiKey}
                    onChange={(event) => updateDraft('apiKey', event.target.value)}
                    placeholder="输入 API Key"
                  />
                  <div className="form-group">
                    <label>账户组</label>
                    <Select
                      value={draft.groupId}
                      options={groupOptions}
                      onChange={(value) => updateDraft('groupId', value)}
                    />
                    <div className="hint">
                      {activeGroup
                        ? `当前组 ${activeGroup.name}：日额度 ${formatCost(activeGroup.daily_budget_usd)}，周额度 ${formatCost(activeGroup.weekly_budget_usd)}。`
                        : '未绑定账户组时，下面的日/周预算按 API Key 单独生效。'}
                    </div>
                  </div>
                  <Input
                    label="Upstream Base URL"
                    value={draft.upstreamBaseUrl}
                    onChange={(event) => updateDraft('upstreamBaseUrl', event.target.value)}
                    placeholder="可选"
                  />
                </div>
              </section>

              <section className={styles.editorSection}>
                <div className={styles.editorSectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>路由策略</span>
                    <h4>模型家族、回退目标与运行开关</h4>
                  </div>
                  <p>把模型映射和行为开关放在一起看，避免在不同区域来回切换判断。</p>
                </div>

                <div className={styles.sectionGrid}>
                  <div className="form-group">
                    <label>Claude 转 GPT 家族</label>
                    <Select
                      value={draft.claudeGptTargetFamily}
                      options={FAMILY_OPTIONS}
                      onChange={(value) => updateDraft('claudeGptTargetFamily', value)}
                    />
                  </div>
                  <Input
                    label="Claude Failover Target"
                    value={draft.claudeFailoverTarget}
                    onChange={(event) => updateDraft('claudeFailoverTarget', event.target.value)}
                    placeholder="例如 gpt-5.4(high)"
                  />
                </div>

                <div className={styles.toggleGrid}>
                  <div className={styles.toggleCard}>
                    <ToggleSwitch
                      checked={draft.fastMode}
                      onChange={(value) => updateDraft('fastMode', value)}
                      label="Fast Mode"
                    />
                    <p>优先使用更激进的路由路径，适合更看重速度的场景。</p>
                  </div>
                  <div className={styles.toggleCard}>
                    <ToggleSwitch
                      checked={draft.enableClaudeModels}
                      onChange={(value) => updateDraft('enableClaudeModels', value)}
                      label="允许 Claude 原生模型"
                    />
                    <p>开启后可直接命中 Claude 原生模型，而不是全部转为 GPT 家族。</p>
                  </div>
                  <div className={styles.toggleCard}>
                    <ToggleSwitch
                      checked={draft.enableClaudeOpus1M}
                      onChange={(value) => updateDraft('enableClaudeOpus1M', value)}
                      label="允许 Claude Opus 1M"
                    />
                    <p>按需开放高上下文版本，避免默认对所有 key 暴露高成本能力。</p>
                  </div>
                  <div className={styles.toggleCard}>
                    <ToggleSwitch
                      checked={draft.allowClaudeOpus46}
                      onChange={(value) => updateDraft('allowClaudeOpus46', value)}
                      label="允许 Claude Opus 4.6"
                    />
                    <p>独立控制 4.6 可用性，便于灰度和高成本模型限制。</p>
                  </div>
                  <div className={styles.toggleCard}>
                    <ToggleSwitch
                      checked={draft.claudeFailoverEnabled}
                      onChange={(value) => updateDraft('claudeFailoverEnabled', value)}
                      label="Claude Failover"
                    />
                    <p>请求失败时启用兜底路由，减少单模型异常对终端用户的影响。</p>
                  </div>
                </div>
              </section>

              <section className={styles.editorSection}>
                <div className={styles.editorSectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>预算与周期</span>
                    <h4>累计预算、日预算、周期预算与 Token 包</h4>
                  </div>
                  <p>把所有会影响费用控制的字段聚合在一个区块里，方便整体检查预算边界。</p>
                </div>

                {activeGroup && (
                  <div className={styles.groupBindingNote}>
                    <strong>账户组预算已接管基础额度</strong>
                    <span>
                      该 API Key 当前归属于 {activeGroup.name}
                      。请求会先消耗账户组的日/周基础额度，再在基础额度耗尽后消耗 Token 包。
                    </span>
                  </div>
                )}

                <div className={styles.sectionGrid}>
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
                    disabled={groupManagedBudget}
                    hint={
                      groupManagedBudget ? '已绑定账户组，基础日预算由账户组统一控制。' : undefined
                    }
                  />
                  <Input
                    label="每周期预算 USD"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.weeklyBudgetUsd}
                    onChange={(event) => updateDraft('weeklyBudgetUsd', event.target.value)}
                    disabled={groupManagedBudget}
                    hint={
                      groupManagedBudget ? '已绑定账户组，基础周预算由账户组统一控制。' : undefined
                    }
                  />
                  <Input
                    label="周期锚点"
                    type="datetime-local"
                    value={draft.weeklyBudgetAnchorAt}
                    step="3600"
                    onChange={(event) => updateDraft('weeklyBudgetAnchorAt', event.target.value)}
                    onBlur={(event) =>
                      updateDraft(
                        'weeklyBudgetAnchorAt',
                        normalizeHourInputValue(event.target.value) || getCurrentHourInputValue()
                      )
                    }
                    disabled={groupManagedBudget}
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
                </div>
              </section>

              <section className={styles.editorSection}>
                <div className={styles.editorSectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>高级规则</span>
                    <h4>限额、禁止模型与 JSON 规则</h4>
                  </div>
                  <p>把高复杂度配置放在最后，先完成基础策略，再补充精细化限制。</p>
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
              </section>
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
                          style={{
                            height: `${Math.max(8, (Number(item.cost_usd || 0) / maxCost) * 140)}px`,
                          }}
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
