/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Symbols that tool output commonly prints (node:test, vitest, npm, git) and
// that have both a text and an emoji presentation in Unicode's
// emoji-variation-sequences: ℹ ▶ ☑ ⚠ ✔ ✖. Windows Terminal draws them in the
// two-cell emoji form while advancing the cursor one cell, so the character
// after them is painted over. VS15 (U+FE0E) asks for the one-cell text form.
// VS15 adds no width in string-width, so Ink's layout is unchanged.
// Symbols without a text-presentation sequence (✅ ❌) and plain text symbols
// (✓ ❯ ➜) are deliberately absent: a selector would not change them.
const EMOJI_VARIANT_SYMBOLS = /([ℹ▶☑⚠✔✖])(?![︎️])/g;

const TEXT_PRESENTATION_SELECTOR = '︎';

/**
 * On Windows, appends the text-presentation selector after each symbol that
 * would otherwise be drawn as a two-cell emoji. A symbol already followed by
 * a variation selector keeps the presentation it asked for.
 */
export function forceTextPresentation(
  text: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return text;
  return text.replace(EMOJI_VARIANT_SYMBOLS, `$1${TEXT_PRESENTATION_SELECTOR}`);
}
