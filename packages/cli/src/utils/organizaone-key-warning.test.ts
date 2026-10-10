/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { organizaOneStartupWarnings } from './organizaone-key-warning.js';

const now = Date.parse('2026-10-04T12:00:00Z');

describe('organizaOneStartupWarnings', () => {
  it('warns when the active OrganizaOne key expires within seven days', () => {
    const warnings = organizaOneStartupWarnings({
      baseUrl: 'https://api.organizaone.com',
      readCredential: () => ({
        apiKey: 'o1gw_x',
        savedAt: '',
        expiresAt: '2026-10-08T00:00:00Z',
      }),
      now,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('expires on 2026-10-08');
    expect(warnings[0]).toContain('https://api.organizaone.com/account');
  });

  it('stays quiet for another provider, a key without expiry, or a far expiry', () => {
    expect(
      organizaOneStartupWarnings({
        baseUrl: 'https://api.openai.com/v1',
        readCredential: () => ({
          apiKey: 'k',
          savedAt: '',
          expiresAt: '2026-10-05T00:00:00Z',
        }),
        now,
      }),
    ).toEqual([]);
    expect(
      organizaOneStartupWarnings({
        baseUrl: 'https://api.organizaone.com',
        readCredential: () => ({ apiKey: 'k', savedAt: '' }),
        now,
      }),
    ).toEqual([]);
    expect(
      organizaOneStartupWarnings({
        baseUrl: 'https://api.organizaone.com',
        readCredential: () => ({
          apiKey: 'k',
          savedAt: '',
          expiresAt: '2027-01-01T00:00:00Z',
        }),
        now,
      }),
    ).toEqual([]);
    expect(
      organizaOneStartupWarnings({
        baseUrl: 'https://api.organizaone.com',
        readCredential: () => undefined,
        now,
      }),
    ).toEqual([]);
  });
});
