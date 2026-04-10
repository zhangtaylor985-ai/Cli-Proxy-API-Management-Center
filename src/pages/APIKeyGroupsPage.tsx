import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCost } from '@/features/apiKeys/policyDraft';
import apiStyles from '@/features/apiKeys/apiKeys.module.scss';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiKeyGroupsApi } from '@/services/api/apiKeyGroups';
import type { ApiKeyGroupView } from '@/services/api/apiKeyGroups';
import { useNotificationStore } from '@/stores';

type GroupDraft = {
  id: string;
  name: string;
  dailyBudgetUsd: string;
  weeklyBudgetUsd: string;
};

function emptyGroupDraft(): GroupDraft {
  return { id: '', name: '', dailyBudgetUsd: '', weeklyBudgetUsd: '' };
}

function toGroupDraft(group: ApiKeyGroupView | null): GroupDraft {
  if (!group) return emptyGroupDraft();
  return {
    id: group.id,
    name: group.name,
    dailyBudgetUsd: String(group.daily_budget_usd || 0),
    weeklyBudgetUsd: String(group.weekly_budget_usd || 0),
  };
}

/**
 * APIKeyGroupsPage extracts the account group management panel that used to
 * live inside the API keys workbench. Splitting it into a dedicated route
 * keeps the list page focused on per-key management and gives groups room
 * to grow their own UI later (e.g. member list, budget history).
 */
export function APIKeyGroupsPage() {
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();

  const [groups, setGroups] = useState<ApiKeyGroupView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKeyGroupView | null>(null);
  const [draft, setDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setGroups(await apiKeyGroupsApi.list());
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载账户组失败';
      setError(message);
      showNotification(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useHeaderRefresh(() => {
    void loadGroups();
  });

  const openCreate = useCallback(() => {
    setEditing(null);
    setDraft(emptyGroupDraft());
    setModalError('');
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((group: ApiKeyGroupView) => {
    setEditing(group);
    setDraft(toGroupDraft(group));
    setModalError('');
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditing(null);
    setDraft(emptyGroupDraft());
    setModalError('');
  }, []);

  const updateDraft = useCallback(
    <K extends keyof GroupDraft>(key: K, value: GroupDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setModalError('账户组名称不能为空');
      return;
    }
    const payload = {
      id: draft.id.trim(),
      name: trimmedName,
      daily_budget_usd: Number(draft.dailyBudgetUsd || 0),
      weekly_budget_usd: Number(draft.weeklyBudgetUsd || 0),
    };
    if (!Number.isFinite(payload.daily_budget_usd) || payload.daily_budget_usd < 0) {
      setModalError('每日额度必须是大于等于 0 的数字');
      return;
    }
    if (!Number.isFinite(payload.weekly_budget_usd) || payload.weekly_budget_usd < 0) {
      setModalError('每周额度必须是大于等于 0 的数字');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      if (editing) {
        await apiKeyGroupsApi.update(editing.id, payload);
        showNotification('账户组已更新', 'success');
      } else {
        await apiKeyGroupsApi.create(payload);
        showNotification('账户组已创建', 'success');
      }
      await loadGroups();
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存账户组失败';
      setModalError(message);
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [closeModal, draft, editing, loadGroups, showNotification]);

  const handleDelete = useCallback(
    async (group: ApiKeyGroupView) => {
      if (group.is_system) {
        showNotification('系统账户组不允许删除', 'error');
        return;
      }
      if (!window.confirm(`确认删除账户组 ${group.name}？`)) return;
      setDeletingId(group.id);
      try {
        await apiKeyGroupsApi.remove(group.id);
        showNotification('账户组已删除', 'success');
        await loadGroups();
      } catch (err) {
        const message = err instanceof Error ? err.message : '删除账户组失败';
        showNotification(message, 'error');
      } finally {
        setDeletingId('');
      }
    },
    [loadGroups, showNotification]
  );

  return (
    <div className={apiStyles.container}>
      <div className={apiStyles.pageHeader}>
        <div>
          <h1 className={apiStyles.pageTitle}>账户组管理</h1>
          <p className={apiStyles.description}>
            账户组用于把多把 API Key 归到同一预算模板下；组内成员会共享该组的日/周基础额度。
          </p>
        </div>
        <div className={apiStyles.headerActions}>
          <Button variant="secondary" onClick={() => navigate('/api-keys')}>
            返回 API Keys
          </Button>
          <Button variant="secondary" onClick={() => void loadGroups()} loading={loading}>
            刷新
          </Button>
          <Button onClick={openCreate}>新建账户组</Button>
        </div>
      </div>

      {error && <div className={apiStyles.errorBox}>{error}</div>}

      <Card
        className={apiStyles.groupCard}
        title="全部账户组"
        extra={
          <span className={apiStyles.listMeta}>
            {loading ? '加载中...' : `${groups.length} 组`}
          </span>
        }
      >
        {groups.length ? (
          <div className={apiStyles.groupGrid}>
            {groups.map((group) => (
              <div key={group.id} className={apiStyles.groupItem}>
                <div className={apiStyles.groupItemTop}>
                  <div>
                    <strong>{group.name}</strong>
                    <div className={apiStyles.listItemMeta}>
                      ID: {group.id} · {group.member_count} 个 API Key
                    </div>
                  </div>
                  <div className={apiStyles.groupItemBadges}>
                    {group.is_system && (
                      <span className={`${apiStyles.badge} ${apiStyles.badgeSafe}`}>系统组</span>
                    )}
                  </div>
                </div>
                <div className={apiStyles.groupBudgetRow}>
                  <span>日额度 {formatCost(group.daily_budget_usd)}</span>
                  <span>周额度 {formatCost(group.weekly_budget_usd)}</span>
                </div>
                <div className={apiStyles.groupActions}>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(group)}>
                    编辑
                  </Button>
                  {!group.is_system && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDelete(group)}
                      loading={deletingId === group.id}
                    >
                      删除
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={apiStyles.emptyState}>
            暂无账户组。创建后即可把多个 API Key 归到同一预算模板下。
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? '编辑账户组' : '新建账户组'}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              取消
            </Button>
            <Button onClick={handleSave} loading={saving}>
              保存账户组
            </Button>
          </>
        }
      >
        <div className={apiStyles.groupModalGrid}>
          <Input
            label="账户组 ID"
            value={draft.id}
            onChange={(event) => updateDraft('id', event.target.value)}
            placeholder={editing ? editing.id : '例如 dedicated-v2'}
            disabled={Boolean(editing)}
            hint={editing ? '已有账户组不允许修改 ID。' : '可留空，系统会基于名称自动生成。'}
          />
          <Input
            label="账户组名称"
            value={draft.name}
            onChange={(event) => updateDraft('name', event.target.value)}
            placeholder="例如 双人车"
          />
          <Input
            label="每日额度 USD"
            type="number"
            min="0"
            step="0.01"
            value={draft.dailyBudgetUsd}
            onChange={(event) => updateDraft('dailyBudgetUsd', event.target.value)}
          />
          <Input
            label="每周额度 USD"
            type="number"
            min="0"
            step="0.01"
            value={draft.weeklyBudgetUsd}
            onChange={(event) => updateDraft('weeklyBudgetUsd', event.target.value)}
          />
        </div>
        {modalError && <div className="error-box">{modalError}</div>}
      </Modal>
    </div>
  );
}
