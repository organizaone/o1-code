/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E2E integration tests for the O1CODE_HOME environment variable.
 *
 * These tests verify that when O1CODE_HOME is set, all global config files
 * (installation_id, settings.json, memory.md, etc.) are routed to the
 * custom directory instead of ~/.o1-code/.
 *
 * Based on the test plan at:
 *   .claude/docs/PLAN-o1-code-config-dir-e2e-tests.md
 *
 * NOTE: Most tests require a full prompt run (config.initialize() must run to
 * write installation_id). Only scenario 2b can use --help because settings
 * migration runs before arg parsing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONTAINER_SANDBOX_NO_PROXY,
  fakeServerHostOptions,
  IS_CONTAINER_SANDBOX,
  TestRig,
} from '../test-helper.js';
import { startFakeOpenAIServer } from '../fake-openai-server.js';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

// Keep in sync with SETTINGS_VERSION in packages/cli/src/config/settings.ts.
const CURRENT_SETTINGS_VERSION = 4;

// The fake server is reached over loopback, so a runner-level proxy must not
// be allowed to intercept it.
const NO_PROXY = IS_CONTAINER_SANDBOX
  ? CONTAINER_SANDBOX_NO_PROXY
  : '127.0.0.1,localhost';

// Helper: list files under a directory recursively, returning relative paths
function listFilesRecursive(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, base));
    } else {
      results.push(full.slice(base.length + 1));
    }
  }
  return results;
}

describe('O1CODE_HOME environment variable', () => {
  let rig: TestRig;
  let customConfigDir: string;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    // Always clean up env vars regardless of test outcome
    vi.unstubAllEnvs();
    delete process.env['O1CODE_HOME'];
    delete process.env['O1CODE_RUNTIME_DIR'];
    delete process.env['O1CODE_DEBUG_LOG_FILE'];
    await rig.cleanup();
  });

  // -------------------------------------------------------------------------
  // Group 1: Basic environment variable behaviour
  // -------------------------------------------------------------------------

  describe('Group 1: Basic env var behaviour', () => {
    /**
     * 1a. CLI uses custom config dir for settings and initialization.
     *
     * A full prompt run is required because installation_id is only written
     * during config.initialize() → logStartSession() → getInstallationId().
     * --help exits before that point.
     */
    it('1a: installation_id is written inside O1CODE_HOME, not ~/.o1-code', async () => {
      await rig.setup('o1-code-home-1a-installation-id');

      customConfigDir = join(rig.testDir!, 'custom-config');
      mkdirSync(customConfigDir, { recursive: true });
      process.env['O1CODE_HOME'] = customConfigDir;

      // A full prompt run is needed to trigger config.initialize()
      try {
        await rig.run('say hello');
      } catch {
        // May fail without a valid API key; that is acceptable — we only
        // need config.initialize() to run far enough to create installation_id
      }

      const installationIdPath = join(customConfigDir, 'installation_id');
      expect(
        existsSync(installationIdPath),
        `Expected installation_id at ${installationIdPath}`,
      ).toBe(true);
    });

    /**
     * 1b. CLI creates the config dir structure when the path does not yet exist.
     */
    it('1b: config dir is created when it does not exist', async () => {
      await rig.setup('o1-code-home-1b-dir-creation');

      // Point to a path that does NOT exist yet
      customConfigDir = join(rig.testDir!, 'nonexistent-config');
      expect(existsSync(customConfigDir)).toBe(false);

      process.env['O1CODE_HOME'] = customConfigDir;

      try {
        await rig.run('say hello');
      } catch {
        // May fail without a valid API key — tolerate the error
      }

      // The directory must have been created
      expect(
        existsSync(customConfigDir),
        `Expected ${customConfigDir} to be created`,
      ).toBe(true);

      // installation_id signals that config.initialize() ran inside it
      const installationIdPath = join(customConfigDir, 'installation_id');
      expect(
        existsSync(installationIdPath),
        `Expected installation_id inside newly created dir`,
      ).toBe(true);
    });

    /**
     * 1c. Relative path is resolved correctly.
     *
     * TestRig sets cwd to testDir when spawning the child process, so a
     * relative path like "./custom-o1-code" resolves to
     * <testDir>/custom-o1-code inside the subprocess.
     */
    it('1c: relative O1CODE_HOME path is resolved against subprocess cwd', async () => {
      await rig.setup('o1-code-home-1c-relative-path');

      const relativePath = './custom-o1-code';
      process.env['O1CODE_HOME'] = relativePath;

      try {
        await rig.run('say hello');
      } catch {
        // May fail without a valid API key — tolerate the error
      }

      // Resolve the expected absolute path the same way the subprocess does
      const expectedAbsPath = resolve(rig.testDir!, 'custom-o1-code');
      const installationIdPath = join(expectedAbsPath, 'installation_id');
      expect(
        existsSync(installationIdPath),
        `Expected installation_id at resolved path ${installationIdPath}`,
      ).toBe(true);
    });

    /**
     * 1d. Default behaviour is preserved when O1CODE_HOME is unset.
     *
     * HOME is redirected to a writable temp dir so the unset-O1CODE_HOME default
     * (~/.o1-code, resolved via os.homedir()) lands hermetically. This is the one
     * case in the file that otherwise undoes globalSetup's isolation and needs
     * the real $HOME to be writable — the exposure globalSetup isolates
     * O1CODE_HOME against. It is fatal before any routing happens: with an
     * unwritable $HOME the CLI dies during startup with `EACCES: permission
     * denied, mkdir '<home>/.o1-code'`.
     *
     * The redirected home carries no credentials, so the run drives the fake
     * OpenAI server through explicit CLI flags, and it must complete the
     * round-trip rather than tolerate failure like its siblings — tolerating
     * one would report green on a regression that kills the run after
     * config.initialize(). This is the only case that runs the unset path; in a
     * container sandbox that coverage stops at the host-side launcher, because
     * the launcher re-pins O1CODE_HOME for the containerized CLI.
     */
    it('1d: CLI functions normally when O1CODE_HOME is not set', async () => {
      await rig.setup('o1-code-home-1d-default-behaviour');

      // Explicitly ensure O1CODE_HOME is absent for this test
      delete process.env['O1CODE_HOME'];

      // Resolve the default ~/.o1-code into a writable dir so the run never
      // depends on the real $HOME being writable (see the note above).
      const homeDir = join(rig.testDir!, 'home');
      mkdirSync(homeDir, { recursive: true });
      vi.stubEnv('HOME', homeDir);
      vi.stubEnv('USERPROFILE', homeDir);
      vi.stubEnv('NO_PROXY', NO_PROXY);
      vi.stubEnv('no_proxy', NO_PROXY);

      const fakeServer = await startFakeOpenAIServer(
        () => ({ content: 'Hello!' }),
        fakeServerHostOptions(),
      );

      try {
        // Explicit CLI flags outrank ambient auth and any settings.json, so
        // the run cannot be routed to a real model endpoint.
        const result = await rig.run(
          'say hello',
          '--auth-type',
          'openai',
          '--model',
          'fake-model',
          '--openai-base-url',
          fakeServer.baseUrl,
          '--openai-api-key',
          'fake-key',
        );
        expect(result).toContain('Hello!');
      } finally {
        await fakeServer.close();
      }

      // The default global dir must have materialized under the redirected
      // HOME rather than the real one.
      const installationIdPath = join(homeDir, '.o1-code', 'installation_id');
      expect(
        existsSync(installationIdPath),
        `Expected the default global dir at ${installationIdPath}`,
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2: Feature-specific config dir routing
  // -------------------------------------------------------------------------

  describe('Group 2: Feature-specific routing', () => {
    /**
     * 2b. Settings migration runs against the custom config dir.
     *
     * `extensions list` is sufficient here because it is a yargs subcommand
     * that runs through `main()` and reaches `loadSettings()` (which triggers
     * migration), without needing an API key or interactive session.
     * (Note: `--help` cannot be used — yargs intercepts it and exits the
     * process before `loadSettings()` runs.)
     */
    it('2b: settings migration runs in O1CODE_HOME dir', async () => {
      await rig.setup('o1-code-home-2b-settings-migration');

      customConfigDir = join(rig.testDir!, 'migration-config');
      mkdirSync(customConfigDir, { recursive: true });
      process.env['O1CODE_HOME'] = customConfigDir;

      // Write a V1-format settings file into the custom config dir
      const v1Settings = {
        $version: 1,
        theme: 'dark',
        autoAccept: true,
      };
      writeFileSync(
        join(customConfigDir, 'settings.json'),
        JSON.stringify(v1Settings, null, 2),
      );

      // `extensions list` triggers loadSettings() (migration) without needing
      // an API key.
      try {
        await rig.runCommand(['extensions', 'list']);
      } catch {
        // Tolerate non-zero exit; migration runs regardless.
      }

      // Read migrated settings
      const migratedRaw = readFileSync(
        join(customConfigDir, 'settings.json'),
        'utf-8',
      );
      const migrated = JSON.parse(migratedRaw) as Record<string, unknown>;

      expect(migrated['$version']).toBe(CURRENT_SETTINGS_VERSION);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3: Isolation — project-level .o1-code/ is NOT affected
  // -------------------------------------------------------------------------

  describe('Group 3: Project-level isolation', () => {
    /**
     * 3a. Project-level workspace settings work independently of O1CODE_HOME.
     *
     * We put already-current settings in O1CODE_HOME and V1 settings in the
     * workspace .o1-code/settings.json. Running `extensions list` triggers
     * loadSettings() (migration). If the CLI is correctly reading workspace
     * settings from <testDir>/.o1-code/, the workspace settings.json will be
     * migrated. If it mistakenly read from O1CODE_HOME, the workspace file
     * would be untouched.
     *
     * `extensions list` runs through `main()` and reaches `loadSettings()`
     * (which triggers migration) without needing an API key.
     */
    it('3a: workspace settings are read from project .o1-code/, not from O1CODE_HOME', async () => {
      await rig.setup('o1-code-home-3a-isolation');

      customConfigDir = join(rig.testDir!, 'global-config');
      mkdirSync(customConfigDir, { recursive: true });
      process.env['O1CODE_HOME'] = customConfigDir;

      // Seed O1CODE_HOME with the current schema version so it shouldn't migrate.
      writeFileSync(
        join(customConfigDir, 'settings.json'),
        JSON.stringify(
          {
            $version: CURRENT_SETTINGS_VERSION,
            customKey: 'in-global-dir',
          },
          null,
          2,
        ),
      );

      // Overwrite the workspace settings.json with V1 format so migration is observable
      const workspaceSettingsPath = join(
        rig.testDir!,
        '.o1-code',
        'settings.json',
      );
      writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(
          {
            $version: 1,
            theme: 'dark',
            autoAccept: false,
            customWorkspaceKey: 'workspace-value',
          },
          null,
          2,
        ),
      );

      // `extensions list` triggers loadSettings() (including migration)
      // without needing an API key.
      try {
        await rig.runCommand(['extensions', 'list']);
      } catch {
        // Tolerate non-zero exit; migration runs regardless.
      }

      // The workspace settings.json must have been migrated to the current
      // settings version, proving the CLI read it from the workspace dir, not
      // from O1CODE_HOME.
      const workspaceRaw = readFileSync(workspaceSettingsPath, 'utf-8');
      const workspaceSettings = JSON.parse(workspaceRaw) as Record<
        string,
        unknown
      >;
      expect(workspaceSettings['$version']).toBe(CURRENT_SETTINGS_VERSION);
      expect(workspaceSettings['customWorkspaceKey']).toBe('workspace-value');

      // The O1CODE_HOME settings.json must be unchanged (still at the version we wrote)
      const globalRaw = readFileSync(
        join(customConfigDir, 'settings.json'),
        'utf-8',
      );
      const globalSettings = JSON.parse(globalRaw) as Record<string, unknown>;
      expect(globalSettings['customKey']).toBe('in-global-dir');
    });
  });

  // -------------------------------------------------------------------------
  // Group 4: Interaction with O1CODE_RUNTIME_DIR
  // -------------------------------------------------------------------------

  describe('Group 4: Interaction with O1CODE_RUNTIME_DIR', () => {
    /**
     * 4a. O1CODE_HOME and O1CODE_RUNTIME_DIR can be set independently.
     *
     * Config files (installation_id) go to O1CODE_HOME.
     * Runtime files (debug logs) go to O1CODE_RUNTIME_DIR.
     */
    it('4a: config files land in O1CODE_HOME and runtime files land in O1CODE_RUNTIME_DIR', async () => {
      await rig.setup('o1-code-home-4a-independence');

      customConfigDir = join(rig.testDir!, 'config-dir');
      const runtimeDir = join(rig.testDir!, 'runtime-dir');
      mkdirSync(customConfigDir, { recursive: true });
      mkdirSync(runtimeDir, { recursive: true });

      process.env['O1CODE_HOME'] = customConfigDir;
      process.env['O1CODE_RUNTIME_DIR'] = runtimeDir;
      process.env['O1CODE_DEBUG_LOG_FILE'] = '1';

      try {
        await rig.run('say hello');
      } catch {
        // May fail without a valid API key — tolerate the error
      }

      // Config file must be inside O1CODE_HOME
      const installationIdPath = join(customConfigDir, 'installation_id');
      expect(
        existsSync(installationIdPath),
        `Expected installation_id in O1CODE_HOME at ${installationIdPath}`,
      ).toBe(true);

      // Debug logs must be inside O1CODE_RUNTIME_DIR (under debug/)
      const debugDir = join(runtimeDir, 'debug');
      const debugFiles = listFilesRecursive(debugDir);
      expect(
        debugFiles.length,
        `Expected debug log files in ${debugDir}`,
      ).toBeGreaterThan(0);

      // installation_id must NOT appear in the runtime dir
      const runtimeInstallationId = join(runtimeDir, 'installation_id');
      expect(
        existsSync(runtimeInstallationId),
        `Did NOT expect installation_id inside O1CODE_RUNTIME_DIR`,
      ).toBe(false);
    });
  });
});
