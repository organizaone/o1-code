/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { getLayoutTier, type LayoutTier } from '../utils/layout-tier.js';
import { useTerminalSize } from './useTerminalSize.js';

export function useLayoutTier(): LayoutTier {
  return getLayoutTier(useTerminalSize().columns);
}
