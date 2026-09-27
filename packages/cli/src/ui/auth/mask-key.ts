/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const HEAD = 8;
const TAIL = 4;
const HIDDEN = '•';

/**
 * Hides the middle of an API key while keeping its length, so an input that
 * shows it keeps its cursor where the person is typing. Keys too short to
 * leave a hidden middle are hidden entirely.
 */
export function maskKey(key: string): string {
  const chars = Array.from(key);
  if (chars.length <= HEAD + TAIL) return HIDDEN.repeat(chars.length);
  return (
    chars.slice(0, HEAD).join('') +
    HIDDEN.repeat(chars.length - HEAD - TAIL) +
    chars.slice(-TAIL).join('')
  );
}

/** A short form of an API key for a summary: its ends around an ellipsis. */
export function abbreviateKey(key: string): string {
  const chars = Array.from(key);
  if (chars.length <= HEAD + TAIL) return HIDDEN.repeat(4);
  return `${chars.slice(0, HEAD).join('')}…${chars.slice(-TAIL).join('')}`;
}
