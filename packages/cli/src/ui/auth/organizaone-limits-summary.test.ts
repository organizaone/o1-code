/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyInfo } from '@organizaone/o1-code-core/providers/organizaone-limits.js';
import {
  formatLowRateLimit,
  formatOrganizaOneKeyInfo,
  loadOrganizaOneKeySummary,
} from './organizaone-limits-summary.js';

const fetchKeyInfoMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@organizaone/o1-code-core/providers/organizaone-limits.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/organizaone-limits.js')
    >()),
    fetchKeyInfo: fetchKeyInfoMock,
  }),
);

const now = Date.parse('2026-10-09T10:00:00Z');

const info: KeyInfo = {
  device: { name: 'ana-laptop' },
  timeZone: 'UTC',
  dayReset: '2026-10-09T12:00:00.000Z',
  scopes: [
    {
      scope: 'user',
      limits: {
        requests_per_minute: 10,
        tokens_per_minute: null,
        tokens_per_day: 1000,
        spend_per_month_micros: 5_000_000,
      },
      usage: {
        requests_this_minute: 1,
        tokens_today: 7,
        spend_this_month_micros: 1_250_000,
      },
    },
    { scope: 'device', limits: { concurrent: null }, usage: {} },
  ],
  plan: {
    name: 'Pro',
    spend: { included: 20_000_000, used: 0, remaining: 20_000_000 },
    ceilingMicros: null,
    maxOutputTokens: 8192,
  },
  own: {
    enabled: true,
    caps: { credentials: 2, requests_per_day: 1000, tokens_per_day: null },
    usage: { rpd: 3, tpd: 900 },
  },
};

describe('formatOrganizaOneKeyInfo', () => {
  it('summarizes the plan, the limits that are set and when they reset', () => {
    const text = formatOrganizaOneKeyInfo(
      info,
      { requests: { limit: 10, remaining: 8 }, at: now },
      now,
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('OrganizaOne · plan Pro · ana-laptop');
    expect(text).toContain('Spent this period: $0.00 of $20.00');
    expect(text).toContain('Output per request: up to 8,192 tokens');
    expect(text).toContain(
      'Limits (user): 1/10 requests per minute · 7/1,000 tokens today · $1.25/$5.00 spent this month',
    );
    expect(text).not.toContain('Limits (device)');
    expect(text).not.toContain('tokens per minute');
    expect(text).toContain('Own credentials: 3/1,000 requests today');
    expect(text).toContain('(in 2h');
    expect(text).toContain('Last request: 8 of 10 requests left');
  });

  it('says so when the key has no limit at all', () => {
    const text = formatOrganizaOneKeyInfo(
      {
        scopes: [{ scope: 'user', limits: {}, usage: {} }],
        plan: null,
        own: null,
      },
      undefined,
      now,
    );
    expect(text).toBe('OrganizaOne\nNo request or token limits on this key.');
  });
});

describe('formatLowRateLimit', () => {
  it('names what is left and when the window refills', () => {
    expect(
      formatLowRateLimit({
        kind: 'requests',
        limit: 60,
        remaining: 2,
        resetMs: 45_000,
      }),
    ).toBe('OrganizaOne: 2 of 60 requests left; the window refills in 45s.');
    expect(
      formatLowRateLimit({ kind: 'tokens', limit: 1000, remaining: 0 }),
    ).toBe('OrganizaOne: 0 of 1,000 tokens left.');
  });
});

describe('loadOrganizaOneKeySummary', () => {
  beforeEach(() => {
    fetchKeyInfoMock.mockReset();
  });

  const configFor = (generator: {
    baseUrl?: string;
    apiKey?: string;
    connection?: 'o1-connect';
  }) => ({
    getContentGeneratorConfig: () =>
      generator as ReturnType<
        Parameters<
          typeof loadOrganizaOneKeySummary
        >[0]['getContentGeneratorConfig']
      >,
    getCliVersion: () => '1.2.3',
  });

  it('asks nothing for a model that does not go through OrganizaOne', async () => {
    await expect(
      loadOrganizaOneKeySummary(
        configFor({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk' }),
      ),
    ).resolves.toEqual({ status: 'not-organizaone' });
    expect(fetchKeyInfoMock).not.toHaveBeenCalled();
  });

  it('asks the tunnel with the session’s key', async () => {
    fetchKeyInfoMock.mockResolvedValue(info);
    const result = await loadOrganizaOneKeySummary(
      configFor({
        baseUrl: 'http://127.0.0.1:4242',
        apiKey: 'session-key',
        connection: 'o1-connect',
      }),
    );
    expect(result.status).toBe('ok');
    expect(fetchKeyInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://127.0.0.1:4242',
        apiKey: 'session-key',
        clientVersion: '1.2.3',
      }),
    );
  });

  it('reports a proxy that gives no answer', async () => {
    fetchKeyInfoMock.mockResolvedValue(null);
    await expect(
      loadOrganizaOneKeySummary(
        configFor({ baseUrl: 'https://api.organizaone.com', apiKey: 'k' }),
      ),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
