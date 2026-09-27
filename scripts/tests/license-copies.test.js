/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Packages that ship on their own carry a copy of the root legal files. The
// root is the source; a copy edited apart from it is drift.
const NOTICE_COPIES = [
  'packages/vscode-ide-companion/NOTICE',
  'packages/zed-extension/NOTICE',
];
const LICENSE_COPIES = [
  'packages/vscode-ide-companion/LICENSE',
  'packages/node-repl/LICENSE',
  'packages/zed-extension/LICENSE',
];

const read = (relative) => readFileSync(join(root, relative));

describe('legal file copies', () => {
  it.each(NOTICE_COPIES)('%s is byte-identical to the root NOTICE', (copy) => {
    expect(read(copy).equals(read('NOTICE'))).toBe(true);
  });

  it.each(LICENSE_COPIES)(
    '%s is byte-identical to the root LICENSE',
    (copy) => {
      expect(read(copy).equals(read('LICENSE'))).toBe(true);
    },
  );
});
