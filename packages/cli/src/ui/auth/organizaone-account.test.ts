/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredCredential } from '@organizaone/o1-code-core/providers/credential-store.js';
import {
  isOrganizaOneAccountLogin,
  organizaOneAccountCredential,
} from './organizaone-account.js';

const readCredentialMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@organizaone/o1-code-core/providers/credential-store.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/credential-store.js')
    >()),
    readCredential: readCredentialMock,
  }),
);

const deviceToken: StoredCredential = {
  apiKey: 'device-token',
  savedAt: '2026-10-13T00:00:00.000Z',
  expiresAt: '2026-11-13T00:00:00.000Z',
};

describe('organizaone-account', () => {
  beforeEach(() => {
    readCredentialMock.mockReset();
  });

  it('reads the account credential the OrganizaOne presets share', () => {
    readCredentialMock.mockReturnValue(deviceToken);

    expect(organizaOneAccountCredential()).toEqual(deviceToken);
    expect(readCredentialMock).toHaveBeenCalledWith('organizaone');
  });

  it('takes the device token of a browser sign-in as an account login', () => {
    readCredentialMock.mockReturnValue(deviceToken);

    expect(isOrganizaOneAccountLogin('device-token')).toBe(true);
  });

  it('takes a pasted API key as no account login', () => {
    readCredentialMock.mockReturnValue({
      ...deviceToken,
      expiresAt: undefined,
    });

    expect(isOrganizaOneAccountLogin('device-token')).toBe(false);
  });

  it('takes a key that is not the stored one as no account login', () => {
    readCredentialMock.mockReturnValue(deviceToken);

    expect(isOrganizaOneAccountLogin('other-key')).toBe(false);
    expect(isOrganizaOneAccountLogin(undefined)).toBe(false);
    expect(isOrganizaOneAccountLogin('')).toBe(false);
  });

  it('takes a missing credential as no account login', () => {
    readCredentialMock.mockReturnValue(undefined);

    expect(isOrganizaOneAccountLogin('device-token')).toBe(false);
  });
});
