/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponseUsageMetadata,
  Part,
  EmbedContentParameters,
  FunctionDeclaration,
  Tool,
  Schema,
} from '@google/genai';
import { FunctionCallingConfigMode } from './genai-compat.js';
import type { Config } from '../config/config.js';
import type {
  ContentGenerator,
  ContentGeneratorConfig,
  PromptCacheSharingParameters,
} from './contentGenerator.js';
import { AuthType, createContentGenerator } from './contentGenerator.js';
import type { ResolvedModelConfig } from '../models/types.js';
import { buildAgentContentGeneratorConfig } from '../models/content-generator-config.js';
import {
  buildModelIdContext,
  resolveModelId,
  type ResolvedModelId,
} from '../utils/modelId.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';
import { retryWithBackoff, isUnattendedMode } from '../utils/retry.js';
import { subagentNameContext } from '../utils/subagentNameContext.js';
import { ApiRetryEvent } from '../telemetry/types.js';
import { logApiRetry } from '../telemetry/loggers.js';
import { getFunctionCalls } from '../utils/generateContentResponseUtilities.js';
import { getResponseText } from '../utils/partUtils.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { resolveModelApiKey } from '../providers/model-api-key.js';
import type { RuntimeContentGeneratorView } from '../agents/runtime/agent-context.js';
import {
  resolveSlimmingConfig,
  slimCompactionInput,
} from '../services/compactionInputSlimming.js';
import {
  CHARS_PER_TOKEN,
  estimateContentTokens,
} from '../services/tokenEstimation.js';
import {
  defaultOutputCeiling,
  hasExplicitOutputLimit,
  parsePositiveIntegerEnvValue,
  tokenLimit,
} from './tokenLimits.js';
import { reachesOrganizaOne } from '../providers/presets/organizaone.js';
import {
  createGatewayIndependentRequest,
  gatewayIndependentInput,
  type GatewayOperationPurpose,
} from '../providers/gateway-request.js';

const DEFAULT_MAX_ATTEMPTS = 7;

const debugLogger = createDebugLogger('BASE_LLM_CLIENT');

function splitModelBaseUrl(model: string): { model: string; baseUrl?: string } {
  const idx = model.indexOf('\0');
  if (idx < 0) return { model };
  const modelPart = model.slice(0, idx);
  if (!modelPart) return { model: modelPart };
  return {
    model: modelPart,
    baseUrl: model.slice(idx + 1) || undefined,
  };
}

/**
 * Smallest room worth turning into an output budget. Below it the answer could
 * only be a stub, which a text side query would report as a normal success.
 */
const MIN_BUDGETED_OUTPUT_TOKENS = 256;

/**
 * Smallest reasoning budget the manual Anthropic thinking shape accepts; a
 * smaller one makes the provider layer drop thinking altogether.
 */
const MIN_THINKING_BUDGET_TOKENS = 1024;

/**
 * Estimated tokens of a system instruction. It travels beside `contents`, so
 * the content estimator alone does not see it.
 */
function estimateSystemInstructionTokens(
  systemInstruction: GenerateContentConfig['systemInstruction'],
): number {
  if (!systemInstruction) return 0;
  const value = systemInstruction as Content | Part | Part[] | string;
  if (typeof value === 'string') {
    return Math.ceil(value.length / CHARS_PER_TOKEN);
  }
  // Every field of a bare `Part` is optional, so only an array under `parts`
  // tells a `Content` apart from it.
  let parts: Part[];
  if (Array.isArray(value)) {
    parts = value;
  } else if (
    typeof value === 'object' &&
    'parts' in value &&
    Array.isArray(value.parts)
  ) {
    parts = value.parts;
  } else {
    parts = [value as Part];
  }
  return estimateContentTokens([{ role: 'user', parts }]);
}

/**
 * Estimated tokens of a payload that reaches the wire as JSON whatever the
 * provider format: the tool declarations (in JSON mode they carry the caller's
 * whole schema) and a caller-supplied response schema.
 */
function estimateSerializedTokens(value: unknown): number {
  if (value === undefined) return 0;
  if (Array.isArray(value) && value.length === 0) return 0;
  return Math.ceil(JSON.stringify(value).length / CHARS_PER_TOKEN);
}

/**
 * Gives a side query that carries no output limit one that fits the context
 * window it is sent to, so `prompt + max_tokens <= window` holds for the terms
 * measurable here: contents, system instruction, tool declarations and a
 * response schema.
 *
 * Side queries never pass through the main turn's window clamp. Without a
 * limit of their own, the provider layers that apply a ceiling use
 * `defaultOutputCeiling(model)`, which knows nothing about the window, and a
 * large prompt on a small window is rejected by a backend that validates the
 * sum. `clampOutputTokensToWindow` is not reused: its 10K margin and 4K floor
 * are sized for the main turn, which has compaction behind it.
 *
 * Only the window term is added. The request is returned as it came when:
 * - the caller set `maxOutputTokens` (compaction budgets its own; the prompt
 *   is not even measured);
 * - the room is at or above the ceiling the wire would apply anyway — the
 *   user's `samplingParams.max_tokens`, else `O1CODE_MAX_OUTPUT_TOKENS`, else
 *   the model default. The explicit ceilings replace the default rather than
 *   intersect it, the precedence the main turn and both provider layers use.
 *   Emitting here would also newly cap the wires that apply no ceiling at all
 *   (Gemini/Vertex and OpenAI Responses);
 * - the room is too small to carry an answer, or too small to host both the
 *   reasoning and the visible output of a thinking request. Capping there
 *   would turn a loud provider rejection into a silent stub.
 *
 * `resolvedContextWindowSize` is the window of the model the request is sent
 * to. It outranks `contentGeneratorConfig.contextWindowSize`, which a
 * per-model config inherits from the session when the target declares none.
 * It is undefined when the session generator sends the request (same model,
 * or the fallback for an unregistered or unbuildable target); the session
 * window is then the one the request meets, while the ceiling still describes
 * `model`.
 *
 * Call it with the resolved model and the slimmed contents.
 */
function budgetOutputTokensForWindow(
  requestConfig: GenerateContentConfig,
  contents: Content[],
  model: string,
  contentGeneratorConfig: ContentGeneratorConfig | undefined,
  resolvedContextWindowSize: number | undefined,
  imageTokenEstimate: number,
  tools?: Tool[],
): GenerateContentConfig {
  if (requestConfig.maxOutputTokens !== undefined) return requestConfig;

  // The env override may not authorize more than a known model can emit: the
  // wires without a clamp of their own would send it as given and get a 400.
  // An id with no explicit output limit is left to the operator's value.
  const envCeiling = parsePositiveIntegerEnvValue(
    process.env['O1CODE_MAX_OUTPUT_TOKENS'],
  );
  const explicitCeiling =
    contentGeneratorConfig?.samplingParams?.max_tokens ??
    (envCeiling === undefined
      ? undefined
      : Math.min(
          envCeiling,
          hasExplicitOutputLimit(model)
            ? tokenLimit(model, 'output')
            : Number.POSITIVE_INFINITY,
        ));
  // A window of zero or less means "not configured", as elsewhere.
  const declaredWindow = [
    resolvedContextWindowSize,
    contentGeneratorConfig?.contextWindowSize,
  ].find((v): v is number => typeof v === 'number' && v > 0);
  const room =
    (declaredWindow ?? tokenLimit(model, 'input')) -
    estimateContentTokens(contents, imageTokenEstimate) -
    estimateSystemInstructionTokens(requestConfig.systemInstruction) -
    estimateSerializedTokens(tools) -
    estimateSerializedTokens(requestConfig.responseJsonSchema);

  if (room < MIN_BUDGETED_OUTPUT_TOKENS) return requestConfig;

  const ceiling = explicitCeiling ?? defaultOutputCeiling(model);
  if (room >= ceiling) return requestConfig;

  const thinking = requestConfig.thinkingConfig;
  if (!thinking || thinking.includeThoughts === false) {
    return { ...requestConfig, maxOutputTokens: room };
  }
  // Reasoning is paid out of the same budget, and the Anthropic layer clamps
  // its thinking budget to just under `max_tokens`: an unpaired cap would
  // leave a single visible token. Half the room goes to reasoning at most.
  const thinkingBudget = Math.min(
    thinking.thinkingBudget ?? room,
    Math.floor(room / 2),
  );
  if (thinkingBudget < MIN_THINKING_BUDGET_TOKENS) return requestConfig;

  return {
    ...requestConfig,
    maxOutputTokens: room,
    thinkingConfig: { ...thinking, thinkingBudget },
  };
}

/**
 * The pair of generator and retry-authType to use for a request targeting
 * a specific model. When the requested model differs from the main session
 * model, both fields are resolved against that model's provider so that
 * per-model `extra_body` / `samplingParams` / reasoning settings — and
 * provider-specific retry/quota behaviour — do not leak from the main
 * session.
 */
export interface ResolvedGeneratorForModel {
  contentGenerator: ContentGenerator;
  contentGeneratorConfig: ContentGeneratorConfig;
  retryAuthType: string | undefined;
  retryErrorCodes?: readonly number[];
  model: string;
  /**
   * Context window of the model the request is sent to, resolved against that
   * target: the window its registry entry declares, else the known limit for
   * its id. Undefined when the session generator sends the request, whose
   * `contentGeneratorConfig.contextWindowSize` is then the window that counts.
   */
  contextWindowSize?: number;
}

/**
 * Options for the generateText utility function.
 */
export interface GenerateTextOptions {
  gatewayPurpose?: GatewayOperationPurpose;
  /** The input prompt or history. */
  contents: Content[];
  /** The specific model to use for this task. */
  model: string;
  /**
   * Task-specific system instructions. Passed through to the underlying
   * content generator without the llmClient main-prompt fallback or
   * user-memory wrapping that `getCustomSystemPrompt` applies.
   */
  systemInstruction?: GenerateContentConfig['systemInstruction'];
  /**
   * Overrides for generation configuration (e.g., temperature, thinkingConfig,
   * or cache-prefix-preserving tool declarations).
   */
  config?: Omit<GenerateContentConfig, 'systemInstruction' | 'abortSignal'>;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId?: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
  /**
   * Stream the response instead of awaiting the whole non-streaming body.
   * Defaults to `false` (unchanged non-streaming behavior). Opt in to keep the
   * HTTP connection alive against BFF gateways whose `proxy_read_timeout` would
   * otherwise kill a slow inference before the first byte arrives. The streamed
   * deltas are collected into the same `{ text, usage }` result.
   */
  stream?: boolean;
  /**
   * Let the OpenAI adapter mark the unchanged history prefix for cache reuse.
   * This is only for requests ending in a non-reusable trailing directive;
   * the adapter deliberately excludes the final message from cache marking.
   */
  promptCacheSharing?: boolean;
  /**
   * When true, throw instead of silently falling back to the main generator if
   * a distinct generator for `model` can't be created (model not registered, or
   * generator creation fails — e.g. a missing cross-provider credential). The
   * vision bridge sets this so image payloads are never routed at the text-only
   * primary while a notice names a different vision endpoint; it fails the
   * conversion closed instead.
   */
  failClosed?: boolean;
}

/**
 * Result of a generateText call.
 */
export interface GenerateTextResult {
  text: string;
  usage: GenerateContentResponseUsageMetadata | undefined;
  /** Whether the response contained a function call. No call is executed here. */
  hadToolCall?: boolean;
}

/**
 * Best-effort JSON-object extraction from a model's text response. Used as a
 * fallback when the model emits plain-text JSON instead of calling the
 * registered tool. Strips a leading ```json / ``` fence, then takes the
 * substring from the first `{` to the matching last `}` and JSON-parses it.
 * Returns the parsed object on success, or `null` if nothing usable is found.
 */
function parseLooseJsonObject(text: string): Record<string, unknown> | null {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  }
  const firstStructuredChar = s.search(/[[{]/);
  if (firstStructuredChar !== -1 && s[firstStructuredChar] === '[') {
    return null;
  }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    const parsed = JSON.parse(s.slice(first, last + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Options for the generateJson utility function.
 */
export interface GenerateJsonOptions {
  gatewayPurpose?: GatewayOperationPurpose;
  /** The input prompt or history. */
  contents: Content[];
  /** The required JSON schema for the output. */
  schema: Record<string, unknown>;
  /** The specific model to use for this task. */
  model: string;
  /**
   * Task-specific system instructions.
   * If omitted, no system instruction is sent.
   */
  systemInstruction?: string | Part | Part[] | Content;
  /**
   * Overrides for generation configuration (e.g., temperature).
   */
  config?: Omit<
    GenerateContentConfig,
    | 'systemInstruction'
    | 'responseJsonSchema'
    | 'responseMimeType'
    | 'tools'
    | 'abortSignal'
  >;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId?: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
}

/**
 * A client dedicated to stateless, utility-focused LLM calls.
 */
export class BaseLlmClient {
  /**
   * Cache of per-model ContentGenerators keyed by model ID. Avoids rebuilding
   * the generator (SDK instantiation, config resolution) on every side query.
   * Cleared via {@link clearPerModelGeneratorCache} when the session resets.
   */
  private readonly perModelGeneratorCache = new Map<
    string,
    Promise<RuntimeContentGeneratorView>
  >();

  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly config: Config,
  ) {}

  private getCurrentContentGenerator(): ContentGenerator {
    return this.config.getContentGenerator?.() ?? this.contentGenerator;
  }

  async generateJson(
    options: GenerateJsonOptions,
  ): Promise<Record<string, unknown>> {
    const {
      contents,
      schema,
      model,
      abortSignal,
      systemInstruction,
      promptId,
      maxAttempts,
    } = options;

    const requestConfig: GenerateContentConfig = {
      abortSignal,
      ...options.config,
      ...(systemInstruction && { systemInstruction }),
    };

    // Convert schema to function declaration
    const functionDeclaration: FunctionDeclaration = {
      name: 'respond_in_schema',
      description: 'Provide the response in provided schema',
      parameters: schema as Schema,
    };

    const tools: Tool[] = [
      {
        functionDeclarations: [functionDeclaration],
      },
    ];

    const {
      contentGenerator,
      contentGeneratorConfig,
      retryAuthType,
      retryErrorCodes,
      model: requestModel,
      contextWindowSize: resolvedContextWindowSize,
    } = await this.resolveForModel(model);
    const isGateway = reachesOrganizaOne(contentGeneratorConfig);
    const independent = isGateway
      ? createGatewayIndependentRequest(options.gatewayPurpose)
      : undefined;
    const requestContents = slimCompactionInput(
      isGateway ? gatewayIndependentInput(contents) : contents,
      contentGeneratorConfig.modalities,
    ).slimmedHistory;
    const budgetedConfig = budgetOutputTokensForWindow(
      requestConfig,
      requestContents,
      requestModel,
      contentGeneratorConfig,
      resolvedContextWindowSize,
      resolveSlimmingConfig(this.config.getChatCompression?.())
        .imageTokenEstimate,
      tools,
    );

    try {
      const apiCall = () =>
        contentGenerator.generateContent(
          {
            model: requestModel,
            ...(independent ? { gatewayIndependentRequest: independent } : {}),
            config: {
              ...budgetedConfig,
              tools,
              // Force the model to call the respond_in_schema tool rather
              // than free-texting. Without this, Anthropic-native and
              // some OpenAI-compat providers default to tool_choice=auto
              // and may skip the tool call entirely — especially
              // adaptive-thinking models that consume the tiny output
              // budget on thinking before producing any tool_use.
              toolConfig: {
                functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
              },
            },
            contents: requestContents,
          },
          promptId ?? '',
        );

      const result = await retryWithBackoff(apiCall, {
        maxAttempts: maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        authType: retryAuthType,
        extraRetryErrorCodes: retryErrorCodes,
        persistentMode: isUnattendedMode(),
        signal: abortSignal,
        heartbeatFn: (info) => {
          process.stderr.write(
            `[o1-code] Waiting for API capacity... attempt ${info.attempt}, retry in ${Math.ceil(info.remainingMs / 1000)}s\n`,
          );
        },
        onRetry: (info) => {
          logApiRetry(
            this.config,
            new ApiRetryEvent({
              model: requestModel,
              promptId,
              attemptNumber: info.attempt,
              error: info.error,
              statusCode: info.errorStatus,
              retryDelayMs: info.delayMs,
              subagentName: subagentNameContext.getStore(),
            }),
          );
        },
      });

      const functionCalls = getFunctionCalls(result);
      if (functionCalls && functionCalls.length > 0) {
        const functionCall = functionCalls.find(
          (call) => call.name === 'respond_in_schema',
        );
        if (functionCall && functionCall.args) {
          return functionCall.args as Record<string, unknown>;
        }
      }

      const text = getResponseText(result);
      if (text) {
        const parsed = parseLooseJsonObject(text);
        if (parsed) return parsed;
      }
      return {};
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      // Avoid double reporting for the empty response case handled above
      if (
        error instanceof Error &&
        error.message === 'API returned an empty response for generateJson.'
      ) {
        throw error;
      }

      await reportError(
        error,
        'Error generating JSON content via API.',
        contents,
        'generateJson-api',
      );
      throw new Error(
        `Failed to generate JSON content${promptId ? ` (${promptId})` : ''}: ${getErrorMessage(error)}`,
        { cause: error },
      );
    }
  }

  /**
   * Free-form text generation primitive used by `runSideQuery` text mode.
   *
   * Distinct from `LlmClient.generateContent`: this calls the underlying
   * `ContentGenerator` directly, so the caller's `systemInstruction` is sent
   * through verbatim — no `getCustomSystemPrompt` wrapping (which would append
   * user memory) and no main-session-prompt fallback when omitted. Side queries
   * need that contract; the main turn does not.
   */
  async generateText(
    options: GenerateTextOptions,
  ): Promise<GenerateTextResult> {
    const {
      contents,
      model,
      abortSignal,
      systemInstruction,
      promptId,
      maxAttempts,
      stream,
    } = options;

    const requestConfig: GenerateContentConfig = {
      abortSignal,
      ...options.config,
      ...(systemInstruction && { systemInstruction }),
    };

    const {
      contentGenerator,
      contentGeneratorConfig,
      retryAuthType,
      retryErrorCodes,
      model: requestModel,
      contextWindowSize: resolvedContextWindowSize,
    } = await this.resolveForModel(model, { failClosed: options.failClosed });
    const isGateway = reachesOrganizaOne(contentGeneratorConfig);
    const independent = isGateway
      ? createGatewayIndependentRequest(options.gatewayPurpose)
      : undefined;
    const requestContents = slimCompactionInput(
      isGateway ? gatewayIndependentInput(contents) : contents,
      contentGeneratorConfig.modalities,
    ).slimmedHistory;
    const budgetedConfig = budgetOutputTokensForWindow(
      requestConfig,
      requestContents,
      requestModel,
      contentGeneratorConfig,
      resolvedContextWindowSize,
      resolveSlimmingConfig(this.config.getChatCompression?.())
        .imageTokenEstimate,
    );

    try {
      const request: PromptCacheSharingParameters = {
        model: requestModel,
        ...(independent ? { gatewayIndependentRequest: independent } : {}),
        config: budgetedConfig,
        contents: requestContents,
        ...(options.promptCacheSharing && { promptCacheSharing: true }),
      };

      // Both branches resolve to the same `{ text, usage }` shape so a single
      // retryWithBackoff governs the whole request (a mid-stream failure retries
      // the entire call — side queries are idempotent). Streaming keeps the HTTP
      // connection alive so a slow inference can't be killed by a gateway's
      // `proxy_read_timeout`; non-streaming is the unchanged default.
      const apiCall: () => Promise<GenerateTextResult> = stream
        ? async () => {
            const responseStream = await contentGenerator.generateContentStream(
              request,
              promptId ?? '',
            );
            // Chunks are deltas, not cumulative snapshots, so concatenate.
            // getResponseText already drops thought parts; usageMetadata rides
            // the final chunk (last one wins), matching the non-streaming read.
            let text = '';
            let usage: GenerateContentResponseUsageMetadata | undefined;
            let hadToolCall = false;
            for await (const chunk of responseStream) {
              text += getResponseText(chunk) ?? '';
              hadToolCall ||= (getFunctionCalls(chunk)?.length ?? 0) > 0;
              if (chunk.usageMetadata) {
                usage = chunk.usageMetadata;
              }
            }
            return { text, usage, hadToolCall };
          }
        : async () => {
            const result = await contentGenerator.generateContent(
              request,
              promptId ?? '',
            );
            return {
              text: getResponseText(result) ?? '',
              usage: result.usageMetadata,
              hadToolCall: (getFunctionCalls(result)?.length ?? 0) > 0,
            };
          };

      const result = await retryWithBackoff(apiCall, {
        maxAttempts: maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        authType: retryAuthType,
        extraRetryErrorCodes: retryErrorCodes,
        persistentMode: isUnattendedMode(),
        signal: abortSignal,
        heartbeatFn: (info) => {
          process.stderr.write(
            `[o1-code] Waiting for API capacity... attempt ${info.attempt}, retry in ${Math.ceil(info.remainingMs / 1000)}s\n`,
          );
        },
        onRetry: (info) => {
          logApiRetry(
            this.config,
            new ApiRetryEvent({
              model: requestModel,
              promptId,
              attemptNumber: info.attempt,
              error: info.error,
              statusCode: info.errorStatus,
              retryDelayMs: info.delayMs,
              subagentName: subagentNameContext.getStore(),
            }),
          );
        },
      });

      return {
        text: result.text.trim(),
        usage: result.usage,
        hadToolCall: result.hadToolCall,
      };
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        // Mark streaming failures so an oncall can tell a mid-stream error
        // apart from the original non-streaming gateway timeout.
        `Error generating text content via API${stream ? ' [streaming]' : ''}.`,
        contents,
        'generateText-api',
      );
      throw new Error(
        `Failed to generate text content${promptId ? ` (${promptId})` : ''}: ${getErrorMessage(error)}`,
        { cause: error },
      );
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    const embedModelParams: EmbedContentParameters = {
      model: this.config.getEmbeddingModel(),
      contents: texts,
    };

    const embedContentResponse =
      await this.contentGenerator.embedContent(embedModelParams);
    if (
      !embedContentResponse.embeddings ||
      embedContentResponse.embeddings.length === 0
    ) {
      throw new Error('No embeddings found in API response.');
    }

    if (embedContentResponse.embeddings.length !== texts.length) {
      throw new Error(
        `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`,
      );
    }

    return embedContentResponse.embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length === 0) {
        throw new Error(
          `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
        );
      }
      return values;
    });
  }

  /**
   * Resolve the ContentGenerator and retry authType for a request targeting
   * a specific model.
   *
   * When the requested model matches the main session model, returns the
   * constructor-injected generator and the main session's authType. When it
   * differs (e.g. a fast model on a different provider), constructs and caches
   * a per-model generator with that provider's auth, baseUrl, sampling, and
   * extra_body settings — and reports the target provider as the retry
   * authType so quota detection and provider-specific retry logic line up.
   *
   * Falls back to the main generator when the target model is not registered
   * or generator creation fails (e.g. tests without full auth setup).
   */
  async resolveForModel(
    model: string,
    opts?: { failClosed?: boolean },
  ): Promise<ResolvedGeneratorForModel> {
    const requested = splitModelBaseUrl(model);
    const selector = this.resolveModelSelector(requested.model);
    const requestModel =
      selector?.modelId ?? this.config.getModel() ?? requested.model;
    const mainModel = this.config.getModel() ?? requested.model;
    const mainGeneratorConfig = this.config.getContentGeneratorConfig();
    const mainAuthType = mainGeneratorConfig?.authType;
    const mainBaseUrl = mainGeneratorConfig?.baseUrl;
    const mainRetryErrorCodes = mainGeneratorConfig?.retryErrorCodes;
    const matchesMainBaseUrl =
      requested.baseUrl === undefined || requested.baseUrl === mainBaseUrl;

    if (
      requestModel === mainModel &&
      (!selector?.authType || selector.authType === mainAuthType) &&
      matchesMainBaseUrl
    ) {
      return {
        contentGenerator: this.getCurrentContentGenerator(),
        contentGeneratorConfig: mainGeneratorConfig,
        retryAuthType: mainAuthType,
        retryErrorCodes: mainRetryErrorCodes,
        model: requestModel,
      };
    }

    const { contentGenerator, contentGeneratorConfig } =
      await this.createRuntimeViewForModel(
        requested.model,
        selector,
        opts?.failClosed === true ||
          requested.model.startsWith('o1gw/') ||
          reachesOrganizaOne(mainGeneratorConfig),
        requested.baseUrl,
      );
    const resolvedModel = this.resolveModelAcrossAuthTypes(
      requested.model,
      selector,
      requested.baseUrl,
    );
    const retryAuthType =
      resolvedModel?.authType ?? mainAuthType ?? AuthType.USE_OPENAI;
    const retryErrorCodes =
      resolvedModel?.generationConfig?.retryErrorCodes ?? mainRetryErrorCodes;
    const targetModel = resolvedModel?.id ?? requestModel;
    // A per-model config starts as a copy of the session's, so unless the
    // registry declares a window for the target it still carries the session
    // model's. The fallback hands back the session config object itself, which
    // is how the two routes are told apart.
    const fellBackToSessionGenerator =
      contentGeneratorConfig === mainGeneratorConfig;

    return {
      contentGenerator,
      contentGeneratorConfig,
      retryAuthType,
      retryErrorCodes,
      model: targetModel,
      contextWindowSize: fellBackToSessionGenerator
        ? undefined
        : (resolvedModel?.generationConfig?.contextWindowSize ??
          tokenLimit(targetModel, 'input')),
    };
  }

  /**
   * Drop cached per-model ContentGenerators. Called on session reset so that
   * the next side query picks up updated provider settings.
   */
  clearPerModelGeneratorCache(): void {
    this.perModelGeneratorCache.clear();
  }

  /**
   * Resolve a model across all authTypes. Handles the case where the target
   * model is registered under a different authType than the main model
   * (e.g. main=USE_OPENAI, fast=USE_ANTHROPIC).
   */
  private resolveModelAcrossAuthTypes(
    model: string,
    selector: ResolvedModelId | undefined,
    modelBaseUrl?: string,
  ): ResolvedModelConfig | undefined {
    const modelsConfig = this.config.getModelsConfig?.();
    if (!modelsConfig) return undefined;
    if (!selector) return undefined;
    const modelId = selector.modelId;
    const getResolvedModel = (authType: AuthType) =>
      modelBaseUrl === undefined
        ? modelsConfig.getResolvedModel(authType, modelId)
        : modelsConfig.getResolvedModel(authType, modelId, modelBaseUrl);

    if (selector.authType) {
      return getResolvedModel(selector.authType);
    }

    const allAuthTypes: AuthType[] = [
      AuthType.USE_OPENAI,
      AuthType.USE_VERTEX_AI,
      AuthType.USE_ANTHROPIC,
      AuthType.USE_GEMINI,
    ];

    const mainAuthType = this.config.getContentGeneratorConfig()?.authType;
    if (mainAuthType) {
      const resolved = getResolvedModel(mainAuthType);
      if (resolved) return resolved;
    }

    for (const authType of allAuthTypes) {
      if (authType === mainAuthType) continue;
      const resolved = getResolvedModel(authType);
      if (resolved) return resolved;
    }

    return undefined;
  }

  private async createRuntimeViewForModel(
    model: string,
    selector: ResolvedModelId | undefined,
    failClosed = false,
    modelBaseUrl?: string,
  ): Promise<RuntimeContentGeneratorView> {
    const routeKey = selector
      ? modelBaseUrl === undefined
        ? `${selector.authType ?? ''}:${selector.modelId}`
        : `${selector.authType ?? ''}:${selector.modelId}\0${modelBaseUrl}`
      : model;
    const cacheKey = routeKey;
    const cached = this.perModelGeneratorCache.get(cacheKey);
    const normalizeGeneratorError = (err: unknown) =>
      err instanceof Error
        ? err
        : new Error(
            `Failed to create content generator for model "${model}": ${String(err)}`,
          );
    const fallbackAfterGeneratorError = (
      err: unknown,
    ): RuntimeContentGeneratorView => {
      if (failClosed) throw normalizeGeneratorError(err);
      debugLogger.warn(
        `Failed to create content generator for model "${model}", falling back to main generator.`,
        err instanceof Error ? err.message : String(err),
      );
      return {
        contentGenerator: this.getCurrentContentGenerator(),
        contentGeneratorConfig: this.config.getContentGeneratorConfig(),
      };
    };
    if (cached) return cached.catch(fallbackAfterGeneratorError);

    const resolvedModel = this.resolveModelAcrossAuthTypes(
      model,
      selector,
      modelBaseUrl,
    );

    if (!resolvedModel) {
      // failClosed callers (vision bridge) must NOT silently run on the main
      // generator — that would send image payloads to the text-only primary.
      if (failClosed) {
        const baseUrlMessage =
          modelBaseUrl === undefined ? '' : ` at baseUrl "${modelBaseUrl}"`;
        throw new Error(
          `Model "${model}"${baseUrlMessage} is not registered across any auth type; ` +
            `refusing to fall back to the main generator.`,
        );
      }
      debugLogger.warn(
        `Model "${model}" not found in registry across all authTypes, falling back to main generator.`,
      );
      // Do not cache the fallback: getCurrentContentGenerator() reads the
      // runtime view from AsyncLocalStorage, which can differ between calls
      // (e.g. inside a subagent vs. on the main session). Caching here would
      // pin the first-call view's generator under this selector key.
      return {
        contentGenerator: this.getCurrentContentGenerator(),
        contentGeneratorConfig: this.config.getContentGeneratorConfig(),
      };
    }

    const generatorPromise = (async () => {
      try {
        const targetModel = resolvedModel.id ?? selector?.modelId ?? model;
        const targetConfig = buildAgentContentGeneratorConfig(
          this.config,
          targetModel,
          {
            authType: resolvedModel.authType,
            apiKey: resolvedModel.envKey
              ? resolveModelApiKey({
                  envKey: resolvedModel.envKey,
                  credential: resolvedModel.credential,
                  baseUrl: resolvedModel.baseUrl,
                })
              : undefined,
            baseUrl: resolvedModel.baseUrl,
          },
        );
        if (resolvedModel.capabilities?.vision) {
          targetConfig.modalities = {
            ...targetConfig.modalities,
            image: true,
          };
        }
        return {
          contentGenerator: await createContentGenerator(
            targetConfig,
            this.config,
          ),
          contentGeneratorConfig: targetConfig,
        };
      } catch (err: unknown) {
        this.perModelGeneratorCache.delete(cacheKey);
        throw normalizeGeneratorError(err);
      }
    })();

    this.perModelGeneratorCache.set(cacheKey, generatorPromise);
    return generatorPromise.catch(fallbackAfterGeneratorError);
  }

  private resolveModelSelector(model: string): ResolvedModelId | undefined {
    return resolveModelId(model, buildModelIdContext(this.config));
  }
}
