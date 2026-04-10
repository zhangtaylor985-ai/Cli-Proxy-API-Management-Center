import { Card } from '@/components/ui/Card';
import type {
  ApiKeyDailyLimitView,
  ApiKeyEventView,
  ApiKeyRecordDetailView,
  ApiKeyRecordSummaryView,
} from '@/services/api/apiKeyRecords';
import {
  budgetTone,
  formatCost,
  formatDateTime,
  formatNumber,
  formatPercent,
} from './policyDraft';
import styles from './apiKeys.module.scss';

export type ApiKeyAnalyticsProps = {
  summary: ApiKeyRecordSummaryView | null;
  detail: ApiKeyRecordDetailView | null;
  detailLoading: boolean;
};

function renderWindow(windowView: ApiKeyRecordSummaryView['daily_budget']) {
  if (!windowView.enabled) return '未配置';
  return `${formatCost(windowView.used_usd)} / ${formatCost(windowView.limit_usd)}`;
}

function DailyLimitBar({ item }: { item: ApiKeyDailyLimitView }) {
  const usedPercent = item.limit > 0 ? Math.min(100, (item.used / item.limit) * 100) : 0;
  const tone = budgetTone(usedPercent);
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
          className={`${styles.progressFill} ${styles[`tone${tone}`]}`}
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

/**
 * ApiKeyAnalytics renders the budget/trend/model/events blocks that were
 * previously inlined under the workbench editor. It is read-only.
 */
export function ApiKeyAnalytics({ summary, detail, detailLoading }: ApiKeyAnalyticsProps) {
  const trendDays = detail?.recent_days ?? [];
  const maxCost = Math.max(...trendDays.map((item) => Number(item.cost_usd || 0)), 0.0001);

  return (
    <>
      <div className={styles.analyticsGrid}>
        <Card className={styles.analyticsCard} title="预算与限额">
          {summary ? (
            <div className={styles.windowGrid}>
              <div className={styles.windowCard}>
                <span className={styles.metricLabel}>每日预算</span>
                <strong>{renderWindow(summary.daily_budget)}</strong>
                <span className={styles.metricHint}>
                  占用 {formatPercent(summary.daily_budget.used_percent)}
                </span>
              </div>
              <div className={styles.windowCard}>
                <span className={styles.metricLabel}>当前周期预算</span>
                <strong>{renderWindow(summary.weekly_budget)}</strong>
                <span className={styles.metricHint}>
                  占用 {formatPercent(summary.weekly_budget.used_percent)}
                </span>
              </div>
              <div className={styles.windowCard}>
                <span className={styles.metricLabel}>Token 包</span>
                <strong>
                  {summary.token_package.enabled
                    ? formatCost(summary.token_package.remaining_usd)
                    : '未配置'}
                </strong>
                <span className={styles.metricHint}>
                  {summary.token_package.enabled
                    ? `已用 ${formatCost(summary.token_package.used_usd)}`
                    : '预付流量包未启用'}
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>暂无预算数据。</div>
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
    </>
  );
}
