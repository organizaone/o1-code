/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DamagedSecretKeyError,
  SECRET_KEY_FILE_NAME,
  clearSecretKeyCache,
  loadSecretKey,
} from './secret-key.js';

describe('secret key', () => {
  let dir: string;
  let keyPath: string;

  beforeEach(async () => {
    clearSecretKeyCache();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'o1-secret-key-'));
    keyPath = path.join(dir, SECRET_KEY_FILE_NAME);
  });

  afterEach(async () => {
    clearSecretKeyCache();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates nothing when only reading', async () => {
    await expect(loadSecretKey(dir, { create: false })).resolves.toBeNull();
    await expect(fs.readdir(dir)).resolves.toEqual([]);
  });

  it('creates a random key once and reads the same key back', async () => {
    const created = await loadSecretKey(dir, { create: true });
    expect(created?.key).toHaveLength(32);
    expect(created?.filePath).toBe(keyPath);
    // Only the key file remains: the temporary file was removed.
    await expect(fs.readdir(dir)).resolves.toEqual([SECRET_KEY_FILE_NAME]);

    clearSecretKeyCache();
    const reread = await loadSecretKey(dir, { create: false });
    expect(reread?.key.equals(created!.key)).toBe(true);
    expect(reread?.id).toBe(created?.id);
  });

  it('does not depend on the host: the same file opens wherever the home is', async () => {
    const created = await loadSecretKey(dir, { create: true });
    const copy = await fs.mkdtemp(path.join(os.tmpdir(), 'o1-secret-key-'));
    try {
      await fs.copyFile(keyPath, path.join(copy, SECRET_KEY_FILE_NAME));
      clearSecretKeyCache();
      const moved = await loadSecretKey(copy, { create: false });
      expect(moved?.key.equals(created!.key)).toBe(true);
    } finally {
      await fs.rm(copy, { recursive: true, force: true });
    }
  });

  it('agrees on one key when processes create it at the same time', async () => {
    const keys = await Promise.all(
      Array.from({ length: 8 }, async () => {
        // Each call stands for a separate process: nothing is shared in memory.
        clearSecretKeyCache();
        return loadSecretKey(dir, { create: true });
      }),
    );
    const ids = new Set(keys.map((key) => key?.id));
    expect(ids.size).toBe(1);
    await expect(fs.readdir(dir)).resolves.toEqual([SECRET_KEY_FILE_NAME]);
  });

  it('rejects a key file whose key was changed without its check value', async () => {
    await loadSecretKey(dir, { create: true });
    const file = JSON.parse(await fs.readFile(keyPath, 'utf-8')) as {
      key: string;
    };
    const tampered = Buffer.from(file.key, 'base64');
    tampered[0] ^= 0xff;
    file.key = tampered.toString('base64');
    await fs.writeFile(keyPath, JSON.stringify(file));
    clearSecretKeyCache();

    const read = loadSecretKey(dir, { create: true });
    await expect(read).rejects.toBeInstanceOf(DamagedSecretKeyError);
    await expect(read).rejects.toMatchObject({ filePath: keyPath });
  });

  it('rejects a truncated key file instead of replacing it', async () => {
    await loadSecretKey(dir, { create: true });
    const original = await fs.readFile(keyPath, 'utf-8');
    await fs.writeFile(keyPath, original.slice(0, 20));
    clearSecretKeyCache();

    await expect(loadSecretKey(dir, { create: true })).rejects.toBeInstanceOf(
      DamagedSecretKeyError,
    );
    await expect(fs.readFile(keyPath, 'utf-8')).resolves.toBe(
      original.slice(0, 20),
    );
  });

  it('creates a new key after a damaged one was set aside', async () => {
    await fs.writeFile(keyPath, 'not a key');
    await expect(loadSecretKey(dir, { create: true })).rejects.toBeInstanceOf(
      DamagedSecretKeyError,
    );
    await fs.rename(keyPath, `${keyPath}.bak`);
    await expect(loadSecretKey(dir, { create: true })).resolves.not.toBeNull();
  });
});
