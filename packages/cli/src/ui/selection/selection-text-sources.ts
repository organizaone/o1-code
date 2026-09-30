/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DOMElement } from 'ink';
import type { NormalizedSelection } from './selection-state.js';

/** The source text of a selection inside a region, or null to use its cells. */
export type SelectionTextSource = (
  selection: NormalizedSelection,
) => string | null;

// Keyed by the region's node, so the component that renders a region can
// describe its text without the selection layer holding a reference to it.
const sources = new WeakMap<DOMElement, SelectionTextSource>();

/** Registers (or, with null, removes) the text source of a region's node. */
export function setSelectionTextSource(
  node: DOMElement,
  source: SelectionTextSource | null,
): void {
  if (source) sources.set(node, source);
  else sources.delete(node);
}

export function getSelectionTextSource(
  node: DOMElement,
): SelectionTextSource | undefined {
  return sources.get(node);
}
