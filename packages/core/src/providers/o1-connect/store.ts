/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { HybridTokenStorage } from '../../mcp/token-storage/hybrid-token-storage.js';
import type { SecretStorage } from '../../mcp/token-storage/types.js';
import type { SecretStore } from '../../../vendor/o1-connect/lib.mjs';

/**
 * Where the o1-connect library keeps its one entry (the proxy's URL, the
 * device's name, the pinned keys and the device's private key): the OS
 * keychain when o1-code can reach one, else the AES-256-GCM file under the
 * o1-code home, the same backing the MCP OAuth tokens use. The entry is the
 * library's own and a secret as a whole: o1-code stores and returns it, and
 * never reads what is inside.
 */
export const O1_CONNECT_SERVICE_NAME = 'o1-code-organizaone';

/** The entry's name: the library's default, so a saved configuration is always found. */
export const O1_CONNECT_ENTRY_NAME = 'aipp-connect';

/** The library's SecretStore over o1-code's secret storage. */
export function createO1ConnectStore(
  storage: SecretStorage = new HybridTokenStorage(O1_CONNECT_SERVICE_NAME),
): SecretStore {
  return {
    async get(name) {
      return storage.getSecret(name);
    },
    async set(name, value) {
      await storage.setSecret(name, value);
    },
    async delete(name) {
      await storage.deleteSecret(name);
    },
  };
}
