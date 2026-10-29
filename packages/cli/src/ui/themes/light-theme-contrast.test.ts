/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { toHex } from './color-utils.js';
import { AyuLight } from './ayu-light.js';
import { DefaultLight } from './default-light.js';
import { GitHubLight } from './github-light.js';
import { GoogleCode } from './googlecode.js';
import { XCode } from './xcode.js';

const themes = [AyuLight, DefaultLight, GitHubLight, GoogleCode, XCode];
const syntax = [
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
  'regexp',
  'title',
  'params',
  'comment',
  'quote',
  'meta',
  'tag',
  'variable',
  'attr',
  'attribute',
  'section',
  'bullet',
  'selector-tag',
  'selector-id',
  'selector-class',
  'addition',
  'deletion',
  'operator',
  'property',
];

function luminance(color: string): number {
  const hex = toHex(color);
  if (!hex) throw new Error(`Cannot measure color: ${color}`);
  const values = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe.each(themes)('$name contrast', (theme) => {
  it('keeps text roles readable on the theme background', () => {
    const colors = {
      ...theme.semanticColors.text,
      ...theme.semanticColors.status,
      ...theme.extendedColors.text,
      ...theme.extendedColors.activity,
    };
    const failures = Object.entries(colors)
      .filter(
        ([, color]) => color && contrast(color, theme.colors.Background) < 4.5,
      )
      .map(([role, color]) => `${role}: ${color}`);
    expect(failures).toEqual([]);
  });

  it('keeps diff gutters and highlighted code readable on both diff backgrounds', () => {
    const colors = {
      gutter: theme.semanticColors.text.secondary,
      success: theme.semanticColors.status.success,
      error: theme.semanticColors.status.error,
      default: theme.defaultColor,
      ...Object.fromEntries(
        syntax.map((name) => [name, theme.getInkColor(`hljs-${name}`)]),
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
