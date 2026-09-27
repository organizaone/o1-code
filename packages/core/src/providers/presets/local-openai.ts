/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import type { ProviderConfig } from '../types.js';

/**
 * The key a local server is installed with. Local servers take no key, but
 * OpenAI clients refuse an empty bearer token.
 */
export const LOCAL_API_KEY_PLACEHOLDER = 'local';

export const localOpenAiProvider: ProviderConfig = {
  id: 'local-openai',
  label: 'Other local server',
  description: 'Any OpenAI-compatible server on this machine',
  protocol: AuthType.USE_OPENAI,
  baseUrl: undefined,
  envKey: 'LOCAL_OPENAI_API_KEY',
  supportsModelDiscovery: true,
  modelNamePrefix: 'Local',
  // Several local servers can sit side by side: installs replace only the
  // models they name at their own URL.
  mergeModelsByIdentity: true,
  uiGroup: 'local',
};
