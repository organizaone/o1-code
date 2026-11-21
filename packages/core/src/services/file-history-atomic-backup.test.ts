/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockStorageDir = vi.hoisted(() => vi.fn());
vi.mock('../config/storage.js', () => ({
  Storage: { getGlobalO1CodeDir: mockStorageDir },
}));

vi.mock('../utils/debugLogger.js', () => ({
  createDebugLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockRename = vi.hoisted(() => vi.fn());
vi.mock('../utils/atomicFileWrite.js', () => ({
  renameWithRetry: mockRename,
}));

import { FileHistoryService } from './fileHistoryService.js';

async function listFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

describe('FileHistoryService backup write', () => {
  let projectDir: string;
  let storageDir: string;
  let service: FileHistoryService;
  let file: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'fh-atomic-project-'));
    storageDir = await mkdtemp(join(tmpdir(), 'fh-atomic-storage-'));
    mockStorageDir.mockReturnValue(storageDir);
    mockRename.mockReset();
    service = new FileHistoryService('test-session', true, projectDir);
    file = join(projectDir, 'a.txt');
    await writeFile(file, 'original');
    await service.makeSnapshot('p1');
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(storageDir, { recursive: true, force: true });
  });

  it('gives the backup its name only once the whole copy is on disk', async () => {
    mockRename.mockImplementation(async (src: string, dest: string) => {
      expect(src).not.toBe(dest);
      expect(existsSync(dest)).toBe(false);
      expect(await readFile(src, 'utf8')).toBe('original');
      await rename(src, dest);
    });

    await service.trackEdit(file);

    expect(mockRename).toHaveBeenCalledTimes(1);
    const files = await listFiles(storageDir);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toMatch(/\.tmp$/);
  });

  it('leaves neither a backup nor a temporary file when the write fails', async () => {
    mockRename.mockRejectedValue(
      Object.assign(new Error('busy'), { code: 'EBUSY' }),
    );

    await service.trackEdit(file).catch(() => undefined);

    expect(mockRename).toHaveBeenCalledTimes(1);
    expect(await listFiles(storageDir)).toEqual([]);
  });

  it('rewinds to the content the backup captured', async () => {
    mockRename.mockImplementation(rename);

    await service.trackEdit(file);
    await writeFile(file, 'modified');
    await service.makeSnapshot('p2');
    const result = await service.rewind('p1');

    expect(result.filesFailed).toEqual([]);
    expect(await readFile(file, 'utf8')).toBe('original');
  });
});
