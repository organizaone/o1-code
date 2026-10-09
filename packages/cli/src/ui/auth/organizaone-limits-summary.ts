/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@organizaone/o1-code-core/config/config.js';
import {
  fetchKeyInfo,
  getLatestRateLimits,
  KEY_LIMIT_USAGE,
  OWN_CAP_USAGE,
  type KeyInfo,
  type LimitValues,
  type LowRateLimit,
  type RateLimitSnapshot,
  type UsageValues,
} from '@organizaone/o1-code-core/providers/organizaone-limits.js';
import { reachesOrganizaOne } from '@organizaone/o1-code-core/providers/presets/organizaone.js';
import { getCurrentLanguage, t } from '../../i18n/index.js';
import { formatDuration } from '../utils/formatters.js';

function count(value: number): string {
  return new Intl.NumberFormat(getCurrentLanguage()).format(value);
}

/** Micro-USD as dollars. */
function dollars(micros: number): string {
  return new Intl.NumberFormat(getCurrentLanguage(), {
    style: 'currency',
    currency: 'USD',
  }).format(micros / 1_000_000);
}

function duration(ms: number): string {
  return formatDuration(ms, { hideTrailingZeros: true });
}

function limitLabel(name: string, used: string, limit: string): string {
  switch (name) {
    case 'requests_per_minute':
      return t('{{used}}/{{limit}} requests per minute', { used, limit });
    case 'tokens_per_minute':
      return t('{{used}}/{{limit}} tokens per minute', { used, limit });
    case 'requests_per_day':
      return t('{{used}}/{{limit}} requests today', { used, limit });
    case 'tokens_per_day':
      return t('{{used}}/{{limit}} tokens today', { used, limit });
    case 'concurrent':
      return t('{{used}}/{{limit}} at once', { used, limit });
    case 'spend_per_day_micros':
      return t('{{used}}/{{limit}} spent today', { used, limit });
    case 'spend_per_month_micros':
      return t('{{used}}/{{limit}} spent this month', { used, limit });
    default:
      return `${used}/${limit} ${name}`;
  }
}

/** Each limit that is set, with what was used against it; none when no limit is set. */
function limitParts(
  limits: LimitValues,
  usage: UsageValues,
  usageKeys: Record<string, string>,
): string[] {
  const parts: string[] = [];
  for (const [name, usageKey] of Object.entries(usageKeys)) {
    const limit = limits[name];
    if (limit === null || limit === undefined) continue;
    const used = usage[usageKey] ?? 0;
    const isSpend = name.endsWith('_micros');
    parts.push(
      limitLabel(
        name,
        isSpend ? dollars(used) : count(used),
        isSpend ? dollars(limit) : count(limit),
      ),
    );
  }
  return parts;
}

function resetLine(iso: string | undefined, now: number): string | undefined {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return undefined;
  return t('Daily limits reset at {{time}} (in {{wait}}).', {
    time: new Date(at).toLocaleTimeString(getCurrentLanguage(), {
      hour: '2-digit',
      minute: '2-digit',
    }),
    wait: duration(Math.max(0, at - now)),
  });
}

function windowLine(snapshot: RateLimitSnapshot | undefined): string[] {
  if (!snapshot) return [];
  const parts: string[] = [];
  if (snapshot.requests) {
    parts.push(
      t('{{remaining}} of {{limit}} requests left', {
        remaining: count(snapshot.requests.remaining),
        limit: count(snapshot.requests.limit),
      }),
    );
  }
  if (snapshot.tokens) {
    parts.push(
      t('{{remaining}} of {{limit}} tokens left', {
        remaining: count(snapshot.tokens.remaining),
        limit: count(snapshot.tokens.limit),
      }),
    );
  }
  return [t('Last request: {{windows}}', { windows: parts.join(' · ') })];
}

/**
 * What the key may do, in a few lines: the plan and its spend, the output
 * cap, every limit that is set with its use, the own credentials' caps, and
 * when the daily limits reset.
 */
export function formatOrganizaOneKeyInfo(
  info: KeyInfo,
  latest?: RateLimitSnapshot,
  now: number = Date.now(),
): string {
  const heading = [
    'OrganizaOne',
    info.plan?.name ? t('plan {{name}}', { name: info.plan.name }) : undefined,
    info.device?.name,
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = [heading];

  const spend = info.plan?.spend;
  if (spend) {
    lines.push(
      spend.included === null
        ? t('Spent this period: {{used}}', { used: dollars(spend.used) })
        : t('Spent this period: {{used}} of {{included}}', {
            used: dollars(spend.used),
            included: dollars(spend.included),
          }),
    );
  }
  if (info.plan?.maxOutputTokens) {
    lines.push(
      t('Output per request: up to {{tokens}} tokens', {
        tokens: count(info.plan.maxOutputTokens),
      }),
    );
  }

  let anyLimit = false;
  for (const scope of info.scopes) {
    const parts = limitParts(scope.limits, scope.usage, KEY_LIMIT_USAGE);
    if (parts.length === 0) continue;
    anyLimit = true;
    lines.push(
      `${t('Limits ({{scope}})', { scope: scope.scope })}: ${parts.join(' · ')}`,
    );
  }
  if (!anyLimit) lines.push(t('No request or token limits on this key.'));

  if (info.own?.enabled) {
    const parts = limitParts(info.own.caps, info.own.usage, OWN_CAP_USAGE);
    if (parts.length > 0) {
      lines.push(`${t('Own credentials')}: ${parts.join(' · ')}`);
    }
  }

  const reset = resetLine(info.dayReset, now);
  if (reset) lines.push(reset);
  lines.push(...windowLine(latest));
  return lines.join('\n');
}

/**
 * Asks the proxy about the key of the active model and formats the answer.
 * `not-organizaone` when the model does not go through the proxy;
 * `unavailable` when the proxy gave no answer (an older proxy, the network).
 */
export async function loadOrganizaOneKeySummary(
  config: Pick<Config, 'getContentGeneratorConfig' | 'getCliVersion'>,
  signal?: AbortSignal,
): Promise<
  | { status: 'ok'; text: string }
  | { status: 'not-organizaone' }
  | { status: 'unavailable' }
> {
  const generator = config.getContentGeneratorConfig();
  if (!generator || !reachesOrganizaOne(generator)) {
    return { status: 'not-organizaone' };
  }
  const info = await fetchKeyInfo({
    baseUrl: generator.baseUrl ?? '',
    apiKey: generator.apiKey ?? '',
    signal,
    clientVersion: config.getCliVersion(),
  });
  if (!info) return { status: 'unavailable' };
  return {
    status: 'ok',
    text: formatOrganizaOneKeyInfo(info, getLatestRateLimits()),
  };
}

/** The warning for a window that is running out. */
export function formatLowRateLimit(low: LowRateLimit): string {
  const values = {
    remaining: count(low.remaining),
    limit: count(low.limit),
    wait: low.resetMs === undefined ? '' : duration(low.resetMs),
  };
  if (low.kind === 'requests') {
    return low.resetMs === undefined
      ? t('OrganizaOne: {{remaining}} of {{limit}} requests left.', values)
      : t(
          'OrganizaOne: {{remaining}} of {{limit}} requests left; the window refills in {{wait}}.',
          values,
        );
  }
  return low.resetMs === undefined
    ? t('OrganizaOne: {{remaining}} of {{limit}} tokens left.', values)
    : t(
        'OrganizaOne: {{remaining}} of {{limit}} tokens left; the window refills in {{wait}}.',
        values,
      );
}
