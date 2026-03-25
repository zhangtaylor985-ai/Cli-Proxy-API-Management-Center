import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { USAGE_STATS_STALE_TIME_MS, useNotificationStore, useUsageStatsStore } from '@/stores';
import { modelPricesApi } from '@/services/api/modelPrices';
import { usageApi } from '@/services/api/usage';
import { downloadBlob } from '@/utils/download';
import { type ModelPrice } from '@/utils/usage';

export interface UsagePayload {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  apis?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UseUsageDataReturn {
  usage: UsagePayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: Record<string, ModelPrice>;
  setModelPrices: (prices: Record<string, ModelPrice>) => Promise<void>;
  loadUsage: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  importing: boolean;
}

export function useUsageData(): UseUsageDataReturn {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const usageSnapshot = useUsageStatsStore((state) => state.usage);
  const loading = useUsageStatsStore((state) => state.loading);
  const storeError = useUsageStatsStore((state) => state.error);
  const lastRefreshedAtTs = useUsageStatsStore((state) => state.lastRefreshedAt);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const modelPricesRef = useRef<Record<string, ModelPrice>>({});

  const loadModelPrices = useCallback(async () => {
    const data = await modelPricesApi.getModelPrices();
    const nextPrices: Record<string, ModelPrice> = {};
    for (const item of data?.prices ?? []) {
      if (!item?.model) continue;
      nextPrices[item.model] = {
        prompt: Number(item.prompt_usd_per_1m) || 0,
        completion: Number(item.completion_usd_per_1m) || 0,
        cache: Number(item.cached_usd_per_1m) || 0
      };
    }
    modelPricesRef.current = nextPrices;
    setModelPrices(nextPrices);
  }, []);

  const loadUsage = useCallback(async () => {
    await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [loadUsageStats]);

  useEffect(() => {
    void loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS }).catch(() => {});
    void loadModelPrices().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    });
  }, [loadModelPrices, loadUsageStats, showNotification, t]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportUsage();
      const exportedAt =
        typeof data?.exported_at === 'string' ? new Date(data.exported_at) : new Date();
      const safeTimestamp = Number.isNaN(exportedAt.getTime())
        ? new Date().toISOString()
        : exportedAt.toISOString();
      const filename = `usage-export-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
      downloadBlob({
        filename,
        blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' })
      });
      showNotification(t('usage_stats.export_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        showNotification(t('usage_stats.import_invalid'), 'error');
        return;
      }

      const result = await usageApi.importUsage(payload);
      showNotification(
        t('usage_stats.import_success', {
          added: result?.added ?? 0,
          skipped: result?.skipped ?? 0,
          total: result?.total_requests ?? 0,
          failed: result?.failed_requests ?? 0
        }),
        'success'
      );
      try {
        await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleSetModelPrices = useCallback(
    async (prices: Record<string, ModelPrice>) => {
      try {
        const previousPrices = modelPricesRef.current;
        const removedModels = Object.keys(previousPrices).filter((model) => !(model in prices));

        for (const model of removedModels) {
          await modelPricesApi.deleteModelPrice(model);
        }

        for (const [model, price] of Object.entries(prices)) {
          const prev = previousPrices[model];
          if (
            prev &&
            prev.prompt === price.prompt &&
            prev.completion === price.completion &&
            prev.cache === price.cache
          ) {
            continue;
          }
          await modelPricesApi.putModelPrice({
            model,
            prompt_usd_per_1m: price.prompt,
            completion_usd_per_1m: price.completion,
            cached_usd_per_1m: price.cache
          });
        }

        modelPricesRef.current = prices;
        setModelPrices(prices);
      } catch (err: unknown) {
        void loadModelPrices().catch(() => {});
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
        throw err;
      }
    },
    [loadModelPrices, showNotification, t]
  );

  const usage = usageSnapshot as UsagePayload | null;
  const error = storeError || '';
  const lastRefreshedAt = lastRefreshedAtTs ? new Date(lastRefreshedAtTs) : null;

  return {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices: handleSetModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing
  };
}
