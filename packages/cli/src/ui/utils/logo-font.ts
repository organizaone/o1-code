/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The o1-code logo: a 4-pixel font drawn with half blocks, two pixel rows per
 * terminal row. `#` is a lit pixel.
 */
export const LOGO_WORD = 'O1-CODE.';

export const LOGO_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  O: ['###', '#.#', '#.#', '###'],
  '1': ['##.', '.#.', '.#.', '###'],
  '-': ['...', '...', '###', '...'],
  C: ['###', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '##.'],
  E: ['###', '##.', '#..', '###'],
  '.': ['.', '.', '.', '#'],
};

export interface LogoRun {
  text: string;
  brand: boolean;
}

// "O1" and the final dot carry the brand colour.
export const isLogoBrand = (index: number, ch: string): boolean =>
  index < 2 || ch === '.';

function append(runs: LogoRun[], run: LogoRun): void {
  const last = runs[runs.length - 1];
  if (last && last.brand === run.brand) last.text += run.text;
  else runs.push({ ...run });
}

export function renderLogoRows(word: string = LOGO_WORD): LogoRun[][] {
  const letters = [...word];
  const rows: LogoRun[][] = [[], []];
  for (let row = 0; row < 2; row++) {
    letters.forEach((ch, index) => {
      const glyph = LOGO_GLYPHS[ch];
      if (!glyph) throw new Error(`No logo glyph for "${ch}"`);
      const top = glyph[row * 2]!;
      const bottom = glyph[row * 2 + 1]!;
      let text = '';
      for (let col = 0; col < top.length; col++) {
        const upper = top[col] === '#';
        const lower = bottom[col] === '#';
        text += upper && lower ? '█' : upper ? '▀' : lower ? '▄' : ' ';
      }
      if (index < letters.length - 1) text += ' ';
      append(rows[row]!, { text, brand: isLogoBrand(index, ch) });
    });
  }
  return rows;
}
