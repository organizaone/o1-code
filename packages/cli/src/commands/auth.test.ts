/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import yargs from 'yargs';
import {
  readCredential,
  writeCredential,
} from '@organizaone/o1-code-core/providers/credential-store.js';
import {
  authCommand,
  buildRemovalNotice,
  formatLogoutResult,
  logoutProvider,
  printRemovalNotice,
} from './auth.js';
import {
  SettingScope,
  type Settings,
  type SettingsFile,
} from '../config/settings.js';

describe('auth command', () => {
  const originalNoColor = process.env['NO_COLOR'];
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    process.env['NO_COLOR'] = '1';
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env['NO_COLOR'];
    } else {
      process.env['NO_COLOR'] = originalNoColor;
    }
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('builds a removal notice with migration paths and no ANSI in non-TTY', () => {
    const notice = buildRemovalNotice();

    expect(notice).toContain('o1-code auth has been removed');
    expect(notice).toContain('/auth');
    expect(notice).toContain('/doctor');
    expect(notice).toContain('BAILIAN_CODING_PLAN_API_KEY');
    expect(notice).toContain('https://coding.dashscope.aliyuncs.com/v1');
    expect(notice).toContain('https://coding-intl.dashscope.aliyuncs.com/v1');
    expect(notice).toContain('BAILIAN_TOKEN_PLAN_API_KEY');
    expect(notice).toContain(
      'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    );
    expect(notice).toContain(
      'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    );
    expect(notice).not.toContain('OPENROUTER_API_KEY');
    expect(notice).not.toContain('REQUESTY_API_KEY');
    expect(notice).not.toContain('\x1b[');
    expect(notice).not.toContain('v0.15.8');
  });

  it('writes the notice before exiting', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _chunk: unknown,
      callback?: () => void,
    ) => {
      callback?.();
      return true;
    }) as never);

    expect(() => printRemovalNotice()).toThrow('exit');

    expect(write).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
    );
    expect(exit).toHaveBeenCalledWith(0);
  });

  it.each([
    ['auth'],
    ['auth status'],
    ['auth api-key'],
    ['auth some-provider --key test-key'],
    ['auth coding-plan --region china --key sk-sp-test'],
    ['auth --key test-key'],
  ])('routes `%s` to the removal notice', async (command) => {
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _chunk: unknown,
      callback?: () => void,
    ) => {
      callback?.();
      return true;
    }) as never);

    await yargs(command.split(' '))
      .scriptName('o1-code')
      .command(authCommand)
      .strict()
      .fail((message, error) => {
        throw error ?? new Error(message);
      })
      .parseAsync();

    expect(write).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
    );
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe('auth logout', () => {
  let home: string;
  const originalHome = process.env['O1CODE_HOME'];

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-logout-'));
    process.env['O1CODE_HOME'] = home;
    process.env['NO_COLOR'] = '1';
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['O1CODE_HOME'];
    else process.env['O1CODE_HOME'] = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** A settings stand-in with one file per scope and recorded writes. */
  function fakeSettings(scopes: Partial<Record<SettingScope, Settings>>) {
    const files = Object.fromEntries(
      Object.entries(scopes).map(([scope, settings]) => [
        scope,
        {
          settings: structuredClone(settings),
          originalSettings: structuredClone(settings),
          path: `/settings/${scope}.json`,
        },
      ]),
    ) as Record<SettingScope, SettingsFile>;
    const empty: SettingsFile = {
      settings: {},
      originalSettings: {},
      path: '/settings/none.json',
    };
    return {
      forScope: (scope: SettingScope) => files[scope] ?? empty,
      setValue: vi.fn((scope: SettingScope, key: string, value: unknown) => {
        const [, bucket] = key.split('.');
        const file = files[scope]!;
        const providers = (file.originalSettings.modelProviders ??
          {}) as Record<string, unknown>;
        providers[bucket!] = value;
        file.originalSettings.modelProviders = providers as never;
      }),
    };
  }

  it('removes the saved key and every reference to it', () => {
    writeCredential('anthropic', { apiKey: 'sk-ant' });
    const settings = fakeSettings({
      [SettingScope.User]: {
        modelProviders: {
          anthropic: [
            {
              id: 'claude',
              envKey: 'ANTHROPIC_API_KEY',
              credential: 'anthropic',
            },
            { id: 'other', envKey: 'OTHER', credential: 'other' },
          ],
        },
      },
      [SettingScope.Workspace]: {
        modelProviders: {
          anthropic: [{ id: 'claude-ws', credential: 'anthropic' }],
        },
      },
    });

    const result = logoutProvider('anthropic', settings);

    expect(readCredential('anthropic')).toBeUndefined();
    expect(result.removedFile).toBe(true);
    expect(result.references).toEqual([
      { path: '/settings/User.json', count: 1 },
      { path: '/settings/Workspace.json', count: 1 },
    ]);
    expect(settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'modelProviders.anthropic',
      [
        { id: 'claude', envKey: 'ANTHROPIC_API_KEY' },
        { id: 'other', envKey: 'OTHER', credential: 'other' },
      ],
    );
    expect(settings.setValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'modelProviders.anthropic',
      [{ id: 'claude-ws' }],
    );
  });

  it('says when there was nothing to remove', () => {
    const settings = fakeSettings({ [SettingScope.User]: {} });

    const result = logoutProvider('gemini', settings);

    expect(result).toEqual({
      id: 'gemini',
      removedFile: false,
      file: path.join(home, 'credentials', 'gemini.json'),
      references: [],
    });
    expect(settings.setValue).not.toHaveBeenCalled();
    expect(formatLogoutResult(result)).toContain('No saved key for gemini');
  });

  it('prints what it removed', () => {
    const text = formatLogoutResult({
      id: 'openai',
      removedFile: true,
      file: '/home/.o1-code/credentials/openai.json',
      references: [{ path: '/home/.o1-code/settings.json', count: 2 }],
    });

    expect(text).toContain(
      'Removed the saved key for openai (/home/.o1-code/credentials/openai.json).',
    );
    expect(text).toContain(
      'Removed the credential reference from 2 model entries in /home/.o1-code/settings.json.',
    );
  });

  it('refuses an id the store would not accept', () => {
    expect(() => logoutProvider('../settings', fakeSettings({}))).toThrow(
      /credential id/i,
    );
  });

  it('routes `auth logout <id>` to the logout', async () => {
    writeCredential('deepseek', { apiKey: 'sk-d' });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as never);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await yargs(['auth', 'logout', 'deepseek'])
      .scriptName('o1-code')
      .command(authCommand)
      .strict()
      .fail((message, error) => {
        throw error ?? new Error(message);
      })
      .parseAsync();

    expect(readCredential('deepseek')).toBeUndefined();
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Removed the saved key for deepseek'),
    );
  });
});
