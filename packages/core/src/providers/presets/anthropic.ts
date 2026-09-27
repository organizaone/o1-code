/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import type { ProviderConfig } from '../types.js';

export const anthropicProvider: ProviderConfig = {
  id: 'anthropic',
  label: 'Anthropic',
  description: 'Claude · key from console.anthropic.com',
  protocol: AuthType.USE_ANTHROPIC,
  baseUrl: 'https://api.anthropic.com/v1',
  envKey: 'ANTHROPIC_API_KEY',
  // The account's models come from /v1/models; there is no built-in list.
  supportsModelDiscovery: true,
  modelNamePrefix: 'Anthropic',
  documentationUrl: 'https://docs.anthropic.com/en/api/getting-started',
  uiGroup: 'apiKey',
};
