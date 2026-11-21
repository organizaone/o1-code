/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import { stripReasoningContent } from './utils.js';

type Message = OpenAI.Chat.ChatCompletionMessageParam;

function assistant(fields: Record<string, unknown>): Message {
  return { role: 'assistant', ...fields } as unknown as Message;
}

describe('stripReasoningContent', () => {
  it('returns a message without the field untouched', () => {
    const message: Message = { role: 'user', content: 'hello' };

    const result = stripReasoningContent(message);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(message);
  });

  it('removes the field from a copy and keeps the visible content', () => {
    const message = assistant({ content: 'answer', reasoning_content: 'why' });

    const result = stripReasoningContent(message);

    expect(result).toEqual([{ role: 'assistant', content: 'answer' }]);
    expect(message).toHaveProperty('reasoning_content', 'why');
  });

  it.each([
    ['an empty string', ''],
    ['null', null],
    ['an empty part list', []],
    ['no content at all', undefined],
  ])('drops an assistant message left with %s', (_label, content) => {
    const message = assistant({ content, reasoning_content: 'why' });

    expect(stripReasoningContent(message)).toEqual([]);
  });

  it('drops a reasoning-only assistant message that also has a name', () => {
    const message = assistant({
      name: 'helper',
      content: '',
      reasoning_content: 'why',
    });

    expect(stripReasoningContent(message)).toEqual([]);
  });

  it('keeps an assistant message whose only payload is a tool call', () => {
    const toolCalls = [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'tool_1', arguments: '{}' },
      },
    ];
    const message = assistant({
      content: null,
      reasoning_content: 'why',
      tool_calls: toolCalls,
    });

    expect(stripReasoningContent(message)).toEqual([
      { role: 'assistant', content: null, tool_calls: toolCalls },
    ]);
  });

  it('keeps an assistant message whose reasoning was already empty', () => {
    const message = assistant({ content: '', reasoning_content: '' });

    expect(stripReasoningContent(message)).toEqual([
      { role: 'assistant', content: '' },
    ]);
  });

  it('keeps a non-assistant message even when nothing else is left', () => {
    const message = {
      role: 'user',
      content: '',
      reasoning_content: 'why',
    } as unknown as Message;

    expect(stripReasoningContent(message)).toEqual([
      { role: 'user', content: '' },
    ]);
  });
});
