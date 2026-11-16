/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
} from 'vitest';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GenerateContentResponse } from '@google/genai';
import {
  BaseLlmClient,
  type GenerateJsonOptions,
  type GenerateTextOptions,
} from './baseLlmClient.js';
import { CHARS_PER_TOKEN } from '../services/tokenEstimation.js';
import { writeCredential } from '../providers/credential-store.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { Config } from '../config/config.js';
import { AuthType } from './contentGenerator.js';
import { reportError } from '../utils/errorReporting.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { getFunctionCalls } from '../utils/generateContentResponseUtilities.js';

vi.mock('../utils/errorReporting.js');
vi.mock('../utils/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/errors.js')>();
  return {
    ...actual,
    getErrorMessage: vi.fn((e) => (e instanceof Error ? e.message : String(e))),
  };
});

vi.mock('../utils/generateContentResponseUtilities.js', () => ({
  getFunctionCalls: vi.fn(),
}));

vi.mock('../utils/retry.js', () => ({
  retryWithBackoff: vi.fn(async (fn) => await fn()),
  isUnattendedMode: vi.fn(() => false),
}));

const mockCreateContentGenerator = vi.fn();
vi.mock('./contentGenerator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./contentGenerator.js')>();
  return {
    ...actual,
    createContentGenerator: (
      ...args: Parameters<typeof actual.createContentGenerator>
    ) => mockCreateContentGenerator(...args),
  };
});

const mockBuildAgentContentGeneratorConfig = vi.fn();
vi.mock('../models/content-generator-config.js', () => ({
  buildAgentContentGeneratorConfig: (...args: unknown[]): unknown =>
    mockBuildAgentContentGeneratorConfig(...args),
}));

const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockEmbedContent = vi.fn();

const mockContentGenerator = {
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream,
  embedContent: mockEmbedContent,
} as unknown as Mocked<ContentGenerator>;

const mockConfig = {
  getSessionId: vi.fn().mockReturnValue('test-session-id'),
  getContentGeneratorConfig: vi
    .fn()
    .mockReturnValue({ authType: AuthType.USE_GEMINI }),
  getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
  // Default test model — matches `defaultOptions.model` so resolveForModel
  // returns the constructor-injected ContentGenerator without trying to
  // build a per-model one.
  getModel: vi.fn().mockReturnValue('test-model'),
  getModelsConfig: vi.fn().mockReturnValue(undefined),
  getChatCompression: vi.fn().mockReturnValue(undefined),
} as unknown as Mocked<Config>;

// Helper to create a mock GenerateContentResponse with function call
const createMockResponseWithFunctionCall = (
  args: Record<string, unknown>,
): GenerateContentResponse =>
  ({
    candidates: [
      {
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'respond_in_schema',
                args,
              },
            },
          ],
        },
        index: 0,
      },
    ],
  }) as GenerateContentResponse;

// Helper to create a mock response without function call (for error cases)
const createMockResponseWithoutFunctionCall = (): GenerateContentResponse =>
  ({
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text: 'some text' }],
        },
        index: 0,
      },
    ],
  }) as GenerateContentResponse;

const createMockTextResponse = (text: string): GenerateContentResponse =>
  ({
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text }],
        },
        index: 0,
      },
    ],
  }) as GenerateContentResponse;

// Builds an async generator that yields one response per text delta, then an
// optional trailing usage-only chunk — mirroring how the streaming pipeline
// emits content deltas followed by a final chunk carrying usageMetadata.
async function* mockTextStream(
  chunks: string[],
  usage?: GenerateContentResponse['usageMetadata'],
): AsyncGenerator<GenerateContentResponse> {
  for (const text of chunks) {
    yield createMockTextResponse(text);
  }
  if (usage) {
    yield { usageMetadata: usage } as GenerateContentResponse;
  }
}

describe('BaseLlmClient', () => {
  let client: BaseLlmClient;
  let abortController: AbortController;
  let defaultOptions: GenerateJsonOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.getContentGeneratorConfig.mockReturnValue({
      model: 'test-model',
      authType: AuthType.USE_GEMINI,
    });
    // Reset the mocked implementation for getErrorMessage for accurate error message assertions
    vi.mocked(getErrorMessage).mockImplementation((e) =>
      e instanceof Error ? e.message : String(e),
    );
    client = new BaseLlmClient(mockContentGenerator, mockConfig);
    abortController = new AbortController();
    defaultOptions = {
      contents: [{ role: 'user', parts: [{ text: 'Give me a color.' }] }],
      schema: { type: 'object', properties: { color: { type: 'string' } } },
      model: 'test-model',
      abortSignal: abortController.signal,
      promptId: 'test-prompt-id',
    };
  });

  afterEach(() => {
    abortController.abort();
  });

  describe('generateJson - Success Scenarios', () => {
    it('should call generateContent with correct parameters using function declarations', async () => {
      const mockResponse = createMockResponseWithFunctionCall({
        color: 'blue',
      });
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { color: 'blue' } },
      ]);

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'blue' });

      // Ensure the retry mechanism was engaged
      expect(retryWithBackoff).toHaveBeenCalledTimes(1);
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxAttempts: 7,
        }),
      );

      // Validate the parameters passed to the underlying generator
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          contents: defaultOptions.contents,
          config: expect.objectContaining({
            abortSignal: defaultOptions.abortSignal,
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'respond_in_schema',
                    description: 'Provide the response in provided schema',
                    parameters: defaultOptions.schema,
                  },
                ],
              },
            ],
          }),
        }),
        'test-prompt-id',
      );
    });

    it('should respect configuration overrides', async () => {
      const mockResponse = createMockResponseWithFunctionCall({ color: 'red' });
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { color: 'red' } },
      ]);

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        config: { temperature: 0.8, topK: 10 },
      };

      await client.generateJson(options);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.8,
            topK: 10,
            tools: expect.any(Array),
          }),
        }),
        expect.any(String),
      );
    });

    it('should include system instructions when provided', async () => {
      const mockResponse = createMockResponseWithFunctionCall({
        color: 'green',
      });
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { color: 'green' } },
      ]);
      const systemInstruction = 'You are a helpful assistant.';

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        systemInstruction,
      };

      await client.generateJson(options);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction,
          }),
        }),
        expect.any(String),
      );
    });

    it('should use the provided promptId', async () => {
      const mockResponse = createMockResponseWithFunctionCall({
        color: 'yellow',
      });
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { color: 'yellow' } },
      ]);
      const customPromptId = 'custom-id-123';

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        promptId: customPromptId,
      };

      await client.generateJson(options);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.any(Object),
        customPromptId,
      );
    });

    it('should pass maxAttempts to retryWithBackoff when provided', async () => {
      const mockResponse = createMockResponseWithFunctionCall({
        color: 'cyan',
      });
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { color: 'cyan' } },
      ]);
      const customMaxAttempts = 3;

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        maxAttempts: customMaxAttempts,
      };

      await client.generateJson(options);

      expect(retryWithBackoff).toHaveBeenCalledTimes(1);
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxAttempts: customMaxAttempts,
        }),
      );
    });

    it('should call retryWithBackoff with default maxAttempts when not provided', async () => {
      const mockResponse = createMockResponseWithFunctionCall({
        color: 'indigo',
      });
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { color: 'indigo' } },
      ]);

      // No maxAttempts in defaultOptions
      await client.generateJson(defaultOptions);

      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxAttempts: 7,
        }),
      );
    });

    it('should pass configured retry error codes to retryWithBackoff', async () => {
      const retryErrorCodes = [4999];
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        model: 'test-model',
        authType: AuthType.USE_GEMINI,
        retryErrorCodes,
      });
      const mockResponse = createMockResponseWithFunctionCall({
        color: 'green',
      });
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { color: 'green' } },
      ]);

      await client.generateJson(defaultOptions);

      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          extraRetryErrorCodes: retryErrorCodes,
        }),
      );
    });

    it('should return empty object when no function calls are returned', async () => {
      const mockResponse = createMockResponseWithoutFunctionCall();
      mockGenerateContent.mockResolvedValue(mockResponse);
      vi.mocked(getFunctionCalls).mockReturnValue(undefined);

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({});
    });

    it('should parse a loose JSON object from text when no function call is returned', async () => {
      mockGenerateContent.mockResolvedValue(
        createMockTextResponse('Result:\n{"color":"purple","count":2}\nDone.'),
      );
      vi.mocked(getFunctionCalls).mockReturnValue(undefined);

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'purple', count: 2 });
    });

    it('should parse fenced JSON text when no function call is returned', async () => {
      mockGenerateContent.mockResolvedValue(
        createMockTextResponse('```json\n{"color":"orange"}\n```'),
      );
      vi.mocked(getFunctionCalls).mockReturnValue(undefined);

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'orange' });
    });

    it('should ignore malformed loose JSON text', async () => {
      mockGenerateContent.mockResolvedValue(
        createMockTextResponse('```json\n{"color":\n```'),
      );
      vi.mocked(getFunctionCalls).mockReturnValue(undefined);

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({});
    });

    it('should reject loose JSON arrays', async () => {
      mockGenerateContent.mockResolvedValue(
        createMockTextResponse('[{"color":"blue"}]'),
      );
      vi.mocked(getFunctionCalls).mockReturnValue(undefined);

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({});
    });
  });

  describe('generateJson - Error Handling', () => {
    it('should throw and report generic API errors', async () => {
      const apiError = new Error('Service Unavailable (503)');
      // Simulate the generator failing
      mockGenerateContent.mockRejectedValue(apiError);

      await expect(client.generateJson(defaultOptions)).rejects.toThrow(
        'Failed to generate JSON content (test-prompt-id): Service Unavailable (503)',
      );

      // Verify generic error reporting
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        apiError,
        'Error generating JSON content via API.',
        defaultOptions.contents,
        'generateJson-api',
      );
    });

    it('should throw immediately without reporting if aborted', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');

      // Simulate abortion happening during the API call
      mockGenerateContent.mockImplementation(() => {
        abortController.abort(); // Ensure the signal is aborted when the service checks
        throw abortError;
      });

      const options = {
        ...defaultOptions,
        abortSignal: abortController.signal,
      };

      await expect(client.generateJson(options)).rejects.toThrow(abortError);

      // Crucially, it should not report a cancellation as an application error
      expect(reportError).not.toHaveBeenCalled();
    });

    it('should not throw for empty response message check', async () => {
      const emptyResponseError = new Error(
        'API returned an empty response for generateJson.',
      );
      mockGenerateContent.mockRejectedValue(emptyResponseError);

      await expect(client.generateJson(defaultOptions)).rejects.toThrow(
        'API returned an empty response for generateJson.',
      );

      // Should not double-report this specific error
      expect(reportError).not.toHaveBeenCalled();
    });
  });

  it('filters unsupported media from text and JSON side queries', async () => {
    mockConfig.getContentGeneratorConfig.mockReturnValue({
      model: 'test-model',
      authType: AuthType.USE_GEMINI,
      modalities: { pdf: true },
    });
    const contents = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: 'image-bytes' } },
          { inlineData: { mimeType: 'application/pdf', data: 'pdf-bytes' } },
        ],
      },
    ];
    mockGenerateContent
      .mockResolvedValueOnce(createMockTextResponse('ok'))
      .mockResolvedValueOnce(createMockResponseWithFunctionCall({ ok: true }));
    vi.mocked(getFunctionCalls).mockReturnValue([
      { name: 'respond_in_schema', args: { ok: true } },
    ]);

    await client.generateText({
      contents,
      model: 'test-model',
      abortSignal: abortController.signal,
    });
    await client.generateJson({
      contents,
      schema: { type: 'object' },
      model: 'test-model',
      abortSignal: abortController.signal,
    });

    for (const [request] of mockGenerateContent.mock.calls) {
      const sent = JSON.stringify(request.contents);
      expect(sent).not.toContain('image-bytes');
      expect(sent).toContain('pdf-bytes');
    }
  });

  describe('generateEmbedding', () => {
    const texts = ['hello world', 'goodbye world'];
    const testEmbeddingModel = 'test-embedding-model';

    it('should call embedContent with correct parameters and return embeddings', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      mockEmbedContent.mockResolvedValue({
        embeddings: [
          { values: mockEmbeddings[0] },
          { values: mockEmbeddings[1] },
        ],
      });

      const result = await client.generateEmbedding(texts);

      expect(mockEmbedContent).toHaveBeenCalledTimes(1);
      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: testEmbeddingModel,
        contents: texts,
      });
      expect(result).toEqual(mockEmbeddings);
    });

    it('should return an empty array if an empty array is passed', async () => {
      const result = await client.generateEmbedding([]);
      expect(result).toEqual([]);
      expect(mockEmbedContent).not.toHaveBeenCalled();
    });

    it('should throw an error if API response has no embeddings array', async () => {
      mockEmbedContent.mockResolvedValue({});

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API response has an empty embeddings array', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [],
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API returns a mismatched number of embeddings', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: [1, 2, 3] }], // Only one for two texts
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned a mismatched number of embeddings. Expected 2, got 1.',
      );
    });

    it('should throw an error if any embedding has nullish values', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: [1, 2, 3] }, { values: undefined }], // Second one is bad
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 1: "goodbye world"',
      );
    });

    it('should throw an error if any embedding has an empty values array', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: [] }, { values: [1, 2, 3] }], // First one is bad
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 0: "hello world"',
      );
    });

    it('should propagate errors from the API call', async () => {
      mockEmbedContent.mockRejectedValue(new Error('API Failure'));

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API Failure',
      );
    });
  });

  describe('generateText - streaming', () => {
    it('routes through generateContentStream, concatenates deltas, trims once, and captures final-chunk usage', async () => {
      const usage = {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        totalTokenCount: 18,
      };
      mockGenerateContentStream.mockImplementation(async () =>
        mockTextStream(['  Hello', ', ', 'world  '], usage),
      );
      vi.mocked(getFunctionCalls).mockReturnValue(undefined);

      const result = await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        promptId: 'p',
        stream: true,
      });

      expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
      // The streaming branch builds the same request object as the non-stream
      // path: resolved model, contents, and a config carrying the abortSignal.
      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          config: expect.objectContaining({
            abortSignal: abortController.signal,
          }),
        }),
        'p',
      );
      expect(mockGenerateContent).not.toHaveBeenCalled();
      // Deltas are concatenated, then trimmed once at the end.
      expect(result.text).toBe('Hello, world');
      expect(result.usage).toEqual(usage);
      expect(result.hadToolCall).toBe(false);
    });

    it('forwards tool declarations and reports function calls without executing them', async () => {
      const tools = [
        {
          functionDeclarations: [
            { name: 'read_file', description: 'Read a file' },
          ],
        },
      ];
      mockGenerateContentStream.mockImplementation(async () =>
        mockTextStream(['summary']),
      );
      vi.mocked(getFunctionCalls).mockReturnValueOnce([
        { name: 'read_file', args: { path: 'README.md' } },
      ]);

      const result = await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'summarize' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        stream: true,
        config: { tools },
      });

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ tools }),
        }),
        '',
      );
      expect(result.hadToolCall).toBe(true);
    });

    it('forwards the prompt-cache-sharing marker to the provider request', async () => {
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        model: 'test-model',
        authType: AuthType.USE_OPENAI,
      });
      mockGenerateContentStream.mockImplementation(async () =>
        mockTextStream(['summary']),
      );

      await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'summarize' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        stream: true,
        promptCacheSharing: true,
      });

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ promptCacheSharing: true }),
        '',
      );
    });

    it.each([false, undefined])(
      'does not forward the prompt-cache-sharing marker when disabled (%s)',
      async (promptCacheSharing) => {
        mockConfig.getContentGeneratorConfig.mockReturnValue({
          model: 'test-model',
          authType: AuthType.USE_OPENAI,
        });
        mockGenerateContentStream.mockImplementation(async () =>
          mockTextStream(['summary']),
        );

        await client.generateText({
          contents: [{ role: 'user', parts: [{ text: 'summarize' }] }],
          model: 'test-model',
          abortSignal: abortController.signal,
          stream: true,
          promptCacheSharing,
        });

        expect(mockGenerateContentStream.mock.calls[0]?.[0]).not.toHaveProperty(
          'promptCacheSharing',
        );
      },
    );

    it('drops thought parts and tolerates a stream that omits usage', async () => {
      async function* streamWithThought(): AsyncGenerator<GenerateContentResponse> {
        yield createMockTextResponse('answer');
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'reasoning', thought: true }],
              },
              index: 0,
            },
          ],
        } as unknown as GenerateContentResponse;
      }
      mockGenerateContentStream.mockImplementation(async () =>
        streamWithThought(),
      );

      const result = await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        promptId: 'p',
        stream: true,
      });

      expect(result.text).toBe('answer');
      expect(result.usage).toBeUndefined();
    });

    it('does not stream when stream is omitted (non-streaming path, still trimmed)', async () => {
      mockGenerateContent.mockResolvedValue(
        createMockTextResponse('  plain  '),
      );
      vi.mocked(getFunctionCalls).mockReturnValueOnce(undefined);

      const result = await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        promptId: 'p',
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContentStream).not.toHaveBeenCalled();
      expect(result.text).toBe('plain');
      expect(result.hadToolCall).toBe(false);
    });

    it('reports function calls from the non-streaming response', async () => {
      const response = createMockResponseWithFunctionCall({});
      mockGenerateContent.mockResolvedValue(response);
      vi.mocked(getFunctionCalls).mockReturnValueOnce([
        { name: 'respond_in_schema', args: {} },
      ]);

      const result = await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        promptId: 'p',
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContentStream).not.toHaveBeenCalled();
      expect(getFunctionCalls).toHaveBeenCalledWith(response);
      expect(result.hadToolCall).toBe(true);
    });

    it('propagates a mid-stream error and never returns the partial text', async () => {
      async function* failingStream(): AsyncGenerator<GenerateContentResponse> {
        yield createMockTextResponse('partial');
        throw new Error('connection reset');
      }
      mockGenerateContentStream.mockImplementation(async () => failingStream());

      // A failure after some deltas have arrived rejects the whole call — the
      // accumulated 'partial' text is never surfaced as a success — and, since
      // the signal isn't aborted, the error is reported like the non-streaming
      // path. This is the gateway-timeout-mid-inference scenario the PR targets.
      await expect(
        client.generateText({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          model: 'test-model',
          abortSignal: abortController.signal,
          promptId: 'p',
          stream: true,
        }),
      ).rejects.toThrow('connection reset');
      expect(vi.mocked(reportError)).toHaveBeenCalled();
    });

    it('surfaces an abort that fires mid-stream and skips error reporting', async () => {
      async function* abortingStream(): AsyncGenerator<GenerateContentResponse> {
        yield createMockTextResponse('chunk');
        abortController.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      mockGenerateContentStream.mockImplementation(async () =>
        abortingStream(),
      );

      // The `abortSignal.aborted` guard in the catch block rethrows the original
      // error unwrapped and skips reportError, so a user-initiated cancellation
      // mid-stream surfaces verbatim and is not logged as an API failure.
      await expect(
        client.generateText({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          model: 'test-model',
          abortSignal: abortController.signal,
          promptId: 'p',
          stream: true,
        }),
      ).rejects.toThrow('The operation was aborted.');
      expect(vi.mocked(reportError)).not.toHaveBeenCalled();
    });

    it('returns an empty result for a stream that yields no chunks', async () => {
      // A stream that closes immediately (no content, no usage) must resolve to
      // an empty string rather than throw — the boundary the streaming branch
      // introduces. mockTextStream([]) yields nothing.
      mockGenerateContentStream.mockImplementation(async () =>
        mockTextStream([]),
      );

      const result = await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        promptId: 'p',
        stream: true,
      });

      expect(result.text).toBe('');
      expect(result.usage).toBeUndefined();
    });

    it('captures usage that rides the final content-bearing chunk', async () => {
      // Realistic Gemini/OpenAI shape: usageMetadata arrives on the last chunk
      // that *also* carries a text delta. Text and usage are read independently
      // per chunk, so the trailing text must not be dropped when usage is read.
      const usage = {
        promptTokenCount: 5,
        candidatesTokenCount: 3,
        totalTokenCount: 8,
      };
      async function* usageOnTextChunk(): AsyncGenerator<GenerateContentResponse> {
        yield createMockTextResponse('Hello, ');
        const finalChunk = createMockTextResponse('world');
        finalChunk.usageMetadata = usage;
        yield finalChunk;
      }
      mockGenerateContentStream.mockImplementation(async () =>
        usageOnTextChunk(),
      );

      const result = await client.generateText({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        model: 'test-model',
        abortSignal: abortController.signal,
        promptId: 'p',
        stream: true,
      });

      expect(result.text).toBe('Hello, world');
      expect(result.usage).toEqual(usage);
    });
  });

  describe('per-model resolution', () => {
    const fastModel = 'fast-model';
    const fastGenerateContent = vi.fn();
    const fastGenerateContentStream = vi.fn();
    const fastContentGenerator = {
      generateContent: fastGenerateContent,
      generateContentStream: fastGenerateContentStream,
      embedContent: vi.fn(),
    } as unknown as Mocked<ContentGenerator>;

    const getResolvedModel = vi.fn();
    let crossProviderConfig: Mocked<Config>;

    beforeEach(() => {
      vi.mocked(retryWithBackoff).mockImplementation(
        async (fn) => await (fn as () => Promise<unknown>)(),
      );
      fastGenerateContent.mockReset();
      fastGenerateContentStream.mockReset();
      mockCreateContentGenerator.mockReset();
      mockBuildAgentContentGeneratorConfig.mockReset();
      getResolvedModel.mockReset();

      mockCreateContentGenerator.mockResolvedValue(fastContentGenerator);
      mockBuildAgentContentGeneratorConfig.mockReturnValue({
        model: fastModel,
        authType: AuthType.USE_ANTHROPIC,
      });

      crossProviderConfig = {
        getSessionId: vi.fn().mockReturnValue('test-session-id'),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: AuthType.USE_GEMINI }),
        getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
        getModel: vi.fn().mockReturnValue('main-model'),
        getFastModel: vi.fn().mockReturnValue(undefined),
        getAllConfiguredModels: vi.fn((authTypes?: AuthType[]) =>
          authTypes?.includes(AuthType.USE_GEMINI)
            ? []
            : [
                {
                  id: fastModel,
                  authType: AuthType.USE_ANTHROPIC,
                },
              ],
        ),
        getModelsConfig: vi.fn().mockReturnValue({ getResolvedModel }),
      } as unknown as Mocked<Config>;
    });

    it('returns the constructor-injected generator when model matches main', async () => {
      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      const resolved = await c.resolveForModel('main-model');

      expect(resolved.contentGenerator).toBe(mockContentGenerator);
      expect(resolved.retryAuthType).toBe(AuthType.USE_GEMINI);
      expect(getResolvedModel).not.toHaveBeenCalled();
      expect(mockCreateContentGenerator).not.toHaveBeenCalled();
    });

    it('returns the active runtime generator when model matches the runtime view', async () => {
      const runtimeContentGenerator = {
        generateContent: vi.fn(),
        embedContent: vi.fn(),
      } as unknown as Mocked<ContentGenerator>;
      crossProviderConfig.getContentGenerator = vi
        .fn()
        .mockReturnValue(runtimeContentGenerator);
      vi.mocked(crossProviderConfig.getContentGeneratorConfig).mockReturnValue({
        authType: AuthType.USE_OPENAI,
        model: 'runtime-model',
      });
      vi.mocked(crossProviderConfig.getModel).mockReturnValue('runtime-model');
      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      const resolved = await c.resolveForModel('runtime-model');

      expect(resolved.contentGenerator).toBe(runtimeContentGenerator);
      expect(resolved.retryAuthType).toBe(AuthType.USE_OPENAI);
      expect(getResolvedModel).not.toHaveBeenCalled();
      expect(mockCreateContentGenerator).not.toHaveBeenCalled();
    });

    it('builds a per-model generator when model differs and is registered under another authType', async () => {
      // Main authType is USE_GEMINI; fast model only resolves under USE_ANTHROPIC.
      getResolvedModel.mockImplementation((authType: string, model: string) => {
        if (authType === AuthType.USE_GEMINI) return undefined;
        if (authType === AuthType.USE_ANTHROPIC && model === fastModel) {
          return {
            authType: AuthType.USE_ANTHROPIC,
            envKey: 'ANTHROPIC_API_KEY',
            baseUrl: 'https://api.anthropic.com',
          };
        }
        return undefined;
      });

      const targetConfig = {
        model: fastModel,
        authType: AuthType.USE_ANTHROPIC,
      };
      mockBuildAgentContentGeneratorConfig.mockReturnValue(targetConfig);
      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      const resolved = await c.resolveForModel(fastModel);

      expect(resolved.contentGenerator).toBe(fastContentGenerator);
      expect(resolved.contentGeneratorConfig).toBe(targetConfig);
      expect(resolved.retryAuthType).toBe(AuthType.USE_ANTHROPIC);
      expect(mockBuildAgentContentGeneratorConfig).toHaveBeenCalledWith(
        crossProviderConfig,
        fastModel,
        expect.objectContaining({
          authType: AuthType.USE_ANTHROPIC,
          baseUrl: 'https://api.anthropic.com',
        }),
      );
      expect(mockCreateContentGenerator).toHaveBeenCalledTimes(1);
    });

    it('does not confuse a qualified cross-provider namesake with the primary', async () => {
      vi.mocked(crossProviderConfig.getModel).mockReturnValue('shared-model');
      getResolvedModel.mockImplementation((authType: string, model: string) =>
        authType === AuthType.USE_ANTHROPIC && model === 'shared-model'
          ? {
              id: 'shared-model',
              authType: AuthType.USE_ANTHROPIC,
              baseUrl: '',
            }
          : undefined,
      );

      const resolved = await new BaseLlmClient(
        mockContentGenerator,
        crossProviderConfig,
      ).resolveForModel('anthropic:shared-model', { failClosed: true });

      expect(resolved.contentGenerator).toBe(fastContentGenerator);
      expect(mockCreateContentGenerator).toHaveBeenCalledOnce();
    });

    it('keeps explicit vision capability on the resolved generator config', async () => {
      getResolvedModel.mockImplementation((authType: string, model: string) =>
        authType === AuthType.USE_ANTHROPIC && model === fastModel
          ? {
              id: fastModel,
              authType: AuthType.USE_ANTHROPIC,
              baseUrl: 'https://api.anthropic.com',
              capabilities: { vision: true },
            }
          : undefined,
      );
      mockBuildAgentContentGeneratorConfig.mockReturnValue({
        model: fastModel,
        authType: AuthType.USE_ANTHROPIC,
        modalities: {},
      });

      const resolved = await new BaseLlmClient(
        mockContentGenerator,
        crossProviderConfig,
      ).resolveForModel(fastModel, { failClosed: true });

      expect(resolved.contentGeneratorConfig.modalities?.image).toBe(true);
      expect(mockCreateContentGenerator).toHaveBeenCalledWith(
        expect.objectContaining({ modalities: { image: true } }),
        crossProviderConfig,
      );
    });

    it('resolves same-id model selectors by baseUrl when provided', async () => {
      const selectedBaseUrl = 'https://token-plan.example.com/v1';
      getResolvedModel.mockImplementation(
        (authType: string, model: string, baseUrl?: string) => {
          if (
            authType === AuthType.USE_OPENAI &&
            model === 'qwen3.7-plus' &&
            baseUrl === selectedBaseUrl
          ) {
            return {
              id: 'qwen3.7-plus',
              authType: AuthType.USE_OPENAI,
              envKey: 'TOKEN_PLAN_KEY',
              baseUrl: selectedBaseUrl,
            };
          }
          return undefined;
        },
      );

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
      const resolved = await c.resolveForModel(
        `openai:qwen3.7-plus\0${selectedBaseUrl}`,
      );

      expect(resolved.contentGenerator).toBe(fastContentGenerator);
      expect(getResolvedModel).toHaveBeenCalledWith(
        AuthType.USE_OPENAI,
        'qwen3.7-plus',
        selectedBaseUrl,
      );
      expect(mockBuildAgentContentGeneratorConfig).toHaveBeenCalledWith(
        crossProviderConfig,
        'qwen3.7-plus',
        expect.objectContaining({
          authType: AuthType.USE_OPENAI,
          baseUrl: selectedBaseUrl,
        }),
      );
    });

    it('hands the saved credential of a model whose variable is not set', async () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-llm-'));
      vi.stubEnv('O1CODE_HOME', home);
      vi.stubEnv('SAVED_MODEL_KEY', undefined);
      try {
        writeCredential('saved-provider', { apiKey: 'from-the-store' });
        getResolvedModel.mockImplementation(
          (authType: string, model: string) =>
            authType === AuthType.USE_OPENAI && model === 'saved-model'
              ? {
                  id: 'saved-model',
                  authType: AuthType.USE_OPENAI,
                  envKey: 'SAVED_MODEL_KEY',
                  credential: 'saved-provider',
                  baseUrl: 'https://saved.example/v1',
                }
              : undefined,
        );

        const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
        await c.resolveForModel('openai:saved-model');

        expect(mockBuildAgentContentGeneratorConfig).toHaveBeenCalledWith(
          crossProviderConfig,
          'saved-model',
          expect.objectContaining({ apiKey: 'from-the-store' }),
        );
      } finally {
        vi.unstubAllEnvs();
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    it('threads baseUrl through bare model registry lookups', async () => {
      const selectedBaseUrl = 'https://token-plan.example.com/v1';
      getResolvedModel.mockImplementation(
        (authType: string, model: string, baseUrl?: string) => {
          if (
            authType === AuthType.USE_ANTHROPIC &&
            model === 'qwen3.7-plus' &&
            baseUrl === selectedBaseUrl
          ) {
            return {
              id: 'qwen3.7-plus',
              authType: AuthType.USE_ANTHROPIC,
              envKey: 'TOKEN_PLAN_KEY',
              baseUrl: selectedBaseUrl,
            };
          }
          return undefined;
        },
      );

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
      await c.resolveForModel(`qwen3.7-plus\0${selectedBaseUrl}`);

      expect(getResolvedModel).toHaveBeenCalledWith(
        AuthType.USE_GEMINI,
        'qwen3.7-plus',
        selectedBaseUrl,
      );
    });

    it('does not reuse the main generator when the requested baseUrl differs', async () => {
      const mainBaseUrl = 'https://main.example.com/v1';
      const selectedBaseUrl = 'https://token-plan.example.com/v1';
      vi.mocked(crossProviderConfig.getModel).mockReturnValue('qwen3.7-plus');
      vi.mocked(crossProviderConfig.getContentGeneratorConfig).mockReturnValue({
        authType: AuthType.USE_OPENAI,
        model: 'qwen3.7-plus',
        baseUrl: mainBaseUrl,
      });
      getResolvedModel.mockImplementation(
        (authType: string, model: string, baseUrl?: string) => {
          if (
            authType === AuthType.USE_OPENAI &&
            model === 'qwen3.7-plus' &&
            baseUrl === selectedBaseUrl
          ) {
            return {
              id: 'qwen3.7-plus',
              authType: AuthType.USE_OPENAI,
              envKey: 'TOKEN_PLAN_KEY',
              baseUrl: selectedBaseUrl,
            };
          }
          return undefined;
        },
      );

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
      const resolved = await c.resolveForModel(
        `openai:qwen3.7-plus\0${selectedBaseUrl}`,
      );

      expect(resolved.contentGenerator).toBe(fastContentGenerator);
      expect(mockCreateContentGenerator).toHaveBeenCalledTimes(1);
      expect(getResolvedModel).toHaveBeenCalledWith(
        AuthType.USE_OPENAI,
        'qwen3.7-plus',
        selectedBaseUrl,
      );
    });

    it('fails closed (throws) for an unregistered model when failClosed is set', async () => {
      getResolvedModel.mockReturnValue(undefined); // not registered anywhere
      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await expect(
        c.resolveForModel('ghost-model', { failClosed: true }),
      ).rejects.toThrow(/not registered/i);
      expect(mockCreateContentGenerator).not.toHaveBeenCalled();
    });

    it('fails closed when the requested baseUrl does not match any registered model', async () => {
      getResolvedModel.mockReturnValue(undefined);
      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await expect(
        c.resolveForModel('openai:real-model\0https://wrong-url.example.com', {
          failClosed: true,
        }),
      ).rejects.toThrow(
        'Model "openai:real-model" at baseUrl "https://wrong-url.example.com" is not registered',
      );
      expect(mockCreateContentGenerator).not.toHaveBeenCalled();
    });

    it('fails closed (throws) when generator creation fails and failClosed is set', async () => {
      getResolvedModel.mockImplementation((authType: string, model: string) =>
        authType === AuthType.USE_ANTHROPIC && model === fastModel
          ? {
              authType: AuthType.USE_ANTHROPIC,
              envKey: 'ANTHROPIC_API_KEY',
              baseUrl: 'https://api.anthropic.com',
            }
          : undefined,
      );
      mockCreateContentGenerator.mockRejectedValue(
        new Error('missing credential'),
      );
      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await expect(
        c.resolveForModel(fastModel, { failClosed: true }),
      ).rejects.toThrow(/missing credential/i);
    });

    it('falls back to the main generator for an unregistered model when failClosed is not set', async () => {
      getResolvedModel.mockReturnValue(undefined);
      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      const resolved = await c.resolveForModel('ghost-model');

      expect(resolved.contentGenerator).toBe(mockContentGenerator);
      expect(mockCreateContentGenerator).not.toHaveBeenCalled();
    });

    it('streams through a per-model generator resolved by model (compression path)', async () => {
      // chatCompressionService passes both `model` and `stream: true`, so the
      // streaming branch must run on the resolveForModel-selected generator,
      // not the constructor-injected default.
      getResolvedModel.mockReturnValue({
        authType: AuthType.USE_ANTHROPIC,
        envKey: 'ANTHROPIC_API_KEY',
      });
      const usage = {
        promptTokenCount: 2,
        candidatesTokenCount: 2,
        totalTokenCount: 4,
      };
      fastGenerateContentStream.mockImplementation(async () =>
        mockTextStream(['fast ', 'stream'], usage),
      );

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
      const result = await c.generateText({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        model: fastModel,
        abortSignal: abortController.signal,
        promptId: 'p',
        stream: true,
      });

      expect(fastGenerateContentStream).toHaveBeenCalledTimes(1);
      // Streamed against the resolved per-model identity, not the main model.
      expect(fastGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: fastModel,
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          config: expect.objectContaining({
            abortSignal: abortController.signal,
          }),
        }),
        'p',
      );
      // The constructor-injected default generator must not be touched.
      expect(mockGenerateContentStream).not.toHaveBeenCalled();
      expect(result.text).toBe('fast stream');
      expect(result.usage).toEqual(usage);
    });

    it('caches the per-model generator across resolveForModel calls', async () => {
      getResolvedModel.mockReturnValue({
        authType: AuthType.USE_ANTHROPIC,
        envKey: 'ANTHROPIC_API_KEY',
      });

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await c.resolveForModel(fastModel);
      await c.resolveForModel(fastModel);

      expect(mockCreateContentGenerator).toHaveBeenCalledTimes(1);
    });

    it('shares a successful per-model generator across failClosed modes', async () => {
      getResolvedModel.mockReturnValue({
        authType: AuthType.USE_ANTHROPIC,
        envKey: 'ANTHROPIC_API_KEY',
      });

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await c.resolveForModel(fastModel, { failClosed: true });
      await c.resolveForModel(fastModel);

      expect(mockCreateContentGenerator).toHaveBeenCalledTimes(1);
    });

    it('clearPerModelGeneratorCache forces a rebuild on the next call', async () => {
      getResolvedModel.mockReturnValue({
        authType: AuthType.USE_ANTHROPIC,
        envKey: 'ANTHROPIC_API_KEY',
      });

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
      await c.resolveForModel(fastModel);
      c.clearPerModelGeneratorCache();
      await c.resolveForModel(fastModel);

      expect(mockCreateContentGenerator).toHaveBeenCalledTimes(2);
    });

    it('falls back to the main generator when the target model is not in the registry', async () => {
      getResolvedModel.mockReturnValue(undefined);

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
      const resolved = await c.resolveForModel('unknown-model');

      expect(resolved.contentGenerator).toBe(mockContentGenerator);
      // Falls back to main authType for retry classification.
      expect(resolved.retryAuthType).toBe(AuthType.USE_GEMINI);
      expect(mockCreateContentGenerator).not.toHaveBeenCalled();
    });

    it('does not cache the unregistered-model fallback across runtime-view changes', async () => {
      // Unregistered selector: createContentGeneratorForModel falls back to
      // getCurrentContentGenerator(). The runtime view changes between calls
      // — caching would pin the first call's generator under the selector
      // key and return it on the second call after the view has unwound.
      getResolvedModel.mockReturnValue(undefined);

      const firstRuntimeGenerator = {
        generateContent: vi.fn(),
        embedContent: vi.fn(),
      } as unknown as Mocked<ContentGenerator>;
      const secondRuntimeGenerator = {
        generateContent: vi.fn(),
        embedContent: vi.fn(),
      } as unknown as Mocked<ContentGenerator>;
      const getContentGenerator = vi
        .fn()
        .mockReturnValueOnce(firstRuntimeGenerator)
        .mockReturnValueOnce(secondRuntimeGenerator);
      crossProviderConfig.getContentGenerator = getContentGenerator;

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      const first = await c.resolveForModel('unknown-model');
      const second = await c.resolveForModel('unknown-model');

      expect(first.contentGenerator).toBe(firstRuntimeGenerator);
      expect(second.contentGenerator).toBe(secondRuntimeGenerator);
      expect(getContentGenerator).toHaveBeenCalledTimes(2);
      expect(mockCreateContentGenerator).not.toHaveBeenCalled();
    });

    it('falls back to the main generator when createContentGenerator throws', async () => {
      getResolvedModel.mockReturnValue({
        authType: AuthType.USE_ANTHROPIC,
        envKey: 'ANTHROPIC_API_KEY',
      });
      mockCreateContentGenerator.mockRejectedValue(
        new Error('SDK init failed'),
      );

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);
      const resolved = await c.resolveForModel(fastModel);

      expect(resolved.contentGenerator).toBe(mockContentGenerator);
      // retryAuthType still reflects the target provider — failure to build
      // the generator does not change which provider's retry policy applies.
      expect(resolved.retryAuthType).toBe(AuthType.USE_ANTHROPIC);
    });

    it('generateJson routes through the per-model generator and forwards retry authType', async () => {
      const retryErrorCodes = [4999];
      getResolvedModel.mockReturnValue({
        authType: AuthType.USE_ANTHROPIC,
        envKey: 'ANTHROPIC_API_KEY',
        generationConfig: {
          retryErrorCodes,
        },
      });
      fastGenerateContent.mockResolvedValue(
        createMockResponseWithFunctionCall({ ok: true }),
      );
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { ok: true } },
      ]);

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await c.generateJson({
        contents: [{ role: 'user', parts: [{ text: 'go' }] }],
        schema: { type: 'object' },
        model: fastModel,
        abortSignal: new AbortController().signal,
        promptId: 'test',
      });

      expect(fastGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          authType: AuthType.USE_ANTHROPIC,
          extraRetryErrorCodes: retryErrorCodes,
        }),
      );
    });

    it('generateJson accepts authType-qualified selectors and sends the bare model id', async () => {
      getResolvedModel.mockImplementation((authType: string, model: string) => {
        if (authType === AuthType.USE_OPENAI && model === 'shared-model') {
          return {
            id: 'shared-model',
            authType: AuthType.USE_OPENAI,
            envKey: 'OPENAI_API_KEY',
          };
        }
        return undefined;
      });
      fastGenerateContent.mockResolvedValue(
        createMockResponseWithFunctionCall({ ok: true }),
      );
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { ok: true } },
      ]);

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await c.generateJson({
        contents: [{ role: 'user', parts: [{ text: 'go' }] }],
        schema: { type: 'object' },
        model: 'openai:shared-model',
        abortSignal: new AbortController().signal,
        promptId: 'test',
      });

      expect(getResolvedModel).toHaveBeenCalledWith(
        AuthType.USE_OPENAI,
        'shared-model',
      );
      expect(mockBuildAgentContentGeneratorConfig).toHaveBeenCalledWith(
        crossProviderConfig,
        'shared-model',
        expect.objectContaining({ authType: AuthType.USE_OPENAI }),
      );
      expect(fastGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'shared-model' }),
        'test',
      );
    });

    it('generateJson resolves fast selectors through the configured fast model', async () => {
      crossProviderConfig.getFastModel.mockReturnValue('openai:shared-model');
      getResolvedModel.mockImplementation((authType: string, model: string) => {
        if (authType === AuthType.USE_OPENAI && model === 'shared-model') {
          return {
            id: 'shared-model',
            authType: AuthType.USE_OPENAI,
            envKey: 'OPENAI_API_KEY',
          };
        }
        return undefined;
      });
      fastGenerateContent.mockResolvedValue(
        createMockResponseWithFunctionCall({ ok: true }),
      );
      vi.mocked(getFunctionCalls).mockReturnValue([
        { name: 'respond_in_schema', args: { ok: true } },
      ]);

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      await c.generateJson({
        contents: [{ role: 'user', parts: [{ text: 'go' }] }],
        schema: { type: 'object' },
        model: 'fast',
        abortSignal: new AbortController().signal,
        promptId: 'test',
      });

      expect(getResolvedModel).toHaveBeenCalledWith(
        AuthType.USE_OPENAI,
        'shared-model',
      );
      expect(mockBuildAgentContentGeneratorConfig).toHaveBeenCalledWith(
        crossProviderConfig,
        'shared-model',
        expect.objectContaining({ authType: AuthType.USE_OPENAI }),
      );
      expect(fastGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'shared-model' }),
        'test',
      );
    });

    it('generateText routes through the per-model generator and forwards retry authType', async () => {
      getResolvedModel.mockReturnValue({
        authType: AuthType.USE_ANTHROPIC,
        envKey: 'ANTHROPIC_API_KEY',
      });
      fastGenerateContent.mockResolvedValue({
        candidates: [
          { content: { role: 'model', parts: [{ text: 'hi' }] }, index: 0 },
        ],
      });

      const c = new BaseLlmClient(mockContentGenerator, crossProviderConfig);

      const result = await c.generateText({
        contents: [{ role: 'user', parts: [{ text: 'say hi' }] }],
        model: fastModel,
        abortSignal: new AbortController().signal,
        promptId: 'test',
      });

      expect(result.text).toBe('hi');
      expect(fastGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ authType: AuthType.USE_ANTHROPIC }),
      );
    });
  });

  describe('window-aware output budget', () => {
    // Limits these cases lean on: `deepseek-r1` is 131_072 in / 65_536 out
    // (default ceiling 64_000), `test-model` is unknown (200_000 in, ceiling
    // 32_000).
    const MODEL = 'deepseek-r1';

    // The estimator charges four characters per token for plain text.
    const promptOfTokens = (tokens: number) => [
      { role: 'user', parts: [{ text: 'x'.repeat(tokens * CHARS_PER_TOKEN) }] },
    ];

    // Makes `model` the session model, so the request takes the same-model
    // route and meets this window. No size leaves the window unconfigured.
    function useWindow(model: string, contextWindowSize?: number) {
      mockConfig.getModel.mockReturnValue(model);
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        model,
        authType: AuthType.USE_GEMINI,
        ...(contextWindowSize === undefined ? {} : { contextWindowSize }),
      });
    }

    type SentConfig = {
      maxOutputTokens?: number;
      thinkingConfig?: { includeThoughts?: boolean; thinkingBudget?: number };
      tools?: unknown;
    };
    const sentConfig = (generator = mockGenerateContent) =>
      (generator.mock.calls.at(-1)?.[0] as { config?: SentConfig } | undefined)
        ?.config;
    const sentBudget = (generator = mockGenerateContent) =>
      sentConfig(generator)?.maxOutputTokens;
    const serializedTokens = (value: unknown) =>
      Math.ceil(JSON.stringify(value).length / CHARS_PER_TOKEN);

    const askText = (
      model: string,
      tokens: number,
      extra: Partial<GenerateTextOptions> = {},
    ) => {
      mockGenerateContent.mockResolvedValue(createMockTextResponse('ok'));
      return client.generateText({
        contents: promptOfTokens(tokens),
        model,
        abortSignal: abortController.signal,
        promptId: 'p',
        ...extra,
      });
    };

    const wideSchema = {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 1_000 }, (_, i) => [
          `field_${i}`,
          { type: 'string', description: `column ${i} of the record` },
        ]),
      ),
    };

    beforeEach(() => {
      vi.mocked(retryWithBackoff).mockImplementation(
        async (fn) => await (fn as () => Promise<unknown>)(),
      );
      vi.mocked(getFunctionCalls).mockReturnValue(undefined);
      // Both are read by the code under test; an ambient value would decide
      // these cases instead of the mocks.
      vi.stubEnv('O1CODE_MAX_OUTPUT_TOKENS', undefined);
      vi.stubEnv('O1CODE_IMAGE_TOKEN_ESTIMATE', undefined);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      mockConfig.getModel.mockReturnValue('test-model');
      mockConfig.getModelsConfig.mockReturnValue(
        undefined as unknown as ReturnType<Config['getModelsConfig']>,
      );
      mockConfig.getChatCompression.mockReturnValue(undefined);
      mockBuildAgentContentGeneratorConfig.mockReset();
      mockCreateContentGenerator.mockReset();
    });

    it('shrinks the request so a large prompt still fits the window', async () => {
      useWindow(MODEL, 131_072);

      await askText(MODEL, 100_000);

      expect(sentBudget()).toBe(31_072);
    });

    it('keeps a smaller caller-supplied maxOutputTokens', async () => {
      useWindow(MODEL, 131_072);

      await askText(MODEL, 100_000, { config: { maxOutputTokens: 300 } });

      expect(sentBudget()).toBe(300);
    });

    it('sends a larger caller-supplied maxOutputTokens as given', async () => {
      useWindow(MODEL, 131_072);

      await askText(MODEL, 100_000, { config: { maxOutputTokens: 60_000 } });

      expect(sentBudget()).toBe(60_000);
    });

    it('prices the schema declaration in JSON mode', async () => {
      useWindow(MODEL, 131_072);
      mockGenerateContent.mockResolvedValue(
        createMockResponseWithFunctionCall({}),
      );

      await client.generateJson({
        contents: promptOfTokens(100_000),
        schema: wideSchema,
        model: MODEL,
        abortSignal: abortController.signal,
        promptId: 'p',
      });

      const schemaTokens = serializedTokens(sentConfig()?.tools);
      expect(schemaTokens).toBeGreaterThan(10_000);
      expect(sentBudget()).toBe(31_072 - schemaTokens);
    });

    it('prices a caller-supplied responseJsonSchema on the text route', async () => {
      useWindow(MODEL, 131_072);

      await askText(MODEL, 100_000, {
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: wideSchema,
        },
      });

      expect(sentBudget()).toBe(31_072 - serializedTokens(wideSchema));
    });

    it('budgets the streaming request too', async () => {
      useWindow(MODEL, 131_072);
      mockGenerateContentStream.mockImplementation(async () =>
        mockTextStream(['ok']),
      );

      await askText(MODEL, 100_000, { stream: true });

      expect(sentBudget(mockGenerateContentStream)).toBe(31_072);
    });

    it('falls back to the model input limit when no window is configured', async () => {
      useWindow(MODEL);

      await askText(MODEL, 100_000);

      expect(sentBudget()).toBe(31_072);
    });

    it('ignores a non-positive configured window', async () => {
      useWindow(MODEL, 0);

      await askText(MODEL, 100_000);

      expect(sentBudget()).toBe(31_072);
    });

    it('leaves the request untouched when the window has room', async () => {
      useWindow(MODEL, 200_000);

      await askText(MODEL, 100_000);

      expect(sentBudget()).toBeUndefined();
    });

    it('does not cap a Gemini side query at its tabled output limit', async () => {
      // That wire applies no output ceiling of its own, so emitting whenever
      // the request has none would newly cap it at the 8_192 row.
      useWindow('gemini-2.5-pro', 1_000_000);

      await askText('gemini-2.5-pro', 100);

      expect(sentBudget()).toBeUndefined();
    });

    it('never requests the whole ceiling on a window smaller than it', async () => {
      useWindow(MODEL, 32_768);

      await askText(MODEL, 100);

      expect(sentBudget()).toBe(32_668);
    });

    it('keeps prompt + max_tokens inside a tight window', async () => {
      useWindow(MODEL, 8_192);

      await askText(MODEL, 5_000);

      expect(sentBudget()).toBe(3_192);
    });

    it('leaves the request uncapped when the prompt already fills the window', async () => {
      useWindow(MODEL, 8_192);

      await askText(MODEL, 9_000);

      expect(sentBudget()).toBeUndefined();
    });

    it('leaves the request uncapped when the room cannot carry an answer', async () => {
      useWindow(MODEL, 8_192);

      await askText(MODEL, 8_180);

      expect(sentBudget()).toBeUndefined();
    });

    it.each<[string, NonNullable<GenerateTextOptions['systemInstruction']>]>([
      ['string', 'y'.repeat(2_000 * 4)],
      ['Content', { role: 'user', parts: [{ text: 'y'.repeat(2_000 * 4) }] }],
      ['Part[]', [{ text: 'y'.repeat(2_000 * 4) }]],
      ['bare Part', { text: 'y'.repeat(2_000 * 4) }],
    ])('counts a %s system instruction against the window', async (_l, si) => {
      useWindow(MODEL, 8_192);

      await askText(MODEL, 100, { systemInstruction: si });

      expect(sentBudget()).toBe(8_192 - 100 - 2_000);
    });

    it('prices a kept image with the configured estimate', async () => {
      mockConfig.getModel.mockReturnValue(MODEL);
      mockConfig.getContentGeneratorConfig.mockReturnValue({
        model: MODEL,
        authType: AuthType.USE_GEMINI,
        contextWindowSize: 32_768,
        // Slimming keeps an image only for a target that declares the modality.
        modalities: { image: true },
      });
      mockConfig.getChatCompression.mockReturnValue({
        imageTokenEstimate: 3_000,
      });
      mockGenerateContent.mockResolvedValue(createMockTextResponse('ok'));

      await client.generateText({
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: 'image/png', data: 'aGk=' } }],
          },
        ],
        model: MODEL,
        abortSignal: abortController.signal,
        promptId: 'p',
      });

      expect(sentBudget()).toBe(32_768 - 3_000);
    });

    it('measures the room on the slimmed payload, not the caller-supplied one', async () => {
      // No image modality: the request carries the 18-character placeholder
      // (5 tokens), not the image the raw part would be charged as.
      useWindow(MODEL, 8_192);
      mockGenerateContent.mockResolvedValue(createMockTextResponse('ok'));

      await client.generateText({
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: 'image/png', data: 'aGk=' } }],
          },
        ],
        model: MODEL,
        abortSignal: abortController.signal,
        promptId: 'p',
      });

      expect(sentBudget()).toBe(8_187);
    });

    it('pairs the emitted budget with a thinking budget', async () => {
      useWindow(MODEL, 65_536);

      await askText(MODEL, 40_000, {
        config: { thinkingConfig: { includeThoughts: true } },
      });

      expect(sentBudget()).toBe(25_536);
      expect(sentConfig()?.thinkingConfig).toEqual({
        includeThoughts: true,
        thinkingBudget: 12_768,
      });
    });

    it('keeps a caller thinking budget that is already below half the room', async () => {
      useWindow(MODEL, 65_536);

      await askText(MODEL, 40_000, {
        config: {
          thinkingConfig: { includeThoughts: true, thinkingBudget: 2_000 },
        },
      });

      expect(sentBudget()).toBe(25_536);
      expect(sentConfig()?.thinkingConfig?.thinkingBudget).toBe(2_000);
    });

    it('leaves a thinking request uncapped when the room cannot host both', async () => {
      useWindow(MODEL, 8_192);

      await askText(MODEL, 7_000, {
        config: { thinkingConfig: { includeThoughts: true } },
      });

      expect(sentBudget()).toBeUndefined();
      expect(sentConfig()?.thinkingConfig).toEqual({ includeThoughts: true });
    });

    it('budgets the no-thoughts shape side queries carry by default', async () => {
      // Same room as the case above, but with no reasoning to pay for the
      // whole of it is visible output.
      useWindow(MODEL, 8_192);

      await askText(MODEL, 7_000, {
        config: { thinkingConfig: { includeThoughts: false } },
      });

      expect(sentBudget()).toBe(1_192);
      expect(sentConfig()?.thinkingConfig).toEqual({ includeThoughts: false });
    });

    it('invents no thinking budget for a no-thoughts request', async () => {
      useWindow(MODEL, 65_536);

      await askText(MODEL, 40_000, {
        config: { thinkingConfig: { includeThoughts: false } },
      });

      expect(sentBudget()).toBe(25_536);
      expect(sentConfig()?.thinkingConfig).toEqual({ includeThoughts: false });
    });

    it('budgets against the target window, not the session window', async () => {
      // The per-model config inherits the session's 8_192; the target declares
      // no window and is tabled at 131_072.
      useWindow('test-model', 8_192);
      mockConfig.getModelsConfig.mockReturnValue({
        getResolvedModel: vi.fn().mockReturnValue({
          id: MODEL,
          authType: AuthType.USE_GEMINI,
          generationConfig: {},
        }),
      } as unknown as ReturnType<Config['getModelsConfig']>);
      mockBuildAgentContentGeneratorConfig.mockReturnValue({
        model: MODEL,
        authType: AuthType.USE_GEMINI,
        contextWindowSize: 8_192,
      });
      const targetGenerateContent = vi
        .fn()
        .mockResolvedValue(createMockTextResponse('ok'));
      mockCreateContentGenerator.mockResolvedValue({
        generateContent: targetGenerateContent,
        generateContentStream: vi.fn(),
        embedContent: vi.fn(),
      });

      await askText(MODEL, 100_000);

      expect(targetGenerateContent).toHaveBeenCalledTimes(1);
      expect(sentBudget(targetGenerateContent)).toBe(31_072);
    });

    it('prefers the window the registry declares for the target', async () => {
      useWindow('test-model', 200_000);
      mockConfig.getModelsConfig.mockReturnValue({
        getResolvedModel: vi.fn().mockReturnValue({
          id: MODEL,
          authType: AuthType.USE_GEMINI,
          generationConfig: { contextWindowSize: 16_384 },
        }),
      } as unknown as ReturnType<Config['getModelsConfig']>);
      mockBuildAgentContentGeneratorConfig.mockReturnValue({
        model: MODEL,
        authType: AuthType.USE_GEMINI,
        contextWindowSize: 16_384,
      });
      const targetGenerateContent = vi
        .fn()
        .mockResolvedValue(createMockTextResponse('ok'));
      mockCreateContentGenerator.mockResolvedValue({
        generateContent: targetGenerateContent,
        generateContentStream: vi.fn(),
        embedContent: vi.fn(),
      });

      await askText(MODEL, 10_000);

      expect(sentBudget(targetGenerateContent)).toBe(6_384);
    });

    it('budgets against the session window when the target model is not registered', async () => {
      // The session generator sends the request, so its window is the one the
      // request meets, while the ceiling still describes the target.
      useWindow('test-model', 8_192);

      await askText(MODEL, 100);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({ model: MODEL }),
        'p',
      );
      expect(sentBudget()).toBe(8_092);
    });

    describe('O1CODE_MAX_OUTPUT_TOKENS', () => {
      const ENV_KEY = 'O1CODE_MAX_OUTPUT_TOKENS';

      it('leaves the request to the provider when the override binds first', async () => {
        // Room 5_000 against an operator ceiling of 2_000: emitting the room
        // would displace the override the provider layer applies itself.
        vi.stubEnv(ENV_KEY, '2000');
        useWindow(MODEL, 5_100);

        await askText(MODEL, 100);

        expect(sentBudget()).toBeUndefined();
      });

      it('treats the override as a ceiling, not a floor', async () => {
        vi.stubEnv(ENV_KEY, '100000');
        useWindow(MODEL, 32_768);

        await askText(MODEL, 100);

        expect(sentBudget()).toBe(32_668);
      });

      it('ignores a malformed override', async () => {
        vi.stubEnv(ENV_KEY, 'not-a-number');
        useWindow(MODEL, 131_072);

        await askText(MODEL, 100_000);

        expect(sentBudget()).toBe(31_072);
      });

      it('lets a caller-supplied maxOutputTokens win over the override', async () => {
        vi.stubEnv(ENV_KEY, '2000');
        useWindow(MODEL, 131_072);

        await askText(MODEL, 100_000, { config: { maxOutputTokens: 4_096 } });

        expect(sentBudget()).toBe(4_096);
      });

      it('compares against an override above the default ceiling', async () => {
        // Room 60_000 sits between the 32_000 default for an unknown id and
        // the override, which replaces that default rather than meeting it.
        vi.stubEnv(ENV_KEY, '100000');
        useWindow('test-model', 60_100);

        await askText('test-model', 100);

        expect(sentBudget()).toBe(60_000);
      });

      it('lets samplingParams.max_tokens outrank the override', async () => {
        vi.stubEnv(ENV_KEY, '2000');
        mockConfig.getModel.mockReturnValue(MODEL);
        mockConfig.getContentGeneratorConfig.mockReturnValue({
          model: MODEL,
          authType: AuthType.USE_GEMINI,
          contextWindowSize: 40_100,
          samplingParams: { max_tokens: 128_000 },
        });

        await askText(MODEL, 100);

        expect(sentBudget()).toBe(40_000);
      });

      it('does not let the override authorize more than a known model can emit', async () => {
        // Room 172_000 is under the override but over the 131_072 the model
        // can emit, so the override is read as that limit and nothing is sent.
        vi.stubEnv(ENV_KEY, '200000');
        useWindow('gpt-5', 272_000);

        await askText('gpt-5', 100_000);

        expect(sentBudget()).toBeUndefined();
      });
    });
  });
});
