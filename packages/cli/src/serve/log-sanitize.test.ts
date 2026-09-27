/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { sanitizeLogText } from './log-sanitize.js';

describe('sanitizeLogText', () => {
  it('renders newlines visibly and blanks other control characters', () => {
    expect(sanitizeLogText('a\nb\rc\u001b[31m', 100)).toBe('a\\nb c [31m');
  });

  it('blanks Unicode line breaks and bidi controls', () => {
    expect(sanitizeLogText('a\u0085b\u2028c\u202ed', 100)).toBe('a b c d');
  });

  it('truncates on code-point boundaries', () => {
    expect(sanitizeLogText('\u{1f389}\u{1f389}\u{1f389}', 2)).toBe(
      '\u{1f389}\u{1f389}',
    );
  });
});
