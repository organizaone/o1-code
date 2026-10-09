/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithPolicy } from '../utils/fetch.js';
import {
  fetchKeyInfo,
  getLatestRateLimits,
  keyInfoUrl,
  onLowRateLimit,
  parseKeyInfo,
  parseLimitResetDuration,
  readRateLimitHeaders,
  recordRateLimitHeaders,
  resetRateLimitTracking,
} from './organizaone-limits.js';
import { reachesOrganizaOne } from './presets/organizaone.js';

vi.mock('../utils/fetch.js', () => ({ fetchWithPolicy: vi.fn() }));

const fetchMock = vi.mocked(fetchWithPolicy);

const windowHeaders = (values: Record<string, string>) => new Headers(values);

describe('parseLimitResetDuration', () => {
  it.each([
    ['45s', 45_000],
    ['6m0s', 360_000],
    ['13h2m5s', 46_925_000],
    ['1.5s', 1500],
    ['20ms', 20],
    [' 2m ', 120_000],
  ])('reads %s', (value, ms) => {
    expect(parseLimitResetDuration(value)).toBe(ms);
  });

  it.each(['', '45', 's', '1d', '-5s', '2026-10-09T00:00:00Z', '5s later'])(
    'refuses %j',
    (value) => {
      expect(parseLimitResetDuration(value)).toBeUndefined();
    },
  );
});

describe('readRateLimitHeaders', () => {
  it('reads both windows and their resets', () => {
    const snapshot = readRateLimitHeaders(
      windowHeaders({
        'x-ratelimit-limit-requests': '60',
        'x-ratelimit-remaining-requests': '59',
        'x-ratelimit-reset-requests': '1s',
        'x-ratelimit-limit-tokens': '1000',
        'x-ratelimit-remaining-tokens': '993',
        'x-ratelimit-reset-tokens': '13h2m5s',
      }),
      1000,
    );
    expect(snapshot).toEqual({
      requests: { limit: 60, remaining: 59, resetMs: 1000 },
      tokens: { limit: 1000, remaining: 993, resetMs: 46_925_000 },
      at: 1000,
    });
  });

  it('leaves out a kind no limit caps and a reset it cannot read', () => {
    expect(
      readRateLimitHeaders(
        windowHeaders({
          'x-ratelimit-limit-tokens': '1000',
          'x-ratelimit-remaining-tokens': '10',
          'x-ratelimit-reset-tokens': 'soon',
        }),
        5,
      ),
    ).toEqual({ tokens: { limit: 1000, remaining: 10 }, at: 5 });
  });

  it('reads nothing from a response without the headers or with bad numbers', () => {
    expect(readRateLimitHeaders(windowHeaders({}))).toBeNull();
    expect(
      readRateLimitHeaders(
        windowHeaders({
          'x-ratelimit-limit-requests': 'ten',
          'x-ratelimit-remaining-requests': '-1',
        }),
      ),
    ).toBeNull();
  });
});

describe('recordRateLimitHeaders', () => {
  beforeEach(() => resetRateLimitTracking());
  afterEach(() => resetRateLimitTracking());

  const requests = (remaining: number) =>
    windowHeaders({
      'x-ratelimit-limit-requests': '20',
      'x-ratelimit-remaining-requests': String(remaining),
      'x-ratelimit-reset-requests': '45s',
    });

  it('keeps the latest windows and warns once when one falls low', () => {
    const listener = vi.fn();
    onLowRateLimit(listener);

    recordRateLimitHeaders(requests(10), 1);
    expect(listener).not.toHaveBeenCalled();
    recordRateLimitHeaders(requests(2), 2);
    recordRateLimitHeaders(requests(1), 3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      kind: 'requests',
      limit: 20,
      remaining: 2,
      resetMs: 45_000,
    });
    expect(getLatestRateLimits()).toEqual({
      requests: { limit: 20, remaining: 1, resetMs: 45_000 },
      at: 3,
    });

    recordRateLimitHeaders(requests(20), 4);
    recordRateLimitHeaders(requests(0), 5);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops calling a listener after it unsubscribes', () => {
    const listener = vi.fn();
    const stop = onLowRateLimit(listener);
    stop();
    recordRateLimitHeaders(requests(0));
    expect(listener).not.toHaveBeenCalled();
  });
});

const keyAnswer = {
  data: {
    device: {
      id: 'd1',
      name: 'ana-laptop',
      expires_at: '2027-01-06T00:00:00.000Z',
    },
    limits: {
      time_zone: 'UTC',
      day_reset: '2026-10-10T00:00:00.000Z',
      month_reset: '2026-11-01T00:00:00.000Z',
      scopes: [
        {
          scope: 'user',
          limits: {
            requests_per_minute: 10,
            tokens_per_minute: null,
            requests_per_day: null,
            tokens_per_day: 1000,
            concurrent: null,
            spend_per_day_micros: null,
            spend_per_month_micros: null,
          },
          usage: {
            requests_this_minute: 1,
            tokens_this_minute: 7,
            requests_today: 1,
            tokens_today: 7,
            in_flight: 0,
            spend_today_micros: 0,
            spend_this_month_micros: 0,
          },
        },
        { scope: 'device', limits: {}, usage: {} },
      ],
    },
    plan: {
      name: 'Pro',
      version: 1,
      subscriber: 'user',
      period: { start: '2026-10-01', end: '2026-11-01' },
      allowances: {
        spend: {
          included: 20000000,
          overage: 'block',
          used: 0,
          remaining: 20000000,
        },
      },
      ceiling_micros: null,
      max_output_tokens: 8192,
    },
    own: {
      enabled: true,
      caps: {
        credentials: 2,
        requests_per_minute: null,
        requests_per_day: 1000,
        tokens_per_day: null,
        concurrent: null,
      },
      usage: { rpm: 0, rpd: 3, tpd: 900, concurrent: 0 },
    },
  },
};

describe('parseKeyInfo', () => {
  it('reads the contract’s example', () => {
    expect(parseKeyInfo(keyAnswer)).toEqual({
      device: { name: 'ana-laptop', expiresAt: '2027-01-06T00:00:00.000Z' },
      timeZone: 'UTC',
      dayReset: '2026-10-10T00:00:00.000Z',
      monthReset: '2026-11-01T00:00:00.000Z',
      scopes: [
        {
          scope: 'user',
          limits: keyAnswer.data.limits.scopes[0]!.limits,
          usage: keyAnswer.data.limits.scopes[0]!.usage,
        },
        { scope: 'device', limits: {}, usage: {} },
      ],
      plan: {
        name: 'Pro',
        periodEnd: '2026-11-01',
        spend: {
          included: 20000000,
          used: 0,
          remaining: 20000000,
          overage: 'block',
        },
        ceilingMicros: null,
        maxOutputTokens: 8192,
      },
      own: {
        enabled: true,
        caps: keyAnswer.data.own.caps,
        usage: keyAnswer.data.own.usage,
      },
    });
  });

  it('reads no plan and no own credentials as null', () => {
    const info = parseKeyInfo({
      data: { limits: { scopes: [] }, plan: null, own: null },
    });
    expect(info).toEqual({ scopes: [], plan: null, own: null });
  });

  it('refuses an answer that is not the key endpoint’s', () => {
    expect(parseKeyInfo(null)).toBeNull();
    expect(parseKeyInfo({ data: [] })).toBeNull();
    expect(parseKeyInfo({ data: { limits: {} } })).toBeNull();
    expect(parseKeyInfo({ object: 'list', data: [{ id: 'm' }] })).toBeNull();
  });
});

describe('fetchKeyInfo', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('asks /v1/key with the key, beside a base written with or without /v1', async () => {
    expect(keyInfoUrl('https://api.organizago.com')).toBe(
      'https://api.organizago.com/v1/key',
    );
    expect(keyInfoUrl('http://127.0.0.1:4242/v1/')).toBe(
      'http://127.0.0.1:4242/v1/key',
    );

    fetchMock.mockResolvedValue({
      kind: 'response',
      status: 200,
      body: Buffer.from(JSON.stringify(keyAnswer)),
    } as unknown as Awaited<ReturnType<typeof fetchWithPolicy>>);
    const info = await fetchKeyInfo({
      baseUrl: 'https://api.organizago.com/v1',
      apiKey: ' device-token ',
      clientVersion: '1.2.3',
    });
    expect(info?.plan?.name).toBe('Pro');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.organizago.com/v1/key');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer device-token',
      'X-Title': 'o1-code',
    });
  });

  it('answers null when the proxy refuses or cannot be reached', async () => {
    fetchMock.mockResolvedValue({
      kind: 'response',
      status: 404,
      body: Buffer.from('{}'),
    } as unknown as Awaited<ReturnType<typeof fetchWithPolicy>>);
    await expect(
      fetchKeyInfo({ baseUrl: 'https://api.organizago.com', apiKey: 'k' }),
    ).resolves.toBeNull();
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(
      fetchKeyInfo({ baseUrl: 'https://api.organizago.com', apiKey: 'k' }),
    ).resolves.toBeNull();
  });
});

describe('reachesOrganizaOne', () => {
  it('holds for the proxy and its tunnel only', () => {
    expect(
      reachesOrganizaOne({ baseUrl: 'https://api.organizago.com/v1' }),
    ).toBe(true);
    expect(
      reachesOrganizaOne({
        baseUrl: 'http://127.0.0.1:4242',
        connection: 'o1-connect',
      }),
    ).toBe(true);
    expect(reachesOrganizaOne({ baseUrl: 'https://api.openai.com/v1' })).toBe(
      false,
    );
  });
});
