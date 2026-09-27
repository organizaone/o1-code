/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The start-screen logo animations, as pure frame generators. A frame is a
 * pixel grid of 6 rows: rows 0-1 are the blank terminal row above the pinned
 * header, rows 2-5 the two logo rows. Each cell is empty or a colour token
 * that the component resolves against the theme.
 */

import { LOGO_GLYPHS, LOGO_WORD, isLogoBrand } from './logo-font.js';

export type LogoColor =
  | 'brand'
  | 'primary'
  | 'warning'
  | 'code'
  | 'muted'
  | 'bright';

export type LogoGrid = Array<Array<LogoColor | null>>;

export interface LogoFrameRun {
  text: string;
  color: LogoColor;
  background?: LogoColor;
}

export const LOGO_ANIMATION_NAMES = [
  'come',
  'pulo',
  'digita',
  'tetris',
  'compila',
  'chuva',
  'bola',
  'onda',
] as const;

export type LogoAnimationName = (typeof LOGO_ANIMATION_NAMES)[number];

export interface LogoAnimation {
  /** Frames in one pass; `frame(t)` for `t >= length` is the rest frame. */
  length: number;
  frame(t: number): LogoGrid;
}

/** Milliseconds per frame: 8 frames per second. */
export const LOGO_FRAME_MS = 125;

const TOP = 2;
const HEIGHT = 6;

interface Letter {
  ch: string;
  i: number;
  x: number;
  w: number;
  px: Array<[number, number]>;
  color: LogoColor;
}

const LETTERS: readonly Letter[] = (() => {
  const letters: Letter[] = [];
  let x = 0;
  [...LOGO_WORD].forEach((ch, i) => {
    const glyph = LOGO_GLYPHS[ch]!;
    const px: Array<[number, number]> = [];
    glyph.forEach((row, y) =>
      [...row].forEach((c, dx) => {
        if (c === '#') px.push([dx, y]);
      }),
    );
    const w = glyph[0]!.length;
    letters.push({
      ch,
      i,
      x,
      w,
      px,
      color: isLogoBrand(i, ch) ? 'brand' : 'primary',
    });
    x += w + 1;
  });
  return letters;
})();

const LAST = LETTERS[LETTERS.length - 1]!;

/** Columns of the grid: the static logo plus one for the typing cursor. */
export const LOGO_GRID_WIDTH = LAST.x + LAST.w + 1;

// The mock drew the logo from column 1; its seeds use that column numbering,
// so the same pixels come out here.
const MOCK_X = 1;

const blank = (): LogoGrid =>
  Array.from({ length: HEIGHT }, () =>
    Array<LogoColor | null>(LOGO_GRID_WIDTH).fill(null),
  );

function put(g: LogoGrid, x: number, y: number, c: LogoColor): void {
  if (y >= 0 && y < HEIGHT && x >= 0 && x < LOGO_GRID_WIDTH) g[y]![x] = c;
}

interface DrawOptions {
  dx?: number;
  dy?: number;
  glyph?: readonly string[];
  color?: LogoColor;
  squash?: boolean;
}

function draw(g: LogoGrid, L: Letter, options: DrawOptions = {}): void {
  const { dx = 0, dy = 0, glyph, color, squash = false } = options;
  const rows = glyph ?? LOGO_GLYPHS[L.ch]!;
  // Squashing drops the second pixel row: the letter is three rows tall.
  const src = squash ? [rows[0]!, rows[2]!, rows[3]!] : rows;
  const yOff = squash ? 1 : 0;
  src.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '#')
        put(g, L.x + x + dx, TOP + y + yOff + dy, color ?? L.color);
    }),
  );
}

const drawAll = (g: LogoGrid, options?: DrawOptions): void =>
  LETTERS.forEach((L) => draw(g, L, options));

/** Deterministic pseudo-random in [0, 1), so every pass draws the same frames. */
const rnd = (seed: number): number => ((seed * 9301 + 49297) % 233280) / 233280;

/** The logo at rest, pixel-identical to the static logo. */
export function restFrame(): LogoGrid {
  const g = blank();
  drawAll(g);
  return g;
}

const C_OPEN = ['###', '#.#', '#..', '###'];
const C_SHUT = ['###', '#..', '#..', '###'];

function come(t: number): LogoGrid {
  const g = blank();
  const C = LETTERS[3]!;
  if (t >= 36) {
    if (t % 4 < 2 || t >= 40) drawAll(g);
    return g;
  }
  // The C walks 14 columns: enough to eat the dot, and it stays in view on
  // the last columns of the logo until the blink instead of leaving the grid.
  const cx = C.x + Math.min(t, 14);
  LETTERS.forEach((L) => {
    if (L.i <= 2) {
      draw(g, L);
      return;
    }
    if (L.i === 3) return;
    if (L.x <= cx + 2) return; // eaten once the mouth reaches it
    if (L.ch === '.') {
      if (t % 2 === 0) draw(g, L);
      return;
    }
    draw(g, L);
  });
  draw(g, C, {
    dx: cx - C.x,
    glyph: t > 16 || t % 2 === 0 ? C_SHUT : C_OPEN,
    color: 'warning',
  });
  return g;
}

const HOP = [0, -1, -2, -2, -2, -1, 0];

function pulo(t: number): LogoGrid {
  const g = blank();
  const o1dy = t < HOP.length ? HOP[t]! : 0;
  const landed = t >= HOP.length && t < HOP.length + 2;
  const dotUp = t >= HOP.length + 1 && t < HOP.length + 4 ? -1 : 0;
  LETTERS.forEach((L) => {
    if (L.i < 2) draw(g, L, { dy: o1dy });
    else if (L.ch === '.') draw(g, L, { dy: dotUp });
    else if (L.i >= 3 && L.i <= 6) draw(g, L, { squash: landed });
    else draw(g, L);
  });
  return g;
}

function digita(t: number): LogoGrid {
  const g = blank();
  const typed = Math.min(LETTERS.length, Math.floor(t / 3));
  LETTERS.slice(0, typed).forEach((L) => draw(g, L));
  const cursorOn = typed < LETTERS.length ? true : t % 4 < 2;
  if (cursorOn && t < 40) {
    const next = LETTERS[typed];
    // After the dot the cursor sits right beside it; one column further would
    // fall outside the grid, as it did in the mock.
    const cx = next ? next.x : LAST.x + LAST.w;
    for (let y = 0; y < 4; y++) put(g, cx, TOP + y, 'brand');
  }
  return g;
}

const TETRIS_ORDER = [3, 0, 5, 1, 4, 2, 6, 7];

function tetris(t: number): LogoGrid {
  const g = blank();
  const step = Math.floor(t / 4);
  const sub = t % 4;
  TETRIS_ORDER.forEach((li, k) => {
    const L = LETTERS[li]!;
    if (k < step) draw(g, L);
    else if (k === step && step < TETRIS_ORDER.length)
      draw(g, L, { dy: -(4 - sub) });
  });
  if (step >= TETRIS_ORDER.length) {
    const flash = t - TETRIS_ORDER.length * 4 < 2;
    drawAll(g, flash ? { color: 'bright' } : undefined);
  }
  return g;
}

function compila(t: number): LogoGrid {
  const g = blank();
  const p = Math.min(1, t / 20);
  LETTERS.forEach((L) =>
    L.px.forEach(([dx, dy], k) => {
      if (rnd(L.i * 131 + k * 17 + 3) < p) put(g, L.x + dx, TOP + dy, L.color);
    }),
  );
  if (p < 1) {
    for (let y = TOP; y < TOP + 4; y++) {
      for (let x = 0; x < LOGO_GRID_WIDTH - 1; x++) {
        const r = rnd((x + MOCK_X) * 7 + y * 53 + t * 11);
        if (!g[y]![x] && r < (1 - p) * 0.18) {
          put(g, x, y, r < 0.04 ? 'brand' : 'muted');
        }
      }
    }
  }
  return g;
}

function chuva(t: number): LogoGrid {
  const g = blank();
  const lit: Array<[number, number, LogoColor]> = [];
  for (let x = 0; x < LOGO_GRID_WIDTH; x++) {
    const phase = Math.floor(rnd((x + MOCK_X) * 31 + 5) * 14);
    const head = t - phase;
    for (let y = 0; y < HEIGHT; y++) {
      if (head >= y && head - y < 2)
        put(g, x, y, y === head ? 'code' : 'muted');
    }
    LETTERS.forEach((L) =>
      L.px.forEach(([dx, dy]) => {
        if (L.x + dx === x && head >= TOP + dy) {
          lit.push([x, TOP + dy, L.color]);
        }
      }),
    );
  }
  lit.forEach(([x, y, c]) => put(g, x, y, c));
  return g;
}

const BOLA_PATH = 27;
const BOLA_BOUNCE = [1, 0, 0, 1];

function bola(t: number): LogoGrid {
  const g = blank();
  const dot = LETTERS[7]!;
  LETTERS.slice(0, 7).forEach((L) => draw(g, L));
  if (t >= 2 * BOLA_PATH + 2) {
    draw(g, dot);
    return g;
  }
  const k = t < BOLA_PATH ? t : 2 * BOLA_PATH - t;
  // One frame past its place the ball is hidden, as in the mock.
  if (k < 0) return g;
  const y = TOP - 1 - BOLA_BOUNCE[k % 4]!;
  put(g, Math.max(0, dot.x - k), y, 'brand');
  return g;
}

function onda(t: number): LogoGrid {
  const g = blank();
  LETTERS.forEach((L) => {
    const phase = t - L.i * 2;
    draw(g, L, { dy: phase >= 0 && phase < 3 ? -1 : 0 });
  });
  return g;
}

const animation = (
  length: number,
  frame: (t: number) => LogoGrid,
): LogoAnimation => ({
  length,
  frame: (t) => (t >= length ? restFrame() : frame(t)),
});

export const LOGO_ANIMATIONS: Readonly<
  Record<LogoAnimationName, LogoAnimation>
> = {
  come: animation(44, come),
  pulo: animation(40, pulo),
  digita: animation(48, digita),
  tetris: animation(TETRIS_ORDER.length * 4 + 8, tetris),
  compila: animation(40, compila),
  chuva: animation(44, chuva),
  bola: animation(60, bola),
  onda: animation(28, onda),
};

function paintCell(
  top: LogoColor | null,
  bottom: LogoColor | null,
): LogoFrameRun | null {
  if (!top && !bottom) return null;
  if (top && !bottom) return { text: '▀', color: top };
  if (!top && bottom) return { text: '▄', color: bottom };
  if (top === bottom) return { text: '█', color: top! };
  return { text: '▀', color: top!, background: bottom! };
}

/**
 * Paints a grid into three terminal rows of half blocks. A cell whose two
 * pixels differ in colour is `▀` over a background in the bottom colour.
 */
export function paintLogoFrame(grid: LogoGrid): LogoFrameRun[][] {
  const rows: LogoFrameRun[][] = [];
  for (let r = 0; r < HEIGHT; r += 2) {
    const runs: LogoFrameRun[] = [];
    for (let c = 0; c < LOGO_GRID_WIDTH; c++) {
      const cell = paintCell(grid[r]![c] ?? null, grid[r + 1]![c] ?? null);
      const last = runs[runs.length - 1];
      if (!cell) {
        // A space takes the colour of the run before it, never its background.
        if (last && !last.background) last.text += ' ';
        else runs.push({ text: ' ', color: last?.color ?? 'primary' });
      } else if (
        last &&
        last.color === cell.color &&
        last.background === cell.background
      ) {
        last.text += cell.text;
      } else {
        runs.push(cell);
      }
    }
    rows.push(runs);
  }
  return rows;
}

const isName = (value: string): value is LogoAnimationName =>
  (LOGO_ANIMATION_NAMES as readonly string[]).includes(value);

/**
 * Resolves the `ui.logoAnimation` setting: `off` is no animation, a name is
 * that animation, anything else draws one at random.
 */
export function pickLogoAnimation(
  setting: string | undefined,
  random: () => number = Math.random,
): LogoAnimationName | undefined {
  if (setting === 'off') return undefined;
  if (setting && isName(setting)) return setting;
  const index = Math.floor(random() * LOGO_ANIMATION_NAMES.length);
  return LOGO_ANIMATION_NAMES[
    Math.min(Math.max(index, 0), LOGO_ANIMATION_NAMES.length - 1)
  ];
}
