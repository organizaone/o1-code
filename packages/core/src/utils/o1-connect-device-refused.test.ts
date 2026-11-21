/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { retryWithBackoff } from './retry.js';
import { isO1ConnectDeviceRefused } from './o1-connect-device-refused.js';

const TEXT =
  "the proxy does not accept this device's key - run setup again with a new connection code";

function refused(): Error {
  return Object.assign(new Error(`502 ${TEXT}`), {
    status: 502,
    error: { type: 'error', error: { type: 'tunnel_error', message: TEXT } },
  });
}

describe('isO1ConnectDeviceRefused', () => {
  it('recognises the endpoint’s 502 by its text, in the message or the body', () => {
    expect(isO1ConnectDeviceRefused(refused())).toBe(true);
    expect(
      isO1ConnectDeviceRefused({ status: 502, message: `502 ${TEXT}` }),
    ).toBe(true);
    expect(
      isO1ConnectDeviceRefused({
        status: 502,
        message: '502 status code (no body)',
        error: { error: { message: TEXT } },
      }),
    ).toBe(true);
  });

  it('leaves another 502, another status and a non-error alone', () => {
    expect(
      isO1ConnectDeviceRefused({ status: 502, message: 'tunnel unavailable' }),
    ).toBe(false);
    expect(isO1ConnectDeviceRefused({ status: 401, message: TEXT })).toBe(
      false,
    );
    expect(isO1ConnectDeviceRefused(undefined)).toBe(false);
    expect(isO1ConnectDeviceRefused('text')).toBe(false);
  });
});

describe('a request the tunnel refuses for the device’s key', () => {
  it('is not sent again, unlike any other 502', async () => {
    const call = vi.fn(async () => {
      throw refused();
    });
    await expect(
      retryWithBackoff(call, { maxAttempts: 3, initialDelayMs: 1 }),
    ).rejects.toThrow(TEXT);
    expect(call).toHaveBeenCalledTimes(1);

    const transient = vi.fn(async () => {
      throw Object.assign(new Error('bad gateway'), { status: 502 });
    });
    await expect(
      retryWithBackoff(transient, {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 2,
      }),
    ).rejects.toThrow('bad gateway');
    expect(transient).toHaveBeenCalledTimes(3);
  });
});
