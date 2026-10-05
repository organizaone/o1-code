/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { reactToOrganizaOneUnauthorized } from './organizaone-unauthorized.js';

describe('reactToOrganizaOneUnauthorized', () => {
  it('forgets a revoked credential and opens the sign-in with the reason', () => {
    const forget = vi.fn();
    const onAuthError = vi.fn();
    const handled = reactToOrganizaOneUnauthorized(
      {
        kind: 'revoked',
        message: 'OrganizaOne no longer accepts this device.',
      },
      { forget, onAuthError },
    );
    expect(handled).toBe(true);
    expect(forget).toHaveBeenCalledTimes(1);
    expect(onAuthError).toHaveBeenCalledWith(
      'OrganizaOne no longer accepts this device.',
    );
  });

  it('keeps an expired credential (its owner may renew it) and offers to sign in again', () => {
    const forget = vi.fn();
    const onAuthError = vi.fn();
    const handled = reactToOrganizaOneUnauthorized(
      {
        kind: 'expired',
        message: 'This key expired on 2026-10-01.',
        accountUrl: 'https://api.organizago.com/account',
      },
      { forget, onAuthError },
    );
    expect(handled).toBe(true);
    expect(forget).not.toHaveBeenCalled();
    expect(onAuthError).toHaveBeenCalledWith('This key expired on 2026-10-01.');
  });

  it('leaves a suspended device to the error display: signing in again does not help', () => {
    const forget = vi.fn();
    const onAuthError = vi.fn();
    const handled = reactToOrganizaOneUnauthorized(
      { kind: 'suspended', message: 'This device is suspended.' },
      { forget, onAuthError },
    );
    expect(handled).toBe(false);
    expect(forget).not.toHaveBeenCalled();
    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('forgets the tunnel configuration, not the key, when the device came through o1-connect', () => {
    const forget = vi.fn();
    const forgetTunnel = vi.fn();
    const onAuthError = vi.fn();
    const handled = reactToOrganizaOneUnauthorized(
      {
        kind: 'revoked',
        via: 'o1-connect',
        message: 'OrganizaOne no longer accepts this device.',
      },
      { forget, forgetTunnel, onAuthError },
    );
    expect(handled).toBe(true);
    expect(forget).not.toHaveBeenCalled();
    expect(forgetTunnel).toHaveBeenCalledTimes(1);
    expect(onAuthError).toHaveBeenCalledWith(
      'OrganizaOne no longer accepts this device.',
    );
  });

  it('does nothing for an error that is not the proxy refusing a device', () => {
    const onAuthError = vi.fn();
    expect(
      reactToOrganizaOneUnauthorized(undefined, {
        forget: vi.fn(),
        onAuthError,
      }),
    ).toBe(false);
    expect(onAuthError).not.toHaveBeenCalled();
  });
});
