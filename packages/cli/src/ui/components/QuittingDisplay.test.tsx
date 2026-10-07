/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from 'ink-testing-library';
import { QuittingDisplay } from './QuittingDisplay.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { useMouseEvents } from '../hooks/useMouseEvents.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { SettingScope, type LoadedSettings } from '../../config/settings.js';

vi.mock('../hooks/useKeypress.js', () => ({ useKeypress: vi.fn() }));
vi.mock('../hooks/useMouseEvents.js', () => ({ useMouseEvents: vi.fn() }));
vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ rows: 40, columns: 120 }),
}));
vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: () => ({ quittingMessages: [], mainAreaWidth: 120 }),
}));
vi.mock('../contexts/SettingsContext.js', () => ({ useSettings: vi.fn() }));
vi.mock('./HistoryItemDisplay.js', () => ({ HistoryItemDisplay: () => null }));
vi.mock('../utils/mouse-hit.js', () => ({ findElementAtMouseEvent: () => 0 }));

const press = async (sequence: string, paste = false) => {
  const key: Key = {
    name:
      sequence === '\r' ? 'return' : sequence === '\x1b[B' ? 'down' : sequence,
    sequence,
    paste,
    ctrl: false,
    meta: false,
    shift: false,
  };
  await act(async () => {
    vi.mocked(useKeypress).mock.calls.at(-1)?.[0](key);
  });
};

describe('QuittingDisplay', () => {
  const setValues = vi.fn();
  const onExit = vi.fn();
  const settings = (ui = {}) => {
    vi.mocked(useSettings).mockReturnValue({
      merged: { ui },
      setValues,
    } as unknown as LoadedSettings);
  };
  const advance = async (milliseconds: number) => {
    await act(async () => {
      vi.advanceTimersByTime(milliseconds);
    });
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setValues.mockReset();
    settings();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('closes automatically after five seconds without saving preferences', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await advance(4900);
    expect(onExit).not.toHaveBeenCalled();
    await advance(100);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(setValues).not.toHaveBeenCalled();
  });

  it('pauses on a key and then requires Enter to exit exactly once', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await press('x');
    await advance(30000);
    expect(onExit).not.toHaveBeenCalled();
    await press('y');
    expect(onExit).not.toHaveBeenCalled();
    await press('\r');
    await press('\r');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(setValues).not.toHaveBeenCalled();
  });

  it('pauses instead of closing when Enter is the first key', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await press('\r');
    expect(onExit).not.toHaveBeenCalled();
    await press('\r');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('makes the preferences exclusive and saves only after confirmation', async () => {
    const { lastFrame } = render(<QuittingDisplay onExit={onExit} />);
    await press(' ');
    await press('\x1b[B');
    await press(' ');
    expect(lastFrame()).toContain('[ ] Always keep the exit summary open');
    expect(lastFrame()).toContain('[x] Do not show again');
    expect(setValues).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    await press('\r');
    expect(setValues).toHaveBeenCalledWith([
      { scope: SettingScope.User, key: 'ui.showSessionSummary', value: false },
      {
        scope: SettingScope.User,
        key: 'ui.keepSessionSummaryOpen',
        value: false,
      },
    ]);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('persists keeping the summary open and ensures it is enabled', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await press(' ');
    await press('\r');
    expect(setValues).toHaveBeenCalledWith([
      { scope: SettingScope.User, key: 'ui.showSessionSummary', value: true },
      {
        scope: SettingScope.User,
        key: 'ui.keepSessionSummaryOpen',
        value: true,
      },
    ]);
  });

  it('does not save an unchecked draft', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await press(' ');
    await press(' ');
    await press('\r');
    expect(setValues).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('ignores pasted input while the countdown continues', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await press('pasted text', true);
    await advance(5000);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('allows exit without saving after a write failure even in keep-open mode', async () => {
    settings({ keepSessionSummaryOpen: true });
    setValues.mockImplementation(() => {
      throw new Error('disk full');
    });
    const { lastFrame } = render(<QuittingDisplay onExit={onExit} />);
    await press('\r');
    expect(onExit).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('Press Enter to exit without saving.');
    await press('\r');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(setValues).toHaveBeenCalledTimes(1);
  });

  it('uses a custom timeout', async () => {
    settings({ sessionSummaryTimeoutSeconds: 2 });
    render(<QuittingDisplay onExit={onExit} />);
    await advance(1900);
    expect(onExit).not.toHaveBeenCalled();
    await advance(100);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, NaN, Infinity])(
    'uses the default for an invalid timeout: %s',
    async (value) => {
      settings({ sessionSummaryTimeoutSeconds: value });
      render(<QuittingDisplay onExit={onExit} />);
      await advance(5000);
      expect(onExit).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the summary visible when configured to do so', async () => {
    settings({ keepSessionSummaryOpen: true });
    render(<QuittingDisplay onExit={onExit} />);
    await advance(30000);
    expect(onExit).not.toHaveBeenCalled();
    await press('\r');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('pauses and selects a preference with the mouse', async () => {
    const { lastFrame } = render(<QuittingDisplay onExit={onExit} />);
    await act(async () => {
      vi.mocked(useMouseEvents).mock.calls.at(-1)?.[0]({
        name: 'left-press',
        button: 'left',
        col: 1,
        row: 1,
        shift: false,
        meta: false,
        ctrl: false,
      });
    });
    expect(lastFrame()).toContain('[x] Always keep the exit summary open');
    await advance(30000);
    expect(onExit).not.toHaveBeenCalled();
    await press('\r');
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
