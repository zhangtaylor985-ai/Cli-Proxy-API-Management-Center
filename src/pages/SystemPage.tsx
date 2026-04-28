import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconGithub,
  IconBookOpen,
  IconExternalLink,
  IconCode,
  IconChevronDown,
} from '@/components/ui/icons';
import {
  useAuthStore,
  useConfigStore,
  useNotificationStore,
  useModelsStore,
  useThemeStore,
} from '@/stores';
import { configApi } from '@/services/api';
import { apiKeyRecordsApi } from '@/services/api/apiKeyRecords';
import { classifyModels } from '@/utils/models';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import styles from './SystemPage.module.scss';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  glm: iconGlm,
  grok: iconGrok,
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};

const DEFAULT_CLAUDE_GPT_REASONING_EFFORT = 'high';
const DEFAULT_CLAUDE_GPT_TARGET_FAMILY = '';
const CLAUDE_GPT_TARGET_FAMILY_OPTIONS = [
  { label: '默认 GPT-5.5', value: '' },
  { label: 'GPT-5.5', value: 'gpt-5.5' },
  { label: 'GPT-5.4', value: 'gpt-5.4' },
  { label: 'GPT-5.2', value: 'gpt-5.2' },
  { label: 'GPT-5.3 Codex', value: 'gpt-5.3-codex' },
] as const;
const CLAUDE_GPT_REASONING_EFFORT_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
] as const;

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [modelStatus, setModelStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'muted';
    message: string;
  }>();
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [claudeRoutingSaving, setClaudeRoutingSaving] = useState(false);
  const [claudeTargetFamilySaving, setClaudeTargetFamilySaving] = useState(false);
  const [claudeStyleSaving, setClaudeStyleSaving] = useState(false);
  const [claudeStylePromptSaving, setClaudeStylePromptSaving] = useState(false);
  const [claudeStylePromptDraft, setClaudeStylePromptDraft] = useState('');
  const [claudeReasoningEffortSaving, setClaudeReasoningEffortSaving] = useState(false);
  const [claudeOpus1MSaving, setClaudeOpus1MSaving] = useState(false);
  const [promptTokenLimitSaving, setPromptTokenLimitSaving] = useState(false);
  const [claudeCodeOnlySaving, setClaudeCodeOnlySaving] = useState(false);

  const apiKeysCache = useRef<string[]>([]);
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);
  const requestLogEnabled = config?.requestLog ?? false;
  const claudeToGptRoutingEnabled = config?.claudeToGptRoutingEnabled ?? false;
  const claudeToGptTargetFamily =
    config?.claudeToGptTargetFamily?.trim().toLowerCase() || DEFAULT_CLAUDE_GPT_TARGET_FAMILY;
  const claudeStyleEnabled = config?.claudeStyleEnabled ?? false;
  const claudeStylePrompt = config?.claudeStylePrompt ?? '';
  const claudeToGptReasoningEffort =
    config?.claudeToGptReasoningEffort?.trim().toLowerCase() || DEFAULT_CLAUDE_GPT_REASONING_EFFORT;
  const disableClaudeOpus1M = config?.disableClaudeOpus1M ?? false;
  const globalClaudeOpus1MAllowed = !disableClaudeOpus1M;
  const disablePromptTokenLimit = config?.disablePromptTokenLimit ?? false;
  const promptTokenLimitEnabled = !disablePromptTokenLimit;
  const claudeCodeOnlyEnabled = config?.claudeCodeOnlyEnabled ?? true;
  const requestLogDirty = requestLogDraft !== requestLogEnabled;
  const claudeStylePromptDirty = claudeStylePromptDraft !== claudeStylePrompt;
  const canEditRequestLog = auth.connectionStatus === 'connected' && Boolean(config);
  const canEditClaudeRouting =
    auth.connectionStatus === 'connected' && Boolean(config) && !claudeRoutingSaving;
  const canEditClaudeTargetFamily =
    auth.connectionStatus === 'connected' && Boolean(config) && !claudeTargetFamilySaving;
  const canEditClaudeStyle =
    auth.connectionStatus === 'connected' && Boolean(config) && !claudeStyleSaving;
  const canEditClaudeStylePrompt =
    auth.connectionStatus === 'connected' && Boolean(config) && !claudeStylePromptSaving;
  const canEditClaudeReasoningEffort =
    auth.connectionStatus === 'connected' && Boolean(config) && !claudeReasoningEffortSaving;
  const canEditClaudeOpus1M =
    auth.connectionStatus === 'connected' && Boolean(config) && !claudeOpus1MSaving;
  const canEditPromptTokenLimit =
    auth.connectionStatus === 'connected' && Boolean(config) && !promptTokenLimitSaving;
  const canEditClaudeCodeOnly =
    auth.connectionStatus === 'connected' && Boolean(config) && !claudeCodeOnlySaving;

  const appVersion = __APP_VERSION__ || t('system_info.version_unknown');
  const apiVersion = auth.serverVersion || t('system_info.version_unknown');
  const buildTime = auth.serverBuildDate
    ? new Date(auth.serverBuildDate).toLocaleString(i18n.language)
    : t('system_info.version_unknown');

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeyRecordsApi.list({ page: 1, pageSize: 100 });
      const normalized = normalizeApiKeyList(list.items.map((item) => item.api_key));
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch (err) {
      console.warn('Auto loading API keys for models failed:', err);
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (auth.connectionStatus !== 'connected') {
      setModelStatus({
        type: 'warning',
        message: t('notification.connection_required'),
      });
      return;
    }

    if (!auth.apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    if (forceRefresh) {
      apiKeysCache.current = [];
    }

    setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      const list = await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
      const hasModels = list.length > 0;
      setModelStatus({
        type: hasModels ? 'success' : 'warning',
        message: hasModels
          ? t('system_info.models_count', { count: list.length })
          : t('system_info.models_empty'),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const suffix = message ? `: ${message}` : '';
      const text = `${t('system_info.models_error')}${suffix}`;
      setModelStatus({ type: 'error', message: text });
    }
  };

  const handleClearLoginStorage = () => {
    showConfirmation({
      title: t('system_info.clear_login_title', { defaultValue: 'Clear Login Storage' }),
      message: t('system_info.clear_login_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: () => {
        auth.logout();
        if (typeof localStorage === 'undefined') return;
        const keysToRemove = [STORAGE_KEY_AUTH, 'isLoggedIn', 'apiBase', 'apiUrl', 'managementKey'];
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        showNotification(t('notification.login_storage_cleared'), 'success');
      },
    });
  };

  const handleClaudeRoutingToggle = async (enabled: boolean) => {
    if (!config) return;

    const previous = claudeToGptRoutingEnabled;
    setClaudeRoutingSaving(true);
    updateConfigValue('claude-to-gpt-routing-enabled', enabled);

    try {
      await configApi.updateClaudeToGptRoutingEnabled(enabled);
      clearCache('claude-to-gpt-routing-enabled');
      showNotification(
        t('notification.claude_to_gpt_routing_updated', {
          defaultValue: 'Claude 全局转 GPT 设置已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('claude-to-gpt-routing-enabled', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setClaudeRoutingSaving(false);
    }
  };

  const handleClaudeStyleToggle = async (enabled: boolean) => {
    if (!config) return;

    const previous = claudeStyleEnabled;
    setClaudeStyleSaving(true);
    updateConfigValue('claude-style-enabled', enabled);

    try {
      await configApi.updateClaudeStyleEnabled(enabled);
      clearCache('claude-style-enabled');
      showNotification(
        t('notification.claude_style_updated', {
          defaultValue: 'Claude 风格开关已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('claude-style-enabled', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setClaudeStyleSaving(false);
    }
  };

  const handleClaudeTargetFamilyChange = async (family: string) => {
    if (!config) return;

    const previous = claudeToGptTargetFamily;
    setClaudeTargetFamilySaving(true);
    updateConfigValue('claude-to-gpt-target-family', family);

    try {
      await configApi.updateClaudeToGptTargetFamily(family);
      clearCache('claude-to-gpt-target-family');
      showNotification(
        t('notification.claude_to_gpt_target_family_updated', {
          defaultValue: 'Claude 全局转 GPT 目标模型已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('claude-to-gpt-target-family', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setClaudeTargetFamilySaving(false);
    }
  };

  const handleClaudeStylePromptSave = async () => {
    if (!config) return;

    const previous = claudeStylePrompt;
    const next = claudeStylePromptDraft;
    setClaudeStylePromptSaving(true);
    updateConfigValue('claude-style-prompt', next);

    try {
      await configApi.updateClaudeStylePrompt(next);
      clearCache('claude-style-prompt');
      showNotification(
        t('notification.claude_style_prompt_updated', {
          defaultValue: 'Claude 风格提示词已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('claude-style-prompt', previous);
      setClaudeStylePromptDraft(previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setClaudeStylePromptSaving(false);
    }
  };

  const handleClaudeReasoningEffortChange = async (effort: string) => {
    if (!config) return;

    const previous = claudeToGptReasoningEffort;
    setClaudeReasoningEffortSaving(true);
    updateConfigValue('claude-to-gpt-reasoning-effort', effort);

    try {
      await configApi.updateClaudeToGptReasoningEffort(effort);
      clearCache('claude-to-gpt-reasoning-effort');
      showNotification(
        t('notification.claude_to_gpt_reasoning_effort_updated', {
          defaultValue: 'Claude 全局转 GPT 推理强度已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('claude-to-gpt-reasoning-effort', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setClaudeReasoningEffortSaving(false);
    }
  };

  const handleClaudeOpus1MToggle = async (allowed: boolean) => {
    if (!config) return;

    const previous = disableClaudeOpus1M;
    const nextDisableClaudeOpus1M = !allowed;
    setClaudeOpus1MSaving(true);
    updateConfigValue('disable-claude-opus-1m', nextDisableClaudeOpus1M);

    try {
      await configApi.updateDisableClaudeOpus1M(nextDisableClaudeOpus1M);
      clearCache('disable-claude-opus-1m');
      showNotification(
        t('notification.claude_opus_1m_updated', {
          defaultValue: '全局 1M 上下文窗口策略已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('disable-claude-opus-1m', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setClaudeOpus1MSaving(false);
    }
  };

  const handlePromptTokenLimitToggle = async (enabled: boolean) => {
    if (!config) return;

    const previous = disablePromptTokenLimit;
    const nextDisabled = !enabled;
    setPromptTokenLimitSaving(true);
    updateConfigValue('disable-prompt-token-limit', nextDisabled);

    try {
      await configApi.updateDisablePromptTokenLimit(nextDisabled);
      clearCache('disable-prompt-token-limit');
      showNotification(
        t('notification.prompt_token_limit_updated', {
          defaultValue: 'Prompt Token 大小限制已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('disable-prompt-token-limit', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setPromptTokenLimitSaving(false);
    }
  };

  const handleClaudeCodeOnlyToggle = async (enabled: boolean) => {
    if (!config) return;

    const previous = claudeCodeOnlyEnabled;
    setClaudeCodeOnlySaving(true);
    updateConfigValue('claude-code-only-enabled', enabled);

    try {
      await configApi.updateClaudeCodeOnlyEnabled(enabled);
      clearCache('claude-code-only-enabled');
      showNotification(
        t('notification.claude_code_only_updated', {
          defaultValue: 'Claude Code 客户端限制已更新',
        }),
        'success'
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('claude-code-only-enabled', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setClaudeCodeOnlySaving(false);
    }
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogDraft(requestLogEnabled);
    setRequestLogModalOpen(true);
  }, [requestLogEnabled]);

  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
      openRequestLogModal();
      return;
    }

    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  }, [openRequestLogModal]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', requestLogDraft);

    try {
      await configApi.updateRequestLog(requestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    if (requestLogModalOpen && !requestLogTouched) {
      setRequestLogDraft(requestLogEnabled);
    }
  }, [requestLogModalOpen, requestLogTouched, requestLogEnabled]);

  useEffect(() => {
    setClaudeStylePromptDraft(claudeStylePrompt);
  }, [claudeStylePrompt]);

  useEffect(() => {
    return () => {
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('system_info.title')}</h1>
      <div className={styles.content}>
        <Card className={styles.aboutCard}>
          <div className={styles.aboutHeader}>
            <img src={INLINE_LOGO_JPEG} alt="CPAMC" className={styles.aboutLogo} />
            <div className={styles.aboutTitle}>{t('system_info.about_title')}</div>
          </div>

          <div className={styles.aboutInfoGrid}>
            <button
              type="button"
              className={`${styles.infoTile} ${styles.tapTile}`}
              onClick={handleInfoVersionTap}
            >
              <div className={styles.tileLabel}>{t('footer.version')}</div>
              <div className={styles.tileValue}>{appVersion}</div>
            </button>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('footer.api_version')}</div>
              <div className={styles.tileValue}>{apiVersion}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('footer.build_date')}</div>
              <div className={styles.tileValue}>{buildTime}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('connection.status')}</div>
              <div className={styles.tileValue}>{t(`common.${auth.connectionStatus}_status`)}</div>
              <div className={styles.tileSub}>{auth.apiBase || '-'}</div>
            </div>
          </div>

          <div className={styles.aboutActions}>
            <Button variant="secondary" size="sm" onClick={() => fetchConfig(undefined, true)}>
              {t('common.refresh')}
            </Button>
          </div>
        </Card>

        <Card title={t('system_info.quick_links_title')}>
          <p className={styles.sectionDescription}>{t('system_info.quick_links_desc')}</p>
          <div className={styles.quickLinks}>
            <a
              href="https://github.com/router-for-me/CLIProxyAPI"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconGithub size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_main_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_main_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconCode size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_webui_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_webui_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://help.router-for.me/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.docs}`}>
                <IconBookOpen size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_docs')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_docs_desc')}</div>
              </div>
            </a>
          </div>
        </Card>

        <Card
          title={t('system_info.models_title')}
          extra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchModels({ forceRefresh: true })}
              loading={modelsLoading}
            >
              {t('common.refresh')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.models_desc')}</p>
          {modelStatus && (
            <div className={`status-badge ${modelStatus.type}`}>{modelStatus.message}</div>
          )}
          {modelsError && <div className="error-box">{modelsError}</div>}
          {modelsLoading ? (
            <div className="hint">{t('common.loading')}</div>
          ) : models.length === 0 ? (
            <div className="hint">{t('system_info.models_empty')}</div>
          ) : (
            <div className="item-list">
              {groupedModels.map((group) => {
                const iconSrc = getIconForCategory(group.id);
                return (
                  <div key={group.id} className="item-row">
                    <div className="item-meta">
                      <div className={styles.groupTitle}>
                        {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                        <span className="item-title">{group.label}</span>
                      </div>
                      <div className="item-subtitle">
                        {t('system_info.models_count', { count: group.items.length })}
                      </div>
                    </div>
                    <div className={styles.modelTags}>
                      {group.items.map((model) => (
                        <span
                          key={`${model.name}-${model.alias ?? 'default'}`}
                          className={styles.modelTag}
                          title={model.description || ''}
                        >
                          <span className={styles.modelName}>{model.name}</span>
                          {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={t('system_info.clear_login_title')}>
          <p className={styles.sectionDescription}>{t('system_info.clear_login_desc')}</p>
          <div className={styles.clearLoginActions}>
            <Button variant="danger" onClick={handleClearLoginStorage}>
              {t('system_info.clear_login_button')}
            </Button>
          </div>
        </Card>

        <Card
          title={t('system_info.claude_to_gpt_title', {
            defaultValue: 'Claude 请求全局转 GPT',
          })}
        >
          <p className={styles.sectionDescription}>
            {t('system_info.claude_to_gpt_desc', {
              defaultValue:
                '开启后，所有客户端 API Key 发起的 Claude 模型请求都会默认改走 GPT 5.5；推理强度由下面的全局设置统一控制。',
            })}
          </p>
          <ToggleSwitch
            label={t('system_info.claude_to_gpt_toggle', {
              defaultValue: '启用全局 Claude 转 GPT',
            })}
            labelPosition="left"
            checked={claudeToGptRoutingEnabled}
            disabled={!canEditClaudeRouting}
            onChange={(value) => {
              void handleClaudeRoutingToggle(value);
            }}
          />
          <div className={styles.selectRow}>
            <div className={styles.selectLabelBlock}>
              <div className={styles.selectLabel}>
                {t('system_info.claude_to_gpt_mapping_label', {
                  defaultValue: '默认映射策略',
                })}
              </div>
              <div className={styles.selectHint}>
                {t('system_info.claude_to_gpt_mapping_hint', {
                  defaultValue:
                    '默认映射到 GPT-5.5；这里可以覆盖为 GPT-5.4 / GPT-5.2 / GPT-5.3 Codex。',
                })}
              </div>
            </div>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={claudeToGptTargetFamily}
                disabled={!canEditClaudeTargetFamily}
                onChange={(e) => {
                  void handleClaudeTargetFamilyChange(e.target.value);
                }}
                aria-label={t('system_info.claude_to_gpt_mapping_label', {
                  defaultValue: '默认映射策略',
                })}
              >
                {CLAUDE_GPT_TARGET_FAMILY_OPTIONS.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={styles.selectIcon}>
                <IconChevronDown size={16} />
              </span>
            </div>
          </div>
          <div className={styles.selectRow}>
            <div className={styles.selectLabelBlock}>
              <div className={styles.selectLabel}>
                {t('system_info.claude_to_gpt_reasoning_effort_label', {
                  defaultValue: '默认推理强度',
                })}
              </div>
              <div className={styles.selectHint}>
                {t('system_info.claude_to_gpt_reasoning_effort_hint', {
                  defaultValue:
                    '用于全局 Claude 转 GPT 默认映射的 reasoning effort。默认 High；内建 web search 请求仍会按现有兼容策略自动降到 medium。',
                })}
              </div>
            </div>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={claudeToGptReasoningEffort}
                disabled={!canEditClaudeReasoningEffort}
                onChange={(e) => {
                  void handleClaudeReasoningEffortChange(e.target.value);
                }}
                aria-label={t('system_info.claude_to_gpt_reasoning_effort_label', {
                  defaultValue: '默认推理强度',
                })}
              >
                {CLAUDE_GPT_REASONING_EFFORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className={styles.selectIcon}>
                <IconChevronDown size={16} />
              </span>
            </div>
          </div>
          <div className="hint">
            {t('system_info.claude_to_gpt_hint', {
              defaultValue:
                '如需让某个 API Key 继续使用 Claude，请到“API Key 策略”页面为该 Key 打开“启用 Claude 模型”。',
            })}
          </div>
        </Card>

        <Card
          title={t('system_info.disable_claude_opus_1m_title', {
            defaultValue: '允许 100 万 Token 上下文窗口',
          })}
        >
          <p className={styles.sectionDescription}>
            {t('system_info.disable_claude_opus_1m_desc', {
              defaultValue:
                '开启后，客户端 API Key 的 Claude 请求默认可保留 1M 上下文信号，并由后端按该 Key 的 GPT 路由承接。',
            })}
          </p>
          <ToggleSwitch
            label={t('system_info.disable_claude_opus_1m_toggle', {
              defaultValue: '允许全局 100 万 Token 上下文窗口',
            })}
            labelPosition="left"
            checked={globalClaudeOpus1MAllowed}
            disabled={!canEditClaudeOpus1M}
            onChange={(value) => {
              void handleClaudeOpus1MToggle(value);
            }}
          />
          <div className="hint">
            {t('system_info.disable_claude_opus_1m_hint', {
              defaultValue:
                '关闭后，服务端会默认去掉 1M 上下文信号；如需让某个 API Key 继续保留 1M，请到“API Key 策略”页面为该 Key 打开“允许 1M 上下文”。',
            })}
          </div>
        </Card>

        <Card
          title={t('system_info.prompt_token_limit_title', {
            defaultValue: 'Prompt Token 大小限制',
          })}
        >
          <p className={styles.sectionDescription}>
            {t('system_info.prompt_token_limit_desc', {
              defaultValue:
                '开启后，服务端会在请求进入上游前做 Prompt Token 大小预检；关闭后跳过这项预检，不代表承诺支持更大的上下文。',
            })}
          </p>
          <ToggleSwitch
            label={t('system_info.prompt_token_limit_toggle', {
              defaultValue: '启用 Prompt Token 大小限制',
            })}
            labelPosition="left"
            checked={promptTokenLimitEnabled}
            disabled={!canEditPromptTokenLimit}
            onChange={(value) => {
              void handlePromptTokenLimitToggle(value);
            }}
          />
          <div className="hint">
            {t('system_info.prompt_token_limit_hint', {
              defaultValue:
                '默认开启。关闭后服务端不再主动返回 Prompt 过长提示，超限请求会继续交给客户端或上游处理。',
            })}
          </div>
        </Card>

        <Card
          title={t('system_info.claude_code_only_title', {
            defaultValue: '默认仅允许 Claude Code',
          })}
        >
          <p className={styles.sectionDescription}>
            {t('system_info.claude_code_only_desc', {
              defaultValue:
                '开启后，客户端 API Key 默认只允许带 Claude Code 指纹的请求访问；其他直接走 API 的客户端会被拒绝。单个 API Key 可在策略页单独覆盖。',
            })}
          </p>
          <ToggleSwitch
            label={t('system_info.claude_code_only_toggle', {
              defaultValue: '启用全局 Claude Code 限制',
            })}
            labelPosition="left"
            checked={claudeCodeOnlyEnabled}
            disabled={!canEditClaudeCodeOnly}
            onChange={(value) => {
              void handleClaudeCodeOnlyToggle(value);
            }}
          />
          <div className="hint">
            {t('system_info.claude_code_only_hint', {
              defaultValue:
                '单个 API Key 可选择继承全局、强制仅允许 Claude Code，或关闭该限制，适合给特定 key 放行或单独加严。',
            })}
          </div>
        </Card>

        <Card
          title={t('system_info.claude_style_title', {
            defaultValue: 'Claude 风格提示词',
          })}
        >
          <p className={styles.sectionDescription}>
            {t('system_info.claude_style_desc', {
              defaultValue:
                '开启后，Claude 请求在内部改走 GPT 时会额外注入一层 Claude/Opus 风格提示词，用于收敛回答风格、行为方式和多轮任务处理习惯。',
            })}
          </p>
          <ToggleSwitch
            label={t('system_info.claude_style_toggle', {
              defaultValue: '启用 Claude 风格提示词',
            })}
            labelPosition="left"
            checked={claudeStyleEnabled}
            disabled={!canEditClaudeStyle}
            onChange={(value) => {
              void handleClaudeStyleToggle(value);
            }}
          />
          <div className={styles.promptEditor}>
            <div className={styles.promptHeader}>
              <div>
                <div className={styles.selectLabel}>
                  {t('system_info.claude_style_prompt_label', {
                    defaultValue: '提示词内容',
                  })}
                </div>
                <div className={styles.selectHint}>
                  {t('system_info.claude_style_prompt_hint', {
                    defaultValue:
                      '这里保存的是可迭代的 Claude 风格提示词；留空时会回退到内置默认模板。身份伪装规则仍会自动保留，不需要重复写模型身份。',
                  })}
                </div>
              </div>
              <div className={styles.promptActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canEditClaudeStylePrompt || claudeStylePromptDraft.length === 0}
                  onClick={() => setClaudeStylePromptDraft('')}
                >
                  {t('system_info.claude_style_prompt_reset', {
                    defaultValue: '恢复默认',
                  })}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void handleClaudeStylePromptSave();
                  }}
                  loading={claudeStylePromptSaving}
                  disabled={!canEditClaudeStylePrompt || !claudeStylePromptDirty}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
            <textarea
              className={`input ${styles.promptTextarea}`}
              rows={12}
              value={claudeStylePromptDraft}
              disabled={!canEditClaudeStylePrompt}
              onChange={(e) => setClaudeStylePromptDraft(e.target.value)}
              placeholder={t('system_info.claude_style_prompt_placeholder', {
                defaultValue: '留空则使用内置默认 Claude 风格模板。',
              })}
              aria-label={t('system_info.claude_style_prompt_label', {
                defaultValue: '提示词内容',
              })}
            />
          </div>
          <div className="hint">
            {t('system_info.claude_style_hint', {
              defaultValue:
                '这个开关只影响风格层，不会解决 Signature 等协议级指纹；它的目标是尽可能把输出风格、任务切换和执行习惯贴近 Claude Opus。',
            })}
          </div>
        </Card>
      </div>

      <Modal
        open={requestLogModalOpen}
        onClose={handleRequestLogClose}
        title={t('basic_settings.request_log_title')}
        footer={
          <>
            <Button variant="secondary" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRequestLogSave}
              loading={requestLogSaving}
              disabled={!canEditRequestLog || !requestLogDirty}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="request-log-modal">
          <div className="status-badge warning">{t('basic_settings.request_log_warning')}</div>
          <ToggleSwitch
            label={t('basic_settings.request_log_enable')}
            labelPosition="left"
            checked={requestLogDraft}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => {
              setRequestLogDraft(value);
              setRequestLogTouched(true);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
