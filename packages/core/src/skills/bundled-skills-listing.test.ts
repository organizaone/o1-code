/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_SKILL_LISTING_CHARS } from '../core/environmentContext.js';
import { renderAvailableSkillsBlock } from '../tools/skill-utils.js';
import { parseSkillContent } from './skill-load.js';

// Every model-invocable bundled skill is listed in every session, verbatim:
// the listing budget trims user and project skills first and never bundled
// ones. The headroom left here is what user and project skills get before
// their descriptions are cut to one line.
const HEADROOM_FOR_USER_SKILLS = 800;

const bundledDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'bundled',
);

function listedBundledSkills() {
  return fs
    .readdirSync(bundledDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = path.join(bundledDir, entry.name, 'SKILL.md');
      return parseSkillContent(fs.readFileSync(file, 'utf8'), file);
    })
    .filter((skill) => !skill.disableModelInvocation)
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      level: 'bundled' as const,
    }));
}

describe('bundled skill listing', () => {
  it('leaves room in the listing budget for user and project skills', () => {
    const listing = renderAvailableSkillsBlock(listedBundledSkills());

    expect(listing.length).toBeLessThanOrEqual(
      MAX_SKILL_LISTING_CHARS - HEADROOM_FOR_USER_SKILLS,
    );
  });
});
