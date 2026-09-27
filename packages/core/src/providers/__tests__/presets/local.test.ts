/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AuthType } from '../../../core/contentGenerator.js';
import { ollamaProvider } from '../../presets/ollama.js';
import { lmstudioProvider } from '../../presets/lmstudio.js';
import {
  LOCAL_API_KEY_PLACEHOLDER,
  localOpenAiProvider,
} from '../../presets/local-openai.js';
import { buildInstallPlan, shouldShowStep } from '../../provider-config.js';

describe('local presets', () => {
  it('points Ollama at its OpenAI-compatible endpoint on this machine', () => {
    expect(ollamaProvider).toMatchObject({
      id: 'ollama',
      label: 'Ollama',
      protocol: AuthType.USE_OPENAI,
      baseUrl: 'http://127.0.0.1:11434/v1',
      uiGroup: 'local',
      localProbe: { kind: 'ollama' },
      supportsModelDiscovery: true,
    });
  });

  it('points LM Studio at its OpenAI-compatible endpoint on this machine', () => {
    expect(lmstudioProvider).toMatchObject({
      id: 'lmstudio',
      label: 'LM Studio',
      protocol: AuthType.USE_OPENAI,
      baseUrl: 'http://127.0.0.1:1234/v1',
      uiGroup: 'local',
      localProbe: { kind: 'lmstudio' },
      supportsModelDiscovery: true,
    });
  });

  it('lets another local server take any URL', () => {
    expect(localOpenAiProvider).toMatchObject({
      id: 'local-openai',
      label: 'Other local server',
      protocol: AuthType.USE_OPENAI,
      baseUrl: undefined,
      uiGroup: 'local',
      supportsModelDiscovery: true,
    });
    expect(shouldShowStep(localOpenAiProvider, 'baseUrl')).toBe(true);
  });

  it.each([ollamaProvider, lmstudioProvider, localOpenAiProvider])(
    'skips the key step for $id',
    (provider) => {
      expect(shouldShowStep(provider, 'apiKey')).toBe(false);
      expect(shouldShowStep(provider, 'models')).toBe(true);
    },
  );

  it.each([
    [ollamaProvider, 'http://127.0.0.1:11434/v1'],
    [lmstudioProvider, 'http://127.0.0.1:1234/v1'],
    [localOpenAiProvider, 'http://127.0.0.1:8080/v1'],
  ])('installs $id with the placeholder key', (provider, baseUrl) => {
    const plan = buildInstallPlan(provider, {
      baseUrl,
      apiKey: '',
      modelIds: ['llama3.2:3b'],
    });

    expect(LOCAL_API_KEY_PLACEHOLDER).toBe('local');
    expect(plan.credential).toEqual({ id: provider.id, apiKey: 'local' });
    expect(plan.modelProviders?.[0]?.models[0]).toMatchObject({
      id: 'llama3.2:3b',
      baseUrl,
      credential: provider.id,
    });
  });

  it('keeps two other local servers side by side', () => {
    const first = buildInstallPlan(localOpenAiProvider, {
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKey: '',
      modelIds: ['a'],
    });
    expect(first.modelProviders?.[0]?.ownsModel).toBeUndefined();
  });
});
