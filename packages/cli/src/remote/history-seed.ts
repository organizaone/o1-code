/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallStatus, type HistoryItem } from '../ui/types.js';

/**
 * The conversation the terminal is showing, as the whole stream-json
 * events a viewer renders (contract §5.2, `hello.history`): user and
 * assistant messages, and each tool call with its result when it has one.
 * Nothing is read from disk; what the screen holds is what a viewer sees
 * first.
 */
export function historyToRemoteEvents(
  items: readonly HistoryItem[],
  sessionId: string,
): unknown[] {
  const events: unknown[] = [];
  for (const item of items) {
    switch (item.type) {
      case 'user':
        if (item.text) {
          events.push({
            type: 'user',
            session_id: sessionId,
            message: {
              role: 'user',
              content: [{ type: 'text', text: item.text }],
            },
          });
        }
        break;
      case 'gemini':
      case 'gemini_content':
        if (item.text) {
          events.push({
            type: 'assistant',
            session_id: sessionId,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: item.text }],
            },
          });
        }
        break;
      case 'tool_group': {
        if (item.tools.length === 0) break;
        events.push({
          type: 'assistant',
          session_id: sessionId,
          message: {
            role: 'assistant',
            content: item.tools.map((tool) => ({
              type: 'tool_use',
              id: tool.callId,
              name: tool.name,
              input: {},
            })),
          },
        });
        const settled = item.tools.filter(
          (tool) =>
            tool.status === ToolCallStatus.Success ||
            tool.status === ToolCallStatus.Error ||
            tool.status === ToolCallStatus.Canceled,
        );
        if (settled.length > 0) {
          events.push({
            type: 'user',
            session_id: sessionId,
            message: {
              role: 'user',
              content: settled.map((tool) => ({
                type: 'tool_result',
                tool_use_id: tool.callId,
                is_error: tool.status !== ToolCallStatus.Success,
              })),
            },
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return events;
}
