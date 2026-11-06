/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { BaseTokenStorage } from './base-token-storage.js';
import type { OAuthCredentials, SecretStorage } from './types.js';
import { Storage } from '../../config/storage.js';
import { atomicWriteFile } from '../../utils/atomicFileWrite.js';
import {
  DamagedSecretKeyError,
  legacySecretKey,
  loadSecretKey,
  type SecretKey,
} from './secret-key.js';

// Secrets are keyed by service name so a single encrypted file can hold secrets
// for many callers, mirroring how the keychain backend namespaces by service.
type SecretFileContents = Record<string, Record<string, string>>;

// `o1s2:<key id>:<iv>:<auth tag>:<ciphertext>`, sealed with the random key of
// the o1-code home and the file's own name as associated data. Earlier
// versions wrote `<iv>:<auth tag>:<ciphertext>` under a host-bound key.
const SEALED_PREFIX = 'o1s2';
const AUTH_TAG_BYTES = 16;

/**
 * Why a sealed file cannot be opened:
 * - `other-machine`: an earlier version sealed it under another host name
 *   or user (a terminal-server farm, a renamed machine, a copied home);
 * - `other-key`: it was sealed with a key other than the one in the home's
 *   key file, which was replaced or recreated;
 * - `modified`: it failed its integrity check, edited or damaged;
 * - `key-damaged`: the key file itself failed its integrity check.
 */
export type UnreadableSecretFileReason =
  | 'other-machine'
  | 'other-key'
  | 'modified'
  | 'key-damaged';

function describeReason(
  filePath: string,
  reason: UnreadableSecretFileReason,
): string {
  switch (reason) {
    case 'other-machine':
      return `${filePath} cannot be decrypted here: an earlier version saved it under another host name or user, or it is damaged`;
    case 'other-key':
      return `${filePath} was sealed with another secret key: the key file of this o1-code home was replaced or recreated`;
    case 'modified':
      return `${filePath} failed its integrity check: it was modified or damaged`;
    case 'key-damaged':
      return `${filePath} failed its integrity check: the secret key was modified or damaged`;
    default:
      return `${filePath} cannot be read`;
  }
}

/**
 * A sealed file, or the key that seals it, cannot be opened. Nothing in it is
 * readable here, so no secret is overwritten until the user chooses to set
 * the file named by `filePath` aside.
 */
export class UnreadableSecretFileError extends Error {
  readonly filePath: string;
  readonly reason: UnreadableSecretFileReason;

  constructor(
    filePath: string,
    options?: { cause?: unknown; reason?: UnreadableSecretFileReason },
  ) {
    const reason = options?.reason ?? 'other-machine';
    super(
      describeReason(filePath, reason),
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'UnreadableSecretFileError';
    this.filePath = filePath;
    this.reason = reason;
  }
}

export function isUnreadableSecretFileError(
  error: unknown,
): error is UnreadableSecretFileError {
  return error instanceof UnreadableSecretFileError;
}

function backupStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Renames an unreadable secret file to `<file>.unreadable-<stamp>.bak`, so a
 * new one can be written while the old one stays openable on the machine
 * that sealed it. Returns the backup's path.
 */
export async function setAsideUnreadableSecretFile(
  filePath: string,
  now: Date = new Date(),
): Promise<string> {
  const backupPath = `${filePath}.unreadable-${backupStamp(now)}.bak`;
  await fs.rename(filePath, backupPath);
  return backupPath;
}

export class FileTokenStorage
  extends BaseTokenStorage
  implements SecretStorage
{
  private readonly configDir: string;
  private readonly tokenFilePath: string;
  private readonly secretFilePath: string;

  constructor(serviceName: string) {
    super(serviceName);
    this.configDir = Storage.getGlobalO1CodeDir();
    this.tokenFilePath = path.join(this.configDir, 'mcp-oauth-tokens-v2.json');
    this.secretFilePath = path.join(
      this.configDir,
      'extension-secrets-v1.json',
    );
  }

  private async secretKey(create: boolean): Promise<SecretKey | null> {
    try {
      return await loadSecretKey(this.configDir, { create });
    } catch (error) {
      if (error instanceof DamagedSecretKeyError) {
        throw new UnreadableSecretFileError(error.filePath, {
          reason: 'key-damaged',
          cause: error,
        });
      }
      throw error;
    }
  }

  // Binds the ciphertext to the file it was written to, so a sealed file
  // moved under another sealed file's name fails its integrity check.
  private static associatedData(filePath: string): Buffer {
    return Buffer.from(`o1-code:${path.basename(filePath)}`, 'utf8');
  }

  private async encrypt(text: string, filePath: string): Promise<string> {
    const secretKey = await this.secretKey(true);
    if (!secretKey) {
      throw new Error('The secret key could not be created');
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', secretKey.key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(FileTokenStorage.associatedData(filePath));
    const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
    return [
      SEALED_PREFIX,
      secretKey.id,
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted,
    ].join(':');
  }

  /**
   * Opens a sealed file. `legacy` is set when it was sealed under the host-bound
   * key of an earlier version, so the caller seals it again under the new key.
   */
  private async decrypt(
    sealed: string,
    filePath: string,
  ): Promise<{ text: string; legacy: boolean }> {
    const parts = sealed.trim().split(':');
    if (parts.length === 3) {
      try {
        return {
          text: FileTokenStorage.open(legacySecretKey(), parts, null),
          legacy: true,
        };
      } catch (error) {
        throw new UnreadableSecretFileError(filePath, {
          reason: 'other-machine',
          cause: error,
        });
      }
    }
    if (parts.length !== 5 || parts[0] !== SEALED_PREFIX) {
      throw new UnreadableSecretFileError(filePath, { reason: 'modified' });
    }
    const secretKey = await this.secretKey(false);
    if (!secretKey || secretKey.id !== parts[1]) {
      throw new UnreadableSecretFileError(filePath, { reason: 'other-key' });
    }
    try {
      return {
        text: FileTokenStorage.open(
          secretKey.key,
          parts.slice(2),
          FileTokenStorage.associatedData(filePath),
        ),
        legacy: false,
      };
    } catch (error) {
      throw new UnreadableSecretFileError(filePath, {
        reason: 'modified',
        cause: error,
      });
    }
  }

  private static open(
    key: Buffer,
    [iv, authTag, encrypted]: string[],
    associatedData: Buffer | null,
  ): string {
    // A fixed tag length: GCM would otherwise accept a truncated tag, which
    // weakens the integrity check to as little as 32 bits.
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'hex'),
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    if (associatedData) decipher.setAAD(associatedData);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }

  /** Reads and opens a sealed file; null when it does not exist. */
  private async readSealed(
    filePath: string,
  ): Promise<{ text: string; legacy: boolean } | null> {
    let data: string;
    try {
      data = await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    return this.decrypt(data, filePath);
  }

  private async writeSealed(filePath: string, text: string): Promise<void> {
    await this.ensureDirectoryExists();
    const encrypted = await this.encrypt(text, filePath);
    await atomicWriteFile(filePath, encrypted, {
      mode: 0o600,
      forceMode: true,
      noFollow: true,
    });
  }

  // Moving a file sealed by an earlier version onto the new key is best
  // effort: the content was read, and the next write seals it anyway.
  private async migrate(filePath: string, text: string): Promise<void> {
    await this.writeSealed(filePath, text).catch(() => undefined);
  }

  private async ensureDirectoryExists(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
  }

  private async loadTokens(
    allowMissing = false,
  ): Promise<Map<string, OAuthCredentials>> {
    let opened: { text: string; legacy: boolean } | null;
    try {
      opened = await this.readSealed(this.tokenFilePath);
    } catch (error: unknown) {
      if (isUnreadableSecretFileError(error)) {
        throw new Error('Token file corrupted', { cause: error });
      }
      throw error;
    }
    if (!opened) {
      if (allowMissing) {
        return new Map();
      }
      throw new Error('Token file does not exist');
    }
    let tokens: Record<string, OAuthCredentials>;
    try {
      tokens = JSON.parse(opened.text) as Record<string, OAuthCredentials>;
    } catch (error: unknown) {
      throw new Error('Token file corrupted', { cause: error });
    }
    if (opened.legacy) {
      await this.migrate(this.tokenFilePath, opened.text);
    }
    return new Map(Object.entries(tokens));
  }

  private async saveTokens(
    tokens: Map<string, OAuthCredentials>,
  ): Promise<void> {
    const data = Object.fromEntries(tokens);
    await this.writeSealed(this.tokenFilePath, JSON.stringify(data, null, 2));
  }

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    const tokens = await this.loadTokens();
    const credentials = tokens.get(serverName);

    if (!credentials) {
      return null;
    }

    if (this.isTokenExpired(credentials)) {
      return null;
    }

    return credentials;
  }

  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    this.validateCredentials(credentials);

    const tokens = await this.loadTokens(true);
    const updatedCredentials: OAuthCredentials = {
      ...credentials,
      updatedAt: Date.now(),
    };

    tokens.set(credentials.serverName, updatedCredentials);
    await this.saveTokens(tokens);
  }

  async deleteCredentials(serverName: string): Promise<void> {
    const tokens = await this.loadTokens();

    if (!tokens.has(serverName)) {
      throw new Error(`No credentials found for ${serverName}`);
    }

    tokens.delete(serverName);

    if (tokens.size === 0) {
      try {
        await fs.unlink(this.tokenFilePath);
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') {
          throw error;
        }
      }
    } else {
      await this.saveTokens(tokens);
    }
  }

  async listServers(): Promise<string[]> {
    const tokens = await this.loadTokens();
    return Array.from(tokens.keys());
  }

  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const tokens = await this.loadTokens();
    const result = new Map<string, OAuthCredentials>();

    for (const [serverName, credentials] of tokens) {
      if (!this.isTokenExpired(credentials)) {
        result.set(serverName, credentials);
      }
    }

    return result;
  }

  async clearAll(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async loadSecrets(): Promise<SecretFileContents> {
    const opened = await this.readSealed(this.secretFilePath);
    if (!opened) {
      return {};
    }
    let secrets: SecretFileContents;
    try {
      secrets = JSON.parse(opened.text) as SecretFileContents;
    } catch (error: unknown) {
      throw new UnreadableSecretFileError(this.secretFilePath, {
        reason: 'modified',
        cause: error,
      });
    }
    if (opened.legacy) {
      await this.migrate(this.secretFilePath, opened.text);
    }
    return secrets;
  }

  private async saveSecrets(secrets: SecretFileContents): Promise<void> {
    await this.writeSealed(this.secretFilePath, JSON.stringify(secrets));
  }

  // The encrypted file is always usable, so the file backend is always available.
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async setSecret(key: string, value: string): Promise<void> {
    const secrets = await this.loadSecrets();
    (secrets[this.serviceName] ??= {})[key] = value;
    await this.saveSecrets(secrets);
  }

  async getSecret(key: string): Promise<string | null> {
    const secrets = await this.loadSecrets();
    return secrets[this.serviceName]?.[key] ?? null;
  }

  // Idempotent: deleting a missing secret is a no-op (the keychain backend
  // throws, but extension-settings callers do not depend on that signal).
  async deleteSecret(key: string): Promise<void> {
    const secrets = await this.loadSecrets();
    const bucket = secrets[this.serviceName];
    if (!bucket || !(key in bucket)) {
      return;
    }
    delete bucket[key];
    if (Object.keys(bucket).length === 0) {
      delete secrets[this.serviceName];
    }
    await this.saveSecrets(secrets);
  }

  async listSecrets(): Promise<string[]> {
    const secrets = await this.loadSecrets();
    return Object.keys(secrets[this.serviceName] ?? {});
  }
}
