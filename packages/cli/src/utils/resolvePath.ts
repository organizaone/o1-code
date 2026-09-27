/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expandHomeDir } from '@organizaone/o1-code-core';

export function resolvePath(p: string): string {
  return expandHomeDir(p);
}
