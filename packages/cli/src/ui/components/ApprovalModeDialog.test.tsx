/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { ApprovalMode } from '@organizaone/o1-code-core/config/approval-mode.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { ApprovalModeDialog } from './ApprovalModeDialog.js';
import { glyphs } from '../glyphs.js';

const terminal = vi.hoisted(() => ({ columns: 80, rows: 40 }));
vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => terminal,
}));

function createSettings(
  workspaceSettings: Record<string, unknown> = {},
): LoadedSettings {
  return new LoadedSettings(
    { path: '', settings: {}, originalSettings: {} },
    { path: '', settings: {}, originalSettings: {} },
    { path: '', settings: {}, originalSettings: {} },
    {
      path: '',
      settings: workspaceSettings,
      originalSettings: workspaceSettings,
    },
    true,
    new Set(),
  );
}

function frameHeight(frame: string): number {
  return frame.length === 0 ? 0 : frame.split('\n').length;
}

async function pressKey(
  stdin: ReturnType<typeof renderWithProviders>['stdin'],
  key: string,
) {
  await act(async () => {
    stdin.write(key);
  });
}

describe('ApprovalModeDialog', () => {
  beforeEach(() => {
    terminal.columns = 80;
  });
  it.each([6, 8, 10, 12])(
    'keeps the picker within %i rows',
    (availableTerminalHeight) => {
      const { lastFrame } = renderWithProviders(
        <ApprovalModeDialog
          settings={createSettings()}
          currentMode={ApprovalMode.DEFAULT}
          availableTerminalHeight={availableTerminalHeight}
          onSelect={vi.fn()}
        />,
      );
      expect(frameHeight(lastFrame() ?? '')).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
    },
  );

  it('uses content-sized height when plenty of rows are available', () => {
    const { lastFrame } = renderWithProviders(
      <ApprovalModeDialog
        settings={createSettings()}
        currentMode={ApprovalMode.DEFAULT}
        availableTerminalHeight={30}
        onSelect={vi.fn()}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frameHeight(frame)).toBeLessThan(20);
    expect(frame).toContain(
      'Require approval for file edits or shell commands',
    );
  });

  it('keeps the current mode visible when the picker scrolls', () => {
    const { lastFrame } = renderWithProviders(
      <ApprovalModeDialog
        settings={createSettings()}
        currentMode={ApprovalMode.YOLO}
        availableTerminalHeight={8}
        onSelect={vi.fn()}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('YOLO mode');
    expect(frame).toContain(glyphs().done);
    expect(frame).toContain('5/5');
  });

  it('updates help without changing the current-value marker or applying a mode', async () => {
    terminal.columns = 160;
    const onSelect = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <ApprovalModeDialog
        settings={createSettings()}
        currentMode={ApprovalMode.DEFAULT}
        availableTerminalHeight={30}
        onSelect={onSelect}
      />,
    );
    await vi.waitFor(() =>
      expect(lastFrame() ?? '').toContain('Require approval for file edits'),
    );
    await pressKey(stdin, '\x1b[B');
    await vi.waitFor(() =>
      expect(lastFrame() ?? '').toContain('Automatically approve file edits'),
    );
    const currentLine = (lastFrame() ?? '')
      .split('\n')
      .find((line) => line.includes('2. Ask permissions'));
    expect(currentLine).toContain(glyphs().done);
    expect(currentLine).not.toContain(glyphs().prompt);
    expect(onSelect).not.toHaveBeenCalled();
    await pressKey(stdin, '\r');
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
        SettingScope.User,
      ),
    );
  });

  it('puts help beside the list at 120 columns and below it in narrow terminals', () => {
    terminal.columns = 120;
    const wide = renderWithProviders(
      <ApprovalModeDialog
        settings={createSettings()}
        currentMode={ApprovalMode.DEFAULT}
        availableTerminalHeight={30}
        onSelect={vi.fn()}
      />,
    );
    const wideLines = (wide.lastFrame() ?? '').split('\n');
    const descriptionLine = wideLines.findIndex((line) =>
      line.includes('Require approval'),
    );
    const lastOptionLine = wideLines.findIndex((line) =>
      line.includes('5. YOLO'),
    );
    expect(descriptionLine).toBeLessThan(lastOptionLine);
    wide.unmount();
    terminal.columns = 60;
    const narrow = renderWithProviders(
      <ApprovalModeDialog
        settings={createSettings()}
        currentMode={ApprovalMode.DEFAULT}
        availableTerminalHeight={30}
        onSelect={vi.fn()}
      />,
    );
    const narrowLines = (narrow.lastFrame() ?? '').split('\n');
    expect(
      narrowLines.findIndex((line) => line.includes('Require approval')),
    ).toBeGreaterThan(
      narrowLines.findIndex((line) => line.includes('5. YOLO')),
    );
  });

  it('changes scope and preserves the highlighted mode until it is applied', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <ApprovalModeDialog
        settings={createSettings()}
        currentMode={ApprovalMode.DEFAULT}
        availableTerminalHeight={20}
        onSelect={onSelect}
      />,
    );
    await vi.waitFor(() =>
      expect(lastFrame() ?? '').toContain('Ask permissions'),
    );
    await pressKey(stdin, '\x1b[B');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('3/5'));
    await pressKey(stdin, '\t');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('Apply To'));
    await pressKey(stdin, '\x1b[B');
    await vi.waitFor(() => expect(lastFrame() ?? '').toContain('2/2'));
    await pressKey(stdin, '\r');
    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Workspace Settings');
      expect(frame).toContain('3/5');
      expect(frame).not.toContain('Apply To');
    });
    expect(onSelect).not.toHaveBeenCalled();
    await pressKey(stdin, '\r');
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
        SettingScope.Workspace,
      ),
    );
  });

  it.each([8, 10, 12])(
    'keeps workspace precedence visible within %i rows',
    (availableTerminalHeight) => {
      const { lastFrame } = renderWithProviders(
        <ApprovalModeDialog
          settings={createSettings({
            tools: { approvalMode: ApprovalMode.YOLO },
          })}
          currentMode={ApprovalMode.DEFAULT}
          availableTerminalHeight={availableTerminalHeight}
          onSelect={vi.fn()}
        />,
      );
      const frame = lastFrame() ?? '';
      expect(frameHeight(frame)).toBeLessThanOrEqual(availableTerminalHeight);
      expect(frame).toContain('Workspace approval mode exists');
      expect(frame).toContain('User-level');
      expect(frame).toContain('no effect');
    },
  );

  it('cancels without applying a value', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <ApprovalModeDialog
        settings={createSettings()}
        currentMode={ApprovalMode.DEFAULT}
        availableTerminalHeight={20}
        onSelect={onSelect}
      />,
    );
    await vi.waitFor(() =>
      expect(lastFrame() ?? '').toContain('Ask permissions'),
    );
    await pressKey(stdin, '\x1b');
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(undefined, SettingScope.User),
    );
  });
});
