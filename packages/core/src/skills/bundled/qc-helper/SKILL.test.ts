/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSkillContent } from '../../skill-load.js';

const skillDir = path.dirname(fileURLToPath(import.meta.url));
// The skill's `docs/` directory is docs/users of the repository: the bundle
// copies it there, and dev creates a gitignored symlink. Read the source tree
// so the test does not depend on either having happened.
const userDocsDir = path.resolve(skillDir, '../../../../../../docs/users');

function loadQcHelperSkill() {
  const skillPath = path.join(skillDir, 'SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf8');
  return parseSkillContent(content, skillPath);
}

function indexedDocPaths(body: string): string[] {
  const paths = new Set<string>();
  for (const match of body.matchAll(/\bdocs\/([\w./-]+\.(?:md|json))/g)) {
    paths.add(match[1]);
  }
  return [...paths].sort();
}

describe('bundled qc-helper skill', () => {
  it('parses as a skill named qc-helper', () => {
    expect(loadQcHelperSkill().name).toBe('qc-helper');
  });

  it('names only doc paths that exist under docs/users', () => {
    const paths = indexedDocPaths(loadQcHelperSkill().body);

    // The index is the skill's reason to exist; an empty match means the
    // pattern, not the docs, went wrong.
    expect(paths.length).toBeGreaterThan(30);
    const missing = paths.filter(
      (docPath) => !fs.existsSync(path.join(userDocsDir, docPath)),
    );
    expect(missing).toEqual([]);
  });
});
