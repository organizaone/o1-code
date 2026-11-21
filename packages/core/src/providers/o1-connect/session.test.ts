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
  checkO1ConnectStore,
  describeO1ConnectError,
  forgetO1Connect,
  isO1ConnectError,
  openO1Connect,
  setupO1Connect,
} from './session.js';

const pin = `sha256/${Buffer.alloc(32, 7).toString('base64')}`;

/** A code of the current shape that no gateway issued: enough to be decoded, never enrolled. */
function syntheticCode(extra: Record<string, unknown> = {}): string {
  const payload = {
    url: 'https://primary.example',
    device: 'test-device',
    pins: [pin],
    enroll: 'a'.repeat(64),
    expires: '2099-01-01T00:00:00.000Z',
    ...extra,
  };
  return `o1gw2.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

describe('setupO1Connect', () => {
  it.each([
    ['text that is not a code', 'not-a-code'],
    ['a code from before one-use codes', 'o1gw1.eyJ1cmwiOiJ4In0'],
  ])(
    'refuses %s without asking for fingerprints or touching the store',
    async (_label, code) => {
      const store = new MemorySecretStore();
      const onFingerprint = vi.fn();
      await expect(
        setupO1Connect(code, { store, onFingerprint }),
      ).rejects.toMatchObject({ code: 'invalid_code' });
      expect(onFingerprint).not.toHaveBeenCalled();
      expect(await store.get('aipp-connect')).toBeNull();
    },
  );

  it('sends and saves nothing unless every fingerprint is confirmed', async () => {
    const store = new MemorySecretStore();
    const onFingerprint = vi.fn(() => false);
    await expect(
      setupO1Connect(syntheticCode(), { store, onFingerprint }),
    ).rejects.toMatchObject({ code: 'fingerprint_rejected' });
    expect(onFingerprint).toHaveBeenCalledWith(
      [expect.stringMatching(/^[0-9A-F]{4}(-[0-9A-F]{4}){15}$/)],
      { device: 'test-device', url: 'https://primary.example' },
    );
    expect(await store.get('aipp-connect')).toBeNull();
  });
});

describe('checkO1ConnectStore', () => {
  it('passes a store that can be read, with or without an entry', async () => {
    await expect(
      checkO1ConnectStore({ store: new MemorySecretStore() }),
    ).resolves.toBeUndefined();
  });

  it('reports a store that cannot be read before a code is spent on it', async () => {
    const store = {
      get: async () => {
        throw new UnreadableSecretFileError('/home/u/.o1-code/secrets.json');
      },
      set: async () => undefined,
      delete: async () => undefined,
    };
    const checked = checkO1ConnectStore({ store });
    await expect(checked).rejects.toMatchObject({ code: 'store_failed' });
    await expect(checked).rejects.toSatisfy(
      (error: unknown) =>
        describeO1ConnectError(error).unreadableSecretFile ===
        '/home/u/.o1-code/secrets.json',
    );
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

  it.each([
    ['text that is not JSON', 'garbage'],
    [
      'an entry saved before one-use codes',
      JSON.stringify({
        url: 'https://primary.example',
        device: 'test-device',
        pins: [pin],
        token: 'a'.repeat(64),
      }),
    ],
  ])('forgets %s and sends the user to a new code', async (_label, entry) => {
    const store = new MemorySecretStore();
    await store.set('aipp-connect', entry);
    const opened = openO1Connect({ store });
    await expect(opened).rejects.toMatchObject({ code: 'invalid_config' });
    await expect(opened).rejects.toThrow('older version');
    await expect(opened).rejects.toThrow('new connection code');
    expect(await store.get('aipp-connect')).toBeNull();
    // Nothing is left to fail the same way: the next start asks for a code.
    await expect(openO1Connect({ store })).rejects.toMatchObject({
      code: 'not_set_up',
    });
  });

  it('forgets a device the gateway refuses, without opening it again', async () => {
    const store = new MemorySecretStore();
    await store.set('aipp-connect', 'saved-by-the-library');
    const open = vi.fn(async () => {
      throw new O1ConnectError(
        'device_refused',
        "the proxy does not accept this device's key (device_key)",
      );
    });
    const opened = openO1Connect({ store, open });
    await expect(opened).rejects.toMatchObject({ code: 'device_refused' });
    await expect(opened).rejects.toThrow(
      'disconnected or set up on another machine',
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(await store.get('aipp-connect')).toBeNull();
  });

  it('keeps the configuration when the tunnel is only unavailable', async () => {
    const store = new MemorySecretStore();
    await store.set('aipp-connect', 'saved-by-the-library');
    const open = vi.fn(async () => {
      throw new O1ConnectError('tunnel_unavailable', 'network down');
    });
    await expect(openO1Connect({ store, open })).rejects.toMatchObject({
      code: 'tunnel_unavailable',
    });
    expect(await store.get('aipp-connect')).toBe('saved-by-the-library');
  });
});

describe('forgetO1Connect', () => {
  it('deletes the saved configuration', async () => {
    const store = new MemorySecretStore();
    await store.set('aipp-connect', 'saved-by-the-library');
    await forgetO1Connect({ store });
    expect(await store.get('aipp-connect')).toBeNull();
  });
});

describe('describeO1ConnectError', () => {
  it('names what the user does for each library error', () => {
    const cases: Array<[string, string]> = [
      ['invalid_code', 'o1gw2.'],
      ['code_used', 'works once'],
      ['code_expired', '30 minutes'],
      ['device_refused', 'disconnected or set up on another machine'],
      ['fingerprint_rejected', 'Nothing was saved'],
      ['not_set_up', 'Paste a connection code'],
      ['invalid_config', 'older version'],
      ['identity_mismatch', 'Do not use a direct connection'],
      ['tunnel_unavailable', 'Try again later'],
      ['port_in_use', 'loopback port'],
    ];
    for (const [code, fragment] of cases) {
      const described = describeO1ConnectError(
        new O1ConnectError(code as never, `lib: ${code}`),
      );
      expect(`${code}: ${described.message}`).toContain(fragment);
    }
    expect(isO1ConnectError(new Error('x'))).toBe(false);
    expect(describeO1ConnectError(new Error('plain')).message).toBe('plain');
  });

  it('says a code from before one-use codes is from an older version', () => {
    const error = new O1ConnectError('invalid_code', 'lib');
    expect(
      describeO1ConnectError(error, { code: ' o1gw1.abc' }).message,
    ).toContain('older version');
    expect(
      describeO1ConnectError(error, { code: 'o1gw2.abc' }).message,
    ).not.toContain('older version');
  });

  it('tells whoever did not use a used code to check the device and disconnect it', () => {
    const described = describeO1ConnectError(
      new O1ConnectError('code_used', 'lib'),
      { stage: 'setup' },
    );
    expect(described.message).toContain('someone else did');
    expect(described.message).toContain('account page');
    expect(described.message).toContain('Disconnect');
    expect(described.codeIsDead).toBe(true);
    expect(described.retrySameCode).toBeUndefined();
  });

  it('marks a lapsed code as dead and never as one to try again', () => {
    const described = describeO1ConnectError(
      new O1ConnectError('code_expired', 'lib'),
      { stage: 'setup' },
    );
    expect(described.codeIsDead).toBe(true);
    expect(described.retrySameCode).toBeUndefined();
  });

  it('offers the same code again only when a setup could not reach the gateway', () => {
    const error = new O1ConnectError('tunnel_unavailable', 'lib');
    const atSetup = describeO1ConnectError(error, { stage: 'setup' });
    expect(atSetup.retrySameCode).toBe(true);
    expect(atSetup.message).toContain('Nothing was saved');
    expect(atSetup.message).toContain('30 minutes');
    expect(
      describeO1ConnectError(error, { stage: 'open' }).retrySameCode,
    ).toBeUndefined();
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
  });

  it('says whether the file or its key failed the integrity check', () => {
    const describe = (error: UnreadableSecretFileError) =>
      describeO1ConnectError(
        new O1ConnectError('store_failed', 'store', { cause: error }),
      );
    const modified = describe(
      new UnreadableSecretFileError('/home/u/.o1-code/secrets.json', {
        reason: 'modified',
      }),
    );
    expect(modified.message).toContain('modified or damaged');
    expect(modified.unreadableSecretFile).toBe('/home/u/.o1-code/secrets.json');

    const otherKey = describe(
      new UnreadableSecretFileError('/home/u/.o1-code/secrets.json', {
        reason: 'other-key',
      }),
    );
    expect(otherKey.message).toContain('sealed with another secret key');

    const keyDamaged = describe(
      new UnreadableSecretFileError('/home/u/.o1-code/secret-key-v1.json', {
        reason: 'key-damaged',
      }),
    );
    expect(keyDamaged.message).toContain('the secret key was modified');
    expect(keyDamaged.unreadableSecretFile).toBe(
      '/home/u/.o1-code/secret-key-v1.json',
    );
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
