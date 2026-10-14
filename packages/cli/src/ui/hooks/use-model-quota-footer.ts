/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import {
  fetchKeyInfo,
  type KeyInfo,
} from '@organizaone/o1-code-core/providers/organizaone-limits.js';
import { reachesOrganizaOne } from '@organizaone/o1-code-core/providers/presets/organizaone.js';
import { t } from '../../i18n/index.js';

export type ModelQuotaWindow = NonNullable<
  NonNullable<KeyInfo['modelQuota']>['windows'][number]
>;

export interface ModelQuotaFooterState {
  fiveHour?: ModelQuotaWindow;
  weekly?: ModelQuotaWindow;
}

const REFRESH_INTERVAL_MS = 60_000;
const LOW_REMAINING_PERCENT = 20;

function hasQuotaPercent(
  window: ModelQuotaWindow,
): window is ModelQuotaWindow & { usedPercent: number } {
  return (
    typeof window.usedPercent === 'number' &&
    Number.isFinite(window.usedPercent) &&
    window.usedPercent >= 0 &&
    window.usedPercent <= 100
  );
}

function isFiveHour(window: ModelQuotaWindow): boolean {
  return window.id === 'five_hour' || /(?:^|\b)5[ -]?hour\b/i.test(window.name);
}

function isWeekly(window: ModelQuotaWindow): boolean {
  return window.id?.includes('week') === true || /week/i.test(window.name);
}

function hasLowRemainingQuota(window: ModelQuotaWindow): boolean {
  return (
    hasQuotaPercent(window) && 100 - window.usedPercent <= LOW_REMAINING_PERCENT
  );
}

export function selectModelQuotaFooterState(
  quota: KeyInfo['modelQuota'] | undefined,
): ModelQuotaFooterState | undefined {
  if (!quota) return undefined;
  const fiveHour = quota.windows.find(
    (window) => isFiveHour(window) && hasQuotaPercent(window),
  );
  const weekly = quota.windows.find(
    (window) => isWeekly(window) && hasQuotaPercent(window),
  );
  return fiveHour || weekly ? { fiveHour, weekly } : undefined;
}

/**
 * Polls the selected OrganizaOne model's read-only quota endpoint only while
 * the user has asked to see it. A low weekly window warns once per reset.
 */
export function useModelQuotaFooter(
  enabled: boolean,
  config: Pick<Config, 'getContentGeneratorConfig' | 'getCliVersion'>,
  onWeeklyLow: (window: ModelQuotaWindow) => void,
): ModelQuotaFooterState | undefined {
  const generator = config.getContentGeneratorConfig();
  const baseUrl = generator?.baseUrl;
  const apiKey = generator?.apiKey;
  const connection = generator?.connection;
  const model = generator?.model;
  const warnedWindows = useRef(new Set<string>());
  const [quota, setQuota] = useState<ModelQuotaFooterState>();

  useEffect(() => {
    if (!enabled || !baseUrl || !reachesOrganizaOne({ baseUrl, connection })) {
      setQuota(undefined);
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    const refresh = async () => {
      const info = await fetchKeyInfo({
        baseUrl: baseUrl ?? '',
        apiKey: apiKey ?? '',
        signal: controller.signal,
        clientVersion: config.getCliVersion(),
        model,
      });
      if (disposed) return;
      const next = selectModelQuotaFooterState(info?.modelQuota);
      setQuota(next);
      const weekly = next?.weekly;
      if (!weekly || !hasLowRemainingQuota(weekly)) return;
      const key = `${weekly.id ?? weekly.name}:${weekly.resetsAt ?? ''}`;
      if (warnedWindows.current.has(key)) return;
      warnedWindows.current.add(key);
      onWeeklyLow(weekly);
    };

    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [apiKey, baseUrl, config, connection, enabled, model, onWeeklyLow]);

  return quota;
}

export function isWeeklyQuotaLow(window: ModelQuotaWindow): boolean {
  return hasLowRemainingQuota(window);
}

export function formatWeeklyQuotaWarning(window: ModelQuotaWindow): string {
  const used = Math.min(100, Math.max(0, window.usedPercent ?? 0));
  const remaining = Math.floor(100 - used);
  return t(
    'OrganizaOne: {{quota}} is near its limit: {{remaining}}% remains.',
    {
      quota: window.name,
      remaining: String(remaining),
    },
  );
}
