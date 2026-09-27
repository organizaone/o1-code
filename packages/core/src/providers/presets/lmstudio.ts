/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../../core/contentGenerator.js';
import { LMSTUDIO_BASE_URL } from '../local-servers.js';
import type { ProviderConfig } from '../types.js';

export const lmstudioProvider: ProviderConfig = {
  id: 'lmstudio',
  label: 'LM Studio',
  description: 'Models from LM Studio on this machine',
  protocol: AuthType.USE_OPENAI,
  baseUrl: LMSTUDIO_BASE_URL,
  envKey: 'LMSTUDIO_API_KEY',
  supportsModelDiscovery: true,
  modelNamePrefix: 'LM Studio',
  documentationUrl: 'https://lmstudio.ai/docs/developer',
  localProbe: { kind: 'lmstudio' },
  uiGroup: 'local',
};
