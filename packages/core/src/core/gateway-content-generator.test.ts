/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content } from '@google/genai';
import { Config } from '../config/config.js';
import { AuthType, type ContentGeneratorConfig } from './contentGenerator.js';
import { GatewayContentGenerator } from './gateway-content-generator.js';
import { BaseLlmClient } from './baseLlmClient.js';
import { createOpenAIContentGenerator } from './openaiContentGenerator/index.js';
import { AnthropicContentGenerator } from './anthropicContentGenerator/anthropicContentGenerator.js';
import { preloadRuntimeFetchModule } from '../utils/runtimeFetchOptions.js';
import type {
  ChatRecordingService,
  ChatRecord,
  GatewayConversationRecordPayload,
} from '../services/chatRecordingService.js';
import { createGatewayIndependentRequest } from '../providers/gateway-request.js';
import { classifyRetryError } from '../utils/retryErrorClassification.js';
import { runWithAgentContext } from '../agents/runtime/agent-context.js';
import {
  gatewayTransferFingerprint,
  stageGatewayTransfer,
  registerGatewayTransferConfirmation,
} from '../providers/gateway-transfer.js';
import type { ResolvedModelConfig } from '../models/types.js';

interface CapturedRequest {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
  path: string;
}
let server: Server;
let baseUrl: string;
let work: string;
let requests: CapturedRequest[];
let replyStatus: number;
let transferExpired: boolean;
let transferStatus: number;
let streamError: boolean;
let operationCapabilities: boolean;
let groupProposal: boolean;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'o1-gateway-client-'));
  vi.stubEnv('O1CODE_HOME', work);
  requests = [];
  replyStatus = 200;
  transferExpired = false;
  transferStatus = 200;
  streamError = false;
  operationCapabilities = true;
  groupProposal = false;
  await preloadRuntimeFetchModule();
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    if (req.url === '/v1/key') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: operationCapabilities
            ? {
                conversation_operations: {
                  version: 1,
                  purposes: ['title', 'summary', 'compaction', 'suggestion'],
                },
              }
            : {},
        }),
      );
      return;
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    requests.push({ headers: req.headers, body, path: req.url ?? '' });
    if (req.url === '/v1/conversations/transfer') {
      res.setHeader('content-type', 'application/json');
      if (transferStatus !== 200) {
        res.writeHead(transferStatus, { 'retry-after': '30' });
        res.end(
          JSON.stringify({
            error: {
              code: 'rate_limit_exceeded',
              message: 'Synthetic preparation limit',
            },
          }),
        );
        return;
      }
      res.end(
        JSON.stringify({
          transfer_token: 'synthetic-transfer-only',
          expires_in: transferExpired ? 0 : 60,
          destination_account_id: 3,
        }),
      );
      return;
    }
    if (replyStatus !== 200 && !req.headers['x-o1gw-conversation-transfer']) {
      res.writeHead(replyStatus, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ...(groupProposal
            ? {
                conversation_transfer: {
                  requires_confirmation: true,
                  prepare_endpoint: '/v1/conversations/transfer',
                  model: body['model'],
                  cause: 'limit',
                },
              }
            : {}),
          error: {
            type: 'invalid_request_error',
            code: 'conversation_unavailable',
            message: 'Synthetic conflict',
          },
        }),
      );
      return;
    }
    const anthropic = req.url === '/v1/messages';
    if (!body['stream']) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify(
          anthropic
            ? {
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                model: body['model'],
                content: [{ type: 'text', text: 'final-marker' }],
                stop_reason: 'end_turn',
                usage: { input_tokens: 10, output_tokens: 2 },
              }
            : {
                id: 'chatcmpl-test',
                object: 'chat.completion',
                model: body['model'],
                choices: [
                  {
                    index: 0,
                    message: { role: 'assistant', content: 'final-marker' },
                    finish_reason: 'stop',
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 2,
                  total_tokens: 12,
                },
              },
        ),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const event = (name: string, data: unknown) =>
      res.write(
        `${name ? `event: ${name}\n` : ''}data: ${JSON.stringify(data)}\n\n`,
      );
    if (streamError) {
      event('error', {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          code: 'conversation_unavailable',
          message: 'Synthetic stream conflict',
        },
      });
      res.end();
      return;
    }
    if (anthropic) {
      event('message_start', {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: body['model'],
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      });
      event('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      event('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'progress-marker\n' },
      });
      event('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'final-marker' },
      });
      event('content_block_stop', { type: 'content_block_stop', index: 0 });
      event('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 2 },
      });
      event('message_stop', { type: 'message_stop' });
    } else {
      const chunk = (content: string, finish: string | null = null) => ({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        model: body['model'],
        choices: [{ index: 0, delta: { content }, finish_reason: finish }],
      });
      event('', chunk('progress-marker\n'));
      event('', chunk('final-marker'));
      event('', chunk('', 'stop'));
      res.write('data: [DONE]\n\n');
    }
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(work, { recursive: true, force: true });
});

async function client(
  authType: AuthType,
  sessionId = randomUUID(),
  restored: ChatRecord[] = [],
) {
  const model = 'o1gw/account/copilot/2/auto';
  const config = new Config({
    targetDir: work,
    cwd: work,
    debugMode: false,
    model,
    sessionId,
  });
  const records: GatewayConversationRecordPayload[] = [];
  const recordSessionModel = vi.fn(async () => {});
  vi.spyOn(config, 'getChatRecordingService').mockReturnValue({
    recordSessionModel,
    recordGatewayConversation: async (
      payload: GatewayConversationRecordPayload,
    ) => {
      records.push(structuredClone(payload));
    },
  } as unknown as ChatRecordingService);
  if (restored.length)
    vi.spyOn(config, 'getResumedSessionData').mockReturnValue({
      conversation: {
        sessionId,
        projectHash: 'synthetic',
        startTime: '',
        lastUpdated: '',
        messages: restored,
      },
      filePath: '',
      lastCompletedUuid: null,
    });
  const settings: ContentGeneratorConfig = {
    model,
    authType,
    apiKey: 'synthetic-only',
    baseUrl: authType === AuthType.USE_OPENAI ? `${baseUrl}/v1` : baseUrl,
    reasoningRouteBaseUrl: 'https://api.organizaone.com',
    connection: 'o1-connect',
    maxRetries: 4,
  };
  vi.spyOn(config, 'getContentGeneratorConfig').mockReturnValue(settings);
  const raw =
    authType === AuthType.USE_OPENAI
      ? createOpenAIContentGenerator(settings, config)
      : new AnthropicContentGenerator(settings, config);
  const generator = new GatewayContentGenerator(raw, config, settings);
  vi.spyOn(config, 'getContentGenerator').mockReturnValue(generator);
  return {
    recordSessionModel,
    generator,
    model,
    records,
    sessionId,
    config,
    settings,
  };
}

describe.each([AuthType.USE_OPENAI, AuthType.USE_ANTHROPIC])(
  'gateway HTTP request construction: %s',
  (authType) => {
    it('records whether workflow was declared without treating its schema as execution permission', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        {
          model: current.model,
          contents: 'first',
          config: {
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'workflow',
                    parametersJsonSchema: { type: 'object' },
                  },
                ],
              },
            ],
          },
        },
        'first',
      );
      expect(current.records.at(-1)).toMatchObject({
        phase: 'complete',
        workflowToolDeclared: true,
        toolSnapshotPolicy: 'gateway-v1',
      });
      expect(current.config.isWorkflowsEnabled()).toBe(false);
    });

    it.each(['credential', 'headers', 'transport'])(
      'invalidates consent after a change of %s before sending history',
      async (condition) => {
        const current = await client(authType);
        await current.generator.generateContent(
          { model: current.model, contents: 'first' },
          'first',
        );
        const confirmed = vi.fn(async () => {});
        stageGatewayTransfer(current.config, {
          sessionId: current.sessionId,
          sourceModel: current.model,
          destinationModel: 'o1gw/account/copilot/3/auto',
          sourceFingerprint: gatewayTransferFingerprint(current.settings),
          onConfirmed: confirmed,
        });
        if (condition === 'credential')
          current.settings.apiKey = 'synthetic-replacement-device';
        else if (condition === 'headers')
          current.settings.customHeaders = {
            authorization: 'Bearer synthetic-replacement-device',
          };
        else current.settings.connection = undefined;
        await expect(
          current.generator.generateContent(
            { model: current.model, contents: 'next' },
            'changed-authorization',
          ),
        ).rejects.toMatchObject({ reason: 'unsupported' });
        expect(requests).toHaveLength(1);
        expect(confirmed).not.toHaveBeenCalled();
      },
    );

    it('preserves preparation status and Retry-After without dispatching to the destination', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'first' },
        'first',
      );
      transferStatus = 429;
      const confirmed = vi.fn(async () => {});
      stageGatewayTransfer(current.config, {
        sessionId: current.sessionId,
        sourceModel: current.model,
        destinationModel: 'o1gw/account/copilot/3/auto',
        sourceFingerprint: gatewayTransferFingerprint(current.settings),
        onConfirmed: confirmed,
      });
      let caught: unknown;
      try {
        await current.generator.generateContent(
          { model: current.model, contents: 'next' },
          'transfer',
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        status: 429,
        providerCode: 'rate_limit_exceeded',
      });
      expect((caught as { headers: Headers }).headers.get('retry-after')).toBe(
        '30',
      );
      expect(requests).toHaveLength(2);
      expect(confirmed).not.toHaveBeenCalled();
    });

    it('treats an HTTP 408 as uncertain execution and blocks transfer or replay', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'first' },
        'first',
      );
      replyStatus = 408;
      await expect(
        current.generator.generateContent(
          { model: current.model, contents: 'next' },
          'timeout',
        ),
      ).rejects.toMatchObject({ reason: 'uncertain', status: 408 });
      expect(current.records.at(-1)?.phase).toBe('uncertain');
      await expect(
        current.generator.generateContent(
          { model: 'o1gw/account/copilot/3/auto', contents: 'no transfer' },
          'after-timeout',
        ),
      ).rejects.toMatchObject({ reason: 'uncertain' });
      expect(requests).toHaveLength(2);
    });

    it('discards consent from another session when starting an empty conversation', async () => {
      const current = await client(authType);
      const confirmed = vi.fn(async () => {});
      stageGatewayTransfer(current.config, {
        sessionId: current.sessionId,
        sourceModel: current.model,
        destinationModel: 'o1gw/account/copilot/3/auto',
        sourceFingerprint: gatewayTransferFingerprint(current.settings),
        onConfirmed: confirmed,
      });
      const newSession = randomUUID();
      vi.spyOn(current.config, 'getSessionId').mockReturnValue(newSession);
      await current.generator.generateContent(
        { model: current.model, contents: 'empty new conversation' },
        'new',
      );
      expect(requests).toHaveLength(1);
      expect(requests[0].headers['x-o1gw-conversation-id']).toBe(newSession);
      expect(
        requests[0].headers['x-o1gw-conversation-transfer'],
      ).toBeUndefined();
      expect(confirmed).not.toHaveBeenCalled();
    });

    it('rejects generation settings that replace the exact selected route on the wire', async () => {
      const current = await client(authType);
      current.settings.extra_body = { model: 'auto' };
      const attempt = current.generator.generateContent(
        { model: current.model, contents: 'opening' },
        'override',
      );
      if (authType === AuthType.USE_OPENAI) {
        await expect(attempt).rejects.toMatchObject({ reason: 'unsupported' });
        expect(requests).toHaveLength(0);
        expect(current.records.at(-1)?.phase).toBe('refused');
      } else {
        await attempt;
        expect(requests[0].body['model']).toBe(current.model);
      }
    });

    it('preserves literal tool names, call IDs, and text alongside tool results', async () => {
      const current = await client(authType);
      const name = 'mcp__bridge__literal_tool';
      const config = {
        tools: [
          {
            functionDeclarations: [
              {
                name,
                parametersJsonSchema: { type: 'object', properties: {} },
              },
            ],
          },
        ],
      };
      await current.generator.generateContent(
        { model: current.model, contents: 'opening', config },
        'first',
      );
      await current.generator.generateContent(
        {
          model: current.model,
          config,
          contents: [
            { role: 'user', parts: [{ text: 'opening' }] },
            {
              role: 'model',
              parts: [
                { functionCall: { id: 'literal-call-id', name, args: {} } },
              ],
            },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    id: 'literal-call-id',
                    name,
                    response: { output: 'tool-result-marker' },
                  },
                },
                { text: 'additional-user-text-marker' },
              ],
            },
          ],
        },
        'tools',
      );
      const wire = JSON.stringify(requests.at(-1)?.body);
      expect(wire).toContain(name);
      expect(wire).toContain('literal-call-id');
      expect(wire).toContain('tool-result-marker');
      expect(wire).toContain('additional-user-text-marker');
      expect(requests).toHaveLength(2);
      expect(
        requests.every(
          (row) => row.headers['x-o1gw-conversation-id'] === current.sessionId,
        ),
      ).toBe(true);
    });

    it('never redirects embeddings from an exact conversation account to another model', async () => {
      const current = await client(authType);
      await expect(
        current.generator.embedContent({
          model: 'text-embedding-3-small',
          contents: 'synthetic input',
        }),
      ).rejects.toMatchObject({ reason: 'unsupported' });
      expect(requests).toHaveLength(0);
    });

    it('keeps runtime reminders separate from authenticated user text without changing local history', async () => {
      const current = await client(authType);
      const contents: Content[] = [
        {
          role: 'user',
          parts: [
            { text: '<system-reminder>startup context</system-reminder>' },
            { text: 'actual-user-marker' },
            { text: '<system-reminder>runtime context</system-reminder>' },
          ],
        },
      ];
      const original = structuredClone(contents);
      await current.generator.generateContent(
        { model: current.model, contents },
        'reminders',
      );
      const messages = requests[0].body['messages'] as Array<{
        role: string;
        content: unknown;
      }>;
      const users = messages.filter((message) => message.role === 'user');
      expect(users).toHaveLength(authType === AuthType.USE_OPENAI ? 3 : 1);
      if (authType === AuthType.USE_OPENAI) {
        expect(JSON.stringify(users[1].content)).toContain(
          'actual-user-marker',
        );
        expect(JSON.stringify(users[1].content)).not.toContain(
          'system-reminder',
        );
      }
      expect(contents).toEqual(original);
    });

    it('gives independent agents separate HTTP identities without changing the parent selection', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'parent-opening' },
        'parent',
      );
      await Promise.all(
        ['agent-one', 'agent-two'].map((actor) =>
          runWithAgentContext(actor, () =>
            current.generator.generateContent(
              { model: current.model, contents: 'independent-task' },
              actor,
            ),
          ),
        ),
      );
      const identities = requests.map(
        (row) => row.headers['x-o1gw-conversation-id'],
      );
      expect(new Set(identities).size).toBe(3);
      expect(identities[0]).toBe(current.sessionId);
      expect(current.recordSessionModel).toHaveBeenCalledOnce();
    });

    it('isolates simultaneous identical openings and preserves full aliases and observable history', async () => {
      const left = await client(authType);
      const right = await client(authType);
      const contents: Content[] = [
        { role: 'user', parts: [{ text: 'same-opening' }] },
      ];
      await Promise.all(
        [left, right].map(async (current) => {
          const stream = await current.generator.generateContentStream(
            { model: current.model, contents },
            'main',
          );
          let text = '';
          for await (const chunk of stream)
            text +=
              chunk.candidates?.[0]?.content?.parts
                ?.map((part) => part.text ?? '')
                .join('') ?? '';
          expect(text).toContain('progress-marker');
          expect(text).toContain('final-marker');
          await current.generator.generateContent(
            {
              model: current.model,
              contents: [
                ...contents,
                { role: 'model', parts: [{ text }] },
                { role: 'user', parts: [{ text: 'continue' }] },
              ],
            },
            'next',
          );
        }),
      );
      expect(
        new Set(requests.map((row) => row.headers['x-o1gw-conversation-id'])),
      ).toEqual(new Set([left.sessionId, right.sessionId]));
      expect(requests.every((row) => row.body['model'] === left.model)).toBe(
        true,
      );
      expect(
        requests.every(
          (row) => row.headers['x-o1gw-operation-id'] === undefined,
        ),
      ).toBe(true);
      expect(left.records.at(-1)?.phase).toBe('complete');
    });

    it('restores a recorded identity but refuses legacy and copied histories before HTTP', async () => {
      const first = await client(authType);
      await first.generator.generateContent(
        { model: first.model, contents: 'opening' },
        'first',
      );
      const metadata = {
        sessionId: first.sessionId,
        type: 'system',
        subtype: 'gateway_conversation',
        systemPayload: first.records.at(-1),
      } as ChatRecord;
      const resumed = await client(authType, first.sessionId, [metadata]);
      const contents: Content[] = [
        { role: 'user', parts: [{ text: 'opening' }] },
        { role: 'model', parts: [{ text: 'final-marker' }] },
        { role: 'user', parts: [{ text: 'continue' }] },
      ];
      await resumed.generator.generateContent(
        { model: first.model, contents },
        'resumed',
      );
      expect(requests.at(-1)?.headers['x-o1gw-conversation-id']).toBe(
        first.sessionId,
      );
      const legacy = await client(authType);
      await expect(
        legacy.generator.generateContent(
          { model: first.model, contents },
          'legacy',
        ),
      ).rejects.toMatchObject({ reason: 'legacy' });
      expect(requests).toHaveLength(2);
    });

    it('negotiates independent purposes and never leaks headers into the main conversation', async () => {
      const current = await client(authType);
      const title = createGatewayIndependentRequest('title');
      const summary = createGatewayIndependentRequest('summary');
      await Promise.all(
        [title, summary].map((independent) =>
          current.generator.generateContent(
            {
              model: current.model,
              contents: 'source-material',
              ...{ gatewayIndependentRequest: independent },
            },
            'auxiliary',
          ),
        ),
      );
      expect(
        requests.map((row) => row.headers['x-o1gw-operation-id']).sort(),
      ).toEqual([title.id, summary.id].sort());
      await current.generator.generateContent(
        { model: current.model, contents: 'main-input' },
        'main',
      );
      expect(requests.at(-1)?.headers['x-o1gw-operation-id']).toBeUndefined();
      expect(requests.at(-1)?.headers['x-o1gw-conversation-id']).toBe(
        current.sessionId,
      );
    });

    it('fails conflicts once even when the SDK is configured to retry', async () => {
      const current = await client(authType);
      replyStatus = 409;
      let caught: unknown;
      try {
        await current.generator.generateContent(
          { model: current.model, contents: 'opening' },
          'main',
        );
      } catch (error) {
        caught = error;
      }
      expect(
        classifyRetryError(caught, { extraRetryErrorCodes: [409] }).diagnosis,
      ).toBe('fail-fast');
      expect(requests).toHaveLength(1);
    });

    it('retains the identity when continuing one auxiliary operation', async () => {
      const current = await client(authType);
      const operation = createGatewayIndependentRequest('summary');
      for (const source of ['first source', 'additional source'])
        await current.generator.generateContent(
          {
            model: current.model,
            contents: source,
            ...{ gatewayIndependentRequest: operation },
          },
          'auxiliary',
        );
      expect(requests).toHaveLength(2);
      expect(
        requests.every(
          (row) =>
            row.headers['x-o1gw-operation-id'] === operation.id &&
            row.headers['x-o1gw-conversation-id'] === current.sessionId,
        ),
      ).toBe(true);
    });

    it('refuses unadvertised auxiliary capability without blocking the main conversation', async () => {
      const current = await client(authType);
      operationCapabilities = false;
      await expect(
        current.generator.generateContent(
          {
            model: current.model,
            contents: 'source',
            ...{
              gatewayIndependentRequest:
                createGatewayIndependentRequest('title'),
            },
          },
          'auxiliary',
        ),
      ).rejects.toMatchObject({ reason: 'unsupported' });
      expect(requests).toHaveLength(0);
      await current.generator.generateContent(
        { model: current.model, contents: 'main' },
        'main',
      );
      expect(requests).toHaveLength(1);
      expect(requests[0].headers['x-o1gw-operation-id']).toBeUndefined();
    });

    it('constructs utility source input through the real base client without replaying assistant or tool history', async () => {
      const current = await client(authType);
      const utility = new BaseLlmClient(current.generator, current.config);
      await utility.generateText({
        model: current.model,
        gatewayPurpose: 'summary',
        contents: [
          { role: 'user', parts: [{ text: 'source-user-marker' }] },
          { role: 'model', parts: [{ text: 'source-assistant-marker' }] },
        ],
        abortSignal: new AbortController().signal,
        maxAttempts: 1,
      });
      expect(requests.at(-1)?.headers['x-o1gw-operation-purpose']).toBe(
        'summary',
      );
      expect(requests.at(-1)?.body['messages']).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      );
      const messages = requests.at(-1)?.body['messages'] as Array<{
        role: string;
      }>;
      expect(
        messages.some(
          (message) => message.role === 'assistant' || message.role === 'tool',
        ),
      ).toBe(false);
      expect(JSON.stringify(requests.at(-1)?.body)).toContain(
        'source-assistant-marker',
      );
    });

    it.each(['ask', 'forbid', 'generic-429'])(
      'handles group %s without treating a generic limit as transfer consent',
      async (policy) => {
        const current = await client(authType);
        const model = 'o1gw/group/copilot/1/auto';
        vi.spyOn(current.config, 'getResolvedModelConfig').mockReturnValue({
          capabilities: {
            gateway: {
              group: {
                id: 1,
                provider: 'copilot',
                continuationPolicy: policy === 'forbid' ? 'forbid' : 'ask',
                continuationPolicies: ['forbid', 'ask', 'automatic'],
                automaticConditions: ['limit'],
              },
            },
          },
        } as ResolvedModelConfig);
        const consent = vi.fn(async () => true);
        const unregister = registerGatewayTransferConfirmation(
          current.config,
          consent,
        );
        try {
          await current.generator.generateContent(
            { model, contents: 'group opening' },
            'first',
          );
          replyStatus = policy === 'generic-429' ? 429 : 409;
          groupProposal = true;
          const attempt = current.generator.generateContent(
            { model, contents: 'group next' },
            'next',
          );
          if (policy === 'ask') {
            await attempt;
            expect(consent).toHaveBeenCalledOnce();
            const prepared = requests.find(
              (row) => row.path === '/v1/conversations/transfer',
            );
            expect(prepared?.body['request']).toEqual(requests.at(-1)?.body);
            expect(
              requests.at(-1)?.headers['x-o1gw-conversation-transfer'],
            ).toBe('synthetic-transfer-only');
          } else {
            await expect(attempt).rejects.toMatchObject({
              code: 'gateway_conversation_error',
            });
            expect(consent).not.toHaveBeenCalled();
            expect(requests).toHaveLength(2);
          }
        } finally {
          unregister();
        }
      },
    );

    it('refuses changed main system or tool contracts before sending another request', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        {
          model: current.model,
          contents: 'first',
          config: { systemInstruction: 'stable-system' },
        },
        'first',
      );
      await expect(
        current.generator.generateContent(
          {
            model: current.model,
            contents: 'second',
            config: { systemInstruction: 'changed-system' },
          },
          'second',
        ),
      ).rejects.toMatchObject({ reason: 'conflict' });
      expect(requests).toHaveLength(1);
    });

    it('rejects account and group changes without scoped consent before HTTP', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'first' },
        'first',
      );
      await expect(
        current.generator.generateContent(
          { model: 'o1gw/account/copilot/3/auto', contents: 'next' },
          'next',
        ),
      ).rejects.toMatchObject({ reason: 'unsupported' });
      await expect(
        current.generator.generateContent(
          { model: 'o1gw/group/copilot/1/auto', contents: 'next' },
          'next',
        ),
      ).rejects.toMatchObject({ reason: 'unsupported' });
      expect(requests).toHaveLength(1);
    });

    it('prepares the exact next body once and confirms selection only after destination completion', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'opening' },
        'first',
      );
      const confirmed = vi.fn(async () => {});
      stageGatewayTransfer(current.config, {
        sessionId: current.sessionId,
        sourceModel: current.model,
        destinationModel: 'o1gw/account/copilot/3/auto',
        sourceFingerprint: gatewayTransferFingerprint(current.settings),
        onConfirmed: confirmed,
      });
      await current.generator.generateContent(
        {
          model: current.model,
          contents: [
            { role: 'user', parts: [{ text: 'opening' }] },
            { role: 'model', parts: [{ text: 'final-marker' }] },
            { role: 'user', parts: [{ text: 'continue' }] },
          ],
        },
        'transfer',
      );
      const prepared = requests.find(
        (row) => row.path === '/v1/conversations/transfer',
      );
      const sent = requests.at(-1)!;
      expect(sent.body['model']).toBe('o1gw/account/copilot/3/auto');
      expect(prepared?.body['request']).toEqual(sent.body);
      expect(prepared?.body['source_model']).toBe(current.model);
      expect(sent.headers['x-o1gw-conversation-id']).toBe(current.sessionId);
      expect(sent.headers['x-o1gw-conversation-transfer']).toBe(
        'synthetic-transfer-only',
      );
      expect(confirmed).toHaveBeenCalledOnce();
      expect(current.records.at(-1)?.model).toBe('o1gw/account/copilot/3/auto');
      expect(requests).toHaveLength(3);
    });

    it('does not send a destination completion after an expired preparation', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'opening' },
        'first',
      );
      transferExpired = true;
      const confirmed = vi.fn(async () => {});
      stageGatewayTransfer(current.config, {
        sessionId: current.sessionId,
        sourceModel: current.model,
        destinationModel: 'o1gw/account/copilot/3/auto',
        sourceFingerprint: gatewayTransferFingerprint(current.settings),
        onConfirmed: confirmed,
      });
      await expect(
        current.generator.generateContent(
          { model: current.model, contents: 'next' },
          'transfer',
        ),
      ).rejects.toMatchObject({ reason: 'unavailable' });
      expect(requests).toHaveLength(2);
      expect(confirmed).not.toHaveBeenCalled();
      expect(current.records.at(-1)?.model).toBe(current.model);
    });

    it('surfaces an SSE failure after HTTP 200 and blocks uncertain automatic replay', async () => {
      const current = await client(authType);
      streamError = true;
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'opening' },
        'main',
      );
      await expect(
        (async () => {
          for await (const _chunk of stream) {
            /* consume the real SDK stream */
          }
        })(),
      ).rejects.toMatchObject({ code: 'gateway_conversation_error' });
      expect(current.records.at(-1)?.phase).toBe('uncertain');
      await expect(
        current.generator.generateContent(
          { model: current.model, contents: 'opening' },
          'retry',
        ),
      ).rejects.toMatchObject({ reason: 'uncertain' });
      expect(requests).toHaveLength(1);
    });
  },
);
