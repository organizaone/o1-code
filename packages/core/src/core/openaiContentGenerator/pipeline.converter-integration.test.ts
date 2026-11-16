/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type OpenAI from 'openai';
import { FinishReason } from '@google/genai';
import type { ErrorHandler, PipelineConfig } from './types.js';
import { ContentGenerationPipeline } from './pipeline.js';
import { toolCallArgumentsWereIncomplete } from '../incomplete-tool-call-args.js';
import type { Config } from '../../config/config.js';
import type { AuthType, ContentGeneratorConfig } from '../contentGenerator.js';
import type { OpenAICompatibleProvider } from './provider/index.js';
import { logProtocolTagSanitized } from '../../telemetry/loggers.js';

vi.mock('openai');
vi.mock('../../telemetry/loggers.js', () => ({
  logProtocolTagSanitized: vi.fn(),
}));
vi.mock('../../telemetry/gen-ai-request.js', () => ({
  reportOpenAiRequest: vi.fn(),
  reportOpenAiResponse: vi.fn(),
  reportOpenAiChunk: vi.fn(),
}));

// The converter opens the question and the pipeline closes it, so both run for
// real here, over the stream shape `stream_options.include_usage` produces:
// a finish chunk without usage, then the totals on a `choices: []` chunk.
describe('ContentGenerationPipeline with the real converter: truncation override', () => {
  let pipeline: ContentGenerationPipeline;
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    createMock = vi.fn();
    const client = {
      chat: { completions: { create: createMock } },
    } as unknown as OpenAI;

    const provider = {
      buildClient: vi.fn().mockReturnValue(client),
      buildRequest: vi.fn().mockImplementation((req) => req),
      buildHeaders: vi.fn().mockReturnValue({}),
      getDefaultGenerationConfig: vi.fn().mockReturnValue({}),
    } as unknown as OpenAICompatibleProvider;

    const errorHandler = {
      handle: vi.fn().mockImplementation((error: unknown) => {
        throw error;
      }),
      shouldSuppressErrorLogging: vi.fn().mockReturnValue(false),
    } as unknown as ErrorHandler;

    const config: PipelineConfig = {
      cliConfig: {} as Config,
      provider,
      contentGeneratorConfig: {
        model: 'test-model',
        authType: 'openai' as AuthType,
        baseUrl: 'https://api.openai.com/v1',
      } as ContentGeneratorConfig,
      errorHandler,
    };
    pipeline = new ContentGenerationPipeline(config);
  });

  function arrangeStream(completionTokens: number | undefined) {
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield {
          id: 'chunk-args',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'write_file',
                      arguments:
                        '{"file_path":"/tmp/a.txt","content":"first half',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        } as unknown as OpenAI.Chat.ChatCompletionChunk;
        yield {
          id: 'chunk-finish',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        } as unknown as OpenAI.Chat.ChatCompletionChunk;
        if (completionTokens === undefined) return;
        yield {
          id: 'chunk-usage',
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: completionTokens,
            total_tokens: 100 + completionTokens,
          },
        } as unknown as OpenAI.Chat.ChatCompletionChunk;
      },
    });
  }

  async function finishResponse() {
    const generator = await pipeline.executeStream(
      {
        model: 'test-model',
        contents: [{ parts: [{ text: 'Hello' }], role: 'user' }],
        config: { maxOutputTokens: 8192 },
      },
      'prompt-id',
    );
    const responses = [];
    for await (const response of generator) {
      responses.push(response);
    }
    const finish = responses.filter(
      (response) => response.candidates?.[0]?.finishReason !== undefined,
    );
    expect(finish).toHaveLength(1);
    return finish[0]!;
  }

  const writeCall = (response: Awaited<ReturnType<typeof finishResponse>>) =>
    response.candidates?.[0]?.content?.parts?.find((part) => part.functionCall)
      ?.functionCall;

  it('withdraws the max_tokens diagnosis but marks the call as incomplete', async () => {
    arrangeStream(185);

    const response = await finishResponse();

    expect(response.candidates?.[0]?.finishReason).toBe(FinishReason.STOP);
    expect(response.usageMetadata?.candidatesTokenCount).toBe(185);
    expect(writeCall(response)?.name).toBe('write_file');
    expect(toolCallArgumentsWereIncomplete(writeCall(response)!)).toBe(true);
  });

  it('keeps the override when the late totals corroborate a real cut', async () => {
    arrangeStream(8192);

    const response = await finishResponse();

    expect(response.candidates?.[0]?.finishReason).toBe(
      FinishReason.MAX_TOKENS,
    );
    expect(toolCallArgumentsWereIncomplete(writeCall(response)!)).toBe(false);
  });

  it('keeps the override when no usage ever arrives', async () => {
    arrangeStream(undefined);

    const response = await finishResponse();

    expect(response.candidates?.[0]?.finishReason).toBe(
      FinishReason.MAX_TOKENS,
    );
    expect(toolCallArgumentsWereIncomplete(writeCall(response)!)).toBe(false);
  });
});

describe('ContentGenerationPipeline with the real converter: trailing thinking tag', () => {
  let createMock: ReturnType<typeof vi.fn>;
  let pipeline: ContentGenerationPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    createMock = vi.fn();
    const client = {
      chat: { completions: { create: createMock } },
    } as unknown as OpenAI;
    pipeline = new ContentGenerationPipeline({
      cliConfig: {} as Config,
      provider: {
        buildClient: vi.fn().mockReturnValue(client),
        buildRequest: vi.fn().mockImplementation((req) => req),
        buildHeaders: vi.fn().mockReturnValue({}),
        getDefaultGenerationConfig: vi.fn().mockReturnValue({}),
        getResponseParsingOptions: () => ({
          contentOnlyThinkingTagLeaks: true,
        }),
      } as unknown as OpenAICompatibleProvider,
      contentGeneratorConfig: {
        model: 'test-model',
        authType: 'openai' as AuthType,
        baseUrl: 'https://api.openai.com/v1',
      } as ContentGeneratorConfig,
      errorHandler: {
        handle: vi.fn().mockImplementation((error: unknown) => {
          throw error;
        }),
        shouldSuppressErrorLogging: vi.fn().mockReturnValue(false),
      } as unknown as ErrorHandler,
    });
  });

  const contentChunk = (content: string, finishReason: string | null = null) =>
    ({
      id: 'chunk',
      choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
    }) as unknown as OpenAI.Chat.ChatCompletionChunk;

  async function run(
    chunks: OpenAI.Chat.ChatCompletionChunk[],
    failure?: Error,
  ) {
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield* chunks;
        if (failure) throw failure;
      },
    });
    const generator = await pipeline.executeStream(
      {
        model: 'test-model',
        contents: [{ parts: [{ text: 'Hello' }], role: 'user' }],
      },
      'prompt-id',
    );
    let text = '';
    let error: unknown;
    try {
      for await (const response of generator) {
        text += (response.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? '')
          .join('');
      }
    } catch (caught) {
      error = caught;
    }
    return { text, error };
  }

  it('drops the tag on a finish chunk and reports it once', async () => {
    const { text, error } = await run([
      contentChunk('Answer.\n</thi'),
      contentChunk('nking>'),
      contentChunk('', 'stop'),
    ]);

    expect(error).toBeUndefined();
    expect(text).toBe('Answer.');
    expect(logProtocolTagSanitized).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logProtocolTagSanitized).mock.calls[0]?.[1]).toMatchObject(
      { tag_name: 'thinking', tool_call_count: 0 },
    );
  });

  it('drops the tag when the stream ends without a finish chunk', async () => {
    const { text, error } = await run([contentChunk('Answer.\n</think>')]);

    expect(error).toBeUndefined();
    expect(text).toBe('Answer.');
    expect(logProtocolTagSanitized).toHaveBeenCalledTimes(1);
  });

  it('releases the held tail unedited when the stream fails', async () => {
    const failure = new Error('socket hang up');
    const { text, error } = await run(
      [contentChunk('Answer.\n</think>')],
      failure,
    );

    expect(error).toBe(failure);
    expect(text).toBe('Answer.\n</think>');
    expect(logProtocolTagSanitized).not.toHaveBeenCalled();
  });

  it('keeps literal markup whole', async () => {
    const answer = 'Use:\n<pre>\n</thinking>';
    const { text } = await run([
      contentChunk(answer),
      contentChunk('', 'stop'),
    ]);

    expect(text).toBe(answer);
    expect(logProtocolTagSanitized).not.toHaveBeenCalled();
  });
});
