/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DeviceAuthError,
  defaultDeviceName,
  formatUserCode,
  pollDeviceToken,
  startDeviceAuthorization,
  type DeviceAuthorization,
  type FetchLike,
} from '../organizaone-device-auth.js';

const BASE = 'https://api.organizago.com';

type Scripted = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

function scriptedFetch(answers: Scripted[]) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const next = answers.shift();
    if (!next) throw new Error('no scripted answer left');
    const headers = new Map(
      Object.entries(next.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      status: next.status,
      headers: {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null,
      },
      json: async () => next.body,
    };
  };
  return { fetch, calls };
}

const started: DeviceAuthorization = {
  deviceCode: 'dev-1',
  userCode: 'BCDFGHJK',
  verificationUri: `${BASE}/device`,
  verificationUriComplete: `${BASE}/device?code=BCDF-GHJK`,
  expiresAt: 1_000_000 + 900_000,
  intervalMs: 5_000,
};

function fakeSleep() {
  const waits: number[] = [];
  return {
    waits,
    sleep: async (ms: number) => {
      waits.push(ms);
    },
  };
}

describe('startDeviceAuthorization', () => {
  it('posts the client id and device name and reads the code', async () => {
    const { fetch, calls } = scriptedFetch([
      {
        status: 200,
        body: {
          device_code: 'dev-1',
          user_code: 'BCDFGHJK',
          verification_uri: `${BASE}/device`,
          verification_uri_complete: `${BASE}/device?code=BCDF-GHJK`,
          expires_in: 900,
          interval: 5,
        },
      },
    ]);
    const auth = await startDeviceAuthorization({
      baseUrl: BASE,
      deviceName: 'o1-code on BOX',
      fetch,
      now: () => 1_000_000,
    });
    expect(calls[0]).toEqual({
      url: `${BASE}/oauth/device/code`,
      body: { client_id: 'o1-code', device_name: 'o1-code on BOX' },
    });
    expect(auth).toEqual(started);
  });

  it('names a refused app and a rate limit with its wait', async () => {
    const refused = scriptedFetch([
      {
        status: 400,
        body: {
          error: {
            type: 'invalid_client',
            code: 'invalid_client',
            message: 'x',
          },
        },
      },
    ]);
    await expect(
      startDeviceAuthorization({
        baseUrl: BASE,
        deviceName: 'n',
        fetch: refused.fetch,
      }),
    ).rejects.toMatchObject({ code: 'invalid_client' });

    const limited = scriptedFetch([
      { status: 429, headers: { 'Retry-After': '30' } },
    ]);
    await expect(
      startDeviceAuthorization({
        baseUrl: BASE,
        deviceName: 'n',
        fetch: limited.fetch,
      }),
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 30_000 });
  });

  it('cuts the device name to 64 characters', async () => {
    const { fetch, calls } = scriptedFetch([
      {
        status: 200,
        body: {
          device_code: 'd',
          user_code: 'u',
          verification_uri: 'https://x/device',
        },
      },
    ]);
    await startDeviceAuthorization({
      baseUrl: BASE,
      deviceName: 'x'.repeat(100),
      fetch,
    });
    expect(
      (calls[0]!.body as { device_name: string }).device_name,
    ).toHaveLength(64);
  });
});

describe('pollDeviceToken', () => {
  it('waits the interval, adds five seconds on slow_down, and returns the token', async () => {
    const { fetch } = scriptedFetch([
      { status: 400, body: { error: { code: 'authorization_pending' } } },
      { status: 400, body: { error: { code: 'slow_down' } } },
      { status: 400, body: { error: { code: 'authorization_pending' } } },
      {
        status: 200,
        body: {
          access_token: 'o1gw_abc',
          token_type: 'Bearer',
          device_id: 'dev-9',
          device_name: 'o1-code-on-BOX',
          expires_at: '2027-01-01T12:00:00.000Z',
        },
      },
    ]);
    const { sleep, waits } = fakeSleep();
    const token = await pollDeviceToken({
      baseUrl: BASE,
      authorization: started,
      fetch,
      sleep,
      now: () => 1_000_000,
    });
    expect(waits).toEqual([5_000, 5_000, 10_000, 10_000]);
    expect(token).toEqual({
      accessToken: 'o1gw_abc',
      deviceId: 'dev-9',
      deviceName: 'o1-code-on-BOX',
      expiresAt: '2027-01-01T12:00:00.000Z',
    });
  });

  it('keeps a null expires_at for a device made before keys expired', async () => {
    const { fetch } = scriptedFetch([
      { status: 200, body: { access_token: 'o1gw_old', expires_at: null } },
    ]);
    const token = await pollDeviceToken({
      baseUrl: BASE,
      authorization: started,
      fetch,
      sleep: fakeSleep().sleep,
      now: () => 1_000_000,
    });
    expect(token.expiresAt).toBeNull();
  });

  it.each([
    ['access_denied', 'access_denied'],
    ['expired_token', 'expired_token'],
    ['invalid_grant', 'invalid_grant'],
    ['invalid_client', 'invalid_client'],
  ])('ends on %s', async (wire, code) => {
    const { fetch } = scriptedFetch([
      { status: 400, body: { error: { code: wire } } },
    ]);
    await expect(
      pollDeviceToken({
        baseUrl: BASE,
        authorization: started,
        fetch,
        sleep: fakeSleep().sleep,
        now: () => 1_000_000,
      }),
    ).rejects.toMatchObject({ code });
  });

  it('honours Retry-After on a 429 instead of counting it as a decision', async () => {
    const { fetch } = scriptedFetch([
      { status: 429, headers: { 'Retry-After': '20' } },
      { status: 200, body: { access_token: 't' } },
    ]);
    const { sleep, waits } = fakeSleep();
    await pollDeviceToken({
      baseUrl: BASE,
      authorization: started,
      fetch,
      sleep,
      now: () => 1_000_000,
    });
    expect(waits).toEqual([5_000, 20_000]);
  });

  it('stops when the code expires without an answer', async () => {
    const { fetch } = scriptedFetch([
      { status: 400, body: { error: { code: 'authorization_pending' } } },
    ]);
    let clock = 1_000_000;
    const sleep = async (ms: number) => {
      clock += ms * 200; // the user never comes back
    };
    await expect(
      pollDeviceToken({
        baseUrl: BASE,
        authorization: started,
        fetch,
        sleep,
        now: () => clock,
      }),
    ).rejects.toMatchObject({ code: 'expired_token' });
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const { fetch } = scriptedFetch([]);
    const sleep = async () => {
      controller.abort();
    };
    await expect(
      pollDeviceToken({
        baseUrl: BASE,
        authorization: started,
        fetch,
        sleep,
        signal: controller.signal,
        now: () => 1_000_000,
      }),
    ).rejects.toBeInstanceOf(DeviceAuthError);
  });
});

describe('helpers', () => {
  it('formats the user code in two groups of four', () => {
    expect(formatUserCode('bcdfghjk')).toBe('BCDF-GHJK');
    expect(formatUserCode('BCDF-GHJK')).toBe('BCDF-GHJK');
  });

  it('names the device after the host', () => {
    expect(defaultDeviceName('WORKSTATION')).toBe('o1-code on WORKSTATION');
    expect(defaultDeviceName('')).toBe('o1-code on this machine');
  });
});
