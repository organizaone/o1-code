/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

const CORE_SRC = path.resolve(__dirname, '../core/src');

// Tests assert UTC dates; the workers inherit this environment, so a machine
// in another time zone runs the same suite as CI does. test-setup.ts pins
// the number and date locale.
process.env['TZ'] = 'UTC';

// Vite takes `alias` as an object or as an ordered array of {find,
// replacement}; only the array form accepts a RegExp, and core needs one.
// Order is precedence — the first entry whose `find` matches wins.
const toAliases = (map: Record<string, string>) =>
  Object.entries(map).map(([find, replacement]) => ({ find, replacement }));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@organizaone\/o1-code-core\/omni$/,
        replacement: path.resolve(__dirname, '../core/src/omni/index.ts'),
      },
      // Named core subpaths. None of these targets can be derived from the
      // specifier (noFollowOpen lives at utils/no-follow-open.ts), so they
      // have to be matched ahead of the wildcard below. A new named subpath
      // added to packages/cli/tsconfig.json must be added here too, above
      // the wildcard, or the wildcard will claim it and point at a file
      // that does not exist.
      ...toAliases({
        '@organizaone/o1-code-core/shellResult': path.resolve(
          __dirname,
          '../core/src/utils/shell-result.ts',
        ),
        '@organizaone/o1-code-core/omniPolicyCollection': path.resolve(
          __dirname,
          '../core/src/omni/policy/model-call-collection.ts',
        ),
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
        '@organizaone/o1-code-core/memoryScopes': path.resolve(
          __dirname,
          '../core/src/memory/scopes.ts',
        ),
        '@organizaone/o1-code-core/toolWriteOrigin': path.resolve(
          __dirname,
          '../core/src/services/tool-write-origin.ts',
        ),
        '@organizaone/o1-code-core/envVarResolver': path.resolve(
          __dirname,
          '../core/src/utils/envVarResolver.ts',
        ),
        '@organizaone/o1-code-core/storage': path.resolve(
          __dirname,
          '../core/src/config/storage.ts',
        ),
        '@organizaone/o1-code-core/atomicFileWrite': path.resolve(
          __dirname,
          '../core/src/utils/atomicFileWrite.ts',
        ),
        '@organizaone/o1-code-core/debugLogger': path.resolve(
          __dirname,
          '../core/src/utils/debugLogger.ts',
        ),
        '@organizaone/o1-code-core/conversationsRuntimeMarker': path.resolve(
          __dirname,
          '../core/src/utils/conversations-runtime-marker.ts',
        ),
        '@organizaone/o1-code-core/subagentRuntime': path.resolve(
          __dirname,
          '../core/src/subagent-runtime.ts',
        ),
      }),
      // Mirrors `"@organizaone/o1-code-core/*": ["../core/src/*"]` from
      // packages/cli/tsconfig.json. esbuild reads that paths block when it
      // bundles; Vitest does not read tsconfig paths at all, so this file is
      // the only place the mapping exists for a test run and the two have to
      // be kept in sync by hand. Importing one core module rather than the
      // package root depends on this entry.
      {
        find: /^@organizaone\/o1-code-core\/(.*)$/,
        replacement: `${CORE_SRC}/$1`,
      },
      // The package root is matched exactly. Spelled as a string it would
      // also match everything beneath it and rewrite each subpath into a
      // path under index.ts.
      {
        find: /^@organizaone\/o1-code-core$/,
        replacement: path.resolve(__dirname, '../core/index.ts'),
      },
      ...toAliases({
        // cli's daemon-status-provider.test.ts imports `FakeAgent` /
        // `makeChannel` from acp-bridge's package-private
        // `internal/testUtils` module. This alias overrides the runtime
        // resolution so vitest reads the .ts source directly instead of
        // the build-then-stale `dist/` copy.
        '@organizaone/o1-code-acp-bridge/internal/testUtils': path.resolve(
          __dirname,
          '../acp-bridge/src/internal/testUtils.ts',
        ),
        // Same rationale as above: bridgeErrors and status subpaths
        // resolve to dist/ via package.json exports, but tests in the
        // monorepo worktree need the live source (dist may be stale or
        // absent during development).
        '@organizaone/o1-code-acp-bridge/bridgeErrors': path.resolve(
          __dirname,
          '../acp-bridge/src/bridgeErrors.ts',
        ),
        '@organizaone/o1-code-acp-bridge/status': path.resolve(
          __dirname,
          '../acp-bridge/src/status.ts',
        ),
        '@organizaone/o1-code-acp-bridge/bridge': path.resolve(
          __dirname,
          '../acp-bridge/src/bridge.ts',
        ),
        '@organizaone/o1-code-acp-bridge/spawnChannel': path.resolve(
          __dirname,
          '../acp-bridge/src/spawnChannel.ts',
        ),
        '@organizaone/o1-code-acp-bridge/processRegistry': path.resolve(
          __dirname,
          '../acp-bridge/src/process-registry.ts',
        ),
        '@organizaone/o1-code-acp-bridge/daemonMemoryBudget': path.resolve(
          __dirname,
          '../acp-bridge/src/daemon-memory-budget.ts',
        ),
        '@organizaone/o1-code-acp-bridge/ndJsonStream': path.resolve(
          __dirname,
          '../acp-bridge/src/ndJsonStream.ts',
        ),
        '@organizaone/o1-code-acp-bridge/logRedaction': path.resolve(
          __dirname,
          '../acp-bridge/src/logRedaction.ts',
        ),
        '@organizaone/o1-code-acp-bridge/bridgeClient': path.resolve(
          __dirname,
          '../acp-bridge/src/bridgeClient.ts',
        ),
        '@organizaone/o1-code-acp-bridge/bridgeOptions': path.resolve(
          __dirname,
          '../acp-bridge/src/bridgeOptions.ts',
        ),
        '@organizaone/o1-code-acp-bridge/promptLedger': path.resolve(
          __dirname,
          '../acp-bridge/src/prompt-ledger.ts',
        ),
        '@organizaone/o1-code-acp-bridge/bridgeTypes': path.resolve(
          __dirname,
          '../acp-bridge/src/bridgeTypes.ts',
        ),
        '@organizaone/o1-code-acp-bridge/bridgeFileSystem': path.resolve(
          __dirname,
          '../acp-bridge/src/bridgeFileSystem.ts',
        ),
        '@organizaone/o1-code-acp-bridge/sessionArtifacts': path.resolve(
          __dirname,
          '../acp-bridge/src/sessionArtifacts.ts',
        ),
        '@organizaone/o1-code-acp-bridge/eventBus': path.resolve(
          __dirname,
          '../acp-bridge/src/eventBus.ts',
        ),
        '@organizaone/o1-code-acp-bridge/replayWindowLimits': path.resolve(
          __dirname,
          '../acp-bridge/src/replayWindowLimits.ts',
        ),
        '@organizaone/o1-code-acp-bridge/transcriptReplay': path.resolve(
          __dirname,
          '../acp-bridge/src/transcript-replay.ts',
        ),
        '@organizaone/o1-code-acp-bridge/workspacePaths': path.resolve(
          __dirname,
          '../acp-bridge/src/workspacePaths.ts',
        ),
        '@organizaone/o1-code-acp-bridge/externalToolGuard': path.resolve(
          __dirname,
          '../acp-bridge/src/externalToolGuard.ts',
        ),
        '@organizaone/o1-code-audio-capture': path.resolve(
          __dirname,
          '../audio-capture/src/index.ts',
        ),
        '@organizaone/o1-code-sdk/daemon/transcript': path.resolve(
          __dirname,
          '../sdk-typescript/src/daemon/transcript.ts',
        ),
        '@organizaone/o1-code-sdk/daemon/ui/transcript': path.resolve(
          __dirname,
          '../sdk-typescript/src/daemon/ui/transcript.ts',
        ),
        '@organizaone/o1-code-sdk/daemon/types': path.resolve(
          __dirname,
          '../sdk-typescript/src/daemon/types.ts',
        ),
        '@organizaone/o1-code-sdk/daemon': path.resolve(
          __dirname,
          '../sdk-typescript/src/daemon/index.ts',
        ),
      }),
    ],
  },
  test: {
    // See packages/core/vitest.config.ts: raise the per-test ceiling above
    // vitest's 5s default so I/O-bound tests (e.g. the workspace registration
    // store's tempdir round-trip) don't blow it purely under CI contention.
    testTimeout: 15_000,
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', 'config.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**'],
    // Terminal app: run under node. Only files that need a document (the
    // @testing-library/react renderHook suites and a few DOM-touching UI
    // tests) opt into jsdom with a `// @vitest-environment jsdom` control
    // comment; vitest reads it from the file itself. Creating a jsdom per
    // file cost 0.2–0.5s each, a tenth of the suite, while nine files in
    // ten never touched the DOM.
    environment: 'node',
    globals: true,
    reporters: ['default', 'junit'],
    silent: true,
    outputFile: {
      junit: 'junit.xml',
    },
    setupFiles: ['./test-setup.ts'],
    // Fail fast with an actionable message when workspace dist/ output or
    // generated files are missing (fresh clone, new worktree, deep clean).
    // See scripts/vitest-global-setup.js.
    // Resolved against this config file (not vitest's root/cwd) so the guard
    // also loads when vitest is launched from elsewhere with --config.
    globalSetup: path.resolve(
      __dirname,
      '../../scripts/vitest-global-setup.js',
    ),
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
    server: {
      deps: {
        inline: [/@organizaone\/o1-code-core/],
      },
    },
  },
});
