/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { formatSessionAge } from './session-age.js';

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatSessionAge', () => {
  it('says just now under a minute', () => {
    expect(formatSessionAge(NOW - 20_000, NOW)).toBe('just now');
  });

  it('counts minutes and hours in a short form', () => {
    expect(formatSessionAge(NOW - 5 * MIN, NOW)).toBe('5 min ago');
    expect(formatSessionAge(NOW - 2 * HOUR, NOW)).toBe('2 h ago');
  });

  it('says yesterday for one day, then days and weeks', () => {
    expect(formatSessionAge(NOW - 1.5 * DAY, NOW)).toBe('yesterday');
    expect(formatSessionAge(NOW - 3 * DAY, NOW)).toBe('3 days ago');
    expect(formatSessionAge(NOW - 15 * DAY, NOW)).toBe('2 weeks ago');
    expect(formatSessionAge(NOW - 8 * DAY, NOW)).toBe('1 week ago');
  });
});
