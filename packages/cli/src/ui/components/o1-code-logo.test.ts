/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shortAsciiLogo } from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';

// The Header tests look for `██╔═══██╗`, which other block-letter logos also
// contain, so they cannot tell them apart. These pin this logo.
describe('o1-code logo', () => {
  const lines = shortAsciiLogo.split('\n').filter((line) => line.length > 0);

  it('spells O1-CODE', () => {
    // A block-letter "Q" has this tail; no letter of O1-CODE does.
    expect(shortAsciiLogo).not.toContain('██║▄▄ ██║');
    // The hyphen between "1" and "C".
    expect(lines[2]).toContain('█████╗██║');
  });

  it('is 52 columns wide with every line padded to the same width', () => {
    expect(getAsciiArtWidth(shortAsciiLogo)).toBe(52);
    expect(new Set(lines.map((line) => [...line].length))).toEqual(
      new Set([52]),
    );
  });
});
