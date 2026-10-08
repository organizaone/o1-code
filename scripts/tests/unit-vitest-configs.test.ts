/**
 * @license
 * Copyright 2026 Qwen Team
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import externalContextConfig from '../../integrations/external-context/vitest.config.js';
import externalContextMem0Config from '../../integrations/external-context-mem0/vitest.config.js';
import acpBridgeConfig from '../../packages/acp-bridge/vitest.config.js';
import audioCaptureConfig from '../../packages/audio-capture/vitest.config.js';
import cliConfig from '../../packages/cli/vitest.config.js';
import coreConfig from '../../packages/core/vitest.config.js';
import nodeReplConfig from '../../packages/node-repl/vitest.config.js';
import sdkTypescriptConfig from '../../packages/sdk-typescript/vitest.config.js';
import vscodeCompanionConfig from '../../packages/vscode-ide-companion/vitest.config.js';
import webShellConfig from '../../packages/web-shell/vitest.config.js';
import scriptsTestsConfig from './vitest.config.js';

// Every vitest project that `npm run test:ci` runs on the Windows/macOS
// platform lanes carries the off-Linux unhandled-error exemption for historical
// worker RPC timeouts under runner resource pressure. This
// witness pins the flag in every guarded config so removing it from any
// one of them fails the scripts suite on every platform.
type ExemptionConfig = {
  test?: {
    dangerouslyIgnoreUnhandledErrors?: boolean;
    testTimeout?: number;
    pool?: 'threads' | 'forks' | 'vmThreads';
    maxWorkers?: number;
  };
};

const configs: Record<string, ExemptionConfig> = {
  'integrations/external-context': externalContextConfig,
  'integrations/external-context-mem0': externalContextMem0Config,
  'packages/acp-bridge': acpBridgeConfig,
  'packages/audio-capture': audioCaptureConfig,
  'packages/cli': cliConfig,
  'packages/core': coreConfig,
  'packages/node-repl': nodeReplConfig,
  'packages/sdk-typescript': sdkTypescriptConfig,
  'packages/vscode-ide-companion': vscodeCompanionConfig,
  'packages/web-shell': webShellConfig,
  'scripts/tests': scriptsTestsConfig,
};

describe('unhandled-error exemption on the platform lanes', () => {
  for (const [name, config] of Object.entries(configs)) {
    it(`keeps unhandled errors fatal only on Linux in ${name}`, () => {
      // toBe, not toBeFalsy: a deleted flag is `undefined` and must fail
      // this pin on every platform, including Linux where the value is false.
      expect(config.test?.dangerouslyIgnoreUnhandledErrors).toBe(
        process.platform !== 'linux',
      );
    });
  }
});

describe('bundle-guard timeout ceiling', () => {
  it('keeps the bundle-guard timeout ceiling in packages/vscode-ide-companion', () => {
    expect(vscodeCompanionConfig.test?.testTimeout).toBe(15_000);
  });
});

describe('scripts suite timeout', () => {
  it('gives the scripts suite room for a contended host, and a knob', async () => {
    // 30s was the quiet-host figure: acp-serve-boundary-guard is not slow, yet
    // passes 30s under contention. A per-file `vi.setConfig` cannot
    // fix it: these cases register their timeout at collection.
    // The `''` arm is the one that matters and the one this pin used to
    // discard: it stubbed the empty string and then immediately called
    // `vi.unstubAllEnvs()`, so the assertion that followed measured the unset
    // path twice and never saw an empty value at all. `''` is not a hypothetical
    // spelling — `${{ cond && 'x' || '' }}` renders exactly that whenever the
    // condition is false, so a workflow wiring this knob that way would ship 0
    // here, and vitest reads 0 as no timeout at all.
    for (const [stub, expected] of [
      [undefined, 90_000],
      ['', 90_000],
      ['abc', 90_000],
      ['0', 90_000],
      ['5000', 5_000],
    ] as const) {
      vi.stubEnv('O1CODE_SCRIPTS_TEST_TIMEOUT_MS', stub);
      vi.resetModules();
      const mod = await import('./vitest.config.js');
      expect(
        mod.default.test?.testTimeout,
        `stub=${stub === undefined ? '<unset>' : JSON.stringify(stub)}`,
      ).toBe(expected);
      vi.unstubAllEnvs();
    }
  });

  it('keeps the floor the config sets unlowered by any file in the suite', () => {
    // A file that caps itself with vi.setConfig carries a quiet-host figure:
    // a case that costs 3s idle then times out on a contended host. The
    // config above owns testTimeout; a per-file override can only lower it.
    const tests = fileURLToPath(new URL('.', import.meta.url));
    for (const file of readdirSync(tests)) {
      if (!/\.test\.[jt]s$/.test(file)) continue;
      expect(
        readFileSync(join(tests, file), 'utf8'),
        `${file} overrides the suite testTimeout`,
      ).not.toMatch(/vi\.setConfig\(\{[^}]*testTimeout/);
    }
  });
});
