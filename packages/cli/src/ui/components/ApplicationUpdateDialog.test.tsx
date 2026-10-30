/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, withProviders } from '../../test-utils/render.js';
import type { ApplicationUpdateState } from '../hooks/use-application-update.js';
import { ApplicationUpdateDialog } from './ApplicationUpdateDialog.js';

const terminal = vi.hoisted(() => ({ columns: 80, rows: 24 }));
vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => terminal,
}));

function updateState(
  changes: Partial<ApplicationUpdateState> = {},
): ApplicationUpdateState {
  return {
    info: {
      message: 'An update is available',
      update: {
        current: '0.21.10',
        latest: '0.21.12',
        type: 'patch',
        name: '@organizaone/o1-code',
      },
    },
    phase: 'ready',
    canPrepare: true,
    canRestart: true,
    instructions: [],
    ...changes,
  };
}

async function press(
  stdin: ReturnType<typeof renderWithProviders>['stdin'],
  key: string,
) {
  await act(async () => {
    stdin.write(key);
  });
}

describe('ApplicationUpdateDialog', () => {
  beforeEach(() => {
    terminal.columns = 80;
    terminal.rows = 24;
  });

  it('distinguishes a prepared version from the running version', () => {
    const { lastFrame } = renderWithProviders(
      <ApplicationUpdateDialog
        state={updateState()}
        availableHeight={16}
        onApply={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Ready to restart');
    expect(frame).toContain('0.21.10');
    expect(frame).toContain('0.21.12');
    expect(frame).toContain('Restart and update');
    expect(frame).not.toContain('Update successful');
  });

  it('applies only the selected action and dismisses with Escape', async () => {
    const onApply = vi.fn();
    const onLater = vi.fn();
    const { stdin } = renderWithProviders(
      <ApplicationUpdateDialog
        state={updateState()}
        availableHeight={16}
        onApply={onApply}
        onLater={onLater}
      />,
    );
    await press(stdin, '\r');
    await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    await press(stdin, '\x1b[B');
    await press(stdin, '\r');
    await vi.waitFor(() => expect(onLater).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledTimes(1);
    await press(stdin, '\x1b');
    await vi.waitFor(() => expect(onLater).toHaveBeenCalledTimes(2));
  });

  it.each(['preparing', 'restarting'] as const)(
    'does not offer an apply action while %s',
    async (phase) => {
      const onApply = vi.fn();
      const onLater = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <ApplicationUpdateDialog
          state={updateState({ phase })}
          availableHeight={12}
          onApply={onApply}
          onLater={onLater}
        />,
      );
      expect(lastFrame() ?? '').not.toContain('Restart and update');
      expect(lastFrame() ?? '').not.toContain('Update and restart');
      await press(stdin, '\r');
      expect(onApply).not.toHaveBeenCalled();
      await press(stdin, '\x1b');
      await vi.waitFor(() => expect(onLater).toHaveBeenCalled());
    },
  );

  it.each([6, 8, 12])(
    'keeps actions and the version transition within %i rows on a narrow terminal',
    (availableHeight) => {
      terminal.columns = 40;
      const { lastFrame } = renderWithProviders(
        <ApplicationUpdateDialog
          state={updateState()}
          availableHeight={availableHeight}
          onApply={vi.fn()}
          onLater={vi.fn()}
        />,
      );
      const frame = lastFrame() ?? '';
      expect(frame.split('\n').length).toBeLessThanOrEqual(availableHeight);
      expect(frame.split('\n').every((line) => [...line].length <= 40)).toBe(
        true,
      );
      expect(frame).toContain('Restart and update');
      expect(frame).toContain('Later');
      expect(frame).toContain('0.21.10');
      expect(frame).toContain('0.21.12');
    },
  );

  it('keeps every manual instruction reachable without offering restart', async () => {
    terminal.columns = 40;
    const onApply = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <ApplicationUpdateDialog
        state={updateState({
          phase: 'failed',
          canRestart: false,
          canPrepare: false,
          error: 'A download error occurred',
          instructions: Array.from({ length: 24 }, (_, index) =>
            index === 23 ? 'FINAL RECOVERY STEP' : `Recovery step ${index + 1}`,
          ),
        })}
        availableHeight={8}
        onApply={onApply}
        onLater={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('PgUp/PgDn');
    await press(stdin, '\x1b[6~');
    await vi.waitFor(() =>
      expect(lastFrame() ?? '').toContain('Recovery step'),
    );
    await press(stdin, '\x1b[F');
    await vi.waitFor(() =>
      expect(lastFrame() ?? '').toContain('FINAL RECOVERY STEP'),
    );
    expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(8);
    await press(stdin, '\r');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('changes the primary action as the same update becomes prepared', () => {
    const props = { availableHeight: 16, onApply: vi.fn(), onLater: vi.fn() };
    const { lastFrame, rerender } = renderWithProviders(
      <ApplicationUpdateDialog
        {...props}
        state={updateState({ phase: 'available' })}
      />,
    );
    expect(lastFrame() ?? '').toContain('Update and restart');
    rerender(
      withProviders(
        <ApplicationUpdateDialog {...props} state={updateState()} />,
      ),
    );
    expect(lastFrame() ?? '').toContain('Restart and update');
  });

  it('offers preparation without restart when the conversation cannot be resumed', async () => {
    const onApply = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <ApplicationUpdateDialog
        state={updateState({ phase: 'available', canRestart: false })}
        availableHeight={16}
        onApply={onApply}
        onLater={vi.fn()}
      />,
    );
    expect(lastFrame() ?? '').toContain('Prepare update');
    expect(lastFrame() ?? '').not.toContain('Update and restart');
    await press(stdin, '\r');
    expect(onApply).toHaveBeenCalledOnce();
  });
});
