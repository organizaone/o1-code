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

function loadFinishSkill() {
  const skillPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'SKILL.md',
  );
  const content = fs.readFileSync(skillPath, 'utf8');
  const config = parseSkillContent(content, skillPath);
  return { config, body: config.body };
}

function section(body: string, from: string, to?: string): string {
  const start = body.indexOf(from);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = to === undefined ? body.length : body.indexOf(to);
  expect(end).toBeGreaterThan(start);
  return body.slice(start, end);
}

describe('bundled finish skill', () => {
  it('parses as a user- and model-invocable skill named finish', () => {
    const { config } = loadFinishSkill();

    expect(config.name).toBe('finish');
    expect(config.argumentHint).toBe('[--fix] [--full]');
    expect(config.disableModelInvocation).toBeFalsy();
    expect(config.userInvocable ?? true).toBe(true);
    for (const usage of ['/finish', '/finish --fix', '/finish --full']) {
      expect(config.description).toContain(usage);
    }
    expect(config.description).toContain('/commit');
  });

  it('grants the shell, workspace reads and edits, but never the question', () => {
    const { config } = loadFinishSkill();

    // No edit tool is granted: without --fix the skill must not edit, and
    // with --fix its edits go through the session's normal approval.
    expect(config.allowedTools).toEqual([
      'run_shell_command',
      'read_file',
      'grep_search',
      'glob',
    ]);
    // allowedTools becomes session-wide allow rules. A rule for
    // ask_user_question overrides its interactive 'ask' default, so the
    // question would be answered with no dialog and the user never asked.
    expect(config.allowedTools).not.toContain('ask_user_question');
  });

  it('keeps ask_user_question behind its dialog after the allowedTools grant', async () => {
    const { config } = loadFinishSkill();
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

  it('sets the limits up front: no commit, no push, no full suite, no edits without --fix', () => {
    const { body } = loadFinishSkill();
    const preamble = section(body, '# /finish', '## Step 1');

    expect(preamble).toContain(
      'do not call the `skill` tool to invoke it again',
    );
    expect(preamble).toContain(
      'build → lint → tests → docs → version → report',
    );
    expect(preamble).toContain('You never commit');
    expect(preamble).toContain('`/commit`');
    expect(preamble).toContain('never push');
    expect(preamble).toContain('never run the full suite without being asked');
    expect(preamble).toContain('without `--fix` you never edit files');
  });

  it('walks the steps in order', () => {
    const { body } = loadFinishSkill();
    const headings = [
      '## Step 0',
      '## Step 1',
      '## Step 2',
      '## Step 3',
      '## Step 4',
      '## Step 5',
      '## Step 6',
    ];
    const positions = headings.map((heading) => body.indexOf(heading));

    expect(positions.every((index) => index >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('takes the commands from AGENTS.md first, then the manifests, then asks', () => {
    const { body } = loadFinishSkill();
    const step1 = section(body, '## Step 1', '## Step 2');

    expect(step1).toContain('`AGENTS.md`');
    expect(step1).toContain('`## Commands`');
    for (const manifest of [
      '`package.json`',
      '`Makefile`',
      '`Cargo.toml`',
      '`go.mod`',
      '`pyproject.toml`',
    ]) {
      expect(step1).toContain(manifest);
    }
    expect(step1).toContain('lockfile');
    expect(step1).toContain('ask once with `ask_user_question`');
    expect(step1).toContain('Say which source the commands came from');
  });

  it('scopes the tests to the reach of the change and only proposes the full suite', () => {
    const { body } = loadFinishSkill();
    const step2 = section(body, '## Step 2', '## Step 3');

    expect(step2).toContain('git status --porcelain -uall');
    expect(step2).toContain('git diff HEAD --stat');
    expect(step2).toContain('cross-cutting');
    expect(step2).toContain('the full suite is proposed, not run');
  });

  it('runs build, lint, typecheck and tests in order and bounds --fix', () => {
    const { body } = loadFinishSkill();
    const step3 = section(body, '## Step 3', '## Step 4');
    const order = ['**Build**', '**lint', '**typecheck**', '**scoped tests**'];
    const positions = order.map((label) => step3.indexOf(label));

    expect(positions.every((index) => index >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(step3).toContain('lint on the whole project');
    expect(step3).toContain('a failure stops the cycle');
    expect(step3).toContain('never `--no-verify`');
    expect(step3).toContain('never skipping a test');
    expect(step3).toContain('at most two restarts');
    expect(step3).toContain('With `--full`');
    expect(step3).toContain('the full suite was not run');
  });

  it('checks the docs against the change without creating new ones', () => {
    const { body } = loadFinishSkill();
    const step4 = section(body, '## Step 4', '## Step 5');

    expect(step4).toContain('`file:line — claim → what changed`');
    expect(step4).toContain('`## [Unreleased]`');
    expect(step4).toContain('Never create a new documentation file');
    expect(step4).toContain('docs: nothing to sync');
  });

  it('bumps the version only through a command the project declares', () => {
    const { body } = loadFinishSkill();
    const step5 = section(body, '## Step 5', '## Step 6');

    expect(step5).toContain('Only when `AGENTS.md` declares a version command');
    expect(step5).toContain('version: not declared by this project');
    expect(step5).toContain('Never edit version files by hand');
  });

  it('reports in a fixed shape and hands over to /commit', () => {
    const { body } = loadFinishSkill();
    const step6 = section(body, '## Step 6', '## Guardrails');

    for (const label of [
      '`Ran:`',
      '`Not run:`',
      '`Docs:`',
      '`Version:`',
      '`Next:`',
    ]) {
      expect(step6).toContain(label);
    }
    expect(step6).toContain('"run /commit"');
  });

  it('never installs, deletes, resets or changes git state', () => {
    const { body } = loadFinishSkill();
    const guardrails = section(body, '## Guardrails');

    expect(guardrails).toContain('never install dependencies');
    expect(guardrails).toContain('never delete or reset files');
    expect(guardrails).toContain('never touch git state beyond reading it');
    expect(guardrails).toContain('read their exit codes');
  });
});
