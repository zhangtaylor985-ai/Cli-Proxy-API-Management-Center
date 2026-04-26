import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { NewApiKeyModal } from '@/features/apiKeys/NewApiKeyModal';
import {
  RANGE_OPTIONS,
  budgetTone,
  formatCost,
  formatDateTime,
  formatNumber,
  formatPercent,
  isExpired,
} from '@/features/apiKeys/policyDraft';
import apiStyles from '@/features/apiKeys/apiKeys.module.scss';
import listStyles from './APIKeysListPage.module.scss';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiKeyGroupsApi } from '@/services/api/apiKeyGroups';
import type { ApiKeyGroupView } from '@/services/api/apiKeyGroups';
import { apiKeyRecordsApi } from '@/services/api/apiKeyRecords';
import type {
  ApiKeyRecordListParams,
  ApiKeyRecordStatsItem,
  ApiKeyRecordSummaryLiteView,
  ApiKeyOwnershipStatsView,
} from '@/services/api/apiKeyRecords';
import { useAuthStore, useNotificationStore } from '@/stores';

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '可用' },
  { value: 'disabled', label: '已禁用' },
  { value: 'expired', label: '已过期' },
];

const SORT_OPTIONS = [
  { value: 'last_used', label: '最近使用' },
  { value: 'created', label: '创建时间' },
  { value: 'expires', label: '过期时间' },
  { value: 'api_key', label: 'API Key' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type StatusValue = 'all' | 'active' | 'disabled' | 'expired';
type SortValue = 'last_used' | 'created' | 'expires' | 'api_key';

/**
 * APIKeysListPage is the paginated list that replaces the previous monolithic
 * "API Keys 工作台". It loads a lightweight page of summaries from the backend
 * and then lazy-fetches expensive per-key stats via POST /api-key-records/stats.
 */
export function APIKeysListPage() {
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const role = useAuthStore((state) => state.role);
  const isStaff = role === 'staff';

  const [items, setItems] = useState<ApiKeyRecordSummaryLiteView[]>([]);
  const [stats, setStats] = useState<Record<string, ApiKeyRecordStatsItem>>({});
  const [ownershipStats, setOwnershipStats] = useState<ApiKeyOwnershipStatsView>({
    admin_total: 0,
    owners: [],
  });
  const [groups, setGroups] = useState<ApiKeyGroupView[]>([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total: 0, total_pages: 0 });

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<StatusValue>('all');
  const [groupId, setGroupId] = useState('');
  const [sort, setSort] = useState<SortValue>('last_used');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [range, setRange] = useState('14d');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [listLoading, setListLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(
    async (overrides: Partial<ApiKeyRecordListParams> = {}) => {
      setListLoading(true);
      setError('');
      const params: ApiKeyRecordListParams = {
        page,
        pageSize,
        search,
        status,
        groupId,
        sort,
        order,
        ...overrides,
      };
      try {
        const response = await apiKeyRecordsApi.list(params);
        setItems(response.items);
        setPagination(response.pagination);
        setOwnershipStats(response.ownership_stats);
        // Reset stats so old figures never leak into new rows after a filter
        // change; stats for the new page will be re-fetched right after.
        setStats({});
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : '加载 API Key 列表失败';
        setError(message);
        showNotification(message, 'error');
        return null;
      } finally {
        setListLoading(false);
      }
    },
    [groupId, order, page, pageSize, search, showNotification, sort, status]
  );

  const loadStats = useCallback(
    async (keys: string[]) => {
      if (isStaff || keys.length === 0) return;
      setStatsLoading(true);
      try {
        const fetched = await apiKeyRecordsApi.stats(keys, range);
        setStats((current) => {
          const next = { ...current };
          for (const item of fetched) {
            next[item.api_key] = item;
          }
          return next;
        });
      } catch (err) {
        // Stats are a progressive enhancement; surface the error softly.
        const message = err instanceof Error ? err.message : '加载 API Key 费用统计失败';
        showNotification(message, 'warning');
      } finally {
        setStatsLoading(false);
      }
    },
    [isStaff, range, showNotification]
  );

  const loadGroups = useCallback(async () => {
    try {
      const response = await apiKeyGroupsApi.list();
      setGroups(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载账户组失败';
      showNotification(message, 'error');
    }
  }, [showNotification]);

  // Load the list whenever the filter/sort/pagination tuple changes. Range
  // changes re-fetch stats only (below) because it does not affect the list
  // body contents.
  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, status, groupId, sort, order, search]);

  // Load stats for whatever page the list just returned.
  useEffect(() => {
    if (isStaff || items.length === 0) return;
    void loadStats(items.map((item) => item.api_key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, items, range]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useHeaderRefresh(() => {
    void loadList();
    void loadGroups();
  });

  const groupFilterOptions = useMemo(
    () => [
      { value: '', label: '全部账户组' },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups]
  );

  const openCreateModal = useCallback(() => setCreateModalOpen(true), []);
  const closeCreateModal = useCallback(() => setCreateModalOpen(false), []);
  const handleConfirmCreate = useCallback(
    (apiKey: string) => {
      setCreateModalOpen(false);
      navigate(`/api-keys/new?seed=${encodeURIComponent(apiKey)}`);
    },
    [navigate]
  );

  const handleSearchSubmit = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const handleStatusChange = useCallback((value: string) => {
    setStatus(value as StatusValue);
    setPage(1);
  }, []);
  const handleGroupFilterChange = useCallback((value: string) => {
    setGroupId(value);
    setPage(1);
  }, []);
  const handleSortChange = useCallback((value: string) => {
    setSort(value as SortValue);
    setPage(1);
  }, []);
  const handleOrderToggle = useCallback(() => {
    setOrder((current) => (current === 'desc' ? 'asc' : 'desc'));
    setPage(1);
  }, []);
  const handlePageSizeChange = useCallback((value: string) => {
    const next = Number(value) || 20;
    setPageSize(next);
    setPage(1);
  }, []);
  const gotoPage = useCallback((target: number) => {
    setPage(Math.max(1, target));
  }, []);

  const pageNumbers = useMemo(() => buildPageNumbers(pagination.page, pagination.total_pages), [
    pagination.page,
    pagination.total_pages,
  ]);
  const visibleStaffOwners = useMemo(
    () => ownershipStats.owners.filter((owner) => owner.role === 'staff'),
    [ownershipStats.owners]
  );
  const myOwnerTotal = useMemo(
    () => visibleStaffOwners.reduce((sum, owner) => sum + owner.count, 0),
    [visibleStaffOwners]
  );

  const renderListRow = (item: ApiKeyRecordSummaryLiteView) => {
    const statItem = stats[item.api_key];
    const dailyPercent = statItem?.daily_budget.used_percent ?? 0;
    const weeklyPercent = statItem?.weekly_budget.used_percent ?? 0;
    const highestPercent = Math.max(dailyPercent, weeklyPercent);
    const tone = budgetTone(highestPercent);
    const expired = item.expired || isExpired(item.expires_at);
    const ownerLabel = formatOwnerLabel(item.owner_username, item.owner_role);

    return (
      <button
        type="button"
        key={item.api_key}
        className={listStyles.keyRow}
        onClick={() => navigate(`/api-keys/${encodeURIComponent(item.api_key)}`)}
      >
        <div className={listStyles.keyCellPrimary}>
          <strong>{item.masked_api_key}</strong>
          <span>
            {item.name || item.note
              ? [item.name ? `名称：${item.name}` : '', item.note ? `备注：${item.note}` : '']
                  .filter(Boolean)
                  .join(' · ')
              : item.registered
                ? '已注册'
                : '仅策略配置'}
          </span>
        </div>
        <div className={listStyles.keyCell}>
          <span className={listStyles.ownerName}>{ownerLabel}</span>
          <span className={listStyles.cellHint}>{item.owner_role === 'staff' ? '普通管理员' : 'Admin'}</span>
        </div>
        <div className={listStyles.keyCell}>
          <span>{item.group_name || '未绑定'}</span>
          <span className={listStyles.cellHint}>{item.policy_family || 'default'}</span>
        </div>
        <div className={listStyles.keyCell}>
          <span>{formatDateTime(item.created_at)}</span>
          <span className={listStyles.cellHint}>到期：{formatDateTime(item.expires_at)}</span>
        </div>
        <div className={listStyles.keyCell}>
          <span>{formatDateTime(item.last_used_at)}</span>
          {!isStaff && statItem ? (
            <span className={listStyles.cellHint}>
              今日 {formatCost(statItem.today.cost_usd)} · {formatNumber(statItem.today.total_tokens)} tokens
            </span>
          ) : !isStaff ? (
            <span className={listStyles.cellHint}>
              <span className={listStyles.skeleton} /> 统计加载中
            </span>
          ) : (
            <span className={listStyles.cellHint}>策略视图</span>
          )}
        </div>
        <div className={listStyles.statusCell}>
          <div className={apiStyles.groupItemBadges}>
            {item.disabled && <span className={`${apiStyles.badge} ${apiStyles.badgeDanger}`}>已禁用</span>}
            {!item.disabled && expired && (
              <span className={`${apiStyles.badge} ${apiStyles.badgeDanger}`}>已过期</span>
            )}
            {!isStaff && statItem ? (
              <span className={`${apiStyles.badge} ${apiStyles[`badge${tone}`]}`}>
                {formatPercent(highestPercent)}
              </span>
            ) : !isStaff ? (
              <span className={`${apiStyles.badge} ${apiStyles.badgeSafe}`}>
                <span className={listStyles.skeleton} style={{ width: 24 }} />
              </span>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className={apiStyles.container}>
      <div className={apiStyles.pageHeader}>
        <div>
          <h1 className={apiStyles.pageTitle}>API Keys 管理</h1>
          <p className={apiStyles.description}>
            {isStaff
              ? '普通管理员只能查看和维护自己创建的 API Keys；Admin 创建的 key 和其他普通管理员的 key 不会显示。'
              : 'Admin 可查看全部 API Keys，并按归属人快速判断每位管理员名下的 key 数量。'}
          </p>
        </div>
        <div className={listStyles.headerActions}>
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearchSubmit();
            }}
            placeholder="搜索 API Key"
          />
          {!isStaff && (
            <Select value={range} options={RANGE_OPTIONS} onChange={setRange} fullWidth={false} />
          )}
          <Button variant="secondary" onClick={() => void loadList()} loading={listLoading}>
            刷新
          </Button>
          {!isStaff && (
            <Button variant="secondary" onClick={() => navigate('/api-keys/groups')}>
              账户组
            </Button>
          )}
          <Button onClick={openCreateModal}>新建 Key</Button>
        </div>
      </div>

      {error && <div className={apiStyles.errorBox}>{error}</div>}

      <div className={listStyles.ownerStats}>
        <div className={listStyles.ownerStatLead}>
          <span>{isStaff ? '我的 Keys' : 'Admin 拥有'}</span>
          <strong>{isStaff ? myOwnerTotal : ownershipStats.admin_total}</strong>
        </div>
        <div className={listStyles.ownerStatChips}>
          {visibleStaffOwners
            .map((owner) => (
              <span key={`${owner.role}:${owner.username}`} className={listStyles.ownerChip}>
                {formatOwnerLabel(owner.username, owner.role)}
                <strong>{owner.count}</strong>
              </span>
            ))}
          {!isStaff && visibleStaffOwners.length === 0 && (
            <span className={listStyles.ownerChipMuted}>暂无普通管理员 Keys</span>
          )}
        </div>
      </div>

      <Card
        title="筛选与排序"
        extra={
          <span className={apiStyles.listMeta}>
            {listLoading ? '加载中...' : `共 ${pagination.total} 项`}
            {!isStaff && statsLoading ? ' · 费用统计加载中...' : ''}
          </span>
        }
      >
        <div className={listStyles.filterBar}>
          <div className="form-group">
            <label>状态</label>
            <Select value={status} options={STATUS_OPTIONS} onChange={handleStatusChange} />
          </div>
          <div className="form-group">
            <label>账户组</label>
            <Select value={groupId} options={groupFilterOptions} onChange={handleGroupFilterChange} />
          </div>
          <div className="form-group">
            <label>排序</label>
            <div className={listStyles.sortControls}>
              <Select value={sort} options={SORT_OPTIONS} onChange={handleSortChange} />
              <Button
                variant="secondary"
                onClick={handleOrderToggle}
                className={listStyles.orderButton}
              >
                {order === 'desc' ? '降序' : '升序'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {listLoading && items.length === 0 ? (
          <div className={listStyles.emptyList}>正在加载...</div>
        ) : items.length === 0 ? (
          <div className={listStyles.emptyList}>没有匹配的 API Key。</div>
        ) : (
          <div className={listStyles.keyTable}>
            <div className={listStyles.keyTableHeader}>
              <span>API Key</span>
              <span>归属</span>
              <span>账户组 / 策略</span>
              <span>创建 / 到期</span>
              <span>最近使用</span>
              <span>状态</span>
            </div>
            {items.map(renderListRow)}
          </div>
        )}

        {pagination.total > 0 && (
          <div className={listStyles.pagination}>
            <div className={listStyles.paginationInfo}>
              <span>
                第 {pagination.page} / {Math.max(1, pagination.total_pages)} 页 · 共 {pagination.total} 项
              </span>
              <span className={listStyles.pageSizeLabel}>每页</span>
              <div className={listStyles.pageSizeSelect}>
                <Select
                  value={String(pageSize)}
                  options={PAGE_SIZE_OPTIONS.map((value) => ({
                    value: String(value),
                    label: `${value} 条`,
                  }))}
                  onChange={handlePageSizeChange}
                />
              </div>
            </div>
            <div className={listStyles.pageButtons}>
              <button
                type="button"
                className={listStyles.pageButton}
                disabled={pagination.page <= 1}
                onClick={() => gotoPage(pagination.page - 1)}
              >
                上一页
              </button>
              {pageNumbers.map((entry, index) =>
                entry === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className={listStyles.pageSizeLabel}>
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    className={`${listStyles.pageButton} ${
                      entry === pagination.page ? listStyles.pageButtonActive : ''
                    }`}
                    onClick={() => gotoPage(entry)}
                  >
                    {entry}
                  </button>
                )
              )}
              <button
                type="button"
                className={listStyles.pageButton}
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => gotoPage(pagination.page + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </Card>

      <NewApiKeyModal
        open={createModalOpen}
        onClose={closeCreateModal}
        onConfirm={handleConfirmCreate}
        existingKeys={items.map((item) => item.api_key)}
      />
    </div>
  );
}

function buildPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 1) return [1];
  if (total <= 7) {
    const result: number[] = [];
    for (let i = 1; i <= total; i++) result.push(i);
    return result;
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);
  if (windowStart > 2) pages.push('ellipsis');
  for (let i = windowStart; i <= windowEnd; i++) pages.push(i);
  if (windowEnd < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

function formatOwnerLabel(username?: string, role?: string): string {
  const name = String(username || '').trim() || 'legacy_admin';
  return role === 'staff' ? name : `Admin · ${name}`;
}
