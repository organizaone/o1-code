/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  calculatePromptWidths,
  clampDialogHeight,
  getDialogMaxHeight,
  getInputViewportHeight,
} from './layoutUtils.js';

describe('layoutUtils', () => {
  it.each([30, 24, 18])(
    'keeps input and surrounding chrome within a %i-row viewport',
    (rows) => {
      const inputRows = getInputViewportHeight(rows, 6, 10);
      expect(inputRows + 6 + 10).toBeLessThanOrEqual(rows);
      expect(inputRows).toBeGreaterThanOrEqual(1);
      expect(inputRows).toBeLessThanOrEqual(10);
    },
  );

  it('retains one editable row when the terminal cannot fit all chrome', () => {
    expect(getInputViewportHeight(4, 6, 10)).toBe(1);
  });

  it('calculates prompt widths', () => {
    expect(calculatePromptWidths(100)).toEqual({
      inputWidth: 94,
      containerWidth: 100,
      suggestionsWidth: 100,
      frameOverhead: 6,
    });
  });

  it('reserves static chrome and a bottom safety margin for dialog height', () => {
    expect(getDialogMaxHeight(24, 3)).toBe(19);
  });

  it('keeps at least one row for dialog height', () => {
    expect(getDialogMaxHeight(4, 10)).toBe(1);
    expect(getDialogMaxHeight(24, 3, 5)).toBe(14);
  });

  it('clamps optional dialog heights to whole positive rows', () => {
    expect(clampDialogHeight(undefined)).toBeUndefined();
    expect(clampDialogHeight(12.8)).toBe(12);
    expect(clampDialogHeight(0)).toBe(1);
    expect(clampDialogHeight(-4)).toBe(1);
  });
});
