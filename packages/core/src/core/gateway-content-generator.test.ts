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
import {
  FinishReason,
  GenerateContentResponse,
  type Content,
  type Part,
} from '@google/genai';
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
  recordGatewayAccountSelection,
  switchWithGatewayAccountSelection,
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
let streamIncomplete: boolean;
let streamHold: boolean;
let streamToolCall: boolean;
let operationCapabilities: boolean;
let groupProposal: boolean;
let replyError: { code: string; message: string; status?: number } | undefined;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'o1-gateway-client-'));
  vi.stubEnv('O1CODE_HOME', work);
  requests = [];
  replyStatus = 200;
  transferExpired = false;
  transferStatus = 200;
  streamError = false;
  streamIncomplete = false;
  streamHold = false;
  streamToolCall = false;
  operationCapabilities = true;
  groupProposal = false;
  replyError = undefined;
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
            ...replyError,
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
          ...replyError,
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
      if (streamToolCall) {
        event('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'call_gateway',
            name: 'literal_tool',
            input: {},
          },
        });
        event('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"value":"synthetic"}',
          },
        });
      } else {
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
      }
      if (streamHold) return;
      if (streamIncomplete) {
        res.end();
        return;
      }
      event('content_block_stop', { type: 'content_block_stop', index: 0 });
      event('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: streamToolCall ? 'tool_use' : 'end_turn' },
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
      if (streamToolCall) {
        event('', {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          model: body['model'],
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_gateway',
                    type: 'function',
                    function: {
                      name: 'literal_tool',
                      arguments: '{"value":"synthetic"}',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });
      } else {
        event('', chunk('progress-marker\n'));
        event('', chunk('final-marker'));
      }
      if (streamHold) return;
      if (streamIncomplete) {
        res.end();
        return;
      }
      event('', chunk('', streamToolCall ? 'tool_calls' : 'stop'));
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
    raw,
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
        toolSnapshotPolicy: 'gateway-v2',
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

    it('does not replay HTTP 408 and lets the next explicit request continue, on any account (gateway contract v2)', async () => {
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
      expect(requests).toHaveLength(2);
      replyStatus = 200;
      await current.generator.generateContent(
        { model: current.model, contents: 'explicit recovery' },
        'recovery',
      );
      expect(requests).toHaveLength(3);
      expect(current.records.at(-1)?.phase).toBe('complete');
      // Another account in the same conversation is sent, not refused: the gateway rebuilds from the history.
      current.settings.model = 'o1gw/account/copilot/3/auto';
      await current.generator.generateContent(
        {
          model: 'o1gw/account/copilot/3/auto',
          contents: 'next on another account',
        },
        'other-account',
      );
      expect(requests).toHaveLength(4);
      expect(requests.at(-1)?.body['model']).toBe(
        'o1gw/account/copilot/3/auto',
      );
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

    it('restores recorded identity and imports history under the current session identity', async () => {
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
      await legacy.generator.generateContent(
        { model: first.model, contents },
        'legacy',
      );
      expect(requests).toHaveLength(3);
      expect(requests.at(-1)?.headers['x-o1gw-conversation-id']).toBe(
        legacy.sessionId,
      );
      expect(JSON.stringify(requests.at(-1)?.body)).toContain('final-marker');
      expect(legacy.records.at(-1)?.conversationId).toBe(legacy.sessionId);
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

    it.each([false, true])(
      'preserves specific server refusals through the SDK (stream: %s)',
      async (streaming) => {
        const current = await client(authType);
        for (const [status, code, message, reason] of [
          [
            409,
            'conversation_busy',
            'This conversation is still generating',
            'busy',
          ],
          [
            409,
            'invalid_tool_results',
            'Tool results must match pending requests',
            'tool_mismatch',
          ],
          [
            409,
            'conversation_transfer_required',
            'Confirm this account transition',
            'transfer_required',
          ],
          [
            403,
            'permission_denied',
            'Access to the selected account was revoked',
            'authorization',
          ],
          [
            429,
            'rate_limit_exceeded',
            'This account reached its quota',
            'unavailable',
          ],
          [
            409,
            'execution_uncertain',
            'Native termination is not confirmed',
            'uncertain',
          ],
        ] as const) {
          replyError = { status, code, message };
          replyStatus = streaming ? 200 : status;
          streamError = streaming;
          const attempt = async () => {
            const request = {
              model: current.model,
              contents: 'explicit attempt',
            };
            if (streaming) {
              const stream = await current.generator.generateContentStream(
                request,
                'diagnostic',
              );
              for await (const _chunk of stream) {
                /* consume */
              }
            } else
              await current.generator.generateContent(request, 'diagnostic');
          };
          await expect(attempt()).rejects.toMatchObject({
            status,
            providerCode: code,
            message,
            reason,
          });
        }
        expect(requests).toHaveLength(6);
        replyStatus = 200;
        streamError = false;
        await current.generator.generateContent(
          { model: current.model, contents: 'recover' },
          'recover',
        );
        expect(current.records.at(-1)?.phase).toBe('complete');
      },
    );

    it('keeps the active conversation lock across equivalent endpoint spellings', async () => {
      const current = await client(authType);
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'held' },
        'held',
      );
      current.settings.reasoningRouteBaseUrl =
        'HTTPS://API.ORGANIZAONE.COM:443/v1/';
      const same = new GatewayContentGenerator(
        current.raw,
        current.config,
        current.settings,
      );
      const switchModel = vi.fn(async () => {});
      await expect(
        switchWithGatewayAccountSelection(
          current.config,
          { model: current.model },
          switchModel,
          { isBusy: () => false },
        ),
      ).rejects.toMatchObject({ reason: 'busy' });
      expect(switchModel).not.toHaveBeenCalled();
      await expect(
        same.generateContent(
          { model: current.model, contents: 'concurrent' },
          'concurrent',
        ),
      ).rejects.toMatchObject({ reason: 'conflict' });
      const independent = await client(authType);
      await independent.generator.generateContent(
        { model: independent.model, contents: 'independent' },
        'independent',
      );
      await stream.return(undefined);
      expect(requests).toHaveLength(2);
      expect(
        new Set(requests.map((row) => row.headers['x-o1gw-conversation-id']))
          .size,
      ).toBe(2);
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

    it('reserves only the current conversation while an account switch is being applied', async () => {
      const current = await client(authType);
      let release!: () => void;
      let entered!: () => void;
      const switching = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const selection = switchWithGatewayAccountSelection(
        current.config,
        { model: current.model },
        async () => {
          entered();
          await held;
        },
      );
      await switching;
      try {
        await expect(
          current.generator.generateContent(
            { model: current.model, contents: 'racing generation' },
            'race',
          ),
        ).rejects.toMatchObject({ reason: 'conflict' });
        const other = await client(authType);
        await other.generator.generateContent(
          { model: other.model, contents: 'independent' },
          'other',
        );
        await current.generator.generateContent(
          {
            model: current.model,
            contents: 'independent summary',
            ...{
              gatewayIndependentRequest:
                createGatewayIndependentRequest('summary'),
            },
          },
          'summary',
        );
      } finally {
        release();
        await selection;
      }
      await current.generator.generateContent(
        { model: current.model, contents: 'after selection' },
        'after',
      );
      expect(requests).toHaveLength(3);
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

    it('lets the gateway validate changed instructions and tools on the same identity', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        {
          model: current.model,
          contents: 'first',
          config: { systemInstruction: 'stable-system' },
        },
        'first',
      );
      const previousHash = current.records.at(-1)?.contractHash;
      await current.generator.generateContent(
        {
          model: current.model,
          contents: 'second',
          config: {
            systemInstruction: 'changed-system',
            tools: [{ functionDeclarations: [{ name: 'new_skill_tool' }] }],
          },
        },
        'second',
      );
      expect(requests).toHaveLength(2);
      expect(current.records.at(-1)?.contractHash).not.toBe(previousHash);
      expect(requests.at(-1)?.headers['x-o1gw-conversation-id']).toBe(
        current.sessionId,
      );
    });

    it('sends consented cross-provider history without native transfer preparation', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'opening' },
        'first',
      );
      const destination = 'o1gw/own/claude/7/sonnet';
      current.settings.model = destination;
      recordGatewayAccountSelection(current.config, current.model, destination);
      replyStatus = 403;
      const request = {
        model: destination,
        contents: [
          { role: 'user', parts: [{ text: 'opening' }] },
          { role: 'model', parts: [{ text: 'final-marker' }] },
          { role: 'user', parts: [{ text: 'continue' }] },
        ],
      };
      await expect(
        current.generator.generateContent(request, 'refused'),
      ).rejects.toMatchObject({ status: 403 });
      replyStatus = 200;
      await current.generator.generateContent(request, 'explicit-next');
      expect(requests).toHaveLength(3);
      expect(
        requests.every((row) => row.path !== '/v1/conversations/transfer'),
      ).toBe(true);
      expect(requests.at(-1)?.body['model']).toBe(destination);
      expect(requests.at(-1)?.headers['x-o1gw-conversation-id']).toBe(
        current.sessionId,
      );
      expect(JSON.stringify(requests.at(-1)?.body)).toContain('final-marker');
    });

    it('sends account and group changes in the same conversation without a selection record (gateway contract v2)', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'first' },
        'first',
      );
      for (const model of [
        'o1gw/account/copilot/3/auto',
        'o1gw/group/copilot/1/auto',
      ]) {
        current.settings.model = model;
        await current.generator.generateContent(
          { model, contents: 'next' },
          `next-${model}`,
        );
        expect(requests.at(-1)?.body['model']).toBe(model);
        expect(requests.at(-1)?.headers['x-o1gw-conversation-id']).toBe(
          current.sessionId,
        );
      }
      expect(requests).toHaveLength(3);
      expect(
        requests.every((row) => row.path !== '/v1/conversations/transfer'),
      ).toBe(true);
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

    it.each([false, true])(
      'preserves a known SSE refusal and permits the next explicit attempt (previous completion: %s)',
      async (previousCompletion) => {
        const current = await client(authType);
        if (previousCompletion)
          await current.generator.generateContent(
            { model: current.model, contents: 'confirmed opening' },
            'opening',
          );
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
        ).rejects.toMatchObject({
          reason: 'conflict',
          providerCode: 'conversation_unavailable',
        });
        expect(current.records.at(-1)?.phase).toBe(
          previousCompletion ? 'complete' : 'refused',
        );
        expect(requests).toHaveLength(previousCompletion ? 2 : 1);
        streamError = false;
        await current.generator.generateContent(
          { model: current.model, contents: 'explicit next attempt' },
          'next',
        );
        expect(requests).toHaveLength(previousCompletion ? 3 : 2);
        expect(current.records.at(-1)?.phase).toBe('complete');
      },
    );

    it('keeps a terminal response complete when the consumer closes before EOF', async () => {
      const current = await client(authType);
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'first' },
        'first',
      );
      let terminal = false;
      for await (const chunk of stream) {
        if (
          chunk.candidates?.some(
            (candidate) => candidate.finishReason === FinishReason.STOP,
          )
        ) {
          terminal = true;
          break;
        }
      }
      expect(terminal).toBe(true);
      expect(current.records.at(-1)?.phase).toBe('complete');
      await current.generator.generateContent(
        {
          model: current.model,
          contents: [
            { role: 'user', parts: [{ text: 'first' }] },
            {
              role: 'model',
              parts: [{ text: 'progress-marker\nfinal-marker' }],
            },
            { role: 'user', parts: [{ text: 'second' }] },
          ],
        },
        'second',
      );
      expect(requests).toHaveLength(2);
      expect(
        requests.every(
          (row) => row.headers['x-o1gw-conversation-id'] === current.sessionId,
        ),
      ).toBe(true);
    });

    it('keeps an incomplete response uncertain without replay and allows a gateway-validated next turn', async () => {
      const current = await client(authType);
      streamIncomplete = true;
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'interrupted' },
        'interrupted',
      );
      await expect(
        (async () => {
          for await (const _chunk of stream) {
            /* consume */
          }
        })(),
      ).rejects.toMatchObject({ reason: 'uncertain' });
      expect(current.records.at(-1)?.phase).toBe('uncertain');
      expect(requests).toHaveLength(1);
      streamIncomplete = false;
      await current.generator.generateContent(
        { model: current.model, contents: 'explicit recovery turn' },
        'recovery',
      );
      expect(requests).toHaveLength(2);
      expect(requests[1].headers['x-o1gw-conversation-id']).toBe(
        current.sessionId,
      );
      expect(current.records.at(-1)?.phase).toBe('complete');
    });

    it('preserves a terminal tool call and its result across the next turn', async () => {
      const current = await client(authType);
      const config = {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'literal_tool',
                parametersJsonSchema: {
                  type: 'object',
                  properties: { value: { type: 'string' } },
                },
              },
            ],
          },
        ],
      };
      streamToolCall = true;
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'tool please', config },
        'tool',
      );
      const parts: Part[] = [];
      for await (const chunk of stream)
        parts.push(...(chunk.candidates?.[0]?.content?.parts ?? []));
      const call = parts.find((part) => part.functionCall)?.functionCall;
      expect(call).toMatchObject({
        id: 'call_gateway',
        name: 'literal_tool',
        args: { value: 'synthetic' },
      });
      expect(current.records.at(-1)?.phase).toBe('complete');
      streamToolCall = false;
      await current.generator.generateContent(
        {
          model: current.model,
          config,
          contents: [
            { role: 'user', parts: [{ text: 'tool please' }] },
            { role: 'model', parts: [{ functionCall: call! }] },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    id: call!.id,
                    name: call!.name,
                    response: { content: 'tool-result-marker' },
                  },
                },
              ],
            },
          ],
        },
        'result',
      );
      expect(requests).toHaveLength(2);
      expect(JSON.stringify(requests[1].body)).toContain('call_gateway');
      expect(JSON.stringify(requests[1].body)).toContain('tool-result-marker');
    });

    it('does not accept a tool call without a terminal response as completed', async () => {
      const current = await client(authType);
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: 'unconfirmed',
                  name: 'literal_tool',
                  args: {},
                },
              },
            ],
          },
        },
      ];
      vi.spyOn(current.raw, 'generateContentStream').mockResolvedValue(
        (async function* () {
          yield response;
        })(),
      );
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'partial tool' },
        'partial',
      );
      await expect(
        (async () => {
          for await (const _chunk of stream) {
            /* consume */
          }
        })(),
      ).rejects.toMatchObject({ reason: 'uncertain' });
      expect(current.records.at(-1)?.phase).toBe('uncertain');
    });

    it('preserves a classified streaming refusal even when stream cleanup throws', async () => {
      const current = await client(authType);
      const upstream =
        (async function* (): AsyncGenerator<GenerateContentResponse> {
          yield new GenerateContentResponse();
        })();
      upstream.next = async () => {
        throw Object.assign(new Error('confirmed denial'), { status: 403 });
      };
      upstream.return = async () => {
        throw new Error('secondary cleanup failure');
      };
      const mocked = vi
        .spyOn(current.raw, 'generateContentStream')
        .mockResolvedValue(upstream);
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'denied' },
        'denied',
      );
      await expect(stream.next()).rejects.toMatchObject({
        reason: 'authorization',
        status: 403,
      });
      expect(current.records.at(-1)?.phase).toBe('refused');
      mocked.mockRestore();
      await current.generator.generateContent(
        { model: current.model, contents: 'explicit next turn' },
        'next',
      );
      expect(requests).toHaveLength(1);
    });

    it('keeps terminal completion when transport or cleanup fails after acknowledgement', async () => {
      const current = await client(authType);
      const response = new GenerateContentResponse();
      response.candidates = [
        {
          finishReason: FinishReason.STOP,
          content: { role: 'model', parts: [{ text: 'confirmed' }] },
        },
      ];
      const upstream = (async function* () {
        yield response;
        throw new Error('late transport close');
      })();
      upstream.return = async () => {
        throw new Error('late cleanup close');
      };
      vi.spyOn(current.raw, 'generateContentStream').mockResolvedValue(
        upstream,
      );
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'acknowledged' },
        'ack',
      );
      const chunks: GenerateContentResponse[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      expect(chunks).toHaveLength(1);
      expect(current.records.at(-1)?.phase).toBe('complete');
    });

    it('preserves consumer errors after a confirmed terminal response', async () => {
      const current = await client(authType);
      const response = new GenerateContentResponse();
      response.candidates = [{ finishReason: FinishReason.STOP }];
      vi.spyOn(current.raw, 'generateContentStream').mockResolvedValue(
        (async function* () {
          yield response;
        })(),
      );
      const stream = await current.generator.generateContentStream(
        { model: current.model, contents: 'terminal' },
        'terminal',
      );
      await stream.next();
      const error = new Error('consumer failure');
      await expect(stream.throw(error)).rejects.toBe(error);
      expect(current.records.at(-1)?.phase).toBe('complete');
    });

    it('cancels before dispatch without changing the last confirmed state', async () => {
      const current = await client(authType);
      await current.generator.generateContent(
        { model: current.model, contents: 'opening' },
        'first',
      );
      const previous = current.records.at(-1);
      const abort = new AbortController();
      abort.abort();
      await expect(
        current.generator.generateContentStream(
          {
            model: current.model,
            contents: 'cancelled',
            config: { abortSignal: abort.signal },
          },
          'cancelled',
        ),
      ).rejects.toMatchObject({ reason: 'cancelled' });
      expect(current.records.at(-1)).toEqual(previous);
      expect(requests).toHaveLength(1);
      await current.generator.generateContent(
        { model: current.model, contents: 'next' },
        'next',
      );
      expect(requests).toHaveLength(2);
    });

    it('records cancellation after dispatch as unknown execution without automatic replay', async () => {
      const current = await client(authType);
      streamHold = true;
      const abort = new AbortController();
      const stream = await current.generator.generateContentStream(
        {
          model: current.model,
          contents: 'cancel during stream',
          config: { abortSignal: abort.signal },
        },
        'cancel',
      );
      await stream.next();
      abort.abort();
      let caught: unknown;
      try {
        for await (const _chunk of stream) {
          /* consume until cancellation */
        }
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ reason: 'cancelled' });
      expect(classifyRetryError(caught)).toMatchObject({
        diagnosis: 'fail-fast',
      });
      expect(current.records.at(-1)).toMatchObject({
        phase: 'uncertain',
        interruption: 'cancelled',
      });
      expect(requests).toHaveLength(1);
    });

    it.each(['return', 'throw'] as const)(
      'releases an unconsumed stream on consumer %s',
      async (method) => {
        const current = await client(authType);
        const stream = await current.generator.generateContentStream(
          { model: current.model, contents: 'unconsumed' },
          'unconsumed',
        );
        if (method === 'return') await stream.return(undefined);
        else
          await expect(
            stream.throw(new Error('consumer closed')),
          ).rejects.toThrow('consumer closed');
        expect(current.records.at(-1)).toMatchObject({
          phase: 'uncertain',
          interruption: 'consumer_closed',
        });
        await current.generator.generateContent(
          { model: current.model, contents: 'new explicit turn' },
          'next',
        );
        expect(requests).toHaveLength(2);
      },
    );

    it('lets the gateway validate a resumed pending record without changing its identity', async () => {
      const previous = await client(authType);
      await previous.generator.generateContent(
        { model: previous.model, contents: 'opening' },
        'opening',
      );
      const resumed = await client(authType, previous.sessionId, [
        {
          sessionId: previous.sessionId,
          type: 'system',
          subtype: 'gateway_conversation',
          systemPayload: { ...previous.records.at(-1)!, phase: 'pending' },
        } as ChatRecord,
      ]);
      await resumed.generator.generateContent(
        { model: resumed.model, contents: 'explicit resumed turn' },
        'resumed',
      );
      expect(requests).toHaveLength(2);
      expect(requests[1].headers['x-o1gw-conversation-id']).toBe(
        previous.sessionId,
      );
      expect(resumed.records.at(-1)?.phase).toBe('complete');
    });

    it('allows authorized transfer preparation after uncertainty and defers the decision to the gateway', async () => {
      const current = await client(authType);
      replyStatus = 408;
      await expect(
        current.generator.generateContent(
          { model: current.model, contents: 'uncertain' },
          'uncertain',
        ),
      ).rejects.toMatchObject({ reason: 'uncertain' });
      expect(requests).toHaveLength(1);
      replyStatus = 200;
      const confirmed = vi.fn(async () => {});
      stageGatewayTransfer(current.config, {
        sessionId: current.sessionId,
        sourceModel: current.model,
        destinationModel: 'o1gw/account/copilot/3/auto',
        sourceFingerprint: gatewayTransferFingerprint(current.settings),
        onConfirmed: confirmed,
      });
      await current.generator.generateContent(
        { model: current.model, contents: 'explicit authorized transfer' },
        'transfer',
      );
      expect(requests).toHaveLength(3);
      expect(requests[1].path).toBe('/v1/conversations/transfer');
      expect(requests[2].headers['x-o1gw-conversation-id']).toBe(
        current.sessionId,
      );
      expect(requests[2].headers['x-o1gw-conversation-transfer']).toBe(
        'synthetic-transfer-only',
      );
      expect(confirmed).toHaveBeenCalledOnce();
    });

    it('honors gateway refusal of an uncertain transfer without permanently vetoing later requests', async () => {
      const current = await client(authType);
      replyStatus = 408;
      await expect(
        current.generator.generateContent(
          { model: current.model, contents: 'uncertain' },
          'uncertain',
        ),
      ).rejects.toMatchObject({ reason: 'uncertain' });
      replyStatus = 200;
      transferStatus = 403;
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
          { model: current.model, contents: 'consented transfer' },
          'transfer',
        ),
      ).rejects.toMatchObject({ reason: 'authorization', status: 403 });
      expect(requests).toHaveLength(2);
      expect(requests[1].path).toBe('/v1/conversations/transfer');
      expect(confirmed).not.toHaveBeenCalled();
      expect(current.records.at(-1)?.phase).toBe('uncertain');
      await current.generator.generateContent(
        { model: current.model, contents: 'explicit source-account recovery' },
        'recover',
      );
      expect(requests).toHaveLength(3);
      expect(requests[2].body['model']).toBe(current.model);
      expect(current.records.at(-1)?.phase).toBe('complete');
    });

    it('starts /new independently after an uncertain conversation', async () => {
      const current = await client(authType);
      replyStatus = 408;
      await expect(
        current.generator.generateContent(
          { model: current.model, contents: 'old interrupted turn' },
          'old',
        ),
      ).rejects.toMatchObject({ reason: 'uncertain' });
      const fresh = randomUUID();
      vi.spyOn(current.config, 'getSessionId').mockReturnValue(fresh);
      replyStatus = 200;
      await current.generator.generateContent(
        { model: current.model, contents: 'new empty conversation' },
        'new',
      );
      expect(requests).toHaveLength(2);
      expect(requests[0].headers['x-o1gw-conversation-id']).toBe(
        current.sessionId,
      );
      expect(requests[1].headers['x-o1gw-conversation-id']).toBe(fresh);
      expect(current.records.at(-1)).toMatchObject({
        conversationId: fresh,
        phase: 'complete',
      });
    });
  },
);
