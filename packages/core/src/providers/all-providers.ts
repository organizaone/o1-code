/**
 * @license
 * Copyright 2026 Qwen Team
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Provider registry — imports all provider definitions and assembles the
 * lookup tables used by the UI and CLI commands.
 */

import { providerMatchesCredentials } from './provider-config.js';
import type { ProviderConfig, ProviderFamily, UiGroup } from './types.js';
import { codingPlanProvider } from './presets/alibaba-coding-plan.js';
import { tokenPlanProvider } from './presets/alibaba-token-plan.js';
import { alibabaStandardProvider } from './presets/alibaba-standard.js';
import { anthropicProvider } from './presets/anthropic.js';
import { deepseekProvider } from './presets/deepseek.js';
import { geminiProvider } from './presets/gemini.js';
import { grokProvider } from './presets/grok.js';
import { minimaxProvider } from './presets/minimax.js';
import { zaiProvider } from './presets/zai.js';
import { moonshotProvider } from './presets/moonshot.js';
import { modelscopeProvider } from './presets/modelscope.js';
import { openaiProvider } from './presets/openai.js';
import {
  organizaoneO1gwProvider,
  organizaoneLoginProvider,
  organizaoneProvider,
} from './presets/organizaone.js';
import { ollamaProvider } from './presets/ollama.js';
import { lmstudioProvider } from './presets/lmstudio.js';
import { localOpenAiProvider } from './presets/local-openai.js';
import { customProvider } from './presets/custom-provider.js';

// Re-export all providers
export {
  codingPlanProvider,
  tokenPlanProvider,
  alibabaStandardProvider,
  anthropicProvider,
  deepseekProvider,
  geminiProvider,
  grokProvider,
  minimaxProvider,
  zaiProvider,
  moonshotProvider,
  modelscopeProvider,
  openaiProvider,
  organizaoneProvider,
  organizaoneLoginProvider,
  organizaoneO1gwProvider,
  ollamaProvider,
  lmstudioProvider,
  localOpenAiProvider,
  customProvider,
};
export {
  CUSTOM_API_KEY_ENV_PREFIX,
  generateCustomCredentialId,
  generateCustomEnvKey,
} from './presets/custom-provider.js';

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

/** Key providers, the ModelStudio plans first, then the rest by label. */
const API_KEY_PROVIDERS: readonly ProviderConfig[] = [
  codingPlanProvider,
  tokenPlanProvider,
  alibabaStandardProvider,
  ...[
    anthropicProvider,
    deepseekProvider,
    geminiProvider,
    moonshotProvider,
    minimaxProvider,
    modelscopeProvider,
    openaiProvider,
    grokProvider,
    zaiProvider,
  ].sort((a, b) =>
    a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
  ),
];

const LOCAL_PROVIDERS: readonly ProviderConfig[] = [
  ollamaProvider,
  lmstudioProvider,
  localOpenAiProvider,
];

/** All installable providers, in display order. */
export const ALL_PROVIDERS: readonly ProviderConfig[] = [
  organizaoneProvider,
  ...API_KEY_PROVIDERS,
  ...LOCAL_PROVIDERS,
  customProvider,
];

/**
 * The providers of each menu group, in display order. The OrganizaOne group
 * also lists the sign-in entries that are not installable yet (`comingSoon`).
 */
export const PROVIDERS_BY_GROUP: Readonly<
  Record<UiGroup, readonly ProviderConfig[]>
> = {
  organizaone: [
    organizaoneProvider,
    organizaoneLoginProvider,
    organizaoneO1gwProvider,
  ],
  apiKey: API_KEY_PROVIDERS,
  local: LOCAL_PROVIDERS,
  custom: [customProvider],
};

/** A row of a menu group: one provider, or a family chosen on a second list. */
export type MenuRow =
  | { kind: 'provider'; provider: ProviderConfig }
  | {
      kind: 'family';
      family: ProviderFamily;
      providers: readonly ProviderConfig[];
    };

/** The rows of a menu group, each family folded into the row of its first member. */
export function getMenuRows(group: UiGroup): MenuRow[] {
  const rows: MenuRow[] = [];
  for (const provider of PROVIDERS_BY_GROUP[group]) {
    const family = provider.family;
    if (!family) {
      rows.push({ kind: 'provider', provider });
      continue;
    }
    if (
      rows.some((row) => row.kind === 'family' && row.family.id === family.id)
    )
      continue;
    rows.push({
      kind: 'family',
      family,
      providers: PROVIDERS_BY_GROUP[group].filter(
        (member) => member.family?.id === family.id,
      ),
    });
  }
  return rows;
}

export function findProviderById(id: string): ProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

/** Find a provider by model credentials (baseUrl + envKey). */
export function findProviderByCredentials(
  baseUrl: string | undefined,
  envKey: string | undefined,
): ProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) =>
    providerMatchesCredentials(p, baseUrl, envKey),
  );
}

/**
 * All known remote provider base URLs (for preconnect, validation, etc.).
 * Servers on this machine are left out: there is nothing to warm up.
 */
export function getAllProviderBaseUrls(): string[] {
  return ALL_PROVIDERS.filter((p) => p.uiGroup !== 'local').flatMap((p) => {
    const byProtocol = Object.values(p.baseUrlByProtocol ?? {});
    if (typeof p.baseUrl === 'string') return [p.baseUrl, ...byProtocol];
    if (Array.isArray(p.baseUrl))
      return [...p.baseUrl.map((o: { url: string }) => o.url), ...byProtocol];
    return byProtocol;
  });
}
