/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { forceTextPresentation } from './text-presentation.js';

const VS15 = '︎';
const VS16 = '️';

describe('forceTextPresentation', () => {
  it.each(['✔', '✖', 'ℹ', '⚠', '☑', '▶'])(
    'asks for the text form of %s on Windows',
    (symbol) => {
      expect(forceTextPresentation(`${symbol} soma`, 'win32')).toBe(
        `${symbol}${VS15} soma`,
      );
    },
  );

  it('leaves a symbol that already carries a variation selector alone', () => {
    expect(forceTextPresentation(`✔${VS16} ok ✔${VS15} ok`, 'win32')).toBe(
      `✔${VS16} ok ✔${VS15} ok`,
    );
  });

  it.each(['✓', '❯', '➜', '✅', '❌'])(
    'does not touch %s, which has no text-presentation sequence',
    (symbol) => {
      expect(forceTextPresentation(`${symbol} soma`, 'win32')).toBe(
        `${symbol} soma`,
      );
    },
  );

  it('changes nothing outside Windows', () => {
    expect(forceTextPresentation('✔ soma', 'linux')).toBe('✔ soma');
    expect(forceTextPresentation('✔ soma', 'darwin')).toBe('✔ soma');
  });

  it('marks every occurrence', () => {
    expect(forceTextPresentation('✔ a\n✖ b\n✔ c', 'win32')).toBe(
      `✔${VS15} a\n✖${VS15} b\n✔${VS15} c`,
    );
  });
});
