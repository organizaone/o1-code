/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { toHex } from './color-utils.js';
import { AtomOneDark } from './atom-one-dark.js';
import { AyuDark } from './ayu.js';
import { DefaultDark } from './default.js';
import { Dracula } from './dracula.js';
import { GitHubDark } from './github-dark.js';
import { ShadesOfPurple } from './shades-of-purple.js';
import { ANSI } from './ansi.js';

it('keeps ANSI muted text legible with the standard terminal palette', () => {
  expect(ANSI.extendedColors.text.muted).toBe('white');
  expect(ANSI.extendedColors.text.placeholder).toBe('white');
});

const themes = [
  AtomOneDark,
  AyuDark,
  DefaultDark,
  Dracula,
  GitHubDark,
  ShadesOfPurple,
];

function luminance(color: string): number {
  const hex = toHex(color);
  if (!hex) throw new Error(`Cannot measure color: ${color}`);
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const [high, low] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (high! + 0.05) / (low! + 0.05);
}

const syntaxClasses = [
  'keyword',
  'literal',
  'symbol',
  'name',
  'link',
  'built_in',
  'type',
  'number',
  'class',
  'string',
  'meta-string',
  'regexp',
  'template-tag',
  'subst',
  'function',
  'title',
  'params',
  'formula',
  'comment',
  'quote',
  'doctag',
  'meta',
  'meta-keyword',
  'tag',
  'variable',
  'template-variable',
  'attr',
  'attribute',
  'builtin-name',
  'section',
  'bullet',
  'selector-tag',
  'selector-id',
  'selector-class',
  'selector-attr',
  'selector-pseudo',
  'addition',
  'deletion',
  'operator',
  'property',
];

describe.each(themes)('$name contrast', (theme) => {
  it('keeps text roles readable on the theme background', () => {
    const colors = {
      ...theme.semanticColors.text,
      ...theme.semanticColors.status,
      ...theme.extendedColors.text,
      ...theme.extendedColors.activity,
    };
    // Empty primary means the terminal supplies the foreground.
    const failures = Object.entries(colors)
      .filter(
        ([, color]) => color && contrast(color, theme.colors.Background) < 4.5,
      )
      .map(([role, color]) => `${role}: ${color}`);
    expect(failures).toEqual([]);
  });

  it('keeps the diff gutter and syntax readable on both diff backgrounds', () => {
    const colors = {
      gutter: theme.semanticColors.text.secondary,
      success: theme.semanticColors.status.success,
      error: theme.semanticColors.status.error,
      default: theme.defaultColor,
      ...Object.fromEntries(
        syntaxClasses.map((name) => [name, theme.getInkColor(`hljs-${name}`)]),
      ),
    };
    const failures = [theme.colors.DiffAdded, theme.colors.DiffRemoved].flatMap(
      (background) =>
        Object.entries(colors)
          .filter(([, color]) => color && contrast(color, background) < 4.5)
          .map(([role, color]) => `${role}: ${color} on ${background}`),
    );
    expect(failures).toEqual([]);
  });
});
