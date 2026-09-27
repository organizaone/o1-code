/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import { OLLAMA_BASE_URL } from '../local-servers.js';
import type { ProviderConfig } from '../types.js';

export const ollamaProvider: ProviderConfig = {
  id: 'ollama',
  label: 'Ollama',
  description: 'Models from Ollama on this machine',
  protocol: AuthType.USE_OPENAI,
  baseUrl: OLLAMA_BASE_URL,
  envKey: 'OLLAMA_API_KEY',
  supportsModelDiscovery: true,
  modelNamePrefix: 'Ollama',
  documentationUrl: 'https://docs.ollama.com/api/openai-compatibility',
  localProbe: { kind: 'ollama' },
  uiGroup: 'local',
};
