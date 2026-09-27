/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AuthType } from '../../../core/contentGenerator.js';
import { geminiProvider } from '../../presets/gemini.js';
import { buildInstallPlan, shouldShowStep } from '../../provider-config.js';

describe('geminiProvider', () => {
  it('connects to Google Gemini with a key', () => {
    expect(geminiProvider).toMatchObject({
      id: 'gemini',
      label: 'Google Gemini',
      protocol: AuthType.USE_GEMINI,
      baseUrl: 'https://generativelanguage.googleapis.com',
      envKey: 'GEMINI_API_KEY',
      supportsModelDiscovery: true,
      uiGroup: 'apiKey',
    });
  });

  it('asks for the key and the models', () => {
    expect(shouldShowStep(geminiProvider, 'protocol')).toBe(false);
    expect(shouldShowStep(geminiProvider, 'wireApi')).toBe(false);
    expect(shouldShowStep(geminiProvider, 'apiKey')).toBe(true);
    expect(shouldShowStep(geminiProvider, 'models')).toBe(true);
  });

  it('installs the chosen models under the gemini protocol', () => {
    const plan = buildInstallPlan(geminiProvider, {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'gm-key',
      modelIds: ['gemini-2.5-pro'],
    });

    expect(plan.authType).toBe(AuthType.USE_GEMINI);
    expect(plan.credential).toEqual({ id: 'gemini', apiKey: 'gm-key' });
    expect(plan.modelProviders?.[0]?.models[0]).toMatchObject({
      id: 'gemini-2.5-pro',
      envKey: 'GEMINI_API_KEY',
      credential: 'gemini',
    });
  });
});
