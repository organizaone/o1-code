/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { useEffect, useState } from 'react';

export interface SystemMemory {
  usedBytes: number;
  totalBytes: number;
}

const GIB = 1024 ** 3;
export const MEMORY_POLL_MS = 5000;

export function readSystemMemory(): SystemMemory {
  const totalBytes = os.totalmem();
  return { usedBytes: Math.max(0, totalBytes - os.freemem()), totalBytes };
}

export function formatMemory({ usedBytes, totalBytes }: SystemMemory): string {
  return `${(usedBytes / GIB).toFixed(1)} / ${Math.round(totalBytes / GIB)} GB`;
}

export function memoryFraction({
  usedBytes,
  totalBytes,
}: SystemMemory): number {
  if (totalBytes <= 0) return 0;
  return Math.min(1, Math.max(0, usedBytes / totalBytes));
}

export function useSystemMemory(): SystemMemory {
  const [memory, setMemory] = useState(readSystemMemory);
  useEffect(() => {
    const timer = setInterval(
      () => setMemory(readSystemMemory()),
      MEMORY_POLL_MS,
    );
    timer.unref?.();
    return () => clearInterval(timer);
  }, []);
  return memory;
}
