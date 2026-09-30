/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  formatProxyWaitMessage,
  isLongProxyWait,
  PROXY_LONG_WAIT_MS,
  readProxyWait,
} from './proxy-waits.js';

const now = Date.parse('2026-09-30T20:00:00Z');

// Errors as the SDKs build them from the proxy's answers (limits.ts,
// resilience.ts in ai-proxy-provider 6.0).
const openaiError = (
  status: number,
  body: object,
  headers: Record<string, string>,
) => OpenAI.APIError.generate(status, body, undefined, new Headers(headers));
const anthropicError = (
  status: number,
  body: object,
  headers: Record<string, string>,
  // This SDK version keeps headers as a plain record.
) => Anthropic.APIError.generate(status, body, undefined, headers);

const dailyLimit = (retryAfter: string) =>
  openaiError(
    429,
    {
      error: {
        message: 'Your account reached its daily request limit.',
        type: 'rate_limit_error',
        code: 'account_limit_exceeded',
      },
    },
    {
      'retry-after': retryAfter,
      'x-aipp-limit': 'user.requests_per_day',
      'x-aipp-limit-reset': '2026-10-01T00:00:00.000Z',
    },
  );

describe('readProxyWait', () => {
  it('reads an account limit on the OpenAI protocol', () => {
    expect(readProxyWait(dailyLimit('14400'), now)).toEqual({
      limit: 'user.requests_per_day',
      resetAt: new Date('2026-10-01T00:00:00.000Z'),
      waitMs: 14_400_000,
      message: 'Your account reached its daily request limit.',
    });
  });

  it('reads an account limit on the Anthropic protocol by its header', () => {
    const error = anthropicError(
      429,
      { type: 'error', error: { type: 'rate_limit_error', message: 'limit' } },
      {
        'retry-after': '2',
        'x-aipp-limit': 'user.requests_per_minute',
        'x-aipp-limit-reset': '2026-09-30T20:00:02.000Z',
      },
    );
    expect(readProxyWait(error, now)).toMatchObject({
      limit: 'user.requests_per_minute',
      waitMs: 2000,
    });
    expect(isLongProxyWait(error, now)).toBe(false);
  });

  it('reads a closed Claude window on the Anthropic protocol', () => {
    const error = anthropicError(
      429,
      {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message:
            "Claude's usage limit is reached (five hour window); it resets at 2026-09-30T23:00:00.000Z.",
        },
      },
      { 'retry-after': '10800' },
    );
    expect(isLongProxyWait(error, now)).toBe(true);
  });

  it('reads a provider cooling down', () => {
    const error = openaiError(
      503,
      {
        error: {
          message: 'This model provider is temporarily unavailable.',
          type: 'server_error',
          code: 'provider_unavailable',
        },
      },
      { 'retry-after': '60' },
    );
    expect(readProxyWait(error, now)?.waitMs).toBe(60_000);
    expect(isLongProxyWait(error, now)).toBe(false);
  });

  it('ignores a rate limit that is not the proxy', () => {
    const error = openaiError(
      429,
      { error: { message: 'Rate limit', type: 'requests', code: null } },
      { 'retry-after': '3600' },
    );
    expect(readProxyWait(error, now)).toBeNull();
    expect(isLongProxyWait(error, now)).toBe(false);
  });
});

describe('isLongProxyWait', () => {
  it('holds a turn for waits up to the limit, not past it', () => {
    const limitSeconds = PROXY_LONG_WAIT_MS / 1000;
    expect(isLongProxyWait(dailyLimit(String(limitSeconds)), now)).toBe(false);
    expect(isLongProxyWait(dailyLimit(String(limitSeconds + 1)), now)).toBe(
      true,
    );
  });
});

describe('formatProxyWaitMessage', () => {
  it('says why, when to try again, and that nothing was retried', () => {
    const message = formatProxyWaitMessage(dailyLimit('14400'), now);
    expect(message).toMatch(/daily request limit/);
    expect(message).toMatch(/in 4 h\)/);
    expect(message).toMatch(/not retried/);
  });
});
