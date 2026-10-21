/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { useThemeCommand } from './useThemeCommand.js';
import { themeManager } from '../themes/theme-manager.js';
import { MessageType } from '../types.js';
import type { Config } from '@organizaone/o1-code-core';
import process from 'node:process';
import { notifyAgentSessionReattach } from '../../agent-view/session-reattach.js';

describe('useThemeCommand', () => {
  const previousNoColor = process.env['NO_COLOR'];

  beforeEach(() => {
    vi.restoreAllMocks();
    themeManager.setActiveTheme('O1-Code Dark');
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (previousNoColor === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = previousNoColor;
  });

  it('records the NO_COLOR feedback for transcript reconstruction', () => {
    process.env['NO_COLOR'] = '1';
    const recordSlashCommand = vi.fn();
    const addItem = vi.fn();
    const config = {
      getChatRecordingService: () => ({ recordSlashCommand }),
    } as unknown as Config;
    const settings = {
      merged: {},
      user: { settings: {} },
      workspace: { settings: {} },
    } as unknown as LoadedSettings;

    const { result } = renderHook(() =>
      useThemeCommand(settings, vi.fn(), addItem, null, config),
    );

    act(() => result.current.openThemeDialog());

    const feedbackItem = {
      type: MessageType.INFO,
      text: 'Theme configuration unavailable due to NO_COLOR env variable.',
    };
    expect(addItem).toHaveBeenCalledWith(feedbackItem, expect.any(Number));
    expect(recordSlashCommand).toHaveBeenCalledWith({
      phase: 'result',
      rawCommand: '/theme',
      outputHistoryItems: [feedbackItem],
    });
    expect(result.current.isThemeDialogOpen).toBe(false);
  });

  it('restores previous theme on cancel (Esc)', () => {
    const setValue =
      vi.fn<(scope: SettingScope, key: string, value: unknown) => void>();
    const settings = {
      merged: { ui: { theme: 'O1-Code Dark' } },
      user: { settings: { ui: {} } },
      workspace: { settings: { ui: {} } },
      setValue,
    } as unknown as LoadedSettings;

    const setThemeError = vi.fn<(error: string | null) => void>();
    const addItem = vi.fn();

    const { result } = renderHook(() =>
      useThemeCommand(settings, setThemeError, addItem, null),
    );

    act(() => {
      themeManager.setActiveTheme('Dracula');
      result.current.openThemeDialog();
      result.current.handleThemeHighlight('Default');
    });
    expect(themeManager.getActiveTheme().name).toBe('Default');

    act(() => {
      result.current.handleThemeSelect(undefined, SettingScope.User);
    });

    expect(themeManager.getActiveTheme().name).toBe('Dracula');
    expect(setValue).not.toHaveBeenCalled();
    expect(result.current.isThemeDialogOpen).toBe(false);
  });

  it('refreshes the current preference on reattach without restoring a session theme', () => {
    const merged = { ui: { theme: 'O1-Code Dark' } };
    const settings = {
      merged,
      reloadScopesFromDiskAtomically: vi.fn(() => {
        merged.ui.theme = 'O1-Code Light';
        return true;
      }),
    } as unknown as LoadedSettings;
    const refresh = vi.fn();
    const mounted = renderHook(() =>
      useThemeCommand(settings, vi.fn(), vi.fn(), null, undefined, refresh),
    );
    act(() => notifyAgentSessionReattach());
    expect(settings.reloadScopesFromDiskAtomically).toHaveBeenCalled();
    expect(themeManager.getActiveTheme().name).toBe('O1-Code Light');
    expect(refresh).toHaveBeenCalledOnce();
    act(() => notifyAgentSessionReattach());
    expect(refresh).toHaveBeenCalledOnce();
    mounted.unmount();
    act(() => notifyAgentSessionReattach());
    expect(refresh).toHaveBeenCalledOnce();
  });
});
