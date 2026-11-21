/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { ProviderFamily } from '../types.js';

/** The ModelStudio plans share one row of the API key list: Alibaba Cloud. */
export const MODELSTUDIO_FAMILY: ProviderFamily = {
  id: 'alibaba',
  label: 'Alibaba Cloud',
  description: 'Coding Plan, Token Plan, or Standard API Key',
};
