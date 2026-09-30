/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BRAND } from '../generated/brand.js';

/** `O1Code/<version> (<platform>; <arch>)`: the app's truthful User-Agent. */
export function o1CodeUserAgent(version: string | undefined): string {
  return `${BRAND.userAgent}/${version || 'unknown'} (${process.platform}; ${process.arch})`;
}
