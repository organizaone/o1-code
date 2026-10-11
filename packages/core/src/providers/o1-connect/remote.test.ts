/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemorySecretStore } from '../../../vendor/o1-connect/lib.mjs';

const lib = vi.hoisted(() => ({
  open: vi.fn(),
  openRemote: vi.fn(),
}));

vi.mock('../../../vendor/o1-connect/lib.mjs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../vendor/o1-connect/lib.mjs')>();
  return { ...actual, open: lib.open, openRemote: lib.openRemote };
});

const { openO1Connect } = await import('./session.js');
const { openRemoteSession } = await import('./remote.js');

const session = {
  id: 'sess-1',
  name: 'laptop',
  cwd: '/w/app',
  version: '0.15.0',
  approvalMode: 'default',
  model: 'claude-haiku-4-5',
};

const agent = {
  remoteId: 'rm_1',
  url: 'https://account.example/#/me/remote/rm_1',
};

beforeEach(() => {
  lib.open.mockReset();
  lib.openRemote.mockReset().mockResolvedValue(agent);
});

describe('openRemoteSession', () => {
  it('dials the gateway directly with the device key', async () => {
    const history = () => [{ type: 'user' }];
    const log = () => {};
    await expect(
      openRemoteSession(
        { kind: 'direct', baseUrl: 'https://api.example', apiKey: 'dk' },
        { session, history, log },
      ),
    ).resolves.toBe(agent);
    expect(lib.openRemote).toHaveBeenCalledWith({
      baseUrl: 'https://api.example',
      apiKey: 'dk',
      session,
      history,
      log,
    });
    expect(lib.openRemote.mock.calls[0]![0]).not.toHaveProperty('connection');
  });

  it('rides the pinned tunnel with the connection the library opened', async () => {
    const connection = {
      baseUrl: 'http://127.0.0.1:4000',
      openaiBaseUrl: 'http://127.0.0.1:4000/v1',
      apiKey: 'session-key',
      port: 4000,
      device: 'dev',
      close: vi.fn().mockResolvedValue(undefined),
    };
    lib.open.mockResolvedValue(connection);
    const tunnel = await openO1Connect({ store: new MemorySecretStore() });

    await expect(
      openRemoteSession({ kind: 'tunnel', tunnel }, { session }),
    ).resolves.toBe(agent);
    expect(lib.openRemote).toHaveBeenCalledWith({ connection, session });
    expect(lib.openRemote.mock.calls[0]![0]).not.toHaveProperty('apiKey');
  });
});
