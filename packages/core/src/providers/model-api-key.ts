/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 *
 * The API key of a `modelProviders` entry: `process.env[envKey]` first, then
 * the saved credential the entry names, then the credential saved under the
 * id of the preset the entry belongs to (matched by base URL and env key).
 * A key read from the store is exported into `process.env[envKey]` for this
 * process when the variable is unset, so `${VAR}` placeholders keep resolving.
 */

import { findProviderByCredentials } from './all-providers.js';
import {
  exportCredentialToEnv,
  readSavedApiKey,
  credentialIdForProvider,
} from './credential-store.js';

export interface ModelKeyReference {
  envKey?: string;
  credential?: string;
  baseUrl?: string;
}

function readStoredKey(model: ModelKeyReference): string | undefined {
  const saved = readSavedApiKey(model.credential);
  if (saved) return saved;
  const provider = findProviderByCredentials(model.baseUrl, model.envKey);
  return provider
    ? readSavedApiKey(credentialIdForProvider(provider.id))
    : undefined;
}

/**
 * The saved key of an entry (named credential, then the preset's), exported
 * into its unset variable for this process. For callers that already looked
 * at the environment.
 */
export function resolveSavedModelApiKey(
  model: ModelKeyReference,
): string | undefined {
  const saved = readStoredKey(model);
  if (saved && model.envKey) exportCredentialToEnv(model.envKey, saved);
  return saved;
}

export function resolveModelApiKey(
  model: ModelKeyReference,
): string | undefined {
  const fromEnv = model.envKey ? process.env[model.envKey] : undefined;
  return fromEnv || resolveSavedModelApiKey(model);
}

/**
 * Exports the saved key of every entry whose variable is unset, before the
 * settings' `${VAR}` placeholders are resolved. Returns the exported names.
 */
export function exportSavedCredentials(
  modelProviders: Record<string, unknown> | undefined,
): string[] {
  const names: string[] = [];
  for (const models of Object.values(modelProviders ?? {})) {
    if (!Array.isArray(models)) continue;
    for (const model of models) {
      if (!model || typeof model !== 'object') continue;
      const { envKey, credential, baseUrl } = model as Record<string, unknown>;
      if (typeof envKey !== 'string' || !envKey || process.env[envKey]) {
        continue;
      }
      const saved = readStoredKey({
        envKey,
        credential: typeof credential === 'string' ? credential : undefined,
        baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
      });
      if (saved && exportCredentialToEnv(envKey, saved)) names.push(envKey);
    }
  }
  return names;
}
