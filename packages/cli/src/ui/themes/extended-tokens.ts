/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ColorsTheme } from './theme.js';

/**
 * Colour roles of the o1-code design that SemanticColors does not have.
 * Themes that do not declare them get values derived from their legacy palette.
 */
export interface ExtendedColors {
  text: {
    muted: string;
    placeholder: string;
  };
  ui: {
    separator: string;
    rule: string;
    brand: string;
    brandSoft: string;
  };
  activity: {
    info: string;
    read: string;
    write: string;
    execute: string;
    success: string;
  };
}

export function deriveExtendedColors(colors: ColorsTheme): ExtendedColors {
  return {
    text: { muted: colors.Comment, placeholder: colors.Comment },
    ui: {
      separator: colors.Gray,
      rule: colors.Gray,
      brand: colors.AccentBlue,
      brandSoft: colors.LightBlue,
    },
    activity: {
      info: colors.AccentBlue,
      read: colors.AccentCyan,
      write: colors.AccentPurple,
      execute: colors.AccentYellow,
      success: colors.AccentGreen,
    },
  };
}
