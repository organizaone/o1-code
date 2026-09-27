/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Anthropic SDK appends `/v1/messages` to its base URL, so a configured
 * `baseUrl` that already ends in `/v1` — the OpenAI-protocol habit — would
 * request `/v1/v1/messages`. Accept both forms by dropping that suffix.
 * An absent value stays absent so the SDK still reads `ANTHROPIC_BASE_URL`.
 */
export function anthropicSdkBaseUrl(
  baseUrl: string | undefined,
): string | undefined {
  return baseUrl?.replace(/\/v1\/?$/, '');
}
