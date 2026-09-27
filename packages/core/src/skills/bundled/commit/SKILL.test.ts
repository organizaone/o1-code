/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildPermissionCheckContext,
  evaluatePermissionRules,
} from '../../../core/permission-helpers.js';
import { PermissionManager } from '../../../permissions/permission-manager.js';
import { applySkillAllowedTools } from '../../../tools/skill-utils.js';
import { parseSkillContent } from '../../skill-load.js';

function loadCommitSkill() {
  const skillPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'SKILL.md',
  );
  const content = fs.readFileSync(skillPath, 'utf8');
  const config = parseSkillContent(content, skillPath);
  return { config, body: config.body };
}

describe('bundled commit skill', () => {
  it('parses as a user- and model-invocable skill named commit', () => {
    const { config } = loadCommitSkill();

    expect(config.name).toBe('commit');
    expect(config.argumentHint).toBe('[what changed, optional]');
    expect(config.disableModelInvocation).toBeFalsy();
    expect(config.userInvocable ?? true).toBe(true);
    expect(config.description).toContain('/commit');
    expect(config.description).toContain('/commit <what changed>');
    expect(config.description).toContain('never pushes');
  });

  it('grants the shell and workspace reads, but never the confirmation question', () => {
    const { config } = loadCommitSkill();

    expect(config.allowedTools).toEqual([
      'run_shell_command',
      'read_file',
      'grep_search',
      'glob',
    ]);
    // allowedTools becomes session-wide allow rules. A rule for
    // ask_user_question overrides its interactive 'ask' default, so the
    // scheduler runs it with no dialog and the per-commit confirmation
    // would be answered "declined" without the user ever seeing it.
    expect(config.allowedTools).not.toContain('ask_user_question');
  });

  it('keeps ask_user_question behind its dialog after the allowedTools grant', async () => {
    const { config } = loadCommitSkill();
    const pm = new PermissionManager({
      getPermissionsAllow: () => undefined,
      getPermissionsAsk: () => undefined,
      getPermissionsDeny: () => undefined,
    });
    applySkillAllowedTools(pm, config.allowedTools);

    const ctx = buildPermissionCheckContext('ask_user_question', {}, '');
    await expect(
      evaluatePermissionRules(pm, 'ask', ctx),
    ).resolves.toMatchObject({ finalPermission: 'ask' });
  });

  it('forbids re-invocation, pushing, and history rewrites up front', () => {
    const { body } = loadCommitSkill();
    const step1 = body.indexOf('## Step 1');

    expect(step1).toBeGreaterThan(0);
    const preamble = body.slice(0, step1);
    expect(preamble).toContain(
      'do not call the `skill` tool to invoke it again',
    );
    expect(preamble).toContain('never push');
    expect(preamble).toContain('never amend');
    expect(preamble).toContain('`git add -A`');
    expect(preamble).toContain('never stash');
    expect(preamble).toContain(
      'If there is nothing to commit, say so and stop.',
    );
  });

  it('walks the steps in order', () => {
    const { body } = loadCommitSkill();
    const headings = [
      '## Step 0',
      '## Step 1',
      '## Step 2',
      '## Step 3',
      '## Step 4',
      '## Step 5',
      '## Step 6',
      '## Step 7',
    ];
    const positions = headings.map((heading) => body.indexOf(heading));

    expect(positions.every((index) => index >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('follows the repository message style instead of imposing one', () => {
    const { body } = loadCommitSkill();

    expect(body).toContain('git log -20 --format=%s');
    expect(body).toContain('Never mix languages within a repository.');
    expect(body).toContain('no co-author trailers');
  });

  it('confirms every commit through ask_user_question, even when unambiguous', () => {
    const { body } = loadCommitSkill();
    const step5 = body.slice(
      body.indexOf('## Step 5'),
      body.indexOf('## Step 6'),
    );

    expect(step5).toContain('ask_user_question');
    expect(step5).toContain('Always confirm before committing');
    expect(step5).toContain('even when everything is unambiguous');
    for (const option of [
      '"Commit"',
      '"Edit the message"',
      '"Skip this group"',
    ]) {
      expect(step5).toContain(option);
    }
    // Headless runs cannot answer the question: the skill must stop rather
    // than treat an unanswerable confirmation as consent.
    expect(step5).toContain('commit nothing');
  });

  it('stages only the unit and never bypasses hooks', () => {
    const { body } = loadCommitSkill();
    const step6 = body.slice(
      body.indexOf('## Step 6'),
      body.indexOf('## Step 7'),
    );

    expect(step6).toContain('git add -- <paths>');
    expect(step6).toContain('do not retry with `--no-verify`');
    expect(step6).toContain('never a heredoc');
  });

  it('leaves secrets and submodules out', () => {
    const { body } = loadCommitSkill();

    expect(body).toContain('Never commit files that look like secrets');
    expect(body).toContain('Never touch submodules');
  });
});
