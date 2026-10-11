/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { compactQr } from './RemoteControlDialog.js';

describe('compactQr', () => {
  it('strips the quiet zone around the code, not rows inside it', () => {
    expect(
      compactQr('\n\n    ██  ██  \n          \n    ██  ██  \n\n    '),
    ).toBe('██  ██\n\n██  ██');
  });

  it('returns an empty string for a blank code', () => {
    expect(compactQr('\n \n')).toBe('');
  });
});
