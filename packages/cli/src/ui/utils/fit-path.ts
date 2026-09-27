/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCachedStringWidth } from './textUtils.js';

const ELLIPSIS = '…';

export function fitPath(
  fullPath: string,
  room: number,
): { parent: string; name: string } {
  const trimmed = fullPath.replace(/[\\/]+$/, '');
  // A bare root ("/", "\\") is the folder itself.
  if (trimmed === '') return { parent: '', name: fullPath };
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const name = cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
  const parent = cut >= 0 ? trimmed.slice(0, cut + 1) : '';
  const nameWidth = getCachedStringWidth(name);
  if (getCachedStringWidth(parent) + nameWidth <= room) return { parent, name };

  // Keep as much of the end of the parent as fits after the ellipsis.
  const chars = [...parent];
  let tail = '';
  while (chars.length > 0) {
    const next = chars[chars.length - 1] + tail;
    if (getCachedStringWidth(ELLIPSIS + next) + nameWidth > room) break;
    tail = next;
    chars.pop();
  }
  return { parent: tail ? ELLIPSIS + tail : '', name };
}
