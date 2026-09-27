/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  LOGO_ANIMATION_NAMES,
  LOGO_ANIMATIONS,
  LOGO_GRID_WIDTH,
  paintLogoFrame,
  pickLogoAnimation,
  restFrame,
  type LogoFrameRun,
  type LogoGrid,
} from './logo-animation.js';
import { renderLogoRows } from './logo-font.js';

const STATIC_WIDTH = renderLogoRows()
  .map((runs) => runs.map((run) => run.text).join('').length)
  .reduce((a, b) => Math.max(a, b), 0);

const text = (runs: LogoFrameRun[]) => runs.map((run) => run.text).join('');

/** One `{ char, color }` per column; the colour of a space is irrelevant. */
const cells = (runs: LogoFrameRun[]) =>
  runs.flatMap((run) =>
    [...run.text].map((char) => ({
      char,
      color: char === ' ' ? undefined : run.color,
      background: char === ' ' ? undefined : run.background,
    })),
  );

const staticCells = (row: number) =>
  renderLogoRows()[row]!.flatMap((run) =>
    [...run.text].map((char) => ({
      char,
      color: char === ' ' ? undefined : run.brand ? 'brand' : 'primary',
      background: undefined,
    })),
  );

const pixel = (grid: LogoGrid, x: number, y: number) => grid[y]![x];

describe('LOGO_ANIMATIONS', () => {
  it('has the eight variants, in order', () => {
    expect(LOGO_ANIMATION_NAMES).toEqual([
      'come',
      'pulo',
      'digita',
      'tetris',
      'compila',
      'chuva',
      'bola',
      'onda',
    ]);
    expect(Object.keys(LOGO_ANIMATIONS)).toEqual([...LOGO_ANIMATION_NAMES]);
  });

  it('keeps the mock timings', () => {
    expect(
      Object.fromEntries(
        LOGO_ANIMATION_NAMES.map((name) => [
          name,
          LOGO_ANIMATIONS[name].length,
        ]),
      ),
    ).toEqual({
      come: 44,
      pulo: 40,
      digita: 48,
      tetris: 40,
      compila: 40,
      chuva: 44,
      bola: 60,
      onda: 28,
    });
  });

  for (const name of LOGO_ANIMATION_NAMES) {
    it(`${name}: every frame paints three rows of half blocks within the logo width plus one`, () => {
      const { length, frame } = LOGO_ANIMATIONS[name];
      expect(length).toBeGreaterThan(0);
      for (let t = 0; t < length; t++) {
        const rows = paintLogoFrame(frame(t));
        expect(rows).toHaveLength(3);
        for (const row of rows) {
          expect(text(row)).toMatch(/^[▀▄█ ]*$/);
          expect(text(row).length).toBeLessThanOrEqual(STATIC_WIDTH + 1);
        }
      }
    });
  }
});

describe('restFrame', () => {
  it('equals the static logo in text and colours, under a blank row', () => {
    const [blank, top, bottom] = paintLogoFrame(restFrame());
    expect(text(blank!).trim()).toBe('');
    expect(text(top!)).toBe(
      renderLogoRows()[0]!
        .map((r) => r.text)
        .join('')
        .padEnd(LOGO_GRID_WIDTH),
    );
    expect(cells(top!).slice(0, STATIC_WIDTH)).toEqual(staticCells(0));
    expect(cells(bottom!).slice(0, STATIC_WIDTH)).toEqual(staticCells(1));
  });

  it('is what every variant settles on when played past its end', () => {
    for (const name of LOGO_ANIMATION_NAMES) {
      const { length, frame } = LOGO_ANIMATIONS[name];
      expect(paintLogoFrame(frame(length))).toEqual(
        paintLogoFrame(restFrame()),
      );
    }
  });
});

describe('paintLogoFrame', () => {
  it('uses ▀ with the bottom colour as background when the two pixels differ', () => {
    const grid = restFrame().map((row) => row.map(() => null)) as LogoGrid;
    grid[0]![0] = 'warning';
    grid[1]![0] = 'brand';
    const [row] = paintLogoFrame(grid);
    expect(row![0]).toEqual({
      text: '▀',
      color: 'warning',
      background: 'brand',
    });
  });

  it('never paints a background under a space', () => {
    const grid = restFrame().map((row) => row.map(() => null)) as LogoGrid;
    grid[0]![0] = 'warning';
    grid[1]![0] = 'brand';
    const [row] = paintLogoFrame(grid);
    expect(row![1]!.text.startsWith(' ')).toBe(true);
    expect(row![1]!.background).toBeUndefined();
  });
});

describe('variant details', () => {
  it('come: the C is amber mid-pass', () => {
    const grid = LOGO_ANIMATIONS.come.frame(4);
    const colors = grid.flat().filter((c) => c !== null);
    expect(colors).toContain('warning');
    // The C moved 4 columns right of its place (x = 12).
    expect(pixel(grid, 16, 2)).toBe('warning');
  });

  it('come: the C stays in view at the far end until the blink', () => {
    // Once the dot is eaten the C parks on the last columns of the logo
    // instead of walking off the grid.
    for (const t of [16, 24, 35]) {
      const grid = LOGO_ANIMATIONS.come.frame(t);
      expect(pixel(grid, 26, 2)).toBe('warning');
      expect(pixel(grid, 28, 2)).toBe('warning');
      expect(pixel(grid, 28, 5)).toBe('warning');
    }
  });

  it('come: the logo blinks back at the end', () => {
    expect(
      LOGO_ANIMATIONS.come
        .frame(38)
        .flat()
        .every((c) => c === null),
    ).toBe(true);
    expect(LOGO_ANIMATIONS.come.frame(40)).toEqual(restFrame());
  });

  it('pulo: O1 rises two pixel rows at the top of the hop', () => {
    const grid = LOGO_ANIMATIONS.pulo.frame(3);
    expect(pixel(grid, 0, 0)).toBe('brand');
    expect(pixel(grid, 0, 3)).toBe('brand');
    expect(pixel(grid, 0, 4)).toBeNull();
  });

  it('pulo: CODE squashes to three pixel rows on landing', () => {
    const grid = LOGO_ANIMATIONS.pulo.frame(7);
    // C spans x = 12..14: its top row is dropped by one pixel row.
    expect(pixel(grid, 12, 2)).toBeNull();
    expect(pixel(grid, 12, 3)).toBe('primary');
    expect(pixel(grid, 12, 5)).toBe('primary');
  });

  it('bola: the dot flies above the letters mid-pass', () => {
    const grid = LOGO_ANIMATIONS.bola.frame(10);
    const above = [0, 1].flatMap((y) =>
      grid[y]!.map((c, x) => ({ c, x })).filter(({ c }) => c === 'brand'),
    );
    expect(above).toHaveLength(1);
    expect(above[0]!.x).toBe(18);
    expect(pixel(grid, 28, 5)).toBeNull();
  });

  it('digita and compila keep row 0 blank', () => {
    for (const name of ['digita', 'compila'] as const) {
      const { length, frame } = LOGO_ANIMATIONS[name];
      for (let t = 0; t < length; t++) {
        const [blank] = paintLogoFrame(frame(t));
        expect(text(blank!).trim()).toBe('');
      }
    }
  });

  it('digita: the cursor blinks after the dot once the word is typed', () => {
    expect(pixel(LOGO_ANIMATIONS.digita.frame(24), 29, 2)).toBe('brand');
    expect(pixel(LOGO_ANIMATIONS.digita.frame(26), 29, 2)).toBeNull();
    expect(pixel(LOGO_ANIMATIONS.digita.frame(0), 0, 2)).toBe('brand');
  });

  it('tetris: the completed row flashes bright once', () => {
    const grid = LOGO_ANIMATIONS.tetris.frame(32);
    expect(pixel(grid, 0, 2)).toBe('bright');
    expect(LOGO_ANIMATIONS.tetris.frame(34)).toEqual(restFrame());
  });

  it('compila is deterministic and starts as noise', () => {
    expect(LOGO_ANIMATIONS.compila.frame(3)).toEqual(
      LOGO_ANIMATIONS.compila.frame(3),
    );
    expect(LOGO_ANIMATIONS.compila.frame(0).flat()).toContain('muted');
    expect(LOGO_ANIMATIONS.compila.frame(20)).toEqual(restFrame());
  });

  it('chuva: teal drops fall and leave the logo lit', () => {
    const colors = LOGO_ANIMATIONS.chuva.frame(6).flat();
    expect(colors).toContain('code');
    expect(LOGO_ANIMATIONS.chuva.frame(0).flat()).toContain('code');
  });

  it('onda: the first letter lifts one pixel row first', () => {
    const grid = LOGO_ANIMATIONS.onda.frame(0);
    expect(pixel(grid, 0, 1)).toBe('brand');
    expect(pixel(grid, 4, 1)).toBeNull();
  });
});

describe('pickLogoAnimation', () => {
  it('returns nothing for off', () => {
    expect(pickLogoAnimation('off')).toBeUndefined();
  });

  it('returns the named variant', () => {
    expect(pickLogoAnimation('tetris', () => 0)).toBe('tetris');
  });

  it('draws one at random', () => {
    expect(pickLogoAnimation('random', () => 0)).toBe('come');
    expect(pickLogoAnimation('random', () => 0.99)).toBe('onda');
    expect(pickLogoAnimation(undefined, () => 0.99)).toBe('onda');
  });

  it('falls back to random for an unknown name', () => {
    expect(pickLogoAnimation('dance', () => 0.3)).toBe(LOGO_ANIMATION_NAMES[2]);
  });
});
