/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  FileTokenStorage,
  UnreadableSecretFileError,
  setAsideUnreadableSecretFile,
} from './file-token-storage.js';
import type { OAuthCredentials } from './types.js';
import { atomicWriteFile } from '../../utils/atomicFileWrite.js';
import { DamagedSecretKeyError, loadSecretKey } from './secret-key.js';

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
  },
}));

vi.mock('../../utils/atomicFileWrite.js', () => ({
  atomicWriteFile: vi.fn(),
}));

vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(() => '/home/test'),
    hostname: vi.fn(() => 'test-host'),
    userInfo: vi.fn(() => ({ username: 'test-user' })),
  },
  homedir: vi.fn(() => '/home/test'),
  hostname: vi.fn(() => 'test-host'),
  userInfo: vi.fn(() => ({ username: 'test-user' })),
}));

const TEST_KEY = crypto.createHash('sha256').update('test-key').digest();
const TEST_KEY_ID = '0123456789abcdef';
const KEY_FILE_PATH = path.join('/home/test', '.o1-code', 'secret-key-v1.json');

vi.mock('./secret-key.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./secret-key.js')>();
  return { ...actual, loadSecretKey: vi.fn() };
});

const tokenFilePath = path.join(
  '/home/test',
  '.o1-code',
  'mcp-oauth-tokens-v2.json',
);
const secretFilePath = path.join(
  '/home/test',
  '.o1-code',
  'extension-secrets-v1.json',
);

// Written apart from the implementation, so the tests pin the on-disk format.
function seal(
  text: string,
  filePath = tokenFilePath,
  options: { key?: Buffer; id?: string } = {},
): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    options.key ?? TEST_KEY,
    iv,
  );
  cipher.setAAD(Buffer.from(`o1-code:${path.basename(filePath)}`));
  const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  return [
    'o1s2',
    options.id ?? TEST_KEY_ID,
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted,
  ].join(':');
}

function sealLegacy(text: string, host = 'test-host'): string {
  const key = crypto.scryptSync(
    'o1-code-oauth',
    `${host}-test-user-o1-code`,
    32,
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

function open(sealed: string, filePath: string): string {
  const [prefix, id, iv, tag, encrypted] = sealed.split(':');
  expect(prefix).toBe('o1s2');
  expect(id).toBe(TEST_KEY_ID);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    TEST_KEY,
    Buffer.from(iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  decipher.setAAD(Buffer.from(`o1-code:${path.basename(filePath)}`));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

function unseal(writeCall: unknown[]): string {
  return open(writeCall[1] as string, writeCall[0] as string);
}

function unsealSecrets(writtenData: unknown): string {
  return open(writtenData as string, secretFilePath);
}

describe('FileTokenStorage', () => {
  let storage: FileTokenStorage;
  const mockFs = fs as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
  };
  const existingCredentials: OAuthCredentials = {
    serverName: 'existing-server',
    token: {
      accessToken: 'existing-token',
      tokenType: 'Bearer',
    },
    updatedAt: Date.now() - 10000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadSecretKey).mockResolvedValue({
      key: TEST_KEY,
      id: TEST_KEY_ID,
      filePath: KEY_FILE_PATH,
    });
    storage = new FileTokenStorage('test-storage');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCredentials', () => {
    it('should throw error when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.getCredentials('test-server')).rejects.toThrow(
        'Token file does not exist',
      );
    });

    it('should return null for expired tokens', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() - 3600000,
        },
        updatedAt: Date.now(),
      };

      const encryptedData = seal(
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.getCredentials('test-server');
      expect(result).toBeNull();
    });

    it('should return credentials for valid tokens', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() + 3600000,
        },
        updatedAt: Date.now(),
      };

      const encryptedData = seal(
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.getCredentials('test-server');
      expect(result).toEqual(credentials);
    });

    it('should throw error for corrupted files', async () => {
      mockFs.readFile.mockResolvedValue('corrupted-data');

      await expect(storage.getCredentials('test-server')).rejects.toThrow(
        'Token file corrupted',
      );
    });

    it('moves tokens an earlier version sealed on this host onto the new key', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: { accessToken: 'legacy-token', tokenType: 'Bearer' },
        updatedAt: Date.now(),
      };
      mockFs.readFile.mockResolvedValue(
        sealLegacy(JSON.stringify({ 'test-server': credentials })),
      );
      mockFs.mkdir.mockResolvedValue(undefined);
      vi.mocked(atomicWriteFile).mockResolvedValue(undefined);

      await expect(storage.getCredentials('test-server')).resolves.toEqual(
        credentials,
      );
      const writeCall = vi.mocked(atomicWriteFile).mock.calls[0];
      expect(writeCall[0]).toBe(tokenFilePath);
      expect(JSON.parse(unseal(writeCall))['test-server']).toEqual(credentials);
    });
  });

  describe('setCredentials', () => {
    it('should create token file when saving credentials for the first time', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
      mockFs.mkdir.mockResolvedValue(undefined);
      vi.mocked(atomicWriteFile).mockResolvedValue(undefined);

      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now() - 10000,
      };

      await storage.setCredentials(credentials);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join('/home/test', '.o1-code'),
        { recursive: true, mode: 0o700 },
      );
      expect(atomicWriteFile).toHaveBeenCalled();

      const writeCall = vi.mocked(atomicWriteFile).mock.calls[0];
      const decrypted = unseal(writeCall);
      const saved = JSON.parse(decrypted);

      expect(Object.keys(saved)).toEqual(['test-server']);
      expect(saved['test-server']).toEqual({
        ...credentials,
        updatedAt: expect.any(Number),
      });
    });

    it('should save credentials with encryption', async () => {
      const encryptedData = seal(
        JSON.stringify({ 'existing-server': existingCredentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.mkdir.mockResolvedValue(undefined);
      vi.mocked(atomicWriteFile).mockResolvedValue(undefined);

      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      await storage.setCredentials(credentials);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join('/home/test', '.o1-code'),
        { recursive: true, mode: 0o700 },
      );
      expect(atomicWriteFile).toHaveBeenCalled();

      const writeCall = vi.mocked(atomicWriteFile).mock.calls[0];
      expect(writeCall[1]).toMatch(
        /^o1s2:0123456789abcdef:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/,
      );
      expect(writeCall[2]).toEqual({
        mode: 0o600,
        forceMode: true,
        noFollow: true,
      });
    });

    it('should update existing credentials', async () => {
      const encryptedData = seal(
        JSON.stringify({ 'existing-server': existingCredentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      vi.mocked(atomicWriteFile).mockResolvedValue(undefined);

      const newCredentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'new-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      await storage.setCredentials(newCredentials);

      expect(atomicWriteFile).toHaveBeenCalled();
      const writeCall = vi.mocked(atomicWriteFile).mock.calls[0];
      const decrypted = unseal(writeCall);
      const saved = JSON.parse(decrypted);

      expect(saved['existing-server']).toEqual(existingCredentials);
      expect(saved['test-server'].token.accessToken).toBe('new-token');
    });

    // saveTokens has no try/catch around atomicWriteFile, so disk
    // failures (ENOSPC, EROFS, EPERM) propagate to setCredentials
    // callers. A regression that silently swallowed the failure or
    // left the in-memory token map out of sync with disk would have
    // gone undetected.
    it('should propagate atomicWriteFile failures', async () => {
      const encryptedData = seal(
        JSON.stringify({ 'existing-server': existingCredentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.mkdir.mockResolvedValue(undefined);
      vi.mocked(atomicWriteFile).mockRejectedValueOnce(
        Object.assign(new Error('ENOSPC: no space left on device'), {
          code: 'ENOSPC',
        }) as NodeJS.ErrnoException,
      );

      await expect(
        storage.setCredentials({
          serverName: 'test-server',
          token: { accessToken: 'tok', tokenType: 'Bearer' },
          updatedAt: Date.now(),
        }),
      ).rejects.toThrow(/ENOSPC/);
    });
  });

  describe('deleteCredentials', () => {
    it('should throw when credentials do not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.deleteCredentials('test-server')).rejects.toThrow(
        'Token file does not exist',
      );
    });

    it('should delete file when last credential is removed', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const encryptedData = seal(
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.unlink.mockResolvedValue(undefined);

      await storage.deleteCredentials('test-server');

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/home/test', '.o1-code', 'mcp-oauth-tokens-v2.json'),
      );
    });

    it('should update file when other credentials remain', async () => {
      const credentials1: OAuthCredentials = {
        serverName: 'server1',
        token: {
          accessToken: 'token1',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const credentials2: OAuthCredentials = {
        serverName: 'server2',
        token: {
          accessToken: 'token2',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const encryptedData = seal(
        JSON.stringify({ server1: credentials1, server2: credentials2 }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      vi.mocked(atomicWriteFile).mockResolvedValue(undefined);

      await storage.deleteCredentials('server1');

      expect(atomicWriteFile).toHaveBeenCalled();
      expect(mockFs.unlink).not.toHaveBeenCalled();

      const writeCall = vi.mocked(atomicWriteFile).mock.calls[0];
      const decrypted = unseal(writeCall);
      const saved = JSON.parse(decrypted);

      expect(saved['server1']).toBeUndefined();
      expect(saved['server2']).toEqual(credentials2);
    });

    it('should propagate atomicWriteFile failures', async () => {
      const credentials1: OAuthCredentials = {
        serverName: 'server1',
        token: { accessToken: 'token1', tokenType: 'Bearer' },
        updatedAt: Date.now(),
      };
      const credentials2: OAuthCredentials = {
        serverName: 'server2',
        token: { accessToken: 'token2', tokenType: 'Bearer' },
        updatedAt: Date.now(),
      };
      const encryptedData = seal(
        JSON.stringify({ server1: credentials1, server2: credentials2 }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      vi.mocked(atomicWriteFile).mockRejectedValueOnce(
        Object.assign(new Error('EROFS: read-only file system'), {
          code: 'EROFS',
        }) as NodeJS.ErrnoException,
      );

      await expect(storage.deleteCredentials('server1')).rejects.toThrow(
        /EROFS/,
      );
    });
  });

  describe('listServers', () => {
    it('should throw error when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.listServers()).rejects.toThrow(
        'Token file does not exist',
      );
    });

    it('should return list of server names', async () => {
      const credentials: Record<string, OAuthCredentials> = {
        server1: {
          serverName: 'server1',
          token: { accessToken: 'token1', tokenType: 'Bearer' },
          updatedAt: Date.now(),
        },
        server2: {
          serverName: 'server2',
          token: { accessToken: 'token2', tokenType: 'Bearer' },
          updatedAt: Date.now(),
        },
      };

      const encryptedData = seal(JSON.stringify(credentials));
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.listServers();
      expect(result).toEqual(['server1', 'server2']);
    });
  });

  describe('clearAll', () => {
    it('should delete the token file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await storage.clearAll();

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/home/test', '.o1-code', 'mcp-oauth-tokens-v2.json'),
      );
    });

    it('should not throw when file does not exist', async () => {
      mockFs.unlink.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.clearAll()).resolves.not.toThrow();
    });
  });

  describe('encryption', () => {
    it('seals with a fresh IV each time, under the key named in the file', async () => {
      const first = await storage['encrypt']('test-data', tokenFilePath);
      const second = await storage['encrypt']('test-data', tokenFilePath);

      expect(first).not.toBe(second);
      expect(open(first, tokenFilePath)).toBe('test-data');
      expect(open(second, tokenFilePath)).toBe('test-data');
      expect(loadSecretKey).toHaveBeenCalledWith(
        path.join('/home/test', '.o1-code'),
        { create: true },
      );
    });

    it('opens what it sealed without creating a key to read', async () => {
      const sealed = await storage['encrypt']('test-data', tokenFilePath);
      await expect(storage['decrypt'](sealed, tokenFilePath)).resolves.toEqual({
        text: 'test-data',
        legacy: false,
      });
      expect(loadSecretKey).toHaveBeenLastCalledWith(
        path.join('/home/test', '.o1-code'),
        { create: false },
      );
    });

    it('does not open a file moved under another sealed file’s name', async () => {
      const sealed = seal('{"server":{}}', tokenFilePath);
      await expect(
        storage['decrypt'](sealed, secretFilePath),
      ).rejects.toMatchObject({ reason: 'modified', filePath: secretFilePath });
    });

    it('rejects data that is not in a sealed format', async () => {
      await expect(
        storage['decrypt']('invalid-data', tokenFilePath),
      ).rejects.toMatchObject({ reason: 'modified' });
    });
  });

  describe('secret storage', () => {
    beforeEach(() => {
      mockFs.mkdir.mockResolvedValue(undefined);
      vi.mocked(atomicWriteFile).mockResolvedValue(undefined);
    });

    it('isAvailable() is always true for the file backend', async () => {
      await expect(storage.isAvailable()).resolves.toBe(true);
    });

    it('returns null / empty when no secret file exists', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.getSecret('API_KEY')).resolves.toBeNull();
      await expect(storage.listSecrets()).resolves.toEqual([]);
    });

    it('persists a secret encrypted under the service name', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await storage.setSecret('API_KEY', 'sk-123');

      expect(atomicWriteFile).toHaveBeenCalledTimes(1);
      const [writtenPath, writtenData, writeOptions] =
        vi.mocked(atomicWriteFile).mock.calls[0];
      expect(writtenPath).toBe(secretFilePath);
      expect(writtenData).toMatch(
        /^o1s2:0123456789abcdef:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/,
      );
      expect(writeOptions).toEqual({
        mode: 0o600,
        forceMode: true,
        noFollow: true,
      });
      expect(JSON.parse(unsealSecrets(writtenData))).toEqual({
        'test-storage': { API_KEY: 'sk-123' },
      });
    });

    it('reads back a stored secret and ignores other keys and services', async () => {
      const encrypted = seal(
        JSON.stringify({
          'test-storage': { API_KEY: 'sk-123' },
          'other-service': { API_KEY: 'sk-other' },
        }),
        secretFilePath,
      );
      mockFs.readFile.mockResolvedValue(encrypted);

      await expect(storage.getSecret('API_KEY')).resolves.toBe('sk-123');
      await expect(storage.getSecret('MISSING')).resolves.toBeNull();
      await expect(storage.listSecrets()).resolves.toEqual(['API_KEY']);
    });

    it('deletes a secret and drops the now-empty service bucket', async () => {
      const encrypted = seal(
        JSON.stringify({ 'test-storage': { API_KEY: 'sk-123' } }),
        secretFilePath,
      );
      mockFs.readFile.mockResolvedValue(encrypted);

      await storage.deleteSecret('API_KEY');

      expect(atomicWriteFile).toHaveBeenCalledTimes(1);
      const [, writtenData] = vi.mocked(atomicWriteFile).mock.calls[0];
      expect(JSON.parse(unsealSecrets(writtenData))).toEqual({});
    });

    it('deleting a missing secret is a no-op (no write, no throw)', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.deleteSecret('API_KEY')).resolves.toBeUndefined();
      expect(atomicWriteFile).not.toHaveBeenCalled();
    });

    it('moves a file an earlier version sealed on this host onto the new key', async () => {
      mockFs.readFile.mockResolvedValue(
        sealLegacy('{"test-storage":{"API_KEY":"sk-legacy"}}'),
      );

      await expect(storage.getSecret('API_KEY')).resolves.toBe('sk-legacy');

      expect(atomicWriteFile).toHaveBeenCalledTimes(1);
      const [writtenPath, writtenData] =
        vi.mocked(atomicWriteFile).mock.calls[0];
      expect(writtenPath).toBe(secretFilePath);
      expect(JSON.parse(unsealSecrets(writtenData))).toEqual({
        'test-storage': { API_KEY: 'sk-legacy' },
      });
    });

    it('still reads a migrated file when sealing it again fails', async () => {
      mockFs.readFile.mockResolvedValue(
        sealLegacy('{"test-storage":{"API_KEY":"sk-legacy"}}'),
      );
      vi.mocked(atomicWriteFile).mockRejectedValueOnce(new Error('EROFS'));

      await expect(storage.getSecret('API_KEY')).resolves.toBe('sk-legacy');
    });

    it('refuses a file an earlier version sealed on another host and writes nothing', async () => {
      mockFs.readFile.mockResolvedValue(
        sealLegacy('{"svc":{"K":"sk-secret"}}', 'other-host'),
      );

      const read = storage.getSecret('API_KEY');
      await expect(read).rejects.toBeInstanceOf(UnreadableSecretFileError);
      await expect(read).rejects.toMatchObject({
        filePath: secretFilePath,
        reason: 'other-machine',
      });
      await expect(storage.setSecret('API_KEY', 'sk-new')).rejects.toThrow(
        'another host name or user',
      );
      expect(atomicWriteFile).not.toHaveBeenCalled();
    });

    it('opens a file wherever its home is, whatever the host name', async () => {
      const sealed = seal(
        '{"test-storage":{"API_KEY":"sk-123"}}',
        secretFilePath,
      );
      const os = await import('node:os');
      vi.mocked(os.hostname).mockReturnValue('another-farm-host');
      try {
        mockFs.readFile.mockResolvedValue(sealed);
        await expect(storage.getSecret('API_KEY')).resolves.toBe('sk-123');
      } finally {
        vi.mocked(os.hostname).mockReturnValue('test-host');
      }
    });

    it('refuses a file whose content was modified', async () => {
      const sealed = seal(
        '{"test-storage":{"API_KEY":"sk-123"}}',
        secretFilePath,
      );
      const last = sealed.at(-1) === '0' ? '1' : '0';
      mockFs.readFile.mockResolvedValue(`${sealed.slice(0, -1)}${last}`);

      await expect(storage.getSecret('API_KEY')).rejects.toMatchObject({
        filePath: secretFilePath,
        reason: 'modified',
      });
      expect(atomicWriteFile).not.toHaveBeenCalled();
    });

    it('refuses a file whose authentication tag was truncated', async () => {
      const parts = seal(
        '{"test-storage":{"API_KEY":"sk-123"}}',
        secretFilePath,
      ).split(':');
      parts[3] = parts[3].slice(0, 8);
      mockFs.readFile.mockResolvedValue(parts.join(':'));

      await expect(storage.getSecret('API_KEY')).rejects.toMatchObject({
        reason: 'modified',
      });
    });

    it('refuses a file sealed with another key, without creating one to read', async () => {
      mockFs.readFile.mockResolvedValue(
        seal('{}', secretFilePath, {
          key: crypto.randomBytes(32),
          id: 'fedcba9876543210',
        }),
      );
      await expect(storage.getSecret('API_KEY')).rejects.toMatchObject({
        reason: 'other-key',
      });

      vi.mocked(loadSecretKey).mockResolvedValue(null);
      await expect(storage.getSecret('API_KEY')).rejects.toMatchObject({
        reason: 'other-key',
      });
      expect(loadSecretKey).toHaveBeenLastCalledWith(
        path.join('/home/test', '.o1-code'),
        { create: false },
      );
    });

    it('names the key file when the key itself is damaged', async () => {
      mockFs.readFile.mockResolvedValue(seal('{}', secretFilePath));
      vi.mocked(loadSecretKey).mockRejectedValue(
        new DamagedSecretKeyError(KEY_FILE_PATH),
      );

      await expect(storage.getSecret('API_KEY')).rejects.toMatchObject({
        filePath: KEY_FILE_PATH,
        reason: 'key-damaged',
      });
    });

    it('treats a file that is not in the sealed format as unreadable too', async () => {
      mockFs.readFile.mockResolvedValue('not-sealed');
      await expect(storage.getSecret('API_KEY')).rejects.toBeInstanceOf(
        UnreadableSecretFileError,
      );
    });

    it('sets an unreadable file aside under a dated .bak name', async () => {
      mockFs.rename.mockResolvedValue(undefined);
      const backup = await setAsideUnreadableSecretFile(
        secretFilePath,
        new Date(2026, 9, 8, 15, 56, 4),
      );
      expect(backup).toBe(`${secretFilePath}.unreadable-20261008-155604.bak`);
      expect(mockFs.rename).toHaveBeenCalledWith(secretFilePath, backup);
    });
  });
});
