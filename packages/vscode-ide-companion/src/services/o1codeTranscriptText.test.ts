/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { o1codeRecordToText } from './o1codeTranscriptText.js';

describe('o1codeRecordToText', () => {
  it('uses display metadata, including an empty display projection', () => {
    const record = {
      type: 'user',
      message: {
        parts: [
          { text: 'expanded model prompt' },
          {
            text: [
              '<o1-code:user-prompt-submit-context>',
              'hook-only context',
              '</o1-code:user-prompt-submit-context>',
            ].join('\n'),
          },
        ],
      },
      systemPayload: {
        displayText: 'raw @file prompt',
        hookContext: 'hook-only context',
      },
    };

    expect(o1codeRecordToText(record)).toBe('raw @file prompt');
    expect(
      o1codeRecordToText({
        ...record,
        systemPayload: { ...record.systemPayload, displayText: '' },
      }),
    ).toBe('');
  });

  it('keeps synthetic user model text instead of its display label', () => {
    expect(
      o1codeRecordToText({
        type: 'user',
        message: { parts: [{ text: 'notification model text' }] },
        systemPayload: { displayText: 'Background agent completed' },
      }),
    ).toBe('notification model text');
  });

  it('strips a complete final tag-only context part', () => {
    expect(
      o1codeRecordToText({
        type: 'user',
        message: {
          parts: [
            { text: 'user prompt' },
            {
              text: [
                '<o1-code:user-prompt-submit-context>',
                'hook-only context',
                '</o1-code:user-prompt-submit-context>',
              ].join('\n'),
            },
          ],
        },
      }),
    ).toBe('user prompt');
  });

  it('preserves legacy bare context without a reliable boundary', () => {
    expect(
      o1codeRecordToText({
        type: 'user',
        message: {
          parts: [
            { text: 'user prompt' },
            { text: 'legacy bare hook context' },
          ],
        },
      }),
    ).toBe('user prompt\nlegacy bare hook context');
  });
});
