/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  formatMemory,
  memoryFraction,
  readSystemMemory,
} from './use-system-memory.js';

const GIB = 1024 ** 3;

describe('system memory', () => {
  it('formats used and total memory in GB', () => {
    expect(formatMemory({ usedBytes: 6.2 * GIB, totalBytes: 16 * GIB })).toBe(
      '6.2 / 16 GB',
    );
  });

  it('reads a used amount within the total', () => {
    const memory = readSystemMemory();
    expect(memory.totalBytes).toBeGreaterThan(0);
    expect(memory.usedBytes).toBeGreaterThanOrEqual(0);
    expect(memory.usedBytes).toBeLessThanOrEqual(memory.totalBytes);
  });

  it('keeps the fraction between 0 and 1, including an unknown total', () => {
    expect(memoryFraction({ usedBytes: 4 * GIB, totalBytes: 16 * GIB })).toBe(
      0.25,
    );
    expect(memoryFraction({ usedBytes: 0, totalBytes: 0 })).toBe(0);
    expect(memoryFraction({ usedBytes: 20, totalBytes: 10 })).toBe(1);
  });
});
