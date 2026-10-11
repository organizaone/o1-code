/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ToolCallStatus, type HistoryItem } from '../ui/types.js';
import { historyToRemoteEvents } from './history-seed.js';

describe('historyToRemoteEvents', () => {
  it('turns the screen into whole events a viewer renders', () => {
    const items: HistoryItem[] = [
      { id: 1, type: 'user', text: 'run the tests' },
      {
        id: 2,
        type: 'tool_group',
        tools: [
          {
            callId: 'c1',
            name: 'run_shell_command',
            description: 'npm test',
            status: ToolCallStatus.Success,
            resultDisplay: undefined,
            confirmationDetails: undefined,
          },
          {
            callId: 'c2',
            name: 'read_file',
            description: 'a.ts',
            status: ToolCallStatus.Executing,
            resultDisplay: undefined,
            confirmationDetails: undefined,
          },
        ],
      },
      { id: 3, type: 'gemini', text: 'All green.' },
      { id: 4, type: 'info', text: 'ignored' },
    ];
    expect(historyToRemoteEvents(items, 's1')).toEqual([
      {
        type: 'user',
        session_id: 's1',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'run the tests' }],
        },
      },
      {
        type: 'assistant',
        session_id: 's1',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'c1',
              name: 'run_shell_command',
              input: {},
            },
            { type: 'tool_use', id: 'c2', name: 'read_file', input: {} },
          ],
        },
      },
      {
        type: 'user',
        session_id: 's1',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'c1', is_error: false },
          ],
        },
      },
      {
        type: 'assistant',
        session_id: 's1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'All green.' }],
        },
      },
    ]);
  });
});
