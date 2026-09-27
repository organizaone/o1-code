/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AuthType } from '../../../core/contentGenerator.js';
import { openaiProvider } from '../../presets/openai.js';
import { buildInstallPlan, shouldShowStep } from '../../provider-config.js';

describe('openaiProvider', () => {
  it('connects to OpenAI with a key', () => {
    expect(openaiProvider).toMatchObject({
      id: 'openai',
      label: 'OpenAI',
      protocol: AuthType.USE_OPENAI,
      baseUrl: 'https://api.openai.com/v1',
      envKey: 'OPENAI_API_KEY',
      supportsModelDiscovery: true,
      uiGroup: 'apiKey',
    });
  });

  it('offers the wire API choice but no protocol choice', () => {
    expect(shouldShowStep(openaiProvider, 'protocol')).toBe(false);
    expect(shouldShowStep(openaiProvider, 'wireApi')).toBe(true);
    expect(shouldShowStep(openaiProvider, 'baseUrl')).toBe(false);
    expect(shouldShowStep(openaiProvider, 'apiKey')).toBe(true);
  });

  it.each([
    ['chat-completions', AuthType.USE_OPENAI],
    ['responses', AuthType.USE_OPENAI_RESPONSES],
  ] as const)(
    'installs the %s wire under the openai provider',
    (wireApi, authType) => {
      const plan = buildInstallPlan(openaiProvider, {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
        modelIds: ['gpt-5'],
        wireApi,
      });

      expect(plan.authType).toBe(authType);
      expect(plan.credential).toEqual({ id: 'openai', apiKey: 'sk-openai' });
      expect(plan.modelProviders?.[0]).toMatchObject({
        authType: AuthType.USE_OPENAI,
        models: [
          {
            id: 'gpt-5',
            wireApi,
            envKey: 'OPENAI_API_KEY',
            credential: 'openai',
          },
        ],
      });
    },
  );
});
