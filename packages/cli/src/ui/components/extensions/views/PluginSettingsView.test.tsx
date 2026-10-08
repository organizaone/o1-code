/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { cleanup } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stringWidth from 'string-width';
import type { Extension } from '@organizaone/o1-code-core/extension/extensionManager.js';
import {
  ExtensionSettingScope,
  type ExtensionSetting,
  type getScopedEnvContents,
  type updateSetting,
} from '@organizaone/o1-code-core/extension/extensionSettings.js';
import { renderWithProviders } from '../../../../test-utils/render.js';
import { PluginSettingsView } from './PluginSettingsView.js';

const terminal = vi.hoisted(() => ({ columns: 100, rows: 40 }));
const storage = vi.hoisted(() => ({
  read: vi.fn<typeof getScopedEnvContents>(),
  update: vi.fn<typeof updateSetting>(),
}));
vi.mock('../../../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => terminal,
}));
vi.mock(
  '@organizaone/o1-code-core/extension/extensionSettings.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/extension/extensionSettings.js')
    >()),
    getScopedEnvContents: storage.read,
    updateSetting: storage.update,
  }),
);

const secretSetting: ExtensionSetting = {
  name: 'Access token',
  description: 'Token used by the plugin',
  envVar: 'TOKEN',
  sensitive: true,
};
const plainSetting: ExtensionSetting = {
  name: 'Endpoint',
  description: 'Service endpoint',
  envVar: 'ENDPOINT',
};
const extension: Extension = {
  id: 'demo-id',
  name: 'demo',
  version: '1.0.0',
  path: '/extensions/demo',
  isActive: false,
  config: {
    name: 'demo',
    version: '1.0.0',
    settings: [secretSetting, plainSetting],
  },
  contextFiles: [],
};

let userValues: Record<string, string>;
let projectValues: Record<string, string>;

function renderView(
  viewedExtension = extension,
  isActive = true,
  availableTerminalHeight?: number,
) {
  const onExit = vi.fn();
  const onReload = vi.fn();
  const onStatus = vi.fn();
  return {
    ...renderWithProviders(
      <PluginSettingsView
        extension={viewedExtension}
        isActive={isActive}
        onExit={onExit}
        onReload={onReload}
        onStatus={onStatus}
        availableTerminalHeight={availableTerminalHeight}
      />,
    ),
    onExit,
    onReload,
    onStatus,
  };
}

async function press(
  stdin: ReturnType<typeof renderWithProviders>['stdin'],
  key: string,
) {
  // Ink can paint a new view before its passive key subscriptions are flushed.
  await act(async () => {});
  await act(async () => {
    stdin.write(key);
  });
}

beforeEach(() => {
  terminal.columns = 100;
  terminal.rows = 40;
  userValues = { TOKEN: 'previous-secret-value', ENDPOINT: 'user-endpoint' };
  projectValues = {};
  storage.read
    .mockReset()
    .mockImplementation(async (_config, _id, scope) =>
      scope === ExtensionSettingScope.USER ? userValues : projectValues,
    );
  storage.update.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
});

describe('PluginSettingsView', () => {
  it('conceals stored secrets and starts replacement empty, including for disabled plugins', async () => {
    const view = renderView({
      ...extension,
      resolvedSettings: [
        {
          name: secretSetting.name,
          envVar: 'TOKEN',
          value: 'runtime-secret',
          sensitive: true,
        },
      ],
    });
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    expect(view.lastFrame()).not.toContain('previous-secret-value');
    expect(view.lastFrame()).not.toContain('runtime-secret');
    await press(view.stdin, '\r');
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Enter a replacement'),
    );
    expect(view.lastFrame()).not.toContain('previous-secret-value');
    await press(view.stdin, 'replacement-secret');
    expect(view.lastFrame()).not.toContain('replacement-secret');
    expect(view.lastFrame()).toContain('*');
    await press(view.stdin, '\x1b');
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Settings for demo'),
    );
    expect(storage.update).not.toHaveBeenCalled();
    expect(view.onExit).not.toHaveBeenCalled();
    await press(view.stdin, '\x1b');
    await vi.waitFor(() => expect(view.onExit).toHaveBeenCalledOnce());
  });

  it('shows project inheritance and edits the effective non-sensitive value', async () => {
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\t');
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Inherited from user settings'),
    );
    await press(view.stdin, '\x1b[B');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('user-endpoint'));
    expect(view.lastFrame()).toContain('Scope: Project');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(storage.update).toHaveBeenCalledOnce());
    const [, id, key, request, scope] = storage.update.mock.calls[0];
    expect(id).toBe(extension.id);
    expect(key).toBe('ENDPOINT');
    expect(scope).toBe(ExtensionSettingScope.WORKSPACE);
    await expect(request(plainSetting)).resolves.toBe('user-endpoint');
    expect(view.onStatus).toHaveBeenCalledWith({
      type: 'success',
      text: 'Plugin setting saved. Restart the application to apply it.',
    });
    expect(view.onReload).toHaveBeenCalledOnce();
  });

  it('does not inherit a user value over an explicitly empty project value', async () => {
    projectValues = { ENDPOINT: '' };
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\t');
    await press(view.stdin, '\x1b[B');
    await press(view.stdin, '\r');
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Scope: Project'),
    );
    expect(view.lastFrame()).not.toContain('user-endpoint');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(storage.update).toHaveBeenCalledOnce());
    await expect(storage.update.mock.calls[0][3](plainSetting)).resolves.toBe(
      '',
    );
  });

  it('saves replacement whitespace without trimming it', async () => {
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\r');
    await press(view.stdin, '  new-token  ');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(storage.update).toHaveBeenCalledOnce());
    const [config, id, key, request, scope] = storage.update.mock.calls[0];
    expect(config).toBe(extension.config);
    expect(id).toBe(extension.id);
    expect(key).toBe('TOKEN');
    expect(scope).toBe(ExtensionSettingScope.USER);
    await expect(request(secretSetting)).resolves.toBe('  new-token  ');
    expect(view.frames.join('\n')).not.toContain('new-token');
  });

  it('requires an explicit replacement instead of clearing a secret with empty Enter', async () => {
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\r');
    await press(view.stdin, '\r');
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Enter a replacement value.'),
    );
    expect(storage.update).not.toHaveBeenCalled();
    expect(view.onReload).not.toHaveBeenCalled();
  });

  it('preserves existing non-sensitive whitespace, quotes, comments, tabs and multiline content', async () => {
    const original = '  first # "quoted"\nsecond\tline\r\nthird\\n  ';
    userValues['ENDPOINT'] = original;
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\x1b[B');
    await press(view.stdin, '\r');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(storage.update).toHaveBeenCalledOnce());
    await expect(storage.update.mock.calls[0][3](plainSetting)).resolves.toBe(
      original,
    );
  });

  it('prevents duplicate saves and navigation while persistence is busy', async () => {
    let finishSave!: () => void;
    storage.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\r');
    await press(view.stdin, 'new-token');
    await press(view.stdin, '\r');
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Saving plugin setting...'),
    );
    await press(view.stdin, '\r');
    await press(view.stdin, '\x1b');
    await press(view.stdin, '\t');
    expect(storage.update).toHaveBeenCalledOnce();
    expect(view.onExit).not.toHaveBeenCalled();
    expect(view.onReload).not.toHaveBeenCalled();
    await act(async () => {
      finishSave();
    });
    await vi.waitFor(() => expect(view.onReload).toHaveBeenCalledOnce());
  });

  it('ignores selection, scope and exit keys when the view is inactive', async () => {
    const view = renderView(extension, false);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    const frame = view.lastFrame();
    await press(view.stdin, '\x1b[B');
    await press(view.stdin, '\t');
    await press(view.stdin, '\r');
    await press(view.stdin, '\x1b');
    expect(view.lastFrame()).toBe(frame);
    expect(storage.update).not.toHaveBeenCalled();
    expect(view.onExit).not.toHaveBeenCalled();
  });

  it('shows safe persistence errors without exposing provider error credentials', async () => {
    storage.update.mockRejectedValue(
      new Error('https://name:secret@example.invalid/new-token'),
    );
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\r');
    await press(view.stdin, 'new-token');
    await press(view.stdin, '\r');
    await vi.waitFor(() =>
      expect(view.onStatus).toHaveBeenCalledWith({
        type: 'error',
        text: 'Could not save plugin setting. Check secure storage and try again.',
      }),
    );
    expect(view.frames.join('\n')).not.toContain('new-token');
    expect(JSON.stringify(view.onStatus.mock.calls)).not.toContain(
      'name:secret',
    );
    expect(view.onReload).not.toHaveBeenCalled();
    expect(view.onExit).not.toHaveBeenCalled();
    expect(view.lastFrame()).toContain('Enter a replacement');
  });

  it('shows safe load errors and lets Escape return without writing', async () => {
    storage.read.mockRejectedValue(new Error('stored-token-must-not-leak'));
    const view = renderView();
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Could not load plugin settings.'),
    );
    expect(view.frames.join('\n')).not.toContain('stored-token-must-not-leak');
    expect(JSON.stringify(view.onStatus.mock.calls)).not.toContain(
      'stored-token-must-not-leak',
    );
    await press(view.stdin, '\x1b');
    await vi.waitFor(() => expect(view.onExit).toHaveBeenCalledOnce());
    expect(storage.update).not.toHaveBeenCalled();
  });

  it('keeps long wrapped input bounded and indicates hidden continuation in a narrow terminal', async () => {
    terminal.columns = 48;
    const longValue = 'abcdefghij'.repeat(30);
    userValues['ENDPOINT'] = longValue;
    const view = renderView();
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
    await press(view.stdin, '\x1b[B');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(view.lastFrame()).toMatch(/\d+–\d+\/\d+/));
    expect(view.lastFrame()).toContain('↑');
    for (const line of (view.lastFrame() ?? '').split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(40);
    }
    expect((view.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(10);
    expect(view.lastFrame()).not.toMatch(/[╭╮╰╯]/);
  });

  it.each([undefined, 4])(
    'retains the controls and secret continuation with a parent height budget of %s',
    async (availableHeight) => {
      terminal.columns = 40;
      terminal.rows = 18;
      const view = renderView(extension, true, availableHeight);
      await vi.waitFor(() => expect(view.lastFrame()).toContain('Configured'));
      await press(view.stdin, '\r');
      await press(view.stdin, 'long-private-value'.repeat(20));
      await vi.waitFor(() => {
        expect(view.lastFrame()).toContain('Enter save · Esc cancel');
        expect(view.lastFrame()).toMatch(/\d+–\d+\/\d+/);
      });
      const frame = view.lastFrame() ?? '';
      expect(frame.split('\n').length).toBeLessThanOrEqual(
        availableHeight ?? 8,
      );
      expect(view.frames.join('\n')).not.toContain('long-private-value');
      for (const line of frame.split('\n')) {
        expect(stringWidth(line)).toBeLessThanOrEqual(32);
      }
      await press(view.stdin, '\x1b');
      await vi.waitFor(() =>
        expect(view.lastFrame()).toContain('Settings for demo'),
      );
      expect(storage.update).not.toHaveBeenCalled();
    },
  );

  it('strips terminal escape sequences from plugin metadata and non-sensitive values', async () => {
    userValues['ENDPOINT'] = '\x1b[31mendpoint\x1b[0m';
    const view = renderView({
      ...extension,
      displayName: '\x1b[31munsafe-name\x1b[0m',
    });
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('Endpoint · Configured'),
    );
    expect(view.lastFrame()).toContain('Settings for unsafe-name');
    await press(view.stdin, '\x1b[B');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('endpoint'));
    expect(view.lastFrame()).not.toContain('\x1b[31m');
    expect(view.lastFrame()).not.toContain('\x1b[0m');
    await press(view.stdin, '\r');
    await vi.waitFor(() => expect(storage.update).toHaveBeenCalledOnce());
    await expect(storage.update.mock.calls[0][3](plainSetting)).resolves.toBe(
      userValues['ENDPOINT'],
    );
  });

  it('explains that a plugin has no settings and allows returning without writes', async () => {
    const view = renderView({
      ...extension,
      config: { ...extension.config, settings: [] },
    });
    await vi.waitFor(() =>
      expect(view.lastFrame()).toContain('This plugin has no settings.'),
    );
    await press(view.stdin, '\x1b');
    await vi.waitFor(() => expect(view.onExit).toHaveBeenCalledOnce());
    expect(storage.update).not.toHaveBeenCalled();
  });
});
