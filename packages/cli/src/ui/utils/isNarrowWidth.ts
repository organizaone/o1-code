/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLayoutTier } from './layout-tier.js';

export function isNarrowWidth(width: number): boolean {
  return getLayoutTier(width) === 'minimal';
}
