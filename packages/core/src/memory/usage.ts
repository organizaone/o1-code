/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { atomicWriteFile } from '../utils/atomicFileWrite.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import {
  AUTO_MEMORY_PINNED_DIRNAME,
  getAutoMemoryProjectStateDir,
} from './paths.js';
import { scanAllAutoMemoryTopicDocuments } from './scan.js';

const debugLogger = createDebugLogger('AUTO_MEMORY_USAGE');

export const AUTO_MEMORY_USAGE_FILENAME = 'recall-usage.json';
/** A project memory not recalled for this many days is offered to Dream for pruning. */
export const DEFAULT_UNUSED_MEMORY_DAYS = 30;
const MAX_UNUSED_CANDIDATES = 50;
const DAY_MS = 86_400_000;

interface UsageEntry {
  count: number;
  lastRecalledAt: string;
}

/**
 * Per-project record of which memories recall delivered to the model.
 * `trackingSince` keeps memories older than the record itself from looking
 * unused merely because nothing was tracking them yet.
 */
export interface AutoMemoryUsage {
  version: 1;
  trackingSince: string;
  entries: Record<string, UsageEntry>;
}

export function getAutoMemoryUsagePath(projectRoot: string): string {
  return path.join(
    getAutoMemoryProjectStateDir(projectRoot),
    AUTO_MEMORY_USAGE_FILENAME,
  );
}

async function readUsage(projectRoot: string): Promise<AutoMemoryUsage | null> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(getAutoMemoryUsagePath(projectRoot), 'utf-8'),
    ) as Partial<AutoMemoryUsage>;
    if (
      parsed.version !== 1 ||
      typeof parsed.trackingSince !== 'string' ||
      typeof parsed.entries !== 'object' ||
      parsed.entries === null
    ) {
      return null;
    }
    return parsed as AutoMemoryUsage;
  } catch {
    return null;
  }
}

// Recall can deliver twice in one turn (fast and refined results), so writes
// for one project are serialized to keep a read-modify-write from losing a count.
const pendingWrites = new Map<string, Promise<void>>();

/** Record that recall delivered these memory files to the model. Best-effort. */
export function recordAutoMemoryRecalls(
  projectRoot: string,
  filePaths: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  if (filePaths.length === 0) {
    return Promise.resolve();
  }
  const previous = pendingWrites.get(projectRoot) ?? Promise.resolve();
  const next = previous.then(async () => {
    try {
      const usage = (await readUsage(projectRoot)) ?? {
        version: 1 as const,
        trackingSince: now.toISOString(),
        entries: {},
      };
      for (const filePath of new Set(filePaths)) {
        const key = path.resolve(filePath);
        const entry = usage.entries[key];
        usage.entries[key] = {
          count: (entry?.count ?? 0) + 1,
          lastRecalledAt: now.toISOString(),
        };
      }
      await fs.mkdir(getAutoMemoryProjectStateDir(projectRoot), {
        recursive: true,
      });
      await atomicWriteFile(
        getAutoMemoryUsagePath(projectRoot),
        `${JSON.stringify(usage, null, 2)}\n`,
        { encoding: 'utf-8' },
      );
    } catch (error) {
      debugLogger.debug('Could not record memory recall usage', error);
    }
  });
  pendingWrites.set(projectRoot, next);
  void next.finally(() => {
    if (pendingWrites.get(projectRoot) === next) {
      pendingWrites.delete(projectRoot);
    }
  });
  return next;
}

/** Start the usage record if none exists, so its age counts from first use. */
export async function ensureAutoMemoryUsageTracking(
  projectRoot: string,
  now: Date = new Date(),
): Promise<void> {
  if (await readUsage(projectRoot)) {
    return;
  }
  try {
    await fs.mkdir(getAutoMemoryProjectStateDir(projectRoot), {
      recursive: true,
    });
    await atomicWriteFile(
      getAutoMemoryUsagePath(projectRoot),
      `${JSON.stringify(
        { version: 1, trackingSince: now.toISOString(), entries: {} },
        null,
        2,
      )}\n`,
      { encoding: 'utf-8' },
    );
  } catch (error) {
    debugLogger.debug('Could not start memory recall usage tracking', error);
  }
}

/**
 * Project memories that recall has not delivered for `days` days and that were
 * not edited in that time either. Pinned memories are never candidates. Empty
 * until usage has been tracked for at least `days` days.
 */
export async function listUnusedAutoMemories(
  projectRoot: string,
  now: Date = new Date(),
  days: number = DEFAULT_UNUSED_MEMORY_DAYS,
): Promise<string[]> {
  const usage = await readUsage(projectRoot);
  if (!usage) {
    return [];
  }
  const cutoff = now.getTime() - days * DAY_MS;
  if (Date.parse(usage.trackingSince) > cutoff) {
    return [];
  }
  const docs = await scanAllAutoMemoryTopicDocuments(projectRoot);
  const pinnedPrefix = `${AUTO_MEMORY_PINNED_DIRNAME.toLowerCase()}/`;
  return docs
    .filter((doc) => !doc.relativePath.toLowerCase().startsWith(pinnedPrefix))
    .filter((doc) => doc.mtimeMs < cutoff)
    .filter((doc) => {
      const entry = usage.entries[path.resolve(doc.filePath)];
      return !entry || Date.parse(entry.lastRecalledAt) < cutoff;
    })
    .map((doc) => doc.relativePath)
    .sort()
    .slice(0, MAX_UNUSED_CANDIDATES);
}
