/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Glyphs of the TUI chrome. The compat set replaces what the Windows console
 * host's fonts (Consolas, Lucida Console) cannot draw; everything it keeps is
 * in WGL4.
 */

// East-Asian-Width "Ambiguous" glyphs get VS15 so CJK terminals draw them one
// column wide, as Ink measures them (see ICON in constants.ts).
const VS15 = '︎';

export type GlyphMode = 'full' | 'compat';
export type GlyphSetting = 'auto' | GlyphMode;

export interface GlyphSet {
  prompt: string;
  /** Includes the trailing space, so compat mode can drop both. */
  branchPrefix: string;
  barFull: string;
  barEmpty: string;
  /** Drawn on every line of a user message. */
  userBar: string;
  queued: string;
  agent: string;
  failed: string;
  done: string;
  dot: string;
  hollow: string;
  up: string;
  spinnerFrames: readonly string[];
  borderStyle: 'round' | 'single';
}

export const FULL_GLYPHS: GlyphSet = {
  prompt: '❯',
  branchPrefix: '⎇ ',
  barFull: '▰',
  barEmpty: '▱',
  userBar: '▎',
  queued: '↳',
  agent: `◆${VS15}`,
  failed: '✗',
  done: '✓',
  dot: `●${VS15}`,
  hollow: `○${VS15}`,
  up: `↑${VS15}`,
  spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  borderStyle: 'round',
};

export const COMPAT_GLYPHS: GlyphSet = {
  prompt: '>',
  branchPrefix: '',
  barFull: '█',
  barEmpty: '░',
  userBar: '│',
  queued: `→${VS15}`,
  agent: '*',
  failed: 'x',
  done: '√',
  dot: `●${VS15}`,
  hollow: `○${VS15}`,
  up: `↑${VS15}`,
  spinnerFrames: ['|', '/', '-', '\\'],
  borderStyle: 'single',
};

export function resolveGlyphMode(
  setting: string | undefined,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): GlyphMode {
  if (setting === 'full' || setting === 'compat') return setting;
  // The console host sets neither variable; Windows Terminal sets WT_SESSION,
  // and VS Code, Hyper and others set TERM_PROGRAM.
  if (platform === 'win32' && !env['WT_SESSION'] && !env['TERM_PROGRAM']) {
    return 'compat';
  }
  return 'full';
}

let active: GlyphSet = FULL_GLYPHS;

export function setGlyphMode(mode: GlyphMode): void {
  active = mode === 'compat' ? COMPAT_GLYPHS : FULL_GLYPHS;
}

export function glyphs(): GlyphSet {
  return active;
}
