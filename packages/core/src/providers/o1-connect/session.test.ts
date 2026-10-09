/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { MemorySecretStore } from '../../../vendor/o1-connect/lib.mjs';
import { UnreadableSecretFileError } from '../../mcp/token-storage/file-token-storage.js';
import {
  O1ConnectError,
  describeO1ConnectError,
  forgetO1Connect,
  isO1ConnectError,
  openO1Connect,
  setupO1Connect,
} from './session.js';

describe('setupO1Connect', () => {
  it('refuses a code that is not an o1gw1. connection code without touching the store', async () => {
    const store = new MemorySecretStore();
    const onFingerprint = vi.fn();
    await expect(
      setupO1Connect('not-a-code', { store, onFingerprint }),
    ).rejects.toMatchObject({ code: 'invalid_code' });
    expect(onFingerprint).not.toHaveBeenCalled();
    expect(await store.get('aipp-connect')).toBeNull();
  });
});

describe('openO1Connect', () => {
  it('reports a machine without a saved connection as not set up', async () => {
    const store = new MemorySecretStore();
    await expect(openO1Connect({ store })).rejects.toMatchObject({
      code: 'not_set_up',
    });
  });

  it('says which secret file it could not decrypt instead of the cipher’s error', async () => {
    const store = {
      get: async () => {
        throw new UnreadableSecretFileError('/home/u/.o1-code/secrets.json');
      },
      set: async () => undefined,
      delete: async () => undefined,
    };
    const opened = openO1Connect({ store });
    await expect(opened).rejects.toMatchObject({ code: 'store_failed' });
    await expect(opened).rejects.toThrow('/home/u/.o1-code/secrets.json');
    await expect(opened).rejects.toSatisfy(
      (error: unknown) =>
        describeO1ConnectError(error).unreadableSecretFile ===
        '/home/u/.o1-code/secrets.json',
    );
  });

  it('forgets an entry the library cannot read, on request', async () => {
    const store = new MemorySecretStore();
    await store.set('aipp-connect', 'garbage');
    await expect(openO1Connect({ store })).rejects.toMatchObject({
      code: 'invalid_config',
    });
    await forgetO1Connect({ store });
    expect(await store.get('aipp-connect')).toBeNull();
  });
});

describe('describeO1ConnectError', () => {
  it('names what the user does for each library error', () => {
    const cases: Array<[string, string, boolean]> = [
      ['invalid_code', 'o1gw1.', false],
      ['fingerprint_rejected', 'Nothing was saved', false],
      ['not_set_up', 'Paste a connection code', false],
      ['invalid_config', 'set it up again', true],
      ['identity_mismatch', 'intercepting', false],
      ['tunnel_unavailable', 'Try again later', false],
      ['port_in_use', 'loopback port', false],
    ];
    for (const [code, fragment, forget] of cases) {
      const described = describeO1ConnectError(
        new O1ConnectError(code as never, `lib: ${code}`),
      );
      expect(`${code}: ${described.message}`).toContain(fragment);
      expect(`${code}: ${described.forgetAndSetUpAgain}`).toBe(
        `${code}: ${forget}`,
      );
    }
    expect(isO1ConnectError(new Error('x'))).toBe(false);
    expect(describeO1ConnectError(new Error('plain')).message).toBe('plain');
  });

  it('names a secret file this machine cannot decrypt and offers to set it aside', () => {
    const described = describeO1ConnectError(
      new O1ConnectError('store_failed', 'store', {
        cause: new UnreadableSecretFileError('/home/u/.o1-code/secrets.json', {
          cause: new Error('Unsupported state or unable to authenticate data'),
        }),
      }),
    );
    expect(described.unreadableSecretFile).toBe(
      '/home/u/.o1-code/secrets.json',
    );
    expect(described.message).toContain('/home/u/.o1-code/secrets.json');
    expect(described.message).toContain('another host name or user');
    expect(described.message).not.toContain('Unsupported state');
    expect(described.forgetAndSetUpAgain).toBe(false);
  });

  it('carries the store’s own reason', () => {
    const described = describeO1ConnectError(
      new O1ConnectError('store_failed', 'store', {
        cause: new Error('keychain locked'),
      }),
    );
    expect(described.message).toContain('keychain locked');
  });
});
