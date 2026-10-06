/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { attachmentDisplayName } from './InputPrompt.js';

describe('attachmentDisplayName', () => {
  it('shows the time a clipboard screenshot was taken, not its generated name', () => {
    const takenAt = new Date(2026, 9, 5, 17, 12);
    const name = `clipboard-${takenAt.getTime()}-0a8cbe89-0293-41af-89ea-eb927016f858.png`;
    const hh = String(takenAt.getHours()).padStart(2, '0');
    const mm = String(takenAt.getMinutes()).padStart(2, '0');
    expect(attachmentDisplayName(name)).toBe(`screenshot ${hh}:${mm}`);
  });

  it('keeps a short filename as is', () => {
    expect(attachmentDisplayName('report.xlsx')).toBe('report.xlsx');
  });

  it('trims a long filename in the middle, keeping the start and the extension', () => {
    const shown = attachmentDisplayName(
      'clipboard-1791251781717-47aee5f9-88ef-456a-9f8d-5f164e2e3ef9.bmp',
    );
    expect(shown).toBe('clipboard-1791…e3ef9.bmp');
  });

  it('falls back to the trimmed filename when the clipboard name carries no valid timestamp', () => {
    expect(attachmentDisplayName('clipboard-notatime-0a8cbe89.png')).toBe(
      'clipboard-nota…cbe89.png',
    );
  });
});
