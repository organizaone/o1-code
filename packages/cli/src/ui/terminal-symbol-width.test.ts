/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.resetModules();
});

describe('terminal symbol presentation', () => {
  it('omits selectors on plain Windows symbols that ConPTY advances as extra cells', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.resetModules();
    const { ICON } = await import('./constants.js');
    const { FULL_GLYPHS, COMPAT_GLYPHS } = await import('./glyphs.js');
    for (const set of [FULL_GLYPHS, COMPAT_GLYPHS]) {
      for (const symbol of [
        set.agent,
        set.dot,
        set.hollow,
        set.up,
        set.queued,
      ]) {
        expect(symbol).not.toContain('\uFE0E');
      }
    }
    for (const [name, symbol] of Object.entries(ICON)) {
      if (name !== 'CROSS' && name !== 'SPARKLE') {
        expect(symbol).not.toContain('\uFE0E');
      }
    }
    expect(ICON.CROSS).toBe('✖\uFE0E');
    expect(ICON.SPARKLE).toBe('✳\uFE0E');
  });

  it.each(['darwin', 'linux'])(
    'retains narrow text selectors for CJK terminals on %s',
    async (value) => {
      Object.defineProperty(process, 'platform', { value });
      vi.resetModules();
      const { ICON } = await import('./constants.js');
      const { FULL_GLYPHS, COMPAT_GLYPHS } = await import('./glyphs.js');
      expect(ICON.CIRCLE_FILLED).toBe('●\uFE0E');
      expect(ICON.CROSS).toBe('✖\uFE0E');
      expect(FULL_GLYPHS.agent).toBe('◆\uFE0E');
      expect(COMPAT_GLYPHS.dot).toBe('●\uFE0E');
    },
  );
});
