/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 *
 * What the OrganizaOne proxy says about the key's limits (contract §3.5):
 * `GET /v1/key` on demand, and OpenAI's `x-ratelimit-*` headers on every
 * admitted request, which name the account's tightest windows.
 */

import { fetchWithPolicy } from '../utils/fetch.js';
import { o1CodeUserAgent } from './client-identity.js';
import { ORGANIZAONE_CLIENT_HEADERS } from './presets/organizaone.js';

const KEY_TIMEOUT_MS = 5000;
const KEY_MAX_BYTES = 256 * 1024;

// ---------------------------------------------------------------------------
// x-ratelimit-* headers
// ---------------------------------------------------------------------------

const DURATION_PART = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
const DURATION = /^(?:\d+(?:\.\d+)?(?:ms|h|m|s))+$/;
const UNIT_MS: Record<string, number> = {
  h: 3_600_000,
  m: 60_000,
  s: 1000,
  ms: 1,
};

/** A reset written as Go writes a duration (`45s`, `6m0s`, `13h2m5s`), in ms. */
export function parseLimitResetDuration(value: string): number | undefined {
  const text = value.trim();
  if (!DURATION.test(text)) return undefined;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(DURATION_PART)) {
    total += Number(amount) * UNIT_MS[unit!]!;
  }
  return Math.round(total);
}

export type RateLimitKind = 'requests' | 'tokens';

export interface RateLimitWindow {
  limit: number;
  remaining: number;
  /** Until the window has fully refilled, from when the answer arrived. */
  resetMs?: number;
}

export interface RateLimitSnapshot {
  requests?: RateLimitWindow;
  tokens?: RateLimitWindow;
  /** When the answer arrived (epoch ms). */
  at: number;
}

interface HeaderSource {
  get(name: string): string | null;
}

function nonNegativeInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

function readWindow(
  headers: HeaderSource,
  kind: RateLimitKind,
): RateLimitWindow | undefined {
  const limit = nonNegativeInteger(headers.get(`x-ratelimit-limit-${kind}`));
  const remaining = nonNegativeInteger(
    headers.get(`x-ratelimit-remaining-${kind}`),
  );
  if (limit === undefined || remaining === undefined) return undefined;
  const reset = headers.get(`x-ratelimit-reset-${kind}`);
  const resetMs = reset === null ? undefined : parseLimitResetDuration(reset);
  return { limit, remaining, ...(resetMs === undefined ? {} : { resetMs }) };
}

/** The windows a response names; null when it names none (a kind no limit caps is absent). */
export function readRateLimitHeaders(
  headers: HeaderSource,
  now: number = Date.now(),
): RateLimitSnapshot | null {
  const requests = readWindow(headers, 'requests');
  const tokens = readWindow(headers, 'tokens');
  if (!requests && !tokens) return null;
  return {
    ...(requests ? { requests } : {}),
    ...(tokens ? { tokens } : {}),
    at: now,
  };
}

export interface LowRateLimit extends RateLimitWindow {
  kind: RateLimitKind;
}

/** A window is low at a tenth of its limit or less (at least one left counts). */
export function isLowWindow(window: RateLimitWindow): boolean {
  if (window.limit <= 0) return false;
  return window.remaining <= Math.max(1, Math.ceil(window.limit * 0.1));
}

let latest: RateLimitSnapshot | undefined;
const warned = new Set<RateLimitKind>();
const listeners = new Set<(low: LowRateLimit) => void>();

/**
 * Records the windows of a proxy response. Calls the listeners once when a
 * window falls low, and again only after it has refilled above the mark.
 */
export function recordRateLimitHeaders(
  headers: HeaderSource,
  now: number = Date.now(),
): void {
  const snapshot = readRateLimitHeaders(headers, now);
  if (!snapshot) return;
  latest = snapshot;
  for (const kind of ['requests', 'tokens'] as const) {
    const window = snapshot[kind];
    if (!window) continue;
    if (!isLowWindow(window)) {
      warned.delete(kind);
      continue;
    }
    if (warned.has(kind)) continue;
    warned.add(kind);
    for (const listener of listeners) {
      try {
        listener({ kind, ...window });
      } catch {
        // A listener's failure must not reach the request.
      }
    }
  }
}

/** The windows of the last proxy response this process saw. */
export function getLatestRateLimits(): RateLimitSnapshot | undefined {
  return latest;
}

/** Subscribes to windows falling low; returns the unsubscribe. */
export function onLowRateLimit(
  listener: (low: LowRateLimit) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forgets what was recorded (tests). */
export function resetRateLimitTracking(): void {
  latest = undefined;
  warned.clear();
  listeners.clear();
}

// ---------------------------------------------------------------------------
// GET /v1/key
// ---------------------------------------------------------------------------

/** Each limit and the usage it is counted against, as `/v1/key` names them. */
export const KEY_LIMIT_USAGE = {
  requests_per_minute: 'requests_this_minute',
  tokens_per_minute: 'tokens_this_minute',
  requests_per_day: 'requests_today',
  tokens_per_day: 'tokens_today',
  concurrent: 'in_flight',
  spend_per_day_micros: 'spend_today_micros',
  spend_per_month_micros: 'spend_this_month_micros',
} as const;

/** Each cap of the person's own credentials and its usage counter. */
export const OWN_CAP_USAGE = {
  requests_per_minute: 'rpm',
  requests_per_day: 'rpd',
  tokens_per_day: 'tpd',
  concurrent: 'concurrent',
} as const;

/** `null` is no limit. */
export type LimitValues = Record<string, number | null>;
export type UsageValues = Record<string, number>;

export interface KeyLimitScope {
  /** `user`, `team` or `device`; a request must pass every one. */
  scope: string;
  limits: LimitValues;
  usage: UsageValues;
}

export interface KeyInfo {
  device?: { name?: string; expiresAt?: string };
  timeZone?: string;
  dayReset?: string;
  monthReset?: string;
  scopes: KeyLimitScope[];
  plan: {
    name?: string;
    periodEnd?: string;
    /** Micro-USD. */
    spend?: {
      included: number | null;
      used: number;
      remaining: number | null;
      overage?: string;
    };
    ceilingMicros: number | null;
    maxOutputTokens: number | null;
  } | null;
  own: { enabled: boolean; caps: LimitValues; usage: UsageValues } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function numOrNull(value: unknown): number | null {
  return num(value) ?? null;
}

function limitValues(value: unknown): LimitValues {
  if (!isRecord(value)) return {};
  const out: LimitValues = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) out[key] = null;
    else if (num(entry) !== undefined) out[key] = entry as number;
  }
  return out;
}

function usageValues(value: unknown): UsageValues {
  if (!isRecord(value)) return {};
  const out: UsageValues = {};
  for (const [key, entry] of Object.entries(value)) {
    const n = num(entry);
    if (n !== undefined) out[key] = n;
  }
  return out;
}

function readPlan(value: unknown): KeyInfo['plan'] {
  if (!isRecord(value)) return null;
  const period = isRecord(value['period']) ? value['period'] : undefined;
  const allowances = isRecord(value['allowances'])
    ? value['allowances']
    : undefined;
  const spend = isRecord(allowances?.['spend'])
    ? allowances['spend']
    : undefined;
  const used = num(spend?.['used']);
  return {
    ...(str(value['name']) ? { name: str(value['name']) } : {}),
    ...(str(period?.['end']) ? { periodEnd: str(period?.['end']) } : {}),
    ...(spend && used !== undefined
      ? {
          spend: {
            included: numOrNull(spend['included']),
            used,
            remaining: numOrNull(spend['remaining']),
            ...(str(spend['overage'])
              ? { overage: str(spend['overage']) }
              : {}),
          },
        }
      : {}),
    ceilingMicros: numOrNull(value['ceiling_micros']),
    maxOutputTokens: numOrNull(value['max_output_tokens']),
  };
}

/** The `{ data: … }` answer of `GET /v1/key`, or null when it is not one. */
export function parseKeyInfo(body: unknown): KeyInfo | null {
  if (!isRecord(body) || !isRecord(body['data'])) return null;
  const data = body['data'];
  const limits = isRecord(data['limits']) ? data['limits'] : undefined;
  const rawScopes = limits?.['scopes'];
  if (!Array.isArray(rawScopes)) return null;
  const scopes: KeyLimitScope[] = [];
  for (const entry of rawScopes) {
    if (!isRecord(entry) || !str(entry['scope'])) continue;
    scopes.push({
      scope: entry['scope'] as string,
      limits: limitValues(entry['limits']),
      usage: usageValues(entry['usage']),
    });
  }
  const device = isRecord(data['device']) ? data['device'] : undefined;
  const own = isRecord(data['own']) ? data['own'] : undefined;
  return {
    ...(device
      ? {
          device: {
            ...(str(device['name']) ? { name: str(device['name']) } : {}),
            ...(str(device['expires_at'])
              ? { expiresAt: str(device['expires_at']) }
              : {}),
          },
        }
      : {}),
    ...(str(limits?.['time_zone'])
      ? { timeZone: str(limits?.['time_zone']) }
      : {}),
    ...(str(limits?.['day_reset'])
      ? { dayReset: str(limits?.['day_reset']) }
      : {}),
    ...(str(limits?.['month_reset'])
      ? { monthReset: str(limits?.['month_reset']) }
      : {}),
    scopes,
    plan: readPlan(data['plan']),
    own: own
      ? {
          enabled: own['enabled'] === true,
          caps: limitValues(own['caps']),
          usage: usageValues(own['usage']),
        }
      : null,
  };
}

/** `/v1/key` beside the base URL, whether it was written with `/v1` or not. */
export function keyInfoUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/key`;
}

/**
 * Asks the proxy what the key may do. Spends nothing and counts toward no
 * limit. Null when the answer is not one (another provider, a network error).
 */
export async function fetchKeyInfo({
  baseUrl,
  apiKey,
  signal,
  clientVersion,
}: {
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
  clientVersion?: string;
}): Promise<KeyInfo | null> {
  if (!baseUrl.trim() || !apiKey.trim()) return null;
  try {
    const result = await fetchWithPolicy(keyInfoUrl(baseUrl), {
      timeoutMs: KEY_TIMEOUT_MS,
      maxBytes: KEY_MAX_BYTES,
      maxRedirects: 2,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
        'User-Agent': o1CodeUserAgent(clientVersion),
        ...ORGANIZAONE_CLIENT_HEADERS,
      },
      signal,
    });
    if (
      result.kind !== 'response' ||
      result.status < 200 ||
      result.status >= 300
    ) {
      return null;
    }
    return parseKeyInfo(JSON.parse(result.body.toString('utf8')));
  } catch {
    return null;
  }
}
