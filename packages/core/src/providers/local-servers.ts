/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detects model servers running on this machine. Each probe asks an endpoint
 * only that server serves (Ollama's `/api/tags`, LM Studio's `/api/v0/models`),
 * so an answer identifies the server as well as listing its models. A probe
 * never throws: any failure reads as "not running".
 */

export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
export const LMSTUDIO_BASE_URL = 'http://127.0.0.1:1234/v1';

const OLLAMA_TAGS_URL = 'http://127.0.0.1:11434/api/tags';
const LMSTUDIO_MODELS_URL = 'http://127.0.0.1:1234/api/v0/models';
const DEFAULT_TIMEOUT_MS = 800;
const MAX_MODEL_ID_LENGTH = 256;
// Same rule as model discovery: the wizard renders ids raw and joins them
// with commas.
const UNSAFE_MODEL_ID_CHARS = /[,\p{C}\p{Zl}\p{Zp}]/u;

export type LocalServerId = 'ollama' | 'lmstudio';

export interface LocalServerProbe {
  id: LocalServerId;
  /** The OpenAI-compatible base URL a provider entry uses for this server. */
  baseUrl: string;
  running: boolean;
  models: string[];
}

export interface OpenAiServerProbe {
  baseUrl: string;
  running: boolean;
  models: string[];
}

export interface ProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

/** Reads `list[].field` as model ids; `null` when the shape is wrong. */
function readIds(list: unknown, field: 'name' | 'id'): string[] | null {
  if (!Array.isArray(list)) return null;
  const ids: string[] = [];
  for (const item of list) {
    const value =
      item && typeof item === 'object'
        ? (item as Record<string, unknown>)[field]
        : undefined;
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (
      id &&
      id.length <= MAX_MODEL_ID_LENGTH &&
      !UNSAFE_MODEL_ID_CHARS.test(id) &&
      !ids.includes(id)
    ) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * GETs `url` and hands its JSON to `read`; `null` on any failure, a non-2xx
 * answer, a timeout, an abort, or a body `read` does not recognise.
 */
async function getModels(
  url: string,
  read: (body: unknown) => string[] | null,
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetch }: ProbeOptions,
): Promise<string[] | null> {
  const doFetch = fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await doFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: combined,
    });
    if (!response.ok) return null;
    return read(await response.json());
  } catch {
    return null;
  }
}

function field(body: unknown, key: string): unknown {
  return body && typeof body === 'object'
    ? (body as Record<string, unknown>)[key]
    : undefined;
}

function toProbe(
  id: LocalServerId,
  baseUrl: string,
  models: string[] | null,
): LocalServerProbe {
  return { id, baseUrl, running: models !== null, models: models ?? [] };
}

/** Probes Ollama and LM Studio on their default loopback ports, in parallel. */
export async function probeLocalServers(
  options: ProbeOptions = {},
): Promise<LocalServerProbe[]> {
  const [ollama, lmstudio] = await Promise.all([
    getModels(
      OLLAMA_TAGS_URL,
      (body) => readIds(field(body, 'models'), 'name'),
      options,
    ),
    getModels(
      LMSTUDIO_MODELS_URL,
      (body) => readIds(field(body, 'data'), 'id'),
      options,
    ),
  ]);
  return [
    toProbe('ollama', OLLAMA_BASE_URL, ollama),
    toProbe('lmstudio', LMSTUDIO_BASE_URL, lmstudio),
  ];
}

/** Probes any OpenAI-compatible server through `GET {baseUrl}/models`. */
export async function probeOpenAiServer(
  baseUrl: string,
  options: ProbeOptions = {},
): Promise<OpenAiServerProbe> {
  const trimmed = baseUrl.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed.charCodeAt(end - 1) === 47 /* / */) end--;
  const base = trimmed.slice(0, end);
  let url: string;
  try {
    url = new URL(`${base}/models`).toString();
  } catch {
    return { baseUrl: base, running: false, models: [] };
  }
  const models = await getModels(
    url,
    (body) => readIds(field(body, 'data'), 'id'),
    options,
  );
  return { baseUrl: base, running: models !== null, models: models ?? [] };
}
