/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The project context file. `AGENTS.md` is the cross-tool standard and the
 * only name discovered, generated or offered by default. o1-code-specific
 * instructions live in an `## o1-code` section inside it. The documented
 * `context.fileName` setting can still point discovery at other names.
 */
export const DEFAULT_CONTEXT_FILENAME = 'AGENTS.md';
export const MEMORY_SECTION_HEADER = '## O1-Code Added Memories';

// The currently configured context file name(s); `setMemoryFilename` applies
// the `context.fileName` setting.
let currentMemoryFilename: string | string[] = [DEFAULT_CONTEXT_FILENAME];

export function setMemoryFilename(newFilename: string | string[]): void {
  if (Array.isArray(newFilename)) {
    if (newFilename.length > 0) {
      currentMemoryFilename = newFilename.map((name) => name.trim());
    }
  } else if (newFilename && newFilename.trim() !== '') {
    currentMemoryFilename = newFilename.trim();
  }
}

export function getCurrentMemoryFilename(): string {
  if (Array.isArray(currentMemoryFilename)) {
    //   (critical review finding, addresses divergence
    // with daemon's `extractContextFilename`): skip empty / whitespace
    // entries so callers that pass `[' ', 'AGENTS.md']` get
    // `'AGENTS.md'` instead of `''`. Without this filter the daemon's
    // `extractContextFilename` (which DOES skip empty) and this
    // process-global picker disagreed on the same input — daemon
    // parent would write `AGENTS.md` while the ACP child would read
    // `''`, leaving the init'd file orphaned.
    for (const entry of currentMemoryFilename) {
      if (typeof entry === 'string' && entry.trim() !== '') {
        return entry.trim();
      }
    }
    // All entries empty/whitespace — fall back to the default rather
    // than return `undefined` (callers expect a non-empty string).
    return DEFAULT_CONTEXT_FILENAME;
  }
  return currentMemoryFilename;
}

export function getAllMemoryFilenames(): string[] {
  if (Array.isArray(currentMemoryFilename)) {
    return currentMemoryFilename;
  }
  return [currentMemoryFilename];
}
