/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import { TextInput, type TextInputProps } from './TextInput.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import type { Key } from '../../hooks/useKeypress.js';

vi.mock('../../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../../hooks/usePreferredEditor.js');

vi.mock('../../semantic-colors.js', () => ({
  theme: {
    text: { accent: 'cyan' },
    background: { primary: '#1E1E1E' },
    status: { error: 'red' },
  },
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

function captureKeypressHandler(): (key: Key) => void {
  const calls = mockedUseKeypress.mock.calls;
  if (calls.length === 0) {
    throw new Error('useKeypress was not called');
  }
  // Return the most recent handler
  return calls[calls.length - 1]![0] as (key: Key) => void;
}

describe('TextInput', () => {
  it('shows hidden text above and below a multiline viewport', async () => {
    const value = 'one\ntwo\nthree\nfour\nfive';
    const { lastFrame, rerender } = render(
      <TextInput
        value={value}
        onChange={vi.fn()}
        height={3}
        inputWidth={20}
        initialCursorOffset={0}
        showScrollIndicator
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('1–3/5 ↓'));
    expect(lastFrame()).toContain('one');
    rerender(
      <TextInput
        key="end"
        value={value}
        onChange={vi.fn()}
        height={3}
        inputWidth={20}
        initialCursorOffset={value.length}
        showScrollIndicator
      />,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('↑ 3–5/5'));
    expect(lastFrame()).toContain('three');
    expect(lastFrame()).toContain('five');
  });

  it('keeps continuation indicators opt-in', () => {
    const { lastFrame } = render(
      <TextInput
        value={'one\ntwo\nthree\nfour'}
        onChange={vi.fn()}
        height={3}
        inputWidth={20}
      />,
    );
    expect(lastFrame()).not.toMatch(/\d–\d\/\d/);
  });
  let onChange: Mock<TextInputProps['onChange']>;
  let onSubmit: Mock<NonNullable<TextInputProps['onSubmit']>>;

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn<TextInputProps['onChange']>();
    onSubmit = vi.fn<NonNullable<TextInputProps['onSubmit']>>();
  });

  describe('mask', () => {
    it('shows the masked value, never the typed characters', () => {
      const key = 'zai-7c1f0123456789ab3f9a';
      const { lastFrame } = render(
        <TextInput
          value={key}
          onChange={onChange}
          mask={(text) => '*'.repeat(text.length)}
          isActive={false}
        />,
      );
      expect(lastFrame()).not.toContain('0123456789');
      expect(lastFrame()).toContain('*'.repeat(key.length));
    });
  });

  describe('mask on a wrapped value', () => {
    it('masks the whole value, not each wrapped line on its own', () => {
      // A key wider than the input wraps; a mask that keeps the ends must
      // keep the ends of the key, not of every wrapped slice.
      const keepEnds = (text: string) =>
        text.length <= 4
          ? '*'.repeat(text.length)
          : text.slice(0, 2) + '*'.repeat(text.length - 4) + text.slice(-2);
      const value = 'AB' + 'x'.repeat(78) + 'SECRET' + 'y'.repeat(20) + 'YZ';
      const { lastFrame } = render(
        <TextInput
          value={value}
          onChange={onChange}
          mask={keepEnds}
          inputWidth={80}
          height={2}
          isActive={false}
        />,
      );
      expect(lastFrame()).not.toContain('SE');
      expect(lastFrame()).toContain('YZ');
    });
  });

  describe('multiline mode (height > 1)', () => {
    it('submits on plain Enter', () => {
      render(
        <TextInput
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          height={5}
        />,
      );

      const handler = captureKeypressHandler();
      handler(makeKey({ name: 'return', sequence: '\r' }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('does NOT submit on Shift+Enter — inserts newline instead', () => {
      render(
        <TextInput
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          height={5}
        />,
      );

      const handler = captureKeypressHandler();
      handler(makeKey({ name: 'return', shift: true, sequence: '\r' }));

      expect(onSubmit).not.toHaveBeenCalled();
      // onChange should be called with the newline character
      expect(onChange).toHaveBeenCalled();
    });

    it('does NOT submit on Ctrl+Enter — inserts newline instead', () => {
      render(
        <TextInput
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          height={5}
        />,
      );

      const handler = captureKeypressHandler();
      handler(makeKey({ name: 'return', ctrl: true, sequence: '\r' }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('single-line mode (height = 1)', () => {
    it('submits on plain Enter', () => {
      render(
        <TextInput
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          height={1}
        />,
      );

      const handler = captureKeypressHandler();
      handler(makeKey({ name: 'return', sequence: '\r' }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('submits on Shift+Enter (no newline concept in single-line)', () => {
      render(
        <TextInput
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          height={1}
        />,
      );

      const handler = captureKeypressHandler();
      handler(makeKey({ name: 'return', shift: true, sequence: '\r' }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('ellipsizes long single-line values in the middle when enabled', () => {
      const { lastFrame } = render(
        <TextInput
          value="sk-token-plan-abcdefghijklmnopqrstuvwxyz0123456789"
          onChange={onChange}
          inputWidth={20}
          ellipsizeOverflow
        />,
      );

      expect(lastFrame()).toContain('sk-token-...23456789');
    });
  });
});
