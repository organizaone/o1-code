/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { SecretStorage } from '../../mcp/token-storage/types.js';
import { createO1ConnectStore } from './store.js';

function fakeStorage(): SecretStorage & { secrets: Map<string, string> } {
  const secrets = new Map<string, string>();
  return {
    secrets,
    isAvailable: async () => true,
    setSecret: async (key, value) => {
      secrets.set(key, value);
    },
    getSecret: async (key) => secrets.get(key) ?? null,
    deleteSecret: async (key) => {
      secrets.delete(key);
    },
    listSecrets: async () => [...secrets.keys()],
  };
}

describe('createO1ConnectStore', () => {
  it('keeps the library entry as one secret, exactly as set', async () => {
    const storage = fakeStorage();
    const store = createO1ConnectStore(storage);
    expect(await store.get('aipp-connect')).toBeNull();
    const entry = JSON.stringify({
      url: 'https://api.organizaone.com',
      token: 'x',
    });
    await store.set('aipp-connect', entry);
    expect(await store.get('aipp-connect')).toBe(entry);
    expect(storage.secrets.get('aipp-connect')).toBe(entry);
    await store.delete('aipp-connect');
    expect(await store.get('aipp-connect')).toBeNull();
  });

  it('does not fail when deleting an entry that is not there', async () => {
    const store = createO1ConnectStore(fakeStorage());
    await expect(store.delete('aipp-connect')).resolves.toBeUndefined();
  });
});
