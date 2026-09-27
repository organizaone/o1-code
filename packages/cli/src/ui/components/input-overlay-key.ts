/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface InputOverlayShape {
  visible: boolean;
  isLoading: boolean;
  count: number;
  scrollOffset: number;
  expandedIndex: number;
  activeCategory: string;
  tabsVisible: boolean;
}

/**
 * A key that changes whenever the suggestion box below the input changes
 * height. The box opens and resizes after the keystroke that caused it,
 * outside the layout's own re-measure triggers, so the layout keys on this.
 */
export function getInputOverlayKey(shape: InputOverlayShape): string {
  if (!shape.visible) return '';
  return [
    shape.isLoading ? 'loading' : 'list',
    shape.count,
    shape.scrollOffset,
    shape.expandedIndex,
    shape.activeCategory,
    shape.tabsVisible ? 'tabs' : 'no-tabs',
  ].join(':');
}
