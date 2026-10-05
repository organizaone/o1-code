/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Provider API keys, one file per provider under `<o1-code home>/credentials`,
 * so that no secret lives in `settings.json`. A settings entry refers to its
 * key by id (`modelProviders.<authType>[].credential`).
 *
 * The functions are synchronous: the key is read where a content generator
 * config is built, which is synchronous code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Storage } from '../config/storage.js';
import { createDebugLogger } from '../utils/debugLogger.js';

const debugLogger = createDebugLogger('CREDENTIAL_STORE');

const CREDENTIAL_ID = /^[a-z0-9][a-z0-9-]*$/;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export interface StoredCredential {
  apiKey: string;
  /** ISO timestamp of the write. */
  savedAt: string;
  /**
   * When a device token obtained by signing in stops working (ISO), null for
   * a device whose key never expires; absent for a pasted key.
   */
  expiresAt?: string | null;
  /** The device's name on the account page, when the token came from a sign-in. */
  deviceName?: string;
}

/** What a caller saves; `savedAt` is the store's own. */
export type CredentialInput = Omit<StoredCredential, 'savedAt'>;

export function isValidCredentialId(id: string): boolean {
  return CREDENTIAL_ID.test(id);
}

function assertCredentialId(id: string): void {
  if (!isValidCredentialId(id)) {
    throw new Error(
      `Invalid credential id "${id}": use lowercase letters, digits and dashes.`,
    );
  }
}

function credentialPath(id: string): string {
  assertCredentialId(id);
  return path.join(Storage.getCredentialsDir(), `${id}.json`);
}

/**
 * The credential id a provider preset stores its key under. Preset ids are
 * mostly already valid; `alibabaStandard` becomes `alibaba-standard`.
 */
export function credentialIdForProvider(providerId: string): string {
  return providerId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}

/**
 * Tightens a mode where the platform honours modes. Windows refuses some
 * chmod calls with EPERM; the user profile ACL is the boundary there.
 */
function chmodQuietly(target: string, mode: number): void {
  try {
    fs.chmodSync(target, mode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
  }
}

/** The saved credential, or `undefined` when absent or unreadable. */
export function readCredential(id: string): StoredCredential | undefined {
  const file = credentialPath(id);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const apiKey =
      parsed && typeof parsed === 'object'
        ? (parsed as { apiKey?: unknown }).apiKey
        : undefined;
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new Error('no apiKey');
    }
    const { savedAt, expiresAt, deviceName } = parsed as {
      savedAt?: unknown;
      expiresAt?: unknown;
      deviceName?: unknown;
    };
    return {
      apiKey,
      savedAt: typeof savedAt === 'string' ? savedAt : '',
      ...(expiresAt === null || typeof expiresAt === 'string'
        ? { expiresAt }
        : {}),
      ...(typeof deviceName === 'string' && deviceName ? { deviceName } : {}),
    };
  } catch {
    debugLogger.debug(`Ignoring unreadable credential file for "${id}".`);
    return undefined;
  }
}

/** Saves `apiKey` under `id`, replacing any saved key atomically. */
export function writeCredential(
  id: string,
  { apiKey, expiresAt, deviceName }: CredentialInput,
): StoredCredential {
  const file = credentialPath(id);
  if (!apiKey.trim()) {
    throw new Error(`Refusing to save an empty API key for "${id}".`);
  }
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  chmodQuietly(dir, DIR_MODE);

  const credential: StoredCredential = {
    apiKey,
    savedAt: new Date().toISOString(),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(deviceName ? { deviceName } : {}),
  };
  const temp = path.join(
    dir,
    `.${id}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(temp, `${JSON.stringify(credential, null, 2)}\n`, {
      mode: FILE_MODE,
    });
    chmodQuietly(temp, FILE_MODE);
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
  return credential;
}

/** Deletes the saved key; `true` when there was one. */
export function removeCredential(id: string): boolean {
  const file = credentialPath(id);
  try {
    fs.unlinkSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** The ids with a saved file, sorted. */
export function listCredentials(): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(Storage.getCredentialsDir());
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter(isValidCredentialId)
    .sort();
}

/**
 * The key saved under `id`; `undefined` when there is none or the id is not
 * one the store accepts (a hand-edited reference never throws here).
 */
export function readSavedApiKey(id: string | undefined): string | undefined {
  if (!id || !isValidCredentialId(id)) return undefined;
  return readCredential(id)?.apiKey;
}

/**
 * Variable names a saved key is never exported into: they alter process or
 * loader behaviour. Compared case-insensitively (Windows env names are).
 */
const DENY_ENV_KEYS = new Set([
  'NODE_OPTIONS',
  'NODE_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
]);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Variables this process set from the store, with the value it set. */
const exported = new Map<string, string>();

/**
 * Exports a saved key into `process.env[envKey]` for this process only, so a
 * `${VAR}` placeholder naming the variable resolves as it did when keys lived
 * in `settings.env`. Never overrides a value the user set; replaces a value it
 * exported itself (a rotated key). Nothing is written to disk.
 */
export function exportCredentialToEnv(envKey: string, apiKey: string): boolean {
  if (!ENV_NAME.test(envKey) || DENY_ENV_KEYS.has(envKey.toUpperCase())) {
    return false;
  }
  const current = process.env[envKey];
  const ours = exported.has(envKey) && exported.get(envKey) === current;
  if (current !== undefined && current !== '' && !ours) return false;
  process.env[envKey] = apiKey;
  exported.set(envKey, apiKey);
  return true;
}

/** Whether `process.env[envKey]` holds a value this process exported. */
export function isExportedCredentialEnv(envKey: string): boolean {
  return exported.has(envKey) && exported.get(envKey) === process.env[envKey];
}

/** Removes an exported value (a forgotten key); leaves the user's alone. */
export function withdrawExportedCredential(envKey: string): void {
  if (isExportedCredentialEnv(envKey)) delete process.env[envKey];
  exported.delete(envKey);
}

/** The variables whose current value this process exported from the store. */
export function exportedCredentialEnvKeys(): string[] {
  return [...exported.keys()].filter(isExportedCredentialEnv);
}

/**
 * Takes over variables a parent process exported from the store: the
 * relaunched interactive process inherits their values but not the record of
 * who set them, and without it a key saved later (a new `/auth`) could not
 * replace them. Only set, allowed names are adopted, with their current value.
 */
export function adoptExportedCredentialEnvKeys(keys: Iterable<string>): void {
  for (const key of keys) {
    const value = process.env[key];
    if (!ENV_NAME.test(key) || DENY_ENV_KEYS.has(key.toUpperCase())) continue;
    if (value === undefined || value === '') continue;
    exported.set(key, value);
  }
}

/** Forgets which variables were exported, without touching them (tests). */
export function forgetExportedCredentials(): void {
  exported.clear();
}

/**
 * The API key for a model entry: a key set in the environment always wins,
 * then the credential the entry names, then the credential saved under the
 * provider's id. Nothing else.
 */
export function resolveApiKey({
  envKey,
  credential,
  providerId,
}: {
  envKey?: string;
  credential?: string;
  providerId?: string;
}): string | undefined {
  const fromEnv = envKey ? process.env[envKey] : undefined;
  if (fromEnv) return fromEnv;
  return (
    readSavedApiKey(credential) ??
    (providerId
      ? readSavedApiKey(credentialIdForProvider(providerId))
      : undefined)
  );
}
