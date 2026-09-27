/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env['NO_COLOR'] !== undefined) {
  delete process.env['NO_COLOR'];
}

import {
  copyFile,
  mkdir,
  readdir,
  rm,
  readFile,
  stat,
  writeFile,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CONTEXT_FILENAME, Storage } from '@organizaone/o1-code-core';

import { removeScratchDir } from './scratch-dir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const integrationTestsDir = join(rootDir, '.integration-tests');
let runDir = ''; // Make runDir accessible in teardown
let sdkE2eRunDir = ''; // SDK E2E test run directory

// Resolved before the redirect below, so setup() can still find the host's
// real global o1-code dir.
const hostO1CodeDir = Storage.getGlobalO1CodeDir();

// These suites spawn the real CLI, which reads the global o1-code dir for
// settings, saved memories, tool-usage history, and extensions. Inherited
// from the host, that dir is live user state and the run is only as
// reproducible as whatever happens to sit in it. Hosted runners have an empty
// `~/.o1-code` and never noticed; the persistent pool does not, and
// there a populated `~/.o1-code/memories` made managed auto-memory recall issue
// its own model request ahead of the agent's first turn. The SDK suites
// script the fake OpenAI server by `requestIndex`, so that extra request
// shifted every index: each scripted tool call landed on the recall selector
// and the turn under test got the trailing text instead — 42 reds across
// permission-control and tool-control that no hosted runner could reproduce.
//
// Give the run its own global o1-code dir, seeded with the host's configuration
// but none of its accumulated files (see carryOverHostConfig). It lives
// outside the worktree so that copy never lands in a tracked tree. A caller
// that pins O1CODE_HOME — globalSetup.test.ts, or someone reproducing against
// real state — keeps it, and owns its lifecycle.
const HERMETIC_HOME_PREFIX = 'o1-code-e2e-home-';
const hermeticO1CodeHome = join(
  tmpdir(),
  `${HERMETIC_HOME_PREFIX}${process.pid}-${Date.now()}`,
);
const ownsO1CodeHome = !process.env['O1CODE_HOME'];
if (ownsO1CodeHome) {
  process.env['O1CODE_HOME'] = hermeticO1CodeHome;
}

// Read after the redirect so the save/restore below, the spawned CLIs, and
// the tests all agree on one global o1-code dir.
const memoryFilePath = join(
  Storage.getGlobalO1CodeDir(),
  DEFAULT_CONTEXT_FILENAME,
);
let originalMemoryContent: string | null = null;

/**
 * Carries the host's configuration — and only that — into the hermetic global
 * o1-code dir.
 *
 * The suites that talk to a real model rely on ambient auth. CI supplies it
 * through the environment, but a developer's typically lives in
 * `~/.o1-code/settings.json`: as credentials under `security.auth`, as provider
 * keys in the `env` block, or as routing in `model` / `modelProviders`. There
 * is no subset of those that is safe to carry alone, so the file goes across
 * whole and a developer's setup keeps working exactly as it does today.
 *
 * What deliberately does not come across is everything the dir accumulates as
 * files: saved memories, tool-usage history, extensions, skills, commands.
 * That is the state a run has no business depending on, and the state that
 * made these suites fail. Carrying settings.json forward keeps whatever the
 * persistent pool relies on for credentials — its `~/.o1-code` is populated,
 * which is how the memories got there — so this narrows the blast radius to
 * the files without gambling on where CI's auth comes from.
 */
async function carryOverHostConfig() {
  for (const fileName of ['settings.json']) {
    await copyFile(
      join(hostO1CodeDir, fileName),
      join(hermeticO1CodeHome, fileName),
    ).catch(() => {
      // Absent on CI and on a machine that has never run the CLI.
    });
  }
}

/**
 * Removes scratch homes an earlier run could not. Teardown's cleanup is
 * best-effort by design, so on a persistent runner the ones it gives up on
 * would otherwise pile up forever. The age floor keeps this clear of any run
 * in flight on the same host: a full E2E run finishes well inside it.
 */
async function sweepLeakedO1CodeHomes() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    const entries = await readdir(tmpdir());
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.startsWith(HERMETIC_HOME_PREFIX) &&
            join(tmpdir(), entry) !== hermeticO1CodeHome,
        )
        .map(async (entry) => {
          const dir = join(tmpdir(), entry);
          try {
            if ((await stat(dir)).mtimeMs < cutoff) {
              await rm(dir, { recursive: true, force: true, maxRetries: 3 });
            }
          } catch {
            // Raced with the run that owns it, or still not removable.
          }
        }),
    );
  } catch {
    // Housekeeping must never fail a run.
  }
}

export async function setup() {
  if (ownsO1CodeHome) {
    await mkdir(hermeticO1CodeHome, { recursive: true });
    await carryOverHostConfig();
    await sweepLeakedO1CodeHomes();
  }

  try {
    originalMemoryContent = await readFile(memoryFilePath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
    // File doesn't exist, which is fine.
  }

  // Setup for CLI integration tests
  runDir = join(integrationTestsDir, `${Date.now()}`);
  await mkdir(runDir, { recursive: true });

  // Setup for SDK E2E tests (separate directory with prefix)
  sdkE2eRunDir = join(integrationTestsDir, `sdk-e2e-${Date.now()}`);
  await mkdir(sdkE2eRunDir, { recursive: true });

  // Clean up old test runs, but keep the latest few for debugging
  try {
    const testRuns = await readdir(integrationTestsDir);

    // Clean up old CLI integration test runs (without sdk-e2e- prefix)
    const cliTestRuns = testRuns.filter((run) => !run.startsWith('sdk-e2e-'));
    if (cliTestRuns.length > 5) {
      const oldRuns = cliTestRuns.sort().slice(0, cliTestRuns.length - 5);
      await Promise.all(
        oldRuns.map((oldRun) =>
          rm(join(integrationTestsDir, oldRun), {
            recursive: true,
            force: true,
          }),
        ),
      );
    }

    // Clean up old SDK E2E test runs (with sdk-e2e- prefix)
    const sdkTestRuns = testRuns.filter((run) => run.startsWith('sdk-e2e-'));
    if (sdkTestRuns.length > 5) {
      const oldRuns = sdkTestRuns.sort().slice(0, sdkTestRuns.length - 5);
      await Promise.all(
        oldRuns.map((oldRun) =>
          rm(join(integrationTestsDir, oldRun), {
            recursive: true,
            force: true,
          }),
        ),
      );
    }
  } catch (e) {
    console.error('Error cleaning up old test runs:', e);
  }

  // Environment variables for CLI integration tests
  process.env['INTEGRATION_TEST_FILE_DIR'] = runDir;
  process.env['O1CODE_INTEGRATION_TEST'] = 'true';
  process.env['TELEMETRY_LOG_FILE'] = join(runDir, 'telemetry.log');

  // Environment variables for SDK E2E tests
  process.env['E2E_TEST_FILE_DIR'] = sdkE2eRunDir;
  process.env['TEST_CLI_PATH'] = join(rootDir, 'dist/cli.js');

  if (process.env['KEEP_OUTPUT']) {
    console.log(`Keeping output for test run in: ${runDir}`);
    console.log(`Keeping output for SDK E2E test run in: ${sdkE2eRunDir}`);
  }
  process.env['VERBOSE'] = process.env['VERBOSE'] ?? 'false';

  console.log(`\nIntegration test output directory: ${runDir}`);
  console.log(`SDK E2E test output directory: ${sdkE2eRunDir}`);
  console.log(`CLI path: ${process.env['TEST_CLI_PATH']}`);
}

export async function teardown() {
  // Cleanup the CLI test run directory unless KEEP_OUTPUT is set
  if (process.env['KEEP_OUTPUT'] !== 'true' && runDir) {
    await rm(runDir, { recursive: true, force: true });
  }

  // Cleanup the SDK E2E test run directory unless KEEP_OUTPUT is set
  if (process.env['KEEP_OUTPUT'] !== 'true' && sdkE2eRunDir) {
    await rm(sdkE2eRunDir, { recursive: true, force: true });
  }

  // Only when the memory file is the host's. Under a hermetic home it sits in
  // the scratch dir removed just below, so there is nothing to put back.
  if (!ownsO1CodeHome) {
    await restoreMemoryFile();
  }

  // Not gated on KEEP_OUTPUT: this is a scratch dir rather than a test
  // artifact, and it holds a copy of the developer's credentials.
  if (ownsO1CodeHome) {
    await removeScratchDir(hermeticO1CodeHome);
  }
}

async function restoreMemoryFile() {
  if (originalMemoryContent !== null) {
    try {
      await mkdir(dirname(memoryFilePath), { recursive: true });
      await writeFile(memoryFilePath, originalMemoryContent, 'utf-8');
    } catch (e) {
      // Best-effort restore: on the persistent pool runners a privileged job
      // can leave a readable-but-unwritable AGENTS.md behind, and the throw
      // turned every all-green E2E run on that host red with no failing test
      // ('Startup Error: EACCES'). Keep the warning visible so the
      // poisoned host is still diagnosable.
      console.error(`Warning: could not restore ${memoryFilePath}:`, e);
    }
  } else {
    try {
      await unlink(memoryFilePath);
    } catch {
      // File might not exist if the test failed before creating it.
    }
  }
}
