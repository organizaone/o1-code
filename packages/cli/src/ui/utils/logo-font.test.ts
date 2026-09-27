/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderLogoRows } from './logo-font.js';

const text = (runs: ReturnType<typeof renderLogoRows>[number]) =>
  runs.map((run) => run.text).join('');

describe('renderLogoRows', () => {
  it('draws O1-CODE. in two rows of half blocks, 29 columns wide', () => {
    const rows = renderLogoRows();
    expect(rows.map(text)).toEqual([
      '█▀█ ▀█      █▀▀ █▀█ █▀▄ ██▀  ',
      '█▄█ ▄█▄ ▀▀▀ █▄▄ █▄█ █▄▀ █▄▄ ▄',
    ]);
  });

  it('marks O1 and the final dot as brand, the rest as plain', () => {
    const [, bottom] = renderLogoRows();
    expect(bottom).toEqual([
      { text: '█▄█ ▄█▄ ', brand: true },
      { text: '▀▀▀ █▄▄ █▄█ █▄▀ █▄▄ ', brand: false },
      { text: '▄', brand: true },
    ]);
  });

  it('refuses a character the font does not have', () => {
    expect(() => renderLogoRows('O1-X')).toThrow('No logo glyph for "X"');
  });
});
