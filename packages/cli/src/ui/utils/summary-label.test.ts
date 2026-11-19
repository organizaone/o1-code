/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { setLanguageAsync } from '../../i18n/index.js';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../types.js';
import {
  commandProgram,
  summaryDescription,
  summaryDetail,
  summaryLabel,
} from './summary-label.js';

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

  it.each([
    [
      'cd /c/repo/frontend/server && npm test 2>&1 | tail -6',
      'Running npm test in frontend/server',
    ],
    [
      "echo '=== status; now ==='; curl -s -m 10 http://127.0.0.1:8787/api",
      'Running curl',
    ],
    [
      'MSYS_NO_PATHCONV=1 wsl -d Ubuntu-26.04 -- bash -lc "cd /opt/hub && systemctl status hub"',
      'Running systemctl in opt/hub',
    ],
    [
      'powershell.exe -NoProfile -Command "Get-ScheduledTask -TaskName Hub"',
      'Running Get-ScheduledTask',
    ],
    ['pwsh -NoProfile -File scripts\\gates.ps1', 'Running gates.ps1'],
    ['& "C:\\Program Files\\Git\\bin\\git.exe" status', 'Running git status'],
    ['sudo env CI=1 npm run build -- --cli-only', 'Running npm run build'],
    ['sleep 5; git diff --stat', 'Running git diff'],
    ['L=$(ls -t ~/logs/*.log | head -1); grep -c error "$L"', 'Running grep'],
    ['wsl --status 2>&1', 'Running wsl'],
    [
      "bash -lc 'sudo -n true 2>&1 && systemctl restart hub'",
      'Running systemctl',
    ],
    [
      'pwsh -NoProfile -Command "(Get-ItemProperty \'HKCU:\\Environment\').Path"',
      'Running Get-ItemProperty',
    ],
    [
      'powershell -Command "\'== STARTUP ==\'; Get-CimInstance Win32_Process"',
      'Running Get-CimInstance',
    ],
    ['TS="/c/Program Files/x.exe"; "$TS" status', 'Running a command'],
    ['for d in */; do [ -d "$d" ] && git -C "$d" fetch; done', 'Running git'],
    ['cd /tmp', 'Running cd'],
    ["echo 'done'", 'Running echo'],
  ])('names the step of the command %s', (command, expected) => {
    expect(summaryLabel(tool('Shell', { command }))).toBe(expected);
  });

  it('places a command in the directory the call names', () => {
    expect(
      summaryLabel(
        tool('Shell', { command: 'npm test', directory: 'C:\\repo\\web' }),
      ),
    ).toBe('Running npm test in repo/web');
  });

  it('names what the other tools work on', () => {
    expect(
      summaryLabel(
        tool('WebFetch', {
          url: 'https://www.example.com/docs/a?b=1',
          prompt: 'Summarize the secret plan',
        }),
      ),
    ).toBe('Fetching example.com');
    expect(summaryLabel(tool('WebSearch', { query: 'ink flexbox' }))).toBe(
      'Searching the web for "ink flexbox"',
    );
    expect(summaryLabel(tool('Skill', { skill: 'debugging' }))).toBe(
      'Using the debugging skill',
    );
    expect(summaryLabel(tool('ToolSearch', { query: 'web fetch' }))).toBe(
      'Looking for a tool: web fetch',
    );
    expect(
      summaryLabel(tool('Grep', { pattern: 'TODO', path: '/repo/src/ui' })),
    ).toBe('Searching "TODO" in src/ui');
  });

  it('labels a ToolCall step as the call it runs', () => {
    expect(
      summaryLabel(
        tool('ToolCall', {
          name: 'web_fetch',
          arguments: { url: 'https://learn.example.org/x', prompt: 'p' },
        }),
      ),
    ).toBe('Fetching learn.example.org');
    expect(
      summaryLabel(
        tool('ToolCall', { name: 'mcp__github__create_issue', arguments: {} }),
      ),
    ).toBe('Using github/create_issue');
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

describe('summaryDescription', () => {
  it('takes the description a shell command or an agent call carries', () => {
    expect(
      summaryDescription(
        tool('Shell', {
          command: 'cd /repo && npm test',
          description: 'Check the server\u001b[2J tests\nagain',
        }),
      ),
    ).toBe('Check the server tests again');
    expect(
      summaryDescription(
        tool('Agent', { description: 'Research the options', prompt: 'x' }),
      ),
    ).toBe('Research the options');
  });

  it('caps a long description and ignores other tools', () => {
    expect(
      summaryDescription(
        tool('Shell', { command: 'ls', description: 'a'.repeat(300) }),
      ),
    ).toHaveLength(120);
    expect(
      summaryDescription(tool('WebFetch', { description: 'not a step' })),
    ).toBeUndefined();
    expect(
      summaryDescription(tool('Shell', { command: 'ls' })),
    ).toBeUndefined();
  });
});

describe('summaryDetail', () => {
  it('names the file, program, host or skill of a step', () => {
    expect(summaryDetail(tool('Edit', { file_path: '/repo/a/login.ts' }))).toBe(
      'login.ts',
    );
    expect(
      summaryDetail(tool('Shell', { command: 'cd /repo && npm test -- x' })),
    ).toBe('npm test');
    expect(
      summaryDetail(tool('WebFetch', { url: 'https://example.com/a' })),
    ).toBe('example.com');
    expect(summaryDetail(tool('Skill', { skill: 'finish' }))).toBe('finish');
    expect(summaryDetail(tool('Grep', { pattern: 'x' }))).toBeUndefined();
  });
});

describe('commandProgram', () => {
  it('keeps the subcommand of known runners only', () => {
    expect(commandProgram('git status --short')).toBe('git status');
    expect(commandProgram('python script.py')).toBe('python');
    expect(commandProgram('npm --version')).toBe('npm');
  });
});
