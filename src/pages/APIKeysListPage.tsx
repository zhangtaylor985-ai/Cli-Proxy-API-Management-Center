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
} from '@/services/api/apiKeyRecords';
import { useNotificationStore } from '@/stores';

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

  const [items, setItems] = useState<ApiKeyRecordSummaryLiteView[]>([]);
  const [stats, setStats] = useState<Record<string, ApiKeyRecordStatsItem>>({});
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
      if (keys.length === 0) return;
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
    [range, showNotification]
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
    if (items.length === 0) return;
    void loadStats(items.map((item) => item.api_key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, range]);

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

  const renderListCard = (item: ApiKeyRecordSummaryLiteView) => {
    const statItem = stats[item.api_key];
    const dailyPercent = statItem?.daily_budget.used_percent ?? 0;
    const weeklyPercent = statItem?.weekly_budget.used_percent ?? 0;
    const highestPercent = Math.max(dailyPercent, weeklyPercent);
    const tone = budgetTone(highestPercent);
    const expired = item.expired || isExpired(item.expires_at);

    return (
      <button
        type="button"
        key={item.api_key}
        className={apiStyles.listItem}
        onClick={() => navigate(`/api-keys/${encodeURIComponent(item.api_key)}`)}
      >
        <div className={apiStyles.listItemTop}>
          <div>
            <strong>{item.masked_api_key}</strong>
            <div className={apiStyles.listItemMeta}>
              {item.registered ? '已注册' : '仅策略配置'} · {item.policy_family || 'default'}
              {item.group_name ? ` · ${item.group_name}` : ''}
            </div>
          </div>
          <div className={apiStyles.groupItemBadges}>
            {item.disabled && <span className={`${apiStyles.badge} ${apiStyles.badgeDanger}`}>已禁用</span>}
            {!item.disabled && expired && (
              <span className={`${apiStyles.badge} ${apiStyles.badgeDanger}`}>已过期</span>
            )}
            {statItem ? (
              <span className={`${apiStyles.badge} ${apiStyles[`badge${tone}`]}`}>
                {formatPercent(highestPercent)}
              </span>
            ) : (
              <span className={`${apiStyles.badge} ${apiStyles.badgeSafe}`}>
                <span className={listStyles.skeleton} style={{ width: 24 }} />
              </span>
            )}
          </div>
        </div>
        <div className={apiStyles.listMetrics}>
          <span>
            {statItem ? (
              `${formatCost(statItem.today.cost_usd)} 今日`
            ) : (
              <>
                <span className={listStyles.skeleton} /> 今日
              </>
            )}
          </span>
          <span>
            {statItem ? (
              `${formatCost(statItem.current_period.cost_usd)} 周期`
            ) : (
              <>
                <span className={listStyles.skeleton} /> 周期
              </>
            )}
          </span>
          <span>
            {statItem ? (
              `${formatNumber(statItem.today.total_tokens)} tokens`
            ) : (
              <>
                <span className={listStyles.skeleton} /> tokens
              </>
            )}
          </span>
        </div>
        <div className={apiStyles.listItemMeta}>
          创建于: {formatDateTime(item.created_at)} · 到期: {formatDateTime(item.expires_at)}
        </div>
        <div className={apiStyles.listItemMeta}>最近使用: {formatDateTime(item.last_used_at)}</div>
      </button>
    );
  };

  return (
    <div className={apiStyles.container}>
      <div className={apiStyles.pageHeader}>
        <div>
          <h1 className={apiStyles.pageTitle}>API Keys 管理</h1>
          <p className={apiStyles.description}>
            分页查看每个 API Key 的当前策略与预算占用；新建 / 编辑均会进入独立的详情页，移动端也能完整使用。
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
          <Select value={range} options={RANGE_OPTIONS} onChange={setRange} fullWidth={false} />
          <Button variant="secondary" onClick={() => void loadList()} loading={listLoading}>
            刷新
          </Button>
          <Button variant="secondary" onClick={() => navigate('/api-keys/groups')}>
            账户组
          </Button>
          <Button onClick={openCreateModal}>新建 Key</Button>
        </div>
      </div>

      {error && <div className={apiStyles.errorBox}>{error}</div>}

      <Card
        title="筛选与排序"
        extra={
          <span className={apiStyles.listMeta}>
            {listLoading ? '加载中...' : `共 ${pagination.total} 项`}
            {statsLoading ? ' · 费用统计加载中...' : ''}
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
          <div className={listStyles.cardGrid}>{items.map(renderListCard)}</div>
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
