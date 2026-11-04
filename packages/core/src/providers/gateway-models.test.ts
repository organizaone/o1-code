/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import {
  AuthType,
  type ContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { checkProviderKey } from './model-discovery.js';
import { refreshGatewayModels } from './gateway-models.js';

vi.mock('./model-discovery.js', () => ({ checkProviderKey: vi.fn() }));

beforeEach(() => vi.mocked(checkProviderKey).mockReset());

describe('gateway catalog refresh', () => {
  const id = 'o1gw/account/copilot/2/auto';
  const baseUrl = 'https://api.organizaone.com/v1';

  function setup() {
    const generation: ContentGeneratorConfig = {
      model: id,
      authType: AuthType.USE_OPENAI,
      baseUrl,
      apiKey: 'synthetic-only',
      contextWindowSize: 256000,
      samplingParams: { max_tokens: 8000 },
      reasoning: { effort: 'high' },
    };
    const other = {
      id,
      baseUrl: 'https://other.example/v1',
      generationConfig: { contextWindowSize: 1234 },
    };
    const reload = vi.fn();
    const config = {
      getCliVersion: () => 'test',
      getModelProvidersConfig: () => ({
        openai: [
          {
            id,
            baseUrl,
            generationConfig: {
              contextWindowSize: 64000,
              samplingParams: { max_tokens: 500 },
            },
            capabilities: { reasoning: { thinking: true, efforts: ['high'] } },
          },
          { id: 'o1gw/account/copilot/9/removed', baseUrl },
          other,
        ],
      }),
      reloadModelProvidersConfig: reload,
      getAllConfiguredModels: () => [],
    } as unknown as Config;
    return { generation, config, reload, other };
  }

  it('retains smaller configured limits, removes revoked routes and isolates gateways', async () => {
    const { generation, config, reload, other } = setup();
    vi.mocked(checkProviderKey).mockResolvedValue({
      status: 'ok',
      models: [{ id, contextWindowSize: 128000, maxOutputTokens: 4000 }],
    });
    await refreshGatewayModels(config, generation);
    expect(generation.contextWindowSize).toBe(128000);
    expect(generation.samplingParams?.max_tokens).toBe(4000);
    expect(generation.reasoning).toBeUndefined();
    const updated = reload.mock.calls[0][0].openai;
    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject({
      id,
      generationConfig: {
        contextWindowSize: 64000,
        samplingParams: { max_tokens: 500 },
      },
    });
    expect(updated[0].capabilities.reasoning).toBeUndefined();
    expect(updated[1]).toEqual(other);
  });

  it('refuses a missing selected route before mutating the registry', async () => {
    const { generation, config, reload } = setup();
    vi.mocked(checkProviderKey).mockResolvedValue({
      status: 'ok',
      models: [{ id: 'o1gw/account/copilot/3/auto' }],
    });
    await expect(
      refreshGatewayModels(config, generation),
    ).rejects.toMatchObject({ reason: 'unavailable' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('refuses an unverifiable catalog without falling back', async () => {
    const { generation, config, reload } = setup();
    vi.mocked(checkProviderKey).mockResolvedValue({ status: 'unavailable' });
    await expect(
      refreshGatewayModels(config, generation),
    ).rejects.toMatchObject({ reason: 'unavailable' });
    expect(reload).not.toHaveBeenCalled();
  });
});
