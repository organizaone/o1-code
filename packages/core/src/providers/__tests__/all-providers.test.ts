/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_PROVIDERS,
  findProviderById,
  getMenuRows,
  PROVIDERS_BY_GROUP,
} from '../all-providers.js';
import { MODELSTUDIO_FAMILY } from '../presets/modelstudio-family.js';
import {
  credentialIdForProvider,
  isValidCredentialId,
} from '../credential-store.js';

describe('provider registry', () => {
  it('lists OrganizaOne, the key providers, the local servers, then Custom', () => {
    expect(ALL_PROVIDERS.map((provider) => provider.id)).toEqual([
      'organizaone',
      'organizaone-login',
      'coding-plan',
      'token-plan',
      'alibabaStandard',
      'anthropic',
      'deepseek',
      'gemini',
      'moonshot',
      'minimax',
      'modelscope',
      'openai',
      'grok',
      'zai',
      'ollama',
      'lmstudio',
      'local-openai',
      'custom-openai-compatible',
    ]);
  });

  it('sorts the key providers after the ModelStudio plans by label', () => {
    const labels = PROVIDERS_BY_GROUP.apiKey
      .slice(3)
      .map((provider) => provider.label);
    expect(labels).toEqual([
      'Anthropic',
      'DeepSeek',
      'Google Gemini',
      'Kimi (Moonshot)',
      'MiniMax',
      'ModelScope',
      'OpenAI',
      'xAI',
      'Z.AI',
    ]);
  });

  it('groups every provider for the dialogs', () => {
    expect(PROVIDERS_BY_GROUP.organizaone.map((p) => p.id)).toEqual([
      'organizaone',
      'organizaone-login',
      'organizaone-o1gw',
    ]);
    expect(PROVIDERS_BY_GROUP.local.map((p) => p.id)).toEqual([
      'ollama',
      'lmstudio',
      'local-openai',
    ]);
    expect(PROVIDERS_BY_GROUP.custom.map((p) => p.id)).toEqual([
      'custom-openai-compatible',
    ]);
    const grouped = Object.values(PROVIDERS_BY_GROUP)
      .flat()
      .filter((provider) => !provider.comingSoon);
    expect(new Set(grouped)).toEqual(new Set(ALL_PROVIDERS));
  });

  it('lists the ModelStudio plans as one Alibaba Cloud row of the key list', () => {
    const rows = getMenuRows('apiKey');
    expect(
      rows.map((row) =>
        row.kind === 'family' ? row.family.label : row.provider.label,
      ),
    ).toEqual([
      'Alibaba Cloud',
      'Anthropic',
      'DeepSeek',
      'Google Gemini',
      'Kimi (Moonshot)',
      'MiniMax',
      'ModelScope',
      'OpenAI',
      'xAI',
      'Z.AI',
    ]);
    const modelStudio = rows[0];
    expect(modelStudio?.kind).toBe('family');
    if (modelStudio?.kind !== 'family') return;
    expect(modelStudio.family).toEqual(MODELSTUDIO_FAMILY);
    expect(modelStudio.providers.map((provider) => provider.id)).toEqual([
      'coding-plan',
      'token-plan',
      'alibabaStandard',
    ]);
  });

  it('says where each key comes from in the API key list', () => {
    const description = (id: string) => findProviderById(id)?.description;
    expect(description('deepseek')).toBe('key from platform.deepseek.com');
    expect(description('moonshot')).toBe('key from platform.moonshot.ai');
    expect(description('minimax')).toBe('key from platform.minimax.io');
    expect(description('modelscope')).toBe('key from modelscope.cn');
    expect(description('zai')).toBe('key from z.ai');
  });

  it('keeps one row per provider in the other groups', () => {
    expect(
      getMenuRows('organizaone').map((row) =>
        row.kind === 'provider' ? row.provider.id : row.family.id,
      ),
    ).toEqual(['organizaone', 'organizaone-login', 'organizaone-o1gw']);
    expect(getMenuRows('local').every((row) => row.kind === 'provider')).toBe(
      true,
    );
  });

  it('keeps the coming-soon entries out of the installable list', () => {
    expect(ALL_PROVIDERS.some((provider) => provider.comingSoon)).toBe(false);
    expect(findProviderById('organizaone-login')?.id).toBe('organizaone-login');
    expect(findProviderById('organizaone-o1gw')).toBeUndefined();
  });

  it('no longer offers OpenRouter or Requesty presets', () => {
    expect(findProviderById('openrouter')).toBeUndefined();
    expect(findProviderById('requesty')).toBeUndefined();
  });

  it('gives each installable provider a valid credential id', () => {
    for (const provider of ALL_PROVIDERS) {
      expect(isValidCredentialId(credentialIdForProvider(provider.id))).toBe(
        true,
      );
    }
  });
});
