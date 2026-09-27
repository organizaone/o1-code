/**
 * @license
 * Copyright 2026 Qwen Team
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

// Provider registry. GitHub (github.com or an Enterprise host routed by
// `--host`) is the only review platform; the reader boundary stays so the
// subcommands keep one seam for the host's API shape.

import { githubReader } from './github.js';
import type { ReviewPlatformReader } from './types.js';

export function getPlatformReader(): ReviewPlatformReader {
  return githubReader;
}
