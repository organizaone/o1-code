/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AUTO_MEMORY_INDEX_FILENAME, getAutoMemoryRoot } from './paths.js';

/**
 * A digest of the project memory files (path, size, modification time), so
 * Dream can tell whether anything changed since its last run without reading
 * any file. `MEMORY.md` is left out: it is rebuilt from the other files.
 */
export async function computeAutoMemoryFingerprint(
  projectRoot: string,
): Promise<string> {
  const root = getAutoMemoryRoot(projectRoot);
  let entries: string[];
  try {
    entries = (await fs.readdir(root, { recursive: true }))
      .filter(
        (entry): entry is string =>
          typeof entry === 'string' &&
          entry.endsWith('.md') &&
          path.basename(entry) !== AUTO_MEMORY_INDEX_FILENAME,
      )
      .map((entry) => entry.replaceAll('\\', '/'))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      entries = [];
    } else {
      throw error;
    }
  }
  const hash = createHash('sha256');
  for (const entry of entries) {
    try {
      const stats = await fs.stat(path.join(root, entry));
      hash.update(`${entry}\0${stats.size}\0${stats.mtimeMs}\n`);
    } catch {
      // A file removed mid-scan simply drops out of the digest.
    }
  }
  return hash.digest('hex');
}
