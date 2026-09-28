/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { detectTerminal } from '../../utils/osc.js';

export type LogoStyle = 'blocks' | 'wordmark';

/**
 * The pixel logo is drawn with block elements (`█ ▀ ▄`). Terminal.app draws
 * them from the font, which does not fill the cell, so every pixel shows a
 * seam; the terminals that draw block elements themselves (iTerm2, Ghostty,
 * kitty, Windows Terminal) render it solid. Terminal.app gets the one-line
 * wordmark instead.
 */
export function resolveLogoStyle(): LogoStyle {
  return detectTerminal() === 'Apple_Terminal' ? 'wordmark' : 'blocks';
}
