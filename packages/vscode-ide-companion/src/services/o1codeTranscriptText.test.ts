/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isHiddenO1CodeUserRecord,
  o1codeRecordToText,
} from './o1codeTranscriptText.js';

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

  it('keeps the parts of a plain user record that has only a display label', () => {
    expect(
      o1codeRecordToText({
        type: 'user',
        message: { parts: [{ text: 'what the person typed' }] },
        systemPayload: { displayText: 'a label' },
      }),
    ).toBe('what the person typed');
  });

  it.each(['notification', 'cron', 'goal_runtime'])(
    'shows only the display text of a %s record',
    (subtype) => {
      const record = {
        type: 'user',
        subtype,
        message: {
          parts: [
            { text: '<task-notification>model text</task-notification>' },
          ],
        },
      };

      expect(
        o1codeRecordToText({
          ...record,
          systemPayload: { displayText: 'Background agent completed' },
        }),
      ).toBe('Background agent completed');
      expect(o1codeRecordToText(record)).toBe('');
      expect(isHiddenO1CodeUserRecord(record)).toBe(true);
      expect(
        isHiddenO1CodeUserRecord({
          ...record,
          systemPayload: { displayText: 'Background agent completed' },
        }),
      ).toBe(false);
    },
  );

  it('shows what was typed in a message sent while the model was working', () => {
    const record = {
      type: 'user',
      subtype: 'mid_turn_user_message',
      message: {
        parts: [{ text: 'prefix for the model: also fix the tests' }],
      },
    };

    expect(
      o1codeRecordToText({
        ...record,
        systemPayload: { displayText: 'also fix the tests' },
      }),
    ).toBe('also fix the tests');
    // A record from before the display text was saved keeps its parts.
    expect(o1codeRecordToText(record)).toBe(
      'prefix for the model: also fix the tests',
    );
    expect(isHiddenO1CodeUserRecord(record)).toBe(false);
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
