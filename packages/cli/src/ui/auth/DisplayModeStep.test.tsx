/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { DisplayModeStep } from './DisplayModeStep.js';

const terminal = vi.hoisted(() => ({ columns: 120, rows: 40 }));
vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => terminal,
}));

describe('<DisplayModeStep />', () => {
  beforeEach(() => {
    terminal.columns = 120;
  });

  const press = async (
    stdin: { write: (data: string) => void },
    key: string,
  ) => {
    await act(async () => {
      stdin.write(key);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  };

  it('offers Detailed, preselected, and Summary with the question', () => {
    const frame =
      renderWithProviders(<DisplayModeStep onChoose={vi.fn()} />).lastFrame() ??
      '';
    expect(frame).toContain('Account connected.');
    expect(frame).toContain("How do you want to follow the agent's work?");
    expect(frame).toContain('Detailed');
    expect(frame).toContain('as today');
    expect(frame).toContain('Summary');
    expect(frame).toContain('/settings › Display Mode');
    expect(frame).toContain('esc skip');
  });

  it('confirms Detailed with enter', async () => {
    const onChoose = vi.fn();
    const { stdin } = renderWithProviders(
      <DisplayModeStep onChoose={onChoose} />,
    );
    await press(stdin, '\r');
    expect(onChoose).toHaveBeenCalledWith('detailed');
  });

  it('previews the highlighted mode and confirms Summary', async () => {
    const onChoose = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <DisplayModeStep onChoose={onChoose} />,
    );
    expect(lastFrame()).toContain('PREVIEW');
    expect(lastFrame()).toContain('npm test -- src/auth --run');

    await press(stdin, '\u001b[B');
    expect(lastFrame()).toContain('Adjust the e-mail validation');
    expect(lastFrame()).not.toContain('npm test -- src/auth --run');

    await press(stdin, '\r');
    expect(onChoose).toHaveBeenCalledWith('summary');
  });

  it('drops the preview under 100 columns', () => {
    terminal.columns = 90;
    const frame =
      renderWithProviders(<DisplayModeStep onChoose={vi.fn()} />).lastFrame() ??
      '';
    expect(frame).not.toContain('PREVIEW');
    expect(frame).toContain('Summary');
  });
});
