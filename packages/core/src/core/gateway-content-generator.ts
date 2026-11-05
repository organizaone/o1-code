/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { FinishReason } from '@google/genai';
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
import { fetchKeyInfo } from '../providers/organizaone-limits.js';
import {
  GatewayConversationError,
  gatewayRequestScope,
  isGatewayIdentifier,
  normalizeGatewayEndpoint,
  isGatewayConversationActive,
  reserveGatewayConversation,
  type GatewayGenerateRequest,
  type GatewayRequestScope,
} from '../providers/gateway-request.js';
import { gatewayFailure } from '../providers/gateway-errors.js';
import { AuthType } from '../utils/auth-type.js';
import { isSystemReminderContent } from './environmentContext.js';
import { ToolNames } from '../tools/tool-names.js';
import {
  takeGatewayTransfer,
  confirmGatewayTransfer,
  isGatewayAccountChange,
  assertGatewayTransferCompatible,
  getGatewayAccountSelection,
  isGatewayAccountSelectionInProgress,
} from '../providers/gateway-transfer.js';

interface ConversationState {
  record?: GatewayConversationRecordPayload;
  busy: boolean;
}
const states = new WeakMap<Config, Map<string, ConversationState>>();

function endpointOf(config: ContentGeneratorConfig): string {
  return normalizeGatewayEndpoint(
    config.reasoningRouteBaseUrl || config.baseUrl || '',
  );
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
          normalizeGatewayEndpoint(payload.endpoint) === endpoint
        );
      })?.systemPayload as GatewayConversationRecordPayload | undefined;
      state = { record, busy: false };
      sessions.set(key, state);
    }
    return { state, id, actor, endpoint };
  }

  private async begin(request: GatewayGenerateRequest): Promise<{
    scope: GatewayRequestScope;
    finish(
      phase: GatewayConversationRecordPayload['phase'],
      interruption?: GatewayConversationRecordPayload['interruption'],
    ): Promise<void>;
  }> {
    if (request.config?.abortSignal?.aborted)
      throw new GatewayConversationError(
        'cancelled',
        'The gateway request was cancelled before dispatch. No request was sent.',
      );
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
    if (
      state.busy ||
      (actor === 'main' &&
        (isGatewayAccountSelectionInProgress(this.config) ||
          isGatewayConversationActive(this.config, id)))
    )
      throw new GatewayConversationError(
        'conflict',
        'This conversation has a request or account selection in progress. Wait for it to finish.',
      );
    // A prior interruption is not proof of the gateway's current state. A new
    // explicit call keeps this identity/history and is validated by the gateway;
    // uncertain failures remain fail-fast and never schedule a replay here.
    const previous = state.record;
    const contractHash = createHash('sha256')
      .update(
        JSON.stringify([
          request.config?.systemInstruction ?? null,
          request.config?.tools ?? null,
        ]),
      )
      .digest('hex');
    const selection = getGatewayAccountSelection(this.config);
    const transfer =
      actor === 'main' ? takeGatewayTransfer(this.config) : undefined;
    if (transfer) {
      if (!previous || previous.model !== transfer.sourceModel) {
        state.busy = false;
        throw new GatewayConversationError(
          'unsupported',
          'Transfer requires a recorded conversation on the original account. The gateway must validate its history and authorize the destination.',
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
      isGatewayAccountChange(previous.model, request.model) &&
      selection?.destinationModel !== request.model
    ) {
      state.busy = false;
      throw new GatewayConversationError(
        'unsupported',
        'Select the destination through /model and authorize sending this conversation history. The history was not sent to another account.',
      );
    }
    const record: GatewayConversationRecordPayload = {
      conversationId: id,
      endpoint,
      actor,
      model: request.model,
      phase: 'pending',
      contractHash,
      toolSnapshotPolicy:
        this.config.getGatewayToolSnapshotPolicy?.() ?? 'gateway-v1',
      ...(request.config?.tools?.some(
        (tool) =>
          'functionDeclarations' in tool &&
          tool.functionDeclarations?.some(
            (declaration) => declaration.name === ToolNames.WORKFLOW,
          ),
      )
        ? { workflowToolDeclared: true as const }
        : {}),
    };
    const recorder = this.config.getChatRecordingService();
    state.busy = true;
    const release =
      actor === 'main' ? reserveGatewayConversation(this.config, id) : () => {};
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
      release();
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
                  purpose: 'group-transfer',
                  source: request.model,
                  destination: 'another eligible group account',
                  signal,
                }),
            }
          : {}),
      },
      finish: async (phase, interruption) => {
        if (finished) return;
        finished = true;
        try {
          state.record =
            phase === 'refused' && previous
              ? previous
              : { ...record, phase, ...(interruption ? { interruption } : {}) };
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
          release();
        }
      },
    };
  }

  private failure(error: unknown): GatewayConversationError {
    return gatewayFailure(error, [
      this.generatorConfig.apiKey ?? '',
      ...Object.values(this.generatorConfig.customHeaders ?? {}),
    ]);
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
        failure.reason === 'uncertain' || failure.reason === 'cancelled'
          ? 'uncertain'
          : 'refused',
        failure.reason === 'cancelled' ? 'cancelled' : undefined,
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
        failure.reason === 'uncertain' || failure.reason === 'cancelled'
          ? 'uncertain'
          : 'refused',
        failure.reason === 'cancelled' ? 'cancelled' : undefined,
      );
      throw failure;
    }
    const failure = (error: unknown) => this.failure(error);
    const checkCancellation = () => {
      if (request.config?.abortSignal?.aborted)
        throw new DOMException(
          'The gateway request was cancelled.',
          'AbortError',
        );
    };
    const iterator = (async function* () {
      let phase: GatewayConversationRecordPayload['phase'] = 'uncertain';
      let failed = false;
      let interruption: GatewayConversationRecordPayload['interruption'];
      const finishStream = async () => {
        try {
          await gatewayRequestScope.run(turn.scope, () =>
            stream.return(undefined),
          );
        } catch (error) {
          if (!failed && phase !== 'complete') {
            const classified = failure(error);
            phase =
              classified.reason === 'uncertain' ||
              classified.reason === 'cancelled'
                ? 'uncertain'
                : 'refused';
            interruption =
              classified.reason === 'cancelled' ? 'cancelled' : undefined;
            throw classified;
          }
        } finally {
          await turn.finish(phase, interruption);
        }
      };
      try {
        while (true) {
          if (phase !== 'complete') checkCancellation();
          let next: IteratorResult<GenerateContentResponse>;
          try {
            next = await gatewayRequestScope.run(turn.scope, () =>
              stream.next(),
            );
          } catch (error) {
            if (phase === 'complete') break;
            throw error;
          }
          if (next.done) {
            if (phase !== 'complete') {
              checkCancellation();
              throw new GatewayConversationError(
                'uncertain',
                'The gateway stream ended without a confirmed terminal response. Execution may have started; no automatic replay was made.',
              );
            }
            break;
          }
          if (
            next.value.candidates?.some(
              (candidate) =>
                Boolean(candidate.finishReason) &&
                candidate.finishReason !==
                  FinishReason.FINISH_REASON_UNSPECIFIED,
            )
          )
            phase = 'complete';
          if (phase !== 'complete') checkCancellation();
          yield next.value;
        }
      } catch (error) {
        failed = true;
        if (phase === 'complete') throw error;
        const classified = failure(error);
        phase =
          classified.reason === 'uncertain' || classified.reason === 'cancelled'
            ? 'uncertain'
            : 'refused';
        if (classified.reason === 'cancelled') interruption = 'cancelled';
        throw classified;
      } finally {
        if (phase === 'uncertain' && !failed)
          interruption = request.config?.abortSignal?.aborted
            ? 'cancelled'
            : 'consumer_closed';
        await finishStream();
      }
    })();
    let started = false;
    const next = iterator.next.bind(iterator);
    const end = iterator.return.bind(iterator);
    const raise = iterator.throw.bind(iterator);
    const closeUnstarted = async () => {
      try {
        await gatewayRequestScope.run(turn.scope, () =>
          stream.return(undefined),
        );
      } finally {
        await turn.finish(
          'uncertain',
          request.config?.abortSignal?.aborted
            ? 'cancelled'
            : 'consumer_closed',
        );
      }
    };
    iterator.next = (...args) => {
      started = true;
      return next(...args);
    };
    iterator.return = async (value) => {
      if (!started) {
        await closeUnstarted();
      }
      return end(value);
    };
    iterator.throw = async (error: unknown) => {
      if (!started) await closeUnstarted();
      return raise(error);
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
