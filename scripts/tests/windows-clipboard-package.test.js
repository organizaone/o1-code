/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect, it } from 'vitest';
import { isAllowedDistEntry } from '../create-standalone-package.js';

it('allows the shipped Windows clipboard worker in standalone packages', () => {
  expect(isAllowedDistEntry('windows-clipboard-worker.js')).toBe(true);
});
