/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import type { ProviderConfig } from '../types.js';

export const geminiProvider: ProviderConfig = {
  id: 'gemini',
  label: 'Google Gemini',
  description: 'Gemini · key from aistudio.google.com',
  protocol: AuthType.USE_GEMINI,
  baseUrl: 'https://generativelanguage.googleapis.com',
  envKey: 'GEMINI_API_KEY',
  // Listed through GET /v1beta/models (see model-discovery.ts).
  supportsModelDiscovery: true,
  modelNamePrefix: 'Gemini',
  documentationUrl: 'https://ai.google.dev/gemini-api/docs',
  uiGroup: 'apiKey',
};
