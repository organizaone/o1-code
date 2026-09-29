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

describe('bundled execute-plan skill', () => {
  it('is model-invocable, so the core prompt can route work to it', () => {
    const { config } = loadSkill();

    expect(config.name).toBe('execute-plan');
    expect(config.disableModelInvocation).toBeFalsy();
    expect(config.userInvocable ?? true).toBe(true);
  });

  it('describes when to use it, briefly, without summarising its steps', () => {
    const { config } = loadSkill();

    expect(config.description.startsWith('Use when')).toBe(true);
    expect(config.description.length).toBeLessThanOrEqual(150);
  });

  it('runs each task through tdd and commits it alone', () => {
    const { text } = loadSkill();

    expect(text).toContain('with the `tdd` skill');
    expect(text).toContain('Commit the task on its own');
    expect(text).toContain('`/commit`');
  });

  it('records rulings and stops only for the four named reasons', () => {
    const { text } = loadSkill();

    expect(text).toContain('`Ruling: <what> — <why> — <cost if wrong>`');
    expect(text).toContain('Continue between tasks without asking.');
    expect(text).toContain('Do not create one on your own.');
  });
});
