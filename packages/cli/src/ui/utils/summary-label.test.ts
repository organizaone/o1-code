/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { setLanguageAsync } from '../../i18n/index.js';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../types.js';
import { commandProgram, summaryLabel } from './summary-label.js';

const tool = (
  name: string,
  args: Record<string, unknown> = {},
  description = '',
): IndividualToolCallDisplay => ({
  callId: 'c1',
  name,
  description,
  args,
  resultDisplay: undefined,
  status: ToolCallStatus.Success,
  confirmationDetails: undefined,
});

describe('summaryLabel', () => {
  afterEach(async () => {
    await setLanguageAsync('en');
  });

  it('names the file a read or edit works on, without directories', () => {
    expect(
      summaryLabel(tool('ReadFile', { file_path: '/repo/src/validate.ts' })),
    ).toBe('Reading validate.ts');
    expect(
      summaryLabel(tool('Edit', { file_path: '/repo/src/auth/login.ts' })),
    ).toBe('Changing login.ts');
    expect(summaryLabel(tool('WriteFile', { file_path: 'a/b.md' }))).toBe(
      'Writing b.md',
    );
  });

  it('shows only the program of a shell command', () => {
    expect(
      summaryLabel(
        tool('Shell', { command: 'npm test -- src/auth --run && rm -rf x' }),
      ),
    ).toBe('Running npm test');
    expect(summaryLabel(tool('Shell', { command: '/usr/bin/ls -la /' }))).toBe(
      'Running ls',
    );
  });

  it('quotes a search pattern', () => {
    expect(summaryLabel(tool('Grep', { pattern: 'normalizeEmail' }))).toBe(
      'Searching "normalizeEmail"',
    );
  });

  it('names the server and tool of an MCP call', () => {
    expect(summaryLabel(tool('create_issue (github MCP Server)'))).toBe(
      'Using github/create_issue',
    );
  });

  it('falls back to the display name for other tools', () => {
    expect(summaryLabel(tool('TodoWrite'))).toBe('TodoWrite');
  });

  it('strips control characters from the arguments it shows', () => {
    const label = summaryLabel(tool('Grep', { pattern: 'a\u001b[31mb\nc' }));
    expect(label).not.toContain('\u001b');
    expect(label).not.toContain('\n');
  });

  it('is localized', async () => {
    await setLanguageAsync('pt');
    expect(summaryLabel(tool('Edit', { file_path: 'login.ts' }))).toBe(
      'Alterando login.ts',
    );
    expect(summaryLabel(tool('Shell', { command: 'npm test' }))).toBe(
      'Rodando npm test',
    );
  });
});

describe('commandProgram', () => {
  it('keeps the subcommand of known runners only', () => {
    expect(commandProgram('git status --short')).toBe('git status');
    expect(commandProgram('python script.py')).toBe('python');
    expect(commandProgram('npm --version')).toBe('npm');
  });
});
