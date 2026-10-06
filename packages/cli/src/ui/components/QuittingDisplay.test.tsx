/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render, cleanup } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const key = (sequence: string, paste = false): Key => ({
  name: sequence === '\r' ? 'return' : sequence,
  sequence,
  paste,
  ctrl: false,
  meta: false,
  shift: false,
});
const press = async (sequence: string, paste = false) => {
  await act(async () => {
    vi.mocked(useKeypress).mock.calls.at(-1)?.[0](key(sequence, paste));
  });
};

describe('QuittingDisplay', () => {
  const setValue = vi.fn();
  const onExit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setValue.mockReset();
    vi.mocked(useSettings).mockReturnValue({
      setValue,
    } as unknown as LoadedSettings);
  });
  afterEach(cleanup);

  it('waits for a key and exits only once without changing the preference', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    expect(onExit).not.toHaveBeenCalled();
    await press('x');
    await press('\r');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(setValue).not.toHaveBeenCalled();
  });

  it('toggles the checkbox without exiting and saves it when confirming exit', async () => {
    const { lastFrame } = render(<QuittingDisplay onExit={onExit} />);
    await press(' ');
    expect(lastFrame()).toContain('[x]');
    expect(onExit).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    await press('\r');
    expect(setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'ui.showSessionSummary',
      false,
      undefined,
      { throwOnWriteFailure: true },
    );
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not save the preference after unchecking the checkbox', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await press(' ');
    await press(' ');
    await press('\r');
    expect(setValue).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('ignores pasted input instead of exiting', async () => {
    render(<QuittingDisplay onExit={onExit} />);
    await press('pasted text', true);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('allows exit without saving after a preference write failure', async () => {
    setValue.mockImplementation(() => {
      throw new Error('disk full');
    });
    const { lastFrame } = render(<QuittingDisplay onExit={onExit} />);
    await press(' ');
    await press('\r');
    expect(onExit).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('[ ]');
    await press('\r');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(setValue).toHaveBeenCalledTimes(1);
  });

  it('toggles the checkbox with the mouse without exiting', async () => {
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
    expect(lastFrame()).toContain('[x]');
    expect(onExit).not.toHaveBeenCalled();
  });
});
