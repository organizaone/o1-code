/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getInputOverlayKey } from './input-overlay-key.js';

const open = {
  visible: true,
  isLoading: false,
  count: 3,
  scrollOffset: 0,
  expandedIndex: -1,
  activeCategory: 'all',
  tabsVisible: false,
};

describe('getInputOverlayKey', () => {
  it('is empty while nothing shows below the input', () => {
    expect(getInputOverlayKey({ ...open, visible: false })).toBe('');
  });

  it('changes with what shapes the suggestion box height', () => {
    const base = getInputOverlayKey(open);
    expect(base).not.toBe('');
    expect(getInputOverlayKey({ ...open, count: 4 })).not.toBe(base);
    expect(getInputOverlayKey({ ...open, isLoading: true })).not.toBe(base);
    expect(getInputOverlayKey({ ...open, expandedIndex: 0 })).not.toBe(base);
    expect(getInputOverlayKey({ ...open, tabsVisible: true })).not.toBe(base);
  });
});
