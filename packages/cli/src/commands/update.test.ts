/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArgumentsCamelCase } from 'yargs';
import { isSlowTestHost } from '../test-utils/slow-test-host.js';
import { updateEventEmitter } from '../utils/updateEventEmitter.js';

const loadSettings = vi.fn();
const checkForUpdatesDetailed = vi.fn();
const getInstallationInfo = vi.fn();
const performStandaloneUpdate = vi.fn();
const handleAutoUpdate = vi.fn();
const getPackageJson = vi.fn();
const writeStdoutLine = vi.fn();
const writeStderrLine = vi.fn();
const initializeI18n = vi.fn();
const resolveLanguageSetting = vi.fn((language?: string) => language || 'auto');

vi.mock('../config/settings.js', () => ({ loadSettings }));
vi.mock('../ui/utils/updateCheck.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui/utils/updateCheck.js')>()),
  checkForUpdatesDetailed,
}));
vi.mock('../utils/installationInfo.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/installationInfo.js')>();
  return {
    ...actual,
    getInstallationInfo,
    formatUpdateInstructions: vi.fn(actual.formatUpdateInstructions),
  };
});
vi.mock('../ui/standalone-update.js', () => ({ performStandaloneUpdate }));
vi.mock('../ui/handleAutoUpdate.js', () => ({ handleAutoUpdate }));
vi.mock('../utils/package.js', () => ({ getPackageJson }));
vi.mock('../utils/stdioHelpers.js', () => ({
  writeStdoutLine,
  writeStderrLine,
}));
vi.mock('../i18n/index.js', () => ({
  initializeI18n,
  resolveLanguageSetting,
  t: (key: string, params?: Record<string, string>) =>
    key.replace(
      /\{\{(\w+)\}\}/g,
      (_, param: string) => params?.[param] ?? `{{${param}}}`,
    ),
}));

const { updateCommand } = await import('./update.js');
const { formatUpdateInstructions } = await import(
  '../utils/installationInfo.js'
);

// A contended host runs several jobs at once; under that load these tests
// pass alone in milliseconds but blow the 15s ceiling without any real hang.
const timeoutMs = isSlowTestHost() ? 60_000 : 15_000;
vi.setConfig({ testTimeout: timeoutMs, hookTimeout: timeoutMs });

const updateArgs: ArgumentsCamelCase<object> = {
  _: [],
  $0: 'o1-code',
};

function settings(enableAutoUpdate?: boolean) {
  return {
    merged: {
      general: { enableAutoUpdate, language: 'zh' },
    },
  };
}

describe('update command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    loadSettings.mockReturnValue(settings(undefined));
    checkForUpdatesDetailed.mockResolvedValue({
      status: 'update',
      info: {
        message: 'Update available: 1.2.3',
        update: { latest: '1.2.3' },
      },
    });
    getInstallationInfo.mockReturnValue({
      packageManager: 'npm',
      isGlobal: true,
      isStandalone: false,
      updateCommand: 'npm install -g @organizaone/o1-code@latest',
    });
    handleAutoUpdate.mockImplementation(async () => {
      updateEventEmitter.emit('update-success', {
        message:
          'Update successful! The new version will be used on your next run.',
      });
      return true;
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
    expect(updateEventEmitter.listenerCount('update-success')).toBe(0);
    expect(updateEventEmitter.listenerCount('update-failed')).toBe(0);
  });

  it('installs the package-manager update even when auto-update is disabled', async () => {
    const loaded = settings(false);
    loadSettings.mockReturnValue(loaded);

    await updateCommand.handler(updateArgs);

    expect(resolveLanguageSetting).toHaveBeenCalledWith('zh');
    expect(initializeI18n).toHaveBeenCalledWith('zh');
    expect(getInstallationInfo).toHaveBeenCalledWith(expect.any(String), true);
    expect(writeStdoutLine).toHaveBeenCalledWith('Update available: 1.2.3');
    expect(handleAutoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ update: { latest: '1.2.3' } }),
      { merged: { general: { enableAutoUpdate: true, language: 'zh' } } },
      expect.any(String),
    );
    expect(loaded.merged.general.enableAutoUpdate).toBe(false);
    expect(writeStdoutLine).not.toHaveBeenCalledWith(
      'Run the following to update:',
    );
    expect(writeStdoutLine).toHaveBeenCalledWith(
      'Update successful! The new version will be used on your next run.',
    );
    expect(formatUpdateInstructions).not.toHaveBeenCalled();
  });

  it.each(['pnpm', 'yarn', 'bun'])(
    'runs the existing updater for a supported %s installation',
    async (packageManager) => {
      getInstallationInfo.mockReturnValue({
        packageManager,
        isGlobal: true,
        updateCommand: `${packageManager} add -g @organizaone/o1-code@latest`,
      });
      await updateCommand.handler(updateArgs);
      expect(handleAutoUpdate).toHaveBeenCalledOnce();
      expect(formatUpdateInstructions).not.toHaveBeenCalled();
    },
  );

  it('waits for installation to finish before the command completes', async () => {
    let finish!: (result: boolean) => void;
    let started!: () => void;
    const installationStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    handleAutoUpdate.mockImplementation(() => {
      started();
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    });
    let completed = false;
    const pending = Promise.resolve(updateCommand.handler(updateArgs)).then(
      () => {
        completed = true;
      },
    );
    await installationStarted;
    expect(completed).toBe(false);
    finish(true);
    await pending;
    expect(completed).toBe(true);
  });

  it('reports package-manager install failures and exits non-zero', async () => {
    handleAutoUpdate.mockImplementation(async () => {
      updateEventEmitter.emit('update-failed', {
        message: 'Update failed: registry unavailable',
      });
      return false;
    });
    await updateCommand.handler(updateArgs);
    expect(writeStderrLine).toHaveBeenCalledWith(
      'Update failed: registry unavailable',
    );
    expect(process.exitCode).toBe(1);
    expect(writeStdoutLine).not.toHaveBeenCalledWith(
      'Update successful! The new version will be used on your next run.',
    );
  });

  it('reports updater startup failures and removes its listeners', async () => {
    handleAutoUpdate.mockRejectedValue(new Error('spawn failed'));
    await updateCommand.handler(updateArgs);
    expect(writeStderrLine).toHaveBeenCalledWith('Update failed: spawn failed');
    expect(process.exitCode).toBe(1);
  });

  it('keeps manual recovery for an installation requiring elevation', async () => {
    getInstallationInfo.mockReturnValue({
      packageManager: 'npm',
      isGlobal: true,
      updateMessage:
        'Update requires sudo. Please run: sudo npm install -g @organizaone/o1-code@latest',
    });
    await updateCommand.handler(updateArgs);
    expect(handleAutoUpdate).not.toHaveBeenCalled();
    expect(writeStdoutLine).toHaveBeenCalledWith(
      '  sudo npm install -g @organizaone/o1-code@latest',
    );
  });

  it('sets a non-zero exit code when a standalone update fails', async () => {
    getInstallationInfo.mockReturnValue({
      isStandalone: true,
      standaloneDir: '/tmp/o1-code',
    });
    performStandaloneUpdate.mockRejectedValue(new Error('boom'));

    await updateCommand.handler(updateArgs);

    expect(performStandaloneUpdate).toHaveBeenCalledWith(
      '/tmp/o1-code',
      '1.2.3',
    );
    expect(writeStdoutLine).toHaveBeenCalledWith('Downloading update...');
    expect(writeStderrLine).toHaveBeenCalledWith('Update failed: boom');
    expect(process.exitCode).toBe(1);
  });

  it('updates standalone installs even when auto-update is disabled', async () => {
    loadSettings.mockReturnValue(settings(false));
    getInstallationInfo.mockReturnValue({
      isStandalone: true,
      standaloneDir: '/tmp/o1-code',
    });
    performStandaloneUpdate.mockResolvedValue('done');

    await updateCommand.handler(updateArgs);

    expect(getInstallationInfo).toHaveBeenCalledWith(expect.any(String), true);
    expect(performStandaloneUpdate).toHaveBeenCalledWith(
      '/tmp/o1-code',
      '1.2.3',
    );
    expect(writeStdoutLine).toHaveBeenCalledWith(
      'Update successful! The new version will be used on your next run.',
    );
  });

  it('does not print generic fallback when installation info has updateMessage', async () => {
    getInstallationInfo.mockReturnValue({
      isStandalone: false,
      updateMessage: 'Running via npx, update not applicable.',
    });

    await updateCommand.handler(updateArgs);

    expect(writeStdoutLine).toHaveBeenCalledWith(
      'Running via npx, update not applicable.',
    );
    expect(writeStdoutLine).not.toHaveBeenCalledWith(
      'Manual update required. Please reinstall O1-Code.',
    );
  });

  it('prints the update message when no update command is available', async () => {
    getInstallationInfo.mockReturnValue({
      updateMessage:
        'Running from a local git clone. Please update with "git pull".',
    });

    await updateCommand.handler(updateArgs);

    expect(writeStdoutLine).toHaveBeenCalledWith(
      'Running from a local git clone. Please update with "git pull".',
    );
  });

  it('prints success message on standalone update', async () => {
    getInstallationInfo.mockReturnValue({
      isStandalone: true,
      standaloneDir: '/tmp/o1-code',
    });
    performStandaloneUpdate.mockResolvedValue('done');

    await updateCommand.handler(updateArgs);

    expect(writeStdoutLine).toHaveBeenCalledWith('Downloading update...');
    expect(writeStdoutLine).toHaveBeenCalledWith(
      'Update successful! The new version will be used on your next run.',
    );
  });

  it('prints deferred message on standalone update', async () => {
    getInstallationInfo.mockReturnValue({
      isStandalone: true,
      standaloneDir: '/tmp/o1-code',
    });
    performStandaloneUpdate.mockResolvedValue('deferred');

    await updateCommand.handler(updateArgs);

    expect(writeStdoutLine).toHaveBeenCalledWith('Downloading update...');
    expect(writeStdoutLine).toHaveBeenCalledWith(
      'Update downloaded. It will be applied after you exit this session.',
    );
  });

  it('prints the current version when no update is available', async () => {
    checkForUpdatesDetailed.mockResolvedValue({
      status: 'up-to-date',
      currentVersion: '1.0.0',
    });

    await updateCommand.handler(updateArgs);

    expect(writeStdoutLine).toHaveBeenCalledWith(
      'O1-Code 1.0.0 is up to date!',
    );
    expect(getInstallationInfo).not.toHaveBeenCalled();
  });

  it('sets a non-zero exit code when the update check fails', async () => {
    checkForUpdatesDetailed.mockResolvedValue({
      status: 'error',
      error: new Error('registry unavailable'),
    });

    await updateCommand.handler(updateArgs);

    expect(writeStderrLine).toHaveBeenCalledWith(
      'Failed to check for updates (registry error). Please check your network or registry configuration.',
    );
    expect(process.exitCode).toBe(1);
    expect(getInstallationInfo).not.toHaveBeenCalled();
  });

  it('sets a non-zero exit code when the update check is skipped', async () => {
    checkForUpdatesDetailed.mockResolvedValue({
      status: 'skipped',
      reason: 'development mode',
    });

    await updateCommand.handler(updateArgs);

    expect(writeStderrLine).toHaveBeenCalledWith(
      'Unable to check for updates: development mode',
    );
    expect(process.exitCode).toBe(1);
    expect(getInstallationInfo).not.toHaveBeenCalled();
  });
});
