/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithPolicy } from '../utils/fetch.js';
import type { ModelSpec } from './types.js';
import type { ModelReasoningCapabilities } from '../models/types.js';
import {
  REASONING_EFFORT_TIERS,
  type ReasoningEffort,
} from '../core/reasoning-effort.js';
import { anthropicSdkBaseUrl } from '../core/anthropicContentGenerator/o1-base-url.js';

const DISCOVERY_TIMEOUT_MS = 5000;
const DISCOVERY_MAX_BYTES = 1024 * 1024;
const MAX_MODEL_ID_LENGTH = 256;
// The wizard joins ids with commas and renders them raw, so a served id with
// a comma or a code point in the Unicode C (other) category would split into
// bogus models or poison the TUI.
const UNSAFE_MODEL_ID_CHARS = /[,\p{C}\p{Zl}\p{Zp}]/u;

interface DiscoverProviderModelsOptions {
  baseUrl: string;
  apiKey: string;
  staticModels: readonly ModelSpec[];
  signal?: AbortSignal;
}

interface DiscoveredModel {
  id: string;
  created?: number;
  reasoning?: ModelReasoningCapabilities;
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return REASONING_EFFORT_TIERS.includes(value as ReasoningEffort);
}

/**
 * What a model list says about reasoning effort. The OrganizaOne proxy states
 * it per model as `reasoning: { efforts, default }`; until it does, a model it
 * runs through Claude CLI (`owned_by: "claude-cli"`) takes the whole ladder,
 * which is what the proxy applies. Anything else says nothing, and a model
 * that says nothing is not sent an effort it may not accept.
 */
function readReasoning(item: object): ModelReasoningCapabilities | undefined {
  const declared = (item as { reasoning?: unknown }).reasoning;
  let efforts: ReasoningEffort[] = [];
  let defaultEffort: ReasoningEffort | undefined;
  if (declared && typeof declared === 'object') {
    const { efforts: listed, default: preset } = declared as {
      efforts?: unknown;
      default?: unknown;
    };
    if (Array.isArray(listed)) {
      efforts = REASONING_EFFORT_TIERS.filter((tier) => listed.includes(tier));
    }
    if (isReasoningEffort(preset) && efforts.includes(preset)) {
      defaultEffort = preset;
    }
  } else if ((item as { owned_by?: unknown }).owned_by === 'claude-cli') {
    efforts = [...REASONING_EFFORT_TIERS];
  }
  if (efforts.length === 0) return undefined;
  return {
    thinking: true,
    efforts,
    ...(defaultEffort ? { defaultEffort } : {}),
    disableField: 'reasoning_effort',
  };
}

function readModels(value: unknown): DiscoveredModel[] | null {
  if (!value || typeof value !== 'object' || !('data' in value)) {
    return null;
  }
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return null;
  }

  const models: DiscoveredModel[] = [];
  const seen = new Set<string>();
  for (const item of data) {
    if (!item || typeof item !== 'object' || !('id' in item)) {
      return null;
    }
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string') {
      return null;
    }
    const trimmedId = id.trim();
    if (
      trimmedId &&
      trimmedId.length <= MAX_MODEL_ID_LENGTH &&
      !UNSAFE_MODEL_ID_CHARS.test(trimmedId) &&
      !seen.has(trimmedId)
    ) {
      seen.add(trimmedId);
      const created = (item as { created?: unknown }).created;
      const creationTime =
        typeof created === 'number' && Number.isFinite(created) && created >= 0
          ? created
          : undefined;
      const reasoning = readReasoning(item);
      models.push({
        id: trimmedId,
        ...(creationTime === undefined ? {} : { created: creationTime }),
        ...(reasoning ? { reasoning } : {}),
      });
    }
  }
  return models.length > 0 ? models : null;
}

/**
 * Reads Gemini's `{ models: [{ name: 'models/<id>', supportedGenerationMethods }] }`
 * into the OpenAI list shape, keeping only the models that generate content.
 */
function readGeminiModels(value: unknown): DiscoveredModel[] | null {
  if (!value || typeof value !== 'object' || !('models' in value)) {
    return null;
  }
  const list = (value as { models?: unknown }).models;
  if (!Array.isArray(list)) {
    return null;
  }
  const data: Array<{ id: string }> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') return null;
    const { name, supportedGenerationMethods } = item as {
      name?: unknown;
      supportedGenerationMethods?: unknown;
    };
    if (typeof name !== 'string') return null;
    if (
      Array.isArray(supportedGenerationMethods) &&
      supportedGenerationMethods.includes('generateContent')
    ) {
      data.push({
        id: name.startsWith('models/') ? name.slice('models/'.length) : name,
      });
    }
  }
  return readModels({ data });
}

function mergeModelSpecs(
  discoveredModels: DiscoveredModel[],
  staticModels: readonly ModelSpec[],
): ModelSpec[] {
  const staticModelsById = new Map(
    staticModels.map((model) => [model.id, model]),
  );
  const orderedModels = [...discoveredModels];
  if (orderedModels.every((model) => model.created !== undefined)) {
    orderedModels.sort(
      (left, right) => (right.created ?? 0) - (left.created ?? 0),
    );
  }
  return orderedModels.map(
    ({ id, reasoning }) =>
      staticModelsById.get(id) ??
      (reasoning ? { id, capabilities: { reasoning } } : { id }),
  );
}

/** The wire protocol a provider speaks; it decides how its models are listed. */
export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini';

/**
 * What asking the provider for its models says about the key:
 * - `ok`: the key works; `models` is what the provider serves (or the built-in
 *   list when the answer carries none);
 * - `rejected`: the provider refused the key (401 or 403; Gemini also answers
 *   400 to a malformed key);
 * - `unavailable`: the key could not be checked (no model list, network).
 */
export type ProviderKeyCheck =
  | { status: 'ok'; models: ModelSpec[] }
  | { status: 'rejected'; httpStatus: number }
  | { status: 'unavailable' };

interface CheckProviderKeyOptions extends DiscoverProviderModelsOptions {
  protocol: ProviderProtocol;
}

const ANTHROPIC_VERSION = '2023-06-01';

function modelListRequest(
  protocol: ProviderProtocol,
  baseUrl: string,
  apiKey: string,
): { url: string; headers: Record<string, string> } {
  const base = baseUrl.replace(/\/+$/, '');
  if (protocol === 'gemini') {
    return {
      url: `${base}/v1beta/models`,
      headers: { Accept: 'application/json', 'x-goog-api-key': apiKey },
    };
  }
  if (protocol === 'anthropic') {
    // Anthropic lists models at /v1/models and authenticates by header; a
    // base URL written with /v1 is accepted, as the generator accepts it.
    return {
      url: `${anthropicSdkBaseUrl(base)}/v1/models`,
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    };
  }
  return {
    url: `${base}/models`,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

/** Asks the provider for its models, which also tells whether the key works. */
export async function checkProviderKey({
  protocol,
  baseUrl,
  apiKey,
  staticModels,
  signal,
}: CheckProviderKeyOptions): Promise<ProviderKeyCheck> {
  const normalizedBaseUrl = baseUrl.trim();
  const normalizedApiKey = apiKey.trim();
  if (!normalizedBaseUrl || !normalizedApiKey) return { status: 'unavailable' };
  const request = modelListRequest(
    protocol,
    normalizedBaseUrl,
    normalizedApiKey,
  );

  try {
    const result = await fetchWithPolicy(request.url, {
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      maxBytes: DISCOVERY_MAX_BYTES,
      maxRedirects: 2,
      headers: request.headers,
      signal,
    });
    if (result.kind !== 'response') return { status: 'unavailable' };
    if (
      result.status === 401 ||
      result.status === 403 ||
      // Gemini answers an invalid key with 400 API_KEY_INVALID.
      (protocol === 'gemini' && result.status === 400)
    ) {
      return { status: 'rejected', httpStatus: result.status };
    }
    if (result.status < 200 || result.status >= 300) {
      return { status: 'unavailable' };
    }
    // Only a model list proves the key: a wrong base URL can answer 200
    // with a page.
    const body: unknown = JSON.parse(result.body.toString('utf8'));
    const models =
      protocol === 'gemini' ? readGeminiModels(body) : readModels(body);
    if (!models) return { status: 'unavailable' };
    return { status: 'ok', models: mergeModelSpecs(models, staticModels) };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function discoverProviderModels({
  baseUrl,
  apiKey,
  staticModels,
  signal,
}: DiscoverProviderModelsOptions): Promise<ModelSpec[] | null> {
  const normalizedBaseUrl = baseUrl.trim();
  const normalizedApiKey = apiKey.trim();
  if (!normalizedBaseUrl || !normalizedApiKey) {
    return null;
  }

  try {
    const modelsUrl = `${normalizedBaseUrl.replace(/\/+$/, '')}/models`;
    const result = await fetchWithPolicy(modelsUrl, {
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      maxBytes: DISCOVERY_MAX_BYTES,
      maxRedirects: 2,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizedApiKey}`,
      },
      signal,
    });
    if (
      result.kind !== 'response' ||
      result.status < 200 ||
      result.status >= 300
    ) {
      return null;
    }

    const models = readModels(JSON.parse(result.body.toString('utf8')));
    return models ? mergeModelSpecs(models, staticModels) : null;
  } catch {
    return null;
  }
}
