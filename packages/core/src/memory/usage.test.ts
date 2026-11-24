/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeAutoMemoryFingerprint } from './memory-fingerprint.js';
import { clearAutoMemoryRootCache, getAutoMemoryRoot } from './paths.js';
import {
  ensureAutoMemoryUsageTracking,
  getAutoMemoryUsagePath,
  listUnusedAutoMemories,
  markAutoMemoriesReviewed,
  recordAutoMemoryRecalls,
} from './usage.js';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-11-24T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe('auto-memory recall usage', () => {
  let projectRoot: string;

  async function writeMemory(relativePath: string, ageDays: number) {
    const filePath = path.join(getAutoMemoryRoot(projectRoot), relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      `---\nname: ${relativePath}\ndescription: d\ntype: feedback\n---\n\nbody\n`,
    );
    const at = daysAgo(ageDays);
    await fs.utimes(filePath, at, at);
    return filePath;
  }

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-usage-'));
    clearAutoMemoryRootCache();
  });

  afterEach(async () => {
    clearAutoMemoryRootCache();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('counts each delivery and keeps concurrent records', async () => {
    const a = await writeMemory('feedback/a.md', 0);
    const b = await writeMemory('feedback/b.md', 0);

    await Promise.all([
      recordAutoMemoryRecalls(projectRoot, [a], NOW),
      recordAutoMemoryRecalls(projectRoot, [a, b], NOW),
    ]);

    const usage = JSON.parse(
      await fs.readFile(getAutoMemoryUsagePath(projectRoot), 'utf-8'),
    ) as { entries: Record<string, { count: number }> };
    expect(usage.entries[path.resolve(a)]?.count).toBe(2);
    expect(usage.entries[path.resolve(b)]?.count).toBe(1);
  });

  it('does not count a read of the MEMORY.md index as use', async () => {
    await recordAutoMemoryRecalls(
      projectRoot,
      [path.join(getAutoMemoryRoot(projectRoot), 'MEMORY.md')],
      NOW,
    );
    await expect(
      fs.access(getAutoMemoryUsagePath(projectRoot)),
    ).rejects.toThrow();
  });

  it('lists nothing until usage has been tracked for the whole window', async () => {
    await writeMemory('feedback/old.md', 90);
    await ensureAutoMemoryUsageTracking(projectRoot, daysAgo(10));

    expect(await listUnusedAutoMemories(projectRoot, NOW)).toEqual([]);
  });

  it('lists old memories that recall has not used, never pinned ones', async () => {
    await ensureAutoMemoryUsageTracking(projectRoot, daysAgo(60));
    await writeMemory('feedback/never-used.md', 90);
    const usedLongAgo = await writeMemory('reference/used-long-ago.md', 90);
    const usedRecently = await writeMemory('feedback/used-recently.md', 90);
    await writeMemory('project/edited-recently.md', 3);
    await writeMemory('pinned/architecture.md', 90);
    await recordAutoMemoryRecalls(projectRoot, [usedLongAgo], daysAgo(45));
    await recordAutoMemoryRecalls(projectRoot, [usedRecently], daysAgo(2));

    expect(await listUnusedAutoMemories(projectRoot, NOW)).toEqual([
      'feedback/never-used.md',
      'reference/used-long-ago.md',
    ]);
  });

  it('does not offer a reviewed memory again within the window, and drops deleted ones', async () => {
    await ensureAutoMemoryUsageTracking(projectRoot, daysAgo(60));
    const kept = await writeMemory('feedback/kept.md', 90);
    const deleted = await writeMemory('reference/deleted.md', 90);
    await recordAutoMemoryRecalls(projectRoot, [deleted], daysAgo(50));
    expect(await listUnusedAutoMemories(projectRoot, NOW)).toEqual([
      'feedback/kept.md',
      'reference/deleted.md',
    ]);

    await fs.rm(deleted);
    await markAutoMemoriesReviewed(projectRoot, [kept, deleted], NOW);

    expect(await listUnusedAutoMemories(projectRoot, NOW)).toEqual([]);
    expect(
      await listUnusedAutoMemories(
        projectRoot,
        new Date(NOW.getTime() + 31 * DAY_MS),
      ),
    ).toEqual(['feedback/kept.md']);
    const usage = JSON.parse(
      await fs.readFile(getAutoMemoryUsagePath(projectRoot), 'utf-8'),
    ) as { entries: Record<string, unknown> };
    expect(Object.keys(usage.entries)).toEqual([path.resolve(kept)]);
  });

  it('changes the fingerprint when a memory changes, not when the index does', async () => {
    const file = await writeMemory('feedback/a.md', 5);
    const before = await computeAutoMemoryFingerprint(projectRoot);

    await fs.writeFile(
      path.join(getAutoMemoryRoot(projectRoot), 'MEMORY.md'),
      '- [a](feedback/a.md) — a\n',
    );
    expect(await computeAutoMemoryFingerprint(projectRoot)).toBe(before);

    await fs.appendFile(file, 'more\n');
    expect(await computeAutoMemoryFingerprint(projectRoot)).not.toBe(before);
  });
});
