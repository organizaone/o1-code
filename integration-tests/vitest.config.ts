/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const timeoutMinutes = Number(process.env['TB_TIMEOUT_MINUTES'] || '5');
const testTimeoutMs = timeoutMinutes * 60 * 1000;
const isSelfHostedRunner = process.env['RUNNER_ENVIRONMENT'] === 'self-hosted';

export default defineConfig({
  test: {
    testTimeout: testTimeoutMs,
    globalSetup: './globalSetup.ts',
    reporters: ['default'],
    include: ['**/*.test.ts'],
    exclude: [
      '**/terminal-bench/*.test.ts',
      '**/hook-integration/**',
      '**/o1-code-daemon-loadtest*',
      '**/o1-code-daemon-first-output-benchmark*',
      '**/node_modules/**',
    ],
    retry: 2,
    fileParallelism: true,
    pool: 'forks',
    // Each ECS host runs several Actions runners. Keep every E2E shard to
    // one child process there so concurrent jobs cannot multiply the host
    // load and starve latency-sensitive integration paths.
    maxWorkers: isSelfHostedRunner ? 1 : 4,
    // Preserve the exemption for historical worker RPC timeouts under
    // resource pressure on non-Linux and shared self-hosted runners.
    // Test failures still fail the run; GitHub-hosted and local Linux
    // runs keep unhandled errors fatal.
    dangerouslyIgnoreUnhandledErrors:
      process.platform !== 'linux' || isSelfHostedRunner,
  },
  resolve: {
    alias: {
      // Use built SDK bundle for e2e tests
      '@organizaone/o1-code-sdk/daemon/transports': resolve(
        __dirname,
        '../packages/sdk-typescript/dist/daemon/transports.js',
      ),
      '@organizaone/o1-code-sdk/daemon/transcript': resolve(
        __dirname,
        '../packages/sdk-typescript/dist/daemon/transcript.js',
      ),
      '@organizaone/o1-code-sdk/daemon': resolve(
        __dirname,
        '../packages/sdk-typescript/dist/daemon/index.js',
      ),
      '@organizaone/o1-code-sdk': resolve(
        __dirname,
        '../packages/sdk-typescript/dist/index.mjs',
      ),
    },
  },
});
