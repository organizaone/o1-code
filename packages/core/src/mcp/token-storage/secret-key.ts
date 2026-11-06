/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

export const SECRET_KEY_FILE_NAME = 'secret-key-v1.json';

const KEY_FILE_VERSION = 1;
const KEY_BYTES = 32;
const CHECK_LABEL = 'o1-code-secret-key-check';

/**
 * The key that seals the encrypted files of the o1-code home. It is random
 * and lives in that home, so it follows the home wherever it goes: a roaming
 * profile across the hosts of a terminal-server farm opens the same files.
 */
export interface SecretKey {
  key: Buffer;
  /** Names the key inside each sealed file; derived from its check value. */
  id: string;
  filePath: string;
}

interface SecretKeyFile {
  version: number;
  key: string;
  check: string;
}

/** The key file exists but does not pass its own check: edited, truncated or damaged. */
export class DamagedSecretKeyError extends Error {
  readonly filePath: string;

  constructor(filePath: string, options?: { cause?: unknown }) {
    super(
      `${filePath} failed its integrity check: the secret key was modified or damaged`,
      options,
    );
    this.name = 'DamagedSecretKeyError';
    this.filePath = filePath;
  }
}

function checkValue(key: Buffer): string {
  return crypto.createHmac('sha256', key).update(CHECK_LABEL).digest('hex');
}

function keyId(check: string): string {
  return check.slice(0, 16);
}

function serialize(key: Buffer): string {
  const file: SecretKeyFile = {
    version: KEY_FILE_VERSION,
    key: key.toString('base64'),
    check: checkValue(key),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function parse(filePath: string, data: string): SecretKey {
  let file: Partial<SecretKeyFile>;
  try {
    file = JSON.parse(data) as Partial<SecretKeyFile>;
  } catch (error) {
    throw new DamagedSecretKeyError(filePath, { cause: error });
  }
  if (
    file === null ||
    typeof file !== 'object' ||
    file.version !== KEY_FILE_VERSION ||
    typeof file.key !== 'string' ||
    typeof file.check !== 'string'
  ) {
    throw new DamagedSecretKeyError(filePath);
  }
  const key = Buffer.from(file.key, 'base64');
  const check = checkValue(key);
  if (
    key.length !== KEY_BYTES ||
    file.check.length !== check.length ||
    !crypto.timingSafeEqual(Buffer.from(file.check), Buffer.from(check))
  ) {
    throw new DamagedSecretKeyError(filePath);
  }
  return { key, id: keyId(check), filePath };
}

async function read(filePath: string): Promise<SecretKey | null> {
  let data: string;
  try {
    data = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return parse(filePath, data);
}

/**
 * Publishes a new key only if no other process published one first: the
 * content is written whole to a private temporary file, then hard-linked
 * into place, which fails if the name exists. Two processes starting at
 * once therefore agree on a single key.
 */
async function create(filePath: string): Promise<SecretKey> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const content = serialize(crypto.randomBytes(KEY_BYTES));
  const tmpPath = path.join(
    dir,
    `.${SECRET_KEY_FILE_NAME}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  await fs.writeFile(tmpPath, content, { mode: 0o600, flag: 'wx' });
  try {
    await fs.link(tmpPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      // A file system without hard links: an exclusive create still keeps a
      // second process from replacing a key already in place.
      await fs.writeFile(filePath, content, { mode: 0o600, flag: 'wx' });
    }
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
  const key = await read(filePath);
  if (!key) throw new DamagedSecretKeyError(filePath);
  return key;
}

// One read per process and key file; a failure is not kept, so a key file
// set aside by the user is created again on the next attempt.
const cache = new Map<string, SecretKey>();

export async function loadSecretKey(
  configDir: string,
  options: { create: boolean },
): Promise<SecretKey | null> {
  const filePath = path.join(configDir, SECRET_KEY_FILE_NAME);
  const cached = cache.get(filePath);
  if (cached) return cached;
  let key = await read(filePath);
  if (!key && options.create) {
    key = await create(filePath);
  }
  if (key) cache.set(filePath, key);
  return key;
}

/** Test seam: drops the keys read by this process. */
export function clearSecretKeyCache(): void {
  cache.clear();
}

/**
 * The key earlier versions derived from the host name and the user. It only
 * opens files sealed on this very host, and is kept to migrate them.
 */
export function legacySecretKey(): Buffer {
  const salt = `${os.hostname()}-${os.userInfo().username}-o1-code`;
  return crypto.scryptSync('o1-code-oauth', salt, 32);
}
