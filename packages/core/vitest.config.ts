/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests assert UTC dates; the workers inherit this environment, so a machine
// in another time zone runs the same suite as CI does. test-setup.ts pins
// the number and date locale.
process.env['TZ'] = 'UTC';

export default defineConfig({
  test: {
    // Raise the per-test ceiling above vitest's 5s default: I/O- or
    // WASM-load-bound tests (e.g. the web-tree-sitter lazy runtime, tar
    // extraction) blow 5s purely under contention, not from any logic fault.
    // Assertions still fail instantly; only the timeout ceiling grows.
    testTimeout: 15_000,
    reporters: ['default', 'junit'],
    silent: true,
    // Fail fast with an actionable message when the workspace dist/ output
    // core tests import through the package entry is missing (fresh clone,
    // new worktree, deep clean). See scripts/vitest-global-setup.js.
    // Resolved against this config file (not vitest's root/cwd) so the guard
    // also loads when vitest is launched from elsewhere with --config.
    globalSetup: path.resolve(
      __dirname,
      '../../scripts/vitest-global-setup.js',
    ),
    setupFiles: ['./test-setup.ts'],
    outputFile: {
      junit: 'junit.xml',
    },
    // RPC-timeout exemption; see scripts/tests/unit-vitest-configs.test.ts.
    dangerouslyIgnoreUnhandledErrors: process.platform !== 'linux',
    coverage: {
      // CI collects coverage only where something keeps it: the post-merge
      // run on main, which ci.yml marks with O1CODE_CI_COVERAGE=1 and whose
      // reports it uploads. Pull-request runs skip it — nothing read those
      // reports, and v8 instrumentation plus the per-file merge on the main
      // thread cost about a fifth of the suite's wall time. Local runs keep
      // coverage.
      enabled: !process.env.CI || process.env['O1CODE_CI_COVERAGE'] === '1',
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*'],
      reporter: [
        ['text', { file: 'full-text-summary.txt' }],
        'html',
        'json',
        'lcov',
        'cobertura',
        ['json-summary', { outputFile: 'coverage-summary.json' }],
      ],
    },
  },
});
