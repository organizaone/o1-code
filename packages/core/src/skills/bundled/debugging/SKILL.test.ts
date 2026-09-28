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

const dir = path.dirname(fileURLToPath(import.meta.url));

function loadSkill() {
  const skillPath = path.join(dir, 'SKILL.md');
  const config = parseSkillContent(
    fs.readFileSync(skillPath, 'utf8'),
    skillPath,
  );
  return { config, body: config.body, text: config.body.replace(/\s+/g, ' ') };
}

describe('bundled debugging skill', () => {
  it('is model-invocable, so the core prompt can route work to it', () => {
    const { config } = loadSkill();

    expect(config.name).toBe('debugging');
    expect(config.disableModelInvocation).toBeFalsy();
    expect(config.userInvocable ?? true).toBe(true);
  });

  it('describes when to use it, briefly, without summarising its steps', () => {
    // Every bundled description is listed in every session and never
    // trimmed; a description that summarises the workflow gets followed
    // instead of the body (docs/guides/PROMPT-WRITING.md).
    const { config } = loadSkill();

    expect(config.description.startsWith('Use when')).toBe(true);
    expect(config.description.length).toBeLessThanOrEqual(150);
  });

  it('points only at reference files that ship with it', () => {
    const { body } = loadSkill();
    const references = [...body.matchAll(/`(references\/[\w.-]+\.md)`/g)].map(
      (match) => match[1],
    );

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(fs.existsSync(path.join(dir, reference))).toBe(true);
    }
  });
});

describe('debugging skill content', () => {
  it('defers the retry threshold to the core prompt instead of restating a number', () => {
    // One place per number (docs/guides/PROMPT-WRITING.md): the core prompt's
    // "Second failure" bullet owns it.
    const { text } = loadSkill();

    expect(text).toContain('Follow the core rule for repeated failures');
    expect(text).not.toMatch(/\b(three|3) (fixes|attempts)\b/i);
  });

  it('fixes at the cause through a failing test', () => {
    const { text } = loadSkill();

    expect(text).toContain('Write a test that reproduces the bug and fails');
    expect(text).toContain('Fix it there, not where it surfaced.');
  });
});
