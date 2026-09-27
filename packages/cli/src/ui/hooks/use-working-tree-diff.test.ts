/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const reads = vi.hoisted(() => ({ count: 0 }));

vi.mock('@organizaone/o1-code-core/utils/gitDiff.js', () => ({
  getWorkingTreeLineStats: vi.fn(async () => {
    reads.count++;
    return { linesAdded: 3, linesRemoved: 1 };
  }),
}));

import {
  resetWorkingTreeDiffCache,
  useWorkingTreeDiff,
} from './use-working-tree-diff.js';

describe('useWorkingTreeDiff', () => {
  afterEach(() => {
    reads.count = 0;
    resetWorkingTreeDiffCache();
  });

  it('shares one read among the footers mounted for the same folder', async () => {
    const first = renderHook(() => useWorkingTreeDiff('/repo'));
    const second = renderHook(() => useWorkingTreeDiff('/repo'));
    await act(async () => {});
    expect(reads.count).toBe(1);
    expect(first.result.current).toEqual({ linesAdded: 3, linesRemoved: 1 });
    expect(second.result.current).toEqual({ linesAdded: 3, linesRemoved: 1 });
  });

  it('starts a remounted footer from the last value instead of blank', async () => {
    const first = renderHook(() => useWorkingTreeDiff('/repo'));
    await act(async () => {});
    first.unmount();
    const again = renderHook(() => useWorkingTreeDiff('/repo'));
    expect(again.result.current).toEqual({ linesAdded: 3, linesRemoved: 1 });
  });
});
