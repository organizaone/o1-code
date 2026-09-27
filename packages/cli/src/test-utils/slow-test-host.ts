/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';

/**
 * A host is slow when its load average has reached its parallelism: the
 * raised slow-host budgets then apply on an overloaded machine.
 */
export function isSlowTestHost(): boolean {
  return os.loadavg()[0] >= os.availableParallelism();
}
