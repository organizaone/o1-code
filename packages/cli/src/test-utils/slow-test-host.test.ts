/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isSlowTestHost } from './slow-test-host.js';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    loadavg: vi.fn(() => [0, 0, 0]),
    availableParallelism: vi.fn(() => 64),
  };
});

describe('isSlowTestHost', () => {
  beforeEach(() => {
    vi.mocked(os.loadavg).mockReturnValue([0, 0, 0]);
    vi.mocked(os.availableParallelism).mockReturnValue(64);
  });

  it('treats a saturated host as slow', () => {
    vi.mocked(os.loadavg).mockReturnValue([96, 0, 0]);
    expect(isSlowTestHost()).toBe(true);
  });

  it('keeps an unsaturated host fast', () => {
    vi.mocked(os.loadavg).mockReturnValue([2, 0, 0]);
    expect(isSlowTestHost()).toBe(false);
  });
});
