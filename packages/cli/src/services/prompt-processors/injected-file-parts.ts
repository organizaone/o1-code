/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { Part, PartUnion } from '@google/genai';

// Provenance is tracked by object identity, so nothing is added to the part
// itself and nothing leaks into the request sent to the model. A processor
// that copies a part drops the mark: any stage that interprets text must run
// on the original objects or check the mark before copying.
const injectedFileParts = new WeakSet<object>();

/**
 * Records that a part came from a file read by `@{...}`. A bare string cannot
 * be held in a WeakSet, so it is wrapped in a text part first.
 */
export function markInjectedFilePart(part: PartUnion): Part {
  const content = typeof part === 'string' ? { text: part } : part;
  injectedFileParts.add(content);
  return content;
}

export function isInjectedFilePart(part: PartUnion): boolean {
  return typeof part !== 'string' && injectedFileParts.has(part);
}
