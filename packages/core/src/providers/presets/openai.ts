/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import type { ProviderConfig } from '../types.js';

export const openaiProvider: ProviderConfig = {
  id: 'openai',
  label: 'OpenAI',
  description: 'GPT · key from platform.openai.com',
  protocol: AuthType.USE_OPENAI,
  // A single protocol option shows the wire API step (Chat Completions or
  // Responses) without a protocol step, as the custom provider offers it.
  protocolOptions: [AuthType.USE_OPENAI],
  // Serves both wires: the Responses generator strips /v1 and adds it back.
  baseUrl: 'https://api.openai.com/v1',
  envKey: 'OPENAI_API_KEY',
  supportsModelDiscovery: true,
  modelNamePrefix: 'OpenAI',
  documentationUrl: 'https://platform.openai.com/docs/overview',
  uiGroup: 'apiKey',
};
