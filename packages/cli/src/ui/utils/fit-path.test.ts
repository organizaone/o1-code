/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { fitPath } from './fit-path.js';
import { getCachedStringWidth } from './textUtils.js';

const width = ({ parent, name }: { parent: string; name: string }) =>
  getCachedStringWidth(parent + name);

describe('fitPath', () => {
  it('keeps a path that fits', () => {
    expect(fitPath('W:\\workspace\\pessoal\\o1-code', 40)).toEqual({
      parent: 'W:\\workspace\\pessoal\\',
      name: 'o1-code',
    });
    expect(fitPath('~/src/o1-code', 40)).toEqual({
      parent: '~/src/',
      name: 'o1-code',
    });
  });

  it('cuts the parent from the start and keeps the folder whole', () => {
    const fitted = fitPath('W:\\workspace\\pessoal\\o1-code', 20);
    expect(fitted.name).toBe('o1-code');
    expect(fitted.parent.startsWith('…')).toBe(true);
    expect(fitted.parent.endsWith('\\pessoal\\')).toBe(true);
    expect(width(fitted)).toBeLessThanOrEqual(20);
  });

  it('measures wide characters by their columns', () => {
    const fitted = fitPath('/home/用户/项目/代码库', 12);
    expect(fitted.name).toBe('代码库');
    expect(width(fitted)).toBeLessThanOrEqual(12);
  });

  it('shows only the folder when nothing else fits', () => {
    expect(fitPath('/very/long/parent/o1-code', 7)).toEqual({
      parent: '',
      name: 'o1-code',
    });
  });

  it('handles a trailing separator and a bare root', () => {
    expect(fitPath('/srv/app/', 40)).toEqual({ parent: '/srv/', name: 'app' });
    expect(fitPath('/', 40)).toEqual({ parent: '', name: '/' });
  });
});
