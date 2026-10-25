// Copyright 2026 o1-code contributors
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';
import { startFakeOpenAIServer } from './fake-openai-server.js';

const here = dirname(fileURLToPath(import.meta.url));
const vsix = resolve(process.argv[2]);
const executable = process.argv[3]
  ? resolve(process.argv[3])
  : await downloadAndUnzipVSCode('stable');
const home = mkdtempSync(join(tmpdir(), 'o1-companion-smoke-'));
const workspace = join(home, 'workspace');
const state = join(home, 'state');
const profile = join(home, 'profile');
const extensions = join(home, 'extensions');
for (const dir of [workspace, state, profile, extensions])
  mkdirSync(dir, { recursive: true });
const server = await startFakeOpenAIServer(() => ({
  content: 'COMPANION_SMOKE_OK',
  finishReason: 'stop',
}));
const env = {
  ...process.env,
  O1CODE_HOME: state,
  O1_COMPANION_TEST_KEY: 'sk-local-only',
  O1CODE_NO_RELAUNCH: '1',
  O1CODE_SANDBOX: 'false',
  O1CODE_LANG: 'en',
  O1CODE_SUPPRESS_YOLO_WARNING: '1',
};
writeFileSync(
  join(state, 'settings.json'),
  JSON.stringify({
    ide: { enabled: true },
    modelProviders: {
      'companion-smoke': [
        {
          id: 'smoke-model',
          baseUrl: server.baseUrl,
          envKey: 'O1_COMPANION_TEST_KEY',
        },
      ],
    },
    providerProtocol: { 'companion-smoke': 'openai' },
    security: { auth: { selectedType: 'openai' } },
    model: { name: 'smoke-model' },
    general: { preventSystemSleep: false, enableAutoUpdate: false },
    privacy: { usageStatisticsEnabled: false },
    telemetry: { enabled: false },
    ui: { logoAnimation: 'off', enableUserFeedback: false },
  }),
);
const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
const windows = process.platform === 'win32';
const installArgs = [
  ...cliArgs,
  '--user-data-dir',
  profile,
  '--extensions-dir',
  extensions,
  '--install-extension',
  vsix,
  '--force',
];
const installed = spawnSync(
  windows ? `"${cli}"` : cli,
  installArgs.map((arg) => (windows ? `"${arg}"` : arg)),
  {
    shell: windows,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
  },
);
if (installed.status !== 0)
  throw new Error(
    installed.stderr || installed.stdout || installed.error?.message,
  );
const fixture = join(home, 'fixture');
cpSync(join(here, 'ide-companion-smoke'), fixture, { recursive: true });
writeFileSync(
  join(fixture, 'config.json'),
  JSON.stringify({
    node: process.execPath,
    probe: join(here, 'ide-companion-smoke', 'cli.mjs'),
    workspace,
    state,
    version: JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'))
      .version,
  }),
);
try {
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: fixture,
    extensionTestsPath: join(fixture, 'test.cjs'),
    extensionTestsEnv: env,
    launchArgs: [
      workspace,
      '--user-data-dir',
      profile,
      '--extensions-dir',
      extensions,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
    ],
  });
  console.log(
    'Companion smoke: installed VSIX, activated IDE server, connected CLI and received provider response.',
  );
} finally {
  await server.close();
}
