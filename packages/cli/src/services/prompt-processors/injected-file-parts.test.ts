/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@organizaone/o1-code-core';
import { ApprovalMode } from '@organizaone/o1-code-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { createSlashCommandFromDefinition } from '../command-factory.js';
import {
  isInjectedFilePart,
  markInjectedFilePart,
} from './injected-file-parts.js';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  permissions: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@organizaone/o1-code-core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readPathFromWorkspace: mocks.read,
  checkCommandPermissions: mocks.permissions,
}));
vi.mock('@organizaone/o1-code-core/sandbox/runtime-shell.js', () => ({
  executeRuntimeShell: mocks.execute,
}));

describe('injected file part marker', () => {
  it('wraps a string so that it can be tracked', () => {
    const marked = markInjectedFilePart('!{echo hi}');
    expect(marked).toEqual({ text: '!{echo hi}' });
    expect(isInjectedFilePart(marked)).toBe(true);
  });

  it('keeps the identity of an object part', () => {
    const part = { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } };
    expect(markInjectedFilePart(part)).toBe(part);
    expect(isInjectedFilePart(part)).toBe(true);
  });

  it('does not recognise a copy, an equal part or a string', () => {
    const marked = markInjectedFilePart({ text: 'data' });
    expect(isInjectedFilePart({ ...marked })).toBe(false);
    expect(isInjectedFilePart({ text: 'data' })).toBe(false);
    expect(isInjectedFilePart('data')).toBe(false);
  });
});

// These go through the processors exactly as the command loader chains them,
// with only the file reader, the permission check and the shell stubbed.
describe('file content injected into a custom command', () => {
  const literal = 'Literal {{args}} !{echo FROM_FILE} and unfinished !{';
  const media = { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.mockResolvedValue({
      allAllowed: true,
      disallowedCommands: [],
    });
    mocks.execute.mockResolvedValue({
      result: Promise.resolve({
        output: 'shell @{other} !{echo OUTPUT} {{args}}',
        exitCode: 0,
        error: null,
        aborted: false,
        signal: null,
      }),
    });
  });

  function setup(prompt: string, args = 'USER_ARG') {
    const command = createSlashCommandFromDefinition(
      '/workspace/.o1-code/commands/probe.toml',
      '/workspace/.o1-code/commands',
      { prompt },
      undefined,
      '.toml',
    );
    const config = {
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getShellExecutionConfig: () => ({}),
      getTargetDir: () => '/workspace',
      getShouldUseNodePtyShell: () => false,
    } as Config;
    const context = createMockCommandContext({
      invocation: { raw: `/probe ${args}`, name: 'probe', args },
      services: { config },
      session: { sessionShellAllowlist: new Set<string>() },
    });
    return { command, context };
  }

  it.each([
    { kind: 'string', content: 'Literal {{args}} !{echo FROM_FILE}' },
    { kind: 'object', content: literal },
  ])(
    'leaves a $kind file part untouched while the template arguments expand',
    async ({ kind, content }) => {
      mocks.read.mockResolvedValue([
        kind === 'string' ? content : { text: content },
        media,
      ]);
      const { command, context } = setup('{{args}} @{notes.md} Task {{args}}');

      const result = await command.action!(context, 'USER_ARG');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: [
          { text: 'USER_ARG ' },
          { text: content },
          media,
          { text: ' Task USER_ARG' },
        ],
      });
      expect(mocks.permissions).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it('does not run a shell block that only the file contains', async () => {
    mocks.read.mockResolvedValue([{ text: 'before !{rm -rf target} after' }]);
    const { command, context } = setup('Review @{notes.md} !{echo TEMPLATE}');

    const result = await command.action!(context, 'USER_ARG');

    expect(mocks.permissions.mock.calls.map(([cmd]) => cmd)).toEqual([
      'echo TEMPLATE',
    ]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0][1]).toBe('echo TEMPLATE');
    expect(result).toMatchObject({
      type: 'submit_prompt',
      content: [
        { text: 'Review ' },
        { text: 'before !{rm -rf target} after' },
        { text: expect.stringContaining('shell @{other}') },
      ],
    });
  });

  it('does not read a path that only the file names', async () => {
    mocks.read.mockResolvedValue([{ text: 'see @{secrets.env}' }]);
    const { command, context } = setup('Summarise @{notes.md}', '');

    const result = await command.action!(context, '');

    expect(mocks.read.mock.calls.map(([path]) => path)).toEqual(['notes.md']);
    expect(result).toEqual({
      type: 'submit_prompt',
      content: [{ text: 'Summarise ' }, { text: 'see @{secrets.env}' }],
    });
  });

  it('asks to confirm only the template command, and keeps file data literal on retry', async () => {
    mocks.read.mockImplementation(async () => [{ text: literal }]);
    mocks.permissions.mockResolvedValueOnce({
      allAllowed: false,
      disallowedCommands: ['echo TEMPLATE'],
    });
    const args = '@{from-args} !{echo ARGS} {{args}}';
    const { command, context } = setup(
      '@{notes.md} !{echo TEMPLATE} {{args}}',
      args,
    );

    expect(await command.action!(context, args)).toEqual({
      type: 'confirm_shell_commands',
      commandsToConfirm: ['echo TEMPLATE'],
      originalInvocation: { raw: `/probe ${args}` },
    });
    expect(mocks.execute).not.toHaveBeenCalled();

    context.session.sessionShellAllowlist.add('echo TEMPLATE');
    expect(await command.action!(context, args)).toEqual({
      type: 'submit_prompt',
      content: [
        { text: literal },
        { text: ` shell @{other} !{echo OUTPUT} {{args}} ${args}` },
      ],
    });
    expect(mocks.permissions.mock.calls.map(([cmd]) => cmd)).toEqual([
      'echo TEMPLATE',
      'echo TEMPLATE',
    ]);
    expect(mocks.read.mock.calls.map(([path]) => path)).toEqual([
      'notes.md',
      'notes.md',
    ]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
