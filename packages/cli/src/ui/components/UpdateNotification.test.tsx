/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { UpdateNotification } from './UpdateNotification.js';

describe('<UpdateNotification />', () => {
  it('keeps the headline and the installation line, padded from the frame', () => {
    const lines = (
      render(
        <UpdateNotification
          message={'O1-Code update available! 1.0.0 → 2.0.0\nRun npm install'}
        />,
      ).lastFrame() ?? ''
    ).split('\n');
    const headline = lines.find((line) => line.includes('available'))!;
    expect(headline).toMatch(
      /^│ {2}O1-Code update available! 1\.0\.0 → 2\.0\.0/,
    );
    expect(lines.some((line) => line.includes('Run npm install'))).toBe(true);
  });
});
