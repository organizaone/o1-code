/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import {
  COMPAT_GLYPHS,
  FULL_GLYPHS,
  glyphs,
  resolveGlyphMode,
  setGlyphMode,
  type GlyphSet,
} from './glyphs.js';

const singles = (set: GlyphSet): string[] => [
  set.prompt,
  set.barFull,
  set.barEmpty,
  set.queued,
  set.agent,
  set.failed,
  set.done,
  set.dot,
  set.hollow,
  set.up,
  ...set.spinnerFrames,
];

describe('resolveGlyphMode', () => {
  it('honours an explicit setting on any platform', () => {
    expect(resolveGlyphMode('compat', {}, 'linux')).toBe('compat');
    expect(resolveGlyphMode('full', {}, 'win32')).toBe('full');
  });

  it('picks compat for the Windows console host', () => {
    expect(resolveGlyphMode('auto', {}, 'win32')).toBe('compat');
    expect(resolveGlyphMode(undefined, {}, 'win32')).toBe('compat');
  });

  it('keeps full glyphs in Windows Terminal and in the VS Code terminal', () => {
    expect(resolveGlyphMode('auto', { WT_SESSION: 'x' }, 'win32')).toBe('full');
    expect(resolveGlyphMode('auto', { TERM_PROGRAM: 'vscode' }, 'win32')).toBe(
      'full',
    );
  });

  it('keeps full glyphs off Windows even without TERM_PROGRAM', () => {
    expect(resolveGlyphMode('auto', {}, 'linux')).toBe('full');
    expect(resolveGlyphMode('auto', {}, 'darwin')).toBe('full');
  });

  it('treats an unknown setting as auto', () => {
    expect(resolveGlyphMode('ascii', {}, 'win32')).toBe('compat');
    expect(resolveGlyphMode('ascii', {}, 'linux')).toBe('full');
  });
});

describe('glyph sets', () => {
  it('draws every single glyph one column wide', () => {
    const all = [...singles(FULL_GLYPHS), ...singles(COMPAT_GLYPHS)];
    expect(all.filter((glyph) => stringWidth(glyph) !== 1)).toEqual([]);
  });

  it('keeps the branch prefix and its space together', () => {
    expect(stringWidth(FULL_GLYPHS.branchPrefix)).toBe(2);
    expect(COMPAT_GLYPHS.branchPrefix).toBe('');
  });

  it('uses only characters every Windows console font has in compat mode', () => {
    // ASCII, plus the WGL4 characters the compat set keeps. VS15 is a
    // presentation hint with no glyph of its own, so it is stripped first.
    const allowed = /^[\x20-\x7e█░▌●○·│↑→√…]*$/u;
    const compat = [...singles(COMPAT_GLYPHS), COMPAT_GLYPHS.branchPrefix];
    expect(
      compat.filter((glyph) => !allowed.test(glyph.replaceAll('︎', ''))),
    ).toEqual([]);
    expect(COMPAT_GLYPHS.borderStyle).toBe('single');
    expect(FULL_GLYPHS.borderStyle).toBe('round');
  });
});

describe('active glyph set', () => {
  afterEach(() => setGlyphMode('full'));

  it('starts full and follows setGlyphMode', () => {
    expect(glyphs()).toBe(FULL_GLYPHS);
    setGlyphMode('compat');
    expect(glyphs()).toBe(COMPAT_GLYPHS);
  });
});
