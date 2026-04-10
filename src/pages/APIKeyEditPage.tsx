import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ApiKeyAnalytics } from '@/features/apiKeys/ApiKeyAnalytics';
import { ApiKeyHeroCard } from '@/features/apiKeys/ApiKeyHeroCard';
import { PolicyEditorSections } from '@/features/apiKeys/PolicyEditorSections';
import {
  emptyDraft,
  toDraft,
  toPolicyView,
  type PolicyDraft,
} from '@/features/apiKeys/policyDraft';
import apiStyles from '@/features/apiKeys/apiKeys.module.scss';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiKeyGroupsApi } from '@/services/api/apiKeyGroups';
import type { ApiKeyGroupView } from '@/services/api/apiKeyGroups';
import { apiKeyRecordsApi } from '@/services/api/apiKeyRecords';
import type {
  ApiKeyRecordDetailView,
  ApiKeyRecordMutation,
} from '@/services/api/apiKeyRecords';
import { useNotificationStore } from '@/stores';
import { isValidApiKeyCharset } from '@/utils/validation';

type EditMode = 'new' | 'edit';

/**
 * APIKeyEditPage is the routed policy editor. It handles two modes:
 *   - /api-keys/new?seed=<api-key>  → create flow, seeded from the modal
 *   - /api-keys/:apiKey              → edit existing key
 * When the caller lands on /api-keys/new without a seed, we redirect back
 * to the list so the user is forced through the NewApiKeyModal flow.
 */
export function APIKeyEditPage() {
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const params = useParams<{ apiKey?: string }>();
  const [searchParams] = useSearchParams();

  const routeApiKey = params.apiKey ? decodeURIComponent(params.apiKey) : '';
  const mode: EditMode = routeApiKey ? 'edit' : 'new';
  const seed = searchParams.get('seed') ?? '';

  const [draft, setDraft] = useState<PolicyDraft>(() => ({ ...emptyDraft(), apiKey: seed }));
  const [detail, setDetail] = useState<ApiKeyRecordDetailView | null>(null);
  const [groups, setGroups] = useState<ApiKeyGroupView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<'reset' | 'delete' | null>(null);
  const [error, setError] = useState('');

  const loadGroups = useCallback(async () => {
    try {
      setGroups(await apiKeyGroupsApi.list());
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载账户组失败';
      showNotification(message, 'error');
    }
  }, [showNotification]);

  const loadDetail = useCallback(async () => {
    if (!routeApiKey) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiKeyRecordsApi.get(routeApiKey, '14d', 100);
      setDetail(response);
      setDraft(toDraft(response.explicit_policy, response.summary.api_key));
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载 API Key 详情失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [routeApiKey, showNotification]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (mode === 'new') {
      if (!seed) {
        // Bare /api-keys/new with no seed → send the user back to the list,
        // which will open the create modal on demand.
        navigate('/api-keys', { replace: true });
        return;
      }
      if (!isValidApiKeyCharset(seed)) {
        showNotification('API Key 包含无效字符', 'error');
        navigate('/api-keys', { replace: true });
        return;
      }
      setDraft({ ...emptyDraft(), apiKey: seed });
      setDetail(null);
    } else {
      void loadDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, routeApiKey, seed]);

  useHeaderRefresh(() => {
    if (mode === 'edit') {
      void loadDetail();
    }
    void loadGroups();
  });

  const activeGroup = useMemo(() => {
    const target = draft.groupId || detail?.summary.group_id || '';
    return groups.find((group) => group.id === target) ?? detail?.group ?? null;
  }, [detail?.group, detail?.summary.group_id, draft.groupId, groups]);

  const updateDraft = useCallback(
    <K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    []
  );

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
    } catch (err) {
      const message = err instanceof Error ? err.message : '策略格式无效';
      setError(message);
      showNotification(message, 'error');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (mode === 'edit') {
        await apiKeyRecordsApi.update(routeApiKey, payload);
        showNotification('API Key 策略已保存', 'success');
        // If the user renamed the key, navigate to the new canonical url so
        // refresh buttons and deep links keep working.
        if (trimmedKey !== routeApiKey) {
          navigate(`/api-keys/${encodeURIComponent(trimmedKey)}`, { replace: true });
          return;
        }
        await loadDetail();
      } else {
        await apiKeyRecordsApi.create(payload);
        showNotification('新 API Key 已创建', 'success');
        navigate(`/api-keys/${encodeURIComponent(trimmedKey)}`, { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, loadDetail, mode, navigate, routeApiKey, showNotification]);

  const handleResetPolicy = useCallback(async () => {
    if (mode !== 'edit') return;
    setBusyAction('reset');
    setError('');
    try {
      await apiKeyRecordsApi.update(routeApiKey, {
        new_api_key: routeApiKey,
        clear_policy: true,
      });
      showNotification('显式策略已清空', 'success');
      await loadDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : '清空策略失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setBusyAction(null);
    }
  }, [loadDetail, mode, routeApiKey, showNotification]);

  const handleDelete = useCallback(async () => {
    if (mode !== 'edit') return;
    if (!window.confirm(`确认删除 ${routeApiKey}？`)) return;
    setBusyAction('delete');
    setError('');
    try {
      await apiKeyRecordsApi.remove(routeApiKey);
      showNotification('API Key 已删除', 'success');
      navigate('/api-keys', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setBusyAction(null);
    }
  }, [mode, navigate, routeApiKey, showNotification]);

  const heroActions = (
    <div className={apiStyles.heroActions}>
      <Button variant="secondary" onClick={() => navigate('/api-keys')}>
        返回列表
      </Button>
      <Button
        variant="secondary"
        onClick={handleResetPolicy}
        disabled={mode !== 'edit'}
        loading={busyAction === 'reset'}
      >
        清空显式策略
      </Button>
      <Button
        variant="danger"
        onClick={handleDelete}
        disabled={mode !== 'edit'}
        loading={busyAction === 'delete'}
      >
        删除
      </Button>
      <Button onClick={handleSave} loading={saving}>
        保存
      </Button>
    </div>
  );

  return (
    <div className={apiStyles.container}>
      <div className={apiStyles.pageHeader}>
        <div>
          <h1 className={apiStyles.pageTitle}>
            {mode === 'edit' ? '编辑 API Key' : '新建 API Key'}
          </h1>
          <p className={apiStyles.description}>
            {mode === 'edit'
              ? '修改策略后点击保存才会写入；离开页面不会自动保存。'
              : '填写完成后点击保存会真正创建该 API Key；放弃可直接返回列表。'}
          </p>
        </div>
      </div>

      {error && <div className={apiStyles.errorBox}>{error}</div>}

      <div className={apiStyles.detailColumn}>
        <ApiKeyHeroCard
          mode={mode}
          draft={draft}
          summary={detail?.summary ?? null}
          activeGroup={activeGroup}
          actions={heroActions}
        />

        {loading && mode === 'edit' ? (
          <div className={apiStyles.emptyState}>正在加载详情...</div>
        ) : (
          <PolicyEditorSections
            draft={draft}
            onDraftChange={updateDraft}
            groups={groups}
            activeGroup={activeGroup}
          />
        )}

        {mode === 'edit' && (
          <ApiKeyAnalytics
            summary={detail?.summary ?? null}
            detail={detail}
            detailLoading={loading}
          />
        )}
      </div>
    </div>
  );
}
