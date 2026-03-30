import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { queryApiKeyInsights } from '@/services/api/apiKeyRecords';
import type { ApiKeyRecordDetailView } from '@/services/api/apiKeyRecords';
import { useAuthStore } from '@/stores';
import { detectApiBaseFromLocation } from '@/utils/connection';
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

export function APIKeyQueryPage() {
  const storedApiBase = useAuthStore((state) => state.apiBase);
  const [apiBase, setApiBase] = useState(() => storedApiBase || detectApiBaseFromLocation());
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
      <div className={styles.hero}>
        <div className={styles.heroBody}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>API Key Self Query</span>
            <h1>输入 API Key，实时看用量与预算</h1>
            <p>
              适合给终端用户自助查账。支持同时输入多个 key，统一返回今日、当前周期、Token 包余额、模型拆分和最近请求明细。
            </p>
          </div>
          <Card className={styles.queryCard}>
            <div className={styles.formGrid}>
              <Input
                label="API Base"
                value={apiBase}
                onChange={(event) => setApiBase(event.target.value)}
                placeholder="http://127.0.0.1:8317"
                hint="生产环境一般保持默认即可；本地联调可指向你的服务端口。"
              />
              <div className="form-group">
                <label>统计范围</label>
                <Select value={range} options={RANGE_OPTIONS} onChange={setRange} />
              </div>
            </div>
            <label className={styles.textAreaField}>
              <span>API Keys</span>
              <textarea
                value={keysText}
                onChange={(event) => setKeysText(event.target.value)}
                placeholder={'alpha-live-key-001\nbeta-growth-key-002'}
              />
            </label>
            <div className={styles.queryActions}>
              <Button onClick={handleQuery} loading={loading}>
                查询实时用量
              </Button>
              <Link to="/login" className={styles.backLink}>
                返回管理登录
              </Link>
            </div>
            {error && <div className={styles.errorBox}>{error}</div>}
            {!error && invalidKeys.length > 0 && (
              <div className={styles.noticeBox}>无效或未注册: {invalidKeys.join(', ')}</div>
            )}
          </Card>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>有效 Keys</span>
          <strong className={styles.metricValue}>{formatNumber(items.length)}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>无效 Keys</span>
          <strong className={styles.metricValue}>{formatNumber(invalidKeys.length)}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>今日总费用</span>
          <strong className={styles.metricValue}>{formatCost(totals.todayCost)}</strong>
        </Card>
        <Card className={styles.summaryCard}>
          <span className={styles.metricLabel}>今日总 Tokens</span>
          <strong className={styles.metricValue}>{formatNumber(totals.tokens)}</strong>
        </Card>
      </div>

      <div className={styles.resultGrid}>
        {items.length === 0 ? (
          <Card className={styles.emptyCard}>
            <div className={styles.emptyState}>输入 API Key 后，这里会显示实时用量与预算结构。</div>
          </Card>
        ) : (
          items.map((item) => {
            const maxCost = Math.max(...item.recent_days.map((row) => Number(row.cost_usd || 0)), 0.0001);
            return (
              <Card
                key={item.summary.api_key}
                className={styles.resultCard}
                title={item.summary.masked_api_key}
                extra={<span className={styles.lastUsed}>最近使用: {formatDateTime(item.summary.last_used_at)}</span>}
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
                      {formatCost(item.summary.daily_budget.used_usd)} / {formatCost(item.summary.daily_budget.limit_usd)}
                    </small>
                  </div>
                  <div className={styles.windowCard}>
                    <span>周期预算</span>
                    <strong>{Math.round(item.summary.weekly_budget.used_percent || 0)}%</strong>
                    <small>
                      {formatCost(item.summary.weekly_budget.used_usd)} / {formatCost(item.summary.weekly_budget.limit_usd)}
                    </small>
                  </div>
                  <div className={styles.windowCard}>
                    <span>模型数</span>
                    <strong>{formatNumber(item.model_usage.length)}</strong>
                    <small>最近请求数 {formatNumber(item.current_period_report.requests)}</small>
                  </div>
                </div>

                <div className={styles.trendBars}>
                  {item.recent_days.map((day) => (
                    <div key={day.day} className={styles.trendBar}>
                      <span>{formatCost(day.cost_usd)}</span>
                      <div className={styles.trendTrack}>
                        <div
                          className={styles.trendFill}
                          style={{ height: `${Math.max(8, (Number(day.cost_usd || 0) / maxCost) * 120)}px` }}
                        />
                      </div>
                      <small>{day.day.slice(5)}</small>
                    </div>
                  ))}
                </div>

                <div className={styles.tables}>
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
                        {item.model_usage.slice(0, 8).map((model) => (
                          <tr key={model.model}>
                            <td>{model.model}</td>
                            <td>{formatNumber(model.requests)}</td>
                            <td>{formatNumber(model.total_tokens)}</td>
                            <td>{formatCost(model.cost_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>模型</th>
                          <th>Tokens</th>
                          <th>费用</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.recent_events.slice(0, 6).map((event, index) => (
                          <tr key={`${event.requested_at}-${event.model}-${index}`}>
                            <td>{formatDateTime(event.requested_at)}</td>
                            <td>{event.model}</td>
                            <td>{formatNumber(event.total_tokens)}</td>
                            <td>{formatCost(event.cost_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
