import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconDownload,
  IconInfo,
  IconModelCluster,
  IconSettings,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { AuthFileItem } from '@/types';
import { resolveAuthProvider } from '@/utils/quota';
import {
  calculateStatusBarData,
  isSlowUsageDetail,
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import { formatFileSize } from '@/utils/format';
import {
  QUOTA_PROVIDER_TYPES,
  formatModified,
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  parsePriorityValue,
  resolveAuthFileStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { AuthFileQuotaSection } from '@/features/authFiles/components/AuthFileQuotaSection';
import styles from '@/pages/AuthFilesPage.module.scss';

const HEALTHY_STATUS_MESSAGES = new Set(['ok', 'healthy', 'ready', 'success', 'available']);

export type AuthFileCardProps = {
  file: AuthFileItem;
  compact: boolean;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  quotaFilterType: QuotaProviderType | null;
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  statusBarCache: Map<string, AuthFileStatusBarData>;
  onShowModels: (file: AuthFileItem) => void;
  onDownload: (name: string) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

const resolveQuotaType = (file: AuthFileItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

const readTextValue = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readNumberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const readDateLabel = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleString();
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toLocaleString();
  }
  return '';
};

const formatLatencyLabel = (value: unknown): string => {
  const ms = readNumberValue(value);
  if (ms == null || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
};

export function AuthFileCard(props: AuthFileCardProps) {
  const { t } = useTranslation();
  const {
    file,
    compact,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    quotaFilterType,
    keyStats,
    usageDetails,
    statusBarCache,
    onShowModels,
    onDownload,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  const fileStats = resolveAuthFileStats(file, keyStats);
  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const isAistudio = (file.type || '').toLowerCase() === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;
  const typeColor = getTypeColor(file.type || 'unknown', resolvedTheme);
  const typeLabel = getTypeLabel(t, file.type || 'unknown');
  const providerIcon = getAuthFileIcon(file.type || 'unknown', resolvedTheme);

  const quotaType =
    quotaFilterType && resolveQuotaType(file) === quotaFilterType ? quotaFilterType : null;

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly && !compact;

  const providerCardClass =
    quotaType === 'antigravity'
      ? styles.antigravityCard
      : quotaType === 'claude'
        ? styles.claudeCard
        : quotaType === 'codex'
          ? styles.codexCard
          : quotaType === 'gemini-cli'
            ? styles.geminiCliCard
            : quotaType === 'kimi'
              ? styles.kimiCard
              : '';

  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndex(rawAuthIndex);
  const statusData =
    (authIndexKey && statusBarCache.get(authIndexKey)) || calculateStatusBarData([]);
  const rawStatusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning =
    Boolean(rawStatusMessage) && !HEALTHY_STATUS_MESSAGES.has(rawStatusMessage.toLowerCase());

  const priorityValue = parsePriorityValue(file.priority ?? file['priority']);
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const healthSummary = (file['health_summary'] ?? file.healthSummary ?? null) as Record<
    string,
    unknown
  > | null;
  const maskedAPIKey = readTextValue(file['masked_api_key'] ?? file.maskedApiKey);
  const baseURL = readTextValue(file['base_url'] ?? file.baseUrl);
  const slowSuccessCount = useMemo(() => {
    const authIndex = authIndexKey;
    const fileName = normalizeUsageSourceId(file.name ?? '');
    const fileNameWithoutExt = normalizeUsageSourceId((file.name ?? '').replace(/\.[^/.]+$/, ''));
    return usageDetails.reduce((count, detail) => {
      const detailAuthIndex = normalizeAuthIndex(detail.auth_index);
      const byAuthIndex = Boolean(authIndex && detailAuthIndex === authIndex);
      const bySource =
        detail.source === fileName ||
        (fileNameWithoutExt.length > 0 && detail.source === fileNameWithoutExt);
      if (!byAuthIndex && !bySource) return count;
      return count + (isSlowUsageDetail(detail) ? 1 : 0);
    }, 0);
  }, [authIndexKey, file.name, usageDetails]);
  const slowSuccessRate = fileStats.success > 0 ? (slowSuccessCount / fileStats.success) * 100 : 0;
  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual') || '虚拟认证文件'
    : file.disabled
      ? t('auth_files.health_status_disabled')
      : hasStatusWarning
        ? t('auth_files.health_status_warning')
        : rawStatusMessage
          ? t('auth_files.health_status_healthy')
          : t('auth_files.status_toggle_label');
  const stateBadgeClass = isRuntimeOnly
    ? styles.stateBadgeVirtual
    : file.disabled
      ? styles.stateBadgeDisabled
      : hasStatusWarning
        ? styles.stateBadgeWarning
        : styles.stateBadgeActive;

  return (
    <div
      className={`${styles.fileCard} ${compact ? styles.fileCardCompact : ''} ${providerCardClass} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      <div className={styles.fileCardLayout}>
        <div className={styles.fileCardMain}>
          <div className={styles.cardHeader}>
            {!isRuntimeOnly && (
              <SelectionCheckbox
                checked={selected}
                onChange={() => onToggleSelect(file.name)}
                className={styles.cardSelection}
                aria-label={
                  selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')
                }
                title={selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')}
              />
            )}
            <div
              className={styles.providerAvatar}
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                ...(typeColor.border ? { border: typeColor.border } : {}),
              }}
            >
              {providerIcon ? (
                <img src={providerIcon} alt="" className={styles.providerAvatarImage} />
              ) : (
                <span className={styles.providerAvatarFallback}>
                  {typeLabel.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className={styles.cardHeaderContent}>
              <div className={styles.cardBadgeRow}>
                <span
                  className={styles.typeBadge}
                  style={{
                    backgroundColor: typeColor.bg,
                    color: typeColor.text,
                    ...(typeColor.border ? { border: typeColor.border } : {}),
                  }}
                >
                  {typeLabel}
                </span>
                <span className={`${styles.stateBadge} ${stateBadgeClass}`}>{stateLabel}</span>
              </div>
              <span className={styles.fileName} title={file.name}>
                {file.name}
              </span>
              {!compact && noteValue && (
                <div className={styles.noteText} title={noteValue}>
                  <span className={styles.noteLabel}>{t('auth_files.note_display')}</span>
                  <span className={styles.noteValue}>{noteValue}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`${styles.cardMeta} ${compact ? styles.cardMetaCompact : ''}`}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_size')}</span>
              <span className={styles.metaValue}>
                {file.size ? formatFileSize(file.size) : '-'}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_modified')}</span>
              <span className={styles.metaValue}>{formatModified(file)}</span>
            </div>
            {priorityValue !== undefined && (
              <div className={`${styles.metaItem} ${styles.priorityBadge}`}>
                <span className={styles.metaLabel}>{t('auth_files.priority_display')}</span>
                <span className={`${styles.metaValue} ${styles.priorityValue}`}>
                  {priorityValue}
                </span>
              </div>
            )}
          </div>

          {rawStatusMessage && hasStatusWarning && (
            <div className={styles.healthStatusMessage} title={rawStatusMessage}>
              <IconInfo className={styles.messageIcon} size={14} />
              <span>{rawStatusMessage}</span>
            </div>
          )}

          <div className={`${styles.cardInsights} ${compact ? styles.cardInsightsCompact : ''}`}>
            <div className={`${styles.cardStats} ${compact ? styles.cardStatsCompact : ''}`}>
              <div className={`${styles.statPill} ${styles.statSuccess}`}>
                <span className={styles.statLabel}>{t('stats.success')}</span>
                <span className={styles.statValue}>{fileStats.success}</span>
              </div>
              <div className={`${styles.statPill} ${styles.statFailure}`}>
                <span className={styles.statLabel}>{t('stats.failure')}</span>
                <span className={styles.statValue}>{fileStats.failure}</span>
              </div>
              <div className={`${styles.statPill} ${styles.statWarning}`}>
                <span className={styles.statLabel}>
                  {t('auth_files.slow_requests_label', { defaultValue: '慢成功' })}
                </span>
                <span className={styles.statValue}>
                  {slowSuccessCount}
                  {!compact && fileStats.success > 0 ? ` · ${slowSuccessRate.toFixed(1)}%` : ''}
                </span>
              </div>
            </div>

            <div className={`${styles.statusPanel} ${compact ? styles.statusPanelCompact : ''}`}>
              <div className={styles.statusPanelLabel}>
                <span>{t('auth_files.health_status_label')}</span>
              </div>
              <ProviderStatusBar statusData={statusData} styles={styles} />
            </div>

            {healthSummary && (
              <div className={styles.healthSummaryPanel}>
                <div className={styles.healthSummaryRow}>
                  {readTextValue(healthSummary.model) && (
                    <span className={styles.healthBadge}>
                      {t('auth_files.health_model_label', { defaultValue: '模型' })}:{' '}
                      {readTextValue(healthSummary.model)}
                    </span>
                  )}
                  {healthSummary.degraded === true && (
                    <span className={`${styles.healthBadge} ${styles.healthBadgeDanger}`}>
                      {t('auth_files.health_degraded_label', { defaultValue: '已降级' })}
                    </span>
                  )}
                  {healthSummary.last_probe_slow === true && healthSummary.degraded !== true && (
                    <span className={`${styles.healthBadge} ${styles.healthBadgeWarn}`}>
                      {t('auth_files.health_probe_slow_label', { defaultValue: '探测偏慢' })}
                    </span>
                  )}
                  {healthSummary.last_canary_slow === true && (
                    <span className={`${styles.healthBadge} ${styles.healthBadgeWarn}`}>
                      {t('auth_files.health_canary_slow_label', { defaultValue: '回答偏慢' })}
                    </span>
                  )}
                </div>
                <div className={styles.healthMetaGrid}>
                  {maskedAPIKey && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_key_label', { defaultValue: '密钥' })}
                      </span>
                      <span className={styles.healthMetaValue}>{maskedAPIKey}</span>
                    </div>
                  )}
                  {baseURL && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_base_url_label', { defaultValue: '地址' })}
                      </span>
                      <span className={styles.healthMetaValue} title={baseURL}>
                        {baseURL}
                      </span>
                    </div>
                  )}
                  {formatLatencyLabel(
                    healthSummary.last_probe_latency_ms ?? healthSummary.lastProbeLatencyMs
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_probe_latency_label', { defaultValue: '探测延迟' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {formatLatencyLabel(
                          healthSummary.last_probe_latency_ms ?? healthSummary.lastProbeLatencyMs
                        )}
                      </span>
                    </div>
                  )}
                  {formatLatencyLabel(
                    healthSummary.last_first_activity_ms ?? healthSummary.lastFirstActivityMs
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_first_activity_label', { defaultValue: '首包' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {formatLatencyLabel(
                          healthSummary.last_first_activity_ms ?? healthSummary.lastFirstActivityMs
                        )}
                      </span>
                    </div>
                  )}
                  {formatLatencyLabel(
                    healthSummary.last_completed_ms ?? healthSummary.lastCompletedMs
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_completed_label', { defaultValue: '完成' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {formatLatencyLabel(
                          healthSummary.last_completed_ms ?? healthSummary.lastCompletedMs
                        )}
                      </span>
                    </div>
                  )}
                  {readDateLabel(
                    healthSummary.next_retry_after ?? healthSummary.nextRetryAfter
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_retry_after_label', { defaultValue: '冷却到期' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {readDateLabel(
                          healthSummary.next_retry_after ?? healthSummary.nextRetryAfter
                        )}
                      </span>
                    </div>
                  )}
                  {readDateLabel(healthSummary.last_probe_at ?? healthSummary.lastProbeAt) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_last_probe_at_label', { defaultValue: '最近探测' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {readDateLabel(healthSummary.last_probe_at ?? healthSummary.lastProbeAt)}
                      </span>
                    </div>
                  )}
                  {formatLatencyLabel(
                    healthSummary.last_canary_latency_ms ?? healthSummary.lastCanaryLatencyMs
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_canary_latency_label', { defaultValue: '回答延迟' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {formatLatencyLabel(
                          healthSummary.last_canary_latency_ms ?? healthSummary.lastCanaryLatencyMs
                        )}
                      </span>
                    </div>
                  )}
                  {readDateLabel(healthSummary.last_canary_at ?? healthSummary.lastCanaryAt) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_last_canary_at_label', { defaultValue: '最近回答探测' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {readDateLabel(
                          healthSummary.last_canary_at ?? healthSummary.lastCanaryAt
                        )}
                      </span>
                    </div>
                  )}
                  {readDateLabel(healthSummary.last_switch_at ?? healthSummary.lastSwitchAt) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_last_switch_at_label', { defaultValue: '切换时间' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {readDateLabel(healthSummary.last_switch_at ?? healthSummary.lastSwitchAt)}
                      </span>
                    </div>
                  )}
                  {readTextValue(
                    healthSummary.last_switch_to_auth_index ?? healthSummary.lastSwitchToAuthIndex
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_last_switch_label', { defaultValue: '切换到' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {readTextValue(
                          healthSummary.last_switch_to_provider ??
                            healthSummary.lastSwitchToProvider
                        )}
                        {readTextValue(
                          healthSummary.last_switch_to_auth_index ??
                            healthSummary.lastSwitchToAuthIndex
                        )
                          ? ` / ${readTextValue(
                              healthSummary.last_switch_to_auth_index ??
                                healthSummary.lastSwitchToAuthIndex
                            )}`
                          : ''}
                      </span>
                    </div>
                  )}
                  {readTextValue(
                    healthSummary.last_switch_to_masked_api_key ??
                      healthSummary.lastSwitchToMaskedApiKey
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_last_switch_key_label', { defaultValue: '切换后密钥' })}
                      </span>
                      <span className={styles.healthMetaValue}>
                        {readTextValue(
                          healthSummary.last_switch_to_masked_api_key ??
                            healthSummary.lastSwitchToMaskedApiKey
                        )}
                      </span>
                    </div>
                  )}
                  {readTextValue(
                    healthSummary.last_switch_to_base_url ?? healthSummary.lastSwitchToBaseUrl
                  ) && (
                    <div className={styles.healthMetaItem}>
                      <span className={styles.healthMetaLabel}>
                        {t('auth_files.health_last_switch_base_url_label', {
                          defaultValue: '切换后地址',
                        })}
                      </span>
                      <span
                        className={styles.healthMetaValue}
                        title={readTextValue(
                          healthSummary.last_switch_to_base_url ??
                            healthSummary.lastSwitchToBaseUrl
                        )}
                      >
                        {readTextValue(
                          healthSummary.last_switch_to_base_url ??
                            healthSummary.lastSwitchToBaseUrl
                        )}
                      </span>
                    </div>
                  )}
                </div>
                {readTextValue(healthSummary.last_probe_error ?? healthSummary.lastProbeError) && (
                  <div className={styles.healthProbeError}>
                    <IconInfo className={styles.messageIcon} size={14} />
                    <span>
                      {readTextValue(
                        healthSummary.last_probe_error ?? healthSummary.lastProbeError
                      )}
                    </span>
                  </div>
                )}
                {readTextValue(healthSummary.last_canary_error ?? healthSummary.lastCanaryError) && (
                  <div className={styles.healthProbeError}>
                    <IconInfo className={styles.messageIcon} size={14} />
                    <span>
                      {t('auth_files.health_canary_error_label', {
                        defaultValue: '回答探测错误',
                      })}
                      :{' '}
                      {readTextValue(
                        healthSummary.last_canary_error ?? healthSummary.lastCanaryError
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {showQuotaLayout && quotaType && (
              <AuthFileQuotaSection
                file={file}
                quotaType={quotaType}
                disableControls={disableControls}
              />
            )}
          </div>

          <div className={styles.cardActions}>
            <div className={styles.cardActionsMain}>
              {showModelsButton && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onShowModels(file)}
                  className={`${styles.primaryActionButton} ${styles.modelsActionButton}`}
                  title={t('auth_files.models_button', { defaultValue: '模型' })}
                  disabled={disableControls}
                >
                  <>
                    <span className={styles.modelsActionIconWrap}>
                      <IconModelCluster className={styles.actionIcon} size={16} />
                    </span>
                    <span className={styles.actionButtonLabel}>
                      {t('auth_files.models_button', { defaultValue: '模型' })}
                    </span>
                  </>
                </Button>
              )}
              {!isRuntimeOnly && (
                <div className={styles.cardUtilityActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onDownload(file.name)}
                    className={styles.iconButton}
                    title={t('auth_files.download_button')}
                    disabled={disableControls}
                  >
                    <IconDownload className={styles.actionIcon} size={16} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenPrefixProxyEditor(file)}
                    className={styles.iconButton}
                    title={t('auth_files.prefix_proxy_button')}
                    disabled={disableControls}
                  >
                    <IconSettings className={styles.actionIcon} size={16} />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onDelete(file.name)}
                    className={styles.iconButton}
                    title={t('auth_files.delete_button')}
                    disabled={disableControls || deleting === file.name}
                  >
                    {deleting === file.name ? (
                      <LoadingSpinner size={14} />
                    ) : (
                      <IconTrash2 className={styles.actionIcon} size={16} />
                    )}
                  </Button>
                </div>
              )}
            </div>
            {!isRuntimeOnly && (
              <div className={styles.statusToggle}>
                <span className={styles.statusToggleLabel}>
                  {t('auth_files.status_toggle_label')}
                </span>
                <ToggleSwitch
                  ariaLabel={t('auth_files.status_toggle_label')}
                  checked={!file.disabled}
                  disabled={disableControls || statusUpdating[file.name] === true}
                  onChange={(value) => onToggleStatus(file, value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
