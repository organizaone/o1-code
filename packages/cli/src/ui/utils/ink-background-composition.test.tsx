/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRequire } from 'node:module';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Box, foregroundContext, Text } from 'ink';
import { render } from 'ink-testing-library';

const originalColorEnv = vi.hoisted(() => {
  const original = {
    force: process.env['FORCE_COLOR'],
    noColor: process.env['NO_COLOR'],
  };
  process.env['FORCE_COLOR'] = '3';
  delete process.env['NO_COLOR'];
  return original;
});
afterAll(() => {
  if (originalColorEnv.force === undefined) delete process.env['FORCE_COLOR'];
  else process.env['FORCE_COLOR'] = originalColorEnv.force;
  if (originalColorEnv.noColor === undefined) delete process.env['NO_COLOR'];
  else process.env['NO_COLOR'] = originalColorEnv.noColor;
});
const { Terminal } = createRequire(import.meta.url)(
  '@xterm/headless',
) as typeof import('@xterm/headless');

describe('painted viewport', () => {
  it('retains its background behind borders and preserves explicitly colored children', async () => {
    const { lastFrame, unmount } = render(
      <Box backgroundColor="#f7f9fc" width={20} height={4}>
        <Box borderStyle="single" borderColor="#2b5bd7" width={12}>
          <Text backgroundColor="#dcf2e4" color="#162033">
            text
          </Text>
        </Box>
      </Box>,
    );
    const terminal = new Terminal({
      cols: 20,
      rows: 5,
      allowProposedApi: true,
    });
    await new Promise<void>((resolve) =>
      terminal.write((lastFrame() ?? '').replace(/\n/g, '\r\n'), resolve),
    );
    const border = terminal.buffer.active.getLine(0)?.getCell(0);
    const content = terminal.buffer.active.getLine(1)?.getCell(1);
    expect(border?.getChars()).toBe('┌');
    expect(border?.getBgColor()).toBe(0xf7f9fc);
    expect(content?.getChars()).toBe('t');
    expect(content?.getBgColor()).toBe(0xdcf2e4);
    terminal.dispose();
    unmount();
  });

  it('uses the viewport foreground without overriding nested semantic colors', async () => {
    const { lastFrame, unmount } = render(
      <foregroundContext.Provider value="#162033">
        <Box>
          <Text>plain </Text>
          <Text color="#c02d2d">
            error <Text>detail</Text>
          </Text>
        </Box>
      </foregroundContext.Provider>,
    );
    const terminal = new Terminal({
      cols: 40,
      rows: 2,
      allowProposedApi: true,
    });
    await new Promise<void>((resolve) =>
      terminal.write(lastFrame() ?? '', resolve),
    );
    const row = terminal.buffer.active.getLine(0)!;
    expect(row.getCell(0)?.getFgColor()).toBe(0x162033);
    expect(row.getCell(6)?.getFgColor()).toBe(0xc02d2d);
    expect(row.getCell(12)?.getFgColor()).toBe(0xc02d2d);
    terminal.dispose();
    unmount();
  });
});
