/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readWindowsClipboardText } from './clipboard-text.js';

const native = vi.hoisted(() => ({ load: vi.fn(), getText: vi.fn() }));
vi.mock('node:module', () => ({ createRequire: () => native.load }));
vi.mock('@organizaone/o1-code-core/utils/windows-clipboard.js', () => ({
  getWindowsClipboardText: native.getText,
}));

describe('readWindowsClipboardText', () => {
  beforeEach(() => {
    native.load.mockReset().mockImplementation(() => {
      throw new Error('Legacy addon must not be loaded on Windows');
    });
    native.getText.mockReset();
  });
  it.each(['Olá 世界\nsecond line', ''])(
    'preserves clipboard text %j',
    (text) => {
      native.getText.mockReturnValue(text);
      expect(readWindowsClipboardText()).toBe(text);
      expect(native.getText).toHaveBeenCalledOnce();
      expect(native.load).not.toHaveBeenCalled();
    },
  );
  it('returns unavailable when the optional module is absent', () => {
    native.getText.mockImplementation(() => {
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
