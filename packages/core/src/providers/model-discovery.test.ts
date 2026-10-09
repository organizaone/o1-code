/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithPolicy } from '../utils/fetch.js';
import { checkProviderKey } from './model-discovery.js';

vi.mock('../utils/fetch.js', () => ({ fetchWithPolicy: vi.fn() }));

const fetchMock = vi.mocked(fetchWithPolicy);

const respond = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({
    kind: 'response',
    status,
    body: Buffer.from(JSON.stringify(body)),
  } as unknown as Awaited<ReturnType<typeof fetchWithPolicy>>);

const models = { data: [{ id: 'model-a' }, { id: 'model-b' }] };

describe('checkProviderKey', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('accepts a key the provider serves models for', async () => {
    respond(200, models);
    const result = await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.example.test/v1/',
      apiKey: ' sk-good ',
      staticModels: [],
    });
    expect(result).toEqual({
      status: 'ok',
      models: [{ id: 'model-a' }, { id: 'model-b' }],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/models');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-good' });
  });

  it('identifies o1-code to the OrganizaOne proxy', async () => {
    for (const baseUrl of ['https://api.organizago.com/v1']) {
      fetchMock.mockReset();
      respond(200, models);
      await checkProviderKey({
        protocol: 'openai',
        baseUrl,
        apiKey: 'device-token',
        staticModels: [],
        clientVersion: '1.2.3',
      });
      const [, init] = fetchMock.mock.calls[0]!;
      expect(init?.headers).toMatchObject({
        'User-Agent': `O1Code/1.2.3 (${process.platform}; ${process.arch})`,
        'X-Title': 'o1-code',
      });
    }
  });

  it('sends no identity headers to other providers', async () => {
    respond(200, models);
    await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-good',
      staticModels: [],
      clientVersion: '1.2.3',
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).not.toHaveProperty('User-Agent');
    expect(init?.headers).not.toHaveProperty('X-Title');
  });

  it('takes the whole ladder only for an owner that names Claude', async () => {
    respond(200, {
      data: [
        { id: 'suffixed', owned_by: 'claude-bridge' },
        { id: 'lookalike', owned_by: 'claudette' },
      ],
    });
    const result = await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-good',
      staticModels: [],
    });
    expect(result).toEqual({
      status: 'ok',
      models: [
        {
          id: 'suffixed',
          capabilities: {
            reasoning: {
              thinking: true,
              efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
              disableField: 'reasoning_effort',
            },
          },
        },
        { id: 'lookalike' },
      ],
    });
  });

  it('drops a default level the model does not list', async () => {
    respond(200, {
      data: [
        { id: 'a', reasoning: { efforts: ['low', 'high'], default: 'max' } },
        { id: 'b', reasoning: { efforts: ['low'], default: null } },
      ],
    });
    const result = await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-good',
      staticModels: [],
    });
    expect(result).toMatchObject({
      models: [
        { id: 'a', capabilities: { reasoning: { efforts: ['low', 'high'] } } },
        { id: 'b', capabilities: { reasoning: { efforts: ['low'] } } },
      ],
    });
    const found = (result as { models: Array<{ capabilities?: unknown }> })
      .models;
    for (const model of found) {
      expect(model.capabilities).not.toHaveProperty('reasoning.defaultEffort');
    }
  });

  it('reads the reasoning effort each model declares', async () => {
    respond(200, {
      data: [
        {
          id: 'declared',
          reasoning: { efforts: ['max', 'low', 'bogus'], default: 'low' },
        },
        { id: 'cli-run', owned_by: 'claude' },
        { id: 'passthrough', owned_by: 'zai' },
      ],
    });
    const result = await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-good',
      staticModels: [],
    });
    expect(result).toEqual({
      status: 'ok',
      models: [
        {
          id: 'declared',
          capabilities: {
            reasoning: {
              thinking: true,
              efforts: ['low', 'max'],
              defaultEffort: 'low',
              disableField: 'reasoning_effort',
            },
          },
        },
        {
          id: 'cli-run',
          capabilities: {
            reasoning: {
              thinking: true,
              efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
              disableField: 'reasoning_effort',
            },
          },
        },
        { id: 'passthrough' },
      ],
    });
  });

  it('reads what each model takes and its limits from the list', async () => {
    respond(200, {
      data: [
        {
          id: 'glm-5v',
          context_length: 128000,
          architecture: {
            input_modalities: ['text', 'image'],
            output_modalities: ['text'],
          },
          top_provider: { max_completion_tokens: 8192, context_length: 128000 },
        },
        {
          id: 'claude-sonnet-4-5',
          architecture: { input_modalities: ['text', 'image', 'file'] },
        },
        {
          id: 'omni',
          architecture: { input_modalities: ['text', 'audio', 'video'] },
        },
        { id: 'text-only', architecture: { input_modalities: ['text'] } },
      ],
    });
    const result = await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.organizago.com/v1',
      apiKey: 'device-token',
      staticModels: [],
    });
    const none = { image: false, pdf: false, audio: false, video: false };
    expect(result).toEqual({
      status: 'ok',
      models: [
        {
          id: 'glm-5v',
          contextWindowSize: 128000,
          modalities: { ...none, image: true },
          maxOutputTokens: 8192,
        },
        {
          id: 'claude-sonnet-4-5',
          modalities: { ...none, image: true, pdf: true },
        },
        { id: 'omni', modalities: { ...none, audio: true, video: true } },
        { id: 'text-only', modalities: none },
      ],
    });
  });

  it('leaves unknown what the list does not state, or states badly', async () => {
    respond(200, {
      data: [
        { id: 'bare' },
        {
          id: 'odd',
          context_length: -1,
          architecture: { input_modalities: 'image' },
          top_provider: { max_completion_tokens: null },
        },
      ],
    });
    const result = await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.organizago.com/v1',
      apiKey: 'device-token',
      staticModels: [],
    });
    expect(result).toEqual({
      status: 'ok',
      models: [{ id: 'bare' }, { id: 'odd' }],
    });
  });

  it('lets the list override the preset for what it states, and keeps the rest', async () => {
    respond(200, {
      data: [
        {
          id: 'model-a',
          context_length: 64000,
          architecture: { input_modalities: ['text'] },
        },
        { id: 'model-b' },
      ],
    });
    const result = await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-good',
      staticModels: [
        {
          id: 'model-a',
          description: 'Preset',
          contextWindowSize: 200000,
          modalities: { image: true },
        },
        { id: 'model-b', contextWindowSize: 32000 },
      ],
    });
    expect(result).toEqual({
      status: 'ok',
      models: [
        {
          id: 'model-a',
          description: 'Preset',
          contextWindowSize: 64000,
          modalities: { image: false, pdf: false, audio: false, video: false },
        },
        { id: 'model-b', contextWindowSize: 32000 },
      ],
    });
  });

  it('reports a key the provider refuses', async () => {
    respond(401);
    await expect(
      checkProviderKey({
        protocol: 'openai',
        baseUrl: 'https://api.example.test/v1',
        apiKey: 'sk-bad',
        staticModels: [],
      }),
    ).resolves.toEqual({ status: 'rejected', httpStatus: 401 });
  });

  it('asks an Anthropic-protocol provider the way its API expects', async () => {
    respond(200, models);
    await checkProviderKey({
      protocol: 'anthropic',
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'sk-ant',
      staticModels: [],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://models.example.test/v1/models');
    expect(init?.headers).toMatchObject({
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01',
    });
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it.each([
    'https://models.example.test/v1/',
    'https://models.example.test',
    'https://models.example.test/',
  ])(
    'asks an Anthropic-protocol provider at /v1/models for base %s',
    async (baseUrl) => {
      respond(200, models);
      await checkProviderKey({
        protocol: 'anthropic',
        baseUrl,
        apiKey: 'sk-ant',
        staticModels: [],
      });
      expect(fetchMock.mock.calls[0]![0]).toBe(
        'https://models.example.test/v1/models',
      );
    },
  );

  it('cannot tell when the provider has no model list', async () => {
    respond(404);
    await expect(
      checkProviderKey({
        protocol: 'openai',
        baseUrl: 'https://api.example.test/v1',
        apiKey: 'sk',
        staticModels: [],
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('cannot tell when a 2xx answer is not a model list', async () => {
    // A wrong base URL can answer 200 with an HTML page.
    fetchMock.mockResolvedValue({
      kind: 'response',
      status: 200,
      body: Buffer.from('<html>welcome</html>'),
    } as unknown as Awaited<ReturnType<typeof fetchWithPolicy>>);
    await expect(
      checkProviderKey({
        protocol: 'openai',
        baseUrl: 'https://api.example.test/v1',
        apiKey: 'sk',
        staticModels: [],
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('asks an OpenRouter base URL only for its model list', async () => {
    respond(200, models);
    await checkProviderKey({
      protocol: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1/',
      apiKey: 'sk-or',
      staticModels: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://openrouter.ai/api/v1/models',
    );
  });

  it('cannot tell when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(
      checkProviderKey({
        protocol: 'openai',
        baseUrl: 'https://api.example.test/v1',
        apiKey: 'sk',
        staticModels: [],
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('asks a Gemini-protocol provider at /v1beta/models with its key header', async () => {
    respond(200, {
      models: [
        {
          name: 'models/gemini-2.5-pro',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/text-embedding-004',
          supportedGenerationMethods: ['embedContent'],
        },
        { name: 'models/gemini-2.5-flash' },
        {
          name: 'models/gemini-2.5-flash-lite',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    });
    const result = await checkProviderKey({
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.example.test/',
      apiKey: ' gm-key ',
      staticModels: [],
    });
    expect(result).toEqual({
      status: 'ok',
      models: [{ id: 'gemini-2.5-pro' }, { id: 'gemini-2.5-flash-lite' }],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.example.test/v1beta/models');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'gm-key' });
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it.each([400, 403])(
    'reports a Gemini key the provider refuses with %s',
    async (status) => {
      respond(status);
      await expect(
        checkProviderKey({
          protocol: 'gemini',
          baseUrl: 'https://generativelanguage.example.test',
          apiKey: 'bad',
          staticModels: [],
        }),
      ).resolves.toEqual({ status: 'rejected', httpStatus: status });
    },
  );

  it('cannot tell when a Gemini answer lists no content model', async () => {
    respond(200, {
      models: [
        {
          name: 'models/text-embedding-004',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    });
    await expect(
      checkProviderKey({
        protocol: 'gemini',
        baseUrl: 'https://generativelanguage.example.test',
        apiKey: 'key',
        staticModels: [],
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
