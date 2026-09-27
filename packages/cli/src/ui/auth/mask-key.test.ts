/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { abbreviateKey, maskKey } from './mask-key.js';

const KEY = 'zai-7c1f0123456789ab3f9a';

describe('maskKey', () => {
  it('keeps the first 8 and the last 4 characters and hides the rest', () => {
    const masked = maskKey(KEY);
    expect(masked).toHaveLength(KEY.length);
    expect(masked.startsWith('zai-7c1f')).toBe(true);
    expect(masked.endsWith('3f9a')).toBe(true);
    expect(masked.slice(8, -4)).toBe('•'.repeat(KEY.length - 12));
  });

  it('hides every character of a short key', () => {
    expect(maskKey('sk-12345678')).toBe('•'.repeat(11));
    expect(maskKey('')).toBe('');
  });
});

describe('abbreviateKey', () => {
  it('shows the ends of the key around an ellipsis', () => {
    expect(abbreviateKey(KEY)).toBe('zai-7c1f…3f9a');
  });

  it('hides a short key entirely', () => {
    expect(abbreviateKey('sk-123')).toBe('••••');
  });
});
