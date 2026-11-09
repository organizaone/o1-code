/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Config } from '../../config/config.js';
import { Storage } from '../../config/storage.js';
import { InstallationManager } from '../../config/installationManager.js';
import { reachesOrganizaOne } from '../../providers/presets/organizaone.js';
import { AuthType } from '../../utils/auth-type.js';
import { createDebugLogger } from '../../utils/debugLogger.js';
import {
  collectUsage,
  UsageLedger,
  type DayUsage,
  type SessionMode,
} from './usage-ledger.js';
import {
  buildErrorReport,
  collectErrorReports,
  storeErrorReport,
  type ErrorKind,
  type ErrorReport,
} from './error-reports.js';

const debugLogger = createDebugLogger('PRODUCT_TELEMETRY');

/**
 * The intake for usage metrics and error reports. `O1CODE_TELEMETRY_URL`
 * points it elsewhere, for tests or a self-hosted intake.
 */
export const DEFAULT_PRODUCT_TELEMETRY_URL =
  'https://api.organizaone.com/telemetry/v1';
export const PRODUCT_TELEMETRY_SCHEMA = 1;

/** Usage is sent at most this often, across every process of the install. */
const USAGE_SEND_INTERVAL_MS = 60 * 60 * 1000;
/** A running session persists its counts and tries to send this often. */
const TICK_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_SEND_DELAY_MS = 10 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
/** Body limits of the intake, less a margin. */
const MAX_USAGE_BODY_BYTES = 250_000;
const MAX_ERROR_BODY_BYTES = 60_000;

/** Built-in tool names reported as themselves; others are grouped. */
const SAFE_NAME = /^[a-z][a-z0-9_.:-]{0,63}$/;
const KNOWN_AUTH_TYPES = new Set<string>(Object.values(AuthType));

export interface ClientInfo {
  version: string;
  os: string;
  arch: string;
  node: string;
  install: string;
  locale: string;
}

function isDoNotTrack(): boolean {
  const value = process.env['DO_NOT_TRACK'];
  return value !== undefined && value !== '' && value !== '0';
}

/** Usage metrics are sent: `privacy.usageStatisticsEnabled` and no `DO_NOT_TRACK`. */
export function isUsageReportingEnabled(config: Config): boolean {
  return config.getUsageStatisticsEnabled() && !isDoNotTrack();
}

/** Error reports are sent: `privacy.errorReportsEnabled` and no `DO_NOT_TRACK`. */
export function isErrorReportingEnabled(config: Config): boolean {
  return config.getErrorReportsEnabled() && !isDoNotTrack();
}

function telemetryUrl(): string {
  return (
    process.env['O1CODE_TELEMETRY_URL'] || DEFAULT_PRODUCT_TELEMETRY_URL
  ).replace(/\/+$/, '');
}

function telemetryDir(): string {
  return path.join(Storage.getGlobalO1CodeDir(), 'telemetry');
}

function osName(): string {
  return ['win32', 'darwin', 'linux'].includes(process.platform)
    ? process.platform
    : 'other';
}

function archName(): string {
  return ['x64', 'arm64'].includes(process.arch) ? process.arch : 'other';
}

function localeName(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(locale)
      ? locale
      : 'other';
  } catch {
    return 'other';
  }
}

/** Per-process state, set by {@link startProductTelemetry}. */
interface ProductTelemetryState {
  config: Config;
  ledger: UsageLedger;
  client: ClientInfo;
  /** Resolved into `client.install` before the first report. */
  install?: string | (() => string);
  timer?: NodeJS.Timeout;
}

function resolveInstall(current: ProductTelemetryState): void {
  if (current.install === undefined) return;
  let install: string;
  try {
    install =
      typeof current.install === 'function'
        ? current.install()
        : current.install;
  } catch {
    install = 'unknown';
  }
  current.client.install = SAFE_NAME.test(install) ? install : 'unknown';
  current.install = undefined;
}

let state: ProductTelemetryState | undefined;
let exitHookInstalled = false;
let errorReporting:
  | { enabled: boolean; version: string; directory: string }
  | undefined;

export interface ProductTelemetryOptions {
  /**
   * How the application was installed, e.g. `npm`, `standalone`, `homebrew`.
   * A function is called only when the first report is sent, since finding
   * out may run a package manager.
   */
  install?: string | (() => string);
  /** Skips the timers; for tests and one-shot processes that send explicitly. */
  manual?: boolean;
}

/**
 * Starts counting usage for this process and schedules sending what earlier
 * sessions counted. Does nothing when both switches are off.
 */
export function startProductTelemetry(
  config: Config,
  options: ProductTelemetryOptions = {},
): void {
  try {
    start(config, options);
  } catch (error) {
    // Telemetry never stands in the way of starting a session.
    debugLogger.debug('Product telemetry did not start:', error);
    state = undefined;
  }
}

function start(config: Config, options: ProductTelemetryOptions): void {
  const client: ClientInfo = {
    version: config.getCliVersion() ?? 'unknown',
    os: osName(),
    arch: archName(),
    node: process.versions.node.split('.')[0] ?? 'unknown',
    install: 'unknown',
    locale: localeName(),
  };
  const install = options.install;
  errorReporting = {
    enabled: isErrorReportingEnabled(config),
    version: client.version,
    directory: path.join(telemetryDir(), 'errors'),
  };
  if (!isUsageReportingEnabled(config) && !errorReporting.enabled) {
    state = undefined;
    return;
  }
  if (state?.timer) clearInterval(state.timer);
  state = {
    config,
    ledger: new UsageLedger(path.join(telemetryDir(), 'usage')),
    client,
    install,
  };
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', () => state?.ledger.persist());
  }
  if (options.manual) return;
  setTimeout(() => void sendProductTelemetry(), FIRST_SEND_DELAY_MS).unref();
  state.timer = setInterval(() => {
    state?.ledger.persist();
    void sendProductTelemetry();
  }, TICK_INTERVAL_MS);
  state.timer.unref();
}

/** The usage recorder for this process, when usage metrics are on. */
export function productUsage(config: Config): ProductUsageRecorder | undefined {
  if (!state || !isUsageReportingEnabled(config)) return undefined;
  return recorder;
}

class ProductUsageRecorder {
  session(config: Config): void {
    const mode: SessionMode = config.isInteractive()
      ? 'interactive'
      : config.getInputFormat() === 'stream-json' ||
          config.getExperimentalZedIntegration()
        ? 'sdk'
        : 'headless';
    state?.ledger.session(mode);
  }

  prompt(): void {
    state?.ledger.prompt();
  }

  toolCall(name: string, type: 'native' | 'mcp' | undefined): void {
    state?.ledger.toolCall(
      type === 'mcp' ? 'mcp' : SAFE_NAME.test(name) ? name : 'other',
    );
  }

  slashCommand(name: string, builtIn: boolean | undefined): void {
    state?.ledger.slashCommand(
      builtIn && SAFE_NAME.test(name) ? name : 'custom',
    );
  }

  apiResponse(
    config: Config,
    authType: string | undefined,
    input: number,
    output: number,
  ): void {
    state?.ledger.apiResponse(providerKind(config, authType), input, output);
  }

  apiError(statusCode: number | string | undefined, errorType?: string): void {
    const status = Number(statusCode);
    state?.ledger.apiError(
      Number.isInteger(status) && status >= 100 && status < 600
        ? `http_${status}`
        : errorType && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(errorType)
          ? errorType
          : 'other',
    );
  }

  subagent(): void {
    state?.ledger.subagent();
  }
}

const recorder = new ProductUsageRecorder();

function providerKind(config: Config, authType: string | undefined): string {
  if (reachesOrganizaOne(config.getContentGeneratorConfig?.())) {
    return 'organizaone';
  }
  return authType && KNOWN_AUTH_TYPES.has(authType) ? authType : 'other';
}

/**
 * Stores an error that reached a process-wide handler, to be sent with the
 * next report. Synchronous: it runs in crash handlers.
 */
export function recordErrorReport(error: unknown, kind: ErrorKind): void {
  if (!errorReporting?.enabled) return;
  storeErrorReport(
    errorReporting.directory,
    buildErrorReport(error, kind, errorReporting.version),
  );
}

async function post(endpoint: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(`${telemetryUrl()}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch (error) {
    debugLogger.debug(`Sending ${endpoint} failed:`, error);
    return false;
  }
}

interface SendState {
  lastUsageSentAt?: number;
}

function readSendState(file: string): SendState {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SendState;
  } catch {
    return {};
  }
}

export interface UsagePayload {
  schema: number;
  installationId: string;
  client: ClientInfo;
  days: DayUsage[];
}

/**
 * Error reports carry no installation ID: they describe the application's
 * failures, not who had them, so nothing ties them to a device.
 */
export interface ErrorPayload {
  schema: number;
  client: ClientInfo;
  errors: ErrorReport[];
}

/**
 * Sends what is pending: the usage totals of the last days, at most hourly,
 * and stored error reports. Never throws; a failure keeps the data for the
 * next attempt.
 */
export async function sendProductTelemetry(
  now: Date = new Date(),
): Promise<void> {
  const current = state;
  if (!current) return;
  resolveInstall(current);
  const directory = telemetryDir();

  if (isUsageReportingEnabled(current.config)) {
    const stateFile = path.join(directory, 'state.json');
    const sendState = readSendState(stateFile);
    if (
      !sendState.lastUsageSentAt ||
      now.getTime() - sendState.lastUsageSentAt >= USAGE_SEND_INTERVAL_MS
    ) {
      current.ledger.persist();
      const usage = collectUsage(path.join(directory, 'usage'), now);
      const payload: UsagePayload = {
        schema: PRODUCT_TELEMETRY_SCHEMA,
        // Read only for usage metrics, so error reports alone never create
        // or read the installation ID.
        installationId: new InstallationManager().getInstallationId(),
        client: current.client,
        days: usage.days,
      };
      // Over the intake's limit the oldest days go unsent; their files are
      // finished days, removed with the others once the rest is accepted.
      while (
        payload.days.length > 1 &&
        JSON.stringify(payload).length > MAX_USAGE_BODY_BYTES
      ) {
        payload.days.shift();
      }
      if (await post('usage', payload)) {
        for (const file of usage.completedFiles) {
          fs.rmSync(file, { force: true });
        }
        try {
          fs.mkdirSync(directory, { recursive: true });
          fs.writeFileSync(
            stateFile,
            JSON.stringify({ ...sendState, lastUsageSentAt: now.getTime() }),
          );
        } catch {
          // Without the state file the next session simply sends again.
        }
      }
    }
  } else {
    // Turning usage metrics off also discards the counts kept until then.
    fs.rmSync(path.join(directory, 'usage'), { recursive: true, force: true });
  }

  if (errorReporting?.enabled) {
    const collected = collectErrorReports(errorReporting.directory);
    const payload: ErrorPayload = {
      schema: PRODUCT_TELEMETRY_SCHEMA,
      client: current.client,
      errors: [],
    };
    const sent: string[] = [];
    // As many reports as fit the intake's limit; the rest wait their turn.
    collected.reports.forEach((report, index) => {
      payload.errors.push(report);
      if (
        payload.errors.length > 1 &&
        JSON.stringify(payload).length > MAX_ERROR_BODY_BYTES
      ) {
        payload.errors.pop();
      } else {
        sent.push(collected.files[index]!);
      }
    });
    if (payload.errors.length > 0 && (await post('errors', payload))) {
      for (const file of sent) fs.rmSync(file, { force: true });
    }
  } else if (errorReporting) {
    // Turning reports off also discards what was stored while they were on.
    fs.rmSync(errorReporting.directory, { recursive: true, force: true });
  }
}

/** Test hook: forgets the process state. */
export function resetProductTelemetryForTesting(): void {
  if (state?.timer) clearInterval(state.timer);
  state = undefined;
  errorReporting = undefined;
}
