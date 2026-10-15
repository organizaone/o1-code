/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Pins a behavior of patches/ink+7.0.3.patch: on the alternate screen, any
// terminal resize makes the next frame a full repaint. Ink alone clears its
// line cache only when the width shrinks, and the incremental renderer would
// otherwise never rewrite rows whose text did not change after the terminal
// re-laid them out.

import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { installTerminalResizeReflow } from './terminal-resize-reflow.js';
import { afterEach, describe, expect, it } from 'vitest';
import { Box, render, Text } from 'ink';

class FakeStdout extends EventEmitter {
  isTTY = true;
  columns = 80;
  rows = 24;
  writes: string[] = [];
  write = (chunk: string | Uint8Array): boolean => {
    this.writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
}

class FakeStdin extends EventEmitter {
  isTTY = false;
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read() {
    return null;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('Ink alternate-screen resize repaint (patched)', () => {
  let instance: ReturnType<typeof render> | undefined;

  afterEach(() => {
    instance?.unmount();
    instance = undefined;
  });

  async function mount() {
    const stdout = new FakeStdout();
    instance = render(<Text>hello resize</Text>, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
      stderr: new FakeStdout() as unknown as NodeJS.WriteStream,
      debug: false,
      exitOnCtrlC: false,
      patchConsole: false,
      interactive: true,
      alternateScreen: true,
      incrementalRendering: true,
    });
    await settle();
    expect(stdout.writes.join('')).toContain('hello resize');
    stdout.writes = [];
    return stdout;
  }

  it('repaints the whole frame when the terminal grows in rows', async () => {
    const stdout = await mount();
    stdout.rows = 30;
    stdout.emit('resize');
    await settle();
    expect(stdout.writes.join('')).toContain('hello resize');
  });

  it.each([20, 24])(
    'preserves a full-width border in a %s-row frame using absolute rows',
    async (height) => {
      const stdout = new FakeStdout();
      const frame = (text: string) => (
        <Box width={80} height={height} borderStyle="single">
          <Text>{text}</Text>
        </Box>
      );
      instance = render(frame('before'), {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
        stderr: new FakeStdout() as unknown as NodeJS.WriteStream,
        debug: false,
        exitOnCtrlC: false,
        patchConsole: false,
        interactive: true,
        alternateScreen: true,
        incrementalRendering: true,
      });
      await instance.waitUntilRenderFlush();
      stdout.writes = [];
      instance.rerender(frame('after'));
      await instance.waitUntilRenderFlush();
      const update = stdout.writes.join('');
      expect(update).toContain('\u001B[2;1H\u001B[2K│after');
      expect(update).not.toContain('\u001B[K');
      expect(update).not.toContain('before');
      expect(update).not.toContain('\n');
    },
  );

  it('repaints the whole frame when the terminal grows in columns', async () => {
    const stdout = await mount();
    stdout.columns = 120;
    stdout.emit('resize');
    await settle();
    expect(stdout.writes.join('')).toContain('hello resize');
  });
});

describe('wake recovery with the real renderer and terminal', () => {
  const { Terminal } = createRequire(import.meta.url)(
    '@xterm/headless',
  ) as typeof import('@xterm/headless');

  it.each([true, false])(
    'preserves the current frame across wake and unchanged updates (incremental=%s)',
    async (incrementalRendering) => {
      const stdout = new FakeStdout();
      stdout.columns = 30;
      stdout.rows = 12;
      const terminal = new Terminal({
        cols: 30,
        rows: 12,
        allowProposedApi: true,
        convertEol: true,
      });
      let instance: ReturnType<typeof render> | undefined;
      const reflow = installTerminalResizeReflow(
        stdout as unknown as NodeJS.WriteStream,
        {
          virtualViewport: true,
          repaint: () => instance?.repaint(),
        },
      );
      let consumed = 0;
      const flush = async () => {
        await instance?.waitUntilRenderFlush();
        for (const output of stdout.writes.slice(consumed)) {
          await new Promise<void>((resolve) => terminal.write(output, resolve));
        }
        consumed = stdout.writes.length;
      };
      const snapshot = () =>
        Array.from(
          { length: terminal.rows },
          (_, row) =>
            terminal.buffer.active.getLine(row)?.translateToString(true) ?? '',
        );
      const frame = (label: string) => (
        <Box width="100%" height={12} borderStyle="single">
          <Text>{label}</Text>
        </Box>
      );
      try {
        instance = render(frame('initial'), {
          stdout: stdout as unknown as NodeJS.WriteStream,
          stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
          stderr: new FakeStdout() as unknown as NodeJS.WriteStream,
          exitOnCtrlC: false,
          patchConsole: false,
          interactive: true,
          alternateScreen: true,
          incrementalRendering,
        });
        await flush();
        for (const label of ['initial', 'second choice', 'current choice']) {
          instance.rerender(frame(label));
          await flush();
          const before = snapshot();
          expect(before[0]).toBe('┌' + '─'.repeat(28) + '┐');
          expect(before[1]).toBe('│' + label.padEnd(28) + '│');
          reflow.repaint?.();
          await flush();
          expect(snapshot()).toEqual(before);
          instance.rerender(frame(label));
          await flush();
          expect(snapshot()).toEqual(before);
        }
        for (const columns of [24, 40, 30]) {
          terminal.resize(columns, 12);
          stdout.columns = columns;
          // Wake can arrive before the queued terminal resize notification.
          reflow.repaint?.();
          await flush();
          expect(snapshot()[0]).toBe('┌' + '─'.repeat(columns - 2) + '┐');
          expect(snapshot()[1]).toBe(
            '│' + 'current choice'.padEnd(columns - 2) + '│',
          );
          stdout.emit('resize');
          await flush();
          expect(snapshot()[0]).toBe('┌' + '─'.repeat(columns - 2) + '┐');
        }
      } finally {
        instance?.unmount();
        reflow.restore();
        terminal.dispose();
      }
    },
  );
});
