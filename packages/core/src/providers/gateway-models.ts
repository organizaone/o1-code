/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import { checkProviderKey } from './model-discovery.js';
import { GatewayConversationError } from './gateway-request.js';
import { AuthType } from '../utils/auth-type.js';
import { captureReasoningSnapshot } from '../core/reasoning-overrides.js';

export async function refreshGatewayModels(
  config: Config,
  generation: ContentGeneratorConfig,
): Promise<void> {
  const result = await checkProviderKey({
    gateway: true,
    protocol:
      generation.authType === AuthType.USE_ANTHROPIC ? 'anthropic' : 'openai',
    baseUrl: generation.baseUrl ?? '',
    apiKey: generation.apiKey ?? '',
    staticModels: [],
    clientVersion: config.getCliVersion(),
  });
  if (result.status !== 'ok')
    throw new GatewayConversationError(
      'unavailable',
      'The gateway model catalog could not be verified. Reconnect the provider or try again later; no account fallback was made.',
    );
  const selected = result.models.find((model) => model.id === generation.model);
  if (!selected)
    throw new GatewayConversationError(
      'unavailable',
      'The selected account/model is no longer advertised by this gateway. Select an available route or start a new empty conversation; no fallback was made.',
    );
  const limit = selected.contextWindowSize;
  if (limit)
    generation.contextWindowSize = Math.min(
      generation.contextWindowSize ?? limit,
      limit,
    );
  if (selected.modalities) generation.modalities = selected.modalities;
  if (selected.maxOutputTokens)
    generation.samplingParams = {
      ...generation.samplingParams,
      max_tokens: Math.min(
        typeof generation.samplingParams?.max_tokens === 'number'
          ? generation.samplingParams.max_tokens
          : selected.maxOutputTokens,
        selected.maxOutputTokens,
      ),
    };
  if (!selected.capabilities?.reasoning) generation.reasoning = undefined;
  const saved = config.getModelProvidersConfig();
  if (!saved) return;
  const models = new Map(result.models.map((model) => [model.id, model]));
  const normalize = (url: string | undefined) =>
    url?.replace(/\/+$/, '').replace(/\/v1$/, '');
  const origin = normalize(
    generation.reasoningRouteBaseUrl ?? generation.baseUrl,
  );
  config.reloadModelProvidersConfig(
    Object.fromEntries(
      Object.entries(saved).map(([provider, entries]) => [
        provider,
        entries.flatMap((entry) => {
          if (
            normalize(entry.baseUrl) !== origin ||
            entry.connection !== generation.connection
          )
            return [entry];
          const discovered = models.get(entry.id);
          if (!discovered) return [];
          const window = discovered.contextWindowSize;
          return [
            {
              ...entry,
              capabilities: {
                ...entry.capabilities,
                ...discovered.capabilities,
                gateway: discovered.capabilities?.gateway ?? {},
                reasoning: discovered.capabilities?.reasoning,
              },
              generationConfig: {
                ...entry.generationConfig,
                ...(window
                  ? {
                      contextWindowSize: Math.min(
                        entry.generationConfig?.contextWindowSize ?? window,
                        window,
                      ),
                    }
                  : {}),
                ...(discovered.modalities
                  ? { modalities: discovered.modalities }
                  : {}),
                ...(discovered.maxOutputTokens
                  ? {
                      samplingParams: {
                        ...entry.generationConfig?.samplingParams,
                        max_tokens: Math.min(
                          typeof entry.generationConfig?.samplingParams
                            ?.max_tokens === 'number'
                            ? entry.generationConfig.samplingParams.max_tokens
                            : discovered.maxOutputTokens,
                          discovered.maxOutputTokens,
                        ),
                      },
                    }
                  : {}),
              },
            },
          ];
        }),
      ]),
    ),
  );
  generation.reasoningSnapshot = captureReasoningSnapshot(
    config.getAllConfiguredModels(),
  );
}
