/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { O1CodeDark } from './o1-code-dark.js';
import { O1CodeLight } from './o1-code-light.js';

// WCAG relative luminance and contrast ratio.
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('O1-Code Dark', () => {
  it('uses the spec palette', () => {
    // Plain text keeps the terminal's own foreground, so it stays readable
    // when background detection fails and this theme lands on a light terminal.
    expect(O1CodeDark.semanticColors.text).toEqual({
      primary: '',
      secondary: '#95a5be',
      link: '#6e9bff',
      accent: '#a48bff',
      code: '#3fc7d6',
    });
    expect(O1CodeDark.semanticColors.border).toEqual({
      default: '#2a3550',
      focused: '#6e9bff',
    });
    expect(O1CodeDark.semanticColors.status).toMatchObject({
      error: '#ff6b6b',
      success: '#3fd07f',
      warning: '#ffa347',
    });
    expect(O1CodeDark.extendedColors).toEqual({
      text: { muted: '#8593aa', placeholder: '#7a879e' },
      ui: {
        separator: '#3a4258',
        rule: '#2a3550',
        brand: '#6e9bff',
        brandSoft: '#8fb2ff',
      },
      activity: {
        info: '#6e9bff',
        read: '#3fc7d6',
        write: '#a48bff',
        execute: '#ffa347',
        success: '#3fd07f',
      },
    });
  });
});

describe('O1-Code Light', () => {
  it('uses the spec palette', () => {
    expect(O1CodeLight.semanticColors.text).toEqual({
      primary: '#162033',
      secondary: '#46546d',
      link: '#2b5bd7',
      accent: '#6547c9',
      code: '#0a6d78',
    });
    expect(O1CodeLight.extendedColors.activity).toEqual({
      info: '#2b5bd7',
      read: '#0a6d78',
      write: '#6547c9',
      execute: '#9a5200',
      success: '#157a44',
    });
  });

  it('keeps every text colour at 4.5:1 or more on #f7f9fc', () => {
    const texts = [
      ...Object.values(O1CodeLight.semanticColors.text),
      O1CodeLight.extendedColors.text.muted,
      O1CodeLight.extendedColors.text.placeholder,
      ...Object.values(O1CodeLight.extendedColors.activity),
      O1CodeLight.semanticColors.status.error,
      O1CodeLight.semanticColors.status.errorDim,
      O1CodeLight.semanticColors.status.warningDim,
    ];
    expect(texts.filter((color) => contrast(color, '#f7f9fc') < 4.5)).toEqual(
      [],
    );
  });
});
