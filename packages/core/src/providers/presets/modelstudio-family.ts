/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProviderFamily } from '../types.js';

/** The ModelStudio plans share one row of the API key list: Alibaba Cloud. */
export const MODELSTUDIO_FAMILY: ProviderFamily = {
  id: 'alibaba',
  label: 'Alibaba Cloud',
  description: 'Coding Plan, Token Plan, or Standard API Key',
};
