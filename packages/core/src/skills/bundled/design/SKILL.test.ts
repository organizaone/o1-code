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

function loadSkill() {
  const skillPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'SKILL.md',
  );
  const config = parseSkillContent(
    fs.readFileSync(skillPath, 'utf8'),
    skillPath,
  );
  return { config, text: config.body.replace(/\s+/g, ' ') };
}

describe('bundled design skill', () => {
  it('is model-invocable, so the core prompt can route work to it', () => {
    const { config } = loadSkill();

    expect(config.name).toBe('design');
    expect(config.disableModelInvocation).toBeFalsy();
    expect(config.userInvocable ?? true).toBe(true);
  });

  it('describes when to use it, briefly, without summarising its steps', () => {
    const { config } = loadSkill();

    expect(config.description.startsWith('Use when')).toBe(true);
    expect(config.description.length).toBeLessThanOrEqual(150);
  });

  it('scales the ceremony to the request and ratchets only upward', () => {
    const { text } = loadSkill();

    for (const path of ['**Spike**', '**Bounded**', '**Architectural**']) {
      expect(text).toContain(path);
    }
    expect(text).toContain('When two paths could fit, take the heavier one.');
    expect(text).toContain('never move down in the middle of a task');
  });

  it('makes each approval cover only the stage shown, and does not stall headless', () => {
    const { text } = loadSkill();

    expect(text).toContain(
      'Approving an idea does not approve a design that has not been presented yet',
    );
    expect(text).toContain('A session that cannot ask questions');
    expect(text).toContain('Hand it to the `write-plan` skill.');
  });
});
