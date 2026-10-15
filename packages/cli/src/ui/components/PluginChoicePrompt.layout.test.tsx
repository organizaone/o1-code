/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { Box } from 'ink';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { PluginChoicePrompt } from './PluginChoicePrompt.js';

const plugins = Array.from({ length: 8 }, (_, index) => ({
  name: `plugin-${index + 1}`,
  description: Array.from(
    { length: 20 },
    (_, line) => `Detail ${index + 1} line ${line + 1}.`,
  ).join('\n'),
}));

async function pressKey(
  stdin: ReturnType<typeof renderWithProviders>['stdin'],
  key: string,
) {
  await act(async () => {
    stdin.write(key);
  });
}

describe('PluginChoicePrompt terminal layout', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'keeps descriptions reachable inside a %i-row reservation',
    async (availableTerminalHeight) => {
      const onSelect = vi.fn();
      const onCancel = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <Box width={80}>
          <PluginChoicePrompt
            marketplaceName="catalog"
            plugins={plugins}
            terminalWidth={80}
            availableTerminalHeight={availableTerminalHeight}
            onSelect={onSelect}
            onCancel={onCancel}
          />
        </Box>,
      );
      expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      if (availableTerminalHeight >= 5) {
        expect(lastFrame()).toContain('Detail 1 line 1.');
        expect(lastFrame()).toContain('PgUp/PgDn');
        expect(lastFrame()).toContain('Enter');
        expect(lastFrame()).toContain('Escape');
      }
      const frames = [lastFrame() ?? ''];
      for (let page = 0; page < 20; page++) {
        await pressKey(stdin, '\u001b[6~');
        frames.push(lastFrame() ?? '');
      }
      for (let line = 1; line <= 20; line++) {
        expect(
          frames.some((frame) => frame.includes(`Detail 1 line ${line}.`)),
        ).toBe(true);
      }
      expect(lastFrame()).toContain('Detail 1 line 20.');
      expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      await pressKey(stdin, '\u001b[5~');
      expect(lastFrame()).not.toContain('Detail 1 line 20.');
      await pressKey(stdin, '\u001b[A');
      expect(lastFrame()).toContain('❯ plugin-8');
      await pressKey(stdin, '\r');
      expect(onSelect).toHaveBeenCalledWith('plugin-8');
      await pressKey(stdin, '\u001b');
      await vi.waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    },
  );

  it.each([24, 16])(
    'keeps selection, controls and borders inside an 80x%i terminal',
    async (rows) => {
      const onSelect = vi.fn();
      const { lastFrame, stdin } = renderWithProviders(
        <Box width={80}>
          <PluginChoicePrompt
            marketplaceName="catalog"
            plugins={plugins}
            terminalWidth={80}
            availableTerminalHeight={rows - 6}
            onSelect={onSelect}
            onCancel={vi.fn()}
          />
        </Box>,
      );
      const checkFrame = (selected: number) => {
        const frame = lastFrame() ?? '';
        expect(frame.split('\n').length).toBeLessThanOrEqual(rows - 6);
        expect(frame).toContain(`❯ plugin-${selected}`);
        expect(frame).toContain('Enter');
        expect(frame).toContain('Escape');
        expect(frame).toContain('╭');
        expect(frame).toContain('╰');
      };

      checkFrame(1);
      expect(lastFrame()).toContain('Detail 1 line 1.');
      for (let page = 0; page < 20; page++) {
        await pressKey(stdin, '\u001b[6~');
      }
      checkFrame(1);
      expect(lastFrame()).toContain('Detail 1 line 20.');
      await pressKey(stdin, '\u001b[5~');
      expect(lastFrame()).not.toContain('Detail 1 line 20.');

      await pressKey(stdin, '\u001b[A');
      checkFrame(8);
      expect(lastFrame()).toContain('Detail 8 line 1.');
      await pressKey(stdin, '\r');
      expect(onSelect).toHaveBeenCalledWith('plugin-8');
    },
  );

  it('keeps an empty catalog cancellable without selecting an item', async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <Box width={80}>
        <PluginChoicePrompt
          marketplaceName="empty"
          plugins={[]}
          terminalWidth={80}
          availableTerminalHeight={10}
          onSelect={onSelect}
          onCancel={onCancel}
        />
      </Box>,
    );
    await pressKey(stdin, '\u001b[A');
    await pressKey(stdin, '\r');
    expect(onSelect).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('Escape');
    expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(10);
    await pressKey(stdin, '\u001b');
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  });
});
