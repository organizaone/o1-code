/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorHeader } from '../utils/retryPolicy.js';
import { getErrorStatus } from '../utils/errors.js';
import { getRateLimitErrorDetails } from '../utils/rateLimit.js';
import {
  ORGANIZAONE_ANTHROPIC_BASE_URL,
  isOrganizaOneBaseUrl,
} from './presets/organizaone.js';

export const ORGANIZAONE_ACCOUNT_PATH = '/account';
const DEVICE_STATE_HEADER = 'x-o1gw-device-state';
export const KEY_EXPIRY_WARNING_DAYS = 7;

/**
 * Why a device token stopped working, from the proxy's 401 (contract §2.6):
 * the key expired (its owner renews it on the account page, or the user
 * signs in again), the device is suspended (only its owner or an admin can
 * resume it), or the device was removed or its key replaced (a plain
 * authentication error: the credential is stale and must be forgotten).
 */
export type OrganizaOneUnauthorized = {
  /** Set when the session reached the proxy through the o1-connect tunnel: the
   * way back is a new connection code, not the saved key. */
  via?: 'o1-connect';
} & (
  | { kind: 'expired'; message: string; accountUrl: string }
  | { kind: 'suspended'; message: string }
  | { kind: 'revoked'; message: string }
);

export function describeOrganizaOneUnauthorized(
  error: unknown,
  baseUrl: string | undefined,
  options: { tunnel?: boolean } = {},
): OrganizaOneUnauthorized | null {
  // Through the tunnel, `baseUrl` is the loopback endpoint; the answer is
  // still the proxy's.
  const tunnel = options.tunnel === true;
  if (!tunnel && !isOrganizaOneBaseUrl(baseUrl)) return null;
  if (getErrorStatus(error) !== 401) return null;
  const via = tunnel ? ({ via: 'o1-connect' } as const) : {};
  const state = getErrorHeader(error, DEVICE_STATE_HEADER);
  const details = getRateLimitErrorDetails(error);
  const serverMessage = details.providerMessage?.trim() ?? '';
  const accountUrl = new URL(
    ORGANIZAONE_ACCOUNT_PATH,
    tunnel ? ORGANIZAONE_ANTHROPIC_BASE_URL : baseUrl,
  ).toString();
  if (state === 'expired' || details.providerCode === 'device_expired') {
    return {
      ...via,
      kind: 'expired',
      message:
        (serverMessage || "This device's key expired.") +
        ` Renew it on your account page (${accountUrl} → My devices), or sign in again with /auth.`,
      accountUrl,
    };
  }
  if (state === 'suspended' || details.providerCode === 'device_suspended') {
    return {
      ...via,
      kind: 'suspended',
      message:
        serverMessage ||
        'This device is suspended: ask its owner or an administrator.',
    };
  }
  return {
    ...via,
    kind: 'revoked',
    message: tunnel
      ? 'OrganizaOne no longer accepts this device: it was removed or given a new connection code. Paste a new connection code with /auth.'
      : 'OrganizaOne no longer accepts this device: it was removed or its key was replaced. Sign in again with /auth.',
  };
}

/**
 * The warning to show at startup when the saved key expires within
 * KEY_EXPIRY_WARNING_DAYS, or null. `expiresAt` is the credential's ISO
 * date; a credential without one never expires as far as o1-code knows.
 */
export function organizaOneKeyExpiryWarning(
  expiresAt: string | null | undefined,
  accountUrl: string,
  now: number = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  const daysLeft = (at - now) / 86_400_000;
  if (daysLeft > KEY_EXPIRY_WARNING_DAYS) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  if (daysLeft <= 0) {
    return `Your OrganizaOne device key expired on ${day}: renew it on your account page (${accountUrl} → My devices) or sign in again with /auth.`;
  }
  return `Your OrganizaOne device key expires on ${day}: renew it on your account page (${accountUrl} → My devices) or sign in again with /auth.`;
}
