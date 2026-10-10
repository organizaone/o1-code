/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../../types.js';
import {
  keepsDetailedRendering,
  SummaryToolGroupDisplay,
  summarySentence,
} from './SummaryToolGroupDisplay.js';

const call = (
  overrides: Partial<IndividualToolCallDisplay>,
): IndividualToolCallDisplay => ({
  callId: overrides.name ?? 'c',
  name: 'Edit',
  description: 'validate.ts',
  resultDisplay: undefined,
  status: ToolCallStatus.Success,
  confirmationDetails: undefined,
  ...overrides,
});

const frame = (toolCalls: IndividualToolCallDisplay[]) =>
  render(
    <SummaryToolGroupDisplay toolCalls={toolCalls} contentWidth={100} />,
  ).lastFrame() ?? '';

describe('<SummaryToolGroupDisplay />', () => {
  it('shows the intent, the file and the line counts, never the diff', () => {
    const output = frame([
      call({
        callId: 'e1',
        intent: 'Fix the e-mail validation',
        args: { file_path: '/repo/src/auth/validate.ts' },
        resultDisplay: {
          fileDiff: '@@ -1 +1 @@\n-  return raw;\n+  return raw.trim();',
          fileName: 'validate.ts',
          originalContent: 'return raw;',
          newContent: 'return raw.trim();',
          diffStat: {
            model_added_lines: 2,
            model_removed_lines: 1,
            model_added_chars: 0,
            model_removed_chars: 0,
            user_added_lines: 0,
            user_removed_lines: 0,
            user_added_chars: 0,
            user_removed_chars: 0,
          },
        },
      }),
    ]);
    expect(output).toContain('Fix the e-mail validation');
    expect(output).toContain('validate.ts');
    expect(output).toContain('+2');
    expect(output).toContain('−1');
    expect(output).not.toContain('return raw');
    expect(output).not.toContain('/repo/src');
  });

  it('falls back to a label when the model gave no intent', () => {
    const output = frame([
      call({ name: 'Shell', args: { command: 'npm test -- --run secret' } }),
    ]);
    expect(output).toContain('Running npm test');
    expect(output).not.toContain('secret');
  });

  it('hides shell output', () => {
    const output = frame([
      call({
        name: 'Shell',
        intent: 'Run the auth tests',
        resultDisplay: 'Tests  20 passed (20)',
      }),
    ]);
    expect(output).toContain('Run the auth tests');
    expect(output).not.toContain('20 passed');
  });

  it('folds consecutive reads into one row', () => {
    const output = frame([
      call({ callId: 'r1', name: 'ReadFile', intent: 'Read the login code' }),
      call({ callId: 'r2', name: 'ReadFile', description: 'login.ts' }),
      call({ callId: 'r3', name: 'ReadFile', description: 'session.ts' }),
    ]);
    expect(output).toContain('Read the login code');
    expect(output).toContain('3 files');
    expect(output).not.toContain('session.ts');
  });

  it('shows the first line of an error in its own row', () => {
    const output = frame([
      call({
        name: 'Shell',
        intent: 'Run the tests',
        status: ToolCallStatus.Error,
        resultDisplay: '\nCommand failed: exit 1\nstack trace line',
      }),
    ]);
    expect(output).toContain('Run the tests');
    expect(output).toContain('Command failed: exit 1');
    expect(output).not.toContain('stack trace line');
  });

  it('sanitizes the intent', () => {
    expect(summarySentence(call({ intent: 'Fix\u001b[2J the\nlogin' }))).toBe(
      'Fix the login',
    );
  });
});

describe('keepsDetailedRendering', () => {
  it('keeps todo lists, plans, findings, subagents and answers', () => {
    for (const type of [
      'todo_list',
      'plan_summary',
      'findings_list',
      'task_execution',
      'ask_user_question_answers',
    ]) {
      expect(
        keepsDetailedRendering(
          call({
            resultDisplay: {
              type,
            } as IndividualToolCallDisplay['resultDisplay'],
          }),
        ),
      ).toBe(true);
    }
    expect(keepsDetailedRendering(call({ resultDisplay: 'ok' }))).toBe(false);
  });
});
