/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../config/config.js';
import {
  productUsage,
  recordErrorReport,
  resetProductTelemetryForTesting,
  sendProductTelemetry,
  startProductTelemetry,
  type ErrorPayload,
  type UsagePayload,
} from './product-telemetry.js';

function fakeConfig(
  options: { usage?: boolean; errors?: boolean; baseUrl?: string } = {},
): Config {
  return {
    getUsageStatisticsEnabled: () => options.usage ?? true,
    getErrorReportsEnabled: () => options.errors ?? true,
    getCliVersion: () => '0.24.0',
    isInteractive: () => true,
    getInputFormat: () => 'text',
    getExperimentalZedIntegration: () => false,
    getContentGeneratorConfig: () => ({ baseUrl: options.baseUrl }),
  } as unknown as Config;
}

describe('product telemetry', () => {
  let home: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'product-telemetry-'));
    vi.stubEnv('O1CODE_HOME', home);
    vi.stubEnv('O1CODE_TELEMETRY_URL', 'https://intake.example.test/t/v1/');
    vi.stubEnv('DO_NOT_TRACK', '');
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    resetProductTelemetryForTesting();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fs.rmSync(home, { recursive: true, force: true });
  });

  function bodies<T>(endpoint: string): T[] {
    return fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith(`/${endpoint}`))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string) as T);
  }

  it('sends anonymous usage counts with the installation and client', async () => {
    const config = fakeConfig({ baseUrl: 'https://api.organizaone.com/v1' });
    startProductTelemetry(config, { manual: true, install: () => 'npm' });
    const usage = productUsage(config)!;
    usage.session(config);
    usage.prompt();
    usage.toolCall('read_file', 'native');
    usage.toolCall('mcp__server__secret_tool', 'mcp');
    usage.slashCommand('model', true);
    usage.slashCommand('my-private-command', false);
    usage.apiResponse(config, 'openai', 10, 5);
    usage.apiError(429);
    usage.apiError(undefined, 'some error with spaces');

    await sendProductTelemetry();

    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://intake.example.test/t/v1/usage',
    );
    const [payload] = bodies<UsagePayload>('usage');
    expect(payload).toMatchObject({
      schema: 1,
      installationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      client: { version: '0.24.0', install: 'npm' },
    });
    expect(payload!.days[0]).toMatchObject({
      sessions: { interactive: 1 },
      prompts: 1,
      toolCalls: { read_file: 1, mcp: 1 },
      slashCommands: { model: 1, custom: 1 },
      providers: { organizaone: 1 },
      apiErrors: { http_429: 1, other: 1 },
      tokens: { input: 10, output: 5 },
    });
    // The intake refuses a day that lacks a session mode.
    expect(payload!.days[0]!.sessions).toEqual({
      interactive: 1,
      headless: 0,
      sdk: 0,
    });
    expect(JSON.stringify(payload)).not.toContain('secret_tool');
    expect(JSON.stringify(payload)).not.toContain('my-private-command');
  });

  it('sends usage at most hourly across sessions', async () => {
    const config = fakeConfig();
    startProductTelemetry(config, { manual: true });
    productUsage(config)!.prompt();
    const now = new Date();
    await sendProductTelemetry(now);
    await sendProductTelemetry(new Date(now.getTime() + 30 * 60 * 1000));
    expect(bodies('usage')).toHaveLength(1);
    await sendProductTelemetry(new Date(now.getTime() + 61 * 60 * 1000));
    expect(bodies('usage')).toHaveLength(2);
  });

  it('keeps the counts when the intake cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const config = fakeConfig();
    startProductTelemetry(config, { manual: true });
    productUsage(config)!.prompt();
    await sendProductTelemetry();
    await sendProductTelemetry();
    expect(bodies<UsagePayload>('usage').at(-1)!.days[0]!.prompts).toBe(1);
  });

  it('sends a stored crash without an installation ID and removes it once accepted', async () => {
    const config = fakeConfig({ usage: false });
    startProductTelemetry(config, { manual: true });
    recordErrorReport(
      new Error(`failed in ${os.homedir()}`),
      'uncaughtException',
    );
    await sendProductTelemetry();

    expect(bodies('usage')).toHaveLength(0);
    const [payload] = bodies<ErrorPayload>('errors');
    expect(payload).not.toHaveProperty('installationId');
    // With usage metrics off, the ID file is neither read nor created.
    expect(fs.existsSync(path.join(home, 'installation_id'))).toBe(false);
    expect(payload!.errors).toEqual([
      expect.objectContaining({
        kind: 'uncaughtException',
        message: 'failed in ~',
        count: 1,
      }),
    ]);
    await sendProductTelemetry();
    expect(bodies('errors')).toHaveLength(1);
  });

  it.each([
    ['both switches off', { usage: false, errors: false }, ''],
    ['DO_NOT_TRACK', {}, '1'],
  ])('sends nothing with %s', async (_label, options, doNotTrack) => {
    vi.stubEnv('DO_NOT_TRACK', doNotTrack);
    const config = fakeConfig(options);
    startProductTelemetry(config, { manual: true });
    expect(productUsage(config)).toBeUndefined();
    recordErrorReport(new Error('x'), 'uncaughtException');
    await sendProductTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(home, 'telemetry', 'errors'))).toBe(false);
  });
});
