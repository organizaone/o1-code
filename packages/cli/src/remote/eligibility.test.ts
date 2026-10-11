/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { KeyInfo } from '@organizaone/o1-code-core/providers/organizaone-limits.js';
import type { O1ConnectSession } from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import {
  checkRemoteEligibility,
  type RemoteEligibilityConfig,
} from './eligibility.js';

const keyInfo = (remote: KeyInfo['remote']): KeyInfo => ({
  scopes: [],
  plan: null,
  own: null,
  remote,
});

const tunnel: O1ConnectSession = {
  baseUrl: 'http://127.0.0.1:4100',
  openaiBaseUrl: 'http://127.0.0.1:4100/v1',
  apiKey: 'session-key',
  device: 'laptop',
  openRemote: vi.fn(),
  close: vi.fn(),
};

function config(
  over: Partial<{
    baseUrl: string;
    apiKey: string;
    connection: 'o1-connect';
    tunnel: O1ConnectSession;
    viaTunnel: 'auto' | 'always' | 'never';
  }> = {},
): RemoteEligibilityConfig {
  return {
    getContentGeneratorConfig: () =>
      ({
        model: 'm',
        baseUrl: over.baseUrl,
        apiKey: over.apiKey,
        connection: over.connection,
      }) as never,
    getCliVersion: () => '0.15.0',
    getO1ConnectSession: () => over.tunnel,
    getRemoteViaTunnel: () => over.viaTunnel ?? 'auto',
  };
}

describe('checkRemoteEligibility', () => {
  it('asks the plan with the account key and connects directly', async () => {
    const fetchKeyInfo = vi
      .fn()
      .mockResolvedValue(
        keyInfo({ enabled: true, maxSessions: 3, maxViewers: 2 }),
      );
    const result = await checkRemoteEligibility(
      config({ baseUrl: 'https://api.organizaone.com/v1', apiKey: 'dk' }),
      { fetchKeyInfo },
    );
    expect(result).toEqual({
      status: 'ok',
      transport: {
        kind: 'direct',
        baseUrl: 'https://api.organizaone.com/v1',
        apiKey: 'dk',
      },
      limits: { maxSessions: 3, maxViewers: 2 },
    });
    expect(fetchKeyInfo).toHaveBeenCalledWith({
      baseUrl: 'https://api.organizaone.com/v1',
      apiKey: 'dk',
      clientVersion: '0.15.0',
    });
  });

  it('rides the open tunnel and asks the plan through its endpoint', async () => {
    const fetchKeyInfo = vi
      .fn()
      .mockResolvedValue(
        keyInfo({ enabled: true, maxSessions: 1, maxViewers: 1 }),
      );
    const result = await checkRemoteEligibility(
      config({
        baseUrl: tunnel.baseUrl,
        apiKey: tunnel.apiKey,
        connection: 'o1-connect',
        tunnel,
      }),
      { fetchKeyInfo },
    );
    expect(result).toMatchObject({
      status: 'ok',
      transport: { kind: 'tunnel', tunnel },
    });
    expect(fetchKeyInfo.mock.calls[0]![0]).toMatchObject({
      baseUrl: tunnel.baseUrl,
      apiKey: tunnel.apiKey,
    });
  });

  it('needs the OrganizaOne sign-in for any other provider', async () => {
    const fetchKeyInfo = vi.fn();
    await expect(
      checkRemoteEligibility(
        config({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk' }),
        { fetchKeyInfo },
      ),
    ).resolves.toEqual({ status: 'needs-account' });
    expect(fetchKeyInfo).not.toHaveBeenCalled();
  });

  it('reports a plan without remote sessions, and a gateway without an answer', async () => {
    const account = config({
      baseUrl: 'https://api.organizaone.com',
      apiKey: 'dk',
    });
    await expect(
      checkRemoteEligibility(account, {
        fetchKeyInfo: vi
          .fn()
          .mockResolvedValue(
            keyInfo({ enabled: false, maxSessions: 0, maxViewers: 0 }),
          ),
      }),
    ).resolves.toEqual({ status: 'plan' });
    await expect(
      checkRemoteEligibility(account, {
        fetchKeyInfo: vi.fn().mockResolvedValue(keyInfo(null)),
      }),
    ).resolves.toEqual({ status: 'plan' });
    await expect(
      checkRemoteEligibility(account, {
        fetchKeyInfo: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('honors remote.viaTunnel: always needs the tunnel, never needs the account key', async () => {
    const fetchKeyInfo = vi
      .fn()
      .mockResolvedValue(
        keyInfo({ enabled: true, maxSessions: 1, maxViewers: 1 }),
      );
    await expect(
      checkRemoteEligibility(
        config({
          baseUrl: 'https://api.organizaone.com',
          apiKey: 'dk',
          viaTunnel: 'always',
        }),
        { fetchKeyInfo },
      ),
    ).resolves.toEqual({ status: 'tunnel-required' });
    await expect(
      checkRemoteEligibility(
        config({
          baseUrl: tunnel.baseUrl,
          apiKey: tunnel.apiKey,
          connection: 'o1-connect',
          tunnel,
          viaTunnel: 'never',
        }),
        { fetchKeyInfo },
      ),
    ).resolves.toEqual({ status: 'direct-unavailable' });
    expect(fetchKeyInfo).not.toHaveBeenCalled();
  });
});
