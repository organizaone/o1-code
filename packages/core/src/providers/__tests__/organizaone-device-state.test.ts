/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  describeOrganizaOneUnauthorized,
  organizaOneKeyExpiryWarning,
} from '../organizaone-device-state.js';

const BASE = 'https://api.organizago.com';

function unauthorized(options: {
  state?: string;
  code?: string;
  message?: string;
  status?: number;
}) {
  const headers = new Headers();
  if (options.state) headers.set('x-o1gw-device-state', options.state);
  return {
    status: options.status ?? 401,
    headers,
    error: {
      type: 'authentication_error',
      ...(options.code ? { code: options.code } : {}),
      message: options.message ?? 'invalid key',
    },
    message: options.message ?? 'invalid key',
  };
}

describe('describeOrganizaOneUnauthorized', () => {
  it('ignores other hosts and other statuses', () => {
    expect(
      describeOrganizaOneUnauthorized(
        unauthorized({}),
        'https://api.openai.com/v1',
      ),
    ).toBeNull();
    expect(
      describeOrganizaOneUnauthorized(unauthorized({ status: 403 }), BASE),
    ).toBeNull();
  });

  it('reads an expired key from the header and keeps the server message', () => {
    const result = describeOrganizaOneUnauthorized(
      unauthorized({
        state: 'expired',
        message:
          "This device's key expired on 2026-10-01: renew it on your account page",
      }),
      BASE,
    );
    expect(result?.kind).toBe('expired');
    expect(result?.message).toContain('2026-10-01');
    expect(result?.message).toContain(`${BASE}/account`);
    expect(result?.message).toContain('/auth');
  });

  it('reads the OpenAI code when the header is missing', () => {
    expect(
      describeOrganizaOneUnauthorized(
        unauthorized({ code: 'device_suspended' }),
        BASE,
      )?.kind,
    ).toBe('suspended');
  });

  it('reads a 401 that came through the o1-connect tunnel as the proxy\x27s', () => {
    const direct = describeOrganizaOneUnauthorized(
      unauthorized({}),
      'http://127.0.0.1:4242',
    );
    expect(direct).toBeNull();
    const viaTunnel = describeOrganizaOneUnauthorized(
      unauthorized({}),
      'http://127.0.0.1:4242',
      { tunnel: true },
    );
    expect(viaTunnel).toMatchObject({ kind: 'revoked', via: 'o1-connect' });
    expect(viaTunnel?.message).toContain('connection code');
    const expired = describeOrganizaOneUnauthorized(
      unauthorized({ state: 'expired' }),
      'http://127.0.0.1:4242',
      { tunnel: true },
    );
    expect(expired?.kind).toBe('expired');
    expect(expired?.message).toContain('https://api.organizago.com/account');
  });

  it('treats a plain 401 as a removed device', () => {
    const result = describeOrganizaOneUnauthorized(unauthorized({}), BASE);
    expect(result?.kind).toBe('revoked');
    expect(result?.message).toContain('/auth');
  });
});

describe('organizaOneKeyExpiryWarning', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const account = `${BASE}/account`;

  it('is silent with no expiry or more than seven days left', () => {
    expect(organizaOneKeyExpiryWarning(null, account, now)).toBeNull();
    expect(organizaOneKeyExpiryWarning(undefined, account, now)).toBeNull();
    expect(
      organizaOneKeyExpiryWarning('2026-10-20T00:00:00Z', account, now),
    ).toBeNull();
    expect(organizaOneKeyExpiryWarning('not a date', account, now)).toBeNull();
  });

  it('warns within seven days, naming the day and the two ways out', () => {
    const warning = organizaOneKeyExpiryWarning(
      '2026-10-09T08:00:00Z',
      account,
      now,
    );
    expect(warning).toContain('expires on 2026-10-09');
    expect(warning).toContain(account);
    expect(warning).toContain('/auth');
  });

  it('says expired once the date has passed', () => {
    expect(
      organizaOneKeyExpiryWarning('2026-10-01T08:00:00Z', account, now),
    ).toContain('expired on 2026-10-01');
  });
});
