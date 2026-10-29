/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { themeManager } from '../themes/theme-manager.js';

// Representative terminal backgrounds for views that do not paint a canvas.
// Only the light/dark bucket matters, so black/white are safe stand-ins.
const DARK_TERMINAL_BACKGROUND = '#000000';
const LIGHT_TERMINAL_BACKGROUND = '#ffffff';

/**
 * A brightness-representative stand-in for the terminal's own background,
 * derived from its detected dark/light type.
 *
 * Full-screen inputs pass their painted canvas explicitly; legacy and
 * screen-reader layouts use this terminal-derived fallback.
 */
export function getEffectiveTerminalBackground(): string {
  return themeManager.getTerminalBackgroundType() === 'light'
    ? LIGHT_TERMINAL_BACKGROUND
    : DARK_TERMINAL_BACKGROUND;
}
