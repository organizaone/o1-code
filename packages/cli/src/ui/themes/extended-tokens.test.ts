/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { deriveExtendedColors } from './extended-tokens.js';
import { darkTheme } from './theme.js';
import { themeManager } from './theme-manager.js';
import { NoColorTheme } from './no-color.js';
import { extendedTheme } from '../semantic-colors.js';

const leaves = (value: unknown): unknown[] =>
  typeof value === 'object' && value !== null
    ? Object.values(value).flatMap(leaves)
    : [value];

describe('deriveExtendedColors', () => {
  it('derives every role from the legacy palette', () => {
    expect(deriveExtendedColors(darkTheme)).toEqual({
      text: { muted: darkTheme.Comment, placeholder: darkTheme.Comment },
      ui: {
        separator: darkTheme.Gray,
        rule: darkTheme.Gray,
        brand: darkTheme.AccentBlue,
        brandSoft: darkTheme.LightBlue,
      },
      activity: {
        info: darkTheme.AccentBlue,
        read: darkTheme.AccentCyan,
        write: darkTheme.AccentPurple,
        execute: darkTheme.AccentYellow,
        success: darkTheme.AccentGreen,
      },
    });
  });
});

describe('Theme.extendedColors', () => {
  it('is a full set of strings for every built-in theme', () => {
    const incomplete = themeManager
      .getAvailableThemes()
      .map((display) => themeManager.findThemeByName(display.name))
      .filter(
        (theme) =>
          !theme ||
          leaves(theme.extendedColors).some(
            (value) => typeof value !== 'string',
          ),
      );
    expect(incomplete).toEqual([]);
  });

  it('stays colourless in the no-colour theme', () => {
    expect(
      leaves(NoColorTheme.extendedColors).filter((value) => value !== ''),
    ).toEqual([]);
  });
});

describe('extendedTheme', () => {
  const initial = themeManager.getActiveTheme().name;
  afterEach(() => {
    themeManager.setActiveTheme(initial);
  });

  it('follows the active theme', () => {
    expect(extendedTheme.ui).toEqual(
      themeManager.getActiveTheme().extendedColors.ui,
    );
  });
});
