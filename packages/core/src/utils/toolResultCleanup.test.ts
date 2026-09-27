/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const readdirFailures = vi.hoisted(() => new Map<string, string>());

vi.mock('./debugLogger.js', () => ({
  createDebugLogger: () => logger,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: async (dir: string) => {
      const code = readdirFailures.get(path.resolve(dir));
      if (code) {
        throw Object.assign(new Error(`${code}: ${dir}`), { code });
      }
      return actual.readdir(dir);
    },
  };
});

const fs = await import('node:fs/promises');
const { cleanupOldToolResults } = await import('./toolResultCleanup.js');

const DAY_MS = 24 * 60 * 60 * 1000;

function readDirectoryLogs(): string[] {
  return logger.debug.mock.calls
    .map((args) => String(args[0]))
    .filter((message) => message.startsWith('Cannot read directory'));
}

describe('cleanupOldToolResults', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'o1-code-cleanup-'));
  });

  afterEach(async () => {
    readdirFailures.clear();
    vi.clearAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('skips a project without a tool-results directory silently', async () => {
    await fs.mkdir(path.join(tempDir, 'project-a'));

    const result = await cleanupOldToolResults(tempDir, DAY_MS);

    expect(result.errors).toBe(0);
    expect(readDirectoryLogs()).toEqual([]);
  });

  it('skips a tool-results entry that is a file silently', async () => {
    await fs.mkdir(path.join(tempDir, 'project-a'));
    await fs.writeFile(path.join(tempDir, 'project-a', 'tool-results'), '');

    const result = await cleanupOldToolResults(tempDir, DAY_MS);

    expect(result.errors).toBe(0);
    expect(readDirectoryLogs()).toEqual([]);
  });

  it('still logs a directory it is not allowed to read', async () => {
    const toolResults = path.join(tempDir, 'project-a', 'tool-results');
    await fs.mkdir(toolResults, { recursive: true });
    readdirFailures.set(path.resolve(toolResults), 'EACCES');

    await cleanupOldToolResults(tempDir, DAY_MS);

    expect(readDirectoryLogs()).toEqual([
      `Cannot read directory ${toolResults}:`,
    ]);
  });

  it('deletes tool results older than the limit', async () => {
    const toolResults = path.join(tempDir, 'project-a', 'tool-results');
    await fs.mkdir(toolResults, { recursive: true });
    const oldFile = path.join(toolResults, 'old.txt');
    await fs.writeFile(oldFile, 'x');
    const past = new Date(Date.now() - 2 * DAY_MS);
    await fs.utimes(oldFile, past, past);

    const result = await cleanupOldToolResults(tempDir, DAY_MS);

    expect(result.filesDeleted).toBe(1);
    await expect(fs.stat(oldFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
