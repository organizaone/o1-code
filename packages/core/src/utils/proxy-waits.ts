/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorStatus } from './errors.js';
import { getRateLimitErrorDetails } from './rateLimit.js';
import { getErrorHeader, getRetryAfterDelayMs } from './retryPolicy.js';
import { QUOTA_EXHAUSTED_PREFIX } from './quotaErrorDetection.js';

/**
 * A wait past this is not waited out inside a turn: the request stops and
 * says when to try again. The proxy's per-minute and concurrency limits wait
 * seconds and are retried as usual; its daily limits reset at 00:00 UTC, and
 * a Claude subscription window can stay closed for hours.
 */
export const PROXY_LONG_WAIT_MS = 5 * 60_000;

/** OpenAI-protocol codes the OrganizaOne proxy uses for its own refusals. */
const PROXY_WAIT_CODES = new Set([
  'account_limit_exceeded',
  // The cap the person set on their own credentials (contract §3.5).
  'own_limit',
  'upstream_rate_limited',
  'provider_unavailable',
  'limits_unavailable',
]);

export interface ProxyWait {
  /** The account limit that refused the request, e.g. `user.requests_per_day`. */
  limit?: string;
  /** When the request can be made again. */
  resetAt: Date;
  waitMs: number;
  /** The proxy's own words. */
  message?: string;
}

/**
 * The wait the OrganizaOne proxy asks for on a 429 or 503 of its own, or
 * null for any other error. Recognized by what only the proxy sends: the
 * `x-o1gw-limit` header (account limits, either protocol), its OpenAI error
 * codes, or on the Anthropic protocol (whose body carries no code) its
 * usage-window wording.
 */
export function readProxyWait(
  error: unknown,
  now: number = Date.now(),
): ProxyWait | null {
  const status = getErrorStatus(error);
  if (status !== 429 && status !== 503) return null;
  const details = getRateLimitErrorDetails(error);
  const limit = getErrorHeader(error, 'x-o1gw-limit') ?? undefined;
  const ours =
    limit !== undefined ||
    (details.providerCode !== undefined &&
      PROXY_WAIT_CODES.has(details.providerCode)) ||
    /usage limit is reached/i.test(details.providerMessage ?? '');
  if (!ours) return null;
  const resetHeader = getErrorHeader(error, 'x-o1gw-limit-reset');
  const resetFromHeader = resetHeader ? Date.parse(resetHeader) : NaN;
  const retryAfterMs = getRetryAfterDelayMs(error);
  const waitMs =
    retryAfterMs ??
    (Number.isFinite(resetFromHeader) ? Math.max(0, resetFromHeader - now) : 0);
  const resetAt = new Date(
    Number.isFinite(resetFromHeader) ? resetFromHeader : now + waitMs,
  );
  return {
    ...(limit ? { limit } : {}),
    resetAt,
    waitMs,
    ...(details.providerMessage ? { message: details.providerMessage } : {}),
  };
}

/** Whether the proxy asks for a wait too long to hold a turn for. */
export function isLongProxyWait(error: unknown, now?: number): boolean {
  const wait = readProxyWait(error, now);
  return wait !== null && wait.waitMs > PROXY_LONG_WAIT_MS;
}

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * What the person reads when a long wait stops the request: the proxy's own
 * message, when it can be retried (local time, and how long from now), and
 * that nothing is retried meanwhile. Surfaced verbatim (quota prefix).
 */
export function formatProxyWaitMessage(
  error: unknown,
  now: number = Date.now(),
): string {
  const wait = readProxyWait(error, now);
  const reason =
    wait?.message?.replace(/^\d{3}\s+/, '').trim() ||
    (wait?.limit
      ? `The account limit ${wait.limit} is reached.`
      : 'The provider asks to wait.');
  const when = wait
    ? `Try again at ${wait.resetAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })} (in ${formatDuration(wait.waitMs)}).`
    : '';
  return `${QUOTA_EXHAUSTED_PREFIX}${reason}\n\n${when} The request was not retried; send it again then, or switch to another model or provider.`.trim();
}
