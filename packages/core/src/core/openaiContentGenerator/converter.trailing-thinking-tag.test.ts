/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import type { GenerateContentResponse } from '@google/genai';
import { OpenAIContentConverter as converter } from './converter.js';
import { StreamingToolCallParser } from './streamingToolCallParser.js';
import type { RequestContext } from './types.js';

const contentOnlyStream = (): RequestContext => ({
  model: 'test-model',
  modalities: {},
  startTime: 0,
  toolCallParser: new StreamingToolCallParser(),
  responseParsingOptions: { contentOnlyThinkingTagLeaks: true },
});

const send = (
  stream: RequestContext,
  delta: Record<string, unknown>,
  finishReason: string | null = null,
) =>
  converter.convertOpenAIChunkToLlm(
    {
      id: 'chunk',
      created: 1,
      model: 'test',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    } as unknown as OpenAI.Chat.ChatCompletionChunk,
    stream,
  );

const textOf = (...responses: GenerateContentResponse[]) =>
  responses
    .flatMap((response) => response.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? '')
    .join('');

const complete = (
  message: Record<string, unknown>,
  finishReason: string | null = 'stop',
) =>
  ({
    choices: [{ index: 0, message, finish_reason: finishReason }],
  }) as unknown as OpenAI.Chat.ChatCompletion;

describe('trailing closing thinking tag after an ordinary answer', () => {
  it('withholds a split trailing tag and drops it on a normal finish', () => {
    const stream = contentOnlyStream();
    const responses = [
      send(stream, { content: 'I need to verify the branch state.\n    <' }),
      send(stream, { content: '/thi' }),
      send(stream, { content: 'nk>\n' }),
    ];
    expect(textOf(...responses)).toBe('I need to verify the branch state.');
    expect(textOf(send(stream, {}, 'stop'))).toBe('');
    expect(stream.protocolTagSanitized).toEqual({
      tagName: 'think',
      toolCallCount: 0,
    });
  });

  it.each([
    'Example: `</think>`\n</think>',
    '```xml\n</think>\n```\n</think>',
    'Example:\n<think>literal\n</think>',
    'Explanation:\n</think>\nMore text.',
    'Pattern to strip:\n\n    </thinking>',
    'Use:\n<pre>\n</thinking>',
    'First the closer:\n</thinking>\nthen again:\n</thinking>',
  ])('keeps literal or non-terminal text: %j', (text) => {
    const stream = contentOnlyStream();
    const responses = [...text].map((character) =>
      send(stream, { content: character }),
    );
    responses.push(send(stream, {}, 'stop'));
    expect(textOf(...responses)).toBe(text);
    expect(stream.protocolTagSanitized).toBeUndefined();
  });

  it('drops the tag on a tool-call finish and counts the calls', () => {
    const stream = contentOnlyStream();
    send(stream, {
      content: 'I need to verify the branch state.\n    </thinking>',
    });
    send(stream, {
      tool_calls: [
        {
          index: 0,
          id: 'call_1',
          function: { name: 'run_shell_command', arguments: '{}' },
        },
      ],
    });
    const last = send(stream, {}, 'tool_calls');
    const parts = last.candidates?.[0]?.content?.parts ?? [];
    expect(parts.some((part) => part.functionCall)).toBe(true);
    expect(textOf(last)).toBe('');
    expect(stream.protocolTagSanitized).toEqual({
      tagName: 'thinking',
      toolCallCount: 1,
    });
  });

  it.each(['length', 'content_filter', 'an_unmapped_reason'])(
    'keeps the tag when the provider reports %s',
    (finishReason) => {
      const stream = contentOnlyStream();
      const first = send(stream, { content: 'Answer.\n</think>' });
      const last = send(stream, {}, finishReason);
      expect(textOf(first, last)).toBe('Answer.\n</think>');
      expect(stream.protocolTagSanitized).toBeUndefined();
    },
  );

  it('holds a CRLF split across chunks without leaving a carriage return', () => {
    const stream = contentOnlyStream();
    const responses = ['Answer.\r', '\n', '</think>'].map((content) =>
      send(stream, { content }),
    );
    responses.push(send(stream, {}, 'stop'));
    expect(textOf(...responses)).toBe('Answer.');
  });

  it.each([true, false])(
    'still rejects a cross-channel leak (reasoning in the same chunk: %s)',
    (sameChunk) => {
      const stream = contentOnlyStream();
      const reasoning_content = 'Let me check<think>';
      if (!sameChunk) send(stream, { reasoning_content });
      expect(() =>
        send(stream, {
          ...(sameChunk ? { reasoning_content } : {}),
          content: 'the result\n</think>\n',
        }),
      ).toThrowError(expect.objectContaining({ type: 'PROTOCOL_TAG_LEAK' }));
    },
  );

  it('leaves the answer alone when the provider did not opt in', () => {
    const stream = contentOnlyStream();
    stream.responseParsingOptions = {};
    const first = send(stream, { content: 'Answer.\n</think>' });
    expect(textOf(first, send(stream, {}, 'stop'))).toBe('Answer.\n</think>');
  });

  it.each([
    ['a stop finish', 'stop'],
    ['no finish reason', null],
  ])('filters a non-streaming answer with %s', (_label, finishReason) => {
    const context = contentOnlyStream();
    const response = converter.convertOpenAIResponseToLlm(
      complete({ content: 'Answer.\n    </thinking>\n' }, finishReason),
      context,
    );
    expect(response.candidates?.[0]?.content?.parts).toEqual([
      { text: 'Answer.' },
    ]);
    expect(context.protocolTagSanitized?.tagName).toBe('thinking');
  });

  it('keeps a non-streaming suffix when it was cut or reasoning carried a tag', () => {
    const cut = converter.convertOpenAIResponseToLlm(
      complete({ content: 'Answer.\n</thinking>' }, 'length'),
      contentOnlyStream(),
    );
    expect(textOf(cut)).toBe('Answer.\n</thinking>');

    const context = contentOnlyStream();
    const tagged = converter.convertOpenAIResponseToLlm(
      complete({
        content: 'Answer.\n</thinking>',
        reasoning_content: 'Let me check <thinking>',
      }),
      context,
    );
    expect(textOf(tagged)).toBe('Answer.\n</thinking>');
    expect(context.protocolTagSanitized).toBeUndefined();
  });
});
