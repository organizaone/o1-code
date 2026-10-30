/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateEventEmitter } from '../../utils/updateEventEmitter.js';
import type { LoadedSettings } from '../../config/settings.js';
import { useApplicationUpdate } from './use-application-update.js';

const { install, installation } = vi.hoisted(() => ({
  install: vi.fn(),
  installation: vi.fn(),
}));
vi.mock('../handleAutoUpdate.js', () => ({ handleAutoUpdate: install }));
vi.mock('../../utils/installationInfo.js', () => ({
  getInstallationInfo: installation,
  formatUpdateInstructions: () => ['npm install -g @organizaone/o1-code@2.0.0'],
}));

const info = {
  message: 'Update available',
  update: {
    current: '1.0.0',
    latest: '2.0.0',
    type: 'minor',
    name: '@organizaone/o1-code',
  },
};
const settings = { merged: { general: {} } } as LoadedSettings;

describe('application update flow', () => {
  beforeEach(() => {
    install.mockReset().mockResolvedValue(true);
    installation.mockReturnValue({
      packageManager: 'npm',
      updateCommand: 'npm install -g',
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  function setup(idle = true, blocked = false, autoPrepare = true) {
    const restart = vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(
      (props) =>
        useApplicationUpdate({
          ...props,
          projectRoot: '/project',
          settings,
          restart,
        }),
      { initialProps: { idle, blocked, autoPrepare } },
    );
    act(() => {
      updateEventEmitter.emit('update-available', info);
    });
    return { ...hook, restart };
  }

  it('waits for idle before preparing and presenting an update', async () => {
    const hook = setup(false);
    expect(install).not.toHaveBeenCalled();
    expect(hook.result.current.visible).toBe(false);
    hook.rerender({ idle: true, blocked: false, autoPrepare: true });
    await waitFor(() => expect(hook.result.current.state?.phase).toBe('ready'));
    expect(hook.result.current.visible).toBe(true);
    expect(hook.restart).not.toHaveBeenCalled();
  });

  it('keeps a prepared update dismissed until explicitly requested again', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.state?.phase).toBe('ready'));
    act(() => hook.result.current.dismiss());
    act(() => updateEventEmitter.emit('update-available', info));
    expect(hook.result.current.visible).toBe(false);
    expect(install).toHaveBeenCalledTimes(1);
    act(() => updateEventEmitter.emit('update-available', info, true));
    expect(hook.result.current.visible).toBe(true);
    expect(hook.result.current.state?.phase).toBe('ready');
  });

  it('never covers another dialog and retains its pending choice', async () => {
    const hook = setup(true, true);
    expect(hook.result.current.visible).toBe(false);
    hook.rerender({ idle: true, blocked: false, autoPrepare: true });
    await waitFor(() => expect(hook.result.current.visible).toBe(true));
  });

  it('honors disabled automatic preparation but allows the explicit action', async () => {
    const hook = setup(true, false, false);
    expect(install).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.apply();
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(hook.restart).toHaveBeenCalledTimes(1);
  });

  it('does not restart if work begins while the download is finishing', async () => {
    let finish: (success: boolean) => void = () => {};
    install.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const hook = setup(true, false, false);
    let application: Promise<void>;
    act(() => {
      application = hook.result.current.apply();
    });
    hook.rerender({ idle: false, blocked: false, autoPrepare: false });
    await act(async () => {
      finish(true);
      await application;
    });
    expect(hook.result.current.state?.phase).toBe('ready');
    expect(hook.restart).not.toHaveBeenCalled();
  });

  it('cancels the pending restart when Later is chosen during preparation', async () => {
    let finish: (success: boolean) => void = () => {};
    install.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const hook = setup(true, false, false);
    let application: Promise<void>;
    act(() => {
      application = hook.result.current.apply();
    });
    act(() => hook.result.current.dismiss());
    await act(async () => {
      finish(true);
      await application;
    });
    expect(hook.result.current.state?.phase).toBe('ready');
    expect(hook.result.current.visible).toBe(false);
    expect(hook.restart).not.toHaveBeenCalled();
  });

  it('rechecks cancellation after verifying the prepared launcher', async () => {
    let finish: () => void = () => {};
    const restart = vi.fn();
    const verifyRestart = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const hook = renderHook(() =>
      useApplicationUpdate({
        idle: true,
        blocked: false,
        autoPrepare: false,
        projectRoot: '/project',
        settings,
        restart,
        verifyRestart,
      }),
    );
    act(() => updateEventEmitter.emit('update-available', info));
    let application: Promise<void>;
    act(() => {
      application = hook.result.current.apply();
    });
    await waitFor(() => expect(verifyRestart).toHaveBeenCalled());
    act(() => hook.result.current.dismiss());
    await act(async () => {
      finish();
      await application;
    });
    expect(restart).not.toHaveBeenCalled();
    expect(hook.result.current.state?.phase).toBe('ready');
  });

  it('prepares without ending a conversation whose recording is disabled', async () => {
    const restart = vi.fn();
    const hook = renderHook(() =>
      useApplicationUpdate({
        idle: true,
        blocked: false,
        autoPrepare: true,
        projectRoot: '/project',
        settings,
        restart,
        allowRestart: false,
      }),
    );
    act(() => updateEventEmitter.emit('update-available', info));
    await waitFor(() => expect(hook.result.current.state?.phase).toBe('ready'));
    expect(hook.result.current.state?.canRestart).toBe(false);
    await act(async () => {
      await hook.result.current.apply();
    });
    expect(restart).not.toHaveBeenCalled();
  });

  it('allows explicit preparation without recording or automatic updates', async () => {
    const restart = vi.fn();
    const hook = renderHook(() =>
      useApplicationUpdate({
        idle: true,
        blocked: false,
        autoPrepare: false,
        projectRoot: '/project',
        settings,
        restart,
        allowRestart: false,
      }),
    );
    act(() => updateEventEmitter.emit('update-available', info));
    expect(install).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.apply();
    });
    expect(install).toHaveBeenCalledOnce();
    expect(hook.result.current.state?.phase).toBe('ready');
    expect(restart).not.toHaveBeenCalled();
  });

  it('shows a failed preparation and retries only through an explicit action', async () => {
    install.mockResolvedValue(false);
    const hook = setup();
    await waitFor(() =>
      expect(hook.result.current.state?.phase).toBe('failed'),
    );
    expect(install).toHaveBeenCalledTimes(1);
    install.mockResolvedValue(true);
    await act(async () => {
      await hook.result.current.apply();
    });
    expect(install).toHaveBeenCalledTimes(2);
    expect(hook.restart).toHaveBeenCalledTimes(1);
  });

  it('does not invoke npm for an installation requiring a different manager', async () => {
    installation.mockReturnValue({
      packageManager: 'pnpm',
      updateCommand: 'pnpm add -g',
    });
    const hook = setup();
    expect(install).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.apply();
    });
    expect(install).not.toHaveBeenCalled();
    expect(hook.restart).toHaveBeenCalledOnce();
  });

  it('keeps managed worker sessions open when a different manager requires a manual update', async () => {
    vi.stubEnv('O1CODE_AGENT_VIEW_WORKER', '1');
    installation.mockReturnValue({
      packageManager: 'pnpm',
      updateCommand: 'pnpm add -g',
    });
    const hook = setup();
    expect(hook.result.current.state?.canRestart).toBe(false);
    await act(async () => {
      await hook.result.current.apply();
    });
    expect(hook.restart).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });
});
