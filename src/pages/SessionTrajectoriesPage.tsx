import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { configApi } from '@/services/api';
import {
  sessionTrajectoriesApi,
  type SessionTrajectoryExportResult,
  type SessionTrajectoryRequest,
  type SessionTrajectorySummary,
  type SessionTrajectoryTokenRoundsResponse,
} from '@/services/api/sessionTrajectories';
import { copyToClipboard } from '@/utils/clipboard';
import { formatDateTime, formatNumber, truncateText } from '@/utils/format';
import styles from './SessionTrajectoriesPage.module.scss';

type FiltersState = {
  user_id: string;
  source: string;
  call_type: string;
  status: string;
  provider: string;
  canonical_model_family: string;
  limit: string;
};

const DEFAULT_FILTERS: FiltersState = {
  user_id: '',
  source: '',
  call_type: '',
  status: '',
  provider: '',
  canonical_model_family: '',
  limit: '50',
};

const STATUS_OPTIONS = [
  { value: '', labelKey: 'session_trajectories.status_all' },
  { value: 'success', labelKey: 'session_trajectories.status_success' },
  { value: 'error', labelKey: 'session_trajectories.status_error' },
  { value: 'active', labelKey: 'session_trajectories.status_active' },
];

const REQUEST_LIMIT_OPTIONS = ['20', '50', '100', '200'];

const normalizeFilters = (filters: FiltersState): FiltersState => ({
  user_id: filters.user_id.trim(),
  source: filters.source.trim(),
  call_type: filters.call_type.trim(),
  status: filters.status.trim(),
  provider: filters.provider.trim(),
  canonical_model_family: filters.canonical_model_family.trim(),
  limit: String(Math.max(1, Number.parseInt(filters.limit, 10) || 50)),
});

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
};

const shortId = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) {
    return '-';
  }
  if (text.length <= 12) {
    return text;
  }
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
};

const prettyJson = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const statusClassName = (status?: string | null) => {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();
  if (normalized === 'success') return `${styles.statusBadge} ${styles.statusSuccess}`;
  if (normalized === 'error') return `${styles.statusBadge} ${styles.statusError}`;
  if (normalized === 'active') return `${styles.statusBadge} ${styles.statusActive}`;
  return `${styles.statusBadge} ${styles.statusMuted}`;
};

const resolveSessionLabel = (session: SessionTrajectorySummary) => {
  const explicit = session.session_name?.trim();
  if (explicit) {
    return explicit;
  }
  return `${session.provider} · ${session.canonical_model_family}`;
};

export function SessionTrajectoriesPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const config = useConfigStore((state) => state.config);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [sessions, setSessions] = useState<SessionTrajectorySummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedSession, setSelectedSession] = useState<SessionTrajectorySummary | null>(null);
  const [requests, setRequests] = useState<SessionTrajectoryRequest[]>([]);
  const [tokenRounds, setTokenRounds] = useState<SessionTrajectoryTokenRoundsResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [includePayloads, setIncludePayloads] = useState(false);
  const [requestLimit, setRequestLimit] = useState('50');
  const [requestModal, setRequestModal] = useState<SessionTrajectoryRequest | null>(null);
  const [lastExportItems, setLastExportItems] = useState<SessionTrajectoryExportResult[]>([]);
  const [sessionExporting, setSessionExporting] = useState(false);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [sessionTrajectorySaving, setSessionTrajectorySaving] = useState(false);

  const listRequestSeq = useRef(0);
  const detailRequestSeq = useRef(0);

  const selectedSessionFromList = useMemo(
    () => sessions.find((session) => session.session_id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );

  const requestLimitOptions = useMemo(
    () =>
      REQUEST_LIMIT_OPTIONS.map((value) => ({
        value,
        label: t('session_trajectories.request_limit_option', { value }),
      })),
    [t]
  );

  const statusOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t]
  );
  const sessionTrajectoryEnabled = config?.sessionTrajectoryEnabled ?? true;
  const canEditSessionTrajectory =
    connectionStatus === 'connected' && Boolean(config) && !sessionTrajectorySaving;

  const loadSessions = useCallback(
    async (preferredSessionId?: string) => {
      if (connectionStatus !== 'connected') {
        return;
      }

      const requestId = ++listRequestSeq.current;
      setSessionsLoading(true);
      setSessionsError('');

      try {
        const normalized = normalizeFilters(appliedFilters);
        const response = await sessionTrajectoriesApi.listSessions({
          ...normalized,
          limit: Number.parseInt(normalized.limit, 10) || 50,
        });
        if (requestId !== listRequestSeq.current) {
          return;
        }
        const items = Array.isArray(response.items) ? response.items : [];
        setSessions(items);

        const nextSelectedId =
          (preferredSessionId &&
            items.some((item) => item.session_id === preferredSessionId) &&
            preferredSessionId) ||
          (selectedSessionId &&
            items.some((item) => item.session_id === selectedSessionId) &&
            selectedSessionId) ||
          items[0]?.session_id ||
          '';
        setSelectedSessionId(nextSelectedId);
      } catch (error: unknown) {
        if (requestId !== listRequestSeq.current) {
          return;
        }
        setSessions([]);
        setSelectedSessionId('');
        setSessionsError(getErrorMessage(error, t('session_trajectories.load_sessions_failed')));
      } finally {
        if (requestId === listRequestSeq.current) {
          setSessionsLoading(false);
        }
      }
    },
    [appliedFilters, connectionStatus, selectedSessionId, t]
  );

  const loadSessionDetails = useCallback(
    async (sessionId: string) => {
      const normalizedId = sessionId.trim();
      if (!normalizedId || connectionStatus !== 'connected') {
        setSelectedSession(null);
        setRequests([]);
        setTokenRounds(null);
        setDetailError('');
        return;
      }

      const requestId = ++detailRequestSeq.current;
      setDetailLoading(true);
      setDetailError('');

      try {
        const [sessionResponse, requestResponse, tokenResponse] = await Promise.all([
          sessionTrajectoriesApi.getSession(normalizedId),
          sessionTrajectoriesApi.listSessionRequests(normalizedId, {
            limit: Number.parseInt(requestLimit, 10) || 50,
            include_payloads: includePayloads,
          }),
          sessionTrajectoriesApi.getSessionTokenRounds(
            normalizedId,
            Number.parseInt(requestLimit, 10) || 50
          ),
        ]);

        if (requestId !== detailRequestSeq.current) {
          return;
        }

        setSelectedSession(sessionResponse.item);
        setRequests(Array.isArray(requestResponse.items) ? requestResponse.items : []);
        setTokenRounds(tokenResponse);
      } catch (error: unknown) {
        if (requestId !== detailRequestSeq.current) {
          return;
        }
        setSelectedSession(selectedSessionFromList);
        setRequests([]);
        setTokenRounds(null);
        setDetailError(
          getErrorMessage(error, t('session_trajectories.load_session_detail_failed'))
        );
      } finally {
        if (requestId === detailRequestSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [connectionStatus, includePayloads, requestLimit, selectedSessionFromList, t]
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSession(null);
      setRequests([]);
      setTokenRounds(null);
      return;
    }
    void loadSessionDetails(selectedSessionId);
  }, [loadSessionDetails, selectedSessionId]);

  useHeaderRefresh(
    useCallback(async () => {
      await loadSessions(selectedSessionId);
      if (selectedSessionId) {
        await loadSessionDetails(selectedSessionId);
      }
    }, [loadSessionDetails, loadSessions, selectedSessionId])
  );

  const handleFilterChange = <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setAppliedFilters(normalizeFilters(filters));
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const handleCopy = useCallback(
    async (text: string, successMessage: string) => {
      const ok = await copyToClipboard(text);
      showNotification(
        ok ? successMessage : t('session_trajectories.copy_failed'),
        ok ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const handleExportSession = async () => {
    const sessionId = selectedSessionId.trim();
    if (!sessionId) {
      return;
    }

    setSessionExporting(true);
    try {
      const response = await sessionTrajectoriesApi.exportSession(sessionId);
      setLastExportItems(response.item ? [response.item] : []);
      showNotification(t('session_trajectories.export_session_success'), 'success');
    } catch (error: unknown) {
      showNotification(getErrorMessage(error, t('session_trajectories.export_failed')), 'error');
    } finally {
      setSessionExporting(false);
    }
  };

  const handleExportFiltered = async () => {
    setBulkExporting(true);
    try {
      const normalized = normalizeFilters(appliedFilters);
      const response = await sessionTrajectoriesApi.exportSessions({
        ...normalized,
        limit: Number.parseInt(normalized.limit, 10) || 50,
      });
      setLastExportItems(Array.isArray(response.items) ? response.items : []);
      showNotification(t('session_trajectories.export_filtered_success'), 'success');
    } catch (error: unknown) {
      showNotification(getErrorMessage(error, t('session_trajectories.export_failed')), 'error');
    } finally {
      setBulkExporting(false);
    }
  };

  const handleSessionTrajectoryToggle = async (enabled: boolean) => {
    if (!canEditSessionTrajectory) {
      return;
    }

    const previous = sessionTrajectoryEnabled;
    setSessionTrajectorySaving(true);
    updateConfigValue('session-trajectory-enabled', enabled);

    try {
      await configApi.updateSessionTrajectoryEnabled(enabled);
      clearCache('session-trajectory-enabled');
      showNotification(t('session_trajectories.recording_setting_updated'), 'success');
    } catch (error: unknown) {
      const message = getErrorMessage(error, t('notification.update_failed'));
      updateConfigValue('session-trajectory-enabled', previous);
      showNotification(message, 'error');
    } finally {
      setSessionTrajectorySaving(false);
    }
  };

  const activeSession = selectedSession ?? selectedSessionFromList;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <h1 className={styles.pageTitle}>{t('session_trajectories.title')}</h1>
          <p className={styles.subtitle}>{t('session_trajectories.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.captureToggleCard}>
            <div className={styles.captureToggleText}>
              <div className={styles.captureToggleTitle}>
                {t('session_trajectories.recording_toggle_label')}
              </div>
              <div className={styles.captureToggleHint}>
                {sessionTrajectoryEnabled
                  ? t('session_trajectories.recording_status_on')
                  : t('session_trajectories.recording_status_off')}
              </div>
            </div>
            <ToggleSwitch
              checked={sessionTrajectoryEnabled}
              onChange={(value) => void handleSessionTrajectoryToggle(value)}
              label={
                sessionTrajectoryEnabled
                  ? t('session_trajectories.recording_enabled')
                  : t('session_trajectories.recording_disabled')
              }
              ariaLabel={t('session_trajectories.recording_toggle_label')}
              disabled={!canEditSessionTrajectory}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => void loadSessions(selectedSessionId)}
            disabled={sessionsLoading}
          >
            {t('session_trajectories.refresh')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportFiltered}
            loading={bulkExporting}
            disabled={sessionsLoading || connectionStatus !== 'connected'}
          >
            {t('session_trajectories.export_filtered')}
          </Button>
        </div>
      </div>

      <section className={styles.filterShell}>
        <div className={styles.filterTop}>
          <div className={styles.filterHeading}>
            <div className={styles.filterTitle}>{t('session_trajectories.filters_title')}</div>
            <div className={styles.filterHint}>{t('session_trajectories.filters_hint')}</div>
          </div>
          <div className={styles.filterActions}>
            <Button variant="secondary" onClick={handleResetFilters}>
              {t('session_trajectories.reset_filters')}
            </Button>
            <Button onClick={handleApplyFilters}>{t('session_trajectories.apply_filters')}</Button>
          </div>
        </div>

        <div className={styles.filterGrid}>
          <div className={styles.filterSpan3}>
            <Input
              label={t('session_trajectories.filter_user_id')}
              value={filters.user_id}
              onChange={(event) => handleFilterChange('user_id', event.target.value)}
              placeholder={t('session_trajectories.filter_user_id_placeholder')}
            />
          </div>
          <div className={styles.filterSpan2}>
            <Input
              label={t('session_trajectories.filter_source')}
              value={filters.source}
              onChange={(event) => handleFilterChange('source', event.target.value)}
              placeholder={t('session_trajectories.filter_source_placeholder')}
            />
          </div>
          <div className={styles.filterSpan2}>
            <Input
              label={t('session_trajectories.filter_call_type')}
              value={filters.call_type}
              onChange={(event) => handleFilterChange('call_type', event.target.value)}
              placeholder={t('session_trajectories.filter_call_type_placeholder')}
            />
          </div>
          <div className={styles.filterSpan2}>
            <Input
              label={t('session_trajectories.filter_provider')}
              value={filters.provider}
              onChange={(event) => handleFilterChange('provider', event.target.value)}
              placeholder={t('session_trajectories.filter_provider_placeholder')}
            />
          </div>
          <div className={styles.filterSpan3}>
            <Input
              label={t('session_trajectories.filter_model_family')}
              value={filters.canonical_model_family}
              onChange={(event) => handleFilterChange('canonical_model_family', event.target.value)}
              placeholder={t('session_trajectories.filter_model_family_placeholder')}
            />
          </div>
          <div className={styles.filterSpan2}>
            <label htmlFor="session-trajectory-status">
              {t('session_trajectories.filter_status')}
            </label>
            <Select
              id="session-trajectory-status"
              value={filters.status}
              options={statusOptions}
              onChange={(value) => handleFilterChange('status', value)}
              ariaLabel={t('session_trajectories.filter_status')}
            />
          </div>
          <div className={styles.filterSpan2}>
            <Input
              label={t('session_trajectories.filter_limit')}
              type="number"
              min={1}
              max={500}
              value={filters.limit}
              onChange={(event) => handleFilterChange('limit', event.target.value)}
            />
          </div>
        </div>
      </section>

      <div className={styles.splitLayout}>
        <section className={styles.leftPanel}>
          <Card
            title={t('session_trajectories.sessions_title')}
            extra={
              <div className={styles.panelMeta}>
                <span>{t('session_trajectories.session_count', { count: sessions.length })}</span>
                {sessionsLoading ? <span>{t('common.loading')}</span> : null}
              </div>
            }
          >
            {sessionsError ? <div className={styles.errorBox}>{sessionsError}</div> : null}
            {sessionsLoading && sessions.length === 0 ? (
              <div className={styles.loadingState}>{t('common.loading')}</div>
            ) : sessions.length === 0 ? (
              <EmptyState
                title={t('session_trajectories.empty_title')}
                description={t('session_trajectories.empty_desc')}
              />
            ) : (
              <div className={styles.listShell}>
                {sessions.map((session) => {
                  const active = session.session_id === selectedSessionId;
                  return (
                    <button
                      key={session.session_id}
                      type="button"
                      className={`${styles.sessionButton} ${active ? styles.sessionButtonActive : ''}`.trim()}
                      onClick={() => setSelectedSessionId(session.session_id)}
                    >
                      <div className={styles.sessionTop}>
                        <div className={styles.sessionIdentity}>
                          <div className={styles.sessionName}>{resolveSessionLabel(session)}</div>
                          <div className={styles.sessionSubline}>
                            {truncateText(session.user_id, 42)}
                          </div>
                        </div>
                        <span className={statusClassName(session.status)}>
                          {t(`session_trajectories.status_${session.status}`, {
                            defaultValue:
                              session.status || t('session_trajectories.status_unknown'),
                          })}
                        </span>
                      </div>
                      <div className={styles.sessionMetrics}>
                        <div className={styles.metricChip}>
                          <div className={styles.metricLabel}>
                            {t('session_trajectories.metric_requests')}
                          </div>
                          <div className={styles.metricValue}>
                            {formatNumber(session.request_count || 0)}
                          </div>
                        </div>
                        <div className={styles.metricChip}>
                          <div className={styles.metricLabel}>
                            {t('session_trajectories.metric_messages')}
                          </div>
                          <div className={styles.metricValue}>
                            {formatNumber(session.message_count || 0)}
                          </div>
                        </div>
                        <div className={styles.metricChip}>
                          <div className={styles.metricLabel}>
                            {t('session_trajectories.metric_provider')}
                          </div>
                          <div className={styles.metricValue}>{session.provider || '-'}</div>
                        </div>
                        <div className={styles.metricChip}>
                          <div className={styles.metricLabel}>
                            {t('session_trajectories.metric_last_activity')}
                          </div>
                          <div className={styles.metricValue}>
                            {formatDateTime(session.last_activity_at)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        <section className={styles.detailShell}>
          {!selectedSessionId ? (
            <div className={styles.emptyPanel}>
              <EmptyState
                title={t('session_trajectories.no_selection_title')}
                description={t('session_trajectories.no_selection_desc')}
              />
            </div>
          ) : (
            <>
              <section className={styles.detailHero}>
                <div className={styles.detailHeroTop}>
                  <div className={styles.detailHeroMeta}>
                    <div className={styles.eyebrow}>{t('session_trajectories.detail_eyebrow')}</div>
                    <h2 className={styles.detailTitle}>
                      {resolveSessionLabel(activeSession ?? selectedSessionFromList!)}
                    </h2>
                    <div className={`${styles.detailSubline} ${styles.mono}`}>
                      {selectedSessionId}
                    </div>
                  </div>
                  <div className={styles.heroActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void handleCopy(
                          selectedSessionId,
                          t('session_trajectories.copy_session_id_success')
                        )
                      }
                    >
                      {t('session_trajectories.copy_session_id')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleExportSession}
                      loading={sessionExporting}
                      disabled={connectionStatus !== 'connected'}
                    >
                      {t('session_trajectories.export_session')}
                    </Button>
                  </div>
                </div>

                <div className={styles.statsGrid}>
                  <div className={styles.statTile}>
                    <div className={styles.statTileLabel}>
                      {t('session_trajectories.metric_requests')}
                    </div>
                    <div className={styles.statTileValue}>
                      {formatNumber(activeSession?.request_count || 0)}
                    </div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statTileLabel}>
                      {t('session_trajectories.metric_messages')}
                    </div>
                    <div className={styles.statTileValue}>
                      {formatNumber(activeSession?.message_count || 0)}
                    </div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statTileLabel}>
                      {t('session_trajectories.metric_total_tokens')}
                    </div>
                    <div className={styles.statTileValue}>
                      {formatNumber(tokenRounds?.summary.total_tokens || 0)}
                    </div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statTileLabel}>
                      {t('session_trajectories.metric_cached_tokens')}
                    </div>
                    <div className={styles.statTileValue}>
                      {formatNumber(tokenRounds?.summary.cached_tokens || 0)}
                    </div>
                  </div>
                </div>
              </section>

              {detailError ? <div className={styles.errorBox}>{detailError}</div> : null}

              <Card title={t('session_trajectories.overview_title')}>
                <div className={styles.metaGrid}>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_user_id')}
                    </div>
                    <div className={`${styles.metaItemValue} ${styles.mono}`}>
                      {activeSession?.user_id || '-'}
                    </div>
                  </div>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_provider_session_id')}
                    </div>
                    <div className={`${styles.metaItemValue} ${styles.mono}`}>
                      {activeSession?.provider_session_id || '-'}
                    </div>
                  </div>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_source')}
                    </div>
                    <div className={styles.metaItemValue}>{activeSession?.source || '-'}</div>
                  </div>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_call_type')}
                    </div>
                    <div className={styles.metaItemValue}>{activeSession?.call_type || '-'}</div>
                  </div>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_provider')}
                    </div>
                    <div className={styles.metaItemValue}>{activeSession?.provider || '-'}</div>
                  </div>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_model_family')}
                    </div>
                    <div className={styles.metaItemValue}>
                      {activeSession?.canonical_model_family || '-'}
                    </div>
                  </div>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_started_at')}
                    </div>
                    <div className={styles.metaItemValue}>
                      {activeSession?.started_at ? formatDateTime(activeSession.started_at) : '-'}
                    </div>
                  </div>
                  <div className={styles.metaItem}>
                    <div className={styles.metaItemLabel}>
                      {t('session_trajectories.field_last_activity_at')}
                    </div>
                    <div className={styles.metaItemValue}>
                      {activeSession?.last_activity_at
                        ? formatDateTime(activeSession.last_activity_at)
                        : '-'}
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                title={t('session_trajectories.token_rounds_title')}
                extra={
                  <div className={styles.panelMeta}>
                    <span>
                      {t('session_trajectories.round_count', {
                        count: tokenRounds?.summary.round_count || 0,
                      })}
                    </span>
                    {detailLoading ? <span>{t('common.loading')}</span> : null}
                  </div>
                }
              >
                {tokenRounds?.items?.length ? (
                  <div className={styles.tableWrap}>
                    <table className={`${styles.table} ${styles.tableCompact}`}>
                      <thead>
                        <tr>
                          <th>{t('session_trajectories.table_round')}</th>
                          <th>{t('session_trajectories.table_model')}</th>
                          <th>{t('session_trajectories.table_input')}</th>
                          <th>{t('session_trajectories.table_output')}</th>
                          <th>{t('session_trajectories.table_cached')}</th>
                          <th>{t('session_trajectories.table_total')}</th>
                          <th>{t('session_trajectories.table_started_at')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenRounds.items.map((round) => (
                          <tr key={`${round.request_id}-${round.request_index}`}>
                            <td>{round.request_index}</td>
                            <td>{round.model}</td>
                            <td>{formatNumber(round.input_tokens || 0)}</td>
                            <td>{formatNumber(round.output_tokens || 0)}</td>
                            <td>{formatNumber(round.cached_tokens || 0)}</td>
                            <td>{formatNumber(round.total_tokens || 0)}</td>
                            <td>{formatDateTime(round.started_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title={t('session_trajectories.token_rounds_empty_title')}
                    description={t('session_trajectories.token_rounds_empty_desc')}
                  />
                )}
              </Card>

              <Card
                title={t('session_trajectories.requests_title')}
                extra={
                  <div className={styles.inlineControls}>
                    <Select
                      value={requestLimit}
                      options={requestLimitOptions}
                      onChange={setRequestLimit}
                      ariaLabel={t('session_trajectories.request_limit')}
                      fullWidth={false}
                    />
                    <ToggleSwitch
                      checked={includePayloads}
                      onChange={setIncludePayloads}
                      label={t('session_trajectories.include_payloads')}
                      ariaLabel={t('session_trajectories.include_payloads')}
                    />
                  </div>
                }
              >
                {detailLoading && requests.length === 0 ? (
                  <div className={styles.loadingState}>{t('common.loading')}</div>
                ) : requests.length === 0 ? (
                  <EmptyState
                    title={t('session_trajectories.requests_empty_title')}
                    description={t('session_trajectories.requests_empty_desc')}
                  />
                ) : (
                  <div className={styles.requestList}>
                    {requests.map((request) => {
                      const hasPayloads =
                        request.request_json !== undefined ||
                        request.response_json !== undefined ||
                        request.normalized_json !== undefined ||
                        request.error_json !== undefined;
                      return (
                        <article key={request.id} className={styles.requestCard}>
                          <div className={styles.requestHeader}>
                            <div className={styles.requestHeaderMain}>
                              <div className={styles.requestTitle}>
                                {t('session_trajectories.request_title', {
                                  index: request.request_index,
                                })}{' '}
                                · {request.model}
                              </div>
                              <div className={styles.requestMeta}>
                                <span className={statusClassName(request.status)}>
                                  {t(`session_trajectories.status_${request.status}`, {
                                    defaultValue:
                                      request.status || t('session_trajectories.status_unknown'),
                                  })}
                                </span>
                                <span className={styles.mono}>{shortId(request.request_id)}</span>
                                <span>{formatDateTime(request.started_at)}</span>
                              </div>
                            </div>
                            {hasPayloads ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setRequestModal(request)}
                              >
                                {t('session_trajectories.view_payloads')}
                              </Button>
                            ) : null}
                          </div>

                          <div className={styles.requestDataGrid}>
                            <div className={styles.requestDatum}>
                              <div className={styles.requestDatumLabel}>
                                {t('session_trajectories.field_input_tokens')}
                              </div>
                              <div className={styles.requestDatumValue}>
                                {formatNumber(request.input_tokens || 0)}
                              </div>
                            </div>
                            <div className={styles.requestDatum}>
                              <div className={styles.requestDatumLabel}>
                                {t('session_trajectories.field_output_tokens')}
                              </div>
                              <div className={styles.requestDatumValue}>
                                {formatNumber(request.output_tokens || 0)}
                              </div>
                            </div>
                            <div className={styles.requestDatum}>
                              <div className={styles.requestDatumLabel}>
                                {t('session_trajectories.field_reasoning_tokens')}
                              </div>
                              <div className={styles.requestDatumValue}>
                                {formatNumber(request.reasoning_tokens || 0)}
                              </div>
                            </div>
                            <div className={styles.requestDatum}>
                              <div className={styles.requestDatumLabel}>
                                {t('session_trajectories.field_cached_tokens')}
                              </div>
                              <div className={styles.requestDatumValue}>
                                {formatNumber(request.cached_tokens || 0)}
                              </div>
                            </div>
                            <div className={styles.requestDatum}>
                              <div className={styles.requestDatumLabel}>
                                {t('session_trajectories.field_total_tokens')}
                              </div>
                              <div className={styles.requestDatumValue}>
                                {formatNumber(request.total_tokens || 0)}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card title={t('session_trajectories.export_results_title')}>
                {lastExportItems.length === 0 ? (
                  <EmptyState
                    title={t('session_trajectories.export_empty_title')}
                    description={t('session_trajectories.export_empty_desc')}
                  />
                ) : (
                  <div className={styles.exportList}>
                    {lastExportItems.map((item) => (
                      <div
                        key={`${item.session_id}-${item.exported_at}`}
                        className={styles.exportItem}
                      >
                        <div className={styles.exportMain}>
                          <div className={styles.exportPath}>{item.export_dir}</div>
                          <div className={styles.mutedText}>
                            {t('session_trajectories.export_file_count', {
                              count: item.file_count,
                            })}{' '}
                            · {formatDateTime(item.exported_at)}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void handleCopy(
                              item.export_dir,
                              t('session_trajectories.copy_export_path_success')
                            )
                          }
                        >
                          {t('session_trajectories.copy_export_path')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(requestModal)}
        onClose={() => setRequestModal(null)}
        title={t('session_trajectories.payload_modal_title', {
          index: requestModal?.request_index ?? 0,
          requestId: shortId(requestModal?.request_id),
        })}
        width={920}
      >
        {requestModal ? (
          <div className={styles.jsonSections}>
            {[
              ['request_json', t('session_trajectories.payload_request_json')],
              ['response_json', t('session_trajectories.payload_response_json')],
              ['normalized_json', t('session_trajectories.payload_normalized_json')],
              ['error_json', t('session_trajectories.payload_error_json')],
            ].map(([field, label]) => {
              const value = requestModal[field as keyof SessionTrajectoryRequest];
              const content = prettyJson(value);
              if (!content) {
                return null;
              }
              return (
                <section key={field} className={styles.jsonSection}>
                  <div className={styles.jsonHeader}>
                    <div className={styles.jsonTitle}>{label}</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void handleCopy(content, t('session_trajectories.copy_json_success'))
                      }
                    >
                      {t('session_trajectories.copy_json')}
                    </Button>
                  </div>
                  <pre className={`${styles.jsonBlock} ${styles.mono}`}>{content}</pre>
                </section>
              );
            })}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
