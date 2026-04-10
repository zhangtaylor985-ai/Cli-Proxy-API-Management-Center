import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import type {
  ApiKeyGroupView,
} from '@/services/api/apiKeyGroups';
import type {
  ApiKeyRecordSummaryView,
} from '@/services/api/apiKeyRecords';
import {
  formatCost,
  formatDateTime,
  formatNumber,
  isExpired,
  type PolicyDraft,
} from './policyDraft';
import styles from './apiKeys.module.scss';

export type ApiKeyHeroCardProps = {
  mode: 'new' | 'edit';
  draft: PolicyDraft;
  summary: ApiKeyRecordSummaryView | null;
  activeGroup: ApiKeyGroupView | null;
  actions?: ReactNode;
};

function formatWindowRange(windowView: ApiKeyRecordSummaryView['daily_budget']) {
  if (!windowView.enabled || (!windowView.start_at && !windowView.end_at)) {
    return '未配置';
  }
  return `${formatDateTime(windowView.start_at)} - ${formatDateTime(windowView.end_at)}`;
}

/**
 * ApiKeyHeroCard renders the hero (title + metrics) region on the edit page.
 * It mirrors the layout previously embedded in APIKeysWorkbenchPage, so the
 * visual language is identical to the legacy workbench.
 */
export function ApiKeyHeroCard({ mode, draft, summary, activeGroup, actions }: ApiKeyHeroCardProps) {
  return (
    <Card className={styles.heroCard} title={mode === 'edit' ? '策略编辑工作台' : '创建 API Key'} extra={actions}>
      <div className={styles.editorLead}>
        <div>
          <span className={styles.sectionKicker}>
            {mode === 'edit' ? '当前编辑' : '创建草稿'}
          </span>
          <h3>{summary?.masked_api_key ?? draft.apiKey ?? '新 API Key'}</h3>
        </div>
        <div className={styles.editorLeadMeta}>
          <span>创建时间：{formatDateTime(summary?.created_at || draft.createdAt)}</span>
          <span>过期时间：{formatDateTime(summary?.expires_at || draft.expiresAt)}</span>
          <span>
            状态：
            {draft.disabled
              ? '已禁用'
              : isExpired(summary?.expires_at || draft.expiresAt)
                ? '已过期'
                : '可用'}
          </span>
          <span>账户组：{activeGroup?.name ?? '未绑定'}</span>
          <span>最近使用：{formatDateTime(summary?.last_used_at)}</span>
        </div>
      </div>

      <div className={styles.heroMetrics}>
        <div className={styles.heroMetric}>
          <span className={styles.metricLabel}>今日费用</span>
          <strong>{formatCost(summary?.today.cost_usd)}</strong>
          <span className={styles.heroMetricHint}>最近 24 小时累计</span>
        </div>
        <div className={styles.heroMetric}>
          <span className={styles.metricLabel}>今日 Tokens</span>
          <strong>{formatNumber(summary?.today.total_tokens)}</strong>
          <span className={styles.heroMetricHint}>快速判断请求量是否异常</span>
        </div>
        <div className={styles.heroMetric}>
          <span className={styles.metricLabel}>当前周期费用</span>
          <strong>{formatCost(summary?.current_period.cost_usd)}</strong>
          <span className={styles.heroMetricHint}>
            {summary ? formatWindowRange(summary.weekly_budget) : '未配置'}
          </span>
        </div>
        <div className={styles.heroMetric}>
          <span className={styles.metricLabel}>Token 包余额</span>
          <strong>
            {summary ? formatCost(summary.token_package.remaining_usd) : '未配置'}
          </strong>
          <span className={styles.heroMetricHint}>
            {summary?.token_package.started_at
              ? `开始于 ${formatDateTime(summary.token_package.started_at)}`
              : '预付流量包未启用'}
          </span>
        </div>
      </div>

      {mode === 'new' && (
        <div className={styles.createHint}>
          点击“新建 Key”只会进入草稿态，填写完成后点击“保存”才会真正创建并持久化。
        </div>
      )}
    </Card>
  );
}
