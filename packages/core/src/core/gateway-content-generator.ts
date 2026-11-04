/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import type {
  Content,
  Part,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { Config } from '../config/config.js';
import type {
  ContentGenerator,
  ContentGeneratorConfig,
} from './contentGenerator.js';
import type { GatewayConversationRecordPayload } from '../services/chatRecordingService.js';
import { getCurrentAgentId } from '../agents/runtime/agent-context.js';
import { isInForkExecution } from '../tools/agent/fork-subagent.js';
import { fetchKeyInfo } from '../providers/organizaone-limits.js';
import {
  GatewayConversationError,
  gatewayRequestScope,
  isGatewayIdentifier,
  type GatewayGenerateRequest,
  type GatewayRequestScope,
} from '../providers/gateway-request.js';
import { getErrorStatus } from '../utils/errors.js';
import { getErrorHeader } from '../utils/retryPolicy.js';
import { getRateLimitErrorDetails } from '../utils/rateLimit.js';
import { AuthType } from '../utils/auth-type.js';
import { isSystemReminderContent } from './environmentContext.js';
import {
  takeGatewayTransfer,
  confirmGatewayTransfer,
  isGatewayAccountChange,
  assertGatewayTransferCompatible,
} from '../providers/gateway-transfer.js';

interface ConversationState {
  record?: GatewayConversationRecordPayload;
  busy: boolean;
}
const states = new WeakMap<Config, Map<string, ConversationState>>();

function endpointOf(config: ContentGeneratorConfig): string {
  return (config.reasoningRouteBaseUrl || config.baseUrl || '')
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');
}

export class GatewayContentGenerator implements ContentGenerator {
  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
    private readonly generatorConfig: ContentGeneratorConfig,
  ) {}

  private prepareRequest(
    request: GenerateContentParameters,
  ): GenerateContentParameters {
    if (
      this.generatorConfig.authType !== AuthType.USE_OPENAI ||
      !Array.isArray(request.contents)
    )
      return { ...request };
    const originalContents = request.contents;
    if (
      !originalContents.every(
        (content): content is Content =>
          content !== null && typeof content === 'object' && 'role' in content,
      )
    )
      return { ...request };
    // The gateway can ignore standalone runtime reminders when proving a
    // continuation. Chat Completions otherwise flattens them into user text.
    const contents = originalContents.flatMap<Content>((content) => {
      if (
        !content ||
        typeof content !== 'object' ||
        !('role' in content) ||
        content.role !== 'user' ||
        !('parts' in content) ||
        !Array.isArray(content.parts) ||
        !content.parts.every((part: Part) => typeof part.text === 'string') ||
        !content.parts.some((part: Part) =>
          isSystemReminderContent({ parts: [part] }),
        )
      )
        return [content];
      const rows: Content[] = [];
      let pending: Part[] = [];
      const flush = () => {
        if (pending.length) {
          rows.push({ ...content, parts: pending });
          pending = [];
        }
      };
      for (const part of content.parts) {
        if (isSystemReminderContent({ parts: [part] })) {
          flush();
          rows.push({ ...content, parts: [part] });
        } else pending.push(part);
      }
      flush();
      return rows;
    });
    return { ...request, contents };
  }

  private state(): {
    state: ConversationState;
    id: string;
    actor: string;
    endpoint: string;
  } {
    const sessionId = this.config.getSessionId();
    const actor = getCurrentAgentId() ?? 'main';
    const id =
      actor === 'main'
        ? sessionId
        : createHash('sha256').update(`${sessionId}\0${actor}`).digest('hex');
    if (!isGatewayIdentifier(id))
      throw new GatewayConversationError(
        'unsupported',
        'The session has no valid gateway conversation identity. Start a new empty conversation with /new.',
      );
    const endpoint = endpointOf(this.generatorConfig);
    const key = `${sessionId}\0${actor}\0${endpoint}`;
    let sessions = states.get(this.config);
    if (!sessions) {
      sessions = new Map();
      states.set(this.config, sessions);
    }
    let state = sessions.get(key);
    if (!state) {
      const records =
        this.config.getResumedSessionData()?.conversation.messages ?? [];
      const record = [...records].reverse().find((row) => {
        if (
          row.subtype !== 'gateway_conversation' ||
          row.forkedFrom ||
          row.sessionId !== sessionId
        )
          return false;
        const payload = row.systemPayload as
          | GatewayConversationRecordPayload
          | undefined;
        return (
          payload?.conversationId === id &&
          payload.actor === actor &&
          payload.endpoint === endpoint
        );
      })?.systemPayload as GatewayConversationRecordPayload | undefined;
      state = { record, busy: false };
      sessions.set(key, state);
    }
    return { state, id, actor, endpoint };
  }

  private async begin(request: GatewayGenerateRequest): Promise<{
    scope: GatewayRequestScope;
    finish(phase: GatewayConversationRecordPayload['phase']): Promise<void>;
  }> {
    const { state, id, actor, endpoint } = this.state();
    const independent = request.gatewayIndependentRequest;
    if (independent) {
      if (!isGatewayIdentifier(independent.id))
        throw new GatewayConversationError(
          'unsupported',
          'Invalid independent operation identity.',
        );
      const info = independent.purpose
        ? await fetchKeyInfo({
            baseUrl: this.generatorConfig.baseUrl ?? '',
            apiKey: this.generatorConfig.apiKey ?? '',
            signal: request.config?.abortSignal,
            clientVersion: this.config.getCliVersion(),
          })
        : null;
      const supported =
        independent.purpose &&
        info?.conversationOperations?.purposes.includes(independent.purpose);
      if (independent.purpose && !supported) {
        throw new GatewayConversationError(
          'unsupported',
          'This gateway does not advertise support for this independent operation. The main conversation is preserved.',
        );
      }
      return {
        scope: supported
          ? {
              conversationId: id,
              model: request.model,
              operation: { id: independent.id, purpose: independent.purpose! },
            }
          : { conversationId: independent.id, model: request.model },
        finish: async () => {},
      };
    }
    if (isInForkExecution())
      throw new GatewayConversationError(
        'unsupported',
        'This gateway cannot authenticate a fork of an existing conversation. Start an independent agent with empty history.',
      );
    if (state.busy)
      throw new GatewayConversationError(
        'conflict',
        'This conversation already has a request in progress. Wait for it to finish.',
      );
    if (
      state.record?.phase === 'pending' ||
      state.record?.phase === 'uncertain'
    )
      throw new GatewayConversationError(
        'uncertain',
        'The previous request has an uncertain result. Its history is preserved; automatic replay and account transfer are unavailable.',
      );
    const contents = Array.isArray(request.contents)
      ? request.contents
      : [request.contents];
    if (
      !state.record &&
      contents.some(
        (content) =>
          typeof content === 'object' &&
          content !== null &&
          'role' in content &&
          content.role === 'model',
      )
    ) {
      throw new GatewayConversationError(
        'legacy',
        'This history has no recorded gateway conversation identity. It cannot be resumed or imported automatically. Keep it for reference and start a new empty conversation with /new.',
      );
    }
    const previous = state.record;
    const contractHash = createHash('sha256')
      .update(
        JSON.stringify([
          request.config?.systemInstruction ?? null,
          request.config?.tools ?? null,
        ]),
      )
      .digest('hex');
    if (previous?.contractHash && previous.contractHash !== contractHash) {
      throw new GatewayConversationError(
        'conflict',
        'System instructions or tool schemas changed during this gateway conversation. Its authenticated history cannot be replayed with that change. Keep the history and start a new empty conversation with /new to use the new configuration.',
      );
    }
    const transfer =
      actor === 'main' ? takeGatewayTransfer(this.config) : undefined;
    if (transfer) {
      if (
        !previous ||
        previous.phase !== 'complete' ||
        previous.model !== transfer.sourceModel
      ) {
        state.busy = false;
        throw new GatewayConversationError(
          'unsupported',
          'Transfer requires a recorded completed conversation on the original account.',
        );
      }
      assertGatewayTransferCompatible(
        transfer.sourceModel,
        transfer.destinationModel,
      );
      request.model = transfer.destinationModel;
      const destination = this.config.getResolvedModelConfig(
        this.generatorConfig.authType!,
        request.model,
        this.generatorConfig.reasoningRouteBaseUrl ??
          this.generatorConfig.baseUrl,
      );
      const outputLimit = destination?.capabilities.gateway?.outputTokens;
      if (outputLimit)
        request.config = {
          ...request.config,
          maxOutputTokens: Math.min(
            request.config?.maxOutputTokens ?? outputLimit,
            outputLimit,
          ),
        };
    } else if (
      previous &&
      isGatewayAccountChange(previous.model, request.model)
    ) {
      state.busy = false;
      throw new GatewayConversationError(
        'unsupported',
        'Select the destination through /model and explicitly authorize this conversation transfer. The history was not sent to another account.',
      );
    }
    const record: GatewayConversationRecordPayload = {
      conversationId: id,
      endpoint,
      actor,
      model: request.model,
      phase: 'pending',
      contractHash,
    };
    const recorder = this.config.getChatRecordingService();
    state.busy = true;
    try {
      if (!recorder && actor === 'main')
        throw new GatewayConversationError(
          'unsupported',
          'Gateway conversation recording is required to preserve continuity across restarts. Enable chat recording before starting a new conversation.',
        );
      await recorder?.recordGatewayConversation(record);
      state.record = record;
    } catch (error) {
      state.busy = false;
      throw error;
    }
    let finished = false;
    const group = this.config.getResolvedModelConfig(
      this.generatorConfig.authType!,
      request.model,
      this.generatorConfig.reasoningRouteBaseUrl ??
        this.generatorConfig.baseUrl,
    )?.capabilities.gateway?.group;
    return {
      scope: {
        conversationId: id,
        model: request.model,
        ...(transfer
          ? {
              transfer: {
                sourceModel: transfer.sourceModel,
                dispatched: false,
              },
            }
          : {}),
        ...(request.model.startsWith('o1gw/group/') &&
        group?.continuationPolicies.includes('ask') &&
        group.continuationPolicy !== 'forbid'
          ? {
              confirmGroupTransfer: (signal: AbortSignal | undefined) =>
                confirmGatewayTransfer(this.config, {
                  source: request.model,
                  destination: 'another eligible group account',
                  signal,
                }),
            }
          : {}),
      },
      finish: async (phase) => {
        if (finished) return;
        finished = true;
        try {
          state.record =
            phase === 'refused' && previous ? previous : { ...record, phase };
          await recorder?.recordGatewayConversation(state.record);
          if (phase === 'complete') {
            if (actor === 'main')
              await recorder?.recordSessionModel?.({
                modelId: request.model,
                authType: this.generatorConfig.authType!,
                baseUrl:
                  this.generatorConfig.reasoningRouteBaseUrl ??
                  this.generatorConfig.baseUrl,
              });
            if (transfer) {
              try {
                await transfer.onConfirmed();
              } catch {
                this.config
                  .getDebugLogger()
                  .warn(
                    'The transfer completed, but the selected account could not be updated. Select the confirmed destination before continuing.',
                  );
              }
            }
          }
        } finally {
          state.busy = false;
        }
      },
    };
  }

  private failure(error: unknown): GatewayConversationError {
    if (error instanceof GatewayConversationError) return error;
    let cause = error;
    for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
      if (cause instanceof GatewayConversationError) return cause;
      cause = cause.cause;
    }
    const status = getErrorStatus(error);
    const headers = new Headers();
    for (const name of [
      'x-o1gw-device-state',
      'retry-after',
      'x-o1gw-limit',
      'x-o1gw-limit-reset',
    ]) {
      const value = getErrorHeader(error, name);
      if (value) headers.set(name, value);
    }
    const details = {
      status,
      headers,
      providerCode: getRateLimitErrorDetails(error).providerCode,
    };
    if (status === 409)
      return new GatewayConversationError(
        'conflict',
        'The gateway refused continuity or account ownership for this conversation. The history and account are preserved. No automatic retry was made.',
        details,
      );
    if (status === 401 || status === 403)
      return new GatewayConversationError(
        'unavailable',
        'The gateway refused authorization for the selected account or device. Reconnect the provider; no other account was selected.',
        details,
      );
    if (status === 429)
      return new GatewayConversationError(
        'unavailable',
        `The selected account reached a gateway limit. No account transfer was authorized by this response.${headers.get('retry-after') ? ` Retry-After: ${headers.get('retry-after')}.` : ' Try again after its reset.'}`,
        details,
      );
    if (status && status >= 400 && status < 500 && status !== 408)
      return new GatewayConversationError(
        'unavailable',
        `The gateway refused the request (HTTP ${status}). Your history is preserved.`,
        details,
      );
    return new GatewayConversationError(
      'uncertain',
      'The gateway request did not complete with a confirmed result. Execution may have started. Your history is preserved; the request was not replayed or moved to another account.',
      details,
    );
  }

  async generateContent(
    request: GenerateContentParameters,
    promptId: string,
  ): Promise<GenerateContentResponse> {
    request = this.prepareRequest(request);
    const turn = await this.begin(request);
    try {
      const result = await gatewayRequestScope.run(turn.scope, () =>
        this.wrapped.generateContent(request, promptId),
      );
      await turn.finish('complete');
      return result;
    } catch (error) {
      const failure = this.failure(error);
      await turn.finish(
        failure.reason === 'uncertain' ? 'uncertain' : 'refused',
      );
      throw failure;
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    promptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    request = this.prepareRequest(request);
    const turn = await this.begin(request);
    let stream: AsyncGenerator<GenerateContentResponse>;
    try {
      stream = await gatewayRequestScope.run(turn.scope, () =>
        this.wrapped.generateContentStream(request, promptId),
      );
    } catch (error) {
      const failure = this.failure(error);
      await turn.finish(
        failure.reason === 'uncertain' ? 'uncertain' : 'refused',
      );
      throw failure;
    }
    const failure = (error: unknown) => this.failure(error);
    const iterator = (async function* () {
      let complete = false;
      try {
        while (true) {
          const next = await gatewayRequestScope.run(turn.scope, () =>
            stream.next(),
          );
          if (next.done) {
            complete = true;
            break;
          }
          yield next.value;
        }
      } catch (error) {
        throw failure(error);
      } finally {
        try {
          await gatewayRequestScope.run(turn.scope, () =>
            stream.return(undefined),
          );
        } finally {
          await turn.finish(complete ? 'complete' : 'uncertain');
        }
      }
    })();
    let started = false;
    const next = iterator.next.bind(iterator);
    const end = iterator.return.bind(iterator);
    iterator.next = (...args) => {
      started = true;
      return next(...args);
    };
    iterator.return = async (value) => {
      if (!started) {
        try {
          await gatewayRequestScope.run(turn.scope, () =>
            stream.return(undefined),
          );
        } finally {
          await turn.finish('uncertain');
        }
      }
      return end(value);
    };
    return iterator;
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    if (
      this.generatorConfig.model.startsWith('o1gw/') ||
      request.model?.startsWith('o1gw/')
    )
      throw new GatewayConversationError(
        'unsupported',
        'Embeddings are unavailable on this gateway conversation route. Select a separately configured embedding provider.',
      );
    return this.wrapped.embedContent(request);
  }
}
