/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Device authorization against the OrganizaOne proxy (o1-gateway), RFC 8628
 * as the proxy's contract fixes it: `POST /oauth/device/code` starts, the user
 * approves on the proxy's page, `POST /oauth/device/token` is polled until it
 * answers the device token. The password never passes through here; the
 * token comes once and is the credential o1-code stores.
 *
 * Everything that touches the network or the clock is injected, so the flow
 * is tested without a server and without waiting.
 */

export const DEVICE_AUTH_CLIENT_ID = 'o1-code';
const DEVICE_NAME_MAX = 64;
const SLOW_DOWN_STEP_MS = 5_000;
const MAX_INTERVAL_MS = 60_000;
const DEFAULT_INTERVAL_MS = 5_000;
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

export type DeviceAuthErrorCode =
  | 'invalid_client'
  | 'access_denied'
  | 'expired_token'
  | 'invalid_grant'
  | 'rate_limited'
  | 'unavailable'
  | 'aborted'
  | 'protocol';

export class DeviceAuthError extends Error {
  constructor(
    readonly code: DeviceAuthErrorCode,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'DeviceAuthError';
  }
}

export interface DeviceAuthorization {
  deviceCode: string;
  /** Shown as two groups of four, e.g. `BCDF-GHJK`. */
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  /** When the code stops being redeemable (epoch ms). */
  expiresAt: number;
  intervalMs: number;
}

export interface DeviceToken {
  accessToken: string;
  deviceId: string;
  deviceName: string;
  /** ISO 8601, or null for a device whose key never expires. */
  expiresAt: string | null;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

interface ErrorEnvelope {
  error?: { type?: unknown; code?: unknown; message?: unknown };
}

function readError(body: unknown): { code: string; message: string } {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code =
    typeof envelope.error?.code === 'string'
      ? envelope.error.code
      : typeof envelope.error?.type === 'string'
        ? envelope.error.type
        : '';
  const message =
    typeof envelope.error?.message === 'string' ? envelope.error.message : '';
  return { code, message };
}

function retryAfterMs(headers: { get(name: string): string | null }): number {
  const value = headers.get('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

/** `o1-code on <host>`, cut to what the proxy accepts. */
export function defaultDeviceName(hostname: string): string {
  // Control characters become spaces, as the proxy would do itself.
  const cleaned = Array.from(hostname, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? ' ' : char;
  })
    .join('')
    .trim();
  return `o1-code on ${cleaned || 'this machine'}`.slice(0, DEVICE_NAME_MAX);
}

/** Groups of four, as the proxy's page shows it. */
export function formatUserCode(userCode: string): string {
  const plain = userCode.replace(/-/g, '').toUpperCase();
  return plain.length === 8
    ? `${plain.slice(0, 4)}-${plain.slice(4)}`
    : userCode;
}

export async function startDeviceAuthorization(options: {
  baseUrl: string;
  deviceName: string;
  fetch: FetchLike;
  signal?: AbortSignal;
  now?: () => number;
}): Promise<DeviceAuthorization> {
  const now = options.now ?? Date.now;
  const response = await options.fetch(
    new URL('/oauth/device/code', options.baseUrl).toString(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: DEVICE_AUTH_CLIENT_ID,
        device_name: options.deviceName.slice(0, DEVICE_NAME_MAX),
      }),
      signal: options.signal,
    },
  );
  if (response.status === 429) {
    throw new DeviceAuthError(
      'rate_limited',
      'Too many sign-in attempts from this network. Try again in a few minutes.',
      retryAfterMs(response.headers),
    );
  }
  if (response.status === 503) {
    throw new DeviceAuthError(
      'unavailable',
      'OrganizaOne cannot start a sign-in right now. Try again in a moment.',
      retryAfterMs(response.headers),
    );
  }
  const body = await response.json().catch(() => undefined);
  if (response.status !== 200) {
    const { code, message } = readError(body);
    if (code === 'invalid_client') {
      throw new DeviceAuthError(
        'invalid_client',
        'OrganizaOne does not accept sign-ins from this app. Ask an administrator to register o1-code in the console.',
      );
    }
    throw new DeviceAuthError(
      'protocol',
      message ||
        `OrganizaOne answered ${response.status} to the sign-in start.`,
    );
  }
  const data = (body ?? {}) as Record<string, unknown>;
  const deviceCode = data['device_code'];
  const userCode = data['user_code'];
  const verificationUri = data['verification_uri'];
  if (
    typeof deviceCode !== 'string' ||
    typeof userCode !== 'string' ||
    typeof verificationUri !== 'string'
  ) {
    throw new DeviceAuthError(
      'protocol',
      'OrganizaOne answered the sign-in start without a code.',
    );
  }
  const expiresIn =
    typeof data['expires_in'] === 'number' ? data['expires_in'] : 900;
  const interval =
    typeof data['interval'] === 'number' && data['interval'] > 0
      ? data['interval']
      : DEFAULT_INTERVAL_MS / 1000;
  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete:
      typeof data['verification_uri_complete'] === 'string'
        ? data['verification_uri_complete']
        : verificationUri,
    expiresAt: now() + expiresIn * 1000,
    intervalMs: interval * 1000,
  };
}

/**
 * Polls until the user decides. `authorization_pending` waits the interval;
 * `slow_down` adds five seconds to it (at most a minute), as the RFC has the
 * client do; a 429 waits what `Retry-After` says. Ends with the token, or
 * with a DeviceAuthError: denied, expired, aborted, or a proxy that refuses
 * the app.
 */
export async function pollDeviceToken(options: {
  baseUrl: string;
  authorization: DeviceAuthorization;
  fetch: FetchLike;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  now?: () => number;
}): Promise<DeviceToken> {
  const now = options.now ?? Date.now;
  let intervalMs = options.authorization.intervalMs;
  const url = new URL('/oauth/device/token', options.baseUrl).toString();
  const body = JSON.stringify({
    grant_type: DEVICE_CODE_GRANT,
    device_code: options.authorization.deviceCode,
    client_id: DEVICE_AUTH_CLIENT_ID,
  });
  for (;;) {
    if (options.signal?.aborted) {
      throw new DeviceAuthError('aborted', 'Sign-in cancelled.');
    }
    if (now() >= options.authorization.expiresAt) {
      throw new DeviceAuthError(
        'expired_token',
        'The sign-in code expired before it was approved. Start again.',
      );
    }
    await options.sleep(intervalMs, options.signal);
    if (options.signal?.aborted) {
      throw new DeviceAuthError('aborted', 'Sign-in cancelled.');
    }
    const response = await options.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: options.signal,
    });
    if (response.status === 429) {
      intervalMs = Math.min(
        MAX_INTERVAL_MS,
        Math.max(intervalMs, retryAfterMs(response.headers) || intervalMs),
      );
      continue;
    }
    const data = await response.json().catch(() => undefined);
    if (response.status === 200) {
      const token = (data ?? {}) as Record<string, unknown>;
      const accessToken = token['access_token'];
      if (typeof accessToken !== 'string' || !accessToken) {
        throw new DeviceAuthError(
          'protocol',
          'OrganizaOne approved the device but sent no token.',
        );
      }
      return {
        accessToken,
        deviceId:
          typeof token['device_id'] === 'string' ? token['device_id'] : '',
        deviceName:
          typeof token['device_name'] === 'string' ? token['device_name'] : '',
        expiresAt:
          typeof token['expires_at'] === 'string' ? token['expires_at'] : null,
      };
    }
    const { code, message } = readError(data);
    switch (code) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        intervalMs = Math.min(MAX_INTERVAL_MS, intervalMs + SLOW_DOWN_STEP_MS);
        continue;
      case 'access_denied':
        throw new DeviceAuthError(
          'access_denied',
          'The sign-in was denied on the OrganizaOne page.',
        );
      case 'expired_token':
        throw new DeviceAuthError(
          'expired_token',
          'The sign-in code expired before it was approved. Start again.',
        );
      case 'invalid_grant':
        throw new DeviceAuthError(
          'invalid_grant',
          'OrganizaOne no longer recognizes this sign-in. Start again.',
        );
      case 'invalid_client':
        throw new DeviceAuthError(
          'invalid_client',
          'OrganizaOne does not accept sign-ins from this app. Ask an administrator to register o1-code in the console.',
        );
      default:
        throw new DeviceAuthError(
          'protocol',
          message ||
            `OrganizaOne answered ${response.status} while waiting for approval.`,
        );
    }
  }
}

/** A sleep that ends early when the signal aborts. */
export function abortableSleep(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', done);
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}
