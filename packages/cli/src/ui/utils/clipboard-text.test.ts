/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readWindowsClipboardText } from './clipboard-text.js';

const native = vi.hoisted(() => ({ load: vi.fn(), getText: vi.fn() }));
vi.mock('node:module', () => ({ createRequire: () => native.load }));

describe('readWindowsClipboardText', () => {
  beforeEach(() => {
    native.load.mockReset().mockReturnValue({
      ClipboardManager: class {
        getText = native.getText;
      },
    });
    native.getText.mockReset();
  });
  it.each(['Olá 世界\nsecond line', ''])(
    'preserves clipboard text %j',
    (text) => {
      native.getText.mockReturnValue(text);
      expect(readWindowsClipboardText()).toBe(text);
      expect(native.load).toHaveBeenCalledWith('@teddyzhu/clipboard');
    },
  );
  it('returns unavailable when the optional module is absent', () => {
    native.load.mockImplementation(() => {
      throw new Error('missing binding');
    });
    expect(readWindowsClipboardText()).toBeUndefined();
  });
  it('returns unavailable when the clipboard cannot be accessed', () => {
    native.getText.mockImplementation(() => {
      throw new Error('clipboard busy');
    });
    expect(readWindowsClipboardText()).toBeUndefined();
  });
});
