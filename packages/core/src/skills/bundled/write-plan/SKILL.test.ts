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

describe('bundled write-plan skill', () => {
  it('is model-invocable, so the core prompt can route work to it', () => {
    const { config } = loadSkill();

    expect(config.name).toBe('write-plan');
    expect(config.disableModelInvocation).toBeFalsy();
    expect(config.userInvocable ?? true).toBe(true);
  });

  it('describes when to use it, briefly, without summarising its steps', () => {
    const { config } = loadSkill();

    expect(config.description.startsWith('Use when')).toBe(true);
    expect(config.description.length).toBeLessThanOrEqual(150);
  });

  it('asks for decisions, not code, and checks itself before hand-off', () => {
    const { text } = loadSkill();

    expect(text).toContain(
      'A plan longer than the code it describes has written the code instead of deciding it.',
    );
    for (const heading of ['## Global constraints', '## Review focus']) {
      expect(text).toContain(heading);
    }
    expect(text).toContain('No placeholder is left');
  });

  it('saves the plan under the project convention, never a foreign tool folder', () => {
    const { text } = loadSkill();

    expect(text).toContain('`docs/plans/YYYY-MM-DD-<feature>.md`');
    expect(text).toContain(
      'Never save it under a directory named after a tool, plugin or skill set',
    );
  });

  it('hands off to execute-plan or to a Goal', () => {
    const { text } = loadSkill();

    expect(text).toContain('`execute-plan` skill');
    expect(text).toContain('as a Goal (`/goal`)');
  });
});
