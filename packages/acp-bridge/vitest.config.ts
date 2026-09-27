/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@organizaone/o1-code-core/noFollowOpen': path.resolve(
        __dirname,
        '../core/src/utils/no-follow-open.ts',
      ),
      '@organizaone/o1-code-core/subSessionConstants': path.resolve(
        __dirname,
        '../core/src/tools/sub-session-constants.ts',
      ),
      '@organizaone/o1-code-core/goalWire': path.resolve(
        __dirname,
        '../core/src/goals/goal-wire.ts',
      ),
      '@organizaone/o1-code-core/transcriptRecords': path.resolve(
        __dirname,
        '../core/src/utils/transcript-records.ts',
      ),
      '@organizaone/o1-code-core/telemetryConstants': path.resolve(
        __dirname,
        '../core/src/telemetry/constants.ts',
      ),
      '@organizaone/o1-code-core/userPromptSubmitContext': path.resolve(
        __dirname,
        '../core/src/hooks/user-prompt-submit-context.ts',
      ),
    },
  },
  test: {
    reporters: ['default'],
    silent: true,
    // RPC-timeout exemption; see scripts/tests/unit-vitest-configs.test.ts.
    dangerouslyIgnoreUnhandledErrors: process.platform !== 'linux',
    coverage: {
      enabled: false,
      provider: 'v8',
      include: ['src/**/*'],
    },
  },
});
