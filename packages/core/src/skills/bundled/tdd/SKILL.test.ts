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

describe('bundled tdd skill', () => {
  it('is model-invocable, so the core prompt can route work to it', () => {
    const { config } = loadSkill();

    expect(config.name).toBe('tdd');
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

describe('tdd skill content', () => {
  it('keeps existing code and proves the test against it, never deleting it', () => {
    // Deleting code written before the test would contradict the core
    // prompt's "Do Not revert changes" mandate.
    const { text } = loadSkill();

    expect(text).toContain('do not delete it');
    expect(text).not.toMatch(/\bDelete (it|the code|your code)\b/);
  });

  it('requires the test to be seen failing for the expected reason', () => {
    const { text } = loadSkill();

    expect(text).toContain('It must fail, and fail on the assertion you wrote');
    expect(text).toContain(
      'A test that stays green with the behaviour removed proves nothing.',
    );
  });
});
