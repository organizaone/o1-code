/**
 * @license
 * Copyright 2025 Google LLC
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/tests/**/*.test.{js,ts}'],
    setupFiles: ['scripts/tests/test-setup.ts'],
    // Several suites spawn the real `corepack pnpm`; on a cold per-run cache
    // every worker would download the pinned pnpm concurrently, and a losing
    // install poisons the shared cache for the rest of the run.
    // Warm it once here, before any worker forks.
    globalSetup: ['scripts/tests/corepack-warmup.js'],
    // Several suites shell out to `node` (acp-serve-boundary-guard.test.js
    // among them) and pass 30s under contention on a shared host although
    // none of them is slow. Per-test `vi.setConfig` does not help: these
    // cases register their timeout at collection, before it runs.
    // `||`, not `??`: `??` only catches `undefined`, and the value this repo
    // actually plants is `''` — that is what `${{ cond && 'x' || '' }}` renders
    // when the condition is false. `Number('')` is 0, and vitest reads 0 as
    // "no timeout at all", so the empty spelling would silently disarm every
    // ceiling in this suite. `NaN` from a typo falls back the same way.
    testTimeout:
      Number(process.env['O1CODE_SCRIPTS_TEST_TIMEOUT_MS']) || 90_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    // No poolOptions override: the fixed 8-16 worker floor it used to carry
    // oversubscribes the 3-core macOS runners. Vitest's default scales with
    // the host cores, which is what every other suite in this repository
    // uses.
    //
    // RPC-timeout exemption; see scripts/tests/unit-vitest-configs.test.ts.
    dangerouslyIgnoreUnhandledErrors: process.platform !== 'linux',
  },
});
