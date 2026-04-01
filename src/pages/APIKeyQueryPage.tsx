import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { queryApiKeyInsights } from '@/services/api/apiKeyRecords';
import type { ApiKeyRecordDetailView } from '@/services/api/apiKeyRecords';
import { detectPublicApiBaseFromLocation } from '@/utils/connection';
import styles from './APIKeyQueryPage.module.scss';

const RANGE_OPTIONS = [
  { value: '7d', label: '近 7 天' },
  { value: '14d', label: '近 14 天' },
  { value: '30d', label: '近 30 天' },
];

function parseKeys(source: string): string[] {
  return Array.from(
    new Set(
      source
        .split(/[\n,]/g)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function formatNumber(value: number | undefined | null): string {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

function formatCost(value: number | undefined | null): string {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatDateTime(value?: string): string {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatPeriodDateTime(value?: string): string {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPeriodWindow(startAt?: string, endAt?: string): string {
  const start = formatPeriodDateTime(startAt);
  const end = formatPeriodDateTime(endAt);
  if (start === '暂无' && end === '暂无') return '暂无';
  return `${start} - ${end}`;
}

export function APIKeyQueryPage() {
  const [apiBase] = useState(() => detectPublicApiBaseFromLocation());
  const [keysText, setKeysText] = useState('');
  const [range, setRange] = useState('14d');
  const [items, setItems] = useState<ApiKeyRecordDetailView[]>([]);
  const [invalidKeys, setInvalidKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.todayCost += Number(item.summary.today.cost_usd || 0);
        acc.periodCost += Number(item.summary.current_period.cost_usd || 0);
        acc.tokens += Number(item.summary.today.total_tokens || 0);
        return acc;
      },
      { todayCost: 0, periodCost: 0, tokens: 0 }
    );
  }, [items]);

  const handleQuery = async () => {
    const apiKeys = parseKeys(keysText);
    if (!apiKeys.length) {
      setError('请至少输入一个 API Key');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await queryApiKeyInsights(apiBase, {
        api_keys: apiKeys,
        range,
      });
      setItems(response.items || []);
      setInvalidKeys(response.invalid_keys || []);
      if (!response.items?.length && response.invalid_keys?.length) {
        setError(`未找到有效 API Key: ${response.invalid_keys.join(', ')}`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '查询失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.hero}>
          <div className={styles.heroBody}>
            <div className={styles.heroCopy}>
              <span className={styles.kicker}>Usage & Billing Portal</span>
              <h1>用量与账单查询</h1>
              <p>
                输入你的访问密钥，查看今日费用、当前周期进度、预付余额和每日费用趋势。支持同时查询多个密钥。
              </p>
            </div>
            <Card className={styles.queryCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>查询账单概览</h2>
                  <p>每行输入一个访问密钥，也支持一次查询多个项目。</p>
                </div>
                <div className={styles.rangeField}>
                  <span>统计范围</span>
                  <Select
                    value={range}
                    options={RANGE_OPTIONS}
                    onChange={setRange}
                    fullWidth={false}
                  />
                </div>
              </div>
              <label className={styles.textAreaField}>
                <span>访问密钥</span>
                <textarea
                  value={keysText}
                  onChange={(event) => setKeysText(event.target.value)}
                  placeholder={'alpha-live-key-001\nbeta-growth-key-002'}
                />
              </label>
              <div className={styles.inputHint}>
                建议每行输入一个密钥，系统会自动去重并合并展示结果。
              </div>
              <div className={styles.queryActions}>
                <Button onClick={handleQuery} loading={loading}>
                  查询账单
                </Button>
              </div>
              {error && <div className={styles.errorBox}>{error}</div>}
              {!error && invalidKeys.length > 0 && (
                <div className={styles.noticeBox}>未识别的密钥: {invalidKeys.join(', ')}</div>
              )}
            </Card>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <Card className={styles.summaryCard}>
            <span className={styles.metricLabel}>已找到密钥</span>
            <strong className={styles.metricValue}>{formatNumber(items.length)}</strong>
          </Card>
          <Card className={styles.summaryCard}>
            <span className={styles.metricLabel}>未识别密钥</span>
            <strong className={styles.metricValue}>{formatNumber(invalidKeys.length)}</strong>
          </Card>
          <Card className={styles.summaryCard}>
            <span className={styles.metricLabel}>今日费用</span>
            <strong className={styles.metricValue}>{formatCost(totals.todayCost)}</strong>
          </Card>
          <Card className={styles.summaryCard}>
            <span className={styles.metricLabel}>今日总量</span>
            <strong className={styles.metricValue}>{formatNumber(totals.tokens)}</strong>
          </Card>
        </div>

        <div className={styles.resultGrid}>
          {items.length === 0 ? (
            <Card className={styles.emptyCard}>
              <div className={styles.emptyState}>
                输入访问密钥后，这里会显示账单概览、余额进度和每日费用趋势。
              </div>
            </Card>
          ) : (
            items.map((item) => {
              const maxCost = Math.max(
                ...item.recent_days.map((row) => Number(row.cost_usd || 0)),
                0.0001
              );
              return (
                <Card
                  key={item.summary.api_key}
                  className={styles.resultCard}
                  title={`访问密钥 ${item.summary.masked_api_key}`}
                  extra={
                    <div className={styles.resultMeta}>
                      <span className={styles.periodWindow}>
                        当前周期时间：
                        {formatPeriodWindow(
                          item.summary.weekly_budget.start_at,
                          item.summary.weekly_budget.end_at
                        )}
                      </span>
                      <span className={styles.lastUsed}>
                        最近使用: {formatDateTime(item.summary.last_used_at)}
                      </span>
                    </div>
                  }
                >
                  <div className={styles.inlineMetrics}>
                    <div>
                      <span>今日费用</span>
                      <strong>{formatCost(item.summary.today.cost_usd)}</strong>
                    </div>
                    <div>
                      <span>当前周期</span>
                      <strong>{formatCost(item.summary.current_period.cost_usd)}</strong>
                    </div>
                    <div>
                      <span>今日 Tokens</span>
                      <strong>{formatNumber(item.summary.today.total_tokens)}</strong>
                    </div>
                    <div>
                      <span>Token 包余额</span>
                      <strong>{formatCost(item.summary.token_package.remaining_usd)}</strong>
                    </div>
                  </div>

                  <div className={styles.windowGrid}>
                    <div className={styles.windowCard}>
                      <span>每日预算</span>
                      <strong>{Math.round(item.summary.daily_budget.used_percent || 0)}%</strong>
                      <small>
                        {formatCost(item.summary.daily_budget.used_usd)} /{' '}
                        {formatCost(item.summary.daily_budget.limit_usd)}
                      </small>
                    </div>
                    <div className={styles.windowCard}>
                      <span>周期预算</span>
                      <strong>{Math.round(item.summary.weekly_budget.used_percent || 0)}%</strong>
                      <small>
                        {formatCost(item.summary.weekly_budget.used_usd)} /{' '}
                        {formatCost(item.summary.weekly_budget.limit_usd)}
                      </small>
                    </div>
                    <div className={styles.windowCard}>
                      <span>周期请求数</span>
                      <strong>{formatNumber(item.current_period_report.requests)}</strong>
                      <small>
                        失败请求 {formatNumber(item.current_period_report.failed_requests)}
                      </small>
                    </div>
                  </div>

                  <div className={styles.trendBars}>
                    {item.recent_days.map((day) => (
                      <div key={day.day} className={styles.trendBar}>
                        <span>{formatCost(day.cost_usd)}</span>
                        <div className={styles.trendTrack}>
                          <div
                            className={styles.trendFill}
                            style={{
                              height: `${Math.max(8, (Number(day.cost_usd || 0) / maxCost) * 120)}px`,
                            }}
                          />
                        </div>
                        <small>{day.day.slice(5)}</small>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
