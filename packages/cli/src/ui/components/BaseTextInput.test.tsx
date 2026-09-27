/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import type { DOMElement } from 'ink';
import {
  BaseTextInput,
  defaultRenderLine,
  getAbsolutePosition,
  getPhysicalCursorPosition,
} from './BaseTextInput.js';
import { useKeypress } from '../hooks/useKeypress.js';
import type { Key } from '../hooks/useKeypress.js';
import type { TextBuffer } from './shared/text-buffer.js';
import { renderSoftwareCursor } from '../utils/software-cursor.js';
import chalk from 'chalk';

const mockSetCursorPosition = vi.hoisted(() => vi.fn());
const mockUseBoxMetrics = vi.hoisted(() =>
  vi.fn(() => ({
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    hasMeasured: true,
  })),
);

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useBoxMetrics: mockUseBoxMetrics,
    useCursor: () => ({
      setCursorPosition: mockSetCursorPosition,
    }),
  };
});

const terminalShowsInputCursor = vi.hoisted(() => vi.fn(() => false));
vi.mock('../utils/software-cursor.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/software-cursor.js')>()),
  terminalShowsInputCursor,
}));

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

const mockedUseKeypress = vi.mocked(useKeypress);

function makeKey(overrides: Partial<Key>): Key {
  return {
    name: '',
    ctrl: false,
    meta: false,
    shift: false,
    paste: false,
    sequence: '',
    ...overrides,
  };
}

function createBuffer() {
  return {
    text: '',
    viewportVisualLines: [''],
    visualCursor: [0, 0],
    visualScrollRow: 0,
    setText: vi.fn(),
    newline: vi.fn(),
    move: vi.fn(),
    killLineRight: vi.fn(),
    killLineLeft: vi.fn(),
    deleteWordLeft: vi.fn(),
    openInExternalEditor: vi.fn(),
    backspace: vi.fn(),
    handleInput: vi.fn(),
  } as unknown as TextBuffer;
}

function createElement(
  top: number,
  left: number,
  parentNode?: DOMElement,
): DOMElement {
  return {
    yogaNode: {
      getComputedLayout: () => ({ top, left }),
    },
    parentNode,
  } as unknown as DOMElement;
}

function captureKeypressHandler(): (key: Key) => void {
  const calls = mockedUseKeypress.mock.calls;
  if (calls.length === 0) {
    throw new Error('useKeypress was not called');
  }
  return calls[calls.length - 1]![0] as (key: Key) => void;
}

describe('BaseTextInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoxMetrics.mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      hasMeasured: true,
    });
  });

  it('does not type the render-mode shortcut into the buffer', () => {
    const buffer = createBuffer();

    render(<BaseTextInput buffer={buffer} onSubmit={vi.fn()} />);

    const handler = captureKeypressHandler();
    handler(makeKey({ name: 'm', meta: true, sequence: 'µ' }));

    expect(buffer.handleInput).not.toHaveBeenCalled();
  });

  it('still passes pasted µ text through to the buffer', () => {
    const buffer = createBuffer();

    render(<BaseTextInput buffer={buffer} onSubmit={vi.fn()} />);

    const handler = captureKeypressHandler();
    const pastedKey = makeKey({ sequence: 'µ', paste: true });
    handler(pastedKey);

    expect(buffer.handleInput).toHaveBeenCalledWith(pastedKey);
  });

  it('passes typed µ text through to the buffer', () => {
    const buffer = createBuffer();

    render(<BaseTextInput buffer={buffer} onSubmit={vi.fn()} />);

    const handler = captureKeypressHandler();
    const typedKey = makeKey({ name: 'µ', sequence: 'µ' });
    handler(typedKey);

    expect(buffer.handleInput).toHaveBeenCalledWith(typedKey);
  });

  it('hides the physical cursor when showCursor is false', () => {
    const buffer = createBuffer();

    render(
      <BaseTextInput buffer={buffer} onSubmit={vi.fn()} showCursor={false} />,
    );

    expect(mockSetCursorPosition).toHaveBeenCalledWith(undefined);
  });

  it('leaves cursor cleanup to the useCursor hook', () => {
    const buffer = createBuffer();
    const { unmount } = render(
      <BaseTextInput buffer={buffer} onSubmit={vi.fn()} />,
    );

    mockSetCursorPosition.mockClear();
    unmount();

    expect(mockSetCursorPosition).not.toHaveBeenCalled();
  });

  it('draws no cursor on the placeholder where the terminal shows it', () => {
    terminalShowsInputCursor.mockReturnValue(true);
    const level = chalk.level;
    chalk.level = 3;
    try {
      const { lastFrame } = render(
        <BaseTextInput
          buffer={createBuffer()}
          onSubmit={vi.fn()}
          placeholder="Type here"
        />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Type here');
      expect(frame).not.toContain('\u001b[4m');
      expect(frame).not.toContain('48;2;');
    } finally {
      chalk.level = level;
      terminalShowsInputCursor.mockReturnValue(false);
    }
  });

  it('draws a rounded box around the prompt and the text', () => {
    const buffer = {
      ...createBuffer(),
      text: 'hello',
      viewportVisualLines: ['hello'],
    } as unknown as TextBuffer;
    const { lastFrame } = render(
      <BaseTextInput buffer={buffer} onSubmit={vi.fn()} />,
    );
    const lines = (lastFrame() ?? '').split('\n');
    expect(lines[0]!.startsWith('╭')).toBe(true);
    expect(lines[1]!.startsWith('│')).toBe(true);
    expect(lines[1]).toContain('hello');
    expect(lines[lines.length - 1]!.startsWith('╰')).toBe(true);
  });

  it('keeps the same height when a corner label appears', () => {
    const rows = (label?: string) =>
      (
        render(
          <BaseTextInput
            buffer={createBuffer()}
            onSubmit={vi.fn()}
            topRightLabel={label}
          />,
        ).lastFrame() ?? ''
      ).split('\n');
    const withLabel = rows('my-session');
    expect(withLabel).toHaveLength(rows().length);
    expect(withLabel[0]!.startsWith('╭')).toBe(true);
    expect(withLabel[0]).toContain(' my-session ');
    expect(withLabel[0]!.trimEnd().endsWith('╮')).toBe(true);
  });

  it('counts lines and shows the send keys for a multi-line input', () => {
    const buffer = {
      ...createBuffer(),
      text: 'one two three',
      allVisualLines: ['one', 'two', 'three'],
      viewportVisualLines: ['one', 'two', 'three'],
    } as unknown as TextBuffer;
    const { lastFrame } = render(
      <BaseTextInput buffer={buffer} onSubmit={vi.fn()} />,
    );
    expect(lastFrame()).toContain(
      '3 lines · enter sends · shift+enter new line',
    );
  });

  it('says how many lines are hidden above the visible ones', () => {
    const all = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`);
    const buffer = {
      ...createBuffer(),
      text: all.join(' '),
      allVisualLines: all,
      viewportVisualLines: all.slice(3),
      visualScrollRow: 3,
      visualCursor: [8, 6],
    } as unknown as TextBuffer;
    const { lastFrame } = render(
      <BaseTextInput buffer={buffer} onSubmit={vi.fn()} />,
    );
    expect(lastFrame()).toContain('3 lines above');
  });

  it('shows neither for a single line', () => {
    const buffer = {
      ...createBuffer(),
      text: 'hi',
      allVisualLines: ['hi'],
      viewportVisualLines: ['hi'],
    } as unknown as TextBuffer;
    const frame = render(
      <BaseTextInput buffer={buffer} onSubmit={vi.fn()} />,
    ).lastFrame();
    expect(frame).not.toContain('lines');
  });

  it('positions the physical cursor from absolute Ink DOM position', () => {
    const root = createElement(2, 3);
    const parent = createElement(5, 7, root);
    const child = createElement(11, 13, parent);

    expect(
      getPhysicalCursorPosition(child, {
        hasMeasured: true,
        showCursor: true,
        cursorVisualRow: 2,
        cursorVisualCol: 3,
        scrollVisualRow: 1,
        linesToRender: ['', 'ab😀cd'],
      }),
      // The node is the text-lines container: no prefix or frame offsets.
    ).toEqual({ x: 27, y: 19 });
  });

  it.each([
    { columns: 11, label: 'session', expectedLabel: 'ses…' },
    { columns: 12, label: '会话标题', expectedLabel: '会话…' },
    { columns: 20, label: 'session', expectedLabel: 'session' },
    { columns: 4, label: 'session', expectedLabel: '' },
  ])(
    'keeps the corner label within $columns columns for "$label"',
    ({ columns, label, expectedLabel }) => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        process.stdout,
        'columns',
      );
      Object.defineProperty(process.stdout, 'columns', {
        configurable: true,
        value: columns,
      });

      try {
        const { lastFrame } = render(
          <BaseTextInput
            buffer={createBuffer()}
            onSubmit={vi.fn()}
            topRightLabel={label}
          />,
        );
        const lines = lastFrame()?.split('\n') ?? [];

        if (expectedLabel) {
          // The label sits inside the top border, cut to fit the terminal.
          expect(lines[0]).toContain(` ${expectedLabel} ──╮`);
          expect(lines[0]!.startsWith('╭')).toBe(true);
        } else {
          expect(lines[0]!.startsWith('╭')).toBe(true);
        }
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(process.stdout, 'columns', originalDescriptor);
        } else {
          Reflect.deleteProperty(process.stdout, 'columns');
        }
      }
    },
  );
});

describe('getAbsolutePosition', () => {
  it('returns undefined for a missing node', () => {
    expect(getAbsolutePosition(null)).toBeUndefined();
  });

  it('sums computed layout offsets across parent nodes', () => {
    const root = createElement(2, 3);
    const parent = createElement(5, 7, root);
    const child = createElement(11, 13, parent);

    expect(getAbsolutePosition(child)).toEqual({ top: 18, left: 23 });
  });

  it('skips nodes without yogaNode in the parent chain', () => {
    const root = createElement(2, 3);
    const middle = { parentNode: root } as unknown as DOMElement;
    const child = createElement(11, 13, middle);

    expect(getAbsolutePosition(child)).toEqual({ top: 13, left: 16 });
  });

  it('skips nodes whose getComputedLayout returns undefined', () => {
    const root = createElement(2, 3);
    const middle = {
      yogaNode: {
        getComputedLayout: () => undefined,
      },
      parentNode: root,
    } as unknown as DOMElement;
    const child = createElement(11, 13, middle);

    expect(getAbsolutePosition(child)).toEqual({ top: 13, left: 16 });
  });
});

describe('defaultRenderLine', () => {
  it('renders the software cursor on the current character', () => {
    const { lastFrame } = render(
      <>
        {defaultRenderLine({
          lineText: 'hello',
          isOnCursorLine: true,
          cursorCol: 2,
          showCursor: true,
          visualLineIndex: 0,
          absoluteVisualIndex: 0,
          buffer: createBuffer(),
          scrollVisualRow: 0,
        })}
      </>,
    );

    expect(lastFrame()).toContain(`he${renderSoftwareCursor('l')}lo`);
  });

  it('renders the software cursor as a trailing space', () => {
    const { lastFrame } = render(
      <>
        {defaultRenderLine({
          lineText: 'hello',
          isOnCursorLine: true,
          cursorCol: 5,
          showCursor: true,
          visualLineIndex: 0,
          absoluteVisualIndex: 0,
          buffer: createBuffer(),
          scrollVisualRow: 0,
        })}
      </>,
    );

    expect(lastFrame()).toContain(`hello${renderSoftwareCursor(' ')}`);
  });

  it('draws no cursor of its own where the terminal shows it', () => {
    // On Windows the terminal cursor already sits at the insertion point; a
    // drawn one beside it shows two, and the zero-width space kept after an
    // end-of-line cursor is one column wide to ConPTY.
    terminalShowsInputCursor.mockReturnValue(true);
    try {
      for (const cursorCol of [2, 5]) {
        const { lastFrame } = render(
          <>
            {defaultRenderLine({
              lineText: 'hello',
              isOnCursorLine: true,
              cursorCol,
              showCursor: true,
              visualLineIndex: 0,
              absoluteVisualIndex: 0,
              buffer: createBuffer(),
              scrollVisualRow: 0,
            })}
          </>,
        );
        expect(lastFrame()).toBe('hello');
      }
    } finally {
      terminalShowsInputCursor.mockReturnValue(false);
    }
  });
});
