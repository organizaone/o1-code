/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';
import type { ChildHeapPolicy } from '@organizaone/o1-code-acp-bridge/childHeapPolicy';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import express from 'express';
import {
  createLazyBridgeProxy,
  extractContextFilename,
  InvalidPolicyConfigError,
  resolveRuntimeStartupTimeoutMs,
  runO1CodeServe,
  type RunHandle,
  subSessionConcurrencyCapsFromSettings,
  validatePolicyConfig,
  waitForRuntimeStartingForShutdown,
} from './run-o1-code-serve.js';
import * as nativeDirectoryPicker from './native-directory-picker.js';
import * as localPathOpen from './local-path-open.js';
import {
  loadServeFastPathEnvironment,
  resetServeFastPathHomeEnvBootstrapForTesting,
} from './fast-path-settings.js';
import { loadEnvironment } from '../config/environment.js';
import { RUNTIME_STARTUP_CANCELLED_MESSAGE } from './runtime-startup-errors.js';
import * as acpBridge from '@organizaone/o1-code-acp-bridge/bridge';
import { SessionNotFoundError } from '@organizaone/o1-code-acp-bridge/bridgeErrors';
import {
  journalGrowthPoolMb,
  resolveDaemonMemoryBudget,
} from '@organizaone/o1-code-acp-bridge/daemonMemoryBudget';
import { canonicalizeWorkspace } from '@organizaone/o1-code-acp-bridge/workspacePaths';
import {
  DEFAULT_MAX_JOURNAL_BYTES,
  DEFAULT_MAX_JOURNAL_EVENTS,
  JOURNAL_GROWTH_HARD_CAP_BYTES,
} from '@organizaone/o1-code-acp-bridge/replayWindowLimits';
import type {
  BridgeDaemonStatusSnapshot,
  HttpAcpBridge,
} from '@organizaone/o1-code-acp-bridge/bridgeTypes';
import type { ServeWorkspaceSkillStatus } from '@organizaone/o1-code-acp-bridge/status';
import * as o1codeCore from '@organizaone/o1-code-core';
import { readSavedApiKey } from '@organizaone/o1-code-core/providers/credential-store.js';
import { generateCustomCredentialId } from '@organizaone/o1-code-core/providers/presets/custom-provider.js';
import * as serverModule from './server.js';
import type { IdleAcpReclaimer } from './idle-acp-reclamation.js';
import { hashDaemonWorkspace } from '@organizaone/o1-code-core/telemetry/daemon-tracing.js';
import * as webShellResolver from './web-shell-resolver.js';
import * as webShellStatic from './web-shell-static.js';
import { applyOpenWithAuth } from './open-with-auth.js';
import * as settingsRuntime from '../config/settings.js';
import * as environmentRuntime from '../config/environment.js';
import * as trustedFoldersRuntime from '../config/trustedFolders.js';
import * as trustPolicyRuntime from '../config/daemon-trust-policy.js';
import * as workspaceServiceRuntime from './workspace-service/index.js';
import { LARGE_PIPE_FRAME_THRESHOLD_BYTES } from './large-pipe-frame-observer.js';
import {
  workspaceRegistrationId,
  WorkspaceRegistrationStore,
} from './workspace-registration-store.js';
import type { WorkspaceRegistry } from './workspace-registry.js';
import {
  ENSURE_KEEP_ALIVE_MS,
  WorkspaceRuntimeCoordinator,
  WorkspaceRuntimeInitializationError,
  WorkspaceRuntimeStillStartingError,
} from './workspace-runtime-coordinator.js';
import { getDeferredRuntimeRequestTiming } from './server/request-helpers.js';
import type { WorkspaceFileSystemFactory } from './fs/workspace-file-system.js';
import { ConversationWorkspace } from './conversations/conversation-workspace.js';
import type { WorkspaceRuntimeProvenance } from './managed-scratch-workspace.js';
import * as scheduledTaskKeepalive from './scheduled-task-keepalive.js';

const originalTestRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
const isolatedTestRuntimeDir = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'qws-run-serve-tests-')),
);
process.env['O1CODE_RUNTIME_DIR'] = isolatedTestRuntimeDir;

afterEach(() => {
  process.env['O1CODE_RUNTIME_DIR'] = isolatedTestRuntimeDir;
  // Unconditional: a test that pins host memory but rejects before its
  // try/finally cleanup would otherwise leak the figure into later
  // memory-budget tests.
  mockTotalMemBytes.value = undefined;
  mockNetworkInterfaces.value = undefined;
});

afterAll(() => {
  if (originalTestRuntimeDir === undefined) {
    delete process.env['O1CODE_RUNTIME_DIR'];
  } else {
    process.env['O1CODE_RUNTIME_DIR'] = originalTestRuntimeDir;
  }
  fs.rmSync(isolatedTestRuntimeDir, { recursive: true, force: true });
});

const BASE_BRIDGE_SNAPSHOT: BridgeDaemonStatusSnapshot = {
  limits: {
    maxSessions: 20,
    maxPendingPromptsPerSession: 5,
    eventRingSize: 8_000,
    compactedReplayMaxBytes: 4 * 1024 * 1024,
    maxJournalEvents: 10_000,
    maxJournalBytes: 8 * 1024 * 1024,
    journalGrowth: null,
    channelIdleTimeoutMs: 0,
    sessionIdleTimeoutMs: 1_800_000,
    sessionPromptSettledCloseGraceMs: 0,
  },
  sessionCount: 0,
  pendingPermissionCount: 0,
  channelLive: true,
  permissionPolicy: 'first-responder',
  sessions: [],
};

function makeRuntimeBridge(): HttpAcpBridge {
  return {
    // The fake stands in for production bridges built through
    // `createSpawnChannelFactory`, which carry the forwarding attestation.
    mandatoryLeaseAttested: true,
    spawnOrAttach: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    killAllSync: vi.fn(),
    getSession: vi.fn(),
    getAllSessions: vi.fn().mockReturnValue([]),
    publishWorkspaceEvent: vi.fn(),
    getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
    resume: vi.fn(),
    preheat: vi.fn().mockResolvedValue(undefined),
    invokeWorkspaceCommand: vi.fn().mockResolvedValue({ configsFailed: 0 }),
    sessionCount: 0,
    pendingPermissionCount: 0,
    activePromptCount: 0,
    activeWork: false,
    activeWorkCoverage: {
      total: 0,
      covered: 0,
      onNegotiatedChannel: 0,
      oldestCoveredReportAt: null,
    },
    lastActivityAt: null,
    getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
    isChannelLive: vi.fn().mockReturnValue(true),
  } as unknown as HttpAcpBridge;
}

function makeLifecycleRuntimeBridge(): HttpAcpBridge {
  return {
    ...makeRuntimeBridge(),
    getWorkspaceRuntimeLifecycleSnapshot: vi.fn().mockReturnValue({
      state: 'idle',
      runtimeLive: true,
      runtimeEpoch: 1,
      activeWork: false,
    }),
  } as unknown as HttpAcpBridge;
}

it('restores the Conversations runtime for a persisted scheduled task', async () => {
  delete process.env['O1CODE_RUNTIME_DIR'];
  const tempRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'qws-live-task-keepalive-')),
  );
  const workspace = path.join(tempRoot, 'workspace');
  const physicalHome = path.join(tempRoot, 'home');
  const linkedHome = path.join(tempRoot, 'home-link');
  const runtimeDir = path.join(tempRoot, 'runtime');
  fs.mkdirSync(workspace);
  fs.mkdirSync(physicalHome);
  fs.symlinkSync(
    physicalHome,
    linkedHome,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const liveConversationWorkspace = new ConversationWorkspace({
    homeDir: linkedHome,
  });
  const { canonicalRoot } = await liveConversationWorkspace.getRoot();
  fs.mkdirSync(path.join(canonicalRoot, '.o1-code'));
  fs.writeFileSync(
    path.join(canonicalRoot, '.o1-code', 'settings.json'),
    JSON.stringify({ advanced: { runtimeOutputDir: runtimeDir } }),
  );
  await o1codeCore.Storage.runWithResolvedRuntimeBaseDir(runtimeDir, () =>
    o1codeCore.updateCronTasks(canonicalRoot, () => [
      {
        id: 'live-task',
        cron: '0 9 * * *',
        prompt: 'p',
        recurring: true,
        createdAt: 1_700_000_000_000,
        lastFiredAt: null,
        sessionId: 'live-session',
        sessionOwnedByTask: false,
      },
    ]),
  );
  const startKeepalive = vi
    .spyOn(scheduledTaskKeepalive, 'startScheduledTaskKeepalive')
    .mockReturnValue({
      stop: vi.fn(),
      activeWork: false,
      tick: vi.fn().mockResolvedValue(undefined),
    });
  vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(
    () =>
      ({
        ...makeRuntimeBridge(),
        recordHeartbeat: vi.fn(),
        resumeSession: vi.fn().mockResolvedValue({}),
      }) as ReturnType<typeof acpBridge.createAcpSessionBridge>,
  );
  let handle: RunHandle | undefined;

  try {
    handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        liveConversationWorkspace,
        // Isolate the Conversations-runtime ownership record from the
        // machine-global ~/.o1-code path: a concurrent live owner there
        // (another worker / a developer's o1-code serve) would fail this boot.
        conversationStableBaseDir: path.join(tempRoot, 'stable'),
        resolveOnListen: true,
      },
    );
    await handle.runtimeReady;
    await vi.waitFor(() => {
      expect(startKeepalive).toHaveBeenCalledWith(
        expect.objectContaining({
          boundWorkspace: canonicalRoot,
        }),
      );
    });
  } finally {
    await handle?.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  }
});

it('marks only the live-conversation bridge with the Conversations provenance env', async () => {
  delete process.env['O1CODE_RUNTIME_DIR'];
  const tempRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'qws-conversations-marker-')),
  );
  const workspace = path.join(tempRoot, 'workspace');
  const physicalHome = path.join(tempRoot, 'home');
  const linkedHome = path.join(tempRoot, 'home-link');
  const runtimeDir = path.join(tempRoot, 'runtime');
  fs.mkdirSync(workspace);
  fs.mkdirSync(physicalHome);
  fs.symlinkSync(
    physicalHome,
    linkedHome,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const liveConversationWorkspace = new ConversationWorkspace({
    homeDir: linkedHome,
  });
  const { canonicalRoot } = await liveConversationWorkspace.getRoot();
  fs.mkdirSync(path.join(canonicalRoot, '.o1-code'));
  fs.writeFileSync(
    path.join(canonicalRoot, '.o1-code', 'settings.json'),
    JSON.stringify({ advanced: { runtimeOutputDir: runtimeDir } }),
  );
  await o1codeCore.Storage.runWithResolvedRuntimeBaseDir(runtimeDir, () =>
    o1codeCore.updateCronTasks(canonicalRoot, () => [
      {
        id: 'live-task',
        cron: '0 9 * * *',
        prompt: 'p',
        recurring: true,
        createdAt: 1_700_000_000_000,
        lastFiredAt: null,
        sessionId: 'live-session',
        sessionOwnedByTask: false,
      },
    ]),
  );
  vi.spyOn(
    scheduledTaskKeepalive,
    'startScheduledTaskKeepalive',
  ).mockReturnValue({
    stop: vi.fn(),
    activeWork: false,
    tick: vi.fn().mockResolvedValue(undefined),
  });
  const createBridge = vi
    .spyOn(acpBridge, 'createAcpSessionBridge')
    .mockImplementation(
      () =>
        ({
          ...makeRuntimeBridge(),
          recordHeartbeat: vi.fn(),
          resumeSession: vi.fn().mockResolvedValue({}),
        }) as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
  const overridesOf = (
    call: Parameters<typeof acpBridge.createAcpSessionBridge>,
  ): Record<string, string | undefined> | undefined =>
    (call[0] as { childEnvOverrides?: Record<string, string | undefined> })
      .childEnvOverrides;
  const MARKER = 'O1CODE_PRIVATE_CONVERSATIONS_RUNTIME';
  let handle: RunHandle | undefined;

  try {
    handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        liveConversationWorkspace,
        conversationStableBaseDir: path.join(tempRoot, 'stable'),
        resolveOnListen: true,
      },
    );
    await handle.runtimeReady;

    // The Conversations runtime is the only runtime this boot creates through
    // the bridge factory (the primary uses the injected bridge). Replacing the
    // provenance ternary with the plain shared overrides leaves it unmarked,
    // which would make the publication gate quarantine the runtime.
    await vi.waitFor(() => {
      expect(
        createBridge.mock.calls.filter(
          (call) => overridesOf(call)?.[MARKER] === '1',
        ),
      ).toHaveLength(1);
    });
    const marked = createBridge.mock.calls.find(
      (call) => overridesOf(call)?.[MARKER] === '1',
    );
    expect((marked?.[0] as { boundWorkspace?: string }).boundWorkspace).toBe(
      canonicalRoot,
    );
    for (const call of createBridge.mock.calls) {
      const overrides = overridesOf(call);
      if (overrides?.[MARKER] === '1') continue;
      // Any other runtime keeps the shared overrides' explicit removal, so its
      // children cannot inherit a marker from the daemon environment.
      expect(overrides).toHaveProperty(MARKER, undefined);
    }
  } finally {
    await handle?.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  }
});

it.each([
  ['chat', false],
  ['image', false],
  ['voice', false],
  ['image', true],
] as const)(
  'preserves saved %s configuration through the provider HTTP installer (environment auth: %s)',
  async (purpose, environmentAuth) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'qws-provider-reconnect-'),
    );
    const home = path.join(root, 'home');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(home);
    fs.mkdirSync(workspace);
    for (const key of [
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'O1CODE_MODEL',
      'OPENAI_BASE_URL',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'GOOGLE_API_KEY',
      'GOOGLE_MODEL',
      'GOOGLE_CLOUD_PROJECT',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_BASE_URL',
    ]) {
      vi.stubEnv(key, '');
    }
    if (environmentAuth) {
      fs.writeFileSync(
        path.join(workspace, '.env'),
        'OPENAI_API_KEY=environment-chat-key\nOPENAI_MODEL=environment-chat\nOPENAI_BASE_URL=https://chat.example/v1\n',
      );
    }
    vi.stubEnv('O1CODE_HOME', home);
    const baseUrl = 'https://media.example/v1';
    const id = purpose === 'voice' ? 'qwen3-asr-flash' : `${purpose}-model`;
    const envKey =
      o1codeCore.generateCustomEnvKey(o1codeCore.AuthType.USE_OPENAI, baseUrl) +
      (purpose === 'chat' ? '' : `_${purpose.toUpperCase()}`);
    const credential =
      purpose === 'chat'
        ? generateCustomCredentialId(o1codeCore.AuthType.USE_OPENAI, baseUrl)
        : `env-${envKey.toLowerCase().replace(/_/g, '-')}`;
    vi.stubEnv(envKey, 'before');
    const model = {
      id,
      baseUrl,
      envKey,
      name: 'My tuned model',
      generationConfig: {
        contextWindowSize: 65536,
        samplingParams: { max_tokens: 4000 },
        customHeaders: { 'X-Route': 'paid' },
      },
      ...(purpose === 'image'
        ? { imageOnly: true, supportsImageGeneration: true }
        : {}),
      ...(purpose === 'voice' ? { voiceOnly: true } : {}),
    };
    const file = path.join(home, 'settings.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        $version: 4,
        env: { [envKey]: 'before' },
        modelProviders: { openai: [model] },
      }),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    let handle: RunHandle | undefined;
    try {
      handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace,
          serveWebShell: false,
        },
        {
          bridge: makeRuntimeBridge(),
          preheatBridge: false,
          trustedWorkspace: true,
          daemonLogBaseDir: path.join(root, 'debug'),
        },
      );
      const response = await fetch(`${handle.url}/workspace/auth/provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'custom-openai-compatible',
          protocol: 'openai',
          baseUrl,
          apiKey: 'after',
          modelIds: [id],
        }),
      });
      expect(response.status).toBe(200);
      const result = (await response.json()) as { message: string };
      if (purpose !== 'chat') {
        expect(result.message).toBe(
          environmentAuth
            ? 'Service models saved.'
            : 'Service models saved. Configure a conversation model to start chatting.',
        );
      }
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(saved.modelProviders.openai).toEqual([{ ...model, credential }]);
      expect(readSavedApiKey(credential)).toBe('after');
      expect(saved.env[envKey]).toBe('before');
      expect(process.env[envKey]).toBe('before');
      if (purpose !== 'chat') {
        expect(saved.security?.auth?.selectedType).toBeUndefined();
        expect(saved.model?.name).toBeUndefined();
      }
      const cleared = await fetch(`${handle.url}/workspace/auth/provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'custom-openai-compatible',
          protocol: 'openai',
          baseUrl,
          apiKey: 'after',
          modelIds: [id],
          advancedConfig: { replaceExisting: true },
        }),
      });
      expect(cleared.status).toBe(200);
      expect(
        JSON.parse(fs.readFileSync(file, 'utf8')).modelProviders.openai,
      ).toEqual([
        {
          ...model,
          credential,
          generationConfig: { customHeaders: { 'X-Route': 'paid' } },
        },
      ]);
    } finally {
      await handle?.close();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

it.each(
  ['fast', 'full'].flatMap((startup) =>
    [
      'workspace',
      'workspace-env',
      'parent-env',
      'shell',
      'user',
      'home-env',
    ].map((source) => ({
      startup,
      source,
    })),
  ),
)(
  'isolates User model deletion after $startup environment bootstrap ($source)',
  async ({ startup, source }) => {
    const workspaceOnly = ['workspace', 'workspace-env', 'parent-env'].includes(
      source,
    );
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-delete-env-')),
    );
    const home = path.join(root, 'home');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(home);
    fs.mkdirSync(path.join(workspace, '.o1-code'), { recursive: true });
    const baseUrl = 'https://delete.example/v1';
    const model = { name: 'gpt-4o', baseUrl };
    const env = {
      ANTHROPIC_API_KEY: 'test-only-key',
      ANTHROPIC_MODEL: 'claude-other',
      ANTHROPIC_BASE_URL: baseUrl,
    };
    for (const key of [
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'O1CODE_MODEL',
      'OPENAI_BASE_URL',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'GOOGLE_API_KEY',
      'GOOGLE_MODEL',
      'GOOGLE_CLOUD_PROJECT',
      ...Object.keys(env),
    ]) {
      vi.stubEnv(key, undefined);
    }
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('O1CODE_HOME', home);
    vi.stubEnv('O1CODE_SYSTEM_SETTINGS_PATH', path.join(root, 'no-system'));
    vi.stubEnv('O1CODE_SYSTEM_DEFAULTS_PATH', path.join(root, 'no-defaults'));
    const userFile = path.join(home, 'settings.json');
    const workspaceFile = path.join(workspace, '.o1-code', 'settings.json');
    fs.writeFileSync(
      userFile,
      JSON.stringify({
        $version: 4,
        modelProviders: { openai: [{ id: model.name, baseUrl }] },
        model,
        ...(source === 'user' ? { env } : {}),
      }),
    );
    fs.writeFileSync(
      workspaceFile,
      JSON.stringify({
        $version: 4,
        ...(source.endsWith('-env') ? {} : { env }),
      }),
    );
    fs.writeFileSync(
      path.join(home, 'trustedFolders.json'),
      JSON.stringify({ [root]: 'TRUST_PARENT' }),
    );
    if (source === 'shell') {
      for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
      }
    }
    if (source.endsWith('-env')) {
      const directory =
        source === 'home-env'
          ? home
          : source === 'parent-env'
            ? root
            : workspace;
      fs.writeFileSync(
        path.join(directory, '.env'),
        Object.entries(env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
      );
    }
    settingsRuntime.resetEnvironmentTrackingForTesting();
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    let handle: RunHandle | undefined;
    try {
      if (startup === 'fast') {
        const { bootstrapServeFastPathEnvironment } = await import(
          './fast-path.js'
        );
        await bootstrapServeFastPathEnvironment(workspace);
      } else {
        settingsRuntime.loadSettings(workspace, { workspaceTrusted: true });
      }
      expect(process.env['ANTHROPIC_MODEL']).toBe('claude-other');
      handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace,
          serveWebShell: false,
        },
        {
          bridge: makeRuntimeBridge(),
          preheatBridge: false,
          trustedWorkspace: true,
          daemonLogBaseDir: path.join(root, 'debug'),
        },
      );
      const response = await fetch(`${handle.url}/workspace/models`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authType: 'openai',
          modelId: model.name,
          baseUrl,
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        clearedActiveModel: false,
      });
      const saved = JSON.parse(fs.readFileSync(userFile, 'utf8'));
      expect(saved.modelProviders.openai).toEqual([]);
      expect(saved.model).toEqual(
        workspaceOnly ? { name: '', baseUrl: '' } : model,
      );
      if (workspaceOnly) {
        expect(
          JSON.parse(fs.readFileSync(workspaceFile, 'utf8')).model,
        ).toEqual(model);
      }
    } finally {
      await handle?.close();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      settingsRuntime.resetEnvironmentTrackingForTesting();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

function writeWebShellFixture(workspaceDir: string): string {
  const shellDir = path.join(workspaceDir, 'web-shell');
  fs.mkdirSync(path.join(shellDir, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(shellDir, 'index.html'),
    '<!doctype html><body><div id="root"></div></body>',
  );
  vi.spyOn(webShellResolver, 'resolveWebShellDir').mockReturnValue(shellDir);
  return shellDir;
}

async function startDeferredDaemon(
  workspace: string,
  overrides: {
    serveOptions?: Partial<Parameters<typeof runO1CodeServe>[0]>;
    createBridge?: () => HttpAcpBridge;
  } = {},
) {
  const createBridge = vi
    .spyOn(acpBridge, 'createAcpSessionBridge')
    .mockImplementation(() => {
      const bridge = overrides.createBridge
        ? overrides.createBridge()
        : makeRuntimeBridge();
      return bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>;
    });
  const handle = await runO1CodeServe(
    {
      port: 0,
      hostname: '127.0.0.1',
      mode: 'http-bridge',
      workspace,
      maxSessions: 1,
      token: 'secret-token',
      ...overrides.serveOptions,
    },
    {
      resolveOnListen: true,
      deferRuntimeUntilFirstHealth: true,
      runtimeStartupTimeoutMs: 0,
    },
  );
  return { handle, createBridge };
}

const mockCreateSpawnChannelFactoryOptions = vi.hoisted(
  () => [] as Array<Record<string, unknown>>,
);
const mockTotalMemBytes = vi.hoisted(() => ({
  value: undefined as number | undefined,
}));
const mockNetworkInterfaces = vi.hoisted(() => ({
  value: undefined as NodeJS.Dict<os.NetworkInterfaceInfo[]> | undefined,
}));
const mockRemoteQuickstart = vi.hoisted(() => ({
  print: vi.fn(),
}));

vi.mock('./remote-quickstart.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./remote-quickstart.js')>();
  // Only the printer is stubbed; the real quickstartPrintMode /
  // tokenQrNoEffectReason must stay, or boot-time callers get undefined.
  return {
    ...actual,
    printRemoteQuickstart: mockRemoteQuickstart.print,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  // Mock both the named and the default export: consumers do
  // `import os from 'node:os'`, which a bare spread would leave unmocked.
  const totalmem = () => mockTotalMemBytes.value ?? actual.totalmem();
  const networkInterfaces = () =>
    mockNetworkInterfaces.value ?? actual.networkInterfaces();
  return {
    ...actual,
    totalmem,
    networkInterfaces,
    default: { ...actual, totalmem, networkInterfaces },
  };
});

async function getFreeLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return port;
}

vi.mock(
  '@organizaone/o1-code-acp-bridge/spawnChannel',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@organizaone/o1-code-acp-bridge/spawnChannel')
      >();
    return {
      ...actual,
      createSpawnChannelFactory: vi.fn(
        (options: Record<string, unknown> = {}) => {
          mockCreateSpawnChannelFactoryOptions.push(options);
          return actual.createSpawnChannelFactory(options);
        },
      ),
    };
  },
);

describe('workspace skill settings persistence', () => {
  let handle: RunHandle | undefined;
  let workspace = '';
  let o1codeHome = '';
  let previousO1CodeHome: string | undefined;

  afterEach(async () => {
    await handle?.close();
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
    if (o1codeHome) fs.rmSync(o1codeHome, { recursive: true, force: true });
    if (previousO1CodeHome === undefined) delete process.env['O1CODE_HOME'];
    else process.env['O1CODE_HOME'] = previousO1CodeHome;
    settingsRuntime.resetHomeEnvBootstrapForTesting();
    vi.restoreAllMocks();
  });

  const skillStatus = (
    name: string,
    level: ServeWorkspaceSkillStatus['level'],
    extensionName?: string,
  ): ServeWorkspaceSkillStatus => ({
    kind: 'skill',
    status: 'ok',
    name,
    description: name,
    level,
    modelInvocable: true,
    ...(extensionName ? { extensionName } : {}),
  });

  const writeSkillSettings = (
    workspaceDisabled: string[],
    userDisabled: string[] = [],
  ) => {
    workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-identity-')),
    );
    o1codeHome = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-identity-home-')),
    );
    previousO1CodeHome = process.env['O1CODE_HOME'];
    process.env['O1CODE_HOME'] = o1codeHome;
    settingsRuntime.resetHomeEnvBootstrapForTesting();
    fs.mkdirSync(path.join(workspace, '.o1-code'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, '.o1-code', 'settings.json'),
      JSON.stringify({ skills: { disabled: workspaceDisabled } }),
    );
    fs.writeFileSync(
      path.join(o1codeHome, 'settings.json'),
      JSON.stringify({ skills: { disabled: userDisabled } }),
    );
  };

  const captureSkillPersistence = async (
    skills: ServeWorkspaceSkillStatus[],
  ) => {
    const originalCreateServeApp = serverModule.createServeApp;
    let deps: Parameters<typeof serverModule.createServeApp>[2];
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      deps = args[2];
      return originalCreateServeApp(...args);
    });
    const bridge = {
      ...makeRuntimeBridge(),
      queryWorkspaceStatus: vi.fn().mockResolvedValue({
        v: 1,
        workspaceCwd: workspace,
        initialized: true,
        skills,
      }),
    } as unknown as HttpAcpBridge;
    handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        serveWebShell: false,
      },
      { bridge },
    );
    await handle.runtimeReady;
    expect(deps?.persistDisabledSkills).toBeDefined();
    expect(deps?.persistDisabledSkillsBatch).toBeDefined();
    return deps!;
  };

  it('uses catalog identity for a non-extension skill whose name contains a colon', async () => {
    writeSkillSettings(['rust:chat', 'chat']);
    const { persistDisabledSkills } = await captureSkillPersistence([
      skillStatus('rust:chat', 'project'),
    ]);

    await expect(
      persistDisabledSkills!(workspace, 'rust:chat', true),
    ).resolves.toEqual({
      changed: true,
      disabled: ['chat'],
      settingsChanges: [
        { key: 'skills.disabled', value: ['chat'] },
        { key: 'skills.enabled', value: ['rust:chat'] },
      ],
    });
  });

  it('preserves the legacy bare-name block for extensions and uncatalogued skills', async () => {
    writeSkillSettings([], ['pdf', 'legacy']);
    const { persistDisabledSkills } = await captureSkillPersistence([
      skillStatus('rust:pdf', 'extension', 'rust'),
    ]);

    await expect(
      persistDisabledSkills!(workspace, 'rust:pdf', true),
    ).resolves.toMatchObject({
      changed: false,
      block: { entry: 'pdf', scope: 'User' },
    });
    await expect(
      persistDisabledSkills!(workspace, 'rust:legacy', true),
    ).resolves.toMatchObject({
      changed: false,
      block: { entry: 'legacy', scope: 'User' },
    });
  });

  it('makes a batch enable order-independent without bypassing a user block', async () => {
    writeSkillSettings(['pdf'], ['locked']);
    const { persistDisabledSkillsBatch } = await captureSkillPersistence([
      skillStatus('pdf', 'user'),
      skillStatus('rust:pdf', 'extension', 'rust'),
      skillStatus('rust:locked', 'extension', 'rust'),
    ]);
    const setValues = vi.spyOn(
      settingsRuntime.LoadedSettings.prototype,
      'setValues',
    );

    const first = await persistDisabledSkillsBatch!(
      workspace,
      ['pdf', 'rust:pdf'],
      true,
    );
    expect(first.outcomes).toEqual([
      { skillName: 'pdf', changed: true },
      { skillName: 'rust:pdf', changed: true },
    ]);
    expect(setValues).toHaveBeenCalledOnce();

    fs.writeFileSync(
      path.join(workspace, '.o1-code', 'settings.json'),
      JSON.stringify({ skills: { disabled: ['pdf'] } }),
    );
    setValues.mockClear();

    const reversed = await persistDisabledSkillsBatch!(
      workspace,
      ['rust:pdf', 'pdf'],
      true,
    );
    expect(reversed.outcomes).toEqual([
      { skillName: 'rust:pdf', changed: true },
      { skillName: 'pdf', changed: true },
    ]);
    expect(setValues).toHaveBeenCalledOnce();

    fs.writeFileSync(
      path.join(workspace, '.o1-code', 'settings.json'),
      JSON.stringify({ skills: { disabled: [] } }),
    );
    setValues.mockClear();

    const blocked = await persistDisabledSkillsBatch!(
      workspace,
      ['rust:locked'],
      true,
    );
    expect(blocked.outcomes).toEqual([
      { skillName: 'rust:locked', changed: false },
    ]);
    expect(setValues).not.toHaveBeenCalled();
  });

  it('rechecks a batch until a multi-step alias chain converges', async () => {
    writeSkillSettings(['y:z', 'z']);
    const { persistDisabledSkillsBatch } = await captureSkillPersistence([
      skillStatus('x:y:z', 'extension', 'x'),
      skillStatus('y:z', 'extension', 'y'),
      skillStatus('z', 'project'),
    ]);
    const setValues = vi.spyOn(
      settingsRuntime.LoadedSettings.prototype,
      'setValues',
    );

    const result = await persistDisabledSkillsBatch!(
      workspace,
      ['x:y:z', 'y:z', 'z'],
      true,
    );

    expect(result.outcomes).toEqual([
      { skillName: 'x:y:z', changed: true },
      { skillName: 'y:z', changed: true },
      { skillName: 'z', changed: true },
    ]);
    expect(setValues).toHaveBeenCalledOnce();
  });

  it('canonicalizes, deduplicates, preserves orphans, and serializes updates across settings scopes', async () => {
    workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-settings-')),
    );
    o1codeHome = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-home-')),
    );
    previousO1CodeHome = process.env['O1CODE_HOME'];
    process.env['O1CODE_HOME'] = o1codeHome;
    settingsRuntime.resetHomeEnvBootstrapForTesting();
    fs.mkdirSync(path.join(workspace, '.o1-code'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, '.o1-code', 'settings.json'),
      JSON.stringify({
        skills: { disabled: ['orphan', ' ReViEw ', 'review'] },
      }),
    );
    fs.writeFileSync(
      path.join(o1codeHome, 'settings.json'),
      JSON.stringify({
        skills: {
          disabled: ['locked-skill'],
          defaultDisabled: ['opt-in-skill', 'inherited-opt-in'],
          enabled: ['INHERITED-OPT-IN'],
        },
      }),
    );

    const originalCreateServeApp = serverModule.createServeApp;
    let persistDisabledSkills:
      | NonNullable<
          Parameters<typeof serverModule.createServeApp>[2]
        >['persistDisabledSkills']
      | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      persistDisabledSkills = args[2]?.persistDisabledSkills;
      return originalCreateServeApp(...args);
    });
    handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        serveWebShell: false,
      },
      { bridge: makeRuntimeBridge() },
    );
    await handle.runtimeReady;
    expect(persistDisabledSkills).toBeDefined();
    await expect(
      persistDisabledSkills!(workspace, 'inherited-opt-in', true),
    ).resolves.toEqual({
      changed: true,
      disabled: ['orphan', ' ReViEw ', 'review'],
      settingsChanges: [{ key: 'skills.enabled', value: ['inherited-opt-in'] }],
    });

    // A grant a standing entry still forbids is refused, not reported as a
    // success the merged config then denies: the bare user entry blocks the
    // qualified name under either spelling, the workspace entry the same,
    // and a bare defaultDisabled entry is not cancelled by a qualified
    // grant.
    await expect(
      persistDisabledSkills!(workspace, 'demo:locked-skill', true),
    ).resolves.toEqual({
      changed: false,
      disabled: ['orphan', ' ReViEw ', 'review'],
      block: {
        reason: 'hard',
        list: 'disabled',
        entry: 'locked-skill',
        scope: 'User',
      },
    });
    await expect(
      persistDisabledSkills!(workspace, 'demo:review', true),
    ).resolves.toEqual({
      changed: false,
      disabled: ['orphan', ' ReViEw ', 'review'],
      block: {
        reason: 'hard',
        list: 'disabled',
        entry: 'review',
        scope: 'Workspace',
      },
    });
    await expect(
      persistDisabledSkills!(workspace, 'demo:opt-in-skill', true),
    ).resolves.toEqual({
      changed: false,
      disabled: ['orphan', ' ReViEw ', 'review'],
      block: {
        reason: 'default',
        list: 'defaultDisabled',
        entry: 'opt-in-skill',
        scope: 'User',
      },
    });

    await expect(
      persistDisabledSkills!(workspace, 'review', false),
    ).resolves.toEqual({
      changed: true,
      disabled: ['orphan', 'review'],
      settingsChanges: [
        { key: 'skills.disabled', value: ['orphan', 'review'] },
      ],
    });
    await expect(
      persistDisabledSkills!(workspace, 'review', false),
    ).resolves.toEqual({
      changed: false,
      disabled: ['orphan', 'review'],
    });

    await Promise.all([
      persistDisabledSkills!(workspace, 'alpha', false),
      persistDisabledSkills!(workspace, 'beta', false),
    ]);
    await expect(
      persistDisabledSkills!(workspace, 'review', true),
    ).resolves.toMatchObject({ changed: true });
    await expect(
      persistDisabledSkills!(workspace, 'opt-in-skill', true),
    ).resolves.toEqual({
      changed: true,
      disabled: ['orphan', 'alpha', 'beta'],
      settingsChanges: [
        {
          key: 'skills.enabled',
          value: ['inherited-opt-in', 'review', 'opt-in-skill'],
        },
      ],
    });

    const saved = JSON.parse(
      fs.readFileSync(
        path.join(workspace, '.o1-code', 'settings.json'),
        'utf8',
      ),
    ) as { skills: { disabled: string[]; enabled: string[] } };
    expect(saved.skills.disabled).toEqual(['orphan', 'alpha', 'beta']);
    expect(saved.skills.enabled).toEqual([
      'inherited-opt-in',
      'review',
      'opt-in-skill',
    ]);
    await expect(
      persistDisabledSkills!(workspace, 'locked-skill', false),
    ).resolves.toEqual({
      changed: true,
      disabled: ['orphan', 'alpha', 'beta', 'locked-skill'],
      settingsChanges: [
        {
          key: 'skills.disabled',
          value: ['orphan', 'alpha', 'beta', 'locked-skill'],
        },
      ],
    });
    // The user-scope entry still blocks the grant under either spelling, so
    // the write is refused and named instead of reported as a success the
    // merged config then denies.
    await expect(
      persistDisabledSkills!(workspace, 'locked-skill', true),
    ).resolves.toEqual({
      changed: false,
      disabled: ['orphan', 'alpha', 'beta', 'locked-skill'],
      block: {
        reason: 'hard',
        list: 'disabled',
        entry: 'locked-skill',
        scope: 'User',
      },
    });
    const savedUser = JSON.parse(
      fs.readFileSync(path.join(o1codeHome, 'settings.json'), 'utf8'),
    ) as { skills: { disabled: string[] } };
    expect(savedUser.skills.disabled).toEqual(['locked-skill']);
  });

  it('produces both skills.disabled and skills.enabled changes when enabling a workspace-hard-disabled default-disabled skill', async () => {
    workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-dual-')),
    );
    o1codeHome = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-dual-home-')),
    );
    previousO1CodeHome = process.env['O1CODE_HOME'];
    process.env['O1CODE_HOME'] = o1codeHome;
    settingsRuntime.resetHomeEnvBootstrapForTesting();
    fs.mkdirSync(path.join(workspace, '.o1-code'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, '.o1-code', 'settings.json'),
      JSON.stringify({
        skills: { disabled: ['dual-skill'] },
      }),
    );
    fs.writeFileSync(
      path.join(o1codeHome, 'settings.json'),
      JSON.stringify({
        skills: { defaultDisabled: ['dual-skill'] },
      }),
    );

    const originalCreateServeApp = serverModule.createServeApp;
    let persistDisabledSkills:
      | NonNullable<
          Parameters<typeof serverModule.createServeApp>[2]
        >['persistDisabledSkills']
      | undefined;
    let persistDisabledTools:
      | Parameters<
          typeof workspaceServiceRuntime.createDaemonWorkspaceService
        >[0]['persistDisabledTools']
      | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      persistDisabledSkills = args[2]?.persistDisabledSkills;
      persistDisabledTools = args[2]?.persistDisabledTools;
      return originalCreateServeApp(...args);
    });
    handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        serveWebShell: false,
      },
      { bridge: makeRuntimeBridge() },
    );
    await handle.runtimeReady;
    expect(persistDisabledSkills).toBeDefined();
    expect(persistDisabledTools).toBeDefined();

    await expect(
      persistDisabledSkills!(workspace, 'dual-skill', true),
    ).resolves.toEqual({
      changed: true,
      disabled: [],
      settingsChanges: [
        { key: 'skills.disabled', value: undefined },
        { key: 'skills.enabled', value: ['dual-skill'] },
      ],
    });

    const saved = JSON.parse(
      fs.readFileSync(
        path.join(workspace, '.o1-code', 'settings.json'),
        'utf8',
      ),
    ) as { skills: { disabled?: string[]; enabled: string[] } };
    expect(saved.skills.disabled).toBeUndefined();
    expect(saved.skills.enabled).toEqual(['dual-skill']);

    const setValue = vi.spyOn(
      settingsRuntime.LoadedSettings.prototype,
      'setValue',
    );
    const setValues = vi.spyOn(
      settingsRuntime.LoadedSettings.prototype,
      'setValues',
    );

    const skillGuard = vi.fn();
    await persistDisabledSkills!(workspace, 'guarded-skill', false, skillGuard);
    expect(setValues.mock.calls).toHaveLength(1);
    expect(setValues.mock.calls[0]?.[2]).toBe(skillGuard);

    const toolGuard = vi.fn();
    await persistDisabledTools!(workspace, 'guarded-tool', false, toolGuard);
    expect(setValue.mock.calls).toHaveLength(1);
    expect(setValue.mock.calls[0]?.[3]).toBe(toolGuard);
  });

  it('persists a Skill batch with one settings write across settings scopes', async () => {
    workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-batch-')),
    );
    o1codeHome = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-skill-batch-home-')),
    );
    previousO1CodeHome = process.env['O1CODE_HOME'];
    process.env['O1CODE_HOME'] = o1codeHome;
    settingsRuntime.resetHomeEnvBootstrapForTesting();
    fs.mkdirSync(path.join(workspace, '.o1-code'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, '.o1-code', 'settings.json'),
      JSON.stringify({ skills: { disabled: ['orphan'] } }),
    );
    fs.writeFileSync(
      path.join(o1codeHome, 'settings.json'),
      JSON.stringify({
        skills: {
          disabled: ['locked-skill'],
          defaultDisabled: ['opt-in'],
        },
      }),
    );

    const originalCreateServeApp = serverModule.createServeApp;
    let persistDisabledSkillsBatch:
      | NonNullable<
          Parameters<typeof serverModule.createServeApp>[2]
        >['persistDisabledSkillsBatch']
      | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      persistDisabledSkillsBatch = args[2]?.persistDisabledSkillsBatch;
      return originalCreateServeApp(...args);
    });
    handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        serveWebShell: false,
      },
      { bridge: makeRuntimeBridge() },
    );
    await handle.runtimeReady;
    expect(persistDisabledSkillsBatch).toBeDefined();
    const setValues = vi.spyOn(
      settingsRuntime.LoadedSettings.prototype,
      'setValues',
    );

    const result = await persistDisabledSkillsBatch!(
      workspace,
      ['review', 'alpha', 'locked-skill'],
      false,
    );

    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes[0]).toEqual({
      skillName: 'review',
      changed: true,
    });
    expect(result.outcomes[1]).toEqual({
      skillName: 'alpha',
      changed: true,
    });
    expect(result.outcomes[2]).toEqual({
      skillName: 'locked-skill',
      changed: true,
    });
    expect(result.settingsChanges).toEqual([
      {
        key: 'skills.disabled',
        value: ['orphan', 'review', 'alpha', 'locked-skill'],
      },
    ]);
    expect(setValues).toHaveBeenCalledOnce();

    const noopResult = await persistDisabledSkillsBatch!(
      workspace,
      ['review'],
      false,
    );
    expect(noopResult.outcomes).toEqual([
      { skillName: 'review', changed: false },
    ]);
    expect(noopResult.settingsChanges).toEqual([]);
    expect(setValues).toHaveBeenCalledOnce();

    const savedAfterDisable = JSON.parse(
      fs.readFileSync(
        path.join(workspace, '.o1-code', 'settings.json'),
        'utf8',
      ),
    ) as { skills: { disabled: string[]; enabled?: string[] } };
    expect(savedAfterDisable.skills.disabled).toEqual([
      'orphan',
      'review',
      'alpha',
      'locked-skill',
    ]);
    expect(savedAfterDisable.skills.enabled).toBeUndefined();
    const savedUser = JSON.parse(
      fs.readFileSync(path.join(o1codeHome, 'settings.json'), 'utf8'),
    ) as { skills: { disabled: string[]; enabled?: string[] } };
    expect(savedUser.skills.disabled).toEqual(['locked-skill']);
    expect(savedUser.skills.enabled).toBeUndefined();

    const preinstallOptIn = await persistDisabledSkillsBatch!(
      workspace,
      ['future-skill'],
      true,
    );
    expect(preinstallOptIn.outcomes).toEqual([
      { skillName: 'future-skill', changed: true },
    ]);
    expect(preinstallOptIn.settingsChanges).toEqual([
      { key: 'skills.enabled', value: ['future-skill'] },
    ]);
    expect(setValues).toHaveBeenCalledTimes(2);

    const preinstallEnable = await persistDisabledSkillsBatch!(
      workspace,
      ['orphan'],
      true,
    );
    expect(preinstallEnable.outcomes).toEqual([
      { skillName: 'orphan', changed: true },
    ]);
    expect(preinstallEnable.settingsChanges).toEqual([
      {
        key: 'skills.disabled',
        value: ['review', 'alpha', 'locked-skill'],
      },
      { key: 'skills.enabled', value: ['future-skill', 'orphan'] },
    ]);
    expect(setValues).toHaveBeenCalledTimes(3);

    const enableResult = await persistDisabledSkillsBatch!(
      workspace,
      ['opt-in'],
      true,
    );

    expect(enableResult.outcomes).toEqual([
      { skillName: 'opt-in', changed: true },
    ]);
    expect(enableResult.settingsChanges).toEqual([
      {
        key: 'skills.enabled',
        value: ['future-skill', 'orphan', 'opt-in'],
      },
    ]);
    expect(setValues).toHaveBeenCalledTimes(4);

    const savedAfterEnable = JSON.parse(
      fs.readFileSync(
        path.join(workspace, '.o1-code', 'settings.json'),
        'utf8',
      ),
    ) as { skills: { disabled: string[]; enabled: string[] } };
    expect(savedAfterEnable.skills.disabled).toEqual([
      'review',
      'alpha',
      'locked-skill',
    ]);
    expect(savedAfterEnable.skills.enabled).toEqual([
      'future-skill',
      'orphan',
      'opt-in',
    ]);

    const guard = vi.fn();
    await persistDisabledSkillsBatch!(workspace, ['guarded'], false, guard);
    expect(setValues.mock.calls.at(-1)?.[2]).toBe(guard);
    expect(guard).toHaveBeenCalled();

    const blockingGuard = vi.fn(() => {
      throw new Error('generation closed');
    });
    const writesBefore = setValues.mock.calls.length;
    await expect(
      persistDisabledSkillsBatch!(
        workspace,
        ['guarded-too'],
        false,
        blockingGuard,
      ),
    ).rejects.toThrow('generation closed');
    expect(setValues.mock.calls).toHaveLength(writesBefore);
  });
});

/**
 * Lock the
 * `context.fileName` extraction logic so a regression doesn't
 * silently re-enable the bug where init writes the default `AGENTS.md`
 * even when the workspace configured another name. The four
 * branches the suggestion called out are exercised explicitly here;
 * the runO1CodeServe boot path itself stays integration-tested
 * end-to-end via the daemon-process tests in
 * `integration-tests/cli/o1-code-serve-routes.test.ts`.
 */
describe('extractContextFilename', () => {
  it('returns a trimmed string when given a non-empty string', () => {
    expect(extractContextFilename('AGENTS.md')).toBe('AGENTS.md');
    expect(extractContextFilename('  CUSTOM.md  ')).toBe('CUSTOM.md');
  });

  it('returns undefined for empty / whitespace-only strings', () => {
    expect(extractContextFilename('')).toBeUndefined();
    expect(extractContextFilename('   ')).toBeUndefined();
    expect(extractContextFilename('\n\t')).toBeUndefined();
  });

  it('returns the first non-empty string when given an array', () => {
    expect(extractContextFilename(['AGENTS.md', 'BACKUP.md'])).toBe(
      'AGENTS.md',
    );
    // Skips empty and whitespace entries to find the first valid name.
    expect(extractContextFilename(['', '  ', 'PRIMARY.md', 'OTHER.md'])).toBe(
      'PRIMARY.md',
    );
    // Trims the picked element.
    expect(extractContextFilename(['  CUSTOM.md  '])).toBe('CUSTOM.md');
  });

  it('returns undefined when the array has no string entries', () => {
    expect(extractContextFilename([])).toBeUndefined();
    expect(extractContextFilename(['', '  ', '\n'])).toBeUndefined();
    // Non-string entries are filtered out — when nothing valid remains,
    // the bridge falls back to its own default.
    expect(
      extractContextFilename([null, undefined, 42, { a: 1 }] as unknown[]),
    ).toBeUndefined();
  });

  it('returns undefined for non-string non-array inputs', () => {
    // Hand-edited `settings.json` could land any of these shapes;
    // the helper must NOT coerce (avoids the literal `[object Object]`
    // filename that the previous `String(...)` cast produced).
    expect(extractContextFilename(undefined)).toBeUndefined();
    expect(extractContextFilename(null)).toBeUndefined();
    expect(extractContextFilename(42)).toBeUndefined();
    expect(extractContextFilename(true)).toBeUndefined();
    expect(extractContextFilename({ fileName: 'AGENTS.md' })).toBeUndefined();
  });
});

describe('subSessionConcurrencyCapsFromSettings', () => {
  it('passes through positive integer caps', () => {
    expect(
      subSessionConcurrencyCapsFromSettings({
        maxConcurrentSubSessionsPerCaller: 8,
        maxConcurrentSubSessionsTotal: 12,
      }),
    ).toEqual({ maxConcurrentPerCaller: 8, maxConcurrentTotal: 12 });
  });

  it('omits absent keys so launcher defaults apply', () => {
    expect(subSessionConcurrencyCapsFromSettings({})).toEqual({});
  });

  it('rejects values outside positive integers', () => {
    // Hand-edited settings.json could land any of these; coercing (e.g.
    // accepting 0 or "10") would silently disable or misread a resource cap.
    const onWarning = vi.fn();
    expect(
      subSessionConcurrencyCapsFromSettings(
        {
          maxConcurrentSubSessionsPerCaller: 0,
          maxConcurrentSubSessionsTotal: -1,
        },
        onWarning,
      ),
    ).toEqual({});
    expect(
      subSessionConcurrencyCapsFromSettings(
        {
          maxConcurrentSubSessionsPerCaller: 2.5,
          maxConcurrentSubSessionsTotal: '10',
        },
        onWarning,
      ),
    ).toEqual({});
    expect(onWarning).toHaveBeenCalledTimes(4);
  });

  it('keeps a valid cap when the sibling key is invalid', () => {
    expect(
      subSessionConcurrencyCapsFromSettings(
        {
          maxConcurrentSubSessionsPerCaller: 8,
          maxConcurrentSubSessionsTotal: Number.NaN,
        },
        () => {},
      ),
    ).toEqual({ maxConcurrentPerCaller: 8 });
  });

  it('warns naming a present-but-invalid cap', () => {
    const onWarning = vi.fn();
    expect(
      subSessionConcurrencyCapsFromSettings(
        { maxConcurrentSubSessionsTotal: '50' },
        onWarning,
      ),
    ).toEqual({});
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning.mock.calls[0][0]).toContain(
      'maxConcurrentSubSessionsTotal',
    );
    // JSON.stringify keeps the quotes, revealing the value is a string.
    expect(onWarning.mock.calls[0][0]).toContain('"50"');
  });

  it('does not warn when the keys are absent', () => {
    const onWarning = vi.fn();
    subSessionConcurrencyCapsFromSettings({}, onWarning);
    expect(onWarning).not.toHaveBeenCalled();
  });
});

/**
 * Positive tests for the
 * `validatePolicyConfig` helper. Lock the contract so a future
 * refactor can't silently remove the `InvalidPolicyConfigError`
 * class or the validation paths.
 */
describe('validatePolicyConfig', () => {
  it('returns undefined for both fields when policyConfig is empty', () => {
    expect(validatePolicyConfig()).toEqual({
      permissionPolicy: undefined,
      permissionConsensusQuorum: undefined,
    });
    expect(validatePolicyConfig({})).toEqual({
      permissionPolicy: undefined,
      permissionConsensusQuorum: undefined,
    });
  });

  it.each([['first-responder'], ['designated'], ['consensus'], ['local-only']])(
    'accepts the %s permissionStrategy literal',
    (literal) => {
      expect(validatePolicyConfig({ permissionStrategy: literal })).toEqual({
        permissionPolicy: literal,
        permissionConsensusQuorum: undefined,
      });
    },
  );

  it('throws InvalidPolicyConfigError for an unknown permissionStrategy', () => {
    expect(() => validatePolicyConfig({ permissionStrategy: 'bogus' })).toThrow(
      InvalidPolicyConfigError,
    );
    expect(() => validatePolicyConfig({ permissionStrategy: 'bogus' })).toThrow(
      /invalid policy.permissionStrategy/,
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'throws InvalidPolicyConfigError for non-positive-integer consensusQuorum (%s)',
    (badValue) => {
      expect(() =>
        validatePolicyConfig({
          permissionStrategy: 'consensus',
          consensusQuorum: badValue,
        }),
      ).toThrow(InvalidPolicyConfigError);
    },
  );

  it('accepts a positive-integer consensusQuorum with consensus strategy', () => {
    expect(
      validatePolicyConfig({
        permissionStrategy: 'consensus',
        consensusQuorum: 3,
      }),
    ).toEqual({
      permissionPolicy: 'consensus',
      permissionConsensusQuorum: 3,
    });
  });

  it('warns AND drops consensusQuorum when strategy is not consensus', () => {
    // Public contract now
    // matches the warning text: when the operator sets
    // consensusQuorum alongside a non-consensus strategy, the
    // override is dropped (returned as undefined) so the
    // BridgeOptions surface stays consistent with what the warning
    // tells them. Pre-fix the function still propagated the value;
    // the downstream mediator ignored it but the function-level
    // contract contradicted itself.
    const warnings: string[] = [];
    const onWarning = vi.fn((m: string) => warnings.push(m));
    const result = validatePolicyConfig(
      {
        permissionStrategy: 'designated',
        consensusQuorum: 2,
      },
      onWarning,
    );
    expect(result).toEqual({
      permissionPolicy: 'designated',
      permissionConsensusQuorum: undefined,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('consensusQuorum is set');
    expect(warnings[0]).toContain('not "consensus"');
  });

  it('does not warn when consensusQuorum is set with consensus strategy', () => {
    const onWarning = vi.fn();
    validatePolicyConfig(
      { permissionStrategy: 'consensus', consensusQuorum: 2 },
      onWarning,
    );
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('error messages name the field that failed (operator-debugging signal)', () => {
    expect(() => validatePolicyConfig({ permissionStrategy: 'oops' })).toThrow(
      /permissionStrategy/,
    );
    expect(() => validatePolicyConfig({ consensusQuorum: 0 })).toThrow(
      /consensusQuorum/,
    );
  });
});

/**
 * Integration test: verify daemon logger is initialized and written to
 * during `runO1CodeServe` boot + shutdown. Uses a fake bridge to avoid
 * spawning real `o1-code --acp` child processes.
 */
describe('runO1CodeServe daemon logger wiring', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates a daemon log file at boot and flushes on shutdown', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-dl-')));
    const workspace = tmpDir;
    const debugDir = path.join(tmpDir, 'debug');

    // Minimal fake bridge satisfying the shape runO1CodeServe expects.
    const fakeBridge: HttpAcpBridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
    } as unknown as HttpAcpBridge;

    // Point daemon logger at our temp debug dir
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    const originalScope = process.env['O1CODE_MEMORY_PROJECT_SCOPE'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    delete process.env['O1CODE_MEMORY_PROJECT_SCOPE'];

    try {
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace,
          maxSessions: 1,
        },
        { bridge: fakeBridge },
      );

      // Daemon log directory should exist
      const daemonDir = path.join(debugDir, 'daemon');
      expect(fs.existsSync(daemonDir)).toBe(true);

      // Find the stable daemon log file.
      const logFiles = fs
        .readdirSync(daemonDir)
        .filter((f) => f.endsWith('.log'));
      expect(logFiles).toContain('daemon.log');

      const logContent = fs.readFileSync(
        path.join(daemonDir, 'daemon.log'),
        'utf8',
      );
      // Should contain the "daemon started" boot line
      expect(logContent).toContain('daemon started');
      expect(logContent).toContain(`pid=${process.pid}`);
      expect(logContent).toContain(
        `workspace=${fs.realpathSync.native(workspace)}`,
      );
      expect(logContent).toContain('project memory scope resolved');
      expect(logContent).toContain('projectMemoryScope=workspace');
      expect(logContent).toContain('projectMemoryScopeSource=default');
      expect(logContent).toContain('projectMemoryScopeRaw=workspace');

      await Promise.all(
        Array.from({ length: 70 }, (_, index) =>
          fetch(`${handle.url}/missing-${index}`),
        ),
      );

      // Close the handle (graceful shutdown)
      await handle.close();

      // close() is intentionally bounded, so the file finalizer may still be
      // draining when it returns under a slow filesystem.
      const logPath = path.join(daemonDir, 'daemon.log');
      let finalContent = '';
      await vi.waitFor(
        () => {
          finalContent = fs.readFileSync(logPath, 'utf8');
          expect(finalContent).toContain('access logs suppressed');
          expect(finalContent).toContain('daemon stopped');
        },
        { timeout: 7_000, interval: 50 },
      );
      expect(finalContent).toContain('daemon started');
      const suppressedIndex = finalContent.indexOf('access logs suppressed');
      const stoppedIndex = finalContent.indexOf('daemon stopped');
      expect(suppressedIndex).toBeGreaterThanOrEqual(0);
      expect(stoppedIndex).toBeGreaterThan(suppressedIndex);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
      if (originalScope === undefined) {
        delete process.env['O1CODE_MEMORY_PROJECT_SCOPE'];
      } else {
        process.env['O1CODE_MEMORY_PROJECT_SCOPE'] = originalScope;
      }
    }
  }, 10_000);
});

describe('runO1CodeServe telemetry validation', () => {
  let tmpDir: string;
  const originalSensitiveSpanAttributeMaxLengthEnv =
    process.env['O1CODE_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH'];

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSensitiveSpanAttributeMaxLengthEnv === undefined) {
      delete process.env[
        'O1CODE_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH'
      ];
    } else {
      process.env['O1CODE_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH'] =
        originalSensitiveSpanAttributeMaxLengthEnv;
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('wraps invalid daemon telemetry configuration as FatalConfigError', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tv-')));
    process.env['O1CODE_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH'] = '';

    const run = runO1CodeServe({
      port: 0,
      hostname: '127.0.0.1',
      mode: 'http-bridge',
      workspace: tmpDir,
      maxSessions: 1,
    });

    await expect(run).rejects.toThrow(o1codeCore.FatalConfigError);
    await expect(run).rejects.toThrow(/Invalid telemetry configuration:/);
  });

  it('accepts multiple explicit workspace inputs and advertises workspaces', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const shutdownResolvers: Array<() => void> = [];
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => {
        const bridge = makeRuntimeBridge();
        bridge.shutdown = vi.fn(
          () =>
            new Promise<void>((resolve) => {
              shutdownResolvers.push(resolve);
            }),
        );
        return bridge;
      });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        sessionRestoreTimeoutMs: 90_000,
        serveWebShell: false,
      },
      {
        preheatBridge: false,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    let closing: Promise<void> | undefined;
    try {
      const res = await fetch(`${handle.url}/capabilities`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        workspaceCwd: string;
        features: string[];
        workspaces: Array<{
          cwd: string;
          primary: boolean;
          removable?: boolean;
        }>;
        limits: {
          maxTotalSessions: number | null;
          sessionRestoreTimeoutMs: number;
        };
      };
      expect(body.workspaceCwd).toBe(canonicalizeWorkspace(primary));
      expect(body.features).toContain('multi_workspace_sessions');
      expect(body.features).toContain('workspace_runtime_removal');
      expect(body.features).toContain('scheduled_task_session_reuse');
      expect(body.limits.maxTotalSessions).toBe(800);
      expect(body.limits.sessionRestoreTimeoutMs).toBe(90_000);
      expect(body.workspaces).toEqual([
        expect.objectContaining({
          cwd: canonicalizeWorkspace(primary),
          primary: true,
          removable: false,
        }),
        expect.objectContaining({
          cwd: canonicalizeWorkspace(secondary),
          primary: false,
          removable: false,
        }),
      ]);

      for (const [
        index,
        [bridgeOptions],
      ] of createBridge.mock.calls.entries()) {
        expect(bridgeOptions.onCreateCurrentSessionScheduledTask).toBeTypeOf(
          'function',
        );
        const target = path.join(
          tmpDir,
          `static-runtime-external-${index}.txt`,
        );
        await bridgeOptions.fileSystem!.writeText({
          path: target,
          content: `runtime-${index}`,
          sessionId: `session-static-${index}`,
          _meta: {
            'o1-code/tool-write-origin': {
              version: 1,
              source: 'write_file',
            },
          },
        });
        expect(fs.readFileSync(target, 'utf8')).toBe(`runtime-${index}`);
      }

      closing = handle.close();
      await vi.waitFor(() => expect(shutdownResolvers).toHaveLength(2));
    } finally {
      closing ??= handle.close();
      await vi.waitFor(() => expect(shutdownResolvers).toHaveLength(2));
      for (const resolve of shutdownResolvers) resolve();
      await closing;
    }
    expect(createBridge).toHaveBeenCalledTimes(2);
    const primaryEpochSource = createBridge.mock.calls.find(
      ([options]) => options.boundWorkspace === canonicalizeWorkspace(primary),
    )?.[0].runtimeEpochSource;
    const secondaryEpochSource = createBridge.mock.calls.find(
      ([options]) =>
        options.boundWorkspace === canonicalizeWorkspace(secondary),
    )?.[0].runtimeEpochSource;
    expect(primaryEpochSource).toBeDefined();
    expect(secondaryEpochSource).toBeDefined();
    expect(primaryEpochSource).not.toBe(secondaryEpochSource);
    const primaryMcpAuthenticationAdmission = createBridge.mock.calls.find(
      ([options]) => options.boundWorkspace === canonicalizeWorkspace(primary),
    )?.[0].acquireMcpAuthentication;
    const secondaryMcpAuthenticationAdmission = createBridge.mock.calls.find(
      ([options]) =>
        options.boundWorkspace === canonicalizeWorkspace(secondary),
    )?.[0].acquireMcpAuthentication;
    expect(primaryMcpAuthenticationAdmission).toBeDefined();
    expect(secondaryMcpAuthenticationAdmission).toBe(
      primaryMcpAuthenticationAdmission,
    );
    const releaseAuthentication = primaryMcpAuthenticationAdmission!(
      primary,
      'ticketing',
    );
    expect(releaseAuthentication).toBeTypeOf('function');
    expect(secondaryMcpAuthenticationAdmission!(secondary, 'wiki')).toBe(
      undefined,
    );
    releaseAuthentication!();
    const releaseSecondaryAuthentication = secondaryMcpAuthenticationAdmission!(
      secondary,
      'wiki',
    );
    expect(releaseSecondaryAuthentication).toBeTypeOf('function');
    releaseSecondaryAuthentication!();
    for (const [options] of createBridge.mock.calls) {
      expect(options).toMatchObject({
        delegateReadTextFileToClient: false,
        sessionRestoreTimeoutMs: 90_000,
      });
    }
    for (const result of createBridge.mock.results) {
      expect(result.value.shutdown).toHaveBeenCalledWith({
        reason: 'daemon_shutdown',
      });
    }
  });

  it('drains every lifecycle runtime before close yields', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-drain-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const primaryBridge = makeLifecycleRuntimeBridge();
    const secondaryBridge = makeLifecycleRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        primaryBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      )
      .mockReturnValueOnce(
        secondaryBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );
    let workspaceRegistry: WorkspaceRegistry | undefined;
    const originalCreateServeApp = serverModule.createServeApp;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      workspaceRegistry = args[2]?.workspaceRegistry;
      return originalCreateServeApp(...args);
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        preheatBridge: false,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    let closing: Promise<void> | undefined;
    try {
      expect(workspaceRegistry?.list()).toHaveLength(2);

      closing = handle.close();

      const runtimes = workspaceRegistry!.list();
      expect(runtimes.map((runtime) => runtime.runtimeCoordinator)).toEqual([
        expect.anything(),
        expect.anything(),
      ]);
      const ensureAttempts = runtimes.map((runtime) =>
        runtime.runtimeCoordinator!.ensure(),
      );
      expect(primaryBridge.preheat).not.toHaveBeenCalled();
      expect(secondaryBridge.preheat).not.toHaveBeenCalled();
      await Promise.all(
        ensureAttempts.map((attempt) =>
          expect(attempt).rejects.toMatchObject({
            code: 'workspace_draining',
          }),
        ),
      );
      await closing;
    } finally {
      await (closing ?? handle.close());
    }
  });

  it('keeps external built-in writes disabled for an injected primary filesystem factory', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-injected-fs-')),
    );
    const workspace = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspace);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => makeRuntimeBridge());
    const boundaryError = Object.assign(new Error('outside workspace'), {
      kind: 'path_outside_workspace',
    });
    const writeSameHostToolText = vi.fn(async () => undefined);
    const fsFactory = {
      assertCanWrite: vi.fn(),
      writeSameHostToolText,
      forRequest: () =>
        ({
          resolve: vi.fn(async () => {
            throw boundaryError;
          }),
        }) as never,
    } satisfies WorkspaceFileSystemFactory;

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        serveWebShell: false,
      },
      {
        preheatBridge: false,
        trustedWorkspace: true,
        fsFactory,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    try {
      await expect(
        createBridge.mock.calls[0]?.[0].fileSystem!.writeText({
          path: path.join(tmpDir, 'outside.txt'),
          content: 'must-not-write',
          sessionId: 'session-injected-primary',
          _meta: {
            'o1-code/tool-write-origin': {
              version: 1,
              source: 'write_file',
            },
          },
        }),
      ).rejects.toBe(boundaryError);
      expect(writeSameHostToolText).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('invalidates primary voice capabilities when its workspace service publishes settings changes', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-voice-capability-')),
    );
    const workspace = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspace);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() =>
      makeRuntimeBridge(),
    );
    const originalCreateWorkspaceService =
      workspaceServiceRuntime.createDaemonWorkspaceService;
    let publishWorkspaceEvent:
      | Parameters<
          typeof workspaceServiceRuntime.createDaemonWorkspaceService
        >[0]['publishWorkspaceEvent']
      | undefined;
    vi.spyOn(
      workspaceServiceRuntime,
      'createDaemonWorkspaceService',
    ).mockImplementation((deps) => {
      if (deps.boundWorkspace === canonicalizeWorkspace(workspace)) {
        publishWorkspaceEvent = deps.publishWorkspaceEvent;
      }
      return originalCreateWorkspaceService(deps);
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace,
        serveWebShell: false,
      },
      {
        preheatBridge: false,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    try {
      const before = (await (
        await fetch(`${handle.url}/capabilities`)
      ).json()) as { features: string[] };
      expect(before.features).not.toContain('workspace_voice_transcription');

      fs.mkdirSync(path.join(workspace, '.o1-code'));
      fs.writeFileSync(
        path.join(workspace, '.o1-code', 'settings.json'),
        JSON.stringify({
          modelProviders: {
            openai: [
              {
                id: 'qwen3-asr-flash',
                baseUrl: 'http://127.0.0.1:65535/v1',
              },
            ],
          },
        }),
        'utf8',
      );
      expect(publishWorkspaceEvent).toBeTypeOf('function');
      publishWorkspaceEvent?.({ type: 'settings_changed', data: {} });

      const after = (await (
        await fetch(`${handle.url}/capabilities`)
      ).json()) as { features: string[] };
      expect(after.features).toContain('workspace_voice_transcription');
    } finally {
      await handle.close();
    }
  });

  it.each(['admit', 'enforce'] as const)('hot-add (%s)', async (mode) => {
    mockCreateSpawnChannelFactoryOptions.length = 0;
    const reclaim = vi.fn();
    const originalCreateServeApp = serverModule.createServeApp;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      const app = originalCreateServeApp(...args);
      expect(app.locals['reclaimIdleAcp']).toBeTypeOf('function');
      app.locals['reclaimIdleAcp'] = reclaim;
      return app;
    });
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-hot-remove-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const secondaryCwd = canonicalizeWorkspace(secondary);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockImplementation(
      (workspace) =>
        ({
          merged:
            typeof workspace === 'string' &&
            canonicalizeWorkspace(workspace) === secondaryCwd
              ? {
                  policy: {
                    permissionStrategy: 'consensus',
                    consensusQuorum: 2,
                  },
                }
              : {},
        }) as ReturnType<typeof settingsRuntime.loadSettings>,
    );
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => makeRuntimeBridge());
    const removeByIds = vi.fn().mockResolvedValue(1);
    const store = {
      read: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        primaryWorkspace: canonicalizeWorkspace(primary),
        workspaces: [],
      }),
      add: vi.fn().mockResolvedValue(true),
      removeByIds,
    } as unknown as WorkspaceRegistrationStore;
    // The growth-parity assertions below derive the budget from host
    // memory; pin the figure so a small or cgroup-constrained runner
    // cannot flip this test red.
    mockTotalMemBytes.value = 8 * 1024 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        childHeapMode: mode,
        workspace: primary,
        token: 'hot-remove-token',
        sessionRestoreTimeoutMs: 90_000,
        serveWebShell: false,
      },
      {
        preheatBridge: false,
        bootSettings: { policy: { permissionStrategy: 'local-only' } },
        workspaceRegistrationStore: store,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    const headers = {
      Authorization: 'Bearer hot-remove-token',
      'Content-Type': 'application/json',
    };

    try {
      // Shift the host-memory pin between the two derivation points: the
      // boot bridge derived its pool from the 8 GiB pin above. A dynamic
      // attach that RE-DERIVED the budget would now see 16 GiB and build a
      // different pool, failing the parity assertion below; the correct
      // boot-closure implementation never re-reads host memory.
      mockTotalMemBytes.value = 16 * 1024 * 1024 * 1024;
      const added = await fetch(`${handle.url}/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cwd: secondary, persist: true }),
      });
      expect(added.status).toBe(201);
      expect(mockCreateSpawnChannelFactoryOptions).toHaveLength(2);
      const signal = new AbortController().signal;
      for (const [index, cwd] of [primary, secondary].entries()) {
        const callback = mockCreateSpawnChannelFactoryOptions[index][
          'reclaimIdleChild'
        ] as (signal?: AbortSignal) => ReturnType<IdleAcpReclaimer>;
        expect(callback).toBeTypeOf('function');
        await callback(signal);
        expect(reclaim).toHaveBeenNthCalledWith(
          index + 1,
          hashDaemonWorkspace(canonicalizeWorkspace(cwd)),
          signal,
        );
      }
      const initialFactory = mockCreateSpawnChannelFactoryOptions[0];
      expect(initialFactory['processRegistry']).toBeDefined();
      const policy = initialFactory['childHeapPolicy'] as ChildHeapPolicy;
      expect(policy.snapshot().mode).toBe(mode);
      for (const options of mockCreateSpawnChannelFactoryOptions) {
        expect(options['processRegistry']).toBe(
          initialFactory['processRegistry'],
        );
        expect(options['childHeapPolicy']).toBe(policy);
        expect(options['pipeLimits']).toEqual({
          maxFrameBytes: 64 * 1024 * 1024,
          maxQueuedMessages: 256,
          maxQueuedBytes: 64 * 1024 * 1024,
        });
      }
      expect(
        createBridge.mock.calls[0]?.[0].onCreateCurrentSessionScheduledTask,
      ).toBeTypeOf('function');
      expect(
        createBridge.mock.calls[1]?.[0].onCreateCurrentSessionScheduledTask,
      ).toBeTypeOf('function');
      expect(createBridge.mock.calls[1]?.[0]).toMatchObject({
        permissionPolicy: 'local-only',
        sessionRestoreTimeoutMs: 90_000,
      });
      // The dynamically attached workspace's bridge must carry the same
      // adaptive-growth pool as the boot bridge — the budget here is
      // host-derived, so assert parity, not a fixed figure.
      expect(createBridge.mock.calls[1]?.[0].journalGrowthPoolBytes).toEqual(
        expect.any(Number),
      );
      expect(createBridge.mock.calls[1]?.[0].journalGrowthPoolBytes).toBe(
        createBridge.mock.calls[0]?.[0].journalGrowthPoolBytes,
      );
      // The dynamically attached workspace must share the ONE aggregate
      // view and registrar, not a fresh per-runtime copy. Assert the
      // hooks exist first: `undefined === undefined` would pass the
      // identity checks if a regression unwired the pool from BOTH
      // bridges at once.
      expect(
        createBridge.mock.calls[0]?.[0].journalGrowthSessionLimits,
      ).toBeTypeOf('function');
      expect(createBridge.mock.calls[1]?.[0].journalGrowthSessionLimits).toBe(
        createBridge.mock.calls[0]?.[0].journalGrowthSessionLimits,
      );
      expect(
        createBridge.mock.calls[0]?.[0].registerJournalGrowthSessionLimits,
      ).toBeTypeOf('function');
      expect(
        createBridge.mock.calls[1]?.[0].registerJournalGrowthSessionLimits,
      ).toBe(
        createBridge.mock.calls[0]?.[0].registerJournalGrowthSessionLimits,
      );
      expect(createBridge.mock.calls[1]?.[0]).not.toHaveProperty(
        'permissionConsensusQuorum',
      );
      const firstDynamicEpochSource =
        createBridge.mock.calls[1]?.[0].runtimeEpochSource;
      expect(firstDynamicEpochSource?.allocate()).toBe(1);
      const firstDynamicFileSystem = createBridge.mock.calls[1]?.[0].fileSystem;
      const firstDynamicTarget = path.join(
        tmpDir,
        'dynamic-runtime-external.txt',
      );
      await firstDynamicFileSystem!.writeText({
        path: firstDynamicTarget,
        content: 'first-generation',
        sessionId: 'session-dynamic-first',
        _meta: {
          'o1-code/tool-write-origin': {
            version: 1,
            source: 'write_file',
          },
        },
      });
      expect(fs.readFileSync(firstDynamicTarget, 'utf8')).toBe(
        'first-generation',
      );

      const before = (await (
        await fetch(`${handle.url}/capabilities`, { headers })
      ).json()) as {
        features: string[];
        workspaces: Array<{
          id: string;
          cwd: string;
          removable?: boolean;
        }>;
      };
      expect(before.features).toContain('workspace_runtime_removal');
      const removable = before.workspaces.find(
        (workspace) => workspace.cwd === canonicalizeWorkspace(secondary),
      );
      expect(removable).toMatchObject({ removable: true });

      const removed = await fetch(
        `${handle.url}/workspaces/${encodeURIComponent(removable!.id)}`,
        {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ force: true }),
        },
      );
      expect(removed.status).toBe(200);
      await expect(removed.json()).resolves.toMatchObject({
        removed: true,
        workspaceId: removable!.id,
        persistedRegistrationRemoved: true,
      });
      expect(removeByIds).toHaveBeenCalledWith(
        expect.arrayContaining([
          workspaceRegistrationId(canonicalizeWorkspace(secondary)),
        ]),
      );
      const dynamicBridge = createBridge.mock.results[1]?.value;
      expect(dynamicBridge?.shutdown).toHaveBeenCalledWith({
        reason: 'workspace_removed',
      });
      await expect(
        firstDynamicFileSystem!.writeText({
          path: path.join(tmpDir, 'closed-dynamic-generation.txt'),
          content: 'must-not-write',
          sessionId: 'session-dynamic-closed',
          _meta: {
            'o1-code/tool-write-origin': {
              version: 1,
              source: 'write_file',
            },
          },
        }),
      ).rejects.toMatchObject({ code: 'workspace_generation_closed' });

      const afterResponse = await fetch(`${handle.url}/capabilities`, {
        headers,
      });
      expect(afterResponse.status).toBe(200);
      const after = (await afterResponse.json()) as {
        workspaces?: Array<{ id: string }>;
      };
      expect(
        (after.workspaces ?? []).some(
          (workspace) => workspace.id === removable!.id,
        ),
      ).toBe(false);

      const readded = await fetch(`${handle.url}/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cwd: secondary, persist: true }),
      });
      expect(readded.status).toBe(201);
      expect(createBridge).toHaveBeenCalledTimes(3);
      expect(createBridge.mock.calls[2]?.[0].runtimeEpochSource).toBe(
        firstDynamicEpochSource,
      );
      expect(firstDynamicEpochSource?.allocate()).toBe(2);
      const secondDynamicTarget = path.join(
        tmpDir,
        'dynamic-runtime-readded.txt',
      );
      await createBridge.mock.calls[2]?.[0].fileSystem!.writeText({
        path: secondDynamicTarget,
        content: 'second-generation',
        sessionId: 'session-dynamic-second',
        _meta: {
          'o1-code/tool-write-origin': {
            version: 1,
            source: 'write_file',
          },
        },
      });
      expect(fs.readFileSync(secondDynamicTarget, 'utf8')).toBe(
        'second-generation',
      );
      for (const [options] of createBridge.mock.calls) {
        expect(options).toMatchObject({
          delegateReadTextFileToClient: false,
          sessionRestoreTimeoutMs: 90_000,
        });
      }
      let releaseRemoval!: (count: number) => void;
      removeByIds.mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            releaseRemoval = resolve;
          }),
      );
      const pendingRemoval = fetch(
        `${handle.url}/workspaces/${encodeURIComponent(removable!.id)}`,
        {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ force: true }),
        },
      );
      await vi.waitFor(() => expect(removeByIds).toHaveBeenCalledTimes(2));
      let closeSettled = false;
      const closing = handle.close().then(() => {
        closeSettled = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(closeSettled).toBe(false);

      releaseRemoval(1);
      expect((await pendingRemoval).status).toBe(200);
      await closing;
      expect(closeSettled).toBe(true);
    } finally {
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });

  it('kills a half-built dynamic bridge when async construction cleanup fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-failure-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);

    const primaryBridge = makeRuntimeBridge();
    const failedBridge = makeRuntimeBridge();
    vi.mocked(failedBridge.shutdown).mockRejectedValue(
      new Error('async cleanup failed'),
    );
    vi.spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        primaryBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      )
      .mockReturnValueOnce(
        failedBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );
    const originalCreateWorkspaceService =
      workspaceServiceRuntime.createDaemonWorkspaceService;
    const createWorkspaceService = vi.spyOn(
      workspaceServiceRuntime,
      'createDaemonWorkspaceService',
    );
    createWorkspaceService
      .mockImplementationOnce(originalCreateWorkspaceService)
      .mockImplementationOnce(() => {
        throw new Error('workspace service construction failed');
      });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: primary,
        token: 'runtime-failure-token',
        serveWebShell: false,
      },
      {
        preheatBridge: false,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );

    try {
      const response = await fetch(`${handle.url}/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer runtime-failure-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cwd: secondary }),
      });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        code: 'runtime_creation_failed',
      });
      expect(failedBridge.shutdown).toHaveBeenCalledWith();
      expect(failedBridge.killAllSync).toHaveBeenCalledOnce();
      expect(primaryBridge.shutdown).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it.each(['admit', 'enforce'] as const)('shared policy (%s)', async (mode) => {
    mockCreateSpawnChannelFactoryOptions.length = 0;
    mockTotalMemBytes.value = 8 * 1024 * 1024 * 1024;
    vi.spyOn(process, 'constrainedMemory').mockReturnValue(0);
    const reclaim = vi.fn();
    const originalCreateServeApp = serverModule.createServeApp;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      const app = originalCreateServeApp(...args);
      expect(app.locals['reclaimIdleAcp']).toBeTypeOf('function');
      app.locals['reclaimIdleAcp'] = reclaim;
      return app;
    });
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const secondaryCwd = canonicalizeWorkspace(secondary);
    const primaryBridge = makeRuntimeBridge();
    const secondaryBridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        primaryBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      )
      .mockReturnValueOnce(
        secondaryBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );
    const resolveBridgeFsFactory = vi.spyOn(
      serverModule,
      'resolveBridgeFsFactory',
    );
    const createWorkspaceService = vi.spyOn(
      workspaceServiceRuntime,
      'createDaemonWorkspaceService',
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockImplementation(
      (workspace) => {
        const workspaceCwd =
          typeof workspace === 'string' ? canonicalizeWorkspace(workspace) : '';
        return {
          merged:
            workspaceCwd === secondaryCwd
              ? {
                  policy: {
                    permissionStrategy: 'consensus',
                    consensusQuorum: 2,
                  },
                  context: {
                    fileName: 'SECONDARY.md',
                    fileFiltering: {
                      customIgnoreFiles: ['.secondaryignore'],
                    },
                  },
                }
              : {},
        } as unknown as ReturnType<typeof settingsRuntime.loadSettings>;
      },
    );
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        childHeapMode: mode,
        workspace: [primary, secondary],
        maxSessions: 1,
        eventRingSize: 1234,
        compactedReplayMaxBytes: 1024,
        channelIdleTimeoutMs: 60_000,
        sessionRestoreTimeoutMs: 90_000,
        sessionPromptSettledCloseGraceMs: 5_000,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        bootSettings: { policy: { permissionStrategy: 'local-only' } },
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    try {
      await handle.runtimeReady;
      expect(createBridge).toHaveBeenCalledTimes(2);
      expect(mockCreateSpawnChannelFactoryOptions).toHaveLength(2);
      const signal = new AbortController().signal;
      for (const [index, cwd] of [primary, secondary].entries()) {
        const callback = mockCreateSpawnChannelFactoryOptions[index][
          'reclaimIdleChild'
        ] as (signal?: AbortSignal) => ReturnType<IdleAcpReclaimer>;
        expect(callback).toBeTypeOf('function');
        await callback(signal);
        expect(reclaim).toHaveBeenNthCalledWith(
          index + 1,
          hashDaemonWorkspace(canonicalizeWorkspace(cwd)),
          signal,
        );
      }
      const initialFactory = mockCreateSpawnChannelFactoryOptions[0];
      expect(initialFactory['processRegistry']).toBeDefined();
      const policy = initialFactory['childHeapPolicy'] as ChildHeapPolicy;
      expect(policy.snapshot().mode).toBe(mode);
      for (const options of mockCreateSpawnChannelFactoryOptions) {
        expect(options['processRegistry']).toBe(
          initialFactory['processRegistry'],
        );
        expect(options['childHeapPolicy']).toBe(policy);
        expect(options['pipeLimits']).toEqual({
          maxFrameBytes: 64 * 1024 * 1024,
          maxQueuedMessages: 256,
          maxQueuedBytes: 64 * 1024 * 1024,
        });
      }
      const status = await (await fetch(`${handle.url}/daemon/status`)).json();
      expect(status.limits.memory).toMatchObject({
        enforced: mode === 'enforce',
        childHeap: {
          mode,
          admissionEnforced: true,
          maxConcurrentChildren: 7,
          perChildCeilingMb: 526,
        },
      });
      expect(createBridge.mock.calls[0]?.[0]).toMatchObject({
        channelIdleTimeoutMs: 60_000,
        compactedReplayMaxBytes: 1024,
        eventRingSize: 1234,
        sessionRestoreTimeoutMs: 90_000,
        sessionPromptSettledCloseGraceMs: 5_000,
        permissionPolicy: 'local-only',
      });
      expect(createBridge.mock.calls[1]?.[0]).toMatchObject({
        channelIdleTimeoutMs: 60_000,
        compactedReplayMaxBytes: 1024,
        eventRingSize: 1234,
        sessionRestoreTimeoutMs: 90_000,
        sessionPromptSettledCloseGraceMs: 5_000,
        permissionPolicy: 'local-only',
      });
      expect(createBridge.mock.calls[1]?.[0]).not.toHaveProperty(
        'permissionConsensusQuorum',
      );
      expect(
        resolveBridgeFsFactory.mock.calls.find(
          ([input]) =>
            input.boundWorkspaces.length === 1 &&
            input.boundWorkspaces[0] === secondaryCwd,
        )?.[0],
      ).toMatchObject({ customIgnoreFiles: ['.secondaryignore'] });
      expect(
        createWorkspaceService.mock.calls.find(
          ([input]) => input.boundWorkspace === secondaryCwd,
        )?.[0],
      ).toMatchObject({ contextFilename: 'SECONDARY.md' });
      // bootSettings above carries no `context.fileName`, so the primary
      // workspace must land on the hard-coded `AGENTS.md` init default
      // (`contextFilenameForInit ?? 'AGENTS.md'`). Without this assertion the
      // fallback literal could be swapped without any test noticing.
      expect(
        createWorkspaceService.mock.calls.find(
          ([input]) => input.boundWorkspace === canonicalizeWorkspace(primary),
        )?.[0],
      ).toMatchObject({ contextFilename: 'AGENTS.md' });
    } finally {
      await handle.close();
    }
  });

  it('accepts an explicit zero channel idle timeout', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-channel-idle-timeout-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });

    const createBridge = vi.spyOn(acpBridge, 'createAcpSessionBridge');
    const handle = await runO1CodeServe({
      port: 0,
      hostname: '127.0.0.1',
      mode: 'http-bridge',
      workspace: tmpDir,
      channelIdleTimeoutMs: 0,
      serveWebShell: false,
    });
    try {
      await handle.runtimeReady;
      expect(createBridge).toHaveBeenCalled();
      expect(createBridge.mock.calls[0]?.[0]).toMatchObject({
        channelIdleTimeoutMs: 0,
      });
    } finally {
      await handle.close();
    }
  });

  it('does not validate policy settings for untrusted secondary workspaces', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const secondaryCwd = canonicalizeWorkspace(secondary);
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        makeRuntimeBridge() as ReturnType<
          typeof acpBridge.createAcpSessionBridge
        >,
      )
      .mockReturnValueOnce(
        makeRuntimeBridge() as ReturnType<
          typeof acpBridge.createAcpSessionBridge
        >,
      );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockImplementation(
      (workspace) => {
        const workspaceCwd =
          typeof workspace === 'string' ? canonicalizeWorkspace(workspace) : '';
        return {
          merged:
            workspaceCwd === secondaryCwd
              ? { policy: { permissionStrategy: 'bogus' } }
              : {},
        } as unknown as ReturnType<typeof settingsRuntime.loadSettings>;
      },
    );
    vi.spyOn(
      trustedFoldersRuntime,
      'getWorkspaceTrustStatus',
    ).mockImplementation(
      (_settings, workspace) =>
        ({
          effective: {
            state:
              canonicalizeWorkspace(workspace) === secondaryCwd
                ? 'untrusted'
                : 'trusted',
          },
        }) as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>,
    );
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        bootSettings: { policy: { permissionStrategy: 'local-only' } },
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    try {
      await expect(handle.runtimeReady).resolves.toBeUndefined();
      expect(createBridge).toHaveBeenCalledTimes(2);
      expect(createBridge.mock.calls[1]?.[0]).toMatchObject({
        permissionPolicy: 'local-only',
      });
    } finally {
      await handle.close();
    }
  });

  it('accepts a single workspace array input as the primary workspace', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    const primary = path.join(tmpDir, 'primary');
    fs.mkdirSync(primary);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary],
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    try {
      const res = await fetch(`${handle.url}/capabilities`);
      expect(res.status).toBe(200);
      expect((await res.json()) as { workspaceCwd: string }).toMatchObject({
        workspaceCwd: canonicalizeWorkspace(primary),
      });
    } finally {
      await handle.close();
    }
  });

  it('uses a daemon-scoped telemetry service instance id', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tv-')));
    const initializeTelemetry = vi
      .spyOn(o1codeCore, 'initializeTelemetry')
      .mockResolvedValue(undefined);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    try {
      const runtimeConfig = initializeTelemetry.mock.calls[0]?.[0] as {
        getSessionId(): string;
        getTelemetryResourceAttributes(): Record<string, unknown>;
      };
      expect(runtimeConfig.getSessionId()).toBe(`daemon:${process.pid}`);
      expect(runtimeConfig.getTelemetryResourceAttributes()).toMatchObject({
        'service.instance.id': `daemon:${process.pid}`,
      });
    } finally {
      await handle.close();
    }
  });

  it('awaits telemetry initialization before daemon metrics', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tm-')));
    const callOrder: string[] = [];
    vi.spyOn(o1codeCore, 'initializeTelemetry').mockImplementation(async () => {
      callOrder.push('telemetry-start');
      await Promise.resolve();
      callOrder.push('telemetry-resolved');
    });
    vi.spyOn(o1codeCore, 'initializeDaemonMetrics').mockImplementation(() => {
      callOrder.push('daemon-metrics');
    });
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: true,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
    try {
      expect(callOrder).toEqual([
        'telemetry-start',
        'telemetry-resolved',
        'daemon-metrics',
      ]);
    } finally {
      await handle.close();
    }
  });
});

/**
 * Boot validation for the embedded `runO1CodeServe` API: a non-finite
 * `permissionResponseTimeoutMs` (e.g. config- or NaN-derived) must fail
 * loud rather than reach the bridge, where it would be treated as the
 * "disabled" sentinel and silently drop the permission deadline.
 */
describe('runO1CodeServe permissionResponseTimeoutMs validation', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects a non-finite permissionResponseTimeoutMs', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-pt-')));
    const fakeBridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
    } as unknown as HttpAcpBridge;

    // Keep the daemon logger inside the temp dir so the boot path before
    // the validation throw doesn't write into the real ~/.o1-code.
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            permissionResponseTimeoutMs: Number.NaN,
          },
          { bridge: fakeBridge },
        ),
      ).rejects.toThrow(/permissionResponseTimeoutMs/);
      const log = fs.readFileSync(
        path.join(tmpDir, 'debug', 'daemon', 'daemon.log'),
        'utf8',
      );
      expect(log).toContain('daemon startup failed');
      expect(log).not.toContain('daemon stopped');
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('preserves the startup error and releases the log lease when stderr fails', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-pt-')));
    const fakeBridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
    } as unknown as HttpAcpBridge;
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        if (String(chunk).includes('daemon startup failed')) {
          throw new Error('stderr unavailable');
        }
        return true;
      });

    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            permissionResponseTimeoutMs: Number.NaN,
          },
          { bridge: fakeBridge },
        ),
      ).rejects.toThrow(/permissionResponseTimeoutMs/);
    } finally {
      stderr.mockRestore();
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }

    expect(
      fs.existsSync(
        path.join(tmpDir, 'debug', 'daemon', '.stable-writer.lock'),
      ),
    ).toBe(false);
  });
});

/**
 * The budget is resolved at boot and reported. Whether it also sizes a child
 * depends on `childHeapMode`, which defaults to `observe` and sizes nothing.
 */
describe('runO1CodeServe memory budget', () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  function makeTmpDir(): string {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-mem-')),
    );
    tmpDirs.push(dir);
    return dir;
  }

  it('reports the resolved budget over HTTP without sizing any child', async () => {
    const dir = makeTmpDir();
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: dir,
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 4096,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      const res = await fetch(`${handle.url}/daemon/status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        limits: {
          memory: {
            enforced: boolean;
            childHeap: {
              mode: string;
              admissionEnforced: boolean;
              maxConcurrentChildren: number;
              perChildCeilingMb: number | null;
              refusals: number;
            } | null;
            configuredBudgetMb: number;
            effectiveBudgetMb: number;
            budgetSource: string;
            availableMemoryMb: number;
            insufficientMemory: boolean;
            modeled: {
              rootReserveMb: number;
              childPoolMb: number;
              minChildHeapMb: number;
              maxChildHeapMb: number;
              legacyChildCeilingMb: number;
            };
          } | null;
        };
        runtime: {
          memory?: {
            registeredWorkspaces: number;
            activeAcpChildren: number;
            childRssCoverage: string;
            children: {
              rssBytes: number;
              sampled: number;
              oldestReadingAgeMs: number | null;
            };
            modeled: {
              recommendedShareAtRegisteredMb: number;
              recommendedShareAtActiveMb: number | null;
            };
            // Restated rather than imported on purpose: this shape is the
            // wire contract, and casting to the internal type would make the
            // assertions below accept whatever that type happens to say.
            pressure: {
              mode: string;
              level: string;
              source: string;
              ratio: number;
              rssBytes: number;
              rssRatio: number;
              availableBytes: number;
              heapUsedBytes: number;
              heapRatio: number;
              heapLimitBytes: number;
            };
          };
        };
      };

      const memory = body.limits.memory;
      expect(memory).not.toBeNull();
      // The child-heap policy reached status on a daemon that really booted.
      // Default is `observe`, so it computed a share and applied nothing —
      // `enforced` has to stay false or the field means "the feature exists"
      // rather than "children are being sized by this".
      expect(memory?.enforced).toBe(false);
      // Pin the key set rather than the values, so an unannounced field added
      // to the wire still fails here. `toEqual` on the whole object was the
      // other option and it does not survive this suite booting a real daemon:
      // both derived figures follow the host's pool, and on a runner with
      // under ~1 GB available the model correctly publishes no partition at
      // all — so a matcher asserting `any(Number)` would fail on exactly the
      // host where the code is doing the right thing.
      expect(Object.keys(memory?.childHeap ?? {}).sort()).toEqual([
        'admissionEnforced',
        'maxConcurrentChildren',
        'mode',
        'perChildCeilingMb',
        'refusals',
      ]);
      expect(memory?.childHeap?.mode).toBe('observe');
      expect(memory?.childHeap?.admissionEnforced).toBe(false);
      expect(memory?.childHeap?.refusals).toBe(0);
      // Whichever branch this host took, the two figures agree with each
      // other. The arithmetic itself is pinned exhaustively in
      // `child-heap-policy.test.ts`; what this asserts is that a real daemon
      // put a self-consistent pair on the wire.
      if (memory?.childHeap?.perChildCeilingMb === null) {
        expect(memory?.childHeap?.maxConcurrentChildren).toBe(0);
      } else {
        // A fixed grant handed to every admitted child must total no more than
        // the pool it partitions. That product is the whole reason the
        // partition is a bound rather than a per-spawn share.
        expect(memory?.childHeap?.maxConcurrentChildren ?? 0).toBeGreaterThan(
          0,
        );
        expect(
          (memory?.childHeap?.maxConcurrentChildren ?? 0) *
            (memory?.childHeap?.perChildCeilingMb ?? 0),
        ).toBeLessThanOrEqual(memory?.modeled.childPoolMb ?? 0);
      }
      expect(memory?.configuredBudgetMb).toBe(4096);
      expect(memory?.budgetSource).toBe('flag');
      // The invariant that motivates separating configured from effective:
      // whatever is reported must be something the machine can back.
      expect(memory?.effectiveBudgetMb).toBeLessThanOrEqual(
        memory?.availableMemoryMb ?? 0,
      );
      // Modeled pools stay non-negative and inside the budget they come from.
      expect(memory?.modeled.rootReserveMb).toBeLessThanOrEqual(
        memory?.effectiveBudgetMb ?? 0,
      );
      expect(memory?.modeled.childPoolMb).toBeGreaterThanOrEqual(0);
      expect(memory?.modeled.childPoolMb).toBeLessThan(
        memory?.effectiveBudgetMb ?? 0,
      );
      expect(memory?.modeled.legacyChildCeilingMb).toBeGreaterThan(0);

      const runtimeMemory = body.runtime.memory;
      expect(runtimeMemory?.registeredWorkspaces).toBe(1);
      // Sampling now covers every live child; it still is not process-tree
      // observation, which `children`'s own docs spell out.
      expect(runtimeMemory?.childRssCoverage).toBe('active_children');
      expect(
        runtimeMemory?.modeled.recommendedShareAtRegisteredMb,
      ).toBeGreaterThan(0);

      // Pressure, from a daemon that actually booted. Every other test for it
      // calls the status builder directly, so nothing else would notice the
      // reading failing to reach a live response.
      const pressure = runtimeMemory?.pressure;
      expect(pressure?.mode).toBe('observe');
      // A real process against a real denominator: assert the invariants
      // rather than a level, which depends on the host running the test.
      expect(pressure?.rssBytes).toBeGreaterThan(0);
      expect(pressure?.heapLimitBytes).toBeGreaterThan(0);
      expect(pressure?.availableBytes).toBe(
        (memory?.availableMemoryMb ?? 0) * 1024 * 1024,
      );
      expect(pressure?.ratio).toBe(
        Math.max(pressure?.rssRatio ?? 0, pressure?.heapRatio ?? 0),
      );
      expect(pressure?.source).not.toBe('unknown');

      // Aggregate child RSS. This test opens no SSE/WS stream, so the
      // sampler's watch gate never fires and nothing is polled — assert the
      // invariants that hold regardless rather than a non-zero sum, which
      // only a streaming client would produce.
      const children = runtimeMemory?.children;
      expect(children?.sampled).toBeLessThanOrEqual(
        runtimeMemory?.activeAcpChildren ?? 0,
      );
      // Nothing sampled must read as nothing summed and no age — never as a
      // measured zero.
      if (children?.sampled === 0) {
        expect(children.rssBytes).toBe(0);
        expect(children.oldestReadingAgeMs).toBeNull();
      } else {
        expect(children?.rssBytes).toBeGreaterThan(0);
      }
    } finally {
      await handle.close();
    }
  }, 30_000);

  it('rejects a budget below the documented minimum', async () => {
    const dir = makeTmpDir();
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = dir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: dir,
            maxSessions: 1,
            memoryBudgetMb: 512,
          },
          {
            bridge: {
              spawnOrAttach: vi.fn(),
              shutdown: vi.fn().mockResolvedValue(undefined),
              killAllSync: vi.fn(),
            } as unknown as HttpAcpBridge,
          },
        ),
      ).rejects.toThrow(/memoryBudgetMb/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) process.env['O1CODE_RUNTIME_DIR'] = origEnv;
    }
  });

  it('writes a stderr line when the budget comes from the flag', async () => {
    const dir = makeTmpDir();
    const stderrWrites: string[] = [];
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: dir,
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 4096,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      expect(stderrWrites.join('')).toContain('memory budget');
    } finally {
      spy.mockRestore();
      await handle.close();
    }
  });

  it('writes no stderr line for a derived budget on a sufficient host', async () => {
    // The gate must stay conditional: a derived budget on a host above the
    // minimum prints nothing. If the gate were unconditional this test fails.
    // Pin host memory so the test is independent of the runner's cgroup.
    mockTotalMemBytes.value = 32_768 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const dir = makeTmpDir();
    const stderrWrites: string[] = [];
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: dir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      expect(stderrWrites.join('')).not.toContain('memory budget');
    } finally {
      spy.mockRestore();
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });

  it('derives an adaptive journal growth pool into every bridge', async () => {
    // 16 GiB host: the derived budget (8192 MB) differs from the flag
    // budget (4096 MB), so the parity assertion below can tell whether the
    // daemon actually consumed --memory-budget-mb when deriving the pool.
    mockTotalMemBytes.value = 16 * 1024 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const dir = makeTmpDir();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(
        () =>
          makeRuntimeBridge() as ReturnType<
            typeof acpBridge.createAcpSessionBridge
          >,
      );
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: dir,
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 4096,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      expect(createBridge).toHaveBeenCalled();
      // The arithmetic is pinned exhaustively in the acp-bridge
      // journalGrowthPoolMb tests; this asserts a real daemon derives the
      // same figure and hands it to every bridge it constructs. Recomputed
      // here (not hardcoded) because `effective` caps at the host's
      // available memory.
      const expectedPoolBytes =
        journalGrowthPoolMb(resolveDaemonMemoryBudget({ budgetMb: 4096 })) *
        1024 *
        1024;
      for (const [options] of createBridge.mock.calls) {
        expect(options.journalGrowthPoolBytes).toBe(expectedPoolBytes);
      }
    } finally {
      createBridge.mockRestore();
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });

  it('disables adaptive journal growth when a journal flag is pinned', async () => {
    // Pin host memory to a usable figure so ONLY the pinned-flag gate can
    // disable growth: on a runner below the minimum usable budget,
    // insufficientMemory would disable it independently and mask a gate
    // regression.
    mockTotalMemBytes.value = 8 * 1024 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const dir = makeTmpDir();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(
        () =>
          makeRuntimeBridge() as ReturnType<
            typeof acpBridge.createAcpSessionBridge
          >,
      );
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: dir,
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 4096,
        maxJournalBytes: 16 * 1024 * 1024,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      expect(createBridge).toHaveBeenCalled();
      for (const [options] of createBridge.mock.calls) {
        expect(options.maxJournalBytes).toBe(16 * 1024 * 1024);
        expect(options).not.toHaveProperty('journalGrowthPoolBytes');
      }
    } finally {
      createBridge.mockRestore();
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });

  it('disables adaptive journal growth when only the entry cap is pinned', async () => {
    // Symmetric to the byte-cap pin: the gate must disable growth on
    // EITHER pinned journal flag, as the docs promise. Host memory is
    // pinned as in the byte-cap case so only this gate can disable
    // growth.
    mockTotalMemBytes.value = 8 * 1024 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const dir = makeTmpDir();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(
        () =>
          makeRuntimeBridge() as ReturnType<
            typeof acpBridge.createAcpSessionBridge
          >,
      );
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: dir,
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 4096,
        maxJournalEvents: 5000,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      expect(createBridge).toHaveBeenCalled();
      for (const [options] of createBridge.mock.calls) {
        expect(options.maxJournalEvents).toBe(5000);
        expect(options).not.toHaveProperty('journalGrowthPoolBytes');
      }
    } finally {
      createBridge.mockRestore();
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });

  it('derives the adaptive journal growth pool into secondary-workspace bridges too', async () => {
    // 16 GiB host: derived budget (8192 MB) != flag budget (4096 MB), as
    // in the single-workspace sibling, so flag consumption is pinned.
    mockTotalMemBytes.value = 16 * 1024 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const root = makeTmpDir();
    const primary = path.join(root, 'primary');
    const secondary = path.join(root, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(
        () =>
          makeRuntimeBridge() as ReturnType<
            typeof acpBridge.createAcpSessionBridge
          >,
      );
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 4096,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      // One bridge per workspace; every one of them must carry the pool,
      // not just the primary.
      expect(createBridge.mock.calls.length).toBeGreaterThanOrEqual(2);
      const expectedPoolBytes =
        journalGrowthPoolMb(resolveDaemonMemoryBudget({ budgetMb: 4096 })) *
        1024 *
        1024;
      for (const [options] of createBridge.mock.calls) {
        expect(options.journalGrowthPoolBytes).toBe(expectedPoolBytes);
      }
    } finally {
      createBridge.mockRestore();
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });
  it('disables adaptive journal growth on a host too small for the budget', async () => {
    // A budget capped below the minimum by host memory leaves no usable
    // pool: no bridge may receive one, so growth stays off entirely.
    mockTotalMemBytes.value = 1_023 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const dir = makeTmpDir();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(
        () =>
          makeRuntimeBridge() as ReturnType<
            typeof acpBridge.createAcpSessionBridge
          >,
      );
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: dir,
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 1024,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      expect(createBridge).toHaveBeenCalled();
      for (const [options] of createBridge.mock.calls) {
        expect(options).not.toHaveProperty('journalGrowthPoolBytes');
        expect(options).not.toHaveProperty('journalGrowthSessionLimits');
        expect(options).not.toHaveProperty(
          'registerJournalGrowthSessionLimits',
        );
      }
    } finally {
      createBridge.mockRestore();
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });

  it('wires every bridge to one shared daemon-wide growth-pool view', async () => {
    mockTotalMemBytes.value = 8 * 1024 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    const root = makeTmpDir();
    const primary = path.join(root, 'primary');
    const secondary = path.join(root, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(
        () =>
          makeRuntimeBridge() as ReturnType<
            typeof acpBridge.createAcpSessionBridge
          >,
      );
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
        memoryBudgetMb: 4096,
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      expect(createBridge.mock.calls.length).toBeGreaterThanOrEqual(2);
      for (const [options] of createBridge.mock.calls) {
        expect(typeof options.journalGrowthSessionLimits).toBe('function');
        expect(typeof options.registerJournalGrowthSessionLimits).toBe(
          'function',
        );
      }
      // Caps registered through one bridge's registrar must be visible
      // through EVERY bridge's view — one aggregate, not a pool per
      // bridge — and the unregister hook must remove them again.
      const views = createBridge.mock.calls.map(
        ([options]) => options.journalGrowthSessionLimits,
      );
      const unregisters = createBridge.mock.calls.map(([options], index) =>
        options.registerJournalGrowthSessionLimits?.(() => [
          { limitBytes: 1000 + index, baselineBytes: 8 * 1024 * 1024 },
        ]),
      );
      for (const view of views) {
        expect(view?.()).toEqual([
          { limitBytes: 1000, baselineBytes: 8 * 1024 * 1024 },
          { limitBytes: 1001, baselineBytes: 8 * 1024 * 1024 },
        ]);
      }
      // Unregister one provider at a time with a view assertion between:
      // a hook that wiped the entire shared set on ANY unregister would
      // still pass a bulk end-state check.
      unregisters[0]?.();
      for (const view of views) {
        expect(view?.()).toEqual([
          { limitBytes: 1001, baselineBytes: 8 * 1024 * 1024 },
        ]);
      }
      unregisters[1]?.();
      for (const view of views) {
        expect(view?.()).toEqual([]);
      }
    } finally {
      createBridge.mockRestore();
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
      await handle.close();
    }
  });
});

describe('runO1CodeServe initializeTimeoutMs validation', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects a non-positive initializeTimeoutMs', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-it-')));
    const fakeBridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
    } as unknown as HttpAcpBridge;

    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            initializeTimeoutMs: 0,
          },
          { bridge: fakeBridge },
        ),
      ).rejects.toThrow(/initializeTimeoutMs/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('rejects a non-finite initializeTimeoutMs', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-it-')));
    const fakeBridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
    } as unknown as HttpAcpBridge;

    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            initializeTimeoutMs: Number.NaN,
          },
          { bridge: fakeBridge },
        ),
      ).rejects.toThrow(/initializeTimeoutMs/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('rejects an initializeTimeoutMs above the JS timer ceiling', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-it-')));
    const fakeBridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
    } as unknown as HttpAcpBridge;

    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            initializeTimeoutMs: 2_147_483_648,
          },
          { bridge: fakeBridge },
        ),
      ).rejects.toThrow(/initializeTimeoutMs/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('propagates a valid initializeTimeoutMs to the bridge options', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-it-')));
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });

    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          initializeTimeoutMs: 30_000,
          serveWebShell: false,
        },
        { resolveOnListen: true },
      );
      try {
        await handle.runtimeReady;
        expect(createBridge.mock.calls[0]?.[0]).toMatchObject({
          initializeTimeoutMs: 30_000,
          // Below the restore default, so the restore budget holds at 60 s.
          sessionRestoreTimeoutMs: 60_000,
        });
      } finally {
        await handle.close();
      }
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });
});

// Long-lived self-signed cert (CN=localhost, SAN IP:127.0.0.1) used only
// to exercise the HTTPS listener path. Not a real secret.
const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDJzCCAg+gAwIBAgIUfuVC8Ulq3HIg+1tf36JrjAa6dr4wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MDYzMDAyMjIxOVoYDzIxMjYw
NjA2MDIyMjE5WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQCnEk5caJsr2ShJwi4bkAMr1/IzzueiUFbnnqs3XpaB
ANxpIZxi8WN1gf8MoAOioZteH51Q2nz8Zb2MVHoDMH3zx4V36VcXUaeR+/wZbFRN
94NlzYCXPnzPH+Mw/vle1PTM/boPON8F4ATGJZkzmGT8+M5CqDCW4isHlpGvbn0T
SdmqnmzihNBdaREVVkGJYa7JSFcgRth52+wTAOIM8e8HC1VTMw1OhXDAus6ro7z+
u5XKGpG+JfsCpimNPYzNOPSkIr/QmxuaMq7kmYwT9J1Gyw9cQQj8vcipyLq6q3Hz
iMhxUXbWp7moi4e6CzxLKyPrWwhuh+3SXqIYshAYRsKNAgMBAAGjbzBtMB0GA1Ud
DgQWBBSM8bvfq77vXg5fsuhYGXsLuKjqxzAfBgNVHSMEGDAWgBSM8bvfq77vXg5f
suhYGXsLuKjqxzAPBgNVHRMBAf8EBTADAQH/MBoGA1UdEQQTMBGHBH8AAAGCCWxv
Y2FsaG9zdDANBgkqhkiG9w0BAQsFAAOCAQEAGUBgaBYEO119e28j61PTijfhw7mV
Q8AxlUjlv+HHx+IAPR+E8w7jiS97oxvFSIkmbV+FAQOWwTE+oNvrL5qSFlG7cI60
wj+Jxwxr+/SShV5Jm7JlynAGxOvOZ1mfxzyGrlm5cg4hoRvcoWAtB/qtiIyFIz/s
fDAdZiFXRoTaZnpyPWA6iydf3mc0ZOastHib+mlFb+aedKz9by/f2Z1CY6RfckEj
20c9Mar85RYkVtVTIWNSwItASmQVBaoXsXK33y4C0P1NmPoYBzyPSXsOlmIZXui5
WYj2mrPe2DL5gCeNUxMhmzgv0bgoYiksHmdyNjRmO5AQlcdjX/7CHg0zEQ==
-----END CERTIFICATE-----
`;

const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCnEk5caJsr2ShJ
wi4bkAMr1/IzzueiUFbnnqs3XpaBANxpIZxi8WN1gf8MoAOioZteH51Q2nz8Zb2M
VHoDMH3zx4V36VcXUaeR+/wZbFRN94NlzYCXPnzPH+Mw/vle1PTM/boPON8F4ATG
JZkzmGT8+M5CqDCW4isHlpGvbn0TSdmqnmzihNBdaREVVkGJYa7JSFcgRth52+wT
AOIM8e8HC1VTMw1OhXDAus6ro7z+u5XKGpG+JfsCpimNPYzNOPSkIr/QmxuaMq7k
mYwT9J1Gyw9cQQj8vcipyLq6q3HziMhxUXbWp7moi4e6CzxLKyPrWwhuh+3SXqIY
shAYRsKNAgMBAAECggEAQW/tG0qphEog+orAznDgnRqOtfYTScLX1w6RlzVIE60H
p3HPs/1B7HOHNyWxZtCPbxVI47NAAwfCbyVjSL6EhqgeQbI2N173GDmvKzH/7y3D
3GraM+L4tZOSw80KVTdpzqSObInk6IMuu4FceRX2cBLvjrIbne1l1yoFU8Yd3SCM
t8J46vMys7Rh4yR0iOl1hFeLYj8KolTdp6uNYTxaHMt363G7/TcJYRqjrLkpBpXJ
dJiP58a3WulvVKVHBjZYVmHLlkvla7LQ9tPRsk0gUQfzNpLzl6oBacrNrRv1F7Oe
keYqt+Kpy9HhZIHt57ahwKmjhjrfIUpyQadF/me0rQKBgQDVbLV6VngGjMSCPQOQ
VZcAMFZ+y1fgaHeVZwuFeRlCEHBDDmw5eWdUdUQNIRckpqf0IlU39aP/cLgjNZ0W
nmxfUwhdgEMam2aHZ/8eqrOl0HTa+F5PWz8NPLKsQ970vPb1XCsoEtDVXEsMqK+s
4h+zjRzy6lLy2cWvYZrDr/KwywKBgQDIZmitKO0MIJOWeqwI3MQvbBXCz9aEIG+3
0ISQreD/7Z/IEcwrMpDD+z1sOj9OUO2GFflECdhtqo416cv3uo8LLABxuzsYOgug
ZPgW9oPKVRLfqc43/n0JMtIvS+Na/7C/nCNwcZZZU91V+VG4+1rexINQybnCRbQw
cBZLcX8nBwKBgQDMdZhl2vChVbnsCwee/l/qjmROk/9bvLjTKCSheaH46Eaj9u03
IlcbUjwfV9QUCJReDYYWVf0GebXuBS64vIyVxbX93SJsGvPeRILjniT8dPd9zvKK
k5+TztJctaiiTWVJKUMu4NevjvtW5UNnHDnCiS1yiYltnbMEkTzyu1yEgQKBgAYk
pYbRX1rk0MFnJ0jqQ5VUkeIz7taEDAiterLYsbIGvcQrT3/vf+KSHBLqQjCLaIyY
tdhxGNJbzRo3/YmtjV8BTU4vOCOI+/xBvB0wF2AndXmnweuTgI+8oBbVE7YhanCl
P6zdvocke/97shailemISqI6XNhovJpThUtwwj4XAoGATwSvzX0VLRpoWwDl30oi
hxyfpb0iCzGik49j/oL+ZB5C8F8AdBpza8eTXJAeAVP7L5nvWffMgvcXs5sGMF7e
ARaOwZHpfsTw4Aq74yAWUKXumVGFXQpZMRj/QWgQEItTYF7rJVARIssv5miDbHvW
1Qm2tDpPnmCd1BedIYWCnHA=
-----END PRIVATE KEY-----
`;

// A self-signed localhost cert/key whose validity window is entirely in the
// past (notAfter = 2020-01-02). Not a real secret — and doubly worthless
// since it's already expired. Used to exercise the boot-time expiry guard.
const TEST_TLS_CERT_EXPIRED = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUW7rZvmhryKZI3pojRCfl3liQSEMwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTIwMDEwMTAwMDAwMFoXDTIwMDEw
MjAwMDAwMFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAzK9z67IJ0e5QGpnGoqCCY4jr401AKE0EuCx1TVkyGFck
2ESCkBPvV+ikMxvLuCOTdrKhgavlIVsnnrPgyND49WaVX6XrftoEU5hApDrWYtIV
TfHYSC1wWdS5yNL+tdqLnfiC8b1FolEdgChF5cBpv9jQ6jwjUwXDojVhoPv5Rf/+
7zWyCg4hoj4N5veluDp1uUJ3xYjT5bqgu54sSR8lDJ8quq48nei60iOy40QQ1z3N
+sDgoAwkkLDOt74iGnZpUOuKt4w0/v96epC12os40FrcYbbe880/trG0aWT4tvnr
t0WFMtLReBSgV/QPkXTZ4HXUVs+7QrqcDWElET2QXQIDAQABo1MwUTAdBgNVHQ4E
FgQUOy4xvXmhCSs0Msfb6mT3WuCjrwQwHwYDVR0jBBgwFoAUOy4xvXmhCSs0Msfb
6mT3WuCjrwQwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAZA0J
BSNEIrsyS/5MyiEmgZlhpPwdqxOfBGFTsHqD0jha30RSEl85iW4XIuwFH1nKoOKQ
Mw3Ns0FaXVJxsrLS7f+4QjzCtTNQ4jEHsnmkm+bLSXK9qA3XLYG7mogdiRE5qz91
9lwZCTBoWnfiG3phz7/Y/F4jM86JxJG4Fm/IQNhgxSGrNhyrRRfXR3rPOIA8pSpz
yN2OMgOQdMXhgE3IM8v7O/76OAYWhybO3zzNtL9d+mRW42B+Q5TCBIKwZXAALlLf
arfULiZOWgeWfNpoEvfbVqn6VXKNny0F8KDoTwoHzpTm0cb+RzfGiSRm0avJr20t
OmPpuyd1dcPjPSJEAQ==
-----END CERTIFICATE-----
`;

const TEST_TLS_KEY_EXPIRED = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDMr3PrsgnR7lAa
mcaioIJjiOvjTUAoTQS4LHVNWTIYVyTYRIKQE+9X6KQzG8u4I5N2sqGBq+UhWyee
s+DI0Pj1ZpVfpet+2gRTmECkOtZi0hVN8dhILXBZ1LnI0v612oud+ILxvUWiUR2A
KEXlwGm/2NDqPCNTBcOiNWGg+/lF//7vNbIKDiGiPg3m96W4OnW5QnfFiNPluqC7
nixJHyUMnyq6rjyd6LrSI7LjRBDXPc36wOCgDCSQsM63viIadmlQ64q3jDT+/3p6
kLXaizjQWtxhtt7zzT+2sbRpZPi2+eu3RYUy0tF4FKBX9A+RdNngddRWz7tCupwN
YSURPZBdAgMBAAECggEAAUw1eG+TB10y7dA+xaYt3XKvSCwjtX2zg3VosvpXSnc2
+RYKG968fDqx288Xzg2PsEd2patQ0xLQX/209aD5ixjA5q/XG+FG+L603jWvSUYa
s3lOjTqYhUFHgkHwMnf1vaUnM2AnUl2gScE3nDrJkNlPjcSe1rZpJJyhB1PBo1N2
w602QMMMsIOHrPeJ/THm6ENUD6xGvGsuDcYZWDP9Fa/Dj1oMW+B8FRV/lF91JHgh
cP+QLk/E4SZGDIOQQ86v1jst6MGzI+iQVYTxfyDgyuCop9DAc1X9hZpG3qOyp6NS
DwBK14fc2r0S9ImL9I/wOBL319s60sC6h8BdOoSWowKBgQDoDP51obLx4kX3YbFD
1huH64Y072LolopXfaNj+Albk1PaNe1oBp1V80wFIT57l0WpibYWOQM6zDWVjZ/5
83utLHOdPe1PzVt4W1Yrk0CcWBiPybGlVVsBrogkF0lCSDGW8rqzD/Cms6AuLB5k
3ypNZKrk976fXjLSvefA9w2QvwKBgQDhz3BFW4oKvksl7PWyc5fvPgh1+V4K622b
hfjcdnamPynkUT13S0ymwOkjNYW6QzCSpgas59X3EHp8JR6Z6CoWdI4Fixz01qLv
R2n41Cc7lKF4WsXoi2IAq489z8GTuQpxhwWGxRs6uWiexY6CResvIgf7fnG63Rrd
p6Ul8kCJ4wKBgQCTdkZyHEqqGd/agBN1B2fBbTOBCisxoRDS3n1pduMDddFQlvqC
I8nyJ8VEcUbSpWPYhDHZV2us/r6ChliGL2uFtfzWjNb04oxhJLHSySXC9NzO6x5f
8aj+nZnYTY/5dgVFZoSsa9HDLdz52oGKGqM4QWO0U5eokOT9NT9ESfst4wKBgG5K
raGSxmfc7kOF67PPteQKvoMw23gl6ZFO7HByBB3LOCDmdUkxJC1GiBjEaZ7CdpUK
NrR5QA6+o7TDRKETvordPwkCG5CSzV5l2SLKLKdzPzLT01pzydhd80bTlM8cUDeH
JXHgEB6stKboA2Up1WdeDdwOtGn62MZuvcE9A7zVAoGAdediZvzAK+yVIPwaNqpy
eeYB4svm8NxzReLF/SCx+j++LvdQlrZMaCfX5M+zPCjXP7WiMWKlCKFm3kCq0NxV
dfOrXxrzy0bEsqEN1JpFwcVI4sUXm/JQSxO6mI5osX1e9qGF3p12aK6fWrPwaj1T
0qHz65jIzFez4M7YrnWF6Ak=
-----END PRIVATE KEY-----
`;

describe('runO1CodeServe TLS (--tls-cert / --tls-key)', () => {
  let tmpDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const minimalBridge = () =>
    ({
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
    }) as unknown as HttpAcpBridge;

  it.each([
    ['only --tls-cert', { tlsCert: '/tmp/c.pem' }],
    ['only --tls-key', { tlsKey: '/tmp/k.pem' }],
  ])('rejects %s without its pair', async (_label, tlsOpts) => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tls-')),
    );
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            ...tlsOpts,
          },
          { bridge: minimalBridge() },
        ),
      ).rejects.toThrow(/--tls-cert and --tls-key must be provided together/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('rejects an unreadable cert file', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tls-')),
    );
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            tlsCert: path.join(tmpDir, 'does-not-exist.pem'),
            tlsKey: path.join(tmpDir, 'also-missing.pem'),
          },
          { bridge: minimalBridge() },
        ),
      ).rejects.toThrow(/Failed to read --tls-cert/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('rejects an unreadable key file', async () => {
    // A readable cert with an unreadable key must hit the key-read catch,
    // not the cert-read one — otherwise the --tls-key error message is
    // never exercised and could regress unnoticed.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tls-')),
    );
    const certPath = path.join(tmpDir, 'cert.pem');
    fs.writeFileSync(certPath, TEST_TLS_CERT);
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            tlsCert: certPath,
            tlsKey: path.join(tmpDir, 'no-key.pem'),
          },
          { bridge: minimalBridge() },
        ),
      ).rejects.toThrow(/Failed to read --tls-key/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('rejects an expired certificate at boot', async () => {
    // A cert past its notAfter must fail loud at boot rather than start a
    // listener that rejects every client handshake while /health stays green.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tls-')),
    );
    const certPath = path.join(tmpDir, 'cert.pem');
    const keyPath = path.join(tmpDir, 'key.pem');
    fs.writeFileSync(certPath, TEST_TLS_CERT_EXPIRED);
    fs.writeFileSync(keyPath, TEST_TLS_KEY_EXPIRED);
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            tlsCert: certPath,
            tlsKey: keyPath,
          },
          { bridge: minimalBridge() },
        ),
      ).rejects.toThrow(/expired on/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('rejects an unparseable certificate at boot', async () => {
    // A readable file whose contents aren't a valid PEM cert must hit the
    // X509Certificate parse catch and surface the framed message rather than
    // a raw OpenSSL string.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tls-')),
    );
    const certPath = path.join(tmpDir, 'cert.pem');
    const keyPath = path.join(tmpDir, 'key.pem');
    fs.writeFileSync(certPath, 'not a real certificate');
    fs.writeFileSync(keyPath, TEST_TLS_KEY);
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            tlsCert: certPath,
            tlsKey: keyPath,
          },
          { bridge: minimalBridge() },
        ),
      ).rejects.toThrow(/is not a valid certificate/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('rejects a cert/key mismatch at boot', async () => {
    // TEST_TLS_CERT and TEST_TLS_KEY_EXPIRED come from different keypairs, so
    // https.createServer's createSecureContext throws a raw OpenSSL
    // key-values-mismatch string. Assert it's wrapped into the actionable
    // "could not be loaded (do they match?)" framing.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tls-')),
    );
    const certPath = path.join(tmpDir, 'cert.pem');
    const keyPath = path.join(tmpDir, 'key.pem');
    fs.writeFileSync(certPath, TEST_TLS_CERT);
    fs.writeFileSync(keyPath, TEST_TLS_KEY_EXPIRED);
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            maxSessions: 1,
            tlsCert: certPath,
            tlsKey: keyPath,
          },
          { bridge: minimalBridge() },
        ),
      ).rejects.toThrow(/could not be loaded/);
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  });

  it('serves over https when both cert and key are valid', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-tls-')),
    );
    const certPath = path.join(tmpDir, 'cert.pem');
    const keyPath = path.join(tmpDir, 'key.pem');
    fs.writeFileSync(certPath, TEST_TLS_CERT);
    fs.writeFileSync(keyPath, TEST_TLS_KEY);

    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockReturnValue(
      new Promise<o1codeCore.ResolvedTelemetrySettings>((resolve) => {
        resolveTelemetry = resolve;
      }),
    );
    const bridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
      isChannelLive: vi.fn().mockReturnValue(true),
    } as unknown as HttpAcpBridge;
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
        tlsCert: certPath,
        tlsKey: keyPath,
      },
      { resolveOnListen: true, runtimeStartupTimeoutMs: 0 },
    );

    try {
      expect(handle.url).toMatch(/^https:\/\//);
      expect(handle.server instanceof https.Server).toBe(true);

      // A successful response over the self-signed listener proves the
      // TLS handshake completed (not just that the URL string says https).
      const statusCode = await new Promise<number>((resolve, reject) => {
        const req = https.get(
          `${handle.url}/health`,
          { rejectUnauthorized: false },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
      });
      expect(typeof statusCode).toBe('number');
    } finally {
      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      await handle.close();
    }
  });
});

describe('runO1CodeServe pre-listen bridge option validation', () => {
  let tmpDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it.each(['admit', 'enforce'] as const)(
    'rejects %s with an injected bridge before listening or preheat',
    async (mode) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-child-mode-')),
      );
      const listen = vi.spyOn(net.Server.prototype, 'listen');
      const bridge = makeRuntimeBridge();
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: tmpDir,
            childHeapMode: mode,
          },
          { bridge },
        ),
      ).rejects.toThrow('cannot be combined with an injected bridge');
      expect(listen).not.toHaveBeenCalled();
      expect(bridge.preheat).not.toHaveBeenCalled();
    },
  );

  it.each(['admit', 'enforce'] as const)(
    'rejects a zero-slot %s partition before listening or creating children',
    async (mode) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-child-zero-')),
      );
      mockTotalMemBytes.value = 768 * 1024 * 1024;
      vi.spyOn(process, 'constrainedMemory').mockReturnValue(0);
      const listen = vi.spyOn(net.Server.prototype, 'listen');
      const createBridge = vi.spyOn(acpBridge, 'createAcpSessionBridge');
      await expect(
        runO1CodeServe({
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          childHeapMode: mode,
          memoryBudgetMb: 1024,
        }),
      ).rejects.toThrow('models at least one child');
      expect(listen).not.toHaveBeenCalled();
      expect(createBridge).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['maxSessions', Number.NaN, /maxSessions/],
    ['maxSessions', -1, /maxSessions/],
    ['maxTotalSessions', Number.NaN, /maxTotalSessions/],
    ['maxTotalSessions', -1, /maxTotalSessions/],
    ['maxTotalSessions', 1.5, /maxTotalSessions/],
    ['eventRingSize', 0, /eventRingSize/],
    ['eventRingSize', 1.5, /eventRingSize/],
    ['eventRingSize', Number.POSITIVE_INFINITY, /eventRingSize/],
    ['compactedReplayMaxBytes', 0, /compactedReplayMaxBytes/],
    ['compactedReplayMaxBytes', 1.5, /compactedReplayMaxBytes/],
    [
      'compactedReplayMaxBytes',
      Number.POSITIVE_INFINITY,
      /compactedReplayMaxBytes/,
    ],
    ['memoryProjectScope', 'unsupported', /memoryProjectScope/],
  ] as const)(
    'rejects invalid %s=%s before printing the listening line',
    async (optionName, value, message) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bridge-opt-')),
      );
      const stdoutWrites: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdoutWrites.push(String(chunk));
        return true;
      });

      await expect(
        runO1CodeServe({
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          [optionName]: value,
        }),
      ).rejects.toThrow(message);
      expect(stdoutWrites.join('')).not.toContain('o1-code serve listening on');
    },
  );

  it.each([
    ['rateLimitPrompt', 0, /rateLimitPrompt/],
    ['rateLimitMutation', -1, /rateLimitMutation/],
    ['rateLimitRead', 1.5, /rateLimitRead/],
    ['rateLimitWindowMs', 999, /rateLimitWindowMs/],
  ] as const)(
    'rejects invalid %s=%s before printing the listening line',
    async (optionName, value, message) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-rate-opt-')),
      );
      const stdoutWrites: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdoutWrites.push(String(chunk));
        return true;
      });

      await expect(
        runO1CodeServe({
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          rateLimit: true,
          [optionName]: value,
        }),
      ).rejects.toThrow(message);
      expect(stdoutWrites.join('')).not.toContain('o1-code serve listening on');
    },
  );

  it('rejects an injected bridge with multiple explicit workspaces before listening', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bridge-opt-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    await expect(
      runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: [primary, secondary],
        },
        { bridge: makeRuntimeBridge() },
      ),
    ).rejects.toThrow(/Injected bridge dependencies/);
    expect(stdoutWrites.join('')).not.toContain('o1-code serve listening on');
  });

  it.each(['root', 'child', 'missing-child', 'alias'] as const)(
    'rejects an explicit Conversations reserved %s before listening',
    async (candidateKind) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-reserved-workspace-')),
      );
      const liveConversationWorkspace = new ConversationWorkspace({
        homeDir: tmpDir,
      });
      fs.mkdirSync(liveConversationWorkspace.rootPath, { recursive: true });
      const child = path.join(liveConversationWorkspace.rootPath, 'session-1');
      fs.mkdirSync(child);
      const missingChild = path.join(
        liveConversationWorkspace.rootPath,
        'missing-session',
      );
      const alias = path.join(tmpDir, 'conversation-alias');
      fs.symlinkSync(
        liveConversationWorkspace.rootPath,
        alias,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const workspace =
        candidateKind === 'root'
          ? liveConversationWorkspace.rootPath
          : candidateKind === 'child'
            ? child
            : candidateKind === 'missing-child'
              ? missingChild
              : alias;
      const stdoutWrites: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdoutWrites.push(String(chunk));
        return true;
      });

      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace,
          },
          { liveConversationWorkspace },
        ),
      ).rejects.toThrow(/reserved for Conversations/);
      expect(stdoutWrites.join('')).not.toContain('o1-code serve listening on');
    },
  );

  it('rejects an unknown embedded external Tool Guard mode before listening', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-guard-opt-')),
    );
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    process.env['O1CODE_EXTERNAL_TOOL_GUARD_TOKEN'] = 'ambient-secret';

    await expect(
      runO1CodeServe({
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        externalToolGuard: {
          mode: 'optional',
        },
      } as unknown as Parameters<typeof runO1CodeServe>[0]),
    ).rejects.toThrow(/externalToolGuard/);
    expect(stdoutWrites.join('')).not.toContain('o1-code serve listening on');
    expect(process.env['O1CODE_EXTERNAL_TOOL_GUARD_TOKEN']).toBeUndefined();
  });

  it('rejects unsafe required provider configuration before listening', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-guard-config-')),
    );
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    await expect(
      runO1CodeServe({
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        externalToolGuard: {
          mode: 'required',
          endpoint: 'https://policy.example.com',
          token: 'secret',
        },
      }),
    ).rejects.toThrow(/loopback/);
    expect(stdoutWrites.join('')).not.toContain('o1-code serve listening on');
  });
});

describe('runO1CodeServe session reaper timeout validation', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function makeFakeBridge(): HttpAcpBridge {
    return {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
    } as unknown as HttpAcpBridge;
  }

  async function runWithReaperOption(
    optionName:
      | 'sessionReapIntervalMs'
      | 'sessionIdleTimeoutMs'
      | 'sessionPromptSettledCloseGraceMs',
    value: number,
  ) {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-rt-')));
    const origEnv = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      return await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          [optionName]: value,
        },
        { bridge: makeFakeBridge() },
      );
    } finally {
      delete process.env['O1CODE_RUNTIME_DIR'];
      if (origEnv !== undefined) {
        process.env['O1CODE_RUNTIME_DIR'] = origEnv;
      }
    }
  }

  it.each([
    ['sessionReapIntervalMs', -1],
    ['sessionReapIntervalMs', 1.5],
    ['sessionReapIntervalMs', Number.NaN],
    ['sessionReapIntervalMs', Number.POSITIVE_INFINITY],
    ['sessionIdleTimeoutMs', -1],
    ['sessionIdleTimeoutMs', 1.5],
    ['sessionIdleTimeoutMs', Number.NaN],
    ['sessionIdleTimeoutMs', Number.POSITIVE_INFINITY],
    ['sessionPromptSettledCloseGraceMs', -1],
    ['sessionPromptSettledCloseGraceMs', 1.5],
    ['sessionPromptSettledCloseGraceMs', Number.NaN],
    ['sessionPromptSettledCloseGraceMs', Number.POSITIVE_INFINITY],
  ] as const)('rejects invalid %s=%s', async (optionName, value) => {
    await expect(runWithReaperOption(optionName, value)).rejects.toThrow(
      optionName,
    );
  });

  it.each([
    ['sessionReapIntervalMs', 0],
    ['sessionIdleTimeoutMs', 0],
    ['sessionPromptSettledCloseGraceMs', 0],
  ] as const)(
    'keeps %s=0 as the disabled sentinel',
    async (optionName, value) => {
      const handle = await runWithReaperOption(optionName, value);
      await handle.close();
    },
  );
});

describe('runO1CodeServe runtime startup failures', () => {
  let tmpDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  async function readBrowserMcpFeatureFlagsForEnv(
    raw: string | undefined,
    origin = 'http://localhost:5173',
  ) {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-fail-')),
    );
    const originalClientMcpOverWs =
      process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
    if (raw === undefined) {
      delete process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
    } else {
      process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'] = raw;
    }
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
      throw new Error('runtime boom');
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
        allowOrigins: [origin],
      },
      { resolveOnListen: true },
    );

    try {
      await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
      const capabilitiesRes = await fetch(`${handle.url}/capabilities`, {
        headers: { Origin: origin },
      });
      expect(capabilitiesRes.status).toBe(200);
      return ((await capabilitiesRes.json()) as { features: string[] })
        .features;
    } finally {
      if (originalClientMcpOverWs === undefined) {
        delete process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
      } else {
        process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'] =
          originalClientMcpOverWs;
      }
      await handle.close();
    }
  }

  it('keeps the primary bridge reference from the reconciled startup generation', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-trust-race-')),
    );
    const bootSnapshot = {
      revision: 'boot-untrusted',
      folderTrustEnabled: true,
      ideTrust: undefined,
      trustedFolders: {},
    } as Awaited<
      ReturnType<typeof trustPolicyRuntime.readDaemonTrustPolicySnapshot>
    >;
    const reconciledSnapshot = {
      revision: 'reconciled-trusted',
      folderTrustEnabled: false,
      ideTrust: undefined,
      trustedFolders: {},
    } as Awaited<
      ReturnType<typeof trustPolicyRuntime.readDaemonTrustPolicySnapshot>
    >;
    vi.spyOn(trustPolicyRuntime, 'readDaemonTrustPolicySnapshot')
      .mockResolvedValueOnce(bootSnapshot)
      .mockResolvedValue(reconciledSnapshot);
    const loadSettings = vi.spyOn(settingsRuntime, 'loadSettings');
    const bootBridge = makeRuntimeBridge();
    const reconciledBridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        bootBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      )
      .mockReturnValueOnce(
        reconciledBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      vi.mocked(bootBridge.preheat).mockClear();
      vi.mocked(reconciledBridge.preheat).mockClear();
      await handle.bridge.preheat();

      expect(bootBridge.shutdown).toHaveBeenCalledTimes(1);
      expect(bootBridge.preheat).not.toHaveBeenCalled();
      expect(reconciledBridge.preheat).toHaveBeenCalledTimes(1);
      expect(loadSettings).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({ workspaceTrusted: true }),
      );
      expect(createBridge).toHaveBeenCalledTimes(2);
      expect(
        createBridge.mock.calls.map(([options]) => options.boundWorkspace),
      ).toEqual([canonicalizeWorkspace(tmpDir), canonicalizeWorkspace(tmpDir)]);
      expect(createBridge.mock.calls[0]?.[0].runtimeEpochSource).toBeDefined();
      expect(createBridge.mock.calls[1]?.[0].runtimeEpochSource).toBe(
        createBridge.mock.calls[0]?.[0].runtimeEpochSource,
      );
    } finally {
      await handle.close();
    }
  });

  it('does not expose the disposed primary bridge after reconciliation blocks', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-trust-blocked-')),
    );
    const trustedSnapshot = {
      revision: 'trusted',
      folderTrustEnabled: false,
      ideTrust: undefined,
      trustedFolders: {},
    } as Awaited<
      ReturnType<typeof trustPolicyRuntime.readDaemonTrustPolicySnapshot>
    >;
    const untrustedSnapshot = {
      revision: 'untrusted',
      folderTrustEnabled: true,
      ideTrust: undefined,
      trustedFolders: {},
    } as Awaited<
      ReturnType<typeof trustPolicyRuntime.readDaemonTrustPolicySnapshot>
    >;
    let currentSnapshot = trustedSnapshot;
    vi.spyOn(
      trustPolicyRuntime,
      'readDaemonTrustPolicySnapshot',
    ).mockImplementation(async () => currentSnapshot);
    const bootBridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        bootBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      )
      .mockImplementationOnce(() => {
        throw new Error('replacement failed');
      });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      vi.mocked(bootBridge.preheat).mockClear();
      currentSnapshot = untrustedSnapshot;
      o1codeCore.ideContextStore.set({
        workspaceState: { isTrusted: false },
      });
      await vi.waitFor(() =>
        expect(bootBridge.shutdown).toHaveBeenCalledTimes(1),
      );

      expect(() => handle.bridge.preheat()).toThrow(
        'Daemon bridge runtime is still starting.',
      );
      expect(bootBridge.preheat).not.toHaveBeenCalled();
    } finally {
      o1codeCore.ideContextStore.clear();
      await handle.close();
    }
  });

  it('disposes ACP routing when runtime containment fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-acp-cleanup-')),
    );
    const trustedSnapshot = {
      revision: 'trusted',
      folderTrustEnabled: false,
      ideTrust: undefined,
      trustedFolders: {},
    } as Awaited<
      ReturnType<typeof trustPolicyRuntime.readDaemonTrustPolicySnapshot>
    >;
    const untrustedSnapshot = {
      revision: 'untrusted',
      folderTrustEnabled: true,
      ideTrust: undefined,
      trustedFolders: {},
    } as Awaited<
      ReturnType<typeof trustPolicyRuntime.readDaemonTrustPolicySnapshot>
    >;
    let currentSnapshot = trustedSnapshot;
    vi.spyOn(
      trustPolicyRuntime,
      'readDaemonTrustPolicySnapshot',
    ).mockImplementation(async () => currentSnapshot);
    const bootBridge = makeRuntimeBridge();
    vi.mocked(bootBridge.shutdown)
      .mockRejectedValueOnce(new Error('shutdown failed'))
      .mockResolvedValue(undefined);
    vi.mocked(bootBridge.killAllSync).mockImplementationOnce(() => {
      throw new Error('kill failed');
    });
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bootBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    let disposeWorkspace:
      | ReturnType<typeof vi.fn<(workspaceId: string) => void>>
      | undefined;
    const originalCreateServeApp = serverModule.createServeApp;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      const app = originalCreateServeApp(...args);
      const acpHandle = app.locals['acpHandle'] as
        | { disposeWorkspace?: (workspaceId: string) => void }
        | undefined;
      if (acpHandle?.disposeWorkspace) {
        disposeWorkspace = vi.fn(acpHandle.disposeWorkspace);
        acpHandle.disposeWorkspace = disposeWorkspace;
      }
      return app;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      expect(disposeWorkspace).toBeDefined();
      currentSnapshot = untrustedSnapshot;
      o1codeCore.ideContextStore.set({
        workspaceState: { isTrusted: false },
      });
      await vi.waitFor(() => expect(disposeWorkspace).toHaveBeenCalledOnce());
    } finally {
      o1codeCore.ideContextStore.clear();
      await handle.close();
    }
  });

  it('rejects the embedded run handle by default when the runtime fails to mount', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-fail-')),
    );
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
      throw new Error('runtime boom');
    });

    await expect(
      runO1CodeServe({
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      }),
    ).rejects.toThrow('runtime boom');
  });

  it('closes the listener before rejecting when resolveOnListen is false and runtime startup fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-fail-close-')),
    );
    const port = await getFreeLoopbackPort();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
      throw new Error('runtime boom');
    });

    await expect(
      runO1CodeServe({
        port,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      }),
    ).rejects.toThrow('runtime boom');

    await expect(
      fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow();
  });

  it.each([
    ['0', false],
    ['false', false],
    ['FALSE', false],
    [' 0 ', false],
    ['1', true],
    ['true', true],
    ['anything', true],
  ] as const)(
    'normalizes browser MCP env flag %j',
    async (raw, shouldEnable) => {
      const features = await readBrowserMcpFeatureFlagsForEnv(raw);

      if (shouldEnable) {
        expect(features).toContain('client_mcp_over_ws');
      } else {
        expect(features).not.toContain('client_mcp_over_ws');
      }
    },
  );

  it('forwards the external tool guard state to the ACP child env', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-child-env-')),
    );
    const originalClientMcpOverWs =
      process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
    delete process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      const bridgeOptions = createBridge.mock.calls[0]?.[0] as
        | {
            childEnvOverrides?: Record<string, string | undefined>;
            externalToolGuard?: unknown;
          }
        | undefined;
      expect(bridgeOptions?.childEnvOverrides).toMatchObject({
        O1CODE_PRIVATE_EXTERNAL_TOOL_GUARD: 'required-v1',
      });
      // No external provider is configured in this test: the child must see
      // the guard plumbing marker but NOT the provider-attached marker.
      expect(bridgeOptions?.childEnvOverrides).toHaveProperty(
        'O1CODE_PRIVATE_EXTERNAL_TOOL_GUARD_PROVIDER',
        undefined,
      );
      // The Conversations provenance marker stays explicitly removed for an
      // ordinary workspace child; only the live-conversation runtime replaces
      // it with the enable value.
      expect(bridgeOptions?.childEnvOverrides).toHaveProperty(
        'O1CODE_PRIVATE_CONVERSATIONS_RUNTIME',
        undefined,
      );
      expect(createBridge.mock.calls.length).toBeGreaterThan(0);
      for (const call of createBridge.mock.calls) {
        const options = call[0] as { externalToolGuard?: unknown };
        expect(options.externalToolGuard).toEqual(expect.any(Function));
      }
      const daemonGuard = bridgeOptions?.externalToolGuard as (
        request: Record<string, unknown>,
      ) => Promise<{ allowed: boolean; reason?: string }>;
      await expect(
        daemonGuard({
          sessionId: 'session-1',
          promptId: 'prompt-1',
          toolCallId: 'call-1',
          toolName: 'run_shell_command',
          arguments: {
            command: `git -C ${path.join(os.tmpdir(), 'outside-repo')} reset --hard`,
          },
          effectiveCwd: tmpDir,
        }),
      ).resolves.toMatchObject({ allowed: false });
    } finally {
      if (originalClientMcpOverWs === undefined) {
        delete process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
      } else {
        process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'] =
          originalClientMcpOverWs;
      }
      await handle.close();
    }
  });

  // The negative side of the provider marker is asserted above. This is the
  // attached side, driven by a real handshake against a loopback provider so
  // the marker, the composed guard and the child env are all exercised.
  it('forwards the provider-attached marker when a real provider handshakes', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-guard-provider-')),
    );
    const provider = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          protocolVersion: number;
          nonce?: string;
        };
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            protocolVersion: body.protocolVersion,
            nonce: body.nonce,
            capabilities: { prepare: true },
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      provider.listen(0, '127.0.0.1', resolve),
    );
    const { port } = provider.address() as import('node:net').AddressInfo;
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
        externalToolGuard: {
          mode: 'required',
          endpoint: `http://127.0.0.1:${port}`,
          token: 'guard-token',
        },
      } as Parameters<typeof runO1CodeServe>[0],
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      const bridgeOptions = createBridge.mock.calls[0]?.[0] as
        | {
            childEnvOverrides?: Record<string, string | undefined>;
            externalToolGuard?: unknown;
          }
        | undefined;
      expect(bridgeOptions?.childEnvOverrides).toMatchObject({
        O1CODE_PRIVATE_EXTERNAL_TOOL_GUARD: 'required-v1',
        O1CODE_PRIVATE_EXTERNAL_TOOL_GUARD_PROVIDER: 'attached-v1',
      });
      expect(bridgeOptions?.externalToolGuard).toEqual(expect.any(Function));
    } finally {
      await handle.close();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    }
  });

  it.each([
    [
      'defaults every runtime to workspace project-memory scope',
      undefined,
      undefined,
      'workspace',
    ],
    [
      'applies memoryProjectScope to every runtime without mutating process.env',
      'workspace',
      'git-root',
      'git-root',
    ],
    [
      'preserves the launch environment scope when the option is omitted',
      'git-root',
      undefined,
      'git-root',
    ],
    [
      'treats a blank launch environment scope as unset',
      '',
      undefined,
      'workspace',
    ],
    [
      'treats a whitespace-only launch environment scope as unset',
      '   ',
      undefined,
      'workspace',
    ],
    [
      'passes an unrecognized launch environment scope through unchanged',
      'workspce',
      undefined,
      'workspce',
    ],
  ] as const)('%s', async (_name, launchScope, optionScope, expectedScope) => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-memory-project-scope-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const originalScope = process.env['O1CODE_MEMORY_PROJECT_SCOPE'];
    if (launchScope === undefined) {
      delete process.env['O1CODE_MEMORY_PROJECT_SCOPE'];
    } else {
      process.env['O1CODE_MEMORY_PROJECT_SCOPE'] = launchScope;
    }
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    vi.spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        makeRuntimeBridge() as ReturnType<
          typeof acpBridge.createAcpSessionBridge
        >,
      )
      .mockReturnValueOnce(
        makeRuntimeBridge() as ReturnType<
          typeof acpBridge.createAcpSessionBridge
        >,
      );
    let workspaceRegistry:
      | import('./workspace-registry.js').WorkspaceRegistry
      | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(
      (_opts, _getPort, deps) => {
        workspaceRegistry = deps?.workspaceRegistry;
        return express();
      },
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        ...(optionScope === undefined
          ? {}
          : { memoryProjectScope: optionScope }),
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      expect(workspaceRegistry?.list()).toHaveLength(2);
      for (const runtime of workspaceRegistry?.list() ?? []) {
        expect(runtime.env.effectiveEnv?.['O1CODE_MEMORY_PROJECT_SCOPE']).toBe(
          expectedScope,
        );
      }
      expect(process.env['O1CODE_MEMORY_PROJECT_SCOPE']).toBe(launchScope);
    } finally {
      if (originalScope === undefined) {
        delete process.env['O1CODE_MEMORY_PROJECT_SCOPE'];
      } else {
        process.env['O1CODE_MEMORY_PROJECT_SCOPE'] = originalScope;
      }
      await handle.close();
    }
  });

  it('rebuilds runtime env from the immutable daemon base after workspace reload', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-env-reload-')),
    );
    const originalRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    delete process.env['O1CODE_RUNTIME_DIR'];
    const originalBase = process.env['O1CODE_TEST_BOOT_BASE'];
    const originalLeak = process.env['O1CODE_TEST_RELOAD_LEAK'];
    const originalRemoved = process.env['O1CODE_TEST_REMOVED_FROM_DOTENV'];
    process.env['O1CODE_TEST_BOOT_BASE'] = 'base';
    process.env['O1CODE_TEST_REMOVED_FROM_DOTENV'] = 'stale';
    delete process.env['O1CODE_TEST_RELOAD_LEAK'];

    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    let runtimeMounted = false;
    let reloadedRuntimeValue = 'reloaded';
    vi.spyOn(settingsRuntime, 'loadSettings').mockImplementation(
      () =>
        ({
          merged: {
            tools: { workflowsEnabled: !runtimeMounted },
            advanced: {
              runtimeOutputDir: runtimeMounted
                ? '.runtime-reloaded'
                : '.runtime-boot',
            },
            env: {
              O1CODE_TEST_RUNTIME_VALUE: runtimeMounted
                ? reloadedRuntimeValue
                : 'boot',
            },
          },
        }) as unknown as ReturnType<typeof settingsRuntime.loadSettings>,
    );
    vi.spyOn(settingsRuntime, 'reloadEnvironment').mockImplementation(() => {
      process.env['O1CODE_TEST_RELOAD_LEAK'] = 'workspace-a';
      delete process.env['O1CODE_TEST_REMOVED_FROM_DOTENV'];
      return {
        updatedKeys: ['O1CODE_TEST_RELOAD_LEAK'],
        removedKeys: ['O1CODE_TEST_REMOVED_FROM_DOTENV'],
      };
    });
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    const buildRuntimeEnvironment = vi.spyOn(
      environmentRuntime,
      'buildRuntimeEnvironment',
    );
    let workspace:
      | {
          reload(ctx: {
            route: string;
            workspaceCwd: string;
          }): Promise<unknown>;
          reloadModelProviders(ctx: {
            route: string;
            workspaceCwd: string;
          }): Promise<unknown>;
        }
      | undefined;
    let primaryRuntimeEnv:
      | {
          effectiveEnv?: NodeJS.ProcessEnv;
        }
      | undefined;
    let primaryRuntime:
      | import('./workspace-registry.js').WorkspaceRuntime
      | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(
      (_opts, _getPort, deps) => {
        runtimeMounted = true;
        workspace = deps?.workspace as typeof workspace;
        primaryRuntimeEnv = deps?.primaryRuntimeEnv as typeof primaryRuntimeEnv;
        primaryRuntime = deps?.workspaceRegistry?.primary;
        return express();
      },
    );

    const bridge = makeRuntimeBridge();

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge,
        bootSettings: {},
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );

    try {
      await handle.runtimeReady;
      expect(workspace).toBeDefined();
      expect(primaryRuntimeEnv?.effectiveEnv).toBeDefined();
      const capturedRuntimeEnv = primaryRuntimeEnv!.effectiveEnv!;
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe('boot');
      const pinnedRuntimeBaseDir = path.join(tmpDir, '.runtime-boot');
      expect(primaryRuntime?.sessionRuntimeBaseDir).toBe(pinnedRuntimeBaseDir);
      expect(capturedRuntimeEnv['O1CODE_RUNTIME_DIR']).toBe(
        pinnedRuntimeBaseDir,
      );
      expect(primaryRuntime?.env.workflowsEnabledBySettings).toBe(true);

      await workspace!.reload({
        route: 'POST /workspace/reload',
        workspaceCwd: tmpDir,
      });

      const reloadBaseEnv = buildRuntimeEnvironment.mock.calls.at(-1)?.[2];
      expect(reloadBaseEnv?.['O1CODE_TEST_BOOT_BASE']).toBe('base');
      expect(reloadBaseEnv?.['O1CODE_TEST_REMOVED_FROM_DOTENV']).toBe('stale');
      expect(reloadBaseEnv?.['O1CODE_TEST_RELOAD_LEAK']).toBeUndefined();
      expect(primaryRuntimeEnv!.effectiveEnv).toBe(capturedRuntimeEnv);
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe('reloaded');
      expect(capturedRuntimeEnv['O1CODE_TEST_REMOVED_FROM_DOTENV']).toBe(
        'stale',
      );
      expect(capturedRuntimeEnv['O1CODE_TEST_RELOAD_LEAK']).toBeUndefined();
      expect(primaryRuntime?.sessionRuntimeBaseDir).toBe(pinnedRuntimeBaseDir);
      expect(capturedRuntimeEnv['O1CODE_RUNTIME_DIR']).toBe(
        pinnedRuntimeBaseDir,
      );
      expect(primaryRuntime?.env.workflowsEnabledBySettings).toBe(false);

      reloadedRuntimeValue = 'hot-synced';
      await expect(
        workspace!.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toEqual({ status: 'applied' });
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe(
        'hot-synced',
      );
      expect(bridge.invokeWorkspaceCommand).toHaveBeenCalledWith(
        'o1code/control/workspace/model-providers/reload',
        { cwd: tmpDir },
        { timeoutMs: 30_000 },
      );
      expect(primaryRuntime?.sessionRuntimeBaseDir).toBe(pinnedRuntimeBaseDir);
      expect(capturedRuntimeEnv['O1CODE_RUNTIME_DIR']).toBe(
        pinnedRuntimeBaseDir,
      );

      vi.mocked(bridge.invokeWorkspaceCommand).mockRejectedValueOnce(
        new SessionNotFoundError(tmpDir),
      );
      await expect(
        workspace!.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toEqual({ status: 'deferred' });
      vi.mocked(bridge.invokeWorkspaceCommand).mockResolvedValueOnce({
        configsFailed: 1,
      });
      await expect(
        workspace!.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toEqual({ status: 'failed' });
      vi.mocked(bridge.invokeWorkspaceCommand).mockRejectedValueOnce(
        new Error('child reload failed'),
      );
      await expect(
        workspace!.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toEqual({ status: 'failed' });
    } finally {
      if (originalBase === undefined) {
        delete process.env['O1CODE_TEST_BOOT_BASE'];
      } else {
        process.env['O1CODE_TEST_BOOT_BASE'] = originalBase;
      }
      if (originalLeak === undefined) {
        delete process.env['O1CODE_TEST_RELOAD_LEAK'];
      } else {
        process.env['O1CODE_TEST_RELOAD_LEAK'] = originalLeak;
      }
      if (originalRemoved === undefined) {
        delete process.env['O1CODE_TEST_REMOVED_FROM_DOTENV'];
      } else {
        process.env['O1CODE_TEST_REMOVED_FROM_DOTENV'] = originalRemoved;
      }
      if (originalRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = originalRuntimeDir;
      }
      await handle.close();
    }
  });

  it('preserves previous runtime env and marks fallback when reload env rebuild fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-env-fallback-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    let runtimeMounted = false;
    vi.spyOn(settingsRuntime, 'loadSettings').mockImplementation(
      () =>
        ({
          merged: {
            env: {
              O1CODE_TEST_RUNTIME_VALUE: runtimeMounted ? 'reloaded' : 'boot',
            },
          },
        }) as unknown as ReturnType<typeof settingsRuntime.loadSettings>,
    );
    let failReloadRead = false;
    const reloadEnvironment = vi
      .spyOn(settingsRuntime, 'reloadEnvironment')
      .mockImplementation(() => ({
        updatedKeys: [],
        removedKeys: [],
        ...(failReloadRead ? { envFileReadFailed: true } : {}),
      }));
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    const buildRuntimeEnvironmentActual =
      environmentRuntime.buildRuntimeEnvironment;
    let failReloadBuild = false;
    let failEnvFileRead = false;
    vi.spyOn(environmentRuntime, 'buildRuntimeEnvironment').mockImplementation(
      (
        ...args: Parameters<typeof environmentRuntime.buildRuntimeEnvironment>
      ) => {
        if (failReloadBuild) {
          throw new Error('runtime env rebuild failed');
        }
        const result = buildRuntimeEnvironmentActual(...args);
        return failEnvFileRead
          ? {
              ...result,
              envFileReadFailed: true,
              envFileReadFailures: [
                { path: path.join(tmpDir, '.env'), error: 'read failed' },
              ],
            }
          : result;
      },
    );
    let workspace:
      | {
          reload(ctx: {
            route: string;
            workspaceCwd: string;
          }): Promise<unknown>;
          reloadModelProviders(ctx: {
            route: string;
            workspaceCwd: string;
          }): Promise<unknown>;
        }
      | undefined;
    let primaryRuntimeEnv:
      | {
          effectiveEnv?: NodeJS.ProcessEnv;
          fallbackReason?: string;
        }
      | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(
      (_opts, _getPort, deps) => {
        runtimeMounted = true;
        workspace = deps?.workspace as typeof workspace;
        primaryRuntimeEnv = deps?.primaryRuntimeEnv as typeof primaryRuntimeEnv;
        return express();
      },
    );

    const logBaseDir = path.join(tmpDir, 'debug');
    const bridge = makeRuntimeBridge();
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge,
        bootSettings: {},
        daemonLogBaseDir: logBaseDir,
        resolveOnListen: true,
      },
    );

    let closed = false;
    try {
      await handle.runtimeReady;
      expect(workspace).toBeDefined();
      expect(primaryRuntimeEnv?.effectiveEnv).toBeDefined();
      const capturedRuntimeEnv = primaryRuntimeEnv!.effectiveEnv!;
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe('boot');

      failReloadBuild = true;
      await expect(
        workspace!.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toEqual({ status: 'failed' });
      expect(reloadEnvironment).not.toHaveBeenCalled();
      await expect(
        workspace!.reload({
          route: 'POST /workspace/reload',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toMatchObject({ runtimeEnvironmentApplied: false });
      expect(reloadEnvironment).not.toHaveBeenCalled();

      expect(primaryRuntimeEnv!.effectiveEnv).toBe(capturedRuntimeEnv);
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe('boot');
      expect(primaryRuntimeEnv!.fallbackReason).toBe(
        'runtime env rebuild failed',
      );

      failReloadBuild = false;
      await expect(
        workspace!.reload({
          route: 'POST /workspace/reload',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toMatchObject({ runtimeEnvironmentApplied: true });
      expect(reloadEnvironment).toHaveBeenCalledOnce();
      expect(primaryRuntimeEnv!.effectiveEnv).toBe(capturedRuntimeEnv);
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe('reloaded');
      expect(primaryRuntimeEnv!.fallbackReason).toBeUndefined();

      failReloadRead = true;
      await expect(
        workspace!.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toEqual({ status: 'failed' });
      expect(reloadEnvironment).toHaveBeenCalledTimes(2);
      expect(reloadEnvironment).toHaveBeenLastCalledWith(
        expect.any(Object),
        tmpDir,
        true,
        { failClosedOnEnvFileReadError: true },
      );
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe('reloaded');

      failReloadRead = false;
      failEnvFileRead = true;
      await expect(
        workspace!.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: tmpDir,
        }),
      ).resolves.toEqual({ status: 'failed' });
      expect(reloadEnvironment).toHaveBeenCalledTimes(2);
      expect(primaryRuntimeEnv!.effectiveEnv).toBe(capturedRuntimeEnv);
      expect(capturedRuntimeEnv['O1CODE_TEST_RUNTIME_VALUE']).toBe('reloaded');
      expect(primaryRuntimeEnv!.fallbackReason).toBeUndefined();

      await handle.close();
      closed = true;
      const logPath = path.join(logBaseDir, 'daemon', 'daemon.log');
      const log = fs.readFileSync(logPath, 'utf8');
      expect(log).toContain(
        'failed to rebuild runtime env snapshot before daemon env reload; preserving previous runtime env',
      );
    } finally {
      if (!closed) {
        await handle.close();
      }
    }
  });

  it('updates secondary runtime env metadata in place after workspace reload', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-secondary-env-reload-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    const dynamic = path.join(tmpDir, 'dynamic');
    const originalRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    delete process.env['O1CODE_RUNTIME_DIR'];
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    fs.mkdirSync(dynamic);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    let runtimeMounted = false;
    let dynamicReloaded = false;
    let providerRuntimeMutation = false;
    let failEnvFileRead = false;
    vi.spyOn(settingsRuntime, 'loadSettings').mockImplementation(
      (...args: Parameters<typeof settingsRuntime.loadSettings>) => {
        const workspace = args[0];
        const isSecondary = workspace === secondary;
        return {
          merged: {
            tools: {
              workflowsEnabled:
                workspace === dynamic ? !dynamicReloaded : !runtimeMounted,
            },
            advanced: {
              runtimeOutputDir: isSecondary
                ? runtimeMounted
                  ? '.secondary-runtime-reloaded'
                  : '.secondary-runtime-boot'
                : '.primary-runtime',
            },
            env: {
              [isSecondary
                ? 'O1CODE_TEST_SECONDARY_ENV'
                : 'O1CODE_TEST_PRIMARY_ENV']: runtimeMounted
                ? failEnvFileRead
                  ? 'partial'
                  : providerRuntimeMutation
                    ? 'provider-reloaded'
                    : 'reloaded'
                : 'boot',
            },
          },
        } as unknown as ReturnType<typeof settingsRuntime.loadSettings>;
      },
    );
    const reloadEnvironment = vi
      .spyOn(settingsRuntime, 'reloadEnvironment')
      .mockReturnValue({
        updatedKeys: ['O1CODE_TEST_SECONDARY_ENV'],
        removedKeys: [],
      });
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    const buildRuntimeEnvironmentActual =
      environmentRuntime.buildRuntimeEnvironment;
    vi.spyOn(environmentRuntime, 'buildRuntimeEnvironment').mockImplementation(
      (
        ...args: Parameters<typeof environmentRuntime.buildRuntimeEnvironment>
      ) => {
        const result = buildRuntimeEnvironmentActual(...args);
        return failEnvFileRead
          ? {
              ...result,
              envFileReadFailed: true,
              envFileReadFailures: [
                { path: path.join(secondary, '.env'), error: 'read failed' },
              ],
            }
          : result;
      },
    );
    vi.spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        makeRuntimeBridge() as ReturnType<
          typeof acpBridge.createAcpSessionBridge
        >,
      )
      .mockReturnValueOnce(
        makeRuntimeBridge() as ReturnType<
          typeof acpBridge.createAcpSessionBridge
        >,
      );
    let workspaceRegistry:
      | import('./workspace-registry.js').WorkspaceRegistry
      | undefined;
    let createWorkspaceRuntime:
      | ((
          cwd: string,
          options: { provenance: WorkspaceRuntimeProvenance },
        ) => Promise<import('./workspace-registry.js').WorkspaceRuntime>)
      | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(
      (_opts, _getPort, deps) => {
        runtimeMounted = true;
        workspaceRegistry = deps?.workspaceRegistry;
        createWorkspaceRuntime = deps?.createWorkspaceRuntime;
        return express();
      },
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      const secondaryRuntime = workspaceRegistry
        ?.list()
        .find((runtime) => runtime.workspaceCwd === secondary);
      expect(secondaryRuntime).toBeDefined();
      const env = secondaryRuntime!.env;
      const overlayKeys = env.overlayKeys;
      const envFilePaths = env.envFilePaths;
      const envFileReadFailures = env.envFileReadFailures;
      expect(env.effectiveEnv?.['O1CODE_TEST_SECONDARY_ENV']).toBe('boot');
      const pinnedRuntimeBaseDir = path.join(
        secondary,
        '.secondary-runtime-boot',
      );
      expect(secondaryRuntime!.sessionRuntimeBaseDir).toBe(
        pinnedRuntimeBaseDir,
      );
      expect(env.effectiveEnv?.['O1CODE_RUNTIME_DIR']).toBe(
        pinnedRuntimeBaseDir,
      );
      expect(env.workflowsEnabledBySettings).toBe(true);

      await expect(
        secondaryRuntime!.workspaceService.reload({
          route: 'POST /workspace/reload',
          workspaceCwd: secondary,
        }),
      ).resolves.toMatchObject({ runtimeEnvironmentApplied: true });
      expect(reloadEnvironment).toHaveBeenCalledOnce();

      expect(env.overlayKeys).toBe(overlayKeys);
      expect(env.envFilePaths).toBe(envFilePaths);
      expect(env.envFileReadFailures).toBe(envFileReadFailures);
      expect(env.effectiveEnv?.['O1CODE_TEST_SECONDARY_ENV']).toBe('reloaded');
      expect(secondaryRuntime!.sessionRuntimeBaseDir).toBe(
        pinnedRuntimeBaseDir,
      );
      expect(env.effectiveEnv?.['O1CODE_RUNTIME_DIR']).toBe(
        pinnedRuntimeBaseDir,
      );
      expect(env.workflowsEnabledBySettings).toBe(false);

      const dynamicRuntime = await createWorkspaceRuntime!(dynamic, {
        provenance: 'existing',
      });
      expect(dynamicRuntime.env.workflowsEnabledBySettings).toBe(true);
      dynamicReloaded = true;
      await dynamicRuntime.workspaceService.reload({
        route: 'POST /workspace/reload',
        workspaceCwd: dynamic,
      });
      expect(dynamicRuntime.env.workflowsEnabledBySettings).toBe(false);

      providerRuntimeMutation = true;
      await expect(
        secondaryRuntime!.workspaceService.reloadModelProviders({
          route: 'POST /workspace/auth/provider',
          workspaceCwd: secondary,
        }),
      ).resolves.toEqual({ status: 'applied' });
      expect(reloadEnvironment).toHaveBeenCalledTimes(2);
      expect(env.effectiveEnv?.['O1CODE_TEST_SECONDARY_ENV']).toBe(
        'provider-reloaded',
      );

      failEnvFileRead = true;
      await expect(
        secondaryRuntime!.workspaceService.reload({
          route: 'POST /workspace/reload',
          workspaceCwd: secondary,
        }),
      ).resolves.toMatchObject({ runtimeEnvironmentApplied: false });
      expect(reloadEnvironment).toHaveBeenCalledTimes(2);
      expect(env.effectiveEnv?.['O1CODE_TEST_SECONDARY_ENV']).toBe(
        'provider-reloaded',
      );
      expect(env.envFileReadFailed).toBe(false);
      expect(env.envFileReadFailures).toEqual([]);
    } finally {
      await handle.close();
      if (originalRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = originalRuntimeDir;
      }
    }
  });

  it('restores persisted workspaces through the normal secondary runtime path', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-restored-workspace-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const explicitSecondary = path.join(tmpDir, 'explicit-secondary');
    const restoredSecondary = path.join(tmpDir, 'restored-secondary');
    const nestedSecondary = path.join(explicitSecondary, 'nested');
    const liveConversationWorkspace = new ConversationWorkspace({
      homeDir: tmpDir,
    });
    const reservedConversationChild = path.join(
      liveConversationWorkspace.rootPath,
      'legacy-child',
    );
    const missingReservedConversationChild = path.join(
      liveConversationWorkspace.rootPath,
      'missing-legacy-child',
    );
    fs.mkdirSync(primary);
    fs.mkdirSync(explicitSecondary);
    fs.mkdirSync(restoredSecondary);
    fs.mkdirSync(nestedSecondary);
    fs.mkdirSync(reservedConversationChild, { recursive: true });
    const restoredSecondaryAlias = path.join(
      tmpDir,
      'restored-secondary-alias',
    );
    fs.symlinkSync(
      restoredSecondary,
      restoredSecondaryAlias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const canonicalPrimary = canonicalizeWorkspace(primary);
    const canonicalExplicitSecondary = canonicalizeWorkspace(explicitSecondary);
    const canonicalRestoredSecondary = canonicalizeWorkspace(restoredSecondary);
    const missingPersistedWorkspace = path.join(tmpDir, 'missing-secondary');
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => makeRuntimeBridge());
    let restoredCwds: string[] = [];
    let restoredDisplayNames: Array<string | undefined> = [];
    let restoredRemovable: Array<boolean | undefined> = [];
    let restoredRegistrationIds: Array<readonly string[] | undefined> = [];
    let advertisedMaxTotalSessions: number | undefined;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(
      (opts, _getPort, deps) => {
        restoredCwds =
          deps?.workspaceRegistry
            ?.list()
            .map((runtime) => runtime.workspaceCwd) ?? [];
        restoredDisplayNames =
          deps?.workspaceRegistry
            ?.list()
            .map((runtime) => runtime.displayName) ?? [];
        restoredRemovable =
          deps?.workspaceRegistry?.list().map((runtime) => runtime.removable) ??
          [];
        restoredRegistrationIds =
          deps?.workspaceRegistry
            ?.list()
            .map((runtime) => runtime.registrationIds) ?? [];
        advertisedMaxTotalSessions = opts.maxTotalSessions;
        return express();
      },
    );
    const store = {
      read: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        primaryWorkspace: canonicalPrimary,
        workspaces: [
          missingPersistedWorkspace,
          canonicalExplicitSecondary,
          nestedSecondary,
          restoredSecondaryAlias,
          canonicalRestoredSecondary,
          liveConversationWorkspace.rootPath,
          reservedConversationChild,
          missingReservedConversationChild,
        ],
        displayNames: {
          [workspaceRegistrationId(canonicalExplicitSecondary)]:
            'Explicit workspace',
          [workspaceRegistrationId(restoredSecondaryAlias)]:
            'Restored workspace',
          [workspaceRegistrationId(canonicalRestoredSecondary)]:
            'Later alias name',
        },
      }),
    } as unknown as WorkspaceRegistrationStore;

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, explicitSecondary],
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        workspaceRegistrationStore: store,
        liveConversationWorkspace,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );

    try {
      await handle.runtimeReady;
      expect(store.read).toHaveBeenCalledTimes(1);
      expect(restoredCwds).toEqual([
        canonicalPrimary,
        canonicalExplicitSecondary,
        canonicalRestoredSecondary,
      ]);
      expect(restoredDisplayNames).toEqual([
        undefined,
        'Explicit workspace',
        'Restored workspace',
      ]);
      expect(restoredRemovable).toEqual([false, false, true]);
      expect(restoredRegistrationIds).toEqual([
        [],
        [workspaceRegistrationId(canonicalExplicitSecondary)],
        [
          workspaceRegistrationId(restoredSecondaryAlias),
          workspaceRegistrationId(canonicalRestoredSecondary),
        ],
      ]);
      expect(createBridge).toHaveBeenCalledTimes(3);
      expect(advertisedMaxTotalSessions).toBe(800);
      expect(
        stderrWrite.mock.calls.some(([message]) =>
          String(message).includes(
            `skipping persisted workspace registration ${JSON.stringify(
              missingPersistedWorkspace,
            )}`,
          ),
        ),
      ).toBe(true);
      expect(
        stderrWrite.mock.calls.some(([message]) =>
          String(message).includes('path nests with an explicit'),
        ),
      ).toBe(true);
      expect(
        stderrWrite.mock.calls.filter(([message]) =>
          String(message).includes('path is reserved for Conversations'),
        ),
      ).toHaveLength(3);
    } finally {
      await handle.close();
    }
  });

  it('continues with explicit workspaces when the registration store read fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-restored-read-error-')),
    );
    const primary = path.join(tmpDir, 'primary');
    fs.mkdirSync(primary);
    const canonicalPrimary = canonicalizeWorkspace(primary);
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => makeRuntimeBridge());
    let restoredCwds: string[] = [];
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(
      (_opts, _getPort, deps) => {
        restoredCwds =
          deps?.workspaceRegistry
            ?.list()
            .map((runtime) => runtime.workspaceCwd) ?? [];
        return express();
      },
    );
    const store = {
      read: vi.fn().mockRejectedValue(new Error('store unavailable')),
    } as unknown as WorkspaceRegistrationStore;

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: primary,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        workspaceRegistrationStore: store,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );

    try {
      await handle.runtimeReady;
      expect(restoredCwds).toEqual([canonicalPrimary]);
      expect(createBridge).toHaveBeenCalledTimes(1);
      expect(
        stderrWrite.mock.calls.some(([message]) =>
          String(message).includes(
            'failed to read persisted workspace registrations',
          ),
        ),
      ).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it.each([25, undefined])(
    'rejects a complete restored union over capacity %s without constructing runtimes',
    async (maxRegisteredWorkspaces) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-restored-limit-')),
      );
      const capacity = maxRegisteredWorkspaces ?? 256;
      const workspaces = Array.from({ length: capacity + 1 }, (_, index) => {
        const cwd = path.join(tmpDir!, `workspace-${index}`);
        fs.mkdirSync(cwd);
        return cwd;
      });
      const store = new WorkspaceRegistrationStore(
        workspaces[0]!,
        path.join(tmpDir, 'home'),
      );
      await store.add(workspaces[capacity]!, 'Saved');
      const before = fs.readFileSync(store.filePath);
      const httpServerFactory = vi.fn(() => {
        throw new Error('listener created');
      });
      const createBridge = vi.spyOn(acpBridge, 'createAcpSessionBridge');
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            workspace: workspaces.slice(0, capacity),
            maxRegisteredWorkspaces,
            serveWebShell: false,
          },
          {
            workspaceRegistrationStore: store,
            httpServerFactory,
            daemonLogBaseDir: path.join(tmpDir, 'debug'),
          },
        ),
      ).rejects.toThrow(
        `${capacity} explicit + 1 restored workspaces exceed the configured limit of ${capacity}`,
      );
      expect(fs.readFileSync(store.filePath)).toEqual(before);
      expect(httpServerFactory).not.toHaveBeenCalled();
      expect(createBridge).not.toHaveBeenCalled();
    },
  );

  function stubCapacityRuntimeDeps() {
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() =>
      makeRuntimeBridge(),
    );
    const observed: {
      maxRegisteredWorkspaces?: number;
      maxTotalSessions?: number;
      runtimeCount?: number;
    } = {};
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(
      (opts, _getPort, deps) => {
        observed.maxRegisteredWorkspaces = opts.maxRegisteredWorkspaces;
        observed.maxTotalSessions = opts.maxTotalSessions;
        observed.runtimeCount = deps?.workspaceRegistry?.list().length;
        return express();
      },
    );
    return observed;
  }

  function makeCapacityWorkspaces(count: number): string[] {
    return Array.from({ length: count }, (_, index) => {
      const cwd = path.join(tmpDir!, `workspace-${index}`);
      fs.mkdirSync(cwd);
      return cwd;
    });
  }

  it('resolves the registration cap and legacy session default from the launch environment', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-env-capacity-')),
    );
    const workspaces = makeCapacityWorkspaces(3);
    const observed = stubCapacityRuntimeDeps();
    const boot = (workspace: string | string[]) =>
      runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace,
          serveWebShell: false,
        },
        {
          daemonLogBaseDir: path.join(tmpDir!, 'debug'),
          resolveOnListen: true,
        },
      );
    const original = process.env['O1CODE_SERVE_MAX_WORKSPACES'];
    try {
      process.env['O1CODE_SERVE_MAX_WORKSPACES'] = '25';
      const handle = await boot(workspaces[0]!);
      try {
        await handle.runtimeReady;
        expect(observed.maxRegisteredWorkspaces).toBe(25);
        expect(observed.maxTotalSessions).toBeUndefined();
      } finally {
        await handle.close();
      }

      process.env['O1CODE_SERVE_MAX_WORKSPACES'] = '2';
      await expect(boot(workspaces)).rejects.toThrow(
        'At most 2 --workspace values may be registered.',
      );

      process.env['O1CODE_SERVE_MAX_WORKSPACES'] = 'abc';
      await expect(boot(workspaces[0]!)).rejects.toThrow(
        'Invalid O1CODE_SERVE_MAX_WORKSPACES="abc"',
      );
    } finally {
      if (original === undefined) {
        delete process.env['O1CODE_SERVE_MAX_WORKSPACES'];
      } else {
        process.env['O1CODE_SERVE_MAX_WORKSPACES'] = original;
      }
    }
  });

  it('derives the legacy session total from the workspace count at capacity 25', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-legacy-total-')),
    );
    const workspaces = makeCapacityWorkspaces(2);
    const observed = stubCapacityRuntimeDeps();
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: workspaces,
        maxRegisteredWorkspaces: 25,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );
    try {
      await handle.runtimeReady;
      expect(observed.maxRegisteredWorkspaces).toBe(25);
      expect(observed.maxTotalSessions).toBe(2);
    } finally {
      await handle.close();
    }
  });

  it('admits a restored union exactly at the configured capacity', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-restored-at-limit-')),
    );
    const workspaces = makeCapacityWorkspaces(2);
    const store = new WorkspaceRegistrationStore(
      workspaces[0]!,
      path.join(tmpDir, 'home'),
    );
    await store.add(workspaces[1]!, 'Saved');
    const before = fs.readFileSync(store.filePath);
    const observed = stubCapacityRuntimeDeps();
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: workspaces[0]!,
        maxRegisteredWorkspaces: 2,
        serveWebShell: false,
      },
      {
        workspaceRegistrationStore: store,
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );
    try {
      await handle.runtimeReady;
      expect(observed.runtimeCount).toBe(2);
      expect(fs.readFileSync(store.filePath)).toEqual(before);
    } finally {
      await handle.close();
    }
  });

  it('filters secondary workspace roots before constructing the bridge filesystem', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-roots-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const trustedSecondary = path.join(tmpDir, 'trusted-secondary');
    const untrustedSecondary = path.join(tmpDir, 'untrusted-secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(trustedSecondary);
    fs.mkdirSync(untrustedSecondary);
    const roots = [primary, trustedSecondary, untrustedSecondary].map((root) =>
      canonicalizeWorkspace(root),
    );
    const bridgeFsBoundWorkspaces: string[][] = [];
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(
      trustedFoldersRuntime,
      'getWorkspaceTrustStatus',
    ).mockImplementation(
      (_settings, workspace) =>
        ({
          effective: {
            state: workspace === untrustedSecondary ? 'untrusted' : 'trusted',
          },
        }) as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>,
    );
    vi.spyOn(
      trustPolicyRuntime,
      'evaluateDaemonWorkspaceTrust',
    ).mockImplementation(
      (_snapshot, workspace) =>
        ({
          state: workspace === roots[2] ? 'untrusted' : 'trusted',
          targetTrusted: workspace !== roots[2],
          source: 'file',
          explicitTrustLevel: null,
        }) as ReturnType<
          typeof trustPolicyRuntime.evaluateDaemonWorkspaceTrust
        >,
    );
    vi.spyOn(
      serverModule,
      'resolveBoundWorkspacesFromIdeEnv',
    ).mockImplementation((_primary, _ide, includeWorkspace) =>
      includeWorkspace === undefined ? roots : roots.filter(includeWorkspace),
    );
    vi.spyOn(serverModule, 'resolveBridgeFsFactory').mockImplementation(
      (input) => {
        bridgeFsBoundWorkspaces.push([...input.boundWorkspaces]);
        return {} as ReturnType<typeof serverModule.resolveBridgeFsFactory>;
      },
    );
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue(express());

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: primary,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        bootSettings: {},
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );

    try {
      await handle.runtimeReady;
      expect(bridgeFsBoundWorkspaces[0]).toEqual([roots[0], roots[1]]);
    } finally {
      await handle.close();
    }
  });

  it('keeps trusted child roots when an untrusted parent is filtered out', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-roots-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const untrustedParent = path.join(tmpDir, 'parent');
    const trustedChild = path.join(untrustedParent, 'trusted-child');
    fs.mkdirSync(primary);
    fs.mkdirSync(trustedChild, { recursive: true });
    const roots = [primary, untrustedParent, trustedChild].map((root) =>
      canonicalizeWorkspace(root),
    );
    const originalIdeWorkspacePath = process.env['O1CODE_IDE_WORKSPACE_PATH'];
    process.env['O1CODE_IDE_WORKSPACE_PATH'] = JSON.stringify(roots);
    const bridgeFsBoundWorkspaces: string[][] = [];
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(
      trustedFoldersRuntime,
      'getWorkspaceTrustStatus',
    ).mockImplementation(
      (_settings, workspace) =>
        ({
          effective: {
            state: workspace === roots[1] ? 'untrusted' : 'trusted',
          },
        }) as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>,
    );
    vi.spyOn(
      trustPolicyRuntime,
      'evaluateDaemonWorkspaceTrust',
    ).mockImplementation(
      (_snapshot, workspace) =>
        ({
          state: workspace === roots[1] ? 'untrusted' : 'trusted',
          targetTrusted: workspace !== roots[1],
          source: 'file',
          explicitTrustLevel: null,
        }) as ReturnType<
          typeof trustPolicyRuntime.evaluateDaemonWorkspaceTrust
        >,
    );
    vi.spyOn(serverModule, 'resolveBridgeFsFactory').mockImplementation(
      (input) => {
        bridgeFsBoundWorkspaces.push([...input.boundWorkspaces]);
        return {} as ReturnType<typeof serverModule.resolveBridgeFsFactory>;
      },
    );
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue(express());

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: primary,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        bootSettings: {},
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );

    try {
      await handle.runtimeReady;
      expect(bridgeFsBoundWorkspaces[0]).toEqual([roots[0], roots[2]]);
    } finally {
      if (originalIdeWorkspacePath === undefined) {
        delete process.env['O1CODE_IDE_WORKSPACE_PATH'];
      } else {
        process.env['O1CODE_IDE_WORKSPACE_PATH'] = originalIdeWorkspacePath;
      }
      await handle.close();
    }
  });

  it('shares one path lock registry across bridge and REST filesystem factories', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-roots-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const roots = [primary, secondary].map((root) =>
      canonicalizeWorkspace(root),
    );
    const pathLocks: unknown[] = [];
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);
    vi.spyOn(
      serverModule,
      'resolveBoundWorkspacesFromIdeEnv',
    ).mockImplementation((_primary, _ide, includeWorkspace) =>
      includeWorkspace === undefined ? roots : roots.filter(includeWorkspace),
    );
    vi.spyOn(serverModule, 'resolveBridgeFsFactory').mockImplementation(
      (input) => {
        pathLocks.push(input.pathLocks);
        return {} as ReturnType<typeof serverModule.resolveBridgeFsFactory>;
      },
    );
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue(express());

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: primary,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        bootSettings: {},
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );

    try {
      await handle.runtimeReady;
      expect(pathLocks).toHaveLength(2);
      expect(pathLocks[0]).toBeDefined();
      expect(pathLocks[0]).toBe(pathLocks[1]);
    } finally {
      await handle.close();
    }
  });

  it('excludes secondary workspace roots when runtime trust settings are unavailable', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-roots-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const roots = [primary, secondary].map((root) =>
      canonicalizeWorkspace(root),
    );
    const bridgeFsBoundWorkspaces: string[][] = [];
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    vi.spyOn(settingsRuntime, 'loadSettings').mockImplementation(() => {
      throw new Error('settings unavailable');
    });
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus');
    vi.spyOn(
      trustPolicyRuntime,
      'evaluateDaemonWorkspaceTrust',
    ).mockImplementation(
      (_snapshot, workspace) =>
        ({
          state: workspace === roots[0] ? 'trusted' : 'error',
          targetTrusted: workspace === roots[0],
          source: workspace === roots[0] ? 'file' : 'none',
          explicitTrustLevel: null,
        }) as ReturnType<
          typeof trustPolicyRuntime.evaluateDaemonWorkspaceTrust
        >,
    );
    vi.spyOn(
      serverModule,
      'resolveBoundWorkspacesFromIdeEnv',
    ).mockImplementation((_primary, _ide, includeWorkspace) =>
      includeWorkspace === undefined ? roots : roots.filter(includeWorkspace),
    );
    vi.spyOn(serverModule, 'resolveBridgeFsFactory').mockImplementation(
      (input) => {
        bridgeFsBoundWorkspaces.push([...input.boundWorkspaces]);
        return {} as ReturnType<typeof serverModule.resolveBridgeFsFactory>;
      },
    );
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue(express());

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: primary,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeRuntimeBridge(),
        bootSettings: {},
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
        resolveOnListen: true,
      },
    );

    try {
      await handle.runtimeReady;
      expect(bridgeFsBoundWorkspaces[0]).toEqual([roots[0]]);
      expect(
        trustedFoldersRuntime.getWorkspaceTrustStatus,
      ).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('keeps client MCP disabled when the env flag is unset', async () => {
    const features = await readBrowserMcpFeatureFlagsForEnv(
      undefined,
      'http://localhost:5173',
    );

    expect(features).not.toContain('client_mcp_over_ws');
  });

  it('bounds shutdown waiting when runtime startup never settles', async () => {
    const daemonLog = { warn: vi.fn() };

    await expect(
      waitForRuntimeStartingForShutdown(
        new Promise<void>(() => {}),
        daemonLog,
        1,
      ),
    ).resolves.toBeUndefined();

    expect(daemonLog.warn).toHaveBeenCalledWith(
      '1ms runtime-startup wait reached during shutdown; continuing listener close',
    );
  });

  it('proxies bridge access only after the runtime bridge is ready', async () => {
    const holder: { bridge?: HttpAcpBridge } = {};
    let runtimeStartupError: string | undefined;
    const proxy = createLazyBridgeProxy(
      () => holder.bridge,
      () => runtimeStartupError,
    );

    expect(() => proxy.getDaemonStatusSnapshot()).toThrow(
      'Daemon bridge runtime is still starting.',
    );

    runtimeStartupError = 'runtime boom';
    expect(() => proxy.getDaemonStatusSnapshot()).toThrow(
      'Daemon bridge runtime is not available: runtime boom',
    );

    const getDaemonStatusSnapshot = vi.fn(function (this: HttpAcpBridge) {
      return this === holder.bridge
        ? BASE_BRIDGE_SNAPSHOT
        : {
            ...BASE_BRIDGE_SNAPSHOT,
            channelLive: false,
          };
    });
    runtimeStartupError = undefined;
    holder.bridge = { getDaemonStatusSnapshot } as unknown as HttpAcpBridge;

    expect(proxy.getDaemonStatusSnapshot()).toBe(BASE_BRIDGE_SNAPSHOT);
    expect(getDaemonStatusSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([
    [undefined, 120_000],
    ['', 120_000],
    ['5000', 5000],
    ['0', 0],
    ['abc', 120_000],
    [String(Number.MAX_SAFE_INTEGER + 1), 120_000],
  ])(
    'resolves O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS=%s to %s',
    (envValue, expected) => {
      const originalEnv =
        process.env['O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS'];
      try {
        if (envValue === undefined) {
          delete process.env['O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS'];
        } else {
          process.env['O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS'] = envValue;
        }

        expect(resolveRuntimeStartupTimeoutMs(undefined)).toBe(expected);
      } finally {
        if (originalEnv === undefined) {
          delete process.env['O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS'];
        } else {
          process.env['O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS'] = originalEnv;
        }
      }
    },
  );

  it('returns bootstrap 503 for unknown routes while runtime is still starting', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-starting-route-')),
    );
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockReturnValue(
      telemetryPromise,
    );
    const bridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true, runtimeStartupTimeoutMs: 0 },
    );

    try {
      const res = await fetch(`${handle.url}/unknown-route`);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        error: 'Daemon runtime is still starting',
        code: 'daemon_runtime_starting',
      });
    } finally {
      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      await handle.close();
    }
  });

  it('returns bootstrap 503 for multi-workspace capabilities until runtime routes mount', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-starting-caps-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockReturnValue(
      telemetryPromise,
    );
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => makeRuntimeBridge());
    vi.spyOn(settingsRuntime, 'loadSettings').mockReturnValue({
      merged: {},
    } as ReturnType<typeof settingsRuntime.loadSettings>);
    vi.spyOn(trustedFoldersRuntime, 'getWorkspaceTrustStatus').mockReturnValue({
      effective: { state: 'trusted' },
    } as ReturnType<typeof trustedFoldersRuntime.getWorkspaceTrustStatus>);

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        runtimeStartupTimeoutMs: 0,
        bootSettings: {},
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );

    try {
      const bootstrapRes = await fetch(`${handle.url}/capabilities`);
      expect(bootstrapRes.status).toBe(503);
      expect(bootstrapRes.headers.get('retry-after')).toBe('1');
      expect(await bootstrapRes.json()).toMatchObject({
        error: 'Daemon runtime is still starting',
        code: 'daemon_runtime_starting',
      });
      expect(createBridge).not.toHaveBeenCalled();

      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      await handle.runtimeReady;
      const runtimeRes = await fetch(`${handle.url}/capabilities`);
      expect(runtimeRes.status).toBe(200);
      const runtimeBody = (await runtimeRes.json()) as { features: string[] };
      expect(runtimeBody.features).toContain('multi_workspace_sessions');
    } finally {
      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      await handle.close();
    }
  });

  it('keeps health responsive before starting deferred runtime work', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-first-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    const resolveTelemetrySettings = vi
      .spyOn(o1codeCore, 'resolveTelemetrySettings')
      .mockResolvedValue({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
        daemonLogBaseDir: logBaseDir,
      },
    );

    let closed = false;
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(resolveTelemetrySettings).not.toHaveBeenCalled();
      expect(createBridge).not.toHaveBeenCalled();
      const bootstrapCapabilities = (await (
        await fetch(`${handle.url}/capabilities`)
      ).json()) as { features: string[] };
      expect(bootstrapCapabilities.features).not.toContain(
        'scheduled_task_session_reuse',
      );
      expect(createBridge).not.toHaveBeenCalled();
      const healthRes = await fetch(`${handle.url}/health`);
      expect(healthRes.status).toBe(200);
      expect(await healthRes.json()).toEqual({ status: 'ok' });

      await vi.waitFor(() => expect(createBridge).toHaveBeenCalledTimes(1), {
        timeout: 500,
      });
      expect(resolveTelemetrySettings).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
      const runtimeCapabilities = (await (
        await fetch(`${handle.url}/capabilities`)
      ).json()) as { features: string[] };
      expect(runtimeCapabilities.features).toContain(
        'scheduled_task_session_reuse',
      );
      await handle.close();
      closed = true;

      const daemonDir = path.join(logBaseDir, 'daemon');
      const [logFile] = fs
        .readdirSync(daemonDir)
        .filter((fileName) => fileName.endsWith('.log'));
      expect(logFile).toBeDefined();
      const logContent = fs.readFileSync(
        path.join(daemonDir, logFile!),
        'utf8',
      );
      expect(logContent).toContain(
        'deferred runtime: health timer fired, starting',
      );
    } finally {
      if (!closed) {
        await handle.close();
      }
    }
  });

  it('holds GET /brand until the deferred runtime is ready, then answers 200', async () => {
    // `/brand` is not a bootstrap route: on the default deferred path the
    // delegating app must hold the request until the runtime is up and then
    // answer it, per the protocol reference. Adding it to
    // BOOTSTRAP_SERVE_PATHS would instead answer the bootstrap 503, which the
    // client's brand fetch treats as retryable-but-never-settled.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-brand-hold-')),
    );
    const previousO1CodeHome = process.env['O1CODE_HOME'];
    const o1codeHome = path.join(tmpDir, 'o1-code-home');
    fs.mkdirSync(o1codeHome, { recursive: true });
    process.env['O1CODE_HOME'] = o1codeHome;
    const logBaseDir = path.join(tmpDir, 'debug');
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockReturnValue(
      telemetryPromise,
    );
    const bridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
        daemonLogBaseDir: logBaseDir,
      },
    );

    let closed = false;
    try {
      let brandStatus: number | undefined;
      let brandBody: unknown;
      const brandPending = fetch(`${handle.url}/brand`).then(async (res) => {
        brandStatus = res.status;
        brandBody = await res.json();
      });

      // Held, not answered: no status yet. (The final assertions below are
      // what discriminate — a bootstrap catch-all would answer 503 at once.)
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(brandStatus).toBeUndefined();

      // The health probe triggers the deferred runtime start; once it
      // settles, the held brand request is answered by the real route.
      const healthRes = await fetch(`${handle.url}/health`);
      expect(healthRes.status).toBe(200);
      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      await expect(handle.runtimeReady).resolves.toBeUndefined();

      await brandPending;
      expect(brandStatus).toBe(200);
      expect(brandBody).toEqual({});
      await handle.close();
      closed = true;
    } finally {
      if (previousO1CodeHome === undefined) delete process.env['O1CODE_HOME'];
      else process.env['O1CODE_HOME'] = previousO1CodeHome;
      if (!closed) {
        await handle.close();
      }
    }
  });

  it('returns retryable bootstrap deep health while starting deferred runtime', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-deep-first-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      expect(createBridge).not.toHaveBeenCalled();
      const bootstrapRes = await fetch(`${handle.url}/health?deep=1`);
      expect(bootstrapRes.status).toBe(503);
      expect(bootstrapRes.headers.get('retry-after')).toBe('1');
      expect(await bootstrapRes.json()).toEqual({
        status: 'degraded',
        reason: 'bootstrap',
      });

      await vi.waitFor(() => expect(createBridge).toHaveBeenCalledTimes(1), {
        timeout: 500,
      });
      await expect(handle.runtimeReady).resolves.toBeUndefined();

      const runtimeRes = await fetch(`${handle.url}/health?deep=1`);
      expect(runtimeRes.status).toBe(200);
      expect(await runtimeRes.json()).toMatchObject({
        status: 'ok',
        workspaceCount: 1,
        sessions: 0,
      });
    } finally {
      await handle.close();
    }
  });

  it('starts deferred runtime once for duplicate health probes', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-dedupe-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      expect(createBridge).not.toHaveBeenCalled();
      const [firstHealthRes, secondHealthRes] = await Promise.all([
        fetch(`${handle.url}/health`),
        fetch(`${handle.url}/health`),
      ]);
      expect(firstHealthRes.status).toBe(200);
      expect(secondHealthRes.status).toBe(200);
      expect(await firstHealthRes.json()).toEqual({ status: 'ok' });
      expect(await secondHealthRes.json()).toEqual({ status: 'ok' });

      await vi.waitFor(() => expect(createBridge).toHaveBeenCalledTimes(1), {
        timeout: 500,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('starts deferred runtime for the first runtime route and serves that request', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-route-start-')),
    );
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    const resolveTelemetrySettings = vi
      .spyOn(o1codeCore, 'resolveTelemetrySettings')
      .mockReturnValue(telemetryPromise);
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      const app = express();
      app.post('/session', (req, res) => {
        const timing = getDeferredRuntimeRequestTiming(req);
        res.status(201).json({
          sessionId: 'session-1',
          runtimePath: timing?.path,
          runtimeWaitMs: timing?.waitMs,
        });
      });
      return app;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    let sessionRequestCount = 0;
    let resolveSecondSessionRequest: (() => void) | undefined;
    const secondSessionRequest = new Promise<void>((resolve) => {
      resolveSecondSessionRequest = resolve;
    });
    const observeSessionRequest = (req: { method?: string; url?: string }) => {
      if (req.method !== 'POST' || req.url !== '/session') return;
      sessionRequestCount += 1;
      if (sessionRequestCount === 2) resolveSecondSessionRequest?.();
    };
    handle.server.on('request', observeSessionRequest);

    try {
      expect(createBridge).not.toHaveBeenCalled();
      const firstResponse = fetch(`${handle.url}/session`, { method: 'POST' });
      await vi.waitFor(() =>
        expect(resolveTelemetrySettings).toHaveBeenCalledOnce(),
      );
      const joinedResponse = fetch(`${handle.url}/session`, {
        method: 'POST',
      });
      await secondSessionRequest;
      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });

      const [first, joined] = await Promise.all([
        firstResponse,
        joinedResponse,
      ]);
      expect(first.status).toBe(201);
      expect(await first.json()).toEqual({
        sessionId: 'session-1',
        runtimePath: 'started_on_request',
        runtimeWaitMs: expect.any(Number),
      });
      expect(joined.status).toBe(201);
      expect(await joined.json()).toEqual({
        sessionId: 'session-1',
        runtimePath: 'joined',
        runtimeWaitMs: expect.any(Number),
      });
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      handle.server.off('request', observeSessionRequest);
      await handle.close();
    }
  });

  it('rejects unauthenticated deferred runtime routes before starting runtime', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-route-auth-')),
    );
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      const app = express();
      app.post('/session', (_req, res) => {
        res.status(201).json({ sessionId: 'session-1' });
      });
      return app;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
        token: 'secret-token',
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      const res = await fetch(`${handle.url}/session`, { method: 'POST' });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
      expect(createBridge).not.toHaveBeenCalled();

      const authorizedRes = await fetch(`${handle.url}/session`, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token' },
      });
      expect(authorizedRes.status).toBe(201);
      expect(await authorizedRes.json()).toEqual({ sessionId: 'session-1' });
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('serves Web Shell document navigations during the deferred runtime window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-webshell-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      // HEAD goes first so the cold deferred gate's pre-auth exemption is
      // exercised for both methods the warm app serves pre-auth.
      const headRes = await fetch(`${handle.url}/session/abc`, {
        method: 'HEAD',
        headers: { accept: 'text/html' },
      });
      expect(headRes.status).toBe(200);
      expect(headRes.headers.get('content-type')).toContain('text/html');

      // A browser refresh of a session deep link carries no bearer header and
      // must load the shell (and start the runtime) instead of 401ing in the
      // deferred gate.
      const navRes = await fetch(`${handle.url}/session/abc`, {
        headers: { accept: 'text/html' },
      });
      expect(navRes.status).toBe(200);
      expect(navRes.headers.get('content-type')).toContain('text/html');
      expect(await navRes.text()).toContain('<div id="root">');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('serves the Web Shell root during the deferred runtime window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-root-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      // First request to a cold daemon, so the `/` exemption is exercised at
      // the deferred gate itself — there is no warm-app path it could take.
      const rootRes = await fetch(`${handle.url}/`);
      expect(rootRes.status).toBe(200);
      expect(rootRes.headers.get('content-type')).toContain('text/html');
      expect(await rootRes.text()).toContain('<div id="root">');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('keeps the remote same-origin exception alive during the bootstrap window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-selforigin-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir, {
      serveOptions: { hostname: '0.0.0.0' },
    });
    try {
      // Pin the premises, not just the statuses: the daemon really bound the
      // wildcard (read from the socket, not from the option echoed back), and
      // every request below is answered by the bootstrap app — the runtime
      // bridge has not started, so a widened deferred-route classifier or a
      // dropped override flips these instead of silently turning the test
      // into a loopback/warm-app probe.
      expect((handle.server.address() as AddressInfo).address).toBe('0.0.0.0');
      // The single-workspace bootstrap capabilities handler answers 200; a
      // multi-workspace boot would be 503, which the guard's own retry loop
      // tolerates but this exception test is not about.
      const authed = await fetch(`${handle.url}/capabilities`, {
        headers: {
          Origin: handle.url,
          Authorization: 'Bearer secret-token',
        },
      });
      expect(authed.status).toBe(200);
      const unauthed = await fetch(`${handle.url}/capabilities`, {
        headers: { Origin: handle.url },
      });
      expect(unauthed.status).toBe(401);
      const crossOrigin = await fetch(`${handle.url}/capabilities`, {
        headers: {
          Origin: 'http://evil.test',
          Authorization: 'Bearer secret-token',
        },
      });
      expect(crossOrigin.status).toBe(403);
      expect(createBridge).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('runs the Host gate ahead of the CORS wall during the bootstrap window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-order-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle } = await startDeferredDaemon(tmpDir);
    try {
      // A DNS-rebinding probe carries a bad Host AND an Origin, so which gate
      // answers decides the reject body: the bootstrap chain must match the
      // runtime app (hostAllowlist before the CORS wall). fetch cannot set
      // Host, so drive the raw socket.
      const port = new URL(handle.url).port;
      const raw = await new Promise<string>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path: '/capabilities',
            method: 'GET',
            headers: {
              Host: `evil.example:${port}`,
              Origin: 'http://evil.example',
              Authorization: 'Bearer secret-token',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(`${res.statusCode} ${data}`));
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(raw).toContain('403');
      expect(raw).toContain('Invalid Host header');
    } finally {
      await handle.close();
    }
  });

  it('serves the // root alias during the deferred window like the warm app', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-root-alias-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      // Express non-strict routing matches a raw `//` against `app.get('/')`,
      // so the warm app serves it pre-auth; the cold gate must exempt it too
      // instead of 401ing.
      const aliasRes = await fetch(`${handle.url}//`);
      expect(aliasRes.status).toBe(200);
      expect(aliasRes.headers.get('content-type')).toContain('text/html');
      expect(await aliasRes.text()).toContain('<div id="root">');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('degrades to the bearer gate when the pre-auth predicate rejects', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-predicate-fail-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);
    const predicateSpy = vi
      .spyOn(webShellStatic, 'isPreAuthWebShellRequest')
      .mockImplementation(() => {
        throw new Error('predicate module glitch');
      });

    try {
      // Without the fail-closed guard, a rejecting predicate 500s the whole
      // deferred branch. A tokenless navigation must hit the bearer gate...
      const anonRes = await fetch(`${handle.url}/`, {
        headers: { accept: 'text/html' },
      });
      expect(anonRes.status).toBe(401);

      // ...and a correctly-tokened request must still get through.
      const authedRes = await fetch(`${handle.url}/session/abc`, {
        headers: {
          accept: 'text/html',
          authorization: 'Bearer secret-token',
        },
      });
      expect(authedRes.status).toBe(200);
      expect(authedRes.headers.get('content-type')).toContain('text/html');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      predicateSpy.mockRestore();
      await handle.close();
    }
  });

  it('serves Web Shell assets during the deferred runtime window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-assets-')),
    );
    const shellDir = writeWebShellFixture(tmpDir);
    fs.writeFileSync(
      path.join(shellDir, 'assets', 'fixture.js'),
      'console.log("fixture");',
    );
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      // First request to a cold daemon, so only the predicate's `/assets/`
      // branch can exempt this from the bearer gate.
      const assetRes = await fetch(`${handle.url}/assets/fixture.js`);
      expect(assetRes.status).toBe(200);
      expect(await assetRes.text()).toContain('console.log("fixture");');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('answers bare /assets during the deferred window like the warm app', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-assets-bare-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      // First request to a cold daemon. Express 5's `app.use('/assets', ...)`
      // also matches the bare mount path pre-auth — the warm app answers 301
      // to `/assets/` (then 404) — so the deferred gate must exempt it too
      // instead of 401ing.
      const bareRes = await fetch(`${handle.url}/assets`, {
        redirect: 'manual',
      });
      expect(bareRes.status).toBe(301);
      expect(bareRes.headers.get('location')).toBe('/assets/');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('serves trailing-slash and case-variant session deep links during the deferred window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-shapes-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      // The warm app serves this shape pre-auth (Express matches routes
      // case-insensitively and non-strictly by default), so the cold gate
      // must exempt it too instead of 401ing the refresh.
      const navRes = await fetch(`${handle.url}/Session/abc/`, {
        headers: { accept: 'text/html' },
      });
      expect(navRes.status).toBe(200);
      expect(navRes.headers.get('content-type')).toContain('text/html');
      expect(await navRes.text()).toContain('<div id="root">');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('serves query-carrying session deep links during the deferred window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-query-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      // First request to a cold daemon, with a query string (a real
      // deep-link refresh shape). The predicate matches on `req.path`, which
      // strips the query — pinning the gate against a mutation to `req.url`
      // that would 401 the refresh.
      const queryRes = await fetch(`${handle.url}/session/abc/?ref=1`, {
        headers: { accept: 'text/html' },
      });
      expect(queryRes.status).toBe(200);
      expect(queryRes.headers.get('content-type')).toContain('text/html');
      expect(await queryRes.text()).toContain('<div id="root">');
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('keeps JSON and API-subpath requests gated during the deferred runtime window', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-webshell-gate-')),
    );
    writeWebShellFixture(tmpDir);
    const { handle, createBridge } = await startDeferredDaemon(tmpDir);

    try {
      const jsonRes = await fetch(`${handle.url}/session/abc`, {
        headers: { accept: 'application/json' },
      });
      expect(jsonRes.status).toBe(401);

      const apiRes = await fetch(`${handle.url}/session/abc/status`, {
        headers: { accept: 'text/html' },
      });
      expect(apiRes.status).toBe(401);

      expect(createBridge).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('keeps session document navigations gated during the deferred window with --no-web', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-noweb-')),
    );
    const { handle, createBridge } = await startDeferredDaemon(tmpDir, {
      serveOptions: { serveWebShell: false },
    });

    try {
      const navRes = await fetch(`${handle.url}/session/abc`, {
        headers: { accept: 'text/html' },
      });
      expect(navRes.status).toBe(401);
      expect(createBridge).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('answers pre-auth Web Shell navigations with the failure envelope when the deferred runtime fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-deferred-webshell-fail-')),
    );
    writeWebShellFixture(tmpDir);
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const { handle, createBridge } = await startDeferredDaemon(tmpDir, {
      createBridge: () => {
        throw new Error('runtime boom');
      },
    });

    try {
      // These paths are declared pre-auth, so on a startup failure they must
      // report the real fault instead of the bootstrap bearer gate's 401.
      const navRes = await fetch(`${handle.url}/session/abc`, {
        headers: { accept: 'text/html' },
      });
      expect(navRes.status).toBe(503);
      expect(await navRes.json()).toEqual({
        error: 'Daemon runtime failed to start',
        code: 'daemon_runtime_failed',
      });

      const rootRes = await fetch(`${handle.url}/`);
      expect(rootRes.status).toBe(503);
      expect(await rootRes.json()).toEqual({
        error: 'Daemon runtime failed to start',
        code: 'daemon_runtime_failed',
      });

      // Non-exempted requests stay behind the bearer gate.
      const jsonRes = await fetch(`${handle.url}/session/abc`, {
        headers: { accept: 'application/json' },
      });
      expect(jsonRes.status).toBe(401);

      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
    } finally {
      await handle.close();
    }
  });

  it('allows deferred runtime CORS preflight without auth or runtime startup', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-preflight-')),
    );
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
        token: 'secret-token',
        allowOrigins: ['http://localhost:5173'],
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      const res = await fetch(`${handle.url}/session/foo/prompt`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      );
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(createBridge).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('does not start deferred runtime for unsupported bootstrap route methods', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-method-')),
    );
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      const res = await fetch(`${handle.url}/health`, { method: 'POST' });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        code: 'daemon_runtime_starting',
      });
      expect(createBridge).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('serves trailing-slash bootstrap health without waiting for deferred runtime', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-trailing-')),
    );
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockReturnValue(
      telemetryPromise,
    );
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      const res = await Promise.race([
        fetch(`${handle.url}/health/`),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Trailing-slash health timed out')),
            200,
          ),
        ),
      ]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
      expect(createBridge).not.toHaveBeenCalled();
    } finally {
      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      await handle.close();
    }
  });

  it('reports deferred runtime startup failure for the triggering runtime route', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-route-fail-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => {
        throw new Error('runtime boom');
      });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      const res = await fetch(`${handle.url}/session`, { method: 'POST' });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        error: 'Daemon runtime failed to start',
        code: 'daemon_runtime_failed',
      });
      expect(createBridge).toHaveBeenCalledTimes(1);
      await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
    } finally {
      await handle.close();
    }
  });

  it('starts deferred runtime on fallback when no health probe arrives', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-fallback-')),
    );
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      expect(createBridge).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(createBridge).toHaveBeenCalledTimes(1), {
        timeout: 1500,
      });
      await expect(handle.runtimeReady).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('does not start deferred runtime after close before first health', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-close-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
        daemonLogBaseDir: logBaseDir,
      },
    );

    await handle.close();
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(createBridge).not.toHaveBeenCalled();
    await expect(handle.runtimeReady).rejects.toThrow(
      RUNTIME_STARTUP_CANCELLED_MESSAGE,
    );
    const daemonDir = path.join(logBaseDir, 'daemon');
    const [logFile] = fs
      .readdirSync(daemonDir)
      .filter((fileName) => fileName.endsWith('.log'));
    expect(logFile).toBeDefined();
    const logContent = fs.readFileSync(path.join(daemonDir, logFile!), 'utf8');
    expect(logContent).toContain(
      'deferred runtime: cancelled, server closed before startup',
    );
  });

  it('does not start deferred runtime after close following first health', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-close-after-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    const healthRes = await fetch(`${handle.url}/health`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ status: 'ok' });

    await handle.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(createBridge).not.toHaveBeenCalled();
    await expect(handle.runtimeReady).rejects.toThrow(
      RUNTIME_STARTUP_CANCELLED_MESSAGE,
    );
  });

  it('stops the deferred runtime extension reconciler during close', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-reconciler-close-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const bridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    const stopExtensionGenerationReconciler = vi.fn();
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      const runtimeApp = express();
      runtimeApp.locals['stopExtensionGenerationReconciler'] =
        stopExtensionGenerationReconciler;
      return runtimeApp;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      const healthRes = await fetch(`${handle.url}/health`);
      expect(healthRes.status).toBe(200);
      await handle.runtimeReady;
    } finally {
      await handle.close();
    }

    expect(stopExtensionGenerationReconciler).toHaveBeenCalledOnce();
    expect(
      stopExtensionGenerationReconciler.mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(bridge.shutdown).mock.invocationCallOrder[0]!);
  });

  it('seals and drains admitted session maintenance before bridge shutdown', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-maintenance-drain-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const bridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    let finishMaintenance!: () => void;
    const maintenanceGate = new Promise<void>((resolve) => {
      finishMaintenance = resolve;
    });
    const sealMaintenanceAndWait = vi.fn(() => maintenanceGate);
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      const runtimeApp = express();
      runtimeApp.locals['sessionArchiveCoordinator'] = {
        sealMaintenanceAndWait,
      };
      return runtimeApp;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );
    await handle.runtimeReady;

    const close = handle.close();
    expect(sealMaintenanceAndWait).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(bridge.shutdown).not.toHaveBeenCalled();

    finishMaintenance();
    await close;
    expect(bridge.shutdown).toHaveBeenCalledOnce();
  });

  it('propagates an admitted session maintenance drain failure', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-maintenance-failure-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const bridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    const sealMaintenanceAndWait = vi.fn(async () => {
      throw new Error('maintenance drain failed');
    });
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      const runtimeApp = express();
      runtimeApp.locals['sessionArchiveCoordinator'] = {
        sealMaintenanceAndWait,
      };
      return runtimeApp;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );
    await handle.runtimeReady;

    await expect(handle.close()).rejects.toThrow('maintenance drain failed');
    expect(sealMaintenanceAndWait).toHaveBeenCalledOnce();
    expect(bridge.shutdown).not.toHaveBeenCalled();
  });

  it('does not cancel deferred runtime once startup is already running', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-close-running-')),
    );
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    const resolveTelemetrySettings = vi
      .spyOn(o1codeCore, 'resolveTelemetrySettings')
      .mockReturnValue(telemetryPromise);
    const bridge = makeRuntimeBridge();
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValue(
        bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    const healthRes = await fetch(`${handle.url}/health`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ status: 'ok' });
    await vi.waitFor(
      () => expect(resolveTelemetrySettings).toHaveBeenCalledTimes(1),
      { timeout: 500 },
    );

    const closePromise = handle.close();
    resolveTelemetry?.({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    await closePromise;

    expect(createBridge).toHaveBeenCalledTimes(1);
    await expect(handle.runtimeReady).rejects.toThrow(
      'Daemon runtime stopped before mounting.',
    );
  });

  it('disposes a deferred runtime app that finishes after the shutdown wait', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-close-late-app-')),
    );
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    const resolveTelemetrySettings = vi
      .spyOn(o1codeCore, 'resolveTelemetrySettings')
      .mockReturnValue(telemetryPromise);
    const bridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    const stopExtensionGenerationReconciler = vi.fn();
    const stopScheduledTaskKeepalive = vi.fn(() => {
      throw new Error('keepalive dispose failed');
    });
    const stopWorkspaceGitState = vi.fn();
    const stopSubSession = vi.fn();
    const disposeEventLoopMonitor = vi.fn();
    vi.spyOn(o1codeCore, 'startEventLoopLagMonitor').mockReturnValueOnce({
      snapshot: () => ({
        meanMs: 0,
        p50Ms: 0,
        p99Ms: 0,
        maxMs: 0,
      }),
      dispose: disposeEventLoopMonitor,
    });
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      const runtimeApp = express();
      runtimeApp.locals['stopExtensionGenerationReconciler'] =
        stopExtensionGenerationReconciler;
      runtimeApp.locals['stopScheduledTaskKeepalive'] =
        stopScheduledTaskKeepalive;
      runtimeApp.locals['stopWorkspaceGitState'] = stopWorkspaceGitState;
      let subSessionStoppers: Array<() => void> = [];
      Object.defineProperty(runtimeApp.locals, 'subSessionStoppers', {
        configurable: true,
        get: () => subSessionStoppers,
        set: (stoppers: Array<() => void>) => {
          stoppers.push(stopSubSession);
          subSessionStoppers = stoppers;
        },
      });
      return runtimeApp;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    const healthRes = await fetch(`${handle.url}/health`);
    expect(healthRes.status).toBe(200);
    await vi.waitFor(
      () => expect(resolveTelemetrySettings).toHaveBeenCalledTimes(1),
      { timeout: 500 },
    );

    const nativeSetTimeout = globalThis.setTimeout;
    let acceleratedRuntimeWait = false;
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((
        callback: (...args: unknown[]) => void,
        delay?: number,
        ...args: unknown[]
      ) => {
        if (!acceleratedRuntimeWait && delay === 5_000) {
          acceleratedRuntimeWait = true;
          return nativeSetTimeout(callback, 0, ...args);
        }
        return nativeSetTimeout(callback, delay, ...args);
      }) as typeof setTimeout);
    try {
      await handle.close();
    } finally {
      setTimeoutSpy.mockRestore();
    }
    expect(stopExtensionGenerationReconciler).not.toHaveBeenCalled();

    resolveTelemetry?.({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });

    await vi.waitFor(
      () => expect(stopExtensionGenerationReconciler).toHaveBeenCalledOnce(),
      { timeout: 1_000 },
    );
    expect(stopScheduledTaskKeepalive).toHaveBeenCalledOnce();
    expect(stopWorkspaceGitState).toHaveBeenCalledOnce();
    expect(stopSubSession).toHaveBeenCalledOnce();
    expect(disposeEventLoopMonitor).toHaveBeenCalledOnce();
    expect(bridge.shutdown).toHaveBeenCalledOnce();
    await expect(handle.runtimeReady).rejects.toThrow(
      'Daemon runtime stopped before mounting.',
    );
  });

  it('does not retry deferred runtime after startup failure and later health probe', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-health-fail-once-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const createBridge = vi
      .spyOn(acpBridge, 'createAcpSessionBridge')
      .mockImplementation(() => {
        throw new Error('runtime boom');
      });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        resolveOnListen: true,
        deferRuntimeUntilFirstHealth: true,
        runtimeStartupTimeoutMs: 0,
      },
    );

    try {
      const firstHealthRes = await fetch(`${handle.url}/health`);
      expect(firstHealthRes.status).toBe(200);
      expect(await firstHealthRes.json()).toEqual({ status: 'ok' });
      await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
      expect(createBridge).toHaveBeenCalledTimes(1);

      const secondHealthRes = await fetch(`${handle.url}/health`);
      expect(secondHealthRes.status).toBe(503);
      expect(await secondHealthRes.json()).toMatchObject({
        status: 'degraded',
        error: 'runtime boom',
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(createBridge).toHaveBeenCalledTimes(1);
    } finally {
      await handle.close();
    }
  });

  it('flushes runtime startup failures to the daemon log when closing', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-fail-log-')),
    );
    const originalRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
      throw new Error('runtime boom');
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
      await handle.close();
      const daemonDir = path.join(tmpDir, 'debug', 'daemon');
      const logFile = fs
        .readdirSync(daemonDir)
        .find((file) => file.endsWith('.log'));
      expect(logFile).toBeDefined();
      const logContent = fs.readFileSync(
        path.join(daemonDir, logFile!),
        'utf8',
      );
      expect(logContent).toContain('runtime startup failed');
      expect(logContent).toContain('runtime boom');
    } finally {
      if (handle.server.listening) {
        await handle.close();
      }
      if (originalRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = originalRuntimeDir;
      }
    }
  });

  it('does not block shutdown on pending metrics flush', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-flush-pending-')),
    );
    const forceFlushMetrics = vi.spyOn(o1codeCore, 'forceFlushMetrics');
    forceFlushMetrics.mockReturnValue(new Promise<void>(() => {}));
    const bridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
      isChannelLive: vi.fn().mockReturnValue(true),
    } as unknown as HttpAcpBridge;
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    await expect(handle.runtimeReady).resolves.toBeUndefined();
    let timeout: NodeJS.Timeout | undefined;
    const closeResult = await Promise.race([
      handle.close().then(() => 'closed'),
      new Promise<'timed-out'>((resolve) => {
        timeout = setTimeout(() => resolve('timed-out'), 1_000);
        timeout.unref();
      }),
    ]);
    if (timeout) clearTimeout(timeout);

    expect(closeResult).toBe('closed');
    expect(forceFlushMetrics).toHaveBeenCalledTimes(1);
    expect(bridge.shutdown).toHaveBeenCalledTimes(1);
  });

  it('accumulates prompt queue wait stats in daemon status perf data', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-queue-wait-')),
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockResolvedValue({
      enabled: false,
      sensitiveSpanAttributeMaxLength: 1024 * 1024,
    });
    const telemetry: ReturnType<typeof o1codeCore.createDaemonBridgeTelemetry> =
      {
        captureContext() {
          return undefined;
        },
        runWithContext(_captured, fn) {
          return fn();
        },
        withSpan(_operation, _attributes, fn) {
          return fn();
        },
        event: vi.fn(),
        injectPromptContext(request) {
          return request;
        },
      };
    vi.spyOn(o1codeCore, 'createDaemonBridgeTelemetry').mockReturnValue(
      telemetry,
    );
    const recordPromptQueueWait = vi.spyOn(
      o1codeCore,
      'recordDaemonPromptQueueWait',
    );
    const bridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await handle.runtimeReady;
      telemetry.metrics?.promptQueueWait(10);
      telemetry.metrics?.promptQueueWait(30);
      telemetry.metrics?.promptQueueWait(5);

      const res = await fetch(`${handle.url}/daemon/status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        runtime?: {
          perf?: {
            promptQueueWait?: {
              count: number;
              meanMs: number;
              maxMs: number;
              lastMs: number | null;
            };
          };
        };
      };
      expect(body.runtime?.perf?.promptQueueWait).toEqual({
        count: 3,
        meanMs: 15,
        maxMs: 30,
        lastMs: 5,
      });
      expect(recordPromptQueueWait).toHaveBeenNthCalledWith(1, 10);
      expect(recordPromptQueueWait).toHaveBeenNthCalledWith(2, 30);
      expect(recordPromptQueueWait).toHaveBeenNthCalledWith(3, 5);
    } finally {
      await handle.close();
    }
  });

  it('fails runtimeReady and health when runtime startup times out', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-timeout-')),
    );
    let resolveTelemetry:
      | ((settings: o1codeCore.ResolvedTelemetrySettings) => void)
      | undefined;
    const telemetryPromise = new Promise<o1codeCore.ResolvedTelemetrySettings>(
      (resolve) => {
        resolveTelemetry = resolve;
      },
    );
    vi.spyOn(o1codeCore, 'resolveTelemetrySettings').mockReturnValue(
      telemetryPromise,
    );
    const bridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
      isChannelLive: vi.fn().mockReturnValue(true),
    } as unknown as HttpAcpBridge;
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true, runtimeStartupTimeoutMs: 1 },
    );

    try {
      await expect(handle.runtimeReady).rejects.toThrow(
        'Daemon runtime startup timed out after 1ms.',
      );
      const healthRes = await fetch(`${handle.url}/health`);
      expect(healthRes.status).toBe(503);
      expect(await healthRes.json()).toMatchObject({
        status: 'degraded',
        error: 'Daemon runtime startup timed out after 1ms.',
      });
      expect(() => handle.bridge.getDaemonStatusSnapshot()).toThrow(
        'Daemon bridge runtime is not available: Daemon runtime startup timed out after 1ms.',
      );

      resolveTelemetry?.({
        enabled: false,
        sensitiveSpanAttributeMaxLength: 1024 * 1024,
      });
      await vi.waitFor(() => {
        expect(bridge.shutdown).toHaveBeenCalledTimes(1);
      });
    } finally {
      await handle.close();
    }
  });

  it('reports bootstrap status and capabilities when fast path resolves on listen', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-fail-')),
    );
    const originalClientMcpOverWs =
      process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
    delete process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
    const boundWorkspace = canonicalizeWorkspace(tmpDir);
    const blockedLogBaseDir = path.join(tmpDir, 'blocked-log-base');
    fs.writeFileSync(blockedLogBaseDir, 'not a directory');
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
      throw new Error('runtime boom');
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        sessionRestoreTimeoutMs: 90_000,
        serveWebShell: false,
      },
      { resolveOnListen: true, daemonLogBaseDir: blockedLogBaseDir },
    );

    try {
      await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
      const healthRes = await fetch(`${handle.url}/health`);
      expect(healthRes.status).toBe(503);
      expect(await healthRes.json()).toMatchObject({
        status: 'degraded',
        error: 'runtime boom',
      });
      const unknownRes = await fetch(`${handle.url}/unknown-route`);
      expect(unknownRes.status).toBe(503);
      expect(await unknownRes.json()).toMatchObject({
        error: 'Daemon runtime failed to start',
        code: 'daemon_runtime_failed',
      });

      const capabilitiesRes = await fetch(`${handle.url}/capabilities`, {
        headers: { Origin: handle.url },
      });
      expect(capabilitiesRes.status).toBe(200);
      const capabilitiesBody = await capabilitiesRes.json();
      expect(capabilitiesBody).toMatchObject({
        v: 1,
        protocolVersions: { current: 'v1', supported: ['v1'] },
        mode: 'http-bridge',
        features: expect.arrayContaining([
          'capabilities',
          'daemon_status',
          'workspace_settings',
          'workspace_reload',
          'workspace_acp_preheat',
          'workspace_acp_status',
          'persistent_workspace_registration',
          'workspace_runtime_removal',
          'workspace_runtime',
        ]),
        modelServices: [],
        workspaceCwd: boundWorkspace,
        transports: ['rest'],
        policy: { permission: 'first-responder' },
        limits: {
          maxPendingPromptsPerSession: 5,
          sessionRestoreTimeoutMs: 90_000,
        },
      });
      expect(capabilitiesBody.features).not.toContain('client_mcp_over_ws');
      expect(capabilitiesBody.features).not.toContain(
        'scheduled_task_session_reuse',
      );

      const port = new URL(handle.url).port;
      for (const origin of [
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        `http://[::1]:${port}`,
        `http://host.docker.internal:${port}`,
      ]) {
        const sameOriginRes = await fetch(`${handle.url}/capabilities`, {
          headers: { Origin: origin },
        });
        expect(sameOriginRes.status).toBe(200);
      }

      const crossOriginRes = await fetch(`${handle.url}/capabilities`, {
        headers: { Origin: 'http://example.com' },
      });
      expect(crossOriginRes.status).toBe(403);

      const res = await fetch(`${handle.url}/daemon/status`);
      const body = (await res.json()) as {
        status?: string;
        issues?: Array<{ code?: string; severity?: string }>;
        daemon?: {
          runId?: string;
          logMode?: string;
          logHealth?: string;
        };
        runtime?: { loading?: boolean; error?: string };
      };
      expect(body).toMatchObject({
        status: 'error',
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'daemon_runtime_failed',
            severity: 'error',
          }),
          expect.objectContaining({
            code: 'daemon_log_degraded',
            severity: 'warning',
          }),
        ]),
        daemon: {
          runId: expect.stringMatching(/^[0-9a-f]{32}$/),
          logMode: 'stderr-only',
          logHealth: 'degraded',
        },
        runtime: { loading: false, error: 'runtime boom' },
      });

      const sameOriginRes = await fetch(
        `${handle.url}/daemon/status?detail=full`,
        {
          headers: { Origin: handle.url },
        },
      );
      expect(sameOriginRes.status).toBe(200);
      const sameOriginBody = await sameOriginRes.json();
      expect(sameOriginBody).toMatchObject({
        v: 1,
        detail: 'full',
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'daemon_log_degraded',
            severity: 'warning',
          }),
        ]),
        daemon: {
          runId: body.daemon?.runId,
          logMode: 'stderr-only',
          logHealth: 'degraded',
          logIssues: ['init_failed'],
          logDroppedRecords: 0,
          logDroppedBytes: 0,
        },
        security: { allowOriginMode: 'none' },
        limits: {
          maxSessions: 1,
          maxPendingPromptsPerSession: 5,
          listenerMaxConnections: 256,
          eventRingSize: 8_000,
          compactedReplayMaxBytes: 4 * 1024 * 1024,
          maxJournalEvents: 10_000,
          maxJournalBytes: 8 * 1024 * 1024,
          promptDeadlineMs: null,
          writerIdleTimeoutMs: null,
          channelIdleTimeoutMs: 0,
          sessionIdleTimeoutMs: 1_800_000,
          sessionPromptSettledCloseGraceMs: 0,
          acpConnectionCap: null,
          memory: expect.objectContaining({ enforced: false }),
        },
        capabilities: {
          protocolVersions: { current: 'v1', supported: ['v1'] },
          features: expect.arrayContaining(['daemon_status']),
        },
        runtime: {
          loading: false,
          error: 'runtime boom',
          sessions: { active: 0 },
          permissions: { pending: 0, policy: 'first-responder' },
          channel: { live: false },
          transport: {
            restSseActive: 0,
            acp: { enabled: false },
          },
          rateLimit: {
            enabled: false,
            rejectedSinceStart: { prompt: 0, mutation: 0, read: 0 },
          },
        },
        full: {
          sessions: [],
          acpMounts: [],
          acpConnections: [],
          workspace: {},
        },
      });
      expect(sameOriginBody.daemon).not.toHaveProperty('logPath');
    } finally {
      if (originalClientMcpOverWs === undefined) {
        delete process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'];
      } else {
        process.env['O1CODE_SERVE_CLIENT_MCP_OVER_WS'] =
          originalClientMcpOverWs;
      }
      await handle.close();
    }
  });

  it('reports the journal growth pool on bootstrap daemon status', async () => {
    // The bootstrap route derives the pool from the resolved budget; pin
    // the host figure so the expectation is runner-independent.
    mockTotalMemBytes.value = 8 * 1024 * 1024 * 1024;
    const constrainedSpy = vi
      .spyOn(
        process as { constrainedMemory: () => number },
        'constrainedMemory',
      )
      .mockReturnValue(0);
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-growth-')),
    );
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
      throw new Error('runtime boom');
    });
    try {
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { resolveOnListen: true },
      );
      try {
        await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
        const res = await fetch(`${handle.url}/daemon/status`);
        const body = (await res.json()) as {
          limits: {
            memory: {
              journalGrowth: {
                poolBytes: number;
                hardCapBytes: number;
                baselineMaxEvents: number;
                baselineMaxBytes: number;
              } | null;
            };
          };
        };
        expect(body.limits.memory.journalGrowth).toEqual({
          poolBytes:
            journalGrowthPoolMb(
              resolveDaemonMemoryBudget({ availableMemoryMb: 8 * 1024 }),
            ) *
            1024 *
            1024,
          hardCapBytes: JOURNAL_GROWTH_HARD_CAP_BYTES,
          baselineMaxEvents: DEFAULT_MAX_JOURNAL_EVENTS,
          baselineMaxBytes: DEFAULT_MAX_JOURNAL_BYTES,
        });
      } finally {
        await handle.close();
      }

      const pinned = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
          maxJournalBytes: 16 * 1024 * 1024,
        },
        { resolveOnListen: true },
      );
      try {
        await expect(pinned.runtimeReady).rejects.toThrow('runtime boom');
        const res = await fetch(`${pinned.url}/daemon/status`);
        const body = (await res.json()) as {
          limits: {
            memory: { journalGrowth: unknown };
          };
        };
        expect(body.limits.memory.journalGrowth).toBeNull();
      } finally {
        await pinned.close();
      }
    } finally {
      constrainedSpy.mockRestore();
      mockTotalMemBytes.value = undefined;
    }
  });

  it.each([true, false])(
    'mirrors the native directory picker probe on the bootstrap envelopes (available: %s)',
    async (available) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-picker-')),
      );
      // Keep the runtime from mounting so the bootstrap `/capabilities` and
      // `/daemon/status` envelopes stay the ones being served.
      vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
        throw new Error('runtime boom');
      });
      const probe = vi
        .spyOn(nativeDirectoryPicker, 'isNativeDirectoryPickerAvailable')
        .mockReturnValue(available);
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { resolveOnListen: true },
      );
      try {
        await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
        const probeCallsAfterBoot = probe.mock.calls.length;
        const capabilities = (await (
          await fetch(`${handle.url}/capabilities`)
        ).json()) as { features: string[] };
        const status = (await (
          await fetch(`${handle.url}/daemon/status`)
        ).json()) as { capabilities: { features: string[] } };
        if (available) {
          expect(capabilities.features).toContain('native_directory_picker');
          expect(status.capabilities.features).toContain(
            'native_directory_picker',
          );
        } else {
          expect(capabilities.features).not.toContain(
            'native_directory_picker',
          );
          expect(status.capabilities.features).not.toContain(
            'native_directory_picker',
          );
        }
        // Probed once while the bootstrap app was built, not per request.
        expect(probe.mock.calls.length).toBe(probeCallsAfterBoot);
      } finally {
        await handle.close();
      }
    },
  );

  it.each([true, false])(
    'mirrors the local path open probe on the bootstrap envelopes (available: %s)',
    async (available) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-open-')),
      );
      // Keep the runtime from mounting so the bootstrap `/capabilities` and
      // `/daemon/status` envelopes stay the ones being served.
      vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
        throw new Error('runtime boom');
      });
      const probe = vi
        .spyOn(localPathOpen, 'isLocalPathOpenAvailable')
        .mockReturnValue(available);
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { resolveOnListen: true },
      );
      try {
        await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
        const probeCallsAfterBoot = probe.mock.calls.length;
        const capabilities = (await (
          await fetch(`${handle.url}/capabilities`)
        ).json()) as { features: string[] };
        const status = (await (
          await fetch(`${handle.url}/daemon/status`)
        ).json()) as { capabilities: { features: string[] } };
        if (available) {
          expect(capabilities.features).toContain('workspace_local_open');
          expect(status.capabilities.features).toContain(
            'workspace_local_open',
          );
        } else {
          expect(capabilities.features).not.toContain('workspace_local_open');
          expect(status.capabilities.features).not.toContain(
            'workspace_local_open',
          );
        }
        // Probed once while the bootstrap app was built, not per request.
        expect(probe.mock.calls.length).toBe(probeCallsAfterBoot);
      } finally {
        await handle.close();
      }
    },
  );

  it.each([true, false])(
    'mirrors the local terminal open probe on the bootstrap envelopes (available: %s)',
    async (available) => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'qws-bootstrap-terminal-')),
      );
      // Keep the runtime from mounting so the bootstrap `/capabilities` and
      // `/daemon/status` envelopes stay the ones being served.
      vi.spyOn(acpBridge, 'createAcpSessionBridge').mockImplementation(() => {
        throw new Error('runtime boom');
      });
      const probe = vi
        .spyOn(localPathOpen, 'isLocalTerminalAvailable')
        .mockReturnValue(available);
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { resolveOnListen: true },
      );
      try {
        await expect(handle.runtimeReady).rejects.toThrow('runtime boom');
        const probeCallsAfterBoot = probe.mock.calls.length;
        const capabilities = (await (
          await fetch(`${handle.url}/capabilities`)
        ).json()) as { features: string[] };
        const status = (await (
          await fetch(`${handle.url}/daemon/status`)
        ).json()) as { capabilities: { features: string[] } };
        if (available) {
          expect(capabilities.features).toContain('workspace_local_terminal');
          expect(status.capabilities.features).toContain(
            'workspace_local_terminal',
          );
        } else {
          expect(capabilities.features).not.toContain(
            'workspace_local_terminal',
          );
          expect(status.capabilities.features).not.toContain(
            'workspace_local_terminal',
          );
        }
        // Probed once while the bootstrap app was built, not per request.
        expect(probe.mock.calls.length).toBe(probeCallsAfterBoot);
      } finally {
        await handle.close();
      }
    },
  );

  it('shuts down a bridge when runtime mounting fails after bridge creation', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-partial-fail-')),
    );
    const bridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
    } as unknown as HttpAcpBridge;
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      throw new Error('runtime app boom');
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await expect(handle.runtimeReady).rejects.toThrow('runtime app boom');
      expect(bridge.shutdown).toHaveBeenCalledTimes(1);
    } finally {
      await handle.close();
    }
    expect(bridge.shutdown).toHaveBeenCalledTimes(1);
  });

  it('shuts down all workspace bridges when multi-workspace runtime mounting fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-partial-fail-')),
    );
    const primary = path.join(tmpDir, 'primary');
    const secondary = path.join(tmpDir, 'secondary');
    fs.mkdirSync(primary);
    fs.mkdirSync(secondary);
    const primaryBridge = makeRuntimeBridge();
    const secondaryBridge = makeRuntimeBridge();
    vi.spyOn(acpBridge, 'createAcpSessionBridge')
      .mockReturnValueOnce(
        primaryBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      )
      .mockReturnValueOnce(
        secondaryBridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
      );
    vi.spyOn(serverModule, 'createServeApp').mockImplementation(() => {
      throw new Error('runtime app boom');
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    try {
      await expect(handle.runtimeReady).rejects.toThrow('runtime app boom');
      expect(primaryBridge.shutdown).toHaveBeenCalledTimes(1);
      expect(secondaryBridge.shutdown).toHaveBeenCalledTimes(1);
    } finally {
      await handle.close();
    }
    expect(primaryBridge.shutdown).toHaveBeenCalledTimes(1);
    expect(secondaryBridge.shutdown).toHaveBeenCalledTimes(1);
  });

  it('cleans up runtime locals when closed immediately after listening', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-close-')),
    );
    const bridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
    } as unknown as HttpAcpBridge;
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    const dispose = vi.fn();
    const attachServer = vi.fn();
    const originalCreateServeApp = serverModule.createServeApp;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      const app = originalCreateServeApp(...args);
      app.locals['acpHandle'] = {
        attachServer,
        dispose,
        getSnapshot: () => ({
          connectionCount: 0,
          connectionStreams: 0,
          sessionStreams: 0,
          sseStreams: 0,
          wsStreams: 0,
          pendingClientRequests: 0,
          mounts: [],
          connections: [],
        }),
        registry: { getSnapshot: () => undefined },
      };
      return app;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    await handle.close();

    expect(bridge.shutdown).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the daemon event loop monitor when closed after listening', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-runtime-monitor-close-')),
    );
    const bridge = {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
    } as unknown as HttpAcpBridge;
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    const dispose = vi.fn();
    vi.spyOn(o1codeCore, 'startEventLoopLagMonitor').mockReturnValueOnce({
      snapshot: () => ({
        meanMs: 0,
        p50Ms: 0,
        p99Ms: 0,
        maxMs: 0,
      }),
      dispose,
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { resolveOnListen: true },
    );

    await handle.close();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

// Simulate the refresh chunk vanishing under a running daemon (an in-place
// upgrade replacing dist/): the module factory throws, so the first
// health-triggered runtime build's dynamic import rejects.
vi.mock('./server/session-pr-refresh.js', () => {
  throw new Error(
    'Cannot find module session-pr-refresh (simulated chunk replacement)',
  );
});

describe('session-pr-refresh degraded load on the serve fast path', () => {
  let tmpDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('degrades to no PR-state sweep instead of leaking an unhandled rejection', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-pr-refresh-degrade-')),
    );
    // The serve fast path installs no process-level unhandledRejection
    // handler before the runtime builds, so record them here: without the
    // import's .catch the rejection escapes and Node's default is to exit.
    const rejections: unknown[] = [];
    const recordRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', recordRejection);
    let handle: RunHandle | undefined;
    try {
      ({ handle } = await startDeferredDaemon(tmpDir));
      const health = await fetch(`${handle.url}/health`);
      expect(health.status).toBe(200);
      // The first health schedules the runtime build; the refresh module
      // import fires inside it and rejects on the next turns.
      await expect(handle.runtimeReady).resolves.toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(rejections).toEqual([]);
      // The intended degradation is "no PR-state sweep" — the daemon keeps
      // serving everything else.
      const healthAfter = await fetch(`${handle.url}/health`);
      expect(healthAfter.status).toBe(200);
    } finally {
      process.off('unhandledRejection', recordRejection);
      await handle?.close();
    }
  });
});

describe('runO1CodeServe Web Shell signals on RunHandle', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function makeFakeBridge(): HttpAcpBridge {
    return {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
      isChannelLive: vi.fn().mockReturnValue(true),
    } as unknown as HttpAcpBridge;
  }

  async function bootHandle(extra: {
    serveWebShell?: boolean;
    token?: string;
    experimentalLsp?: boolean;
    restoreAskUserQuestion?: boolean;
  }) {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    return runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        ...extra,
      },
      {
        bridge: makeFakeBridge(),
        daemonLogBaseDir: path.join(tmpDir, 'debug'),
      },
    );
  }

  it('reports webShellMounted=false when serveWebShell is false (--no-web)', async () => {
    const handle = await bootHandle({ serveWebShell: false });
    try {
      expect(handle.webShellMounted).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it('rejects before creating a listener when required Web Shell assets disappear after pre-check', async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    const resolveWebShellDir = vi
      .spyOn(webShellResolver, 'resolveWebShellDir')
      .mockReturnValueOnce('/tmp/web-shell')
      .mockReturnValueOnce(undefined);
    const httpServerFactory = vi.fn(() => {
      throw new Error('listener created');
    });
    const serveOptions = {
      port: 0,
      hostname: '127.0.0.1',
      mode: 'http-bridge' as const,
      workspace: tmpDir,
      maxSessions: 1,
    };

    applyOpenWithAuth(serveOptions);

    await expect(
      runO1CodeServe(serveOptions, {
        bridge: makeFakeBridge(),
        httpServerFactory,
      }),
    ).rejects.toThrow('--open-with-auth requires built Web Shell assets.');
    expect(resolveWebShellDir).toHaveBeenCalledTimes(2);
    expect(httpServerFactory).not.toHaveBeenCalled();
  });

  it('exposes the trimmed bearer token as resolvedToken', async () => {
    const handle = await bootHandle({ token: '  secret-token  ' });
    try {
      expect(handle.resolvedToken).toBe('secret-token');
    } finally {
      await handle.close();
    }
  });

  it('leaves resolvedToken undefined when no token is configured', async () => {
    const handle = await bootHandle({});
    try {
      expect(handle.resolvedToken).toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it('passes --experimental-lsp to spawned ACP children only when opted in', async () => {
    mockCreateSpawnChannelFactoryOptions.length = 0;

    const defaultHandle = await bootHandle({ serveWebShell: false });
    await defaultHandle.close();
    expect(mockCreateSpawnChannelFactoryOptions.at(-1)).not.toHaveProperty(
      'extraArgs',
    );

    const lspHandle = await bootHandle({
      serveWebShell: false,
      experimentalLsp: true,
    });
    await lspHandle.close();
    expect(mockCreateSpawnChannelFactoryOptions.at(-1)).toMatchObject({
      extraArgs: ['--experimental-lsp'],
    });
  });

  it('merges --restore-ask-user-question with --experimental-lsp on ACP children', async () => {
    mockCreateSpawnChannelFactoryOptions.length = 0;

    const handle = await bootHandle({
      serveWebShell: false,
      experimentalLsp: true,
      restoreAskUserQuestion: true,
    });
    await handle.close();
    expect(mockCreateSpawnChannelFactoryOptions.at(-1)).toMatchObject({
      extraArgs: ['--experimental-lsp', '--restore-ask-user-question'],
    });
  });

  // The daemon scrubs loader vars from its own
  // process.env (session subprocesses run here in other workspaces' cwds)
  // AND from the frozen base env the session-hosting children spawn with —
  // a loader var reaching the ACP child runs during Node bootstrap, before
  // the child's own post-boot scrub could remove it.
  it('scrubs loader env vars from the daemon process and the session-child base env', async () => {
    const previousNodeOptions = process.env['NODE_OPTIONS'];
    const previousNodePath = process.env['NODE_PATH'];
    process.env['NODE_OPTIONS'] =
      '--import file:///other-checkout/register.mjs';
    process.env['NODE_PATH'] = '/other-checkout/node_modules';
    mockCreateSpawnChannelFactoryOptions.length = 0;
    const stderrWrites: string[] = [];
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    try {
      const handle = await bootHandle({ serveWebShell: false });
      try {
        expect(process.env['NODE_OPTIONS']).toBeUndefined();
        expect(process.env['NODE_PATH']).toBeUndefined();
        // The scrub must leave a breadcrumb naming the removed keys so a
        // subprocess missing an inherited var can be traced back to it.
        expect(stderrWrites.join('')).toContain(
          'scrubbed inherited loader env vars',
        );
        expect(stderrWrites.join('')).toContain('NODE_OPTIONS');
        expect(stderrWrites.join('')).toContain('NODE_PATH');
        const sourceEnv = mockCreateSpawnChannelFactoryOptions.at(-1)?.[
          'sourceEnv'
        ] as NodeJS.ProcessEnv | undefined;
        expect(sourceEnv?.['NODE_OPTIONS']).toBeUndefined();
        expect(sourceEnv?.['NODE_PATH']).toBeUndefined();
      } finally {
        await handle.close();
      }
      // runO1CodeServe is a documented embeddable entry point; close() must
      // hand the host process its launch environment back.
      expect(process.env['NODE_OPTIONS']).toBe(
        '--import file:///other-checkout/register.mjs',
      );
      expect(process.env['NODE_PATH']).toBe('/other-checkout/node_modules');
    } finally {
      stderrWrite.mockRestore();
      if (previousNodeOptions === undefined) {
        delete process.env['NODE_OPTIONS'];
      } else {
        process.env['NODE_OPTIONS'] = previousNodeOptions;
      }
      if (previousNodePath === undefined) {
        delete process.env['NODE_PATH'];
      } else {
        process.env['NODE_PATH'] = previousNodePath;
      }
    }
  });

  // The dev harness (scripts/dev.js) stamps DEV=true into the same env that
  // carries the tsx loader: dev-mode ACP children and channel workers boot
  // .ts entries and still need the loader, so only then does the frozen
  // base env keep loader vars.
  it('keeps loader vars in the session-child base env under the dev harness', async () => {
    const previousDev = process.env['DEV'];
    const previousNodeOptions = process.env['NODE_OPTIONS'];
    process.env['DEV'] = 'true';
    process.env['NODE_OPTIONS'] =
      '--import file:///other-checkout/register.mjs';
    mockCreateSpawnChannelFactoryOptions.length = 0;
    try {
      const handle = await bootHandle({ serveWebShell: false });
      try {
        const sourceEnv = mockCreateSpawnChannelFactoryOptions.at(-1)?.[
          'sourceEnv'
        ] as NodeJS.ProcessEnv | undefined;
        expect(sourceEnv?.['NODE_OPTIONS']).toBe(
          '--import file:///other-checkout/register.mjs',
        );
      } finally {
        await handle.close();
      }
    } finally {
      if (previousDev === undefined) {
        delete process.env['DEV'];
      } else {
        process.env['DEV'] = previousDev;
      }
      if (previousNodeOptions === undefined) {
        delete process.env['NODE_OPTIONS'];
      } else {
        process.env['NODE_OPTIONS'] = previousNodeOptions;
      }
    }
  });

  // DEV gates the scrub and must only come from the launch environment: a
  // workspace .env carrying DEV=true cannot keep loader vars in the
  // session-child base env (the loader-var vector by way of a spoofable gate).
  it('scrubs loader vars even when a workspace .env sets DEV=true', async () => {
    const previousDev = process.env['DEV'];
    const previousNodeOptions = process.env['NODE_OPTIONS'];
    const previousO1CodeRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    delete process.env['DEV'];
    process.env['NODE_OPTIONS'] =
      '--import file:///other-checkout/register.mjs';
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    fs.writeFileSync(path.join(tmpDir, '.env'), 'DEV=true\n');
    mockCreateSpawnChannelFactoryOptions.length = 0;
    try {
      loadServeFastPathEnvironment({}, tmpDir);
      // The hardcoded exclusion keeps DEV out of process.env entirely —
      // both from .env files and from settings.env.
      expect(process.env['DEV']).toBeUndefined();
      loadServeFastPathEnvironment({ env: { DEV: 'true' } }, tmpDir);
      expect(process.env['DEV']).toBeUndefined();
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      try {
        const sourceEnv = mockCreateSpawnChannelFactoryOptions.at(-1)?.[
          'sourceEnv'
        ] as NodeJS.ProcessEnv | undefined;
        expect(sourceEnv?.['NODE_OPTIONS']).toBeUndefined();
      } finally {
        await handle.close();
      }
    } finally {
      if (previousDev === undefined) {
        delete process.env['DEV'];
      } else {
        process.env['DEV'] = previousDev;
      }
      if (previousNodeOptions === undefined) {
        delete process.env['NODE_OPTIONS'];
      } else {
        process.env['NODE_OPTIONS'] = previousNodeOptions;
      }
      if (previousO1CodeRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = previousO1CodeRuntimeDir;
      }
    }
  });

  // Desktop/systemd-launched daemons rarely surface boot stderr, so the
  // scrub breadcrumb is additionally persisted to the durable daemon log.
  it('persists the loader env scrub decision in the daemon log', async () => {
    const previousNodeOptions = process.env['NODE_OPTIONS'];
    const previousO1CodeRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    process.env['NODE_OPTIONS'] =
      '--import file:///other-checkout/register.mjs';
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    // Point the daemon log at the temp workspace (mirrors the daemon logger
    // wiring test) so the assertion reads a test-owned file.
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      try {
        const logPath = path.join(tmpDir, 'debug', 'daemon', 'daemon.log');
        await vi.waitFor(
          () => {
            const content = fs.readFileSync(logPath, 'utf8');
            expect(content).toContain('scrubbed inherited loader env vars');
            expect(content).toContain('NODE_OPTIONS');
          },
          { timeout: 7_000, interval: 50 },
        );
      } finally {
        await handle.close();
      }
    } finally {
      if (previousNodeOptions === undefined) {
        delete process.env['NODE_OPTIONS'];
      } else {
        process.env['NODE_OPTIONS'] = previousNodeOptions;
      }
      if (previousO1CodeRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = previousO1CodeRuntimeDir;
      }
    }
  });

  // The serve fast path rejects loader keys before initDaemonLogger exists,
  // and warn-once dedupes any later daemon-side warning for the same
  // file+key, so its rejections are persisted to the durable daemon log.
  it('persists serve fast-path loader key rejections in the daemon log', async () => {
    const previousO1CodeRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    fs.writeFileSync(
      path.join(tmpDir, '.env'),
      'NODE_OPTIONS=--max-old-space-size=8192\n',
    );
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      loadServeFastPathEnvironment({}, tmpDir);
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      try {
        const logPath = path.join(tmpDir, 'debug', 'daemon', 'daemon.log');
        await vi.waitFor(
          () => {
            const content = fs.readFileSync(logPath, 'utf8');
            expect(content).toContain(
              'rejected loader-affecting env keys during serve fast-path boot',
            );
            expect(content).toContain('NODE_OPTIONS');
          },
          { timeout: 7_000, interval: 50 },
        );
      } finally {
        await handle.close();
      }
    } finally {
      stderrWrite.mockRestore();
      if (previousO1CodeRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = previousO1CodeRuntimeDir;
      }
    }
  });

  // Per-workspace .env loads keep running long after boot (skill status,
  // settings reloads); boot stderr is gone by then, so fresh loader-key
  // rejections must be mirrored into the durable daemon log.
  it('persists post-boot loader key rejections in the daemon log', async () => {
    const previousO1CodeRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    const previousNodeOptions = process.env['NODE_OPTIONS'];
    delete process.env['NODE_OPTIONS'];
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      try {
        fs.writeFileSync(
          path.join(tmpDir, '.env'),
          'NODE_OPTIONS=--max-old-space-size=8192\n',
        );
        loadEnvironment({}, tmpDir);
        const logPath = path.join(tmpDir, 'debug', 'daemon', 'daemon.log');
        await vi.waitFor(
          () => {
            const content = fs.readFileSync(logPath, 'utf8');
            expect(content).toContain(
              'rejected loader-affecting env keys; they were not applied',
            );
            expect(content).toContain('NODE_OPTIONS');
          },
          { timeout: 7_000, interval: 50 },
        );
      } finally {
        await handle.close();
      }
    } finally {
      stderrWrite.mockRestore();
      if (previousO1CodeRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = previousO1CodeRuntimeDir;
      }
      if (previousNodeOptions === undefined) {
        delete process.env['NODE_OPTIONS'];
      } else {
        process.env['NODE_OPTIONS'] = previousNodeOptions;
      }
    }
  });

  // close() uninstalls the daemon-log reporter; a later env load in the
  // same process must fall back to stderr instead of writing into the
  // closed daemon log.
  it('falls back to stderr for loader key rejections after close', async () => {
    const previousO1CodeRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    const previousNodeOptions = process.env['NODE_OPTIONS'];
    delete process.env['NODE_OPTIONS'];
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qws-ws-')));
    process.env['O1CODE_RUNTIME_DIR'] = tmpDir;
    try {
      const handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      await handle.close();

      // The file appears only after close, so no earlier report could have
      // seeded the warn-once dedup for this source.
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'NODE_OPTIONS=--max-old-space-size=8192\n',
      );
      const stderrWrites: string[] = [];
      const stderrWrite = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk) => {
          stderrWrites.push(String(chunk));
          return true;
        });
      try {
        loadEnvironment({}, tmpDir);
      } finally {
        stderrWrite.mockRestore();
      }

      const warnings = stderrWrites.filter(
        (chunk) =>
          chunk.includes('cannot set loader-affecting env vars') &&
          chunk.includes(tmpDir),
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('NODE_OPTIONS');
      expect(process.env['NODE_OPTIONS']).toBeUndefined();
    } finally {
      if (previousO1CodeRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = previousO1CodeRuntimeDir;
      }
      if (previousNodeOptions === undefined) {
        delete process.env['NODE_OPTIONS'];
      } else {
        process.env['NODE_OPTIONS'] = previousNodeOptions;
      }
    }
  });

  // runO1CodeServe is a documented embeddable entry point and startup can
  // reject after the scrub (malformed deadline env, TLS mismatch,
  // EADDRINUSE...). The close() restore is unreachable on that path, so the
  // catch must hand the host its launch environment back.
  it('restores the launch environment when startup fails after the scrub', async () => {
    const previousNodeOptions = process.env['NODE_OPTIONS'];
    const previousDeadline = process.env['O1CODE_SERVE_PROMPT_DEADLINE_MS'];
    process.env['NODE_OPTIONS'] =
      '--import file:///other-checkout/register.mjs';
    process.env['O1CODE_SERVE_PROMPT_DEADLINE_MS'] = 'not-a-number';
    try {
      await expect(bootHandle({ serveWebShell: false })).rejects.toThrow(
        /O1CODE_SERVE_PROMPT_DEADLINE_MS/u,
      );
      expect(process.env['NODE_OPTIONS']).toBe(
        '--import file:///other-checkout/register.mjs',
      );
    } finally {
      if (previousNodeOptions === undefined) {
        delete process.env['NODE_OPTIONS'];
      } else {
        process.env['NODE_OPTIONS'] = previousNodeOptions;
      }
      if (previousDeadline === undefined) {
        delete process.env['O1CODE_SERVE_PROMPT_DEADLINE_MS'];
      } else {
        process.env['O1CODE_SERVE_PROMPT_DEADLINE_MS'] = previousDeadline;
      }
    }
  });

  it('wires the pipe message observer without changing existing pipe stats', async () => {
    mockCreateSpawnChannelFactoryOptions.length = 0;

    const handle = await bootHandle({ serveWebShell: false });
    try {
      await handle.runtimeReady;
      const saturationInfo = {
        requiredBytes: 200,
        availableBytes: 20,
        maxQueuedMessages: 2,
        maxQueuedBytes: 220,
        graceMs: 10_000,
      };
      for (const options of mockCreateSpawnChannelFactoryOptions) {
        const hooks = options['pipeHooks'] as
          | {
              onQueueSaturated?: (info: typeof saturationInfo) => void;
            }
          | undefined;
        expect(hooks?.onQueueSaturated).toEqual(expect.any(Function));
        hooks?.onQueueSaturated?.(saturationInfo);
      }
      const pipeHooks = mockCreateSpawnChannelFactoryOptions.at(-1)?.[
        'pipeHooks'
      ] as
        | {
            onMessageSent?: (bytes: number) => void;
            onMessageReceived?: (bytes: number) => void;
            onMessageObserved?: (observation: {
              direction: 'sent' | 'received';
              bytes: number;
              message: unknown;
            }) => void;
          }
        | undefined;

      expect(pipeHooks?.onMessageObserved).toEqual(expect.any(Function));
      pipeHooks?.onMessageSent?.(123);
      pipeHooks?.onMessageReceived?.(456);
      pipeHooks?.onMessageObserved?.({
        direction: 'sent',
        bytes: LARGE_PIPE_FRAME_THRESHOLD_BYTES,
        message: {
          jsonrpc: '2.0',
          method: 'session/update',
          params: { update: { sessionUpdate: 'agent_message_chunk' } },
        },
      });

      const res = await fetch(`${handle.url}/daemon/status`);
      const body = (await res.json()) as {
        runtime?: {
          perf?: {
            pipe?: {
              inbound?: { count?: number; totalBytes?: number };
              outbound?: { count?: number; totalBytes?: number };
            };
          };
        };
      };

      expect(body.runtime?.perf?.pipe).toMatchObject({
        inbound: { count: 1, totalBytes: 456 },
        outbound: { count: 1, totalBytes: 123 },
      });
    } finally {
      await handle.close();
    }
    const logPath = path.join(tmpDir, 'debug', 'daemon', 'daemon.log');
    let logContent = '';
    await vi.waitFor(() => {
      logContent = fs.readFileSync(logPath, 'utf8');
      expect(logContent).toContain('ACP NDJSON decoded queue saturated');
    });
    expect(logContent).toContain('requiredBytes=200');
    expect(logContent).toContain('availableBytes=20');
    expect(logContent).toContain('maxQueuedMessages=2');
    expect(logContent).toContain('maxQueuedBytes=220');
    expect(logContent).toContain('queueSaturationGraceMs=10000');
  });
});

describe('runO1CodeServe listener, auth and shutdown', () => {
  let tmpDir: string | undefined;
  let o1codeHome: string | undefined;
  let previousO1CodeHome: string | undefined;
  beforeEach(() => {
    previousO1CodeHome = process.env['O1CODE_HOME'];
    o1codeHome = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-serve-test-home-')),
    );
    process.env['O1CODE_HOME'] = o1codeHome;
    resetServeFastPathHomeEnvBootstrapForTesting();
    settingsRuntime.resetHomeEnvBootstrapForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    if (o1codeHome) {
      fs.rmSync(o1codeHome, { recursive: true, force: true });
      o1codeHome = undefined;
    }
    if (previousO1CodeHome === undefined) delete process.env['O1CODE_HOME'];
    else process.env['O1CODE_HOME'] = previousO1CodeHome;
    previousO1CodeHome = undefined;
    resetServeFastPathHomeEnvBootstrapForTesting();
    settingsRuntime.resetHomeEnvBootstrapForTesting();
  });

  function makeFakeBridge(onShutdown?: () => void): HttpAcpBridge {
    return {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockImplementation(async () => {
        onShutdown?.();
      }),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
      isChannelLive: vi.fn().mockReturnValue(true),
    } as unknown as HttpAcpBridge;
  }

  it('refuses tokenless localhost resolving outside loopback instead of generating a token', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-localhost-remote-')),
    );
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: 'localhost',
            mode: 'http-bridge',
            workspace: tmpDir,
            serveWebShell: false,
          },
          {
            bridge: makeFakeBridge(),
            bindHostnameLookup: async () => ({
              address: '192.0.2.1',
              family: 4,
            }),
          },
        ),
      ).rejects.toThrow(/token/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('refuses an empty --hostname as operator error', async () => {
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    try {
      await expect(
        runO1CodeServe({
          port: 0,
          hostname: '',
          mode: 'http-bridge',
          serveWebShell: false,
        }),
      ).rejects.toThrow(/empty value binds every interface/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('prints the quickstart with the resolved listener arguments', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-quickstart-args-')),
    );
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe({
        port: 0,
        hostname: '0.0.0.0',
        mode: 'http-bridge',
        serveWebShell: false,
        workspace: tmpDir,
      });
      expect(mockRemoteQuickstart.print).toHaveBeenCalledOnce();
      const arg = mockRemoteQuickstart.print.mock.calls[0][0];
      expect(arg.bind).toBe('0.0.0.0');
      expect(arg.boundAddress).toBe('0.0.0.0');
      expect(arg.port).toBe(
        (started.server.address() as { port: number }).port,
      );
      expect(arg.tls).toBe(false);
      expect(arg.generated).toBe(true);
      expect(arg.token).toBe(started.resolvedToken);
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('hands the quickstart the bound address, not the operator spelling', async () => {
    mockRemoteQuickstart.print.mockClear();
    // The print-mode decision (full / token-only / silent) lives inside
    // printRemoteQuickstart and is pinned by its own unit tests; boot's
    // contract is to report the address the socket actually bound, which an
    // IP-literal bind exercises without touching any resolver.
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-bound-pin');
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      expect(mockRemoteQuickstart.print).toHaveBeenCalledOnce();
      const arg = mockRemoteQuickstart.print.mock.calls[0][0];
      expect(arg.bind).toBe('127.0.0.1');
      expect(arg.boundAddress).toBe('127.0.0.1');
      expect(arg.generated).toBe(false);
      expect(arg.token).toBe('env-token-bound-pin');
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('resolves tokenQr from opts and from boot settings', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-token-qr');
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: false,
        },
        { bridge: makeFakeBridge(), bootSettings: {} },
      );
      expect(mockRemoteQuickstart.print.mock.calls[0]?.[0].tokenQrMode).toBe(
        'policy',
      );
      await started.close();
      started = undefined;

      mockRemoteQuickstart.print.mockClear();
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: false,
        },
        {
          bridge: makeFakeBridge(),
          bootSettings: { serve: { tokenQr: true } },
        },
      );
      expect(mockRemoteQuickstart.print.mock.calls[0]?.[0].tokenQrMode).toBe(
        'force',
      );
      await started.close();
      started = undefined;

      mockRemoteQuickstart.print.mockClear();
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: false,
          tokenQr: true,
        },
        { bridge: makeFakeBridge() },
      );
      expect(mockRemoteQuickstart.print.mock.calls[0]?.[0].tokenQrMode).toBe(
        'force',
      );
      await started.close();
      started = undefined;

      // An explicit flag veto (--no-token-qr) must beat an enabling
      // setting — otherwise the flag is a dead switch on a credential
      // guard.
      mockRemoteQuickstart.print.mockClear();
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: false,
          tokenQr: false,
        },
        {
          bridge: makeFakeBridge(),
          bootSettings: { serve: { tokenQr: true } },
        },
      );
      // The printer must be able to tell a deliberate veto from policy
      // suppression, or its hint advises the flag just passed.
      expect(mockRemoteQuickstart.print.mock.calls[0]?.[0].tokenQrMode).toBe(
        'veto',
      );
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('says so when the token QR was requested but the Web Shell is not mounted', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-no-web');
    const stderrWrites: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      // Non-loopback so the Web Shell really is the operative cause; on a
      // loopback bind no quickstart block prints at all and the diagnostic
      // must name that instead.
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
          tokenQr: true,
        },
        { bridge: makeFakeBridge() },
      );
      expect(stderrWrites.join('')).toContain(
        '--token-qr / serve.tokenQr has no effect because the Web Shell is not mounted.',
      );
    } finally {
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('stays quiet about the token QR when nobody requested it', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-unrequested');
    const stderrWrites: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
        },
        { bridge: makeFakeBridge(), bootSettings: {} },
      );
      expect(stderrWrites.join('')).not.toContain('has no effect');
      expect(mockRemoteQuickstart.print.mock.calls[0]?.[0].tokenQrMode).toBe(
        'policy',
      );
    } finally {
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('reports the inert token QR on a loopback bind with no bearer at all', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', '');
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-quickstart-loopback-')),
    );
    // Mounted Web Shell, so the loopback bind — not a missing UI — is the
    // operative cause. No bearer exists on loopback, which is exactly the
    // case the diagnostic must not skip.
    writeWebShellFixture(tmpDir);
    const stderrWrites: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: true,
          tokenQr: true,
          workspace: tmpDir,
        },
        { bridge: makeFakeBridge() },
      );
      const output = stderrWrites.join('');
      expect(output).toContain(
        'has no effect on this bind: a loopback listener prints no quickstart QR.',
      );
      expect(output).not.toContain('Web Shell is not mounted');
      expect(mockRemoteQuickstart.print).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('warns about a malformed serve.tokenQr and keeps the rest of the settings', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-malformed');
    const stderrWrites: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
        },
        {
          bridge: makeFakeBridge(),
          bootSettings: {
            // A display knob must not take the policy summary down with it:
            // the reader passes the bad value through and the consumer warns.
            policy: { permissionStrategy: 'consensus', consensusQuorum: 2 },
            // Secret-shaped on purpose: a mis-keyed literal bearer — or a
            // `${VAR}` placeholder outside INTERNAL_SECRET_ENV_VARS, which
            // the loader substitutes before the consumer sees it — must
            // never be echoed. The warning names the field and its type,
            // never the value.
            serve: { tokenQr: 'super-secret-bearer' },
          },
        },
      );
      expect(stderrWrites.join('')).toContain(
        'serve.tokenQr must be a boolean; ignoring a string value.',
      );
      expect(stderrWrites.join('')).not.toContain('super-secret-bearer');
      expect(stderrWrites.join('')).not.toContain('could not read settings');
      expect(mockRemoteQuickstart.print.mock.calls[0]?.[0].tokenQrMode).toBe(
        'policy',
      );
    } finally {
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('names a workspace-scoped serve.tokenQr as ignored instead of dropping it silently', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-ws-scope');
    // The real loader runs for this case (no deps.bootSettings), so pin the
    // system scopes to absent files the way the enclosing beforeEach pins
    // the user scope with a fresh O1CODE_HOME.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-quickstart-ws-scope-')),
    );
    vi.stubEnv(
      'O1CODE_SYSTEM_SETTINGS_PATH',
      path.join(tmpDir, 'no-system-settings.json'),
    );
    vi.stubEnv(
      'O1CODE_SYSTEM_DEFAULTS_PATH',
      path.join(tmpDir, 'no-system-defaults.json'),
    );
    fs.mkdirSync(path.join(tmpDir, '.o1-code'));
    fs.writeFileSync(
      path.join(tmpDir, '.o1-code', 'settings.json'),
      JSON.stringify({ serve: { tokenQr: true } }),
    );
    const stderrWrites: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
          workspace: tmpDir,
        },
        { bridge: makeFakeBridge() },
      );
      const output = stderrWrites.join('');
      expect(output).toContain('serve.tokenQr in workspace settings');
      expect(output).toContain(
        'is ignored; it is honored from user, system, and system-defaults scopes only.',
      );
      // The dropped value never reaches resolution: the printer still sees
      // the default posture, not the opt-in the workspace asked for.
      expect(mockRemoteQuickstart.print.mock.calls[0]?.[0].tokenQrMode).toBe(
        'policy',
      );
    } finally {
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('reports what the socket bound, not what the operator typed', async () => {
    mockRemoteQuickstart.print.mockClear();
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-aton-pin');
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-quickstart-aton-')),
    );
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
          workspace: tmpDir,
        },
        { bridge: makeFakeBridge() },
      );
      expect(mockRemoteQuickstart.print).toHaveBeenCalledOnce();
      const arg = mockRemoteQuickstart.print.mock.calls[0][0];
      const socket = started.server.address() as {
        address: string;
        port: number;
      };
      // This case used to bind the inet_aton spelling '0' so the typed value
      // and the socket address differed, but Windows answers that with
      // `getaddrinfo ENOTFOUND 0`. remote-quickstart.test.ts already pins the
      // spelling normalisation ('0', '0.0', '::0', …) platform-independently,
      // so what is left to witness here is the port: the operator typed 0, so
      // a report echoing its own input would show 0 rather than the ephemeral
      // port the listener actually got.
      expect(arg.bind).toBe('0.0.0.0');
      expect(arg.boundAddress).toBe(socket.address);
      expect(arg.port).toBe(socket.port);
      expect(arg.port).not.toBe(0);
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('hands the quickstart the mounted-web-shell flag', async () => {
    mockRemoteQuickstart.print.mockClear();
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-quickstart-web-')),
    );
    writeWebShellFixture(tmpDir);
    vi.stubEnv('O1CODE_SERVER_TOKEN', 'env-token-web-pin');
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          workspace: tmpDir,
        },
        { bridge: makeFakeBridge() },
      );
      expect(mockRemoteQuickstart.print).toHaveBeenCalledOnce();
      expect(mockRemoteQuickstart.print.mock.calls[0][0].web).toBe(true);
      const startup = stderr.mock.calls
        .map(([chunk]) => String(chunk))
        .join('');
      expect(startup).toContain(
        'same-origin Web Shell HTTP and WebSocket requests work without --allow-origin',
      );
      expect(startup).toContain(
        'TLS-terminating proxy still need --allow-origin <origin>',
      );
    } finally {
      vi.unstubAllEnvs();
      stderr.mockRestore();
      await started?.close();
    }
  });

  it('boots non-loopback --require-auth on the generated bearer', async () => {
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-requireauth-gen-')),
    );
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
          requireAuth: true,
          workspace: tmpDir,
        },
        { bridge: makeFakeBridge() },
      );
      expect(started.resolvedToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('boots non-loopback --allow-origin * on the generated bearer', async () => {
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-anyorigin-gen-')),
    );
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
          allowOrigins: ['*'],
          workspace: tmpDir,
        },
        { bridge: makeFakeBridge() },
      );
      expect(started.resolvedToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('boots non-loopback --allow-origin with a remote HTTP(S) origin on the generated bearer', async () => {
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-remoteorigin-gen-')),
    );
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '0.0.0.0',
          mode: 'http-bridge',
          serveWebShell: false,
          allowOrigins: ['https://app.example.com'],
          workspace: tmpDir,
        },
        { bridge: makeFakeBridge() },
      );
      expect(started.resolvedToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('refuses --require-auth and --allow-origin * on a tokenless loopback bind', async () => {
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    try {
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            serveWebShell: false,
            requireAuth: true,
          },
          { bridge: makeFakeBridge() },
        ),
      ).rejects.toThrow(/--require-auth/);
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            serveWebShell: false,
            allowOrigins: ['*'],
          },
          { bridge: makeFakeBridge() },
        ),
      ).rejects.toThrow(/--allow-origin/);
      await expect(
        runO1CodeServe(
          {
            port: 0,
            hostname: '127.0.0.1',
            mode: 'http-bridge',
            serveWebShell: false,
            allowOrigins: ['https://app.example.com'],
          },
          { bridge: makeFakeBridge() },
        ),
      ).rejects.toThrow(/--allow-origin/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('boots loopback --require-auth when a token arrives pre-installed', async () => {
    // The shape --open-with-auth leaves behind: its generated loopback token
    // is installed on the options before runO1CodeServe, so the flag's
    // fail-fast must see it like any configured source.
    vi.stubEnv('O1CODE_SERVER_TOKEN', undefined);
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: false,
          requireAuth: true,
          token: 'pre-installed-loopback-token',
        },
        { bridge: makeFakeBridge() },
      );
      expect(started.resolvedToken).toBe('pre-installed-loopback-token');
    } finally {
      vi.unstubAllEnvs();
      await started?.close();
    }
  });

  it('survives an asynchronous EPIPE on stdout and rethrows other stream errors', async () => {
    let started: Awaited<ReturnType<typeof runO1CodeServe>> | undefined;
    try {
      started = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      // The guard listens on the process streams; without it an 'error'
      // event with no listener throws out of emit itself.
      const epipe = Object.assign(new Error('write EPIPE'), {
        code: 'EPIPE',
      });
      expect(() => process.stdout.emit('error', epipe)).not.toThrow();
      expect(() => process.stderr.emit('error', epipe)).not.toThrow();
      const other = Object.assign(new Error('stream boom'), {
        code: 'ENOENT',
      });
      expect(() => process.stdout.emit('error', other)).toThrow('stream boom');
      expect(() => process.stderr.emit('error', other)).toThrow('stream boom');
    } finally {
      await started?.close();
    }
  });

  it('routes SIGHUP through graceful shutdown and removes its listener', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-sighup-shutdown-')),
    );
    const bridge = makeFakeBridge();
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const existingSighupListeners = new Set(process.rawListeners('SIGHUP'));
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        serveWebShell: false,
      },
      { bridge },
    );
    const processRegistry = mockCreateSpawnChannelFactoryOptions.at(-1)?.[
      'processRegistry'
    ] as { shutdown: () => Promise<void> };
    const shutdownSpy = vi.spyOn(processRegistry, 'shutdown');

    try {
      const signalListener = process
        .rawListeners('SIGHUP')
        .find(
          (listener) =>
            !existingSighupListeners.has(listener) &&
            listener.name === 'onSignal',
        ) as ((signal: NodeJS.Signals) => Promise<void>) | undefined;
      expect(signalListener).toBeDefined();

      await signalListener!('SIGHUP');

      expect(shutdownSpy).toHaveBeenCalledOnce();
      expect(bridge.shutdown).toHaveBeenCalledOnce();
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(
        process
          .rawListeners('SIGHUP')
          .some((listener) => !existingSighupListeners.has(listener)),
      ).toBe(false);
    } finally {
      await handle.close();
      exitSpy.mockRestore();
    }
  });

  it('exits on the first signal when only ACP process shutdown fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-acp-shutdown-error-')),
    );
    const bridge = makeFakeBridge();
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const existingSigintListeners = new Set(process.rawListeners('SIGINT'));
    const existingSigtermListeners = new Set(process.rawListeners('SIGTERM'));
    const existingSighupListeners = new Set(process.rawListeners('SIGHUP'));

    await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        serveWebShell: false,
      },
      { bridge },
    );

    const processRegistry = mockCreateSpawnChannelFactoryOptions.at(-1)?.[
      'processRegistry'
    ] as { shutdown: () => Promise<void> };
    vi.spyOn(processRegistry, 'shutdown').mockRejectedValue(
      new Error('ACP process shutdown failed'),
    );
    const signalListener = process
      .rawListeners('SIGTERM')
      .find(
        (listener) =>
          !existingSigtermListeners.has(listener) &&
          listener.name === 'onSignal',
      ) as ((signal: NodeJS.Signals) => Promise<void>) | undefined;
    try {
      expect(signalListener).toBeDefined();
      await signalListener!('SIGTERM');

      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      for (const listener of process.rawListeners('SIGINT')) {
        if (!existingSigintListeners.has(listener)) {
          process.removeListener('SIGINT', listener as never);
        }
      }
      for (const listener of process.rawListeners('SIGTERM')) {
        if (!existingSigtermListeners.has(listener)) {
          process.removeListener('SIGTERM', listener as never);
        }
      }
      for (const listener of process.rawListeners('SIGHUP')) {
        if (!existingSighupListeners.has(listener)) {
          process.removeListener('SIGHUP', listener as never);
        }
      }
      exitSpy.mockRestore();
    }
  });

  it('retries the next port on EADDRINUSE and succeeds', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-port-retry-')),
    );
    const portsAttempted: number[] = [];
    const stderrWrites: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue({
      locals: {},
    } as unknown as express.Application);
    const testServer = createServer();
    const nativeListen = testServer.listen.bind(testServer);
    testServer.listen = vi.fn((port: number) => {
      portsAttempted.push(port);
      if (portsAttempted.length === 1) {
        const err = new Error('address in use') as NodeJS.ErrnoException;
        err.code = 'EADDRINUSE';
        setImmediate(() => testServer.emit('error', err));
      } else {
        nativeListen(0, '127.0.0.1');
      }
      return testServer;
    }) as unknown as typeof testServer.listen;

    const handle = await runO1CodeServe(
      {
        port: 4170,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        serveWebShell: false,
      },
      {
        bridge: makeFakeBridge(),
        httpServerFactory: () => testServer,
        resolveOnListen: true,
      },
    );

    try {
      stderrSpy.mockRestore();
      expect(portsAttempted).toEqual([4170, 4171]);
      expect(handle.server.listening).toBe(true);
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(new URL(handle.url).port).toBe(
        String((handle.server.address() as AddressInfo).port),
      );
      expect(new URL(handle.url).port).not.toBe('4170');
      expect(
        stderrWrites.some((w) =>
          w.includes('port 4170 is in use, trying 4171'),
        ),
      ).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it('does not retry on non-EADDRINUSE listen errors', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-port-no-retry-')),
    );
    const portsAttempted: number[] = [];
    const listenError = new Error('permission denied') as NodeJS.ErrnoException;
    listenError.code = 'EACCES';
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue({
      locals: {},
    } as unknown as express.Application);
    const testServer = createServer();
    testServer.listen = vi.fn((port: number) => {
      portsAttempted.push(port);
      setImmediate(() => testServer.emit('error', listenError));
      return testServer;
    }) as unknown as typeof testServer.listen;

    await expect(
      runO1CodeServe(
        {
          port: 4170,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          serveWebShell: false,
        },
        {
          bridge: makeFakeBridge(),
          httpServerFactory: () => testServer,
        },
      ),
    ).rejects.toBe(listenError);

    expect(portsAttempted).toEqual([4170]);
  });

  it('rejects after exhausting all port retry attempts', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-port-exhaust-')),
    );
    const portsAttempted: number[] = [];
    const stderrWrites: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    const listenError = new Error('address in use') as NodeJS.ErrnoException;
    listenError.code = 'EADDRINUSE';
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue({
      locals: {},
    } as unknown as express.Application);
    const testServer = createServer();
    testServer.listen = vi.fn((port: number) => {
      portsAttempted.push(port);
      setImmediate(() => testServer.emit('error', listenError));
      return testServer;
    }) as unknown as typeof testServer.listen;

    await expect(
      runO1CodeServe(
        {
          port: 4170,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          serveWebShell: false,
        },
        {
          bridge: makeFakeBridge(),
          httpServerFactory: () => testServer,
        },
      ),
    ).rejects.toBe(listenError);

    stderrSpy.mockRestore();
    expect(portsAttempted).toEqual(
      Array.from({ length: 10 }, (_, i) => 4170 + i),
    );
    expect(
      stderrWrites.some((w) => w.includes('all ports 4170–4179 are in use')),
    ).toBe(true);
  });

  it('does not retry EADDRINUSE when port is 0 (ephemeral)', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-port0-no-retry-')),
    );
    const portsAttempted: number[] = [];
    const listenError = new Error('address in use') as NodeJS.ErrnoException;
    listenError.code = 'EADDRINUSE';
    vi.spyOn(serverModule, 'createServeApp').mockReturnValue({
      locals: {},
    } as unknown as express.Application);
    const testServer = createServer();
    testServer.listen = vi.fn((port: number) => {
      portsAttempted.push(port);
      setImmediate(() => testServer.emit('error', listenError));
      return testServer;
    }) as unknown as typeof testServer.listen;

    await expect(
      runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          serveWebShell: false,
        },
        {
          bridge: makeFakeBridge(),
          httpServerFactory: () => testServer,
        },
      ),
    ).rejects.toBe(listenError);

    expect(portsAttempted).toEqual([0]);
  });
});

describe('runO1CodeServe startup observability', () => {
  it("names every pre-auth surface in the --allow-origin '*' warning", async () => {
    // This warning is the operator's only notice of what a wildcard origin
    // exposes without a token, so it must enumerate the actual pre-auth
    // surface: the Web Shell static assets (mounted before bearerAuth in
    // every mode) and, on loopback without --require-auth, /health. If the
    // pre-auth set drifts again, this assertion is what catches the stale
    // message.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-allow-origin-')),
    );
    const stderrWrites: string[] = [];
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrWrites.push(String(chunk));
        return true;
      });
    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
        token: 'secret',
        allowOrigins: ['*'],
      },
      { resolveOnListen: true },
    );
    try {
      await handle.runtimeReady;
      const warning = stderrWrites
        .join('')
        .split('\n')
        .find((line) => line.includes('--allow-origin:'));
      expect(warning).toBeDefined();
      expect(warning).toContain('Web Shell static assets');
      expect(warning).toContain('--no-web');
      expect(warning).toContain('/health');
      expect(warning).toContain('--require-auth');
      // The retired debug page must not resurface in the enumeration.
      expect(warning).not.toContain('/demo');
    } finally {
      spy.mockRestore();
      await handle.close();
    }
  });

  let tmpDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function makeFakeBridge(): HttpAcpBridge {
    return {
      spawnOrAttach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      killAllSync: vi.fn(),
      getSession: vi.fn(),
      getAllSessions: vi.fn().mockReturnValue([]),
      publishWorkspaceEvent: vi.fn(),
      getEventRing: vi.fn().mockReturnValue({ getAll: () => [] }),
      resume: vi.fn(),
      preheat: vi.fn().mockResolvedValue(undefined),
      getDaemonStatusSnapshot: vi.fn().mockReturnValue(BASE_BRIDGE_SNAPSHOT),
      isChannelLive: vi.fn().mockReturnValue(true),
    } as unknown as HttpAcpBridge;
  }

  async function readStartup(handle: Pick<RunHandle, 'url' | 'resolvedToken'>) {
    const res = await fetch(`${handle.url}/daemon/status`, {
      headers: handle.resolvedToken
        ? { Authorization: `Bearer ${handle.resolvedToken}` }
        : undefined,
    });
    const body = (await res.json()) as {
      daemon?: {
        startup?: {
          processStartedAt?: string;
          listenerReadyAt?: string;
          processToListenMs?: number;
          runO1CodeServeToListenMs?: number;
          preheat?: {
            status?: string;
            durationMs?: number;
            error?: string;
          };
        };
      };
    };
    return body.daemon?.startup;
  }

  async function waitForPreheatStatus(
    handle: Pick<RunHandle, 'url' | 'runtimeReady'>,
    status: string,
  ) {
    await handle.runtimeReady;
    for (let i = 0; i < 20; i++) {
      const startup = await readStartup(handle);
      if (startup?.preheat?.status === status) return startup.preheat;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`preheat status did not become ${status}`);
  }

  async function waitForDaemonLog(
    logBaseDir: string,
    needle: string,
  ): Promise<string> {
    const daemonDir = path.join(logBaseDir, 'daemon');
    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(daemonDir)) {
        const logFile = fs
          .readdirSync(daemonDir)
          .find((file) => file.endsWith('.log'));
        if (logFile) {
          const content = fs.readFileSync(
            path.join(daemonDir, logFile),
            'utf8',
          );
          if (content.includes(needle)) return content;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`daemon log did not contain: ${needle}`);
  }

  function lifecycleBridgeExtras() {
    return {
      getWorkspaceRuntimeLifecycleSnapshot: vi.fn().mockReturnValue({
        state: 'idle',
        runtimeLive: true,
        runtimeEpoch: 1,
        activeWork: false,
      }),
      initializeWorkspaceMcp: vi.fn().mockResolvedValue({ accepted: true }),
      queryWorkspaceStatus: vi.fn(async () => ({
        v: 1,
        workspaceCwd: tmpDir,
        initialized: true,
        runtimeEpoch: 1,
        source: 'live',
        discoveryState: 'completed',
        servers: [],
        skills: [],
      })),
    };
  }

  function installInternalBridge(preheat: () => Promise<void>): HttpAcpBridge {
    const bridge = makeFakeBridge();
    vi.mocked(bridge.preheat).mockImplementation(preheat);
    vi.spyOn(acpBridge, 'createAcpSessionBridge').mockReturnValue(
      bridge as ReturnType<typeof acpBridge.createAcpSessionBridge>,
    );
    return bridge;
  }

  it('keeps the stdout listening contract and exposes startup timing on stderr and status', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-')),
    );
    const stderrWrites: string[] = [];
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
        allowOrigins: ['http://localhost:5173'],
      },
      { bridge: makeFakeBridge() },
    );

    try {
      expect(stdoutWrites).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^o1-code serve listening on http:\/\/127\.0\.0\.1:\d+ \(mode=http-bridge, workspace=/,
          ),
        ]),
      );
      expect(stderrWrites.join('')).toMatch(
        /o1-code serve: startup timing: processToListenMs=\d+ runO1CodeServeToListenMs=\d+/,
      );
      expect(stderrWrites.join('')).not.toContain(
        'o1-code serve: client-hosted MCP tools are accepted over the WebSocket without auth.',
      );

      expect(await readStartup(handle)).toMatchObject({
        processStartedAt: expect.any(String),
        listenerReadyAt: expect.any(String),
        processToListenMs: expect.any(Number),
        runO1CodeServeToListenMs: expect.any(Number),
        preheat: { status: 'external_bridge' },
      });
    } finally {
      await handle.close();
    }
  });

  it('uses boot runtimeOutputDir for daemon logs', async () => {
    const originalRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    delete process.env['O1CODE_RUNTIME_DIR'];
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-runtime-dir-')),
    );
    const boundWorkspace = canonicalizeWorkspace(tmpDir);
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    let handle: RunHandle | undefined;
    try {
      handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        {
          bridge: makeFakeBridge(),
          bootSettings: {
            advanced: { runtimeOutputDir: '.o1-code-runtime' },
          },
        },
      );
      const expectedDaemonDir = path.join(
        boundWorkspace,
        '.o1-code-runtime',
        'debug',
        'daemon',
      );
      expect(stderrWrites.join('')).toContain(
        `o1-code serve: daemon log → ${expectedDaemonDir}`,
      );
      expect(fs.existsSync(expectedDaemonDir)).toBe(true);
    } finally {
      await handle?.close();
      if (originalRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = originalRuntimeDir;
      }
    }
  });

  it('uses explicit daemonLogBaseDir when provided by an embedder', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-log-dep-')),
    );
    const logBaseDir = path.join(tmpDir, 'explicit-debug');
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      {
        bridge: makeFakeBridge(),
        daemonLogBaseDir: logBaseDir,
      },
    );

    try {
      const expectedDaemonDir = path.join(logBaseDir, 'daemon');
      expect(stderrWrites.join('')).toContain(
        `o1-code serve: daemon log → ${expectedDaemonDir}`,
      );
      expect(fs.existsSync(expectedDaemonDir)).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it('preserves Storage runtime base dir for default exported callers', async () => {
    const originalRuntimeDir = process.env['O1CODE_RUNTIME_DIR'];
    delete process.env['O1CODE_RUNTIME_DIR'];
    o1codeCore.Storage.setRuntimeBaseDir(null);
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-storage-dir-')),
    );
    fs.mkdirSync(path.join(tmpDir, '.o1-code'));
    fs.writeFileSync(
      path.join(tmpDir, '.o1-code', 'settings.json'),
      JSON.stringify({
        advanced: { runtimeOutputDir: '.settings-runtime' },
      }),
    );
    const runtimeBaseDir = path.join(tmpDir, 'storage-runtime');
    o1codeCore.Storage.setRuntimeBaseDir(runtimeBaseDir);
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    let handle: RunHandle | undefined;
    try {
      handle = await runO1CodeServe(
        {
          port: 0,
          hostname: '127.0.0.1',
          mode: 'http-bridge',
          workspace: tmpDir,
          maxSessions: 1,
          serveWebShell: false,
        },
        { bridge: makeFakeBridge() },
      );
      const expectedDaemonDir = path.join(runtimeBaseDir, 'debug', 'daemon');
      expect(stderrWrites.join('')).toContain(
        `o1-code serve: daemon log → ${expectedDaemonDir}`,
      );
      expect(fs.existsSync(expectedDaemonDir)).toBe(true);
    } finally {
      await handle?.close();
      o1codeCore.Storage.setRuntimeBaseDir(null);
      if (originalRuntimeDir === undefined) {
        delete process.env['O1CODE_RUNTIME_DIR'];
      } else {
        process.env['O1CODE_RUNTIME_DIR'] = originalRuntimeDir;
      }
    }
  });

  it('starts workspace MCP discovery after ACP preheat succeeds', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-config-')),
    );
    let resolvePreheat!: () => void;
    const preheatPromise = new Promise<void>((resolve) => {
      resolvePreheat = resolve;
    });
    const bridge = installInternalBridge(() => preheatPromise);
    Object.assign(bridge, lifecycleBridgeExtras());
    const ensureSpy = vi.spyOn(WorkspaceRuntimeCoordinator.prototype, 'ensure');

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true },
    );

    try {
      await waitForPreheatStatus(handle, 'running');
      expect(ensureSpy).not.toHaveBeenCalled();
      expect(bridge.preheat).toHaveBeenCalledTimes(1);
      expect(bridge.preheat).toHaveBeenCalledWith();

      resolvePreheat();
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      await vi.waitFor(() => expect(ensureSpy).toHaveBeenCalledOnce());
      expect(ensureSpy).toHaveBeenCalledWith({
        keepAliveMs: ENSURE_KEEP_ALIVE_MS,
      });
      expect(ensureSpy.mock.instances[0]).toMatchObject({
        runtime: expect.objectContaining({ workspaceCwd: tmpDir }),
      });
      expect(bridge.preheat).toHaveBeenCalledTimes(2);
      expect(bridge.preheat).toHaveBeenNthCalledWith(1);
      expect(bridge.preheat).toHaveBeenNthCalledWith(2, {
        keepAliveMs: ENSURE_KEEP_ALIVE_MS,
      });
    } finally {
      await handle.close();
    }
  });

  it('does not leak an unhandled rejection when boot MCP discovery fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-reject-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    const bridge = installInternalBridge(() => Promise.resolve());
    Object.assign(bridge, lifecycleBridgeExtras());
    const ensureSpy = vi
      .spyOn(WorkspaceRuntimeCoordinator.prototype, 'ensure')
      .mockImplementation(async () => {
        throw new WorkspaceRuntimeInitializationError(
          new Error('cause detail'),
        );
      });
    const rejections: unknown[] = [];
    const recordRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', recordRejection);

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, daemonLogBaseDir: logBaseDir },
    );

    try {
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      await vi.waitFor(() => expect(ensureSpy).toHaveBeenCalledOnce());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
      await waitForDaemonLog(
        logBaseDir,
        'workspace runtime ensure after preheat failed: cause detail',
      );
    } finally {
      process.off('unhandledRejection', recordRejection);
      await handle.close();
    }
  });

  it('logs the deepest cause from a multi-hop boot runtime ensure failure', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-deep-cause-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    const bridge = installInternalBridge(() => Promise.resolve());
    Object.assign(bridge, lifecycleBridgeExtras());
    vi.spyOn(
      WorkspaceRuntimeCoordinator.prototype,
      'ensure',
    ).mockImplementation(async () => {
      throw new Error('wrapper', {
        cause: new Error('middle', { cause: new Error('deepest leaf') }),
      });
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, daemonLogBaseDir: logBaseDir },
    );

    try {
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      const logContent = await waitForDaemonLog(
        logBaseDir,
        'workspace runtime ensure after preheat failed: deepest leaf',
      );
      expect(logContent).not.toContain('wrapper');
      expect(logContent).not.toContain('middle');
    } finally {
      await handle.close();
    }
  });

  it('logs non-Error boot runtime ensure failures via String(err)', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-string-err-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    const bridge = installInternalBridge(() => Promise.resolve());
    Object.assign(bridge, lifecycleBridgeExtras());
    vi.spyOn(
      WorkspaceRuntimeCoordinator.prototype,
      'ensure',
    ).mockImplementation(async () => {
      // eslint-disable-next-line no-restricted-syntax -- pins String(err) fallback
      throw 'plain string failure';
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, daemonLogBaseDir: logBaseDir },
    );

    try {
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      await waitForDaemonLog(
        logBaseDir,
        'workspace runtime ensure after preheat failed: plain string failure',
      );
    } finally {
      await handle.close();
    }
  });

  it('logs cause-less boot runtime ensure failures without an undefined suffix', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-no-cause-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    const bridge = installInternalBridge(() => Promise.resolve());
    Object.assign(bridge, lifecycleBridgeExtras());
    vi.spyOn(
      WorkspaceRuntimeCoordinator.prototype,
      'ensure',
    ).mockImplementation(async () => {
      throw new WorkspaceRuntimeStillStartingError();
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, daemonLogBaseDir: logBaseDir },
    );

    try {
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      const logContent = await waitForDaemonLog(
        logBaseDir,
        'workspace runtime ensure after preheat failed: Workspace runtime is still starting',
      );
      expect(logContent).not.toContain('(undefined)');
    } finally {
      await handle.close();
    }
  });

  it('logs when boot MCP discovery skips because lifecycle is unsupported', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-no-lifecycle-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    const bridge = installInternalBridge(() => Promise.resolve());

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, daemonLogBaseDir: logBaseDir },
    );

    try {
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      await waitForDaemonLog(
        logBaseDir,
        'workspace runtime ensure after preheat skipped: ' +
          'workspace runtime lifecycle is not supported',
      );
      expect(bridge.preheat).toHaveBeenCalledOnce();
    } finally {
      await handle.close();
    }
  });

  it('logs when boot ensure skips because primary workspace is not active', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(
        path.join(os.tmpdir(), 'qws-startup-mcp-inactive-primary-'),
      ),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    let resolvePreheat!: () => void;
    const preheatPromise = new Promise<void>((resolve) => {
      resolvePreheat = resolve;
    });
    const bridge = installInternalBridge(() => preheatPromise);
    Object.assign(bridge, lifecycleBridgeExtras());
    const ensureSpy = vi.spyOn(WorkspaceRuntimeCoordinator.prototype, 'ensure');
    let workspaceRegistry: WorkspaceRegistry | undefined;
    const originalCreateServeApp = serverModule.createServeApp;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      workspaceRegistry = args[2]?.workspaceRegistry;
      return originalCreateServeApp(...args);
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, daemonLogBaseDir: logBaseDir },
    );

    try {
      await waitForPreheatStatus(handle, 'running');
      const previousState = workspaceRegistry!.primaryEntry.state;
      workspaceRegistry!.primaryEntry.state = 'draining';
      resolvePreheat();
      try {
        await waitForDaemonLog(
          logBaseDir,
          'workspace runtime ensure after preheat skipped: no primary runtime',
        );
        expect(ensureSpy).not.toHaveBeenCalled();
      } finally {
        workspaceRegistry!.primaryEntry.state = previousState;
      }
    } finally {
      await handle.close();
    }
  });

  it('logs when boot MCP discovery skips because primary runtime is gone', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-no-runtime-')),
    );
    const logBaseDir = path.join(tmpDir, 'debug');
    let resolvePreheat!: () => void;
    const preheatPromise = new Promise<void>((resolve) => {
      resolvePreheat = resolve;
    });
    installInternalBridge(() => preheatPromise);
    let workspaceRegistry: WorkspaceRegistry | undefined;
    const originalCreateServeApp = serverModule.createServeApp;
    vi.spyOn(serverModule, 'createServeApp').mockImplementation((...args) => {
      workspaceRegistry = args[2]?.workspaceRegistry;
      return originalCreateServeApp(...args);
    });

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, daemonLogBaseDir: logBaseDir },
    );

    try {
      await waitForPreheatStatus(handle, 'running');
      const current = workspaceRegistry!.primaryEntry.current;
      delete workspaceRegistry!.primaryEntry.current;
      resolvePreheat();
      try {
        await waitForDaemonLog(
          logBaseDir,
          'workspace runtime ensure after preheat skipped: no primary runtime',
        );
      } finally {
        workspaceRegistry!.primaryEntry.current = current;
      }
    } finally {
      await handle.close();
    }
  });

  it('does not schedule workspace MCP discovery when ACP preheat fails', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-preheat-fail-')),
    );
    const bridge = installInternalBridge(() =>
      Promise.reject(new Error('preheat boom')),
    );
    Object.assign(bridge, lifecycleBridgeExtras());
    const ensureSpy = vi.spyOn(WorkspaceRuntimeCoordinator.prototype, 'ensure');

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true },
    );

    try {
      expect(await waitForPreheatStatus(handle, 'failed')).toMatchObject({
        status: 'failed',
        error: 'preheat boom',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(ensureSpy).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('starts workspace MCP discovery only for the primary workspace', async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-primary-only-')),
    );
    const primary = path.join(root, 'primary');
    const secondary = path.join(root, 'secondary');
    fs.mkdirSync(primary, { recursive: true });
    fs.mkdirSync(secondary, { recursive: true });
    tmpDir = root;
    const bridge = installInternalBridge(() => Promise.resolve());
    Object.assign(bridge, {
      ...lifecycleBridgeExtras(),
      queryWorkspaceStatus: vi.fn(async () => ({
        v: 1,
        workspaceCwd: primary,
        initialized: true,
        runtimeEpoch: 1,
        source: 'live',
        discoveryState: 'completed',
        servers: [],
        skills: [],
      })),
    });
    const ensureSpy = vi.spyOn(WorkspaceRuntimeCoordinator.prototype, 'ensure');

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: [primary, secondary],
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true },
    );

    try {
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      await vi.waitFor(() => expect(ensureSpy).toHaveBeenCalledOnce());
      expect(ensureSpy.mock.instances[0]).toMatchObject({
        runtime: expect.objectContaining({
          workspaceCwd: canonicalizeWorkspace(primary),
        }),
      });
    } finally {
      await handle.close();
    }
  });

  it('does not schedule workspace MCP discovery when shutting down during preheat', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-mcp-shutdown-')),
    );
    let resolvePreheat!: () => void;
    const preheatPromise = new Promise<void>((resolve) => {
      resolvePreheat = resolve;
    });
    const bridge = installInternalBridge(() => preheatPromise);
    Object.assign(bridge, lifecycleBridgeExtras());
    const ensureSpy = vi.spyOn(WorkspaceRuntimeCoordinator.prototype, 'ensure');

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true },
    );

    try {
      await waitForPreheatStatus(handle, 'running');
      await handle.close();
      resolvePreheat();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(ensureSpy).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('tracks preheat running and succeeded states for an internally-created bridge', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-preheat-')),
    );
    let resolvePreheat!: () => void;
    const preheatPromise = new Promise<void>((resolve) => {
      resolvePreheat = resolve;
    });
    const bridge = installInternalBridge(() => preheatPromise);

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true },
    );

    try {
      await waitForPreheatStatus(handle, 'running');
      expect(bridge.preheat).toHaveBeenCalledTimes(1);
      expect((await readStartup(handle))?.preheat).toMatchObject({
        status: 'running',
      });

      resolvePreheat();
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
        durationMs: expect.any(Number),
      });
    } finally {
      await handle.close();
    }
  });

  it('preheats the primary workspace runtime by default in production', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-default-preheat-')),
    );
    const bridge = installInternalBridge(() => Promise.resolve());
    const workerId = process.env['VITEST_WORKER_ID'];
    delete process.env['VITEST_WORKER_ID'];

    let handle: RunHandle | undefined;
    try {
      handle = await runO1CodeServe({
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      });
      expect(await waitForPreheatStatus(handle, 'succeeded')).toMatchObject({
        status: 'succeeded',
      });
      expect(bridge.preheat).toHaveBeenCalledOnce();
    } finally {
      await handle?.close();
      if (workerId === undefined) {
        delete process.env['VITEST_WORKER_ID'];
      } else {
        process.env['VITEST_WORKER_ID'] = workerId;
      }
    }
  });

  it('does not preheat an untrusted primary workspace', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-untrusted-')),
    );
    const bridge = installInternalBridge(() => Promise.resolve());

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true, trustedWorkspace: false },
    );

    try {
      await handle.runtimeReady;
      expect(bridge.preheat).not.toHaveBeenCalled();
      expect(await readStartup(handle)).toMatchObject({
        preheat: { status: 'not_scheduled' },
      });
    } finally {
      await handle.close();
    }
  });

  it('tracks preheat failed state and error message for an internally-created bridge', async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'qws-startup-preheat-')),
    );
    const bridge = installInternalBridge(() =>
      Promise.reject(new Error('preheat boom')),
    );

    const handle = await runO1CodeServe(
      {
        port: 0,
        hostname: '127.0.0.1',
        mode: 'http-bridge',
        workspace: tmpDir,
        maxSessions: 1,
        serveWebShell: false,
      },
      { preheatBridge: true },
    );

    try {
      await waitForPreheatStatus(handle, 'failed');
      expect(bridge.preheat).toHaveBeenCalledTimes(1);
      expect(await waitForPreheatStatus(handle, 'failed')).toMatchObject({
        status: 'failed',
        durationMs: expect.any(Number),
        error: 'preheat boom',
      });
    } finally {
      await handle.close();
    }
  });
});
