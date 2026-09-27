/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Width bands of the TUI layout. Each band drops items from the one above;
 * which items is decided by each component.
 */
export type LayoutTier = 'minimal' | 'compact' | 'medium' | 'full';

const ORDER: Record<LayoutTier, number> = {
  minimal: 0,
  compact: 1,
  medium: 2,
  full: 3,
};

export function getLayoutTier(columns: number): LayoutTier {
  if (columns >= 120) return 'full';
  if (columns >= 100) return 'medium';
  if (columns >= 80) return 'compact';
  return 'minimal';
}

export function atLeast(tier: LayoutTier, min: LayoutTier): boolean {
  return ORDER[tier] >= ORDER[min];
}

/** Columns between the terminal edge and the text chrome (spec §8). */
export function sideMargin(tier: LayoutTier): number {
  return tier === 'minimal' ? 1 : 2;
}
