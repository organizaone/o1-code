/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { getWorkingTreeLineStats } from '@organizaone/o1-code-core/utils/gitDiff.js';

export const WORKING_TREE_POLL_MS = 5000;

export interface WorkingTreeDiff {
  linesAdded: number;
  linesRemoved: number;
}

interface CacheEntry {
  value: WorkingTreeDiff | null;
  inFlight?: Promise<WorkingTreeDiff | null>;
}

// Shared per folder: the footer remounts whenever suggestions, shortcuts or
// an approval replace it, and each remount must neither start blank nor spawn
// another git process while one is still running.
const cache = new Map<string, CacheEntry>();

function readShared(cwd: string): Promise<WorkingTreeDiff | null> {
  let entry = cache.get(cwd);
  if (!entry) {
    entry = { value: null };
    cache.set(cwd, entry);
  }
  if (entry.inFlight) return entry.inFlight;
  const current = entry;
  current.inFlight = getWorkingTreeLineStats(cwd)
    .then((value) => {
      current.value = value;
      return value;
    })
    .finally(() => {
      current.inFlight = undefined;
    });
  return current.inFlight;
}

/** Test hook: forget every folder's last value. */
export function resetWorkingTreeDiffCache(): void {
  cache.clear();
}

const sameDiff = (a: WorkingTreeDiff | null, b: WorkingTreeDiff | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.linesAdded === b.linesAdded &&
    a.linesRemoved === b.linesRemoved);

/** The working tree's line diff against HEAD, re-read every 5 seconds. */
export function useWorkingTreeDiff(cwd: string): WorkingTreeDiff | null {
  const [diff, setDiff] = useState<WorkingTreeDiff | null>(
    () => cache.get(cwd)?.value ?? null,
  );
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const next = await readShared(cwd);
      if (!cancelled) setDiff((prev) => (sameDiff(prev, next) ? prev : next));
    };
    void read();
    const timer = setInterval(() => void read(), WORKING_TREE_POLL_MS);
    timer.unref?.();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cwd]);
  return diff;
}
