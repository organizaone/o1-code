/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { atLeast, getLayoutTier, sideMargin } from './layout-tier.js';
import { isNarrowWidth } from './isNarrowWidth.js';

describe('getLayoutTier', () => {
  it.each([
    [0, 'minimal'],
    [60, 'minimal'],
    [79, 'minimal'],
    [80, 'compact'],
    [99, 'compact'],
    [100, 'medium'],
    [119, 'medium'],
    [120, 'full'],
    [300, 'full'],
  ] as const)('maps %i columns to %s', (columns, tier) => {
    expect(getLayoutTier(columns)).toBe(tier);
  });

  it('treats a non-finite width as minimal', () => {
    expect(getLayoutTier(Number.NaN)).toBe('minimal');
  });
});

describe('atLeast', () => {
  it('orders the tiers from minimal to full', () => {
    expect(atLeast('full', 'medium')).toBe(true);
    expect(atLeast('medium', 'medium')).toBe(true);
    expect(atLeast('compact', 'medium')).toBe(false);
    expect(atLeast('minimal', 'minimal')).toBe(true);
  });
});

describe('isNarrowWidth', () => {
  it('is true exactly for the minimal tier', () => {
    expect(isNarrowWidth(79)).toBe(true);
    expect(isNarrowWidth(80)).toBe(false);
  });
});

describe('sideMargin', () => {
  it('narrows the side margin to one column under 80 columns (spec §8)', () => {
    expect(sideMargin('minimal')).toBe(1);
    expect(sideMargin('compact')).toBe(2);
    expect(sideMargin('full')).toBe(2);
  });
});
