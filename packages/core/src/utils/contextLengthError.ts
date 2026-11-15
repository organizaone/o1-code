/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ContextLengthExceededInfo {
  isExceeded: boolean;
  message: string;
  actualTokens?: number;
  limitTokens?: number;
}

const MAX_COLLECT_DEPTH = 4;

const TIMEOUT_PATTERNS = [
  /\bcontext deadline exceeded\b/i,
  /\bdeadline exceeded\b/i,
  /\b(?:request|connection|read|context)\s+timed out\b/i,
  /\b(?:request|connection|read|context)\s+timeout\b/i,
  /\b(?:timeout|timed out)\s+(?:after|while|during)\b/i,
];

const CONTEXT_LENGTH_PATTERNS = [
  /\bcontext[_\s-]?length[_\s-]?exceeded\b/i,
  /\bmaximum context length\b/i,
  /\bprompt\s+(?:is\s+)?too long\b/i,
  /\binput\s+(?:token\s+)?(?:count\s+|length\s+)?(?:is\s+)?too long\b/i,
  /\brange of input length should be\b/i,
  // Hugging Face TGI: "`inputs` tokens + `max_new_tokens` must be <= 32768.
  // Given: 40000 `inputs` tokens and 1000 `max_new_tokens`" and "`inputs`
  // must have less than 32768 tokens. Given: 40000".
  /\binputs`?\s+tokens\s*\+\s*`?max_new_tokens`?\s+must be\s*<=/i,
  /\binputs`?\s+must have less than\s+\d[\d,]*\s+tokens\b/i,
  // llama.cpp: "request (279935 tokens) exceeds the available context size
  // (262144 tokens), try increasing it".
  /\bexceeds the available context size\b/i,
  /\btoo many tokens\b/i,
  // "exceeds the model's context window", "exceed context limit" (Anthropic's
  // input + max_tokens refusal), Codex's ContextWindowExceeded.
  /\bexceed(?:s|ed|ing)?\b[^\n]{0,80}\bcontext\s+(?:window|limit|length)\b/i,
  /\bcontext[_\s-]?window[_\s-]?exceeded\b/i,
  /\btokens?\s*>\s*[\d,]+\s*(?:maximum|max|limit)\b/i,
  /\b(?:input|prompt|messages?|context)\b[^\n]{0,120}\btokens?\b[^\n]{0,120}\bexceed(?:s|ed|ing)?\b/i,
];

function parseInteger(value: string): number {
  return Number.parseInt(value.replace(/,/g, ''), 10);
}

function parseTokenCounts(text: string): {
  actualTokens?: number;
  limitTokens?: number;
} {
  const greaterThanMatch = text.match(/(\d[\d,]*)\s*tokens?\s*>\s*(\d[\d,]*)/i);
  if (greaterThanMatch) {
    return {
      actualTokens: parseInteger(greaterThanMatch[1]!),
      limitTokens: parseInteger(greaterThanMatch[2]!),
    };
  }

  const openAiMatch = text.match(
    /maximum context length is\s*(\d[\d,]*)\s*tokens?[\s\S]*?(?:resulted in|requested|used)\s*(\d[\d,]*)\s*tokens?/i,
  );
  if (openAiMatch) {
    return {
      actualTokens: parseInteger(openAiMatch[2]!),
      limitTokens: parseInteger(openAiMatch[1]!),
    };
  }

  const maxContextLimitMatch = text.match(
    /maximum context length is\s*(\d[\d,]*)\s*tokens?/i,
  );
  if (maxContextLimitMatch) {
    return {
      limitTokens: parseInteger(maxContextLimitMatch[1]!),
    };
  }

  const inputExceedsMatch = text.match(
    /input\s+token\s+(?:count|length)[^\d]*(\d[\d,]*)[\s\S]*?exceed(?:s|ed)?[\s\S]*?(?:maximum|limit)[^\d]*(\d[\d,]*)/i,
  );
  if (inputExceedsMatch) {
    return {
      actualTokens: parseInteger(inputExceedsMatch[1]!),
      limitTokens: parseInteger(inputExceedsMatch[2]!),
    };
  }

  // DashScope: "Range of input length should be [1, 196608]" — the upper
  // bound is the server's REAL input ceiling (observed to differ from the
  // configured context window), so parse it out for the retry paths.
  const rangeMatch = text.match(
    /range of input length should be\s*\[\s*\d[\d,]*\s*,\s*(\d[\d,]*)\s*\]/i,
  );
  if (rangeMatch) {
    return {
      limitTokens: parseInteger(rangeMatch[1]!),
    };
  }

  // TGI states the bound first and the prompt size after "Given:"; in both
  // wordings the `inputs` count is the prompt size compaction starts from.
  const tgiTotalMatch = text.match(
    /must be\s*<=\s*(\d[\d,]{0,31})\.?\s*Given:\s*(\d[\d,]{0,31})\s*`?inputs`?\s+tokens/i,
  );
  if (tgiTotalMatch) {
    return {
      actualTokens: parseInteger(tgiTotalMatch[2]!),
      limitTokens: parseInteger(tgiTotalMatch[1]!),
    };
  }
  const tgiInputMatch = text.match(
    /must have less than\s+(\d[\d,]{0,31})\s+tokens\.?\s*Given:\s*(\d[\d,]{0,31})/i,
  );
  if (tgiInputMatch) {
    return {
      actualTokens: parseInteger(tgiInputMatch[2]!),
      limitTokens: parseInteger(tgiInputMatch[1]!),
    };
  }

  // llama.cpp: the second number is the server's real ceiling (`-c` or the
  // model's `n_ctx`), which often differs from the window inferred here.
  const llamaCppMatch = text.match(
    /\(\s*(\d[\d,]*)\s*tokens?\s*\)\s*exceeds the available context size\s*\(\s*(\d[\d,]*)\s*tokens?\s*\)/i,
  );
  if (llamaCppMatch) {
    return {
      actualTokens: parseInteger(llamaCppMatch[1]!),
      limitTokens: parseInteger(llamaCppMatch[2]!),
    };
  }

  return {};
}

function tryParseEmbeddedJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // Fall through to embedded-object parsing.
    }
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return undefined;
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

function safeReadProperty(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function enumerableValues(value: object): unknown[] {
  try {
    return Object.values(value);
  } catch {
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      return Object.values(descriptors)
        .filter(
          (descriptor): descriptor is PropertyDescriptor & { value: unknown } =>
            'value' in descriptor && descriptor.enumerable === true,
        )
        .map((descriptor) => descriptor.value);
    } catch {
      return [];
    }
  }
}

function collectStrings(
  value: unknown,
  seen: Set<object>,
  depth = 0,
): string[] {
  if (depth > MAX_COLLECT_DEPTH || value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    const parsed = tryParseEmbeddedJson(value);
    if (parsed === undefined) {
      return [value];
    }
    return [value, ...collectStrings(parsed, seen, depth + 1)];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (typeof value !== 'object') {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  const strings: string[] = [];
  if (value instanceof Error) {
    const name = safeReadProperty(value, 'name');
    const message = safeReadProperty(value, 'message');

    if (typeof name === 'string') {
      strings.push(name);
    }
    if (typeof message === 'string') {
      strings.push(message);
    }
    strings.push(
      ...collectStrings(safeReadProperty(value, 'cause'), seen, depth + 1),
    );
  }

  for (const nested of enumerableValues(value)) {
    strings.push(...collectStrings(nested, seen, depth + 1));
  }

  return strings;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function getContextLengthExceededInfo(
  error: unknown,
): ContextLengthExceededInfo {
  const fragments = uniqueNonEmpty(collectStrings(error, new Set<object>()));
  const message = fragments.join('\n');
  // The timeout veto is applied per fragment, alongside the context-length
  // test it is vetoing. Testing it against the joined message instead let a
  // timeout phrase anywhere in the error object suppress detection for the
  // whole error -- and provider SDKs routinely attach retry/attempt metadata,
  // so an overflow arriving with `previous attempt: request timed out` in a
  // sibling field was reported as not-an-overflow and never reached the
  // compaction path. A fragment counts as evidence only if it names a
  // context-length failure and is not itself a timeout message.
  const isExceeded = fragments.some(
    (fragment) =>
      CONTEXT_LENGTH_PATTERNS.some((pattern) => pattern.test(fragment)) &&
      !TIMEOUT_PATTERNS.some((pattern) => pattern.test(fragment)),
  );
  const counts = isExceeded ? parseTokenCounts(message) : {};

  return {
    isExceeded,
    message,
    ...counts,
  };
}

export function isContextLengthExceededError(error: unknown): boolean {
  return getContextLengthExceededInfo(error).isExceeded;
}
