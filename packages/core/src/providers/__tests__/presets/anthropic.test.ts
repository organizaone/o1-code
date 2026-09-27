/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AuthType } from '../../../core/contentGenerator.js';
import { anthropicProvider } from '../../presets/anthropic.js';
import { buildInstallPlan, shouldShowStep } from '../../provider-config.js';

describe('anthropicProvider', () => {
  it('connects to Anthropic with a key from its console', () => {
    expect(anthropicProvider).toMatchObject({
      id: 'anthropic',
      label: 'Anthropic',
      description: 'Claude · key from console.anthropic.com',
      protocol: AuthType.USE_ANTHROPIC,
      baseUrl: 'https://api.anthropic.com/v1',
      envKey: 'ANTHROPIC_API_KEY',
      supportsModelDiscovery: true,
      uiGroup: 'apiKey',
    });
    expect(anthropicProvider.documentationUrl).toMatch(/^https:\/\//);
  });

  it('asks for the key and the models, not the endpoint', () => {
    expect(shouldShowStep(anthropicProvider, 'baseUrl')).toBe(false);
    expect(shouldShowStep(anthropicProvider, 'apiKey')).toBe(true);
    expect(shouldShowStep(anthropicProvider, 'models')).toBe(true);
  });

  it('installs the chosen models under the anthropic protocol with its credential', () => {
    const plan = buildInstallPlan(anthropicProvider, {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-key',
      modelIds: ['claude-sonnet-4-5'],
    });

    expect(plan.authType).toBe(AuthType.USE_ANTHROPIC);
    expect(plan.credential).toEqual({ id: 'anthropic', apiKey: 'sk-ant-key' });
    expect(plan.modelProviders?.[0]?.models[0]).toMatchObject({
      id: 'claude-sonnet-4-5',
      baseUrl: 'https://api.anthropic.com/v1',
      envKey: 'ANTHROPIC_API_KEY',
      credential: 'anthropic',
    });
  });
});
