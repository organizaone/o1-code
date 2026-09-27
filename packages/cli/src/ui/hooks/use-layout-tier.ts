/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLayoutTier, type LayoutTier } from '../utils/layout-tier.js';
import { useTerminalSize } from './useTerminalSize.js';

export function useLayoutTier(): LayoutTier {
  return getLayoutTier(useTerminalSize().columns);
}
