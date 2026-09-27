/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  assertExecutionSandboxSupported,
  readOperatorSandboxSettings,
  InvalidExecutionSandboxConfigError,
} from '../config/execution-sandbox-settings.js';
import { X509Certificate } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import * as fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import * as os from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import express, {
  type Application,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { writeStderrLine, writeStdoutLine } from '../utils/stdioHelpers.js';
import { isWithinRoot } from '../config/path-comparison.js';
import { readSshWorkspace } from './ssh-workspace-store.js';
import {
  acquireInheritedLoaderEnvScrub,
  clearLoaderKeyRejectionReporterIfCurrent,
  scrubInheritedLoaderEnv,
  setLoaderKeyRejectionReporter,
  type LoaderKeyRejectionReporter,
} from '../config/shared-env-keys.js';
import {
  DEFAULT_COMPACTED_REPLAY_MAX_BYTES,
  DEFAULT_MAX_JOURNAL_BYTES,
  DEFAULT_MAX_JOURNAL_EVENTS,
  JOURNAL_GROWTH_HARD_CAP_BYTES,
  normalizeCompactedReplayMaxBytes,
  normalizeMaxJournalBytes,
  normalizeMaxJournalEvents,
  type JournalGrowthSessionLimit,
} from '@organizaone/o1-code-acp-bridge/replayWindowLimits';
import {
  DEFAULT_RING_SIZE,
  type BridgeEvent,
} from '@organizaone/o1-code-acp-bridge/eventBus';
import { resolveSessionRestoreTimeoutMs } from '@organizaone/o1-code-acp-bridge/sessionRestoreTimeout';
import type { IdleAcpReclaimer } from './idle-acp-reclamation.js';
import type {
  NdJsonMessageObservation,
  NdJsonQueueSaturationInfo,
} from '@organizaone/o1-code-acp-bridge/ndJsonStream';
import { getEnvironmentBeforeLoad } from '../config/environment-snapshot.js';
import {
  consumeServeFastPathRejectedLoaderKeys,
  loadServeFastPathSettings,
  preResolveServeFastPathHomeEnvOverrides,
  type ServeFastPathSettings,
} from './fast-path-settings.js';
import {
  resolveMaxRegisteredWorkspaces,
  resolveWorkspaceInputs,
} from './workspace-inputs.js';
import type { AcpSessionBridge } from '@organizaone/o1-code-acp-bridge/bridgeTypes';
import {
  formatMemoryBudgetStderr,
  resolveDaemonMemoryBudget,
  serveJournalGrowthPoolMb,
} from '@organizaone/o1-code-acp-bridge/daemonMemoryBudget';
import {
  createChildHeapPolicy,
  type ChildHeapPolicy,
} from '@organizaone/o1-code-acp-bridge/childHeapPolicy';
import {
  canonicalizeWorkspace,
  translateAndCheckAbsoluteWorkspacePath,
} from '@organizaone/o1-code-acp-bridge/workspacePaths';
import type {
  AuthType,
  ProviderSetupInputs,
  TelemetryRuntimeConfig,
  TelemetrySettings,
} from '@organizaone/o1-code-core';
// Named subpath: the core barrel pulls shell/glob/chokidar into the serve
// pre-listen static closure.
import {
  PRIVATE_CONVERSATIONS_RUNTIME_ENABLE,
  PRIVATE_CONVERSATIONS_RUNTIME_ENV,
} from '@organizaone/o1-code-core/conversationsRuntimeMarker';
import { MEMORY_PROJECT_SCOPES } from '@organizaone/o1-code-core/memoryScopes';
import { createBridgeFileSystemAdapter } from './bridge-file-system-adapter.js';
// Dynamic-imported below (not at module scope) so the serve fast-path bundle
// closure check doesn't trace create-sub-session's transitive deps through
// the run-o1-code-serve chunk. The launcher is only needed after listen().
import { PathMutexRegistry } from './fs/path-mutex-registry.js';
import { isDeepHealthQuery } from './health-query.js';
import { isLoopbackAddress, isLoopbackBind } from './loopback-binds.js';
import { RUNTIME_STARTUP_CANCELLED_MESSAGE } from './runtime-startup-errors.js';
import {
  installSelfOriginStripMiddleware,
  installRemoteSelfOriginMiddleware,
} from './server/self-origin.js';
import { resolveWebShellDir } from './web-shell-resolver.js';
import {
  O1CODE_SERVER_TOKEN_ENV,
  resolveRemoteServeToken,
} from './serve-token.js';
import {
  printRemoteQuickstart,
  tokenQrNoEffectReason,
} from './remote-quickstart.js';
import { acpChildExtraArgs } from './acp-child-extra-args.js';
import {
  allowOriginCors,
  bearerAuth,
  denyBrowserOriginCors,
  findNonLoopbackHttpOrigin,
  hostAllowlist,
  isTrustedLoopbackMode,
  parseAllowOriginPatterns,
} from './auth.js';
import type { LocalControlService } from './local-control/index.js';
import {
  createPermissionAuditPublisher,
  PermissionAuditRing,
} from './permission-audit.js';
import { ClientMcpSenderRegistry } from './acp-http/client-mcp-sender-registry.js';
import {
  initDaemonLogger,
  resolveDaemonLogBaseDir,
  type DaemonLogger,
} from './daemon-logger.js';
import {
  getAdvertisedServeFeatures,
  getServeProtocolVersions,
  SERVE_CAPABILITY_REGISTRY,
} from './capabilities.js';
import { isNativeDirectoryPickerAvailable } from './native-directory-picker.js';
import {
  isLocalPathOpenAvailable,
  isLocalTerminalAvailable,
} from './local-path-open.js';
import {
  EXTERNAL_TOOL_GUARD_PROVIDER_ATTACHED_VALUE,
  EXTERNAL_TOOL_GUARD_REQUIRED_VALUE,
  EXTERNAL_TOOL_GUARD_TOKEN_ENV,
  PRIVATE_EXTERNAL_TOOL_GUARD_ENV,
  PRIVATE_EXTERNAL_TOOL_GUARD_PROVIDER_ENV,
} from '@organizaone/o1-code-acp-bridge/externalToolGuard';
import {
  CAPABILITIES_SCHEMA_VERSION,
  type CapabilitiesEnvelope,
  type ServeAuthProviderInstallRequest,
  type ServeAuthProviderInstallResult,
  type ServeOptions,
} from './types.js';
import type { WorkspaceFileSystemFactory } from './fs/index.js';
import type {
  WorkspaceGenerationGuard,
  WorkspaceRegistry,
  WorkspaceRuntime,
} from './workspace-registry.js';
import type { SessionArchiveCoordinator } from './server/session-archive.js';
import type {
  DaemonTrustPolicySnapshot,
  DaemonWorkspaceTrustDecision,
} from '../config/daemon-trust-policy.js';
import {
  isManagedScratchChild,
  prepareManagedScratchRoot,
  type ManagedScratchRoot,
  type WorkspaceRuntimeProvenance,
} from './managed-scratch-workspace.js';
import { ConversationWorkspace } from './conversations/conversation-workspace.js';
import { ServeAppLifecycleController } from './serve-app-lifecycle.js';
import {
  workspaceRegistrationId,
  type WorkspaceRegistrationStore,
} from './workspace-registration-store.js';
import type { PermissionPolicy } from '@organizaone/o1-code-acp-bridge';
import type {
  CurrentSessionScheduledTaskCreateHandler,
  ExternalToolGuardHandler,
} from '@organizaone/o1-code-acp-bridge/bridgeOptions';
import { getCliVersion } from '../utils/version.js';
import { getRateLimiter } from './rate-limit.js';
import type { AcpHttpHandle } from './acp-http/index.js';
import { resolveAcpHttpEnabled } from './acp-http-enabled.js';
import type { WorkspaceRuntimeRemovalController } from './routes/workspace-management.js';
import {
  allowOriginMode,
  listenerMaxConnections,
  parseDaemonStatusDetail,
  positiveFiniteOrNull,
  toDaemonStatusMemoryLimits,
  type DaemonStatusIssue,
  type DaemonPerfSnapshot,
  type DaemonStartupSnapshot,
  type DaemonStatusResponse,
} from './daemon-status.js';
import { DaemonMetricsRing } from './daemon-metrics-ring.js';
import { computeCpuPercent } from '../runtime/cpu-percent.js';
import { createLargePipeFrameObserver } from './large-pipe-frame-observer.js';
import {
  finalizeStartupProfile,
  profileCheckpoint,
} from '../utils/startupProfiler.js';
import { WorkspaceVoiceCoordinator } from './voice/workspace-voice-coordinator.js';
import {
  ACCESS_LOG_CONTROLLER_LOCAL,
  type AccessLogAppLocals,
} from './server/access-log.js';
import {
  setDeferredRuntimeRequestTiming,
  type DeferredRuntimeRequestTiming,
} from './server/request-helpers.js';

// Reverse MCP channel; enabled only by explicit option or env opt-in.
const O1CODE_SERVE_CLIENT_MCP_OVER_WS_ENV = 'O1CODE_SERVE_CLIENT_MCP_OVER_WS';
const O1CODE_SERVE_PROMPT_DEADLINE_MS_ENV = 'O1CODE_SERVE_PROMPT_DEADLINE_MS';
const O1CODE_SERVE_WRITER_IDLE_TIMEOUT_MS_ENV =
  'O1CODE_SERVE_WRITER_IDLE_TIMEOUT_MS';
const SHUTDOWN_FORCE_CLOSE_MS = 5_000;
const DAEMON_LOG_FORCED_FLUSH_BUDGET_MS = 250;
// Must match workspace-runtime-coordinator ENSURE_KEEP_ALIVE_MS. Defined
// here so the serve pre-listen graph does not statically import that module.
const ENSURE_KEEP_ALIVE_MS = 10 * 60_000;

function deepestErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  let deepest: Error = err;
  while (deepest.cause instanceof Error) {
    deepest = deepest.cause;
  }
  return deepest.message;
}

async function flushDaemonLogBounded(
  daemonLog: DaemonLogger,
  budgetMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      daemonLog.flush().catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, budgetMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function writeDaemonLifecycleBestEffort(write: () => void): void {
  try {
    write();
  } catch {
    // Best-effort lifecycle diagnostics must not make shutdown throw.
  }
}

function daemonPipeDirection(
  direction: NdJsonMessageObservation['direction'],
): 'inbound' | 'outbound' {
  switch (direction) {
    case 'sent':
      return 'outbound';
    case 'received':
      return 'inbound';
    default: {
      const exhaustive: never = direction;
      return exhaustive;
    }
  }
}

// Daemon Status metrics ring: seal one bucket every SAMPLE_MS and retain
// CAPACITY of them (5s × 180 ≈ 15 min of history), matching the dashboard's
// own 5s poll so each poll surfaces roughly one fresh bucket.
const DAEMON_METRICS_SAMPLE_MS = 5_000;
const DAEMON_METRICS_CAPACITY = 180;

// `process.cpuUsage()` can throw in restricted containers that lack the
// syscall; return null so the sampler can skip the delta (and leave its
// baseline untouched) rather than treating a failed read as zero usage —
// which would turn the next successful read's since-start total into a spike.
function safeCpuUsage(): NodeJS.CpuUsage | null {
  try {
    return process.cpuUsage();
  } catch {
    return null;
  }
}
const DEFAULT_RUNTIME_STARTUP_TIMEOUT_MS = 120_000;
// Let the first /health response flush before evaluating the runtime graph.
const FAST_PATH_RUNTIME_START_AFTER_HEALTH_MS = 50;
// Keep manual/non-probed starts moving; health probes cancel this fallback.
const FAST_PATH_RUNTIME_START_FALLBACK_MS = 1_000;
const RUNTIME_STARTUP_TIMEOUT_ENV = 'O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS';
const MAX_EVENT_RING_SIZE = 1_000_000;
const DEFAULT_MAX_SESSIONS = 32;
const DEFAULT_MAX_PENDING_PROMPTS_PER_SESSION = 5;
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_SESSION_PROMPT_SETTLED_CLOSE_GRACE_MS = 0;
const WORKSPACE_SETTING_SCOPE =
  'Workspace' as import('../config/settings.js').SettingScope;

type RunO1CodeServeOptions = Omit<ServeOptions, 'token' | 'workspace'> & {
  token?: string;
  workspace?: string | string[];
  requireWebShell?: boolean;
};
type WorkspaceSettingsWrite =
  import('./workspace-service/types.js').WorkspaceSettingsWrite;
type PersistDisabledSkillsBatchResult =
  import('./workspace-service/types.js').PersistDisabledSkillsBatchResult;
type ServeWorkspaceSkillStatus =
  import('@organizaone/o1-code-acp-bridge/status').ServeWorkspaceSkillStatus;

function isPositiveIntegerMs(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function isNonNegativeIntegerOrInfinity(value: number): boolean {
  return (
    value === Number.POSITIVE_INFINITY ||
    (Number.isFinite(value) && Number.isInteger(value) && value >= 0)
  );
}

function deriveDefaultMaxTotalSessions(
  maxSessionsPerWorkspace: number | undefined,
  workspaceCount: number,
  maxRegisteredWorkspaces: number,
): number | undefined {
  // Keep the legacy session-policy threshold independent of registration defaults.
  if (maxRegisteredWorkspaces > 25) return 800;
  if (workspaceCount <= 1) return undefined;
  const perWorkspace = maxSessionsPerWorkspace ?? DEFAULT_MAX_SESSIONS;
  if (perWorkspace === 0 || perWorkspace === Number.POSITIVE_INFINITY) {
    return undefined;
  }
  return perWorkspace * workspaceCount;
}

function isNonNegativeIntegerMs(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

const MAX_TIMEOUT_MS = 2_147_483_647;

const MAX_PORT_ATTEMPTS = 10;

function assertTimerDelayInRange(name: string, value: number): void {
  if (value > MAX_TIMEOUT_MS) {
    throw new TypeError(
      `Invalid ${name}: ${value}. Exceeds maximum JS timer delay of ` +
        `${MAX_TIMEOUT_MS} ms (~24.8 days); Node would silently ` +
        `compress longer delays to 1ms.`,
    );
  }
}

/**
 * Resolve a positive-integer millisecond value from an env var.
 * Returns `undefined` when the var is absent (caller falls back to the
 * CLI option / `ServeOptions` field), throws when the var is present
 * but malformed so a typo fails the boot loudly instead of silently
 * disabling the deadline.
 */
function parseDeadlineEnv(
  envName: string,
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) return undefined;
  // Don't early-return on empty/whitespace: `Number('')` and
  // `Number(' ')` both yield `0`, which the positive-integer check
  // below rejects with the standard error message. Silently treating
  // `O1CODE_SERVE_PROMPT_DEADLINE_MS=" "` as "not set" would let a
  // shell-substitution typo slip past.
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (!isPositiveIntegerMs(parsed)) {
    throw new Error(
      `Invalid ${envName}="${raw}": must be a positive integer (milliseconds).`,
    );
  }
  return parsed;
}

function envFlagDisabled(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '0' || normalized === 'false';
}

function createDaemonTelemetryRuntimeConfig(
  telemetry: TelemetrySettings,
  cliVersion: string,
  daemonSessionId: string,
  defaults: {
    otlpEndpoint: string;
    telemetryTarget: NonNullable<TelemetrySettings['target']>;
  },
): TelemetryRuntimeConfig {
  return {
    getTelemetryEnabled: () => telemetry.enabled ?? false,
    getTelemetryOtlpEndpoint: () =>
      telemetry.otlpEndpoint ?? defaults.otlpEndpoint,
    getTelemetryOtlpProtocol: () => telemetry.otlpProtocol ?? 'grpc',
    getTelemetryOtlpTracesEndpoint: () => telemetry.otlpTracesEndpoint,
    getTelemetryOtlpLogsEndpoint: () => telemetry.otlpLogsEndpoint,
    getTelemetryOtlpMetricsEndpoint: () => telemetry.otlpMetricsEndpoint,
    getTelemetryTarget: () => telemetry.target ?? defaults.telemetryTarget,
    getTelemetryOutfile: () => telemetry.outfile,
    getTelemetryIncludeSensitiveSpanAttributes: () =>
      telemetry.includeSensitiveSpanAttributes ?? false,
    getTelemetryResourceAttributes: () => ({
      'service.instance.id': daemonSessionId,
      ...(telemetry.resourceAttributes ?? {}),
    }),
    getTelemetryMetricsIncludeSessionId: () =>
      telemetry.metrics?.includeSessionId ?? false,
    getTelemetryResourceAttributeWarnings: () =>
      telemetry.resourceAttributeWarnings ?? [],
    getCliVersion: () => cliVersion,
    getSessionId: () => daemonSessionId,
    isInteractive: () => false,
    getOutboundCorrelationPropagateTraceContext: () => false,
  };
}

/**
 * Boot-time policy validation error. The catch block in `runO1CodeServe`
 * matches with `instanceof InvalidPolicyConfigError` to distinguish
 * operator-misconfiguration (rethrow → fail boot loudly) from
 * settings-read failures (fall back to defaults).
 */
export class InvalidPolicyConfigError extends Error {
  override readonly name = 'InvalidPolicyConfigError';
  constructor(message: string) {
    super(message);
  }
}

/**
 * Parse + validate the `policy.*` section of merged daemon settings.
 * Returns the resolved `permissionPolicy` /
 * `permissionConsensusQuorum` for `BridgeOptions`, or throws
 * `InvalidPolicyConfigError` for operator misconfiguration.
 *
 * - `permissionStrategy` must be one of the four `PermissionPolicy`
 *   literals if present.
 * - `consensusQuorum` must be a positive integer if present.
 * - When `consensusQuorum` is set but `permissionStrategy` is not
 *   `'consensus'`, the override is silently ignored — emit a
 *   stderr warning so the operator notices.
 *
 * The mismatch warning runs through `onWarning` so tests can
 * capture it; production passes `writeStderrLine`.
 *
 * The runtime valid-policy set is derived from
 * `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` (single
 * source of truth) instead of repeating the four literals.
 */
export function validatePolicyConfig(
  policyConfig: {
    permissionStrategy?: unknown;
    consensusQuorum?: unknown;
  } = {},
  onWarning: (message: string) => void = writeStderrLine,
): {
  permissionPolicy: PermissionPolicy | undefined;
  permissionConsensusQuorum: number | undefined;
} {
  // Derive from the capability registry so the runtime set, the
  // settings schema enum, the `PermissionPolicy` union, and the
  // capability advertisement all stay aligned through a single
  // edit point. The cast asserts every `modes` entry is a
  // `PermissionPolicy` — TypeScript's `satisfies Record<string,
  // ServeCapabilityDescriptor>` on the registry doesn't narrow
  // `modes` to the union, so the assertion is necessary here. The
  // `permissionMediation.test.ts` capability-suite asserts the
  // modes list is exhaustive over `PermissionPolicy`, providing
  // the runtime guarantee.
  const validSet: ReadonlySet<string> = new Set<string>(
    SERVE_CAPABILITY_REGISTRY.permission_mediation.modes,
  );
  const permissionStrategy = policyConfig.permissionStrategy;
  const consensusQuorum = policyConfig.consensusQuorum;
  if (
    permissionStrategy !== undefined &&
    (typeof permissionStrategy !== 'string' ||
      !validSet.has(permissionStrategy))
  ) {
    throw new InvalidPolicyConfigError(
      `o1-code serve: invalid policy.permissionStrategy ` +
        `"${String(permissionStrategy)}"; must be one of ` +
        `${Array.from(validSet).join(', ')}`,
    );
  }
  if (
    consensusQuorum !== undefined &&
    (typeof consensusQuorum !== 'number' ||
      !Number.isInteger(consensusQuorum) ||
      consensusQuorum < 1)
  ) {
    throw new InvalidPolicyConfigError(
      `o1-code serve: invalid policy.consensusQuorum ` +
        `${String(consensusQuorum)}; must be a positive integer`,
    );
  }
  // When consensusQuorum is set but the active strategy doesn't
  // use it, drop the value so the public contract matches the
  // warning. Operators reading the warning at boot now see
  // consistent behavior all the way down.
  const consensusQuorumActive =
    consensusQuorum !== undefined && permissionStrategy === 'consensus';
  if (consensusQuorum !== undefined && permissionStrategy !== 'consensus') {
    onWarning(
      'o1-code serve: policy.consensusQuorum is set but ' +
        'policy.permissionStrategy is not "consensus"; the override will ' +
        'be ignored.',
    );
  }
  return {
    permissionPolicy: permissionStrategy as PermissionPolicy | undefined,
    permissionConsensusQuorum: consensusQuorumActive
      ? consensusQuorum
      : undefined,
  };
}

/**
 * Wrap raw IPv6 literals in brackets so the printed URL is a valid RFC 3986
 * authority. `host:port` is ambiguous when host contains `:`, so the URL
 * form requires `[host]:port` for IPv6. Pass-through for IPv4 and DNS
 * names. Already-bracketed input is left alone.
 *
 * RFC 6874 also requires the `%` in an IPv6 zone identifier (e.g.
 * `fe80::1%lo0`) to be percent-encoded as `%25` so the printed URL is
 * copy-paste-valid. We do that on raw IPv6 only — already-bracketed
 * input is the operator's responsibility (don't double-encode if they
 * pre-formed the URL part themselves).
 */
function formatHostForUrl(host: string): string {
  if (host.startsWith('[')) return host;
  if (host.includes(':')) {
    const encoded = host.includes('%') ? host.replace(/%/g, '%25') : host;
    return `[${encoded}]`;
  }
  return host;
}

/**
 * Pull the `context.fileName` snapshot out of merged settings into a
 * typed string, falling back to `undefined` when the value is missing
 * or malformed.
 *
 * Validation contract:
 *   - non-empty string after trim → returned trimmed
 *   - array → first non-empty string element after trim, or undefined
 *   - anything else (object, number, boolean, undefined) → undefined
 *
 * Returning `undefined` leaves the workspace on the daemon's init-default
 * chain — the primary workspace's configured `context.fileName` snapshot
 * (`contextFilenameForInit`), then the hard-coded `AGENTS.md` — so a malformed
 * value keeps the daemon alive rather than producing a garbage filename.
 */
export function extractContextFilename(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed !== '') return trimmed;
      }
    }
    return undefined;
  }
  return undefined;
}

function sessionArtifactsPersistenceAvailableFromSettings(
  settings: { general?: { chatRecording?: unknown } } | undefined,
): boolean {
  return settings?.general?.chatRecording !== false;
}

/**
 * Reads the optional `serve.maxConcurrentSubSessions*` overrides. Only
 * positive integers are honored; anything else falls back to the launcher's
 * built-in defaults. A present-but-invalid value is reported through
 * `onWarning` (matching the other settings-load fallback sites in this file)
 * so an operator who mistypes a cap sees the fallback instead of silently
 * running on the default. Caps are a daemon-resource control, so an untrusted
 * workspace's settings (skipped at load time) must not raise them — the
 * caller passes the already trust-filtered merged settings.
 */
export function subSessionConcurrencyCapsFromSettings(
  serve: {
    maxConcurrentSubSessionsPerCaller?: unknown;
    maxConcurrentSubSessionsTotal?: unknown;
  },
  onWarning: (message: string) => void = writeStderrLine,
): {
  maxConcurrentPerCaller?: number;
  maxConcurrentTotal?: number;
} {
  const asCap = (key: string, value: unknown): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
      return value;
    }
    onWarning(
      `o1-code serve: ignoring invalid ${key} (${JSON.stringify(value)}); ` +
        `expected a positive integer, falling back to the built-in default.`,
    );
    return undefined;
  };
  const maxConcurrentPerCaller = asCap(
    'maxConcurrentSubSessionsPerCaller',
    serve.maxConcurrentSubSessionsPerCaller,
  );
  const maxConcurrentTotal = asCap(
    'maxConcurrentSubSessionsTotal',
    serve.maxConcurrentSubSessionsTotal,
  );
  return {
    ...(maxConcurrentPerCaller !== undefined ? { maxConcurrentPerCaller } : {}),
    ...(maxConcurrentTotal !== undefined ? { maxConcurrentTotal } : {}),
  };
}

/**
 * Per-workspace promise chain that serializes settings read-modify-write
 * cycles inside this process.
 *
 * Both `persistApprovalMode` and `persistDisabledTools` re-read
 * `tools.disabled` (or `tools.approvalMode`) from disk before writing
 * the merged result back, which is a textbook lost-update window if
 * two concurrent HTTP requests land at the same workspace. Threading
 * each call through this lock collapses the window.
 *
 * Scope is INTRA-process: per-workspace single-daemon is the supported
 * deployment shape. Errors propagate to the caller; the chain advances
 * to the next waiter regardless via the `.then(fn, fn)` pattern, so a
 * single failed write doesn't permanently stall persistence.
 */
const settingsWriteLocks = new Map<string, Promise<unknown>>();
function withSettingsLock<T>(
  workspace: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = settingsWriteLocks.get(workspace) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  settingsWriteLocks.set(workspace, next);
  return next;
}

export interface RunHandle {
  server: Server;
  url: string;
  bridge: AcpSessionBridge;
  /**
   * Whether the Web Shell UI was actually mounted (assets resolved and
   * `serveWebShell !== false`). The `--open` launcher checks this so it never
   * points a browser at an API-only daemon.
   */
  webShellMounted: boolean;
  /**
   * The bearer token the daemon actually authenticates against (already
   * trimmed), or undefined when none is configured. `--open` reads this so the
   * URL it hands the browser always matches the server's value instead of
   * re-deriving it from argv/env.
   */
  resolvedToken?: string;
  /** Resolves when the full REST/Web/ACP runtime has been mounted. */
  runtimeReady: Promise<void>;
  /**
   * The Local Control service, once the runtime app exists.
   *
   * A getter rather than a field because the runtime app is mounted after the
   * listener is up: at the moment this handle is constructed there is nothing
   * to hand back. Callers await `runtimeReady` first — before that it is
   * undefined, which is also what an API-only daemon returns forever.
   */
  getLocalControl(): LocalControlService | undefined;
  /** Resolves when the listener has fully closed and the bridge is drained. */
  close(): Promise<void>;
}

type CoreRuntime = typeof import('./core-runtime.js');
type ProviderConfig = NonNullable<ReturnType<CoreRuntime['findProviderById']>>;
type SettingsRuntime = typeof import('../config/settings.js');
type EnvironmentRuntime = typeof import('../config/environment.js');
type LoadedSettingsAdapterRuntime =
  typeof import('../config/loadedSettingsAdapter.js');
type TrustedFoldersRuntime = typeof import('../config/trustedFolders.js');
function normalizeInstallModelIds(
  req: ServeAuthProviderInstallRequest,
  provider: ProviderConfig,
  getDefaultModelIds: CoreRuntime['getDefaultModelIds'],
): string[] {
  const fromRequest = req.modelIds
    ?.map((id) => id.trim())
    .filter((id) => id.length > 0);
  const modelIds =
    fromRequest && fromRequest.length > 0
      ? fromRequest
      : getDefaultModelIds(provider);
  return [...new Set(modelIds)];
}

function buildProviderSetupInputs(
  req: ServeAuthProviderInstallRequest,
  provider: ProviderConfig,
  helpers: {
    getDefaultModelIds: CoreRuntime['getDefaultModelIds'];
    resolveBaseUrl: CoreRuntime['resolveBaseUrl'];
  },
): ProviderSetupInputs {
  const protocol = (req.protocol ?? provider.protocol) as AuthType;
  const baseUrl = helpers.resolveBaseUrl(provider, req.baseUrl);
  return {
    ...(provider.protocolOptions ? { protocol } : {}),
    ...(req.wireApi ? { wireApi: req.wireApi } : {}),
    baseUrl,
    apiKey: req.apiKey.trim(),
    modelIds: normalizeInstallModelIds(
      req,
      provider,
      helpers.getDefaultModelIds,
    ),
    ...(req.advancedConfig ? { advancedConfig: req.advancedConfig } : {}),
  };
}

export interface RunO1CodeServeDeps {
  /** Bridge instance; tests inject a fake. Defaults to a fresh real one. */
  bridge?: AcpSessionBridge;
  /** Test/embed override for the plain HTTP server constructor. */
  httpServerFactory?: (app: Application) => Server;
  /** Test override for resolving `localhost` before authority is derived. */
  bindHostnameLookup?: (
    hostname: string,
  ) => Promise<{ address: string; family: number }>;
  /**
   * Whether to start the real ACP child eagerly after listen. Production
   * keeps this on; tests can disable it so boot-path assertions do not wait
   * on a real child bridge.
   */
  preheatBridge?: boolean;
  /**
   * Workspace filesystem factory. When omitted, `runO1CodeServe`
   * constructs one using `boundWorkspace`, `trustedWorkspace`, and a
   * default warning-emit hook. Tests inject a real factory + custom
   * emit to capture audit events.
   */
  fsFactory?: WorkspaceFileSystemFactory;
  /**
   * Trust snapshot for the bound workspace at boot. Drives the
   * `WorkspaceFileSystem`'s `assertTrustedForIntent` gate — read
   * intents always pass; mutating intents (`write`, `edit`) throw
   * `untrusted_workspace` when this is false. Defaults to true:
   * the daemon binds at boot to a workspace the operator
   * explicitly chose, and the trust dialog flow that ungates write
   * permissions in the interactive CLI is not used by the daemon.
   * When omitted, the daemon evaluates the current trust policy and
   * hot-reloads runtime generations as that policy changes. Tests can pin
   * this value to disable hot reload and assert a fixed trust state.
   */
  trustedWorkspace?: boolean;
  /**
   * Audit-emit hook for `fs.access` / `fs.denied`. Defaults to a
   * stderr warning every 100 events so a regression that drops
   * audit emission stays visible in the operator log.
   */
  fsAuditEmit?: (event: BridgeEvent) => void;
  /**
   * Lightweight settings summary already loaded by the serve fast path.
   * Reusing it avoids a second pre-listen settings/env scan.
   */
  bootSettings?: ServeFastPathSettings;
  /**
   * Pre-resolved daemon debug directory. The full CLI/exported API can pass
   * Storage.getGlobalDebugDir(); the serve fast path intentionally avoids
   * importing core before listen and instead derives this from bootSettings.
   */
  daemonLogBaseDir?: string;
  /**
   * Internal CLI fast-path mode: resolve once the TCP listener is ready.
   * The default preserves the embedded API contract by resolving only after
   * the runtime bridge and routes are mounted.
   */
  resolveOnListen?: boolean;
  /**
   * Internal serve fast-path mode: keep bootstrap /health responsive before
   * starting the heavier runtime graph. A fallback timer still starts runtime
   * when no health probe arrives. Only applies with resolveOnListen.
   */
  deferRuntimeUntilFirstHealth?: boolean;
  /**
   * Bounds background runtime mounting after the listener is ready. Defaults to
   * O1CODE_SERVE_RUNTIME_STARTUP_TIMEOUT_MS, then 120s. Use 0 to disable.
   */
  runtimeStartupTimeoutMs?: number;
  workspaceRegistrationStore?: WorkspaceRegistrationStore;
  /** Test/embed override; production uses the private user Conversations root. */
  liveConversationWorkspace?: ConversationWorkspace;
  /** Test/embed override; production uses ~/.o1-code for the Conversations owner record. */
  conversationStableBaseDir?: string;
}

function shouldPreheatBridge(deps: RunO1CodeServeDeps): boolean {
  if (deps.preheatBridge !== undefined) return deps.preheatBridge;
  return process.env['VITEST_WORKER_ID'] === undefined;
}

let coreRuntimePromise: Promise<CoreRuntime> | undefined;
function loadCoreRuntime(): Promise<CoreRuntime> {
  coreRuntimePromise ??= import('./core-runtime.js');
  return coreRuntimePromise;
}

async function resolveDaemonLogBaseDirForRun(input: {
  deps: RunO1CodeServeDeps;
  bootSettings: ServeFastPathSettings | undefined;
  boundWorkspace: string;
}): Promise<string> {
  if (input.deps.daemonLogBaseDir) {
    return input.deps.daemonLogBaseDir;
  }
  if (input.deps.bootSettings === undefined) {
    const core = await loadCoreRuntime();
    if (
      core.Storage.getRuntimeBaseDir() !== core.Storage.getGlobalO1CodeDir()
    ) {
      return core.Storage.getGlobalDebugDir();
    }
  }
  if (input.bootSettings?.advanced?.runtimeOutputDir !== undefined) {
    return resolveDaemonLogBaseDir(
      input.bootSettings.advanced.runtimeOutputDir,
      input.boundWorkspace,
    );
  }
  if (input.deps.bootSettings !== undefined) {
    return resolveDaemonLogBaseDir(undefined, input.boundWorkspace);
  }
  const core = await loadCoreRuntime();
  return core.Storage.getGlobalDebugDir();
}

let settingsRuntimePromise:
  | Promise<{
      settings: SettingsRuntime;
      environment: EnvironmentRuntime;
      loadedSettingsAdapter: LoadedSettingsAdapterRuntime;
      trustedFolders: TrustedFoldersRuntime;
    }>
  | undefined;
function loadSettingsRuntimeModules(): Promise<{
  settings: SettingsRuntime;
  environment: EnvironmentRuntime;
  loadedSettingsAdapter: LoadedSettingsAdapterRuntime;
  trustedFolders: TrustedFoldersRuntime;
}> {
  settingsRuntimePromise ??= Promise.all([
    import('../config/settings.js'),
    import('../config/environment.js'),
    import('../config/loadedSettingsAdapter.js'),
    import('../config/trustedFolders.js'),
  ]).then(([settings, environment, loadedSettingsAdapter, trustedFolders]) => ({
    settings,
    environment,
    loadedSettingsAdapter,
    trustedFolders,
  }));
  return settingsRuntimePromise;
}

async function loadServeRuntimeModules() {
  const [
    serverModule,
    bridgeModule,
    spawnChannelModule,
    processRegistryModule,
    workspaceModule,
    workspaceTypesModule,
    daemonStatusProviderModule,
    workspaceProvidersStatusModule,
    workspaceSkillsStatusModule,
    totalSessionAdmissionModule,
    workspaceRegistryModule,
    workspaceRuntimeCoordinatorModule,
    promptLedgerModule,
  ] = await Promise.all([
    import('./server.js'),
    import('@organizaone/o1-code-acp-bridge/bridge'),
    import('@organizaone/o1-code-acp-bridge/spawnChannel'),
    import('@organizaone/o1-code-acp-bridge/processRegistry'),
    import('./workspace-service/index.js'),
    import('./workspace-service/types.js'),
    import('./daemon-status-provider.js'),
    import('./workspace-providers-status.js'),
    import('./workspace-skills-status.js'),
    import('./total-session-admission.js'),
    import('./workspace-registry.js'),
    import('./workspace-runtime-coordinator.js'),
    import('./prompt-terminal-ledger.js'),
  ]);
  return {
    createServeApp: serverModule.createServeApp,
    getActiveSseCount: serverModule.getActiveSseCount,
    resolveBoundWorkspacesFromIdeEnv:
      serverModule.resolveBoundWorkspacesFromIdeEnv,
    resolveBridgeFsFactory: serverModule.resolveBridgeFsFactory,
    createAcpSessionBridge: bridgeModule.createAcpSessionBridge,
    createSpawnChannelFactory: spawnChannelModule.createSpawnChannelFactory,
    daemonAcpNdJsonLimits: spawnChannelModule.DAEMON_ACP_NDJSON_LIMITS,
    ProcessRegistry: processRegistryModule.ProcessRegistry,
    createDaemonWorkspaceService: workspaceModule.createDaemonWorkspaceService,
    WorkspaceSettingsPartialPersistError:
      workspaceTypesModule.WorkspaceSettingsPartialPersistError,
    createDaemonStatusProvider:
      daemonStatusProviderModule.createDaemonStatusProvider,
    createWorkspaceProvidersStatusProvider:
      workspaceProvidersStatusModule.createWorkspaceProvidersStatusProvider,
    createWorkspaceSkillsStatusProvider:
      workspaceSkillsStatusModule.createWorkspaceSkillsStatusProvider,
    createTotalSessionAdmissionController:
      totalSessionAdmissionModule.createTotalSessionAdmissionController,
    createWorkspaceRegistry: workspaceRegistryModule.createWorkspaceRegistry,
    createWorkspaceSessionOwnerIndex:
      workspaceRegistryModule.createWorkspaceSessionOwnerIndex,
    createWorkspaceGenerationGuard:
      workspaceRegistryModule.createWorkspaceGenerationGuard,
    getWorkspaceRuntimeCoordinatorIfSupported:
      workspaceRuntimeCoordinatorModule.getWorkspaceRuntimeCoordinatorIfSupported,
    createPromptLedgerSink: promptLedgerModule.createPromptLedgerSink,
  };
}

function advertisedMaxSessions(value: number | undefined): number | null {
  if (value === undefined) return DEFAULT_MAX_SESSIONS;
  if (value === 0 || value === Number.POSITIVE_INFINITY) return null;
  return value;
}

function advertisedMaxPendingPromptsPerSession(
  value: number | undefined,
): number | null {
  if (value === undefined) return DEFAULT_MAX_PENDING_PROMPTS_PER_SESSION;
  if (value === 0 || value === Number.POSITIVE_INFINITY) return null;
  return value;
}

function channelIdleTimeoutMs(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.min(value, MAX_TIMEOUT_MS)
    : 0;
}

function sessionIdleTimeoutMs(value: number | undefined): number {
  return value !== undefined
    ? channelIdleTimeoutMs(value)
    : DEFAULT_SESSION_IDLE_TIMEOUT_MS;
}

function sessionPromptSettledCloseGraceMs(value: number | undefined): number {
  return value !== undefined
    ? channelIdleTimeoutMs(value)
    : DEFAULT_SESSION_PROMPT_SETTLED_CLOSE_GRACE_MS;
}

function currentServeFeaturesForRunO1CodeServe(
  opts: ServeOptions,
  sessionShellCommandEnabled: boolean,
  sessionArtifactsPersistenceAvailable: boolean,
  workspaceRuntimeAvailable: boolean,
  currentSessionSchedulingAvailable: boolean,
  env: Readonly<Record<string, string | undefined>>,
  nativeDirectoryPickerAvailable: boolean,
  localPathOpenAvailable: boolean,
  localTerminalOpenAvailable: boolean,
): string[] {
  return getAdvertisedServeFeatures(undefined, {
    requireAuth: opts.requireAuth === true,
    mcpPoolActive: opts.mcpPoolActive !== false,
    externalToolGuardActive: opts.externalToolGuard?.mode === 'required',
    allowOriginActive:
      opts.allowOrigins !== undefined && opts.allowOrigins.length > 0,
    ...(opts.promptDeadlineMs !== undefined
      ? { promptDeadlineMs: opts.promptDeadlineMs }
      : {}),
    ...(opts.writerIdleTimeoutMs !== undefined
      ? { writerIdleTimeoutMs: opts.writerIdleTimeoutMs }
      : {}),
    persistSettingAvailable: true,
    sessionShellCommandEnabled,
    sessionArtifactsPersistenceAvailable,
    sessionGenerationAvailable: true,
    currentSessionSchedulingAvailable,
    workspaceGenerationAvailable: true,
    rateLimit: opts.rateLimit === true,
    reloadAvailable: true,
    persistentWorkspaceRegistrationAvailable: true,
    workspaceRuntimeRemovalAvailable: true,
    // Advertise the same host-conditional and WS feature flags as the runtime
    // path (serve-features.ts) so the bootstrap `/capabilities` window doesn't
    // briefly under-report them.
    nativeDirectoryPickerAvailable,
    workspaceRuntimeAvailable,
    localPathOpenAvailable,
    localTerminalOpenAvailable,
    // The production wiring below always registers these, so the bootstrap
    // envelope must not under-report them either — the runtime envelope
    // serves all five once the app is up.
    dynamicWorkspaceRegistrationAvailable: true,
    scratchWorkspaceRegistrationAvailable: true,
    standaloneSessionsAvailable: true,
    workspaceTrustHotReloadAvailable: true,
    acpHttpEnabled: resolveAcpHttpEnabled(env as NodeJS.ProcessEnv),
    clientMcpOverWsEnabled: opts.clientMcpOverWs === true,
  });
}

function createBootstrapCapabilities(input: {
  opts: ServeOptions;
  boundWorkspace: string;
  o1codeVersion?: string;
  sessionShellCommandEnabled: boolean;
  sessionArtifactsPersistenceAvailable: boolean;
  workspaceRuntimeAvailable: boolean;
  currentSessionSchedulingAvailable: boolean;
  permissionPolicy: PermissionPolicy | undefined;
  env: Readonly<Record<string, string | undefined>>;
  nativeDirectoryPickerAvailable: boolean;
  localPathOpenAvailable: boolean;
  localTerminalOpenAvailable: boolean;
}): CapabilitiesEnvelope {
  return {
    v: CAPABILITIES_SCHEMA_VERSION,
    protocolVersions: getServeProtocolVersions(),
    ...(input.o1codeVersion ? { o1codeVersion: input.o1codeVersion } : {}),
    mode: input.opts.mode,
    features: currentServeFeaturesForRunO1CodeServe(
      input.opts,
      input.sessionShellCommandEnabled,
      input.sessionArtifactsPersistenceAvailable,
      input.workspaceRuntimeAvailable,
      input.currentSessionSchedulingAvailable,
      input.env,
      input.nativeDirectoryPickerAvailable,
      input.localPathOpenAvailable,
      input.localTerminalOpenAvailable,
    ),
    modelServices: [],
    workspaceCwd: input.boundWorkspace,
    transports: ['rest'],
    policy: { permission: input.permissionPolicy ?? 'first-responder' },
    limits: {
      maxRegisteredWorkspaces: input.opts.maxRegisteredWorkspaces,
      ...(input.opts.maxTotalSessions !== undefined
        ? {
            maxSessionsPerWorkspace: advertisedMaxSessions(
              input.opts.maxSessions,
            ),
            maxTotalSessions: positiveFiniteOrNull(input.opts.maxTotalSessions),
          }
        : {}),
      maxPendingPromptsPerSession: advertisedMaxPendingPromptsPerSession(
        input.opts.maxPendingPromptsPerSession,
      ),
      sessionRestoreTimeoutMs: resolveSessionRestoreTimeoutMs(input.opts),
    },
  };
}

function validateRateLimitOptions(opts: ServeOptions): void {
  if (opts.rateLimit !== true) return;
  for (const [name, value] of [
    ['rateLimitPrompt', opts.rateLimitPrompt],
    ['rateLimitMutation', opts.rateLimitMutation],
    ['rateLimitRead', opts.rateLimitRead],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0)
    ) {
      throw new TypeError(
        `Invalid ${name}: ${value}. Must be a positive integer.`,
      );
    }
  }
  if (
    opts.rateLimitWindowMs !== undefined &&
    (!Number.isFinite(opts.rateLimitWindowMs) ||
      !Number.isInteger(opts.rateLimitWindowMs) ||
      opts.rateLimitWindowMs < 1000)
  ) {
    throw new TypeError(
      `Invalid rateLimitWindowMs: ${opts.rateLimitWindowMs}. Must be an integer >= 1000.`,
    );
  }
}

export function createLazyBridgeProxy(
  getBridge: () => AcpSessionBridge | undefined,
  getStartupError: () => string | undefined = () => undefined,
): AcpSessionBridge {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        const bridge = getBridge();
        if (!bridge) {
          const startupError = getStartupError();
          if (startupError) {
            throw new Error(
              `Daemon bridge runtime is not available: ${startupError}`,
            );
          }
          throw new Error('Daemon bridge runtime is still starting.');
        }
        const value = Reflect.get(bridge, prop, bridge) as unknown;
        return typeof value === 'function' ? value.bind(bridge) : value;
      },
    },
  ) as AcpSessionBridge;
}

export function resolveRuntimeStartupTimeoutMs(
  override: number | undefined,
): number {
  if (override !== undefined) {
    return Number.isFinite(override) && override > 0 ? override : 0;
  }
  const raw = process.env[RUNTIME_STARTUP_TIMEOUT_ENV];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_RUNTIME_STARTUP_TIMEOUT_MS;
  }
  const trimmed = raw.trim();
  if (trimmed === '0') return 0;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RUNTIME_STARTUP_TIMEOUT_MS;
}

export async function waitForRuntimeStartingForShutdown(
  runtimeStarting: Promise<void> | undefined,
  daemonLog: Pick<DaemonLogger, 'warn'>,
  timeoutMs = SHUTDOWN_FORCE_CLOSE_MS,
): Promise<void> {
  if (!runtimeStarting) return;

  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    runtimeStarting,
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        daemonLog.warn(
          `${timeoutMs}ms runtime-startup wait reached during shutdown; continuing listener close`,
        );
        resolve();
      }, timeoutMs);
      timer.unref();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const BOOTSTRAP_HEALTH_PATH = '/health';
const BOOTSTRAP_CAPABILITIES_PATH = '/capabilities';
const BOOTSTRAP_DAEMON_STATUS_PATH = '/daemon/status';
const BOOTSTRAP_SERVE_PATHS = new Set([
  BOOTSTRAP_HEALTH_PATH,
  BOOTSTRAP_CAPABILITIES_PATH,
  BOOTSTRAP_DAEMON_STATUS_PATH,
]);

const RUNTIME_STARTUP_FAILED_ENVELOPE = {
  error: 'Daemon runtime failed to start',
  code: 'daemon_runtime_failed',
} as const;
const RUNTIME_STARTUP_STARTING_ENVELOPE = {
  error: 'Daemon runtime is still starting',
  code: 'daemon_runtime_starting',
} as const;

function runtimeStartupEnvelope(runtimeError: string | undefined) {
  return runtimeError
    ? RUNTIME_STARTUP_FAILED_ENVELOPE
    : RUNTIME_STARTUP_STARTING_ENVELOPE;
}

function createBootstrapServeApp(input: {
  opts: ServeOptions;
  getPort: () => number;
  boundWorkspace: string;
  startup: DaemonStartupSnapshot;
  daemonLog: DaemonLogger;
  o1codeVersion?: string;
  sessionShellCommandEnabled: boolean;
  sessionArtifactsPersistenceAvailable: boolean;
  workspaceRuntimeAvailable: boolean;
  currentSessionSchedulingAvailable: boolean;
  permissionPolicy: PermissionPolicy | undefined;
  multiWorkspaceCapabilitiesRequireRuntime: boolean;
  getRuntimeError: () => string | undefined;
  onHealthServed?: () => void;
}): Application {
  const {
    opts,
    getPort,
    boundWorkspace,
    startup,
    daemonLog,
    o1codeVersion,
    sessionShellCommandEnabled,
    sessionArtifactsPersistenceAvailable,
    workspaceRuntimeAvailable,
    currentSessionSchedulingAvailable,
    permissionPolicy,
    multiWorkspaceCapabilitiesRequireRuntime,
    getRuntimeError,
    onHealthServed,
  } = input;
  const app = express();
  // The probe stats `/dev/console` (macOS) or scans `PATH` for `zenity`
  // (Linux), and both bootstrap endpoints below rebuild their envelope per
  // request, so evaluate it once here — the runtime path likewise probes once,
  // at `createApp` time (server.ts).
  const nativeDirectoryPickerAvailable = isNativeDirectoryPickerAvailable();
  const localPathOpenAvailable = isLocalPathOpenAvailable();
  const localTerminalOpenAvailable = isLocalTerminalAvailable();

  installSelfOriginStripMiddleware(app, getPort, opts.hostname);
  // Same admission order as the runtime app (createServeApp): Host gate, then
  // the remote same-origin check, then the CORS wall — so a request gets the
  // same reject body in every boot phase.
  app.use(hostAllowlist(opts.hostname, getPort));
  installRemoteSelfOriginMiddleware(app, opts.hostname, opts.token);
  if (opts.allowOrigins && opts.allowOrigins.length > 0) {
    app.use(allowOriginCors(parseAllowOriginPatterns(opts.allowOrigins)));
  } else {
    app.use(denyBrowserOriginCors);
  }

  const healthHandler = (req: Request, res: Response): void => {
    const runtimeError = getRuntimeError();
    if (runtimeError !== undefined) {
      res.status(503).json({
        status: 'degraded',
        error: runtimeError,
      });
      return;
    }

    if (onHealthServed) {
      res.once('finish', onHealthServed);
    }
    if (isDeepHealthQuery(req.query['deep'])) {
      res.setHeader('Retry-After', '1');
      res.status(503).json({ status: 'degraded', reason: 'bootstrap' });
      return;
    }
    res.status(200).json({ status: 'ok' });
  };
  const loopback = isLoopbackBind(opts.hostname);
  const exposeHealthPreAuth = loopback && !opts.requireAuth;
  if (exposeHealthPreAuth) {
    app.get(BOOTSTRAP_HEALTH_PATH, healthHandler);
  }

  app.use(bearerAuth(opts.token));

  if (!exposeHealthPreAuth) {
    app.get(BOOTSTRAP_HEALTH_PATH, healthHandler);
  }

  app.get(BOOTSTRAP_CAPABILITIES_PATH, (_req: Request, res: Response): void => {
    if (multiWorkspaceCapabilitiesRequireRuntime) {
      const runtimeError = getRuntimeError();
      if (runtimeError === undefined) {
        res.setHeader('Retry-After', '1');
      }
      res.status(503).json(runtimeStartupEnvelope(runtimeError));
      return;
    }
    res.status(200).json(
      createBootstrapCapabilities({
        opts,
        boundWorkspace,
        o1codeVersion,
        sessionShellCommandEnabled,
        sessionArtifactsPersistenceAvailable,
        workspaceRuntimeAvailable,
        currentSessionSchedulingAvailable,
        permissionPolicy,
        env: process.env,
        nativeDirectoryPickerAvailable,
        localPathOpenAvailable,
        localTerminalOpenAvailable,
      }),
    );
  });

  app.get(BOOTSTRAP_DAEMON_STATUS_PATH, (req: Request, res: Response): void => {
    const detail = parseDaemonStatusDetail(req.query['detail']);
    if (!detail.ok || !detail.detail) {
      res.status(400).json({
        error: 'detail must be one of: summary, full',
        code: 'invalid_detail',
      });
      return;
    }
    const runtimeError = getRuntimeError();
    // Same gate the runtime applies (see runO1CodeServeImpl): pinned journal
    // flags or a budget with no usable pool disable growth, so the
    // bootstrap response matches what the runtime will wire.
    const bootstrapJournalGrowthPoolMb =
      opts.daemonMemoryBudget !== undefined
        ? serveJournalGrowthPoolMb({
            budget: opts.daemonMemoryBudget,
            maxJournalEvents: opts.maxJournalEvents,
            maxJournalBytes: opts.maxJournalBytes,
          })
        : 0;
    const runtimeFailed = runtimeError !== undefined;
    const issue: DaemonStatusIssue = runtimeError
      ? {
          code: 'daemon_runtime_failed',
          severity: 'error',
          message: runtimeError,
        }
      : {
          code: 'daemon_runtime_starting',
          severity: 'warning',
          message: 'Daemon runtime is still starting.',
        };
    const daemonLogStatus = daemonLog.getStatus();
    const issues: DaemonStatusIssue[] = [issue];
    if (daemonLogStatus.health === 'degraded') {
      issues.push({
        code: 'daemon_log_degraded',
        severity: 'warning',
        message:
          'Daemon file logging is degraded; inspect full status for details.',
      });
    }
    const response: DaemonStatusResponse = {
      v: 1,
      detail: detail.detail,
      generatedAt: new Date().toISOString(),
      status: runtimeFailed ? 'error' : 'warning',
      issues,
      daemon: {
        pid: process.pid,
        uptimeMs: Math.round(process.uptime() * 1000),
        mode: opts.mode,
        workspaceCwd: boundWorkspace,
        startup: {
          ...startup,
          preheat: { ...startup.preheat },
        },
        ...(o1codeVersion ? { o1codeVersion } : {}),
        ...(daemonLog.getDaemonId()
          ? { daemonId: daemonLog.getDaemonId() }
          : {}),
        runId: daemonLogStatus.runId,
        logMode: daemonLogStatus.mode,
        logHealth: daemonLogStatus.health,
        ...(detail.detail === 'full' && daemonLog.getLogPath()
          ? { logPath: daemonLog.getLogPath() }
          : {}),
        ...(detail.detail === 'full'
          ? {
              logIssues: daemonLogStatus.issues,
              logDroppedRecords: daemonLogStatus.droppedRecords,
              logDroppedBytes: daemonLogStatus.droppedBytes,
            }
          : {}),
      },
      security: {
        tokenConfigured: Boolean(opts.token),
        requireAuth: opts.requireAuth === true,
        loopbackBind: loopback,
        allowOriginConfigured:
          opts.allowOrigins !== undefined && opts.allowOrigins.length > 0,
        allowOriginMode: allowOriginMode(opts.allowOrigins),
        sessionShellCommandEnabled,
      },
      limits: {
        maxRegisteredWorkspaces: opts.maxRegisteredWorkspaces!,
        maxSessions: advertisedMaxSessions(opts.maxSessions),
        maxTotalSessions: positiveFiniteOrNull(opts.maxTotalSessions),
        maxPendingPromptsPerSession: advertisedMaxPendingPromptsPerSession(
          opts.maxPendingPromptsPerSession,
        ),
        listenerMaxConnections: listenerMaxConnections(opts.maxConnections),
        eventRingSize: opts.eventRingSize ?? DEFAULT_RING_SIZE,
        compactedReplayMaxBytes:
          opts.compactedReplayMaxBytes ?? DEFAULT_COMPACTED_REPLAY_MAX_BYTES,
        maxJournalEvents: opts.maxJournalEvents ?? DEFAULT_MAX_JOURNAL_EVENTS,
        maxJournalBytes: opts.maxJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES,
        promptDeadlineMs: positiveFiniteOrNull(opts.promptDeadlineMs),
        writerIdleTimeoutMs: positiveFiniteOrNull(opts.writerIdleTimeoutMs),
        channelIdleTimeoutMs: channelIdleTimeoutMs(opts.channelIdleTimeoutMs),
        sessionIdleTimeoutMs: sessionIdleTimeoutMs(opts.sessionIdleTimeoutMs),
        sessionPromptSettledCloseGraceMs: sessionPromptSettledCloseGraceMs(
          opts.sessionPromptSettledCloseGraceMs,
        ),
        acpConnectionCap: null,
        acpPreAttachMaxFramesPerStream: null,
        acpPreAttachMaxFramesPerConnection: null,
        acpPreAttachMaxFramesGlobal: null,
        acpPreAttachMaxPayloadBytesPerConnection: null,
        acpPreAttachMaxPayloadBytesGlobal: null,
        // No child-heap policy during bootstrap: it is built with the
        // runtime, so `enforced` is correctly false and `childHeap` null in
        // this window even when the flag says `enforce`.
        memory: toDaemonStatusMemoryLimits(
          opts.daemonMemoryBudget,
          undefined,
          bootstrapJournalGrowthPoolMb > 0
            ? {
                poolBytes: bootstrapJournalGrowthPoolMb * 1024 * 1024,
                hardCapBytes: JOURNAL_GROWTH_HARD_CAP_BYTES,
                baselineMaxEvents:
                  opts.maxJournalEvents ?? DEFAULT_MAX_JOURNAL_EVENTS,
                baselineMaxBytes:
                  opts.maxJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES,
              }
            : null,
        ),
      },
      capabilities: {
        protocolVersions: getServeProtocolVersions(),
        features: currentServeFeaturesForRunO1CodeServe(
          opts,
          sessionShellCommandEnabled,
          sessionArtifactsPersistenceAvailable,
          workspaceRuntimeAvailable,
          currentSessionSchedulingAvailable,
          process.env,
          nativeDirectoryPickerAvailable,
          localPathOpenAvailable,
          localTerminalOpenAvailable,
        ),
      },
      runtime: {
        loading: runtimeError === undefined,
        ...(runtimeError ? { error: runtimeError } : {}),
        sessions: { active: 0 },
        permissions: {
          pending: 0,
          policy: permissionPolicy ?? 'first-responder',
        },
        channel: { live: false },
        transport: {
          restSseActive: 0,
          acp: {
            enabled: false,
            connections: 0,
            connectionStreams: 0,
            sessionStreams: 0,
            sseStreams: 0,
            wsStreams: 0,
            pendingClientRequests: 0,
            preAttach: {
              bufferedConnectionFrames: 0,
              bufferedSessionFrames: 0,
              pendingDeliveryFrames: 0,
              usedFrames: 0,
              usedBytes: 0,
              highWaterFrames: 0,
              highWaterBytes: 0,
              guardFailures: 0,
            },
          },
        },
        rateLimit: {
          enabled: opts.rateLimit === true,
          rejectedSinceStart: {
            prompt: 0,
            mutation: 0,
            read: 0,
          },
        },
        activity: {
          activePrompts: 0,
          pendingPrompts: 0,
          queuedPrompts: 0,
          lastActivityAt: null,
          idleSinceMs: null,
        },
        process: process.memoryUsage(),
      },
      ...(detail.detail === 'full'
        ? {
            full: {
              sessions: [],
              acpMounts: [],
              acpConnections: [],
              workspace: {},
            },
          }
        : {}),
    };

    res.status(200).json(response);
  });

  app.use((_req: Request, res: Response): void => {
    res.status(503).json(runtimeStartupEnvelope(getRuntimeError()));
  });

  return app;
}

function createDelegatingServeApp(
  bootstrapApp: Application,
  getRuntimeApp: () => Application | undefined,
  options: {
    waitForDeferredRuntimeRoutes?: boolean;
    startRuntime?: () => boolean;
    runtimeReady?: Promise<void>;
    authenticateDeferredRuntimeRequest?: RequestHandler;
    isPreAuthRequest?: (req: Request) => boolean | Promise<boolean>;
  } = {},
): Application {
  const app = express();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const dispatch = async (): Promise<void> => {
      let target = getRuntimeApp();
      if (
        !target &&
        options.waitForDeferredRuntimeRoutes === true &&
        !isBootstrapServeRoute(req) &&
        !isCorsPreflightRequest(req) &&
        options.startRuntime &&
        options.runtimeReady
      ) {
        const waitStartedAt = performance.now();
        const timing: DeferredRuntimeRequestTiming = {
          startedAt: new Date(),
          path: 'joined',
        };
        const authGate = options.authenticateDeferredRuntimeRequest;
        // A rejecting predicate must not 500 every deferred request —
        // fail closed to the bearer gate instead.
        const preAuthExempted =
          authGate !== undefined &&
          (await Promise.resolve(options.isPreAuthRequest?.(req)).catch(
            () => false,
          )) === true;
        if (authGate && !preAuthExempted) {
          if (!runSynchronousRequestGate(authGate, req, res, next)) {
            return;
          }
        }
        setDeferredRuntimeRequestTiming(req, timing);
        if (options.startRuntime()) {
          timing.path = 'started_on_request';
        }
        try {
          await options.runtimeReady;
        } catch {
          if (preAuthExempted) {
            // The bootstrap app serves the failure envelope only behind its
            // bearer gate, which a pre-auth navigation cannot pass — answer
            // here so the browser sees the startup failure, not a 401.
            res.status(503).json(RUNTIME_STARTUP_FAILED_ENVELOPE);
            return;
          }
          // Fall through to the bootstrap app so it can report the startup error.
        } finally {
          timing.waitMs =
            Math.round((performance.now() - waitStartedAt) * 100) / 100;
        }
        target = getRuntimeApp();
      }
      const handler = (target ?? bootstrapApp) as unknown as (
        req: Request,
        res: Response,
        next: NextFunction,
      ) => void;
      handler(req, res, next);
    };
    void dispatch().catch(next);
  });
  return app;
}

function isBootstrapServeRoute(req: Request): boolean {
  const path =
    req.path.length > 1 && req.path.endsWith('/')
      ? req.path.slice(0, -1)
      : req.path;
  return BOOTSTRAP_SERVE_PATHS.has(path);
}

function isCorsPreflightRequest(req: Request): boolean {
  return (
    req.method === 'OPTIONS' &&
    Boolean(req.headers.origin) &&
    Boolean(
      req.headers['access-control-request-method'] ||
        req.headers['access-control-request-headers'],
    )
  );
}

function runSynchronousRequestGate(
  handler: RequestHandler,
  req: Request,
  res: Response,
  next: NextFunction,
): boolean {
  let passed = false;
  handler(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    passed = true;
  });
  return passed;
}

/**
 * Validate options + start the listener. Resolves once the server is ready
 * to accept connections.
 *
 * Token resolution order:
 *   1. explicit `opts.token`
 *   2. `O1CODE_SERVER_TOKEN` env var
 *   3. a generated ephemeral bearer when neither source is present and the
 *      bind is non-loopback (printed once at startup; loopback binds never
 *      generate and keep the trusted tokenless mode)
 *
 * Boot refuses to start when a supplied token source is explicitly empty;
 * that is a hard rule, not a warning, per the threat model in the design
 * issue. A non-loopback bind with no source at all generates instead of
 * refusing.
 */
interface DaemonLoggerLifecycleCallbacks {
  initialized(logger: DaemonLogger): void;
  published(): void;
  signalOwned(): void;
  // Called once the startup scrub has mutated the host process.env, with
  // the restore close() would run. runO1CodeServe's catch invokes it when
  // startup fails after the scrub — the close() path is unreachable then,
  // and an embedded caller must not keep a permanently scrubbed env.
  scrubApplied(restoreScrubbedLoaderEnv: () => void): void;
  // Called with the loader-key rejection reporter this run installed, so the
  // startup-failure catch can clear it only when it is still the active one —
  // a co-resident daemon that installed after us must keep its own reporter.
  reporterInstalled(reporter: LoaderKeyRejectionReporter): void;
}

/**
 * Validates and canonicalizes a `--workspace` boot argument. Extracted to
 * module scope (from the runO1CodeServe closure) so the container-sandbox path
 * translation ahead of the absolute-path guard is testable — this is the
 * primary reproduction path of that issue.
 */
export function validateAndCanonicalizeWorkspaceInput(
  rawWorkspace: string,
): string {
  // Inside a Linux container sandbox a Windows host forwards
  // `--workspace C:\…` in host shape; translate to the bind-mount
  // location BEFORE the absolute-path guard, which would otherwise
  // reject it (`path.isAbsolute('C:\…')` is false on POSIX).
  const workspace = translateAndCheckAbsoluteWorkspacePath(rawWorkspace);
  if (workspace === null) {
    throw new Error(
      `Invalid --workspace "${rawWorkspace}": must be an absolute path.`,
    );
  }
  try {
    const stats = fs.statSync(workspace);
    if (!stats.isDirectory()) {
      throw new Error(
        `Invalid --workspace "${workspace}": exists but is not a directory.`,
      );
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: unknown }).code;
      if (code === 'ENOENT') {
        throw new Error(
          `Invalid --workspace "${workspace}": directory does not exist.`,
        );
      }
      // EACCES / EPERM: the path exists but the current user can't
      // stat it (typical for SIP-protected paths on macOS, root-owned
      // dirs the daemon's user can't traverse, etc.). The raw Node
      // SystemError has the path AND the syscall but no operator-
      // facing breadcrumb that this came from `--workspace`. Wrap
      // both codes so the boot failure points at the flag the
      // operator actually set.
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error(
          `Invalid --workspace "${workspace}": permission denied ` +
            `(${String(code)}). The path exists but cannot be stat'd ` +
            `by the current user.`,
        );
      }
    }
    throw err;
  }
  return canonicalizeWorkspace(workspace);
}

export async function runO1CodeServe(
  optsIn: RunO1CodeServeOptions,
  deps: RunO1CodeServeDeps = {},
): Promise<RunHandle> {
  let daemonLog: DaemonLogger | undefined;
  let owner: 'startup' | 'handle' | 'signal' = 'startup';
  let restoreScrubbedLoaderEnv: (() => void) | undefined;
  let installedLoaderRejectionReporter: LoaderKeyRejectionReporter | undefined;
  try {
    return await runO1CodeServeImpl(optsIn, deps, {
      initialized: (logger) => {
        daemonLog = logger;
      },
      published: () => {
        if (owner === 'startup') owner = 'handle';
      },
      signalOwned: () => {
        if (owner === 'startup') owner = 'signal';
      },
      scrubApplied: (restore) => {
        restoreScrubbedLoaderEnv = restore;
      },
      reporterInstalled: (reporter) => {
        installedLoaderRejectionReporter = reporter;
      },
    });
  } catch (error) {
    // Startup failed after the scrub and (when the logger was up) the
    // reporter install; the close() path that reverts both is unreachable.
    // Clear only our own reporter so a co-resident daemon keeps its own.
    if (installedLoaderRejectionReporter) {
      clearLoaderKeyRejectionReporterIfCurrent(
        installedLoaderRejectionReporter,
      );
    }
    if (daemonLog && owner === 'startup') {
      const startupLog = daemonLog;
      writeDaemonLifecycleBestEffort(() =>
        startupLog.error(
          'daemon startup failed',
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
      await startupLog.close();
    }
    restoreScrubbedLoaderEnv?.();
    throw error;
  }
}

let brokenPipeGuardInstalled = false;

/**
 * stdout/stderr may be pipes whose reader leaves (`o1-code serve | head -n 1`,
 * a log shipper closing its end). Node reports EPIPE as an asynchronous
 * 'error' event that no try/catch around write() can see; without a listener
 * it becomes an uncaught exception and kills the already-listening daemon
 * together with its sessions. The daemon's job is
 * serving; a vanished log reader is not a reason to stop it. Non-EPIPE
 * stream errors are re-thrown so real faults still surface.
 */
function installServeBrokenPipeGuard(): void {
  if (brokenPipeGuardInstalled) return;
  brokenPipeGuardInstalled = true;
  const ignoreEpipe = (err: NodeJS.ErrnoException): void => {
    if (err.code !== 'EPIPE') throw err;
  };
  process.stdout.on('error', ignoreEpipe);
  process.stderr.on('error', ignoreEpipe);
}

async function runO1CodeServeImpl(
  optsIn: RunO1CodeServeOptions,
  deps: RunO1CodeServeDeps,
  loggerLifecycle: DaemonLoggerLifecycleCallbacks,
): Promise<RunHandle> {
  installServeBrokenPipeGuard();
  const runStartedAt = performance.now();
  // Embedded callers pass the credential through `optsIn`. Remove any ambient
  // copy before freezing runtime environments or starting auxiliary workers.
  delete process.env[EXTERNAL_TOOL_GUARD_TOKEN_ENV];
  let shouldPreheat = !deps.bridge && shouldPreheatBridge(deps);
  const startup: DaemonStartupSnapshot = {
    processStartedAt: new Date(
      Date.now() - Math.round(process.uptime() * 1000),
    ).toISOString(),
    preheat: {
      status: deps.bridge
        ? 'external_bridge'
        : shouldPreheat
          ? 'scheduled'
          : 'not_scheduled',
    },
  };
  // Validate before freezing the value into the immutable daemon base env so a
  // bad scope can never be baked into a runtime, even transiently.
  if (
    optsIn.memoryProjectScope !== undefined &&
    !(MEMORY_PROJECT_SCOPES as readonly string[]).includes(
      optsIn.memoryProjectScope,
    )
  ) {
    throw new TypeError(
      `Invalid memoryProjectScope: ${String(optsIn.memoryProjectScope)}. ` +
        'Must be "git-root" or "workspace".',
    );
  }
  preResolveServeFastPathHomeEnvOverrides();
  assertExecutionSandboxSupported(
    readOperatorSandboxSettings(),
    'serve / ACP / web terminals',
  );
  assertExecutionSandboxSupported(
    deps.bootSettings ?? {},
    'serve / ACP / web terminals',
  );
  const baseEnv: NodeJS.ProcessEnv = { ...process.env };
  const launchMemoryProjectScopeValue = baseEnv['O1CODE_MEMORY_PROJECT_SCOPE'];
  const launchMemoryProjectScope = launchMemoryProjectScopeValue?.trim()
    ? launchMemoryProjectScopeValue
    : undefined;
  const memoryProjectScopeValue =
    optsIn.memoryProjectScope ?? launchMemoryProjectScope ?? 'workspace';
  const memoryProjectScopeSource =
    optsIn.memoryProjectScope !== undefined
      ? 'option'
      : launchMemoryProjectScope !== undefined
        ? 'environment'
        : 'default';
  const resolvedMemoryProjectScope =
    memoryProjectScopeValue.trim().toLowerCase() === 'workspace'
      ? 'workspace'
      : 'git-root';
  baseEnv['O1CODE_MEMORY_PROJECT_SCOPE'] = memoryProjectScopeValue;
  // The dev harness (scripts/dev.js) stamps DEV=true into the same env that
  // carries the tsx loader's NODE_OPTIONS, so only then does the base env
  // keep loader vars — dev-mode ACP children need the
  // loader to boot their .ts entries. DEV is hardcoded-excluded from
  // project .env/settings.env (shared-env-keys.ts), so this consults the
  // launch environment only. Every other launch scrubs them here, before
  // the freeze: the base env is what session-hosting children (the ACP
  // child) spawn with, and a loader var that
  // reaches them runs during Node bootstrap — before the child's own
  // post-boot scrub could ever remove it.
  if (process.env['DEV'] !== 'true') {
    scrubInheritedLoaderEnv(baseEnv);
  }
  const daemonRuntimeBaseEnv: Readonly<NodeJS.ProcessEnv> =
    Object.freeze(baseEnv);
  // The daemon process itself is done with loader vars either way:
  // session-shell subprocesses run here with process.env while their cwd is
  // another workspace. The scrub is reference-counted (see
  // acquireInheritedLoaderEnvScrub) so overlapping embedded daemons in one
  // process do not restore each other's loader vars mid-flight, and reverted
  // on close() so an embedded caller reusing the host process gets its launch
  // environment back.
  const loaderEnvScrub = acquireInheritedLoaderEnvScrub(
    process.env,
    'o1-code serve',
    'daemon',
  );
  const scrubbedLoaderEnvKeys = loaderEnvScrub.removedKeys;
  const restoreScrubbedLoaderEnv = (): void => {
    loaderEnvScrub.release();
  };
  loggerLifecycle.scrubApplied(restoreScrubbedLoaderEnv);

  // An empty --hostname (an unset variable in an alias or compose file) makes
  // Node bind every interface; treat it as operator error rather than an
  // intentional wildcard, so a config mistake can never silently produce a
  // remote-listening daemon.
  if (!optsIn.hostname.trim()) {
    throw new Error(
      'Invalid --hostname: empty value binds every interface. Pass an ' +
        'explicit address (e.g. --hostname 0.0.0.0) or omit the flag.',
    );
  }

  const bindHostname =
    optsIn.hostname.toLowerCase() === 'localhost'
      ? (await (deps.bindHostnameLookup ?? lookup)(optsIn.hostname)).address
      : optsIn.hostname;
  // Generation keys on the operator's spelling (with the literal `localhost`
  // resolved once). The fail-closed backstop for a spelling that resolves
  // off-loopback is the resolved-address refusal further below — it must not
  // be folded into this operand, which by construction never sees it.
  const { token, generated: generatedToken } = resolveRemoteServeToken(
    optsIn.token,
    isLoopbackBind(optsIn.hostname),
  );
  const trustedLoopbackMode = isTrustedLoopbackMode({
    loopbackBind: isLoopbackAddress(bindHostname),
    tokenConfigured: token !== undefined,
    requireAuth: optsIn.requireAuth === true,
  });
  const sessionShellCommandEnabled =
    optsIn.enableSessionShell === true &&
    (token !== undefined || trustedLoopbackMode);
  if (
    optsIn.enableSessionShell === true &&
    token === undefined &&
    !trustedLoopbackMode
  ) {
    writeStderrLine(
      `o1-code serve: --enable-session-shell ignored because no bearer token ` +
        `is configured. Set ${O1CODE_SERVER_TOKEN_ENV} or pass --token to ` +
        `enable direct session shell.`,
    );
  }
  // Env-var fallback for the deadline options. Explicit option
  // beats the env beats unset (= unlimited). `parseDeadlineEnv` throws
  // on malformed values so an `export O1CODE_SERVE_PROMPT_DEADLINE_MS=abc`
  // typo fails boot loudly instead of silently disabling the cap.
  const promptDeadlineMs =
    optsIn.promptDeadlineMs ??
    parseDeadlineEnv(
      O1CODE_SERVE_PROMPT_DEADLINE_MS_ENV,
      process.env[O1CODE_SERVE_PROMPT_DEADLINE_MS_ENV],
    );
  const writerIdleTimeoutMs =
    optsIn.writerIdleTimeoutMs ??
    parseDeadlineEnv(
      O1CODE_SERVE_WRITER_IDLE_TIMEOUT_MS_ENV,
      process.env[O1CODE_SERVE_WRITER_IDLE_TIMEOUT_MS_ENV],
    );
  const clientMcpOverWsEnv = process.env[O1CODE_SERVE_CLIENT_MCP_OVER_WS_ENV];
  const rawWorkspaces = resolveWorkspaceInputs(optsIn.workspace);
  const rawWorkspace = rawWorkspaces[0]!;
  // daemonMemoryBudget is assigned after construction, once the budget is
  // resolved below.
  const opts: ServeOptions = {
    ...optsIn,
    hostname: bindHostname,
    maxRegisteredWorkspaces: resolveMaxRegisteredWorkspaces(
      optsIn.maxRegisteredWorkspaces,
      daemonRuntimeBaseEnv,
    ),
    token,
    promptDeadlineMs,
    writerIdleTimeoutMs,
    workspace: rawWorkspace,
    clientMcpOverWs:
      optsIn.clientMcpOverWs ??
      (!envFlagDisabled(clientMcpOverWsEnv) &&
        clientMcpOverWsEnv !== undefined),
  };
  validateRateLimitOptions(opts);

  // Catch the `--hostname localhost:4170` / `127.0.0.1:4170`
  // typo BEFORE the loopback / token check so the operator sees a
  // useful "did you mean --port?" message instead of "Refusing to
  // bind localhost:4170:0 without a bearer token". Unbracketed input
  // with exactly one `:` is the unambiguous host:port shape — raw
  // IPv6 literals always have two-or-more `:` (the shortest is `::`),
  // and bracketed IPv6 is handled by its own form check below.
  if (!opts.hostname.startsWith('[') && opts.hostname.split(':').length === 2) {
    const [host, port] = opts.hostname.split(':');
    throw new Error(
      `Invalid --hostname "${opts.hostname}": looks like a "host:port" ` +
        `combination. Use --port for the port, e.g. ` +
        `"--hostname ${host} --port ${port}".`,
    );
  }

  // TLS is both-or-nothing: a cert without a key (or vice versa) can't
  // start an HTTPS listener, so fail loud at boot instead of silently
  // falling back to plain HTTP — the operator asked for TLS and a silent
  // downgrade would serve the web shell over an insecure transport they
  // believe is encrypted.
  let tlsOptions: { cert: Buffer; key: Buffer } | undefined;
  if ((opts.tlsCert && !opts.tlsKey) || (!opts.tlsCert && opts.tlsKey)) {
    throw new Error(
      `--tls-cert and --tls-key must be provided together (got only ` +
        `--tls-${opts.tlsCert ? 'cert' : 'key'}).`,
    );
  }
  if (opts.tlsCert && opts.tlsKey) {
    let cert: Buffer;
    let key: Buffer;
    try {
      cert = fs.readFileSync(opts.tlsCert);
    } catch (err) {
      throw new Error(
        `Failed to read --tls-cert "${opts.tlsCert}": ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      key = fs.readFileSync(opts.tlsKey);
    } catch (err) {
      throw new Error(
        `Failed to read --tls-key "${opts.tlsKey}": ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Fail loud at boot on an expired (or unparseable) certificate. Node's
    // https.createServer happily starts with an expired cert, then every TLS
    // handshake is rejected client-side (NET::ERR_CERT_DATE_INVALID) while
    // /health stays green — a silent outage that's hard to diagnose. Surface
    // it here with an actionable message instead.
    let x509: X509Certificate;
    try {
      x509 = new X509Certificate(cert);
    } catch (err) {
      throw new Error(
        `--tls-cert "${opts.tlsCert}" is not a valid certificate: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const now = Date.now();
    if (new Date(x509.validTo).getTime() < now) {
      throw new Error(
        `--tls-cert "${opts.tlsCert}" expired on ${x509.validTo}. ` +
          `Renew the certificate and restart.`,
      );
    }
    // Symmetric to the expiry guard: a cert whose validity window hasn't
    // started yet (notBefore > now, e.g. clock skew or a freshly minted
    // cert) also boots cleanly but fails every handshake client-side with
    // NET::ERR_CERT_DATE_INVALID. Fail loud here too.
    if (new Date(x509.validFrom).getTime() > now) {
      throw new Error(
        `--tls-cert "${opts.tlsCert}" is not yet valid (validFrom: ` +
          `${x509.validFrom}). Check the certificate's notBefore date or ` +
          `the system clock.`,
      );
    }
    tlsOptions = { cert, key };
  }

  if (!isLoopbackBind(opts.hostname) && !token) {
    throw new Error(
      `Refusing to bind ${opts.hostname}:${opts.port} without a bearer ` +
        `token (an explicitly empty --token or ${O1CODE_SERVER_TOKEN_ENV} ` +
        `counts as none, since a blank source never generates one). Set ` +
        `${O1CODE_SERVER_TOKEN_ENV} or pass --token, or rebind to loopback ` +
        `(127.0.0.0/8, localhost, ::1, or [::1]).`,
    );
  }
  // `--require-auth` extends the "must have a token" rule to loopback
  // as well. Boot-loud, like the non-loopback check
  // above: silently dropping the flag when no token is configured
  // would leave the operator believing the deployment is hardened
  // when it isn't. Mention both the env var and the flag so log
  // readers don't have to read the source to learn the fix.
  if (opts.requireAuth && !token) {
    throw new Error(
      `Refusing to start with --require-auth set but no bearer token ` +
        `configured. Set ${O1CODE_SERVER_TOKEN_ENV} or pass --token, or omit ` +
        `--require-auth to keep the loopback developer default.`,
    );
  }

  // Validate `--allow-origin` patterns at boot so
  // operators discover typos before the daemon advertises
  // `allow_origin` to clients. Each entry must be either `*` or a value
  // that round-trips through `new URL(...).origin` — see
  // `parseAllowOriginPatterns` JSDoc for the strict-by-intent rationale.
  // The parsed `ParsedAllowOriginPatterns` is then re-derived in
  // `createServeApp` to avoid threading an extra option shape through;
  // re-parsing is O(n) over operator-listed patterns and only happens
  // once at boot.
  if (opts.allowOrigins && opts.allowOrigins.length > 0) {
    // `InvalidAllowOriginPatternError` already names the bad pattern
    // and the canonical form; surface it verbatim.
    const parsed = parseAllowOriginPatterns(opts.allowOrigins);
    // A token (any source: --token, env, --require-auth) makes the bearer the
    // security boundary for wildcard and remotely hosted browser origins.
    if (parsed.allowAny && !token) {
      throw new Error(
        `Refusing to start with --allow-origin '*' but no bearer token ` +
          `configured. '*' admits any cross-origin browser to the API; ` +
          `without a token, any local page can drive the daemon. Set ` +
          `${O1CODE_SERVER_TOKEN_ENV} or pass --token, or list specific ` +
          `origins instead of '*'.`,
      );
    }
    const nonLoopbackHttpOrigin = findNonLoopbackHttpOrigin(parsed);
    if (nonLoopbackHttpOrigin && !token) {
      throw new Error(
        `Refusing to start with --allow-origin ${JSON.stringify(
          nonLoopbackHttpOrigin,
        )} but no bearer token configured. Non-loopback HTTP(S) browser ` +
          `origins can drive the full operator API, including code execution ` +
          `as the daemon user. Set ${O1CODE_SERVER_TOKEN_ENV} or pass --token, ` +
          `or use a loopback origin.`,
      );
    }
    writeStderrLine(
      `o1-code serve: --allow-origin: ${opts.allowOrigins.join(', ')}` +
        (parsed.allowAny
          ? ' (WARNING: `*` admits any cross-origin browser — bearer ' +
            'token gates API routes; the Web Shell static assets stay ' +
            'pre-auth in every mode unless --no-web, and /health stays ' +
            'pre-auth on loopback unless --require-auth is set)'
          : trustedLoopbackMode
            ? ' (WARNING: these browser origins receive full API authority ' +
              'without a bearer token in trusted loopback mode and can ' +
              'execute code as the daemon user)'
            : ''),
    );
  }
  if (opts.allowPrivateAuthBaseUrl) {
    writeStderrLine(
      'o1-code serve: --allow-private-auth-base-url enabled; ' +
        '/workspace/auth/provider may install localhost/private-network ' +
        'model endpoints. Use only for local development with trusted clients.',
    );
  }

  const validateAndCanonicalizeWorkspace =
    validateAndCanonicalizeWorkspaceInput;

  // Resolve the bound workspace list. The first explicit workspace remains the
  // primary workspace for legacy APIs; later workspaces are isolated secondary
  // runtimes.
  const liveConversationWorkspace =
    deps.liveConversationWorkspace ?? new ConversationWorkspace();
  const isReservedConversationWorkspace = (candidate: string): boolean => {
    const resolvedCandidate = path.resolve(candidate);
    const resolvedRoot = path.resolve(liveConversationWorkspace.rootPath);
    let canonicalRoot = resolvedRoot;
    try {
      canonicalRoot = fs.realpathSync.native(resolvedRoot);
    } catch {
      // The reserved root is intentionally not materialized during startup.
    }
    return (
      resolvedCandidate === resolvedRoot ||
      isWithinRoot(resolvedCandidate, resolvedRoot) ||
      resolvedCandidate === canonicalRoot ||
      isWithinRoot(resolvedCandidate, canonicalRoot)
    );
  };
  const reservedRawWorkspace = rawWorkspaces.find((workspace) =>
    isReservedConversationWorkspace(workspace),
  );
  if (reservedRawWorkspace) {
    throw new Error(
      `Workspace ${JSON.stringify(
        reservedRawWorkspace,
      )} is reserved for Conversations.`,
    );
  }
  const workspaceInputs = rawWorkspaces.map((workspace) => ({
    raw: workspace,
    cwd: validateAndCanonicalizeWorkspace(workspace),
    displayName: undefined as string | undefined,
    removable: false,
    registrationIds: [] as string[],
  }));
  const boundWorkspace = workspaceInputs[0]!.cwd;

  // Keep duplicate/nested rejection after realpath canonicalization so symlink
  // aliases cannot create two runtimes for one physical workspace.
  const seenCanonicalWorkspaces = new Set<string>();
  for (const workspace of workspaceInputs) {
    if (seenCanonicalWorkspaces.has(workspace.cwd)) {
      throw new Error(
        `Duplicate --workspace value resolves to ${JSON.stringify(
          workspace.cwd,
        )}.`,
      );
    }
    seenCanonicalWorkspaces.add(workspace.cwd);
  }
  for (let i = 0; i < workspaceInputs.length; i++) {
    for (let j = i + 1; j < workspaceInputs.length; j++) {
      const first = workspaceInputs[i]!.cwd;
      const second = workspaceInputs[j]!.cwd;
      const firstRel = path.relative(first, second);
      const secondRel = path.relative(second, first);
      if (
        firstRel &&
        !firstRel.startsWith('..') &&
        !path.isAbsolute(firstRel)
      ) {
        throw new Error(
          `Nested --workspace values are not supported: ` +
            `${JSON.stringify(second)} is inside ${JSON.stringify(first)}.`,
        );
      }
      if (
        secondRel &&
        !secondRel.startsWith('..') &&
        !path.isAbsolute(secondRel)
      ) {
        throw new Error(
          `Nested --workspace values are not supported: ` +
            `${JSON.stringify(first)} is inside ${JSON.stringify(second)}.`,
        );
      }
    }
  }
  if (workspaceInputs.length > opts.maxRegisteredWorkspaces!) {
    throw new Error(
      `At most ${opts.maxRegisteredWorkspaces} --workspace values may be registered.`,
    );
  }
  // Resolve one budget for journal growth and the fixed child partition.
  opts.daemonMemoryBudget = resolveDaemonMemoryBudget({
    budgetMb: opts.memoryBudgetMb,
  });
  if (
    (opts.childHeapMode === 'admit' || opts.childHeapMode === 'enforce') &&
    deps.bridge
  ) {
    throw new TypeError(
      'ACP admission cannot be combined with an injected bridge.',
    );
  }
  const admissionPolicy =
    opts.childHeapMode === 'admit' || opts.childHeapMode === 'enforce'
      ? createChildHeapPolicy({
          budget: opts.daemonMemoryBudget,
          mode: opts.childHeapMode,
        })
      : undefined;
  if (
    opts.daemonMemoryBudget.budgetSource === 'flag' ||
    opts.daemonMemoryBudget.insufficientMemory
  ) {
    writeStderrLine(formatMemoryBudgetStderr(opts.daemonMemoryBudget));
  }
  // Adaptive live-journal growth: sessions whose in-flight turn outgrows
  // the journal caps can grow into a daemon-wide pool (derived once from
  // the memory budget and shared by every bridge), instead of silently
  // truncating the live replay window (the canonical case: one turn fanning
  // out many concurrent subagents). An operator-pinned journal flag
  // disables growth — explicit config wins — as does a budget with no
  // usable pool (insufficient host, no headroom after the root reserve).
  const journalGrowthPoolMbValue =
    opts.daemonMemoryBudget !== undefined
      ? serveJournalGrowthPoolMb({
          budget: opts.daemonMemoryBudget,
          maxJournalEvents: opts.maxJournalEvents,
          maxJournalBytes: opts.maxJournalBytes,
        })
      : 0;
  const journalGrowthPoolBytes =
    journalGrowthPoolMbValue > 0
      ? journalGrowthPoolMbValue * 1024 * 1024
      : undefined;
  // ONE aggregate pool for the whole daemon: every bridge registers its
  // live-session cap enumerator here and receives the aggregator, so each
  // bridge's growth advisor accounts every sharing session — across all
  // workspaces — against the same pool instead of holding its own copy.
  const journalGrowthSessionLimitProviders = new Set<
    () => readonly JournalGrowthSessionLimit[]
  >();
  const journalGrowthSessionLimits =
    (): readonly JournalGrowthSessionLimit[] => {
      const limits: JournalGrowthSessionLimit[] = [];
      for (const provider of journalGrowthSessionLimitProviders) {
        limits.push(...provider());
      }
      return limits;
    };
  const registerJournalGrowthSessionLimits = (
    provider: () => readonly JournalGrowthSessionLimit[],
  ): (() => void) => {
    journalGrowthSessionLimitProviders.add(provider);
    return () => {
      journalGrowthSessionLimitProviders.delete(provider);
    };
  };
  const reservedStartupWorkspace = workspaceInputs.find((workspace) =>
    isReservedConversationWorkspace(workspace.cwd),
  );
  if (reservedStartupWorkspace) {
    throw new Error(
      `Workspace ${JSON.stringify(
        reservedStartupWorkspace.raw,
      )} is reserved for Conversations.`,
    );
  }
  let workspaceRegistrationStore = deps.workspaceRegistrationStore;
  // Snapshot before the restore loop below pushes persisted records into
  // `workspaceInputs`, so the overflow diagnostic can tell the operator which
  // component they can actually shrink.
  const explicitWorkspaceCount = workspaceInputs.length;
  if (
    workspaceRegistrationStore === undefined &&
    process.env['O1CODE_SERVE_NO_PERSISTENT_REGISTRATION'] !== '1'
  ) {
    const { WorkspaceRegistrationStore } = await import(
      './workspace-registration-store.js'
    );
    workspaceRegistrationStore = new WorkspaceRegistrationStore(boundWorkspace);
  }
  if (workspaceRegistrationStore) {
    try {
      const stored = await workspaceRegistrationStore.read();
      for (const storedWorkspace of stored.workspaces) {
        const registrationId = workspaceRegistrationId(storedWorkspace);
        const displayName = stored.displayNames?.[registrationId];
        if (isReservedConversationWorkspace(storedWorkspace)) {
          writeStderrLine(
            `o1-code serve: skipping persisted workspace registration ${JSON.stringify(
              storedWorkspace,
            )}: path is reserved for Conversations`,
          );
          continue;
        }
        let cwd: string;
        try {
          cwd = validateAndCanonicalizeWorkspace(storedWorkspace);
          readSshWorkspace(cwd);
        } catch (err) {
          writeStderrLine(
            `o1-code serve: skipping persisted workspace registration ${JSON.stringify(
              storedWorkspace,
            )}: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }
        if (isReservedConversationWorkspace(cwd)) {
          writeStderrLine(
            `o1-code serve: skipping persisted workspace registration ${JSON.stringify(
              storedWorkspace,
            )}: path is reserved for Conversations`,
          );
          continue;
        }
        const existingInput = workspaceInputs.find(
          (workspace) => workspace.cwd === cwd,
        );
        if (existingInput) {
          existingInput.registrationIds.push(registrationId);
          existingInput.displayName ??= displayName;
          continue;
        }
        const nested = workspaceInputs.some(
          (workspace) =>
            isWithinRoot(cwd, workspace.cwd) ||
            isWithinRoot(workspace.cwd, cwd),
        );
        if (nested) {
          writeStderrLine(
            `o1-code serve: skipping persisted workspace registration ${JSON.stringify(
              storedWorkspace,
            )}: path nests with an explicit or earlier restored workspace`,
          );
          continue;
        }
        workspaceInputs.push({
          raw: storedWorkspace,
          cwd,
          displayName,
          removable: true,
          registrationIds: [registrationId],
        });
      }
    } catch (err) {
      writeStderrLine(
        `o1-code serve: failed to read persisted workspace registrations: ${
          err instanceof Error ? err.message : String(err)
        }; continuing with explicit workspaces only`,
      );
    }
  }
  if (workspaceInputs.length > opts.maxRegisteredWorkspaces!) {
    throw new Error(
      `${explicitWorkspaceCount} explicit + ${
        workspaceInputs.length - explicitWorkspaceCount
      } restored workspaces exceed the configured limit of ${opts.maxRegisteredWorkspaces}. ` +
        'Restart with the previous capacity, forget registrations and reduce explicit --workspace values before lowering the limit. The registration store was not changed.',
    );
  }
  if (workspaceInputs.length > 1 && deps.bridge) {
    throw new Error(
      'Injected bridge dependencies are only supported with a single workspace; ' +
        'multiple --workspace values require runO1CodeServe to construct one bridge per workspace.',
    );
  }
  // Canonicalize ONCE here so `/capabilities` and the POST /session
  // fallback (both via server.ts) AND the bridge agree on the same
  // path. Without this, server.ts and the bridge each compute
  // `boundWorkspace` independently; on symlinks or case-insensitive
  // filesystems the bridge's `realpathSync.native` form diverges from
  // server.ts's raw `opts.workspace` and clients see one path on
  // `/capabilities` but another on `POST /session` responses.

  // Read a lightweight settings summary once at boot for startup-time fields
  // used before the full runtime settings loader is allowed onto the hot path.
  let contextFilenameForInit: string | undefined;
  let permissionPolicy: PermissionPolicy | undefined;
  let permissionConsensusQuorum: number | undefined;
  let bootSettings: ServeFastPathSettings | undefined;
  let sessionArtifactsPersistenceAvailable = true;
  try {
    bootSettings =
      deps.bootSettings ?? loadServeFastPathSettings(boundWorkspace);
    sessionArtifactsPersistenceAvailable =
      sessionArtifactsPersistenceAvailableFromSettings(bootSettings);
    contextFilenameForInit = extractContextFilename(
      bootSettings.context?.fileName,
    );
    const policyConfig = bootSettings.policy ?? {};
    const resolved = validatePolicyConfig(policyConfig);
    permissionPolicy = resolved.permissionPolicy;
    permissionConsensusQuorum = resolved.permissionConsensusQuorum;
  } catch (err) {
    // Invalid policy values must fail startup loudly. Discriminate by
    // error class rather than substring-matching the message.
    if (
      err instanceof InvalidPolicyConfigError ||
      err instanceof InvalidExecutionSandboxConfigError
    ) {
      throw err;
    }
    // All other settings-read failures (corrupted JSON, transient
    // disk IO) fall back to defaults so the daemon stays bootable.
    writeStderrLine(
      `o1-code serve: could not read settings for context.fileName / ` +
        `policy.* / serve.tokenQr ` +
        `(${err instanceof Error ? err.message : String(err)}); ` +
        `falling back to defaults. Restart with a valid settings.json ` +
        `to apply context.fileName / policy.* / ` +
        `serve.tokenQr overrides.`,
    );
  }
  assertExecutionSandboxSupported(
    bootSettings ?? {},
    'serve / ACP / web terminals',
  );
  // Init daemon logger early so all subsequent lifecycle events
  // (bridge spawn diagnostics, shutdown errors) are captured to file.
  const daemonLogBaseDir = await resolveDaemonLogBaseDirForRun({
    deps,
    bootSettings,
    boundWorkspace,
  });
  const daemonLog: DaemonLogger = await initDaemonLogger({
    boundWorkspace,
    baseDir: daemonLogBaseDir,
  });
  loggerLifecycle.initialized(daemonLog);
  daemonLog.info('project memory scope resolved', {
    projectMemoryScope: resolvedMemoryProjectScope,
    projectMemoryScopeSource: memoryProjectScopeSource,
    projectMemoryScopeRaw: memoryProjectScopeValue,
  });
  // Per-workspace .env loads keep running after boot (skill status, voice
  // capability checks, settings reloads); boot stderr is long gone by then,
  // so fresh loader-key rejections must land in the durable daemon log or
  // they vanish without a diagnostic.
  const loaderRejectionReporter: LoaderKeyRejectionReporter = (
    source,
    freshKeys,
  ) => {
    daemonLog.warn(
      'rejected loader-affecting env keys; they were not applied',
      {
        source,
        rejectedKeys: freshKeys,
      },
    );
  };
  setLoaderKeyRejectionReporter(loaderRejectionReporter);
  loggerLifecycle.reporterInstalled(loaderRejectionReporter);
  // Boot stderr rarely survives desktop/systemd daemon launches, so persist
  // the scrub decision in the durable daemon log as well.
  if (scrubbedLoaderEnvKeys.length > 0) {
    daemonLog.info(
      'scrubbed inherited loader env vars from the daemon process; ' +
        'session subprocesses will not inherit them',
      { removedKeys: scrubbedLoaderEnvKeys },
    );
  }
  // The serve fast path rejects loader keys before this logger exists, and
  // its stderr warnings rarely survive desktop/systemd launches either.
  const fastPathRejectedLoaderKeys = consumeServeFastPathRejectedLoaderKeys();
  if (fastPathRejectedLoaderKeys.length > 0) {
    daemonLog.info(
      'rejected loader-affecting env keys during serve fast-path boot; ' +
        'they were not applied to the daemon process',
      { rejectedKeys: fastPathRejectedLoaderKeys },
    );
  }
  let loggerPublished = false;
  let loggerSignalOwned = false;
  writeStderrLine(
    `o1-code serve: daemon log → ${daemonLog.getLogPath() || '(disabled)'}`,
  );

  // The MCP client guardrails enforce in the ACP child process (where
  // `McpClientManager` lives), not the daemon. Forward the budget
  // config via env vars so the child's `readBudgetFromEnv()` picks
  // them up. Use per-handle env overrides via
  // `BridgeOptions.childEnvOverrides` instead of mutating global
  // `process.env`, so concurrent embedded daemons don't race.
  if (opts.mcpClientBudget !== undefined) {
    if (
      !Number.isFinite(opts.mcpClientBudget) ||
      !Number.isInteger(opts.mcpClientBudget) ||
      opts.mcpClientBudget <= 0
    ) {
      throw new TypeError(
        `Invalid mcpClientBudget: ${opts.mcpClientBudget}. Must be a positive integer.`,
      );
    }
  }
  if (opts.mcpBudgetMode === 'enforce' && opts.mcpClientBudget === undefined) {
    throw new Error(
      'mcpBudgetMode="enforce" requires a positive mcpClientBudget. ' +
        'Pass mcpClientBudget=N, or set mcpBudgetMode to "warn" or "off".',
    );
  }
  // Validate the deadline options on the explicit option path.
  // The env path is already validated inside `parseDeadlineEnv`. Boot-
  // loud so an embedded caller passing `{ promptDeadlineMs: -5 }`
  // doesn't end up with a daemon that silently fails to enforce the
  // cap, leaving the operator believing the timeout is active.
  if (opts.promptDeadlineMs !== undefined) {
    if (!isPositiveIntegerMs(opts.promptDeadlineMs)) {
      throw new TypeError(
        `Invalid promptDeadlineMs: ${opts.promptDeadlineMs}. Must be a positive integer (milliseconds).`,
      );
    }
    assertTimerDelayInRange('promptDeadlineMs', opts.promptDeadlineMs);
  }
  if (opts.maxSessions !== undefined) {
    if (Number.isNaN(opts.maxSessions) || opts.maxSessions < 0) {
      throw new TypeError(
        `Invalid maxSessions: ${opts.maxSessions}. Must be a number >= 0 ` +
          `(0 / Infinity = unlimited).`,
      );
    }
  }
  if (opts.maxTotalSessions !== undefined) {
    if (!isNonNegativeIntegerOrInfinity(opts.maxTotalSessions)) {
      throw new TypeError(
        `Invalid maxTotalSessions: ${opts.maxTotalSessions}. Must be a non-negative integer ` +
          `(0 / Infinity = unlimited).`,
      );
    }
  }
  if (opts.maxPendingPromptsPerSession !== undefined) {
    if (!isNonNegativeIntegerOrInfinity(opts.maxPendingPromptsPerSession)) {
      throw new TypeError(
        `Invalid maxPendingPromptsPerSession: ${opts.maxPendingPromptsPerSession}. Must be a non-negative integer (0 / Infinity = unlimited).`,
      );
    }
  }
  if (opts.eventRingSize !== undefined) {
    if (
      !Number.isInteger(opts.eventRingSize) ||
      opts.eventRingSize < 1 ||
      opts.eventRingSize > MAX_EVENT_RING_SIZE
    ) {
      throw new TypeError(
        `Invalid eventRingSize: ${opts.eventRingSize}. ` +
          `Must be a positive integer in [1, ${MAX_EVENT_RING_SIZE}].`,
      );
    }
  }
  if (opts.compactedReplayMaxBytes !== undefined) {
    normalizeCompactedReplayMaxBytes(opts.compactedReplayMaxBytes);
  }
  if (opts.maxJournalEvents !== undefined) {
    normalizeMaxJournalEvents(opts.maxJournalEvents);
  }
  if (opts.maxJournalBytes !== undefined) {
    normalizeMaxJournalBytes(opts.maxJournalBytes);
  }
  if (opts.writerIdleTimeoutMs !== undefined) {
    if (!isPositiveIntegerMs(opts.writerIdleTimeoutMs)) {
      throw new TypeError(
        `Invalid writerIdleTimeoutMs: ${opts.writerIdleTimeoutMs}. Must be a positive integer (milliseconds).`,
      );
    }
  }
  if (opts.channelIdleTimeoutMs !== undefined) {
    if (
      !Number.isFinite(opts.channelIdleTimeoutMs) ||
      !Number.isInteger(opts.channelIdleTimeoutMs) ||
      opts.channelIdleTimeoutMs < 0
    ) {
      throw new TypeError(
        `Invalid channelIdleTimeoutMs: ${opts.channelIdleTimeoutMs}. Must be a non-negative integer (milliseconds, 0 = immediate kill).`,
      );
    }
  }
  if (opts.sessionReapIntervalMs !== undefined) {
    if (!isNonNegativeIntegerMs(opts.sessionReapIntervalMs)) {
      throw new TypeError(
        `Invalid sessionReapIntervalMs: ${opts.sessionReapIntervalMs}. Must be a non-negative integer (milliseconds, 0 = disabled).`,
      );
    }
  }
  if (opts.sessionIdleTimeoutMs !== undefined) {
    if (!isNonNegativeIntegerMs(opts.sessionIdleTimeoutMs)) {
      throw new TypeError(
        `Invalid sessionIdleTimeoutMs: ${opts.sessionIdleTimeoutMs}. Must be a non-negative integer (milliseconds, 0 = disabled).`,
      );
    }
  }
  if (opts.sessionPromptSettledCloseGraceMs !== undefined) {
    if (!isNonNegativeIntegerMs(opts.sessionPromptSettledCloseGraceMs)) {
      throw new TypeError(
        `Invalid sessionPromptSettledCloseGraceMs: ${opts.sessionPromptSettledCloseGraceMs}. Must be a non-negative integer (milliseconds, 0 = disabled).`,
      );
    }
  }
  if (opts.initializeTimeoutMs !== undefined) {
    if (!isPositiveIntegerMs(opts.initializeTimeoutMs)) {
      throw new TypeError(
        `Invalid initializeTimeoutMs: ${opts.initializeTimeoutMs}. Must be a positive integer (milliseconds).`,
      );
    }
    assertTimerDelayInRange('initializeTimeoutMs', opts.initializeTimeoutMs);
  }
  const sessionRestoreTimeoutMs = resolveSessionRestoreTimeoutMs(opts);
  opts.sessionRestoreTimeoutMs = sessionRestoreTimeoutMs;
  // Validate here (not just in the yargs handler) so embedded callers of
  // `runO1CodeServe({ permissionResponseTimeoutMs })` also fail loud: the
  // bridge treats a non-finite / negative value as the "disabled"
  // sentinel, which would silently drop the permission deadline. Mirrors
  // `channelIdleTimeoutMs`; out-of-range values are clamped by the bridge.
  if (opts.permissionResponseTimeoutMs !== undefined) {
    if (
      !Number.isFinite(opts.permissionResponseTimeoutMs) ||
      !Number.isInteger(opts.permissionResponseTimeoutMs) ||
      opts.permissionResponseTimeoutMs < 0
    ) {
      throw new TypeError(
        `Invalid permissionResponseTimeoutMs: ${opts.permissionResponseTimeoutMs}. Must be a non-negative integer (milliseconds, 0 = disabled / wait forever).`,
      );
    }
  }
  const rawExternalToolGuard = (opts as { externalToolGuard?: unknown })
    .externalToolGuard;
  if (
    rawExternalToolGuard !== undefined &&
    (typeof rawExternalToolGuard !== 'object' ||
      rawExternalToolGuard === null ||
      (rawExternalToolGuard as { mode?: unknown }).mode !== 'required')
  ) {
    throw new TypeError(
      "Invalid externalToolGuard: omit it for off mode or set mode to 'required'.",
    );
  }
  opts.maxTotalSessions ??= deriveDefaultMaxTotalSessions(
    opts.maxSessions,
    workspaceInputs.length,
    opts.maxRegisteredWorkspaces!,
  );
  // Per-handle env overrides: `undefined` value means "scrub this
  // var from the child env" — important when a different daemon
  // in the same process set the var globally previously. Always
  // set both keys explicitly (to value or `undefined`) so each
  // child's MCP budget env is fully determined by this handle's
  // options, with no inheritance from process.env's current state.
  //
  // If the daemon parent process has the pool kill switch
  // (`O1CODE_SERVE_NO_MCP_POOL=1`) in its own env, infer
  // `mcpPoolActive: false` so the capabilities envelope drops the
  // `mcp_workspace_pool` + `mcp_pool_restart` tags.
  const inheritedNoPool = process.env['O1CODE_SERVE_NO_MCP_POOL'] === '1';
  if (opts.mcpPoolActive === undefined && inheritedNoPool) {
    opts.mcpPoolActive = false;
  }
  let externalToolGuardHandler: ExternalToolGuardHandler | undefined;
  if (opts.externalToolGuard?.mode === 'required') {
    if (deps.bridge) {
      throw new Error(
        'Required external tool guarding cannot be combined with an injected bridge.',
      );
    }
    const { RequiredExternalToolGuard } = await import(
      './external-tool-guard-provider.js'
    );
    const provider = new RequiredExternalToolGuard({
      endpoint: opts.externalToolGuard.endpoint,
      token: opts.externalToolGuard.token,
      ...(opts.externalToolGuard.timeoutMs !== undefined
        ? { timeoutMs: opts.externalToolGuard.timeoutMs }
        : {}),
    });
    await provider.initialize();
    externalToolGuardHandler = provider.prepare;
    writeStderrLine(
      'o1-code serve: required external tool guard handshake succeeded.',
    );
  }
  // Keep the guard's core helper imports out of the serve fast-path bundle.
  const { createDaemonToolGuard } = await import(
    './daemon-git-worktree-guard.js'
  );
  const daemonToolGuardHandler = createDaemonToolGuard(
    externalToolGuardHandler,
  );
  const childEnvOverrides: Record<string, string | undefined> = {
    O1CODE_SERVE_MCP_CLIENT_BUDGET:
      opts.mcpClientBudget !== undefined
        ? String(opts.mcpClientBudget)
        : undefined,
    O1CODE_SERVE_MCP_BUDGET_MODE: opts.mcpBudgetMode,
    // The Conversations marker is enable-only and scoped to the
    // live-conversation bridge below; every other runtime's child must not
    // inherit it from the daemon's own environment.
    [PRIVATE_CONVERSATIONS_RUNTIME_ENV]: undefined,
    [PRIVATE_EXTERNAL_TOOL_GUARD_ENV]: EXTERNAL_TOOL_GUARD_REQUIRED_VALUE,
    [PRIVATE_EXTERNAL_TOOL_GUARD_PROVIDER_ENV]: externalToolGuardHandler
      ? EXTERNAL_TOOL_GUARD_PROVIDER_ATTACHED_VALUE
      : undefined,
  };

  const cliVersionPromise = getCliVersion();
  let cliVersion: string | undefined;

  const diagnosticSink = (line: string, level?: 'info' | 'warn' | 'error') =>
    daemonLog.raw(line, level);

  let actualPort = opts.port;

  // Resolve the built Web Shell SPA so createServeApp can mount the UI at the
  // daemon root. --no-web (serveWebShell=false) skips it. Absent assets (e.g.
  // a --cli-only build that omits packages/web-shell) degrade to API-only
  // with a breadcrumb rather than failing the boot.
  const webShellDir =
    opts.serveWebShell === false ? undefined : resolveWebShellDir();
  if (optsIn.requireWebShell && !webShellDir) {
    throw new Error('--open-with-auth requires built Web Shell assets.');
  }
  if (opts.serveWebShell !== false) {
    if (!webShellDir) {
      writeStderrLine(
        'o1-code serve: Web Shell assets not found; serving API only. ' +
          'Build the web-shell workspace (npm run build) or pass --no-web to silence this.',
      );
    } else {
      // Positive happy-path breadcrumb so operators can confirm the UI is live
      // (the only other lines are negative-path warnings).
      writeStderrLine(`o1-code serve: Web Shell UI served from ${webShellDir}`);
      if (!isLoopbackBind(opts.hostname)) {
        writeStderrLine(
          'o1-code serve: Web Shell UI is served WITHOUT auth on a non-loopback ' +
            'bind (the static shell has no secrets; the API stays token-gated). ' +
            'Pass --no-web to disable the UI.',
        );
        // The remote same-origin exception matches the browser's Origin
        // against the scheme and Host the daemon's own socket sees, so it
        // covers direct HTTP and WebSocket requests. ANY intermediary
        // that terminates TLS or rewrites the Host header (nginx's default
        // proxy_set_header, k8s Ingress) presents an Origin this daemon
        // cannot match — name them so the operator is not left with a
        // silently read-only shell. Port translation alone forwards Host
        // verbatim and needs nothing.
        if (!opts.allowOrigins || opts.allowOrigins.length === 0) {
          writeStderrLine(
            'o1-code serve: same-origin Web Shell HTTP and WebSocket requests work ' +
              'without --allow-origin. Browsers reaching the daemon through a ' +
              'TLS-terminating proxy still need --allow-origin <origin>. A plain-HTTP ' +
              'intermediary that rewrites the Host header (nginx default ' +
              'proxy_set_header, k8s Ingress) needs --allow-origin <origin> ' +
              'for the origin the browser sees, unless it forwards Host ' +
              'verbatim; port translation alone (ssh -L, docker -p) is fine.',
          );
        }
      }
    }
  }
  // webShellDir is already undefined whenever serveWebShell === false, so this
  // collapses to "did we resolve real assets".
  const webShellMounted = !!webShellDir;
  const serveAppLifecycle = new ServeAppLifecycleController();
  const conversationStableBaseDir = path.resolve(
    deps.conversationStableBaseDir ?? path.join(os.homedir(), '.o1-code'),
  );
  let resolveServeAppStartup!: () => void;
  let rejectServeAppStartup!: (error: Error) => void;
  let serveAppStartupSettled = false;
  const serveAppStartupReady = new Promise<void>((resolve, reject) => {
    resolveServeAppStartup = resolve;
    rejectServeAppStartup = reject;
  });
  void serveAppStartupReady.catch(() => undefined);
  const markServeAppStartupReady = (): void => {
    if (serveAppStartupSettled) return;
    serveAppStartupSettled = true;
    resolveServeAppStartup();
  };
  const markServeAppStartupFailed = (error: Error): void => {
    if (serveAppStartupSettled) return;
    serveAppStartupSettled = true;
    rejectServeAppStartup(error);
  };
  let runtimeApp: Application | undefined;
  let runtimeAppForCleanup: Application | undefined;
  let getWorkspaceRuntimeCoordinatorIfSupported:
    | (typeof import('./workspace-runtime-coordinator.js'))['getWorkspaceRuntimeCoordinatorIfSupported']
    | undefined;
  let bridgeRef: AcpSessionBridge | undefined = deps.bridge;
  let managedProcessRegistry:
    | {
        shutdown(): Promise<void>;
        killAllSync(): void;
      }
    | undefined;
  // Held for daemon status: `observe` mode's whole product is the would-be
  // refusal count, which is useless unless it can be read back out.
  let managedChildHeapPolicy: ChildHeapPolicy | undefined;
  const internalRuntimeBridgesForCleanup: AcpSessionBridge[] = [];
  let daemonEventLoopMonitor:
    | ReturnType<CoreRuntime['startEventLoopLagMonitor']>
    | undefined;
  // Daemon Status metrics-ring sampler: a fixed-cadence timer that seals a
  // bucket plus the window-scoped event-loop histogram it resets each seal.
  // Torn down together with the event-loop monitor on runtime restart/stop.
  let daemonMetricsSampler: { dispose(): void } | undefined;
  // Low-frequency sweep refreshing bound-PR state snapshots (open → merged).
  // The refresh module loads via dynamic import (see start site) because it
  // pulls the SessionService chain, which must stay out of the pre-listen
  // static closure; the generation guards dispose-vs-async-start races.
  let sessionPrRefreshTimer: { dispose(): void } | undefined;
  let sessionPrRefreshGeneration = 0;
  let runtimeStartupError: string | undefined;
  let runtimeStarting: Promise<void> | undefined;
  let markRuntimeReady!: () => void;
  let markRuntimeFailed!: (err: Error) => void;
  let runtimeStartupSettled = false;
  let startRuntimeAfterHealth: (() => void) | undefined;
  let startRuntimeForRequest: (() => boolean) | undefined;
  const deferRuntimeUntilFirstHealth =
    deps.resolveOnListen === true && deps.deferRuntimeUntilFirstHealth === true;
  const runtimeReady = new Promise<void>((resolve, reject) => {
    markRuntimeReady = resolve;
    markRuntimeFailed = reject;
  });
  void runtimeReady.catch(() => {});
  const disposeDaemonEventLoopMonitor = (): void => {
    const eventLoopMonitor = daemonEventLoopMonitor;
    daemonEventLoopMonitor = undefined;
    const metricsSampler = daemonMetricsSampler;
    daemonMetricsSampler = undefined;
    const prRefreshTimer = sessionPrRefreshTimer;
    sessionPrRefreshTimer = undefined;
    sessionPrRefreshGeneration += 1;
    prRefreshTimer?.dispose();
    try {
      eventLoopMonitor?.dispose();
    } catch (err) {
      daemonLog.warn(
        `event loop monitor dispose error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    try {
      metricsSampler?.dispose();
    } catch (err) {
      daemonLog.warn(
        `metrics sampler dispose error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };
  // Set once `close()` starts; refuses Local Control changes during drain.
  let daemonDraining = false;
  const handleBridge =
    deps.bridge ??
    createLazyBridgeProxy(
      () => bridgeRef,
      () => runtimeStartupError,
    );
  const shutdownBridges = new WeakSet<AcpSessionBridge>();
  const disposedRuntimeApps = new WeakSet<Application>();
  const stoppedRuntimeAppProducers = new WeakSet<Application>();
  const stoppedExtensionReconcilers = new WeakSet<Application>();
  const stoppedTrustPolicyMonitors = new WeakSet<Application>();
  const stopTrustPolicyMonitor = (app: Application | undefined): void => {
    if (!app || stoppedTrustPolicyMonitors.has(app)) return;
    stoppedTrustPolicyMonitors.add(app);
    const stop = app.locals?.['stopTrustPolicyMonitor'] as
      | (() => void)
      | undefined;
    try {
      stop?.();
    } catch (err) {
      daemonLog.warn(
        `trust policy monitor dispose error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };
  const stopExtensionReconciler = (app: Application | undefined): void => {
    if (!app || stoppedExtensionReconcilers.has(app)) return;
    stoppedExtensionReconcilers.add(app);
    const stopExtensionGenerationReconciler = app.locals?.[
      'stopExtensionGenerationReconciler'
    ] as (() => void) | undefined;
    try {
      stopExtensionGenerationReconciler?.();
    } catch (err) {
      daemonLog.warn(
        `extension generation reconciler dispose error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };
  const stopRuntimeAppProducers = (app: Application | undefined): void => {
    if (!app || stoppedRuntimeAppProducers.has(app)) return;
    stoppedRuntimeAppProducers.add(app);
    const locals = app.locals as {
      stopScheduledTaskKeepalive?: () => void;
      stopWorkspaceGitState?: () => void;
      stopWebTerminalRegistry?: () => void;
      subSessionStoppers?: Array<() => void>;
    };
    const stopSafely = (name: string, stop: (() => void) | undefined) => {
      try {
        stop?.();
      } catch (err) {
        daemonLog.warn(
          `${name} dispose error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    };
    stopSafely('scheduled-task keepalive', locals.stopScheduledTaskKeepalive);
    stopSafely('workspace git state', locals.stopWorkspaceGitState);
    stopSafely('web terminal registry', locals.stopWebTerminalRegistry);
    stopTrustPolicyMonitor(app);
    for (const stop of locals.subSessionStoppers ?? []) {
      stopSafely('sub-session launcher', stop);
    }
    stopExtensionReconciler(app);
  };
  const disposeRuntimeAppResources = (app: Application | undefined): void => {
    if (!app || disposedRuntimeApps.has(app)) return;
    disposedRuntimeApps.add(app);
    stopRuntimeAppProducers(app);

    // Queue Local Control teardown before disposing the ACP handle. The
    // serialized disable runs on the next microtask and wins before further IO;
    // ACP disposal below also removes the upgrade listeners while the daemon
    // mount is being torn down.
    const localControlService = app.locals?.['localControlService'] as
      | LocalControlService
      | undefined;
    if (localControlService) {
      void localControlService.dispose().catch((err: unknown) => {
        daemonLog.warn(
          `Local Control dispose error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }

    const acpHandle = app.locals?.['acpHandle'] as AcpHttpHandle | undefined;
    if (acpHandle?.dispose) {
      try {
        acpHandle.dispose();
      } catch (err) {
        daemonLog.warn(
          `ACP handle dispose error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const rateLimiter = getRateLimiter(app);
    if (rateLimiter) {
      try {
        rateLimiter.setDraining(true);
        rateLimiter.dispose();
      } catch (err) {
        daemonLog.warn(
          `rate limiter dispose error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    disposeDaemonEventLoopMonitor();
  };
  const getRuntimeBridgesForCleanup = (): AcpSessionBridge[] => {
    const appForCleanup = runtimeApp ?? runtimeAppForCleanup;
    const registry = appForCleanup?.locals?.['workspaceRegistry'] as
      | WorkspaceRegistry
      | undefined;
    const bridges = [
      ...(registry
        ? registry.listManaged().map((runtime) => runtime.bridge)
        : []),
      ...(bridgeRef ? [bridgeRef] : []),
      ...internalRuntimeBridgesForCleanup,
    ];
    return [...new Set(bridges)];
  };

  const buildRuntime = async (): Promise<{
    app: Application;
    bridge: AcpSessionBridge | undefined;
  }> => {
    const [runtime, core, settingsRuntime, resolvedCliVersion, trustPolicy] =
      await Promise.all([
        loadServeRuntimeModules(),
        loadCoreRuntime(),
        loadSettingsRuntimeModules(),
        cliVersionPromise,
        import('../config/daemon-trust-policy.js'),
      ]);
    getWorkspaceRuntimeCoordinatorIfSupported =
      runtime.getWorkspaceRuntimeCoordinatorIfSupported;
    cliVersion = resolvedCliVersion;
    settingsRuntime.environment.preResolveHomeEnvOverrides();
    const bootTrustSnapshot = await trustPolicy.readDaemonTrustPolicySnapshot();
    let latestTrustPolicySnapshot = bootTrustSnapshot;
    const bootPrimaryTrustDecision = trustPolicy.evaluateDaemonWorkspaceTrust(
      bootTrustSnapshot,
      boundWorkspace,
    );
    const trustedWorkspace =
      deps.trustedWorkspace ?? bootPrimaryTrustDecision.targetTrusted;
    if (shouldPreheat && !trustedWorkspace) {
      shouldPreheat = false;
      startup.preheat.status = 'not_scheduled';
    }
    const workspaceTrustHotReloadAvailable =
      deps.trustedWorkspace === undefined &&
      deps.bridge === undefined &&
      deps.fsFactory === undefined;
    let managedScratchRoot: ManagedScratchRoot | undefined;
    try {
      // Root acceptance is fail-closed and happens only after every startup
      // workspace (including restored registrations) has been resolved.
      managedScratchRoot = prepareManagedScratchRoot(
        path.join(core.Storage.getGlobalO1CodeDir(), 'scratch-workspaces'),
        workspaceInputs.map((workspace) => workspace.cwd),
      );
    } catch (err) {
      writeStderrLine(
        `o1-code serve: managed scratch workspaces are unavailable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    let runtimeBootSettings:
      | ReturnType<SettingsRuntime['loadSettings']>
      | undefined;
    try {
      runtimeBootSettings = settingsRuntime.settings.loadSettings(
        boundWorkspace,
        {
          skipLoadEnvironment: true,
          skipWorkspaceSettings: !trustedWorkspace,
          workspaceTrusted: trustedWorkspace,
        },
      );
    } catch (err) {
      if (err instanceof InvalidExecutionSandboxConfigError) throw err;
      writeStderrLine(
        `o1-code serve: could not read full settings for runtime startup ` +
          `(${err instanceof Error ? err.message : String(err)}); falling back to defaults.`,
      );
    }
    assertExecutionSandboxSupported(
      runtimeBootSettings?.merged ?? {},
      'serve workspace runtimes',
    );
    if (
      deps.trustedWorkspace === undefined &&
      runtimeBootSettings &&
      !trustedWorkspace
    ) {
      daemonLog.warn(
        'workspace file writes are disabled because the bound workspace is not trusted',
        { workspace: boundWorkspace },
      );
    }
    const runtimeEnvSnapshot = runtimeBootSettings
      ? settingsRuntime.environment.buildRuntimeEnvironment(
          runtimeBootSettings.merged,
          boundWorkspace,
          daemonRuntimeBaseEnv,
          trustedWorkspace,
        )
      : {
          effectiveEnv: { ...daemonRuntimeBaseEnv },
          overlayKeys: Object.freeze([] as string[]),
          envFilePaths: Object.freeze([] as string[]),
          envFileReadFailed: false,
          envFileReadFailures: Object.freeze([]),
        };
    const resolveSessionRuntimeBaseDir = (
      workspace: string,
      settings: ReturnType<SettingsRuntime['loadSettings']> | undefined,
      effectiveEnv: Readonly<NodeJS.ProcessEnv>,
    ): string => {
      const resolveConfiguredPath = (
        configuredPath: string,
        relativeTo: string,
      ): string => {
        const expanded =
          configuredPath === '~'
            ? os.homedir()
            : configuredPath.startsWith('~/') ||
                configuredPath.startsWith('~\\')
              ? path.join(
                  os.homedir(),
                  ...configuredPath
                    .slice(2)
                    .split(/[/\\]+/)
                    .filter(Boolean),
                )
              : configuredPath;
        return path.resolve(relativeTo, expanded);
      };
      const runtimeDir = effectiveEnv['O1CODE_RUNTIME_DIR'];
      if (runtimeDir) {
        return resolveConfiguredPath(runtimeDir, process.cwd());
      }
      const settingsDir = settings?.merged.advanced?.runtimeOutputDir;
      if (settingsDir) {
        return resolveConfiguredPath(settingsDir, workspace);
      }
      const o1codeHome = effectiveEnv['O1CODE_HOME'];
      if (o1codeHome) {
        return resolveConfiguredPath(o1codeHome, process.cwd());
      }
      const homeDir = os.homedir();
      return homeDir
        ? path.join(homeDir, '.o1-code')
        : path.join(os.tmpdir(), '.o1-code');
    };
    const logRuntimeEnvFileReadFailures = (
      workspace: string,
      snapshot: {
        readonly envFileReadFailed: boolean;
        readonly envFileReadFailures?: ReadonlyArray<{
          readonly path: string;
          readonly error: string;
        }>;
      },
    ): void => {
      if (!snapshot.envFileReadFailed) return;
      const failedFiles = snapshot.envFileReadFailures ?? [];
      daemonLog.warn('one or more runtime env files could not be read', {
        workspace,
        ...(failedFiles.length > 0 ? { failedFiles } : {}),
      });
    };
    logRuntimeEnvFileReadFailures(boundWorkspace, runtimeEnvSnapshot);
    const primarySessionRuntimeBaseDir = resolveSessionRuntimeBaseDir(
      boundWorkspace,
      runtimeBootSettings,
      runtimeEnvSnapshot.effectiveEnv,
    );
    const runtimeEffectiveEnv: NodeJS.ProcessEnv = {
      ...runtimeEnvSnapshot.effectiveEnv,
      O1CODE_RUNTIME_DIR: primarySessionRuntimeBaseDir,
    };
    const replaceRuntimeEffectiveEnv = (
      nextEnv: Readonly<NodeJS.ProcessEnv>,
    ): void => {
      for (const key of Object.keys(runtimeEffectiveEnv)) {
        delete runtimeEffectiveEnv[key];
      }
      Object.assign(runtimeEffectiveEnv, nextEnv);
      runtimeEffectiveEnv['O1CODE_RUNTIME_DIR'] = primarySessionRuntimeBaseDir;
    };
    const primaryRuntimeEnv: {
      mode: 'runtime-overlay';
      overlayKeys: string[];
      envFilePaths: string[];
      effectiveEnv: NodeJS.ProcessEnv;
      workflowsEnabledBySettings: boolean;
      envFileReadFailed: boolean;
      envFileReadFailures: Array<{ path: string; error: string }>;
      fallbackReason?: string;
    } = {
      mode: 'runtime-overlay' as const,
      overlayKeys: [...runtimeEnvSnapshot.overlayKeys],
      effectiveEnv: runtimeEffectiveEnv,
      workflowsEnabledBySettings:
        runtimeBootSettings?.merged.tools?.workflowsEnabled === true,
      envFilePaths: [...runtimeEnvSnapshot.envFilePaths],
      envFileReadFailed: runtimeEnvSnapshot.envFileReadFailed,
      envFileReadFailures: [...runtimeEnvSnapshot.envFileReadFailures],
    };
    const daemonWorkspaceHash = core.hashDaemonWorkspace(boundWorkspace);
    let daemonTelemetrySettings: TelemetrySettings;
    try {
      daemonTelemetrySettings = await core.resolveTelemetrySettings({
        env: process.env,
        settings: runtimeBootSettings?.merged.telemetry,
      });
    } catch (err) {
      if (err instanceof core.FatalConfigError) {
        throw new core.FatalConfigError(
          `Invalid telemetry configuration: ${err.message}.`,
        );
      }
      throw err;
    }
    // Must settle before initializeDaemonMetrics(): metrics.getMeter() caches
    // a noop meter permanently if called before the SDK registers the global
    // MeterProvider. This runs in the deferred runtime load, off the fast path.
    await core.initializeTelemetry(
      createDaemonTelemetryRuntimeConfig(
        daemonTelemetrySettings,
        resolvedCliVersion,
        `daemon:${process.pid}`,
        {
          otlpEndpoint: core.DEFAULT_OTLP_ENDPOINT,
          telemetryTarget: core.DEFAULT_TELEMETRY_TARGET,
        },
      ),
    );
    core.initializeDaemonMetrics();
    daemonEventLoopMonitor?.dispose();
    daemonEventLoopMonitor = core.startEventLoopLagMonitor({
      onNewMaxStall: (maxMs) => {
        daemonLog.warn('daemon event loop stall detected', { maxMs });
      },
    });
    const currentDaemonEventLoopMonitor = daemonEventLoopMonitor;
    core.registerDaemonEventLoopLagGauge(() =>
      currentDaemonEventLoopMonitor.snapshot(),
    );
    // Daemon Status metrics ring (time-series charts). Bounded so ~15 min of
    // per-interval history survives dialog close / page reload — the point of
    // doing this in the daemon rather than accumulating in the browser. Fed from
    // the telemetry middleware (request rate/latency), the bridge telemetry
    // hooks (queue-wait/duration, token burn, LLM round-trip), the pipe recorder
    // (IPC bytes), and the sampler's gauge reads (CPU / memory / connections /
    // pending prompts / event-loop lag). Declared before `recordPipeMessage` so
    // that recorder can fold pipe bytes straight in.
    const metricsRing = new DaemonMetricsRing({
      capacity: DAEMON_METRICS_CAPACITY,
    });
    const pipeStats: DaemonPerfSnapshot['pipe'] = {
      inbound: { count: 0, totalBytes: 0, maxBytes: 0 },
      outbound: { count: 0, totalBytes: 0, maxBytes: 0 },
    };
    const promptQueueWaitStats = {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      lastMs: null as number | null,
    };
    const recordPipeMessage = (
      direction: keyof DaemonPerfSnapshot['pipe'],
      bytes: number,
    ): void => {
      const stats = pipeStats[direction];
      stats.count += 1;
      stats.totalBytes += bytes;
      stats.maxBytes = Math.max(stats.maxBytes, bytes);
      core.recordDaemonPipeMessage(direction, bytes);
      metricsRing.recordPipe(direction, bytes);
    };
    const observeLargePipeFrame = createLargePipeFrameObserver({
      daemonLog,
      emitTelemetryLog: core.emitDaemonLog,
    });
    // Saturation now backpressures the agent pipe for a bounded grace
    // window instead of tearing the channel down immediately.
    // Warn at episode start so field diagnosis doesn't begin at the
    // `channel exited` breadcrumb.
    // `callHook` in ndJsonStream already isolates hook throws from the
    // transport, so this needs no guard of its own.
    const warnAcpQueueSaturated = (info: NdJsonQueueSaturationInfo): void => {
      daemonLog.warn('ACP NDJSON decoded queue saturated', {
        requiredBytes: info.requiredBytes,
        availableBytes: info.availableBytes,
        maxQueuedMessages: info.maxQueuedMessages,
        maxQueuedBytes: info.maxQueuedBytes,
        queueSaturationGraceMs: info.graceMs,
      });
    };
    const recordPromptQueueWait = (durationMs: number): void => {
      promptQueueWaitStats.count += 1;
      promptQueueWaitStats.totalMs += durationMs;
      promptQueueWaitStats.maxMs = Math.max(
        promptQueueWaitStats.maxMs,
        durationMs,
      );
      promptQueueWaitStats.lastMs = durationMs;
      core.recordDaemonPromptQueueWait(durationMs);
    };
    const createRuntimeBridgeTelemetry = (workspaceHash: string) => {
      const telemetry = core.createDaemonBridgeTelemetry();
      telemetry.metrics = {
        sessionLifecycle(action) {
          core.recordDaemonSessionLifecycle(action);
          core.emitDaemonLog(
            `Session ${action}.`,
            {
              'o1-code.workspace.hash': workspaceHash,
            },
            {
              eventName: `o1-code.daemon.session.${action}`,
            },
          );
        },
        channelLifecycle(action, expected) {
          core.recordDaemonChannelLifecycle(action, expected);
          core.emitDaemonLog(
            action === 'spawn'
              ? 'ACP channel spawned.'
              : `ACP channel exited (expected=${expected ?? true}).`,
            {
              ...(action === 'exit'
                ? { 'o1-code.daemon.channel.expected': expected ?? true }
                : {}),
            },
            {
              eventName: `o1-code.daemon.channel.${action}`,
              ...(expected === false && action === 'exit'
                ? { severityNumber: 13 }
                : {}),
            },
          );
        },
        promptQueueWait(durationMs) {
          recordPromptQueueWait(durationMs);
          metricsRing.recordPromptQueueWait(durationMs);
        },
        promptDuration(durationMs) {
          core.recordDaemonPromptDuration(durationMs);
          metricsRing.recordPromptDuration(durationMs);
        },
        cancelled: core.recordDaemonCancel,
        // Per-round model token usage + LLM round-trip time sniffed off
        // `agent_message_chunk._meta` (`usage` + `durationMs`) at the bridge's
        // single session/update fan-in. Increments (not cumulative), so the ring
        // sums tokens per window (token-burn chart) and pools the round-trip times
        // for the LLM-latency percentiles. `apiErrors` / `apiRetries` ride the
        // same frame (per-round increments, 0 when none) and window into the
        // model-API-health chart.
        tokenUsage(
          inputTokens,
          outputTokens,
          durationMs,
          apiErrors,
          apiRetries,
        ) {
          metricsRing.recordTokens(inputTokens, outputTokens);
          if (typeof durationMs === 'number') {
            metricsRing.recordLlmDuration(durationMs);
          }
          metricsRing.recordApiActivity(apiErrors ?? 0, apiRetries ?? 0);
        },
      };
      return telemetry;
    };
    const daemonTelemetry = createRuntimeBridgeTelemetry(daemonWorkspaceHash);
    // Allocate the audit ring + publisher in the daemon host (here)
    // rather than inside the bridge factory, because the ring is the
    // seam for exposing `GET /workspace/permission/audit` in the future.
    const permissionAuditRing = new PermissionAuditRing();
    const permissionAuditPublisher = createPermissionAuditPublisher({
      ring: permissionAuditRing,
    });
    const customIgnoreFiles =
      runtimeBootSettings?.merged.context?.fileFiltering?.customIgnoreFiles;
    const boundWorkspaces = runtime.resolveBoundWorkspacesFromIdeEnv(
      boundWorkspace,
      undefined,
      (workspace: string, index: number) => {
        if (index === 0) return true;
        const trustedSecondary = trustPolicy.evaluateDaemonWorkspaceTrust(
          bootTrustSnapshot,
          workspace,
        ).targetTrusted;
        if (!trustedSecondary) {
          daemonLog.warn(
            'excluding untrusted secondary workspace root from file-system access',
            { workspace },
          );
        }
        return trustedSecondary;
      },
    );
    daemonLog.info('daemon workspace roots initialized', {
      primary: boundWorkspaces[0],
      secondary: boundWorkspaces.slice(1),
      ideEnvPresent: !!process.env['O1CODE_IDE_WORKSPACE_PATH'],
    });
    const primaryGenerationGuard = runtime.createWorkspaceGenerationGuard();
    const primaryTrustMaterialization = JSON.stringify({
      trusted: trustedWorkspace,
      boundWorkspaces: [...boundWorkspaces].sort(),
    });
    const sharedPathLocks = new PathMutexRegistry();
    const workspaceTrustOperationGate = new PathMutexRegistry();
    const runWorkspaceTrustOperation = <T>(operation: () => Promise<T>) =>
      workspaceTrustOperationGate.runExclusive('runtime-topology', operation);
    const idleReclaimerRef: { current?: IdleAcpReclaimer } = {};
    const processRegistry = new runtime.ProcessRegistry();
    managedProcessRegistry = processRegistry;
    // One policy for the whole daemon, beside the one registry it reads. Both
    // must be shared: a per-factory registry would report a concurrent count
    // of 1 on every spawn and hand each child the entire pool.
    // Not built for an injected bridge: `deps.bridge` brings its own channel
    // and never goes through the factory this policy rides on, so a policy
    // here would size nothing while `limits.memory.enforced` claimed
    // otherwise — a status field asserting enforcement that is not happening.
    const childHeapPolicy: ChildHeapPolicy | undefined =
      opts.daemonMemoryBudget && !deps.bridge
        ? (admissionPolicy ??
          createChildHeapPolicy({
            budget: opts.daemonMemoryBudget,
            mode: opts.childHeapMode ?? 'observe',
          }))
        : undefined;
    managedChildHeapPolicy = childHeapPolicy;
    const fsFactory = runtime.resolveBridgeFsFactory({
      // Secondary roots share a write-capable factory only after their own
      // folder trust check passes; untrusted secondary roots stay outside.
      boundWorkspaces,
      injected: deps.fsFactory,
      trusted: trustedWorkspace,
      emit: deps.fsAuditEmit,
      pathLocks: sharedPathLocks,
      generationGuard: primaryGenerationGuard,
      ...(customIgnoreFiles !== undefined ? { customIgnoreFiles } : {}),
    });
    const routeFsFactory = runtime.resolveBridgeFsFactory({
      // REST routes still return primary-relative paths, so keep their
      // filesystem boundary primary-only until responses carry root IDs.
      boundWorkspaces: [boundWorkspace],
      trusted: trustedWorkspace,
      emit: deps.fsAuditEmit,
      pathLocks: sharedPathLocks,
      generationGuard: primaryGenerationGuard,
      ...(customIgnoreFiles !== undefined ? { customIgnoreFiles } : {}),
    });
    const channelFactory = runtime.createSpawnChannelFactory({
      processRegistry,
      childHeapPolicy,
      reclaimIdleChild: async (signal) => {
        await idleReclaimerRef.current?.(daemonWorkspaceHash, signal);
      },
      pipeLimits: runtime.daemonAcpNdJsonLimits,
      sourceEnv: runtimeEffectiveEnv,
      onDiagnosticLine: diagnosticSink,
      pipeHooks: {
        onMessageSent: (bytes) => recordPipeMessage('outbound', bytes),
        onMessageReceived: (bytes) => recordPipeMessage('inbound', bytes),
        onMessageObserved: ({ direction, bytes, message }) =>
          observeLargePipeFrame({
            direction: daemonPipeDirection(direction),
            bytes,
            message,
          }),
        onQueueSaturated: warnAcpQueueSaturated,
      },
      ...(acpChildExtraArgs(opts)
        ? { extraArgs: acpChildExtraArgs(opts) }
        : {}),
    });
    const statusProvider = runtime.createDaemonStatusProvider({
      env: runtimeEffectiveEnv,
    });
    const workspaceProvidersStatusProvider =
      runtime.createWorkspaceProvidersStatusProvider({
        env: runtimeEffectiveEnv,
        workspaceTrusted: trustedWorkspace,
      });
    const workspaceSkillsStatusProvider =
      runtime.createWorkspaceSkillsStatusProvider({
        workspaceTrusted: trustedWorkspace,
      });
    // Reverse tool channel. ONE sender registry shared
    // between the bridge (which answers the ACP child's `client_mcp/message`
    // ext-method via `clientMcpSender`) and the WS provider in `createServeApp`
    // (which registers a per-connection `ClientMcpRegistrar`'s sender on
    // `mcp_register`). Inert unless `opts.clientMcpOverWs` is on.
    const clientMcpSenderRegistry = new ClientMcpSenderRegistry();
    const runtimeBridges: AcpSessionBridge[] = [];
    // Epoch sources are deliberately never evicted: a removed workspace
    // that is re-registered under the same cwd must continue from its
    // last epoch, otherwise clients holding the old epoch would observe
    // a regression.
    const runtimeEpochSources = new Map<
      string,
      { current(): number; allocate(): number }
    >();
    const runtimeEpochSourceFor = (workspaceCwd: string) => {
      let source = runtimeEpochSources.get(workspaceCwd);
      if (!source) {
        let epoch = 0;
        source = {
          current: () => epoch,
          allocate: () => ++epoch,
        };
        runtimeEpochSources.set(workspaceCwd, source);
      }
      return source;
    };
    let mcpAuthenticationActive = false;
    const acquireMcpAuthentication = () => {
      if (mcpAuthenticationActive) return undefined;
      mcpAuthenticationActive = true;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        mcpAuthenticationActive = false;
      };
    };
    const totalSessionAdmission = runtime.createTotalSessionAdmissionController(
      {
        maxTotalSessions: opts.maxTotalSessions,
        getBridges: () =>
          runtimeBridges.length > 0
            ? runtimeBridges
            : bridgeRef
              ? [bridgeRef]
              : [],
      },
    );
    const sessionOwnerIndex = runtime.createWorkspaceSessionOwnerIndex();
    const workspaceRegistryForPersistence: {
      current: WorkspaceRegistry | undefined;
    } = { current: undefined };
    const isWorkspaceTrustedForPersistence = (workspace: string): boolean =>
      workspaceRegistryForPersistence.current?.getByWorkspaceCwd(workspace)
        ?.trusted ??
      (workspaceRegistryForPersistence.current === undefined &&
        workspace === boundWorkspace &&
        trustedWorkspace);
    const loadSettingsForPersistence = (workspace: string) => {
      const trusted = isWorkspaceTrustedForPersistence(workspace);
      return settingsRuntime.settings.loadSettings(workspace, {
        skipLoadEnvironment: true,
        skipWorkspaceSettings: !trusted,
        workspaceTrusted: trusted,
      });
    };
    const resolveSkillToggleIdentities = async (
      workspace: string,
      skillNames: readonly string[],
    ) => {
      let skills: ServeWorkspaceSkillStatus[] | undefined;
      try {
        const workspaceRuntime =
          workspaceRegistryForPersistence.current?.getByWorkspaceCwd(workspace);
        const status =
          await workspaceRuntime?.workspaceService.getWorkspaceSkillsStatus({
            route: 'skill settings persistence',
            workspaceCwd: workspace,
          });
        if (status?.initialized) skills = status.skills;
      } catch {
        // Preserve the legacy name heuristic when the catalog is unavailable.
      }
      const skillsByName = new Map(
        skills?.map((skill) => [skill.name.trim().toLowerCase(), skill]),
      );
      return skillNames.map((skillName) => {
        const skill = skillsByName.get(skillName.trim().toLowerCase());
        if (!skill) {
          const prefixEnd = skillName.indexOf(':');
          return {
            name: skillName,
            ...(prefixEnd > 0
              ? { authoredName: skillName.slice(prefixEnd + 1) }
              : {}),
          };
        }
        if (skill.level !== 'extension' || !skill.extensionName) {
          return { name: skillName };
        }
        return {
          name: skillName,
          authoredName: skillName.slice(skill.extensionName.length + 1),
        };
      });
    };
    const persistDisabledToolsFn = (
      workspace: string,
      toolName: string,
      enabled: boolean,
      assertGenerationOpen?: () => void,
    ): Promise<void> =>
      withSettingsLock(workspace, async () => {
        assertGenerationOpen?.();
        const fresh = loadSettingsForPersistence(workspace);
        const wsScope = fresh.forScope(WORKSPACE_SETTING_SCOPE).settings;
        const wsDisabled = wsScope.tools?.disabled;
        const current = Array.isArray(wsDisabled)
          ? wsDisabled.filter((v): v is string => typeof v === 'string')
          : [];
        const next = new Set(current);
        if (enabled) next.delete(toolName);
        else next.add(toolName);
        assertGenerationOpen?.();
        fresh.setValue(
          WORKSPACE_SETTING_SCOPE,
          'tools.disabled',
          [...next].sort(),
          assertGenerationOpen,
        );
      });
    const persistDisabledSkillsFn = (
      workspace: string,
      skillName: string,
      enabled: boolean,
      assertGenerationOpen?: () => void,
    ) =>
      withSettingsLock(workspace, async () => {
        assertGenerationOpen?.();
        const {
          skillSettingStrings,
          skillToggleBlockForName,
          updateWorkspaceSkillSettingLists,
        } = await import('../config/skill-settings.js');
        const fresh = loadSettingsForPersistence(workspace);
        const workspaceDisabled = skillSettingStrings(
          fresh,
          WORKSPACE_SETTING_SCOPE,
          'disabled',
        );
        const workspaceEnabled = skillSettingStrings(
          fresh,
          WORKSPACE_SETTING_SCOPE,
          'enabled',
        );
        // A grant a standing entry still forbids is not a write: the picker
        // locks such rows, and a route that persists anyway reports an
        // enable the merged config still denies.
        if (enabled) {
          const [skillIdentity] = await resolveSkillToggleIdentities(
            workspace,
            [skillName],
          );
          const block = skillToggleBlockForName(fresh, skillIdentity);
          if (block) {
            return { changed: false, disabled: workspaceDisabled, block };
          }
        }
        const next = updateWorkspaceSkillSettingLists(
          { disabled: workspaceDisabled, enabled: workspaceEnabled },
          skillName,
          enabled,
        );
        const settingsChanges: Array<{
          key: 'skills.disabled' | 'skills.enabled';
          value: string[] | undefined;
        }> = [];
        if (
          JSON.stringify(next.disabled) !== JSON.stringify(workspaceDisabled)
        ) {
          settingsChanges.push({
            key: 'skills.disabled',
            value: next.disabled.length > 0 ? next.disabled : undefined,
          });
        }
        if (JSON.stringify(next.enabled) !== JSON.stringify(workspaceEnabled)) {
          settingsChanges.push({
            key: 'skills.enabled',
            value: next.enabled.length > 0 ? next.enabled : undefined,
          });
        }
        if (settingsChanges.length === 0) {
          return { changed: false, disabled: workspaceDisabled };
        }

        assertGenerationOpen?.();
        fresh.setValues(
          settingsChanges.map((change) => ({
            scope: WORKSPACE_SETTING_SCOPE,
            ...change,
          })),
          undefined,
          assertGenerationOpen,
        );
        return {
          changed: true,
          disabled: next.disabled,
          settingsChanges,
        };
      });
    const persistDisabledSkillsBatchFn = (
      workspace: string,
      skillNames: readonly string[],
      enabled: boolean,
      assertGenerationOpen?: () => void,
    ): Promise<PersistDisabledSkillsBatchResult> =>
      withSettingsLock(workspace, async () => {
        assertGenerationOpen?.();
        const {
          skillSettingStrings,
          skillToggleBlockForName,
          updateWorkspaceSkillSettingLists,
        } = await import('../config/skill-settings.js');
        const fresh = loadSettingsForPersistence(workspace);
        const initialDisabled = skillSettingStrings(
          fresh,
          WORKSPACE_SETTING_SCOPE,
          'disabled',
        );
        const initialEnabled = skillSettingStrings(
          fresh,
          WORKSPACE_SETTING_SCOPE,
          'enabled',
        );
        const skillIdentities = enabled
          ? await resolveSkillToggleIdentities(workspace, skillNames)
          : skillNames.map((name) => ({ name }));
        let next = { disabled: initialDisabled, enabled: initialEnabled };
        const outcomes: PersistDisabledSkillsBatchResult['outcomes'] =
          skillNames.map((skillName) => ({ skillName, changed: false }));
        let pending = skillNames.map((_, index) => index);

        for (let pass = 0; pass < skillNames.length; pass += 1) {
          const refused: number[] = [];
          let listChanged = false;
          for (const index of pending) {
            const skillName = skillNames[index];
            if (enabled) {
              const block = skillToggleBlockForName(
                fresh,
                skillIdentities[index],
              );
              if (
                block &&
                !(
                  block.scope === 'Workspace' &&
                  block.list === 'disabled' &&
                  !next.disabled.some(
                    (name) => name.trim().toLowerCase() === block.entry,
                  )
                )
              ) {
                refused.push(index);
                continue;
              }
            }
            const updated = updateWorkspaceSkillSettingLists(
              next,
              skillName,
              enabled,
            );
            const changed =
              JSON.stringify(updated.disabled) !==
                JSON.stringify(next.disabled) ||
              JSON.stringify(updated.enabled) !== JSON.stringify(next.enabled);
            next = updated;
            outcomes[index] = { skillName, changed };
            listChanged ||= changed;
          }
          pending = refused;
          if (pending.length === 0 || !listChanged) break;
        }

        const settingsChanges: PersistDisabledSkillsBatchResult['settingsChanges'] =
          [];
        if (JSON.stringify(next.disabled) !== JSON.stringify(initialDisabled)) {
          settingsChanges.push({
            key: 'skills.disabled',
            value: next.disabled.length > 0 ? next.disabled : undefined,
          });
        }
        if (JSON.stringify(next.enabled) !== JSON.stringify(initialEnabled)) {
          settingsChanges.push({
            key: 'skills.enabled',
            value: next.enabled.length > 0 ? next.enabled : undefined,
          });
        }
        if (settingsChanges.length > 0) {
          assertGenerationOpen?.();
          fresh.setValues(
            settingsChanges.map((change) => ({
              scope: WORKSPACE_SETTING_SCOPE,
              ...change,
            })),
            undefined,
            assertGenerationOpen,
          );
        }
        return { outcomes, settingsChanges };
      });
    const persistSettingFn = (
      workspace: string,
      scope: import('../config/settings.js').SettingScope,
      key: string,
      value: unknown,
      assertGenerationOpen?: () => void,
    ) =>
      withSettingsLock(workspace, async () => {
        assertGenerationOpen?.();
        const fresh = loadSettingsForPersistence(workspace);
        assertGenerationOpen?.();
        fresh.setValue(scope, key, value, assertGenerationOpen);
        return fresh;
      });
    const persistSettingsFn = (
      workspace: string,
      writes: WorkspaceSettingsWrite[],
      assertGenerationOpen?: () => void,
    ): Promise<void> =>
      withSettingsLock(workspace, async () => {
        assertGenerationOpen?.();
        const fresh = loadSettingsForPersistence(workspace);
        const writesByScope = new Map<
          import('../config/settings.js').SettingScope,
          number
        >();
        for (const write of writes) {
          writesByScope.set(
            write.scope,
            (writesByScope.get(write.scope) ?? 0) + 1,
          );
        }
        const committedScopes = new Set<
          import('../config/settings.js').SettingScope
        >();
        let committed = 0;
        try {
          assertGenerationOpen?.();
          fresh.setValues(
            writes,
            (scope) => {
              committedScopes.add(scope);
              committed += writesByScope.get(scope) ?? 0;
            },
            assertGenerationOpen,
          );
        } catch (err) {
          const failedWrite =
            writes.find((write) => !committedScopes.has(write.scope)) ??
            writes[committed];
          const message = `persistSettings partial failure (workspace=${workspace}, committed=${committed}/${writes.length}, failedKey=${failedWrite?.key ?? '<unknown>'}, failedScope=${failedWrite?.scope ?? '<unknown>'}): ${
            err instanceof Error ? err.message : String(err)
          }`;
          writeStderrLine(`o1-code serve: ${message}`);
          throw new runtime.WorkspaceSettingsPartialPersistError(
            message,
            writes.filter((write) => committedScopes.has(write.scope)),
            err,
          );
        }
      });
    // `create_sub_session` tool: spawn a fresh top-level sub-session on request
    // from a child's agent turn and (for 'first-turn') return its result.
    // Dynamic-imported (not at module scope) so the serve fast-path bundle
    // closure check doesn't trace create-sub-session's transitive deps.
    const [{ createSubSessionLauncher }, scheduledTaskRoutes] =
      await Promise.all([
        import('./create-sub-session.js'),
        import('./routes/scheduled-tasks.js'),
      ]);
    const { sessionAttachmentsRoots } = await import(
      './session-attachments-root.js'
    );
    const createCurrentSessionScheduledTaskHandler =
      (
        workspaceCwd: string,
        runtimeBaseDir: string,
        getBridge: () => AcpSessionBridge | undefined,
        assertGenerationOpen: () => void,
      ): CurrentSessionScheduledTaskCreateHandler =>
      async ({
        callerSessionId,
        cron,
        prompt,
        recurring,
        assertCallerPromptActive,
      }) => {
        const targetBridge = getBridge();
        if (!targetBridge) {
          throw new Error(
            'Current-session scheduling is unavailable while the workspace runtime is starting.',
          );
        }
        const task =
          await scheduledTaskRoutes.createScheduledTaskWithExistingSession(
            {
              workspaceCwd,
              runtimeBaseDir,
              bridge: targetBridge,
              assertGenerationOpen,
              resolveLiveSessionOwner: (sessionId) =>
                workspaceRegistryForPersistence.current === undefined
                  ? { kind: 'unavailable' }
                  : workspaceRegistryForPersistence.current.resolveLiveSessionOwner(
                      sessionId,
                    ),
            },
            {
              sessionId: callerSessionId,
              cron,
              prompt,
              recurring,
            },
            { source: 'cron-tool', assertCallerPromptActive },
          );
        return { id: task.id, cron: task.cron };
      };
    // Late-binds the bridge (constructed just below) via `() => bridgeRef`. Only
    // wired on the daemon-created bridge — an injected `deps.bridge` (embed/test)
    // brings its own options.
    const subSessionLauncher = createSubSessionLauncher({
      getBridge: () => bridgeRef,
      boundWorkspace,
      runtimeBaseDir: primarySessionRuntimeBaseDir,
      ...subSessionConcurrencyCapsFromSettings(
        runtimeBootSettings?.merged.serve ?? {},
      ),
    });
    const attachmentsRoots = sessionAttachmentsRoots(
      boundWorkspace,
      primarySessionRuntimeBaseDir,
    );
    const bridge =
      deps.bridge ??
      runtime.createAcpSessionBridge({
        artifactSnapshotRuntimeBaseDir: primarySessionRuntimeBaseDir,
        sessionAttachmentsRoot: attachmentsRoots.root,
        sessionAttachmentsFallbackRoot: attachmentsRoots.fallback,
        // Reverse tool channel: let `BridgeClient.extMethod` reach the WS
        // connection that hosts a named client MCP server.
        clientMcpSender: clientMcpSenderRegistry.lookup,
        onCreateSubSession: subSessionLauncher.launch,
        onCreateCurrentSessionScheduledTask:
          createCurrentSessionScheduledTaskHandler(
            boundWorkspace,
            primarySessionRuntimeBaseDir,
            () => bridgeRef,
            () => primaryGenerationGuard.assertOpen(),
          ),
        maxSessions: opts.maxSessions,
        ...(opts.restoreAskUserQuestion === true
          ? { restoreAskUserQuestion: true }
          : {}),
        freshSessionAdmission: totalSessionAdmission.admit,
        sessionLifecycle: (event) => {
          if (event.type === 'registered' && primaryGenerationGuard.closed) {
            return;
          }
          sessionOwnerIndex.handleBridgeSessionLifecycle(event);
        },
        ...(opts.maxPendingPromptsPerSession !== undefined
          ? { maxPendingPromptsPerSession: opts.maxPendingPromptsPerSession }
          : {}),
        ...(opts.eventRingSize !== undefined
          ? { eventRingSize: opts.eventRingSize }
          : {}),
        ...(opts.compactedReplayMaxBytes !== undefined
          ? { compactedReplayMaxBytes: opts.compactedReplayMaxBytes }
          : {}),
        ...(opts.maxJournalEvents !== undefined
          ? { maxJournalEvents: opts.maxJournalEvents }
          : {}),
        ...(opts.maxJournalBytes !== undefined
          ? { maxJournalBytes: opts.maxJournalBytes }
          : {}),
        ...(journalGrowthPoolBytes !== undefined
          ? {
              journalGrowthPoolBytes,
              journalGrowthSessionLimits,
              registerJournalGrowthSessionLimits,
            }
          : {}),
        ...(opts.channelIdleTimeoutMs !== undefined
          ? { channelIdleTimeoutMs: opts.channelIdleTimeoutMs }
          : {}),
        ...(opts.initializeTimeoutMs !== undefined
          ? { initializeTimeoutMs: opts.initializeTimeoutMs }
          : {}),
        sessionRestoreTimeoutMs,
        ...(opts.sessionReapIntervalMs !== undefined
          ? { sessionReapIntervalMs: opts.sessionReapIntervalMs }
          : {}),
        ...(opts.sessionIdleTimeoutMs !== undefined
          ? { sessionIdleTimeoutMs: opts.sessionIdleTimeoutMs }
          : {}),
        ...(opts.sessionPromptSettledCloseGraceMs !== undefined
          ? {
              sessionPromptSettledCloseGraceMs:
                opts.sessionPromptSettledCloseGraceMs,
            }
          : {}),
        ...(opts.permissionResponseTimeoutMs !== undefined
          ? { permissionResponseTimeoutMs: opts.permissionResponseTimeoutMs }
          : {}),
        boundWorkspace,
        runtimeEpochSource: runtimeEpochSourceFor(boundWorkspace),
        acquireMcpAuthentication,
        // Prompt terminal ledger: persisted beside the transcript so a
        // restarted daemon can reconcile dangling prompts on cold load.
        promptLedger: runtime.createPromptLedgerSink(
          boundWorkspace,
          primarySessionRuntimeBaseDir,
        ),
        sessionShellCommandEnabled,
        childEnvOverrides,
        channelFactory,
        externalToolGuard: daemonToolGuardHandler,
        onDiagnosticLine: diagnosticSink,
        telemetry: daemonTelemetry,
        ...(permissionPolicy !== undefined ? { permissionPolicy } : {}),
        ...(permissionConsensusQuorum !== undefined
          ? { permissionConsensusQuorum }
          : {}),
        permissionAudit: permissionAuditPublisher,
        statusProvider,
        delegateReadTextFileToClient: false,
        fileSystem: createBridgeFileSystemAdapter(fsFactory, {
          allowSameHostToolWritesOutsideWorkspace: deps.fsFactory === undefined,
        }),
        persistApprovalMode: (workspace, mode) =>
          withSettingsLock(workspace, async () => {
            primaryGenerationGuard.assertOpen();
            if (!trustedWorkspace) {
              throw new Error(
                'Cannot persist approval mode for an untrusted workspace.',
              );
            }
            const fresh = settingsRuntime.settings.loadSettings(workspace, {
              skipLoadEnvironment: true,
              workspaceTrusted: trustedWorkspace,
            });
            primaryGenerationGuard.assertOpen();
            fresh.setValue(
              WORKSPACE_SETTING_SCOPE,
              'tools.approvalMode',
              mode,
              () => primaryGenerationGuard.assertOpen(),
            );
          }),
      });
    if (!deps.bridge) {
      bridgeRef = bridge;
      internalRuntimeBridgesForCleanup.push(bridge);
    }
    runtimeBridges.push(bridge);
    let invalidatePrimaryServeFeaturesCache = () => {};
    const reloadPrimaryDaemonEnv = (
      workspace: string,
      assertGenerationOpen?: () => void,
    ) =>
      withSettingsLock(workspace, async () => {
        assertGenerationOpen?.();
        const fresh = settingsRuntime.settings.loadSettings(workspace, {
          skipLoadEnvironment: true,
          skipWorkspaceSettings: !trustedWorkspace,
          workspaceTrusted: trustedWorkspace,
        });
        assertGenerationOpen?.();
        let refreshedRuntimeEnv: ReturnType<
          EnvironmentRuntime['buildRuntimeEnvironment']
        >;
        try {
          refreshedRuntimeEnv =
            settingsRuntime.environment.buildRuntimeEnvironment(
              fresh.merged,
              workspace,
              daemonRuntimeBaseEnv,
              trustedWorkspace,
            );
        } catch (err) {
          const fallbackReason =
            err instanceof Error ? err.message : String(err);
          primaryRuntimeEnv.fallbackReason = fallbackReason;
          daemonLog.warn(
            'failed to rebuild runtime env snapshot before daemon env reload; preserving previous runtime env',
            {
              error: fallbackReason,
            },
          );
          return {
            updatedKeys: [],
            removedKeys: [],
            runtimeEnvironmentApplied: false,
          };
        }
        logRuntimeEnvFileReadFailures(workspace, refreshedRuntimeEnv);
        if (refreshedRuntimeEnv.envFileReadFailed) {
          return {
            updatedKeys: [],
            removedKeys: [],
            runtimeEnvironmentApplied: false,
          };
        }
        const result = settingsRuntime.settings.reloadEnvironment(
          fresh.merged,
          workspace,
          trustedWorkspace,
          { failClosedOnEnvFileReadError: true },
        );
        if (result.envFileReadFailed) {
          return {
            updatedKeys: [],
            removedKeys: [],
            runtimeEnvironmentApplied: false,
          };
        }
        replaceRuntimeEffectiveEnv(refreshedRuntimeEnv.effectiveEnv);
        primaryRuntimeEnv.workflowsEnabledBySettings =
          fresh.merged.tools?.workflowsEnabled === true;
        delete primaryRuntimeEnv.fallbackReason;
        primaryRuntimeEnv.envFileReadFailed =
          refreshedRuntimeEnv.envFileReadFailed;
        primaryRuntimeEnv.envFileReadFailures.splice(
          0,
          primaryRuntimeEnv.envFileReadFailures.length,
          ...refreshedRuntimeEnv.envFileReadFailures,
        );
        primaryRuntimeEnv.overlayKeys.splice(
          0,
          primaryRuntimeEnv.overlayKeys.length,
          ...refreshedRuntimeEnv.overlayKeys,
        );
        primaryRuntimeEnv.envFilePaths.splice(
          0,
          primaryRuntimeEnv.envFilePaths.length,
          ...refreshedRuntimeEnv.envFilePaths,
        );
        return {
          ...result,
          runtimeEnvironmentApplied: true,
        };
      });
    const workspaceService = runtime.createDaemonWorkspaceService({
      boundWorkspace,
      isWorkspaceTrusted: () => trustedWorkspace,
      assertGenerationOpen: () => primaryGenerationGuard.assertOpen(),
      contextFilename: contextFilenameForInit ?? 'AGENTS.md',
      statusProvider,
      workspaceProvidersStatusProvider,
      workspaceSkillsStatusProvider,
      skillInstallEnv: runtimeEffectiveEnv,
      voiceEnv: runtimeEffectiveEnv,
      isChannelLive: () => bridge.isChannelLive(),
      persistDisabledTools: persistDisabledToolsFn,
      persistDisabledSkills: persistDisabledSkillsFn,
      persistDisabledSkillsBatch: persistDisabledSkillsBatchFn,
      persistSetting: persistSettingFn,
      persistSettings: persistSettingsFn,
      preheatAcpChild: () => bridge.preheat(),
      reloadDaemonEnv: reloadPrimaryDaemonEnv,
      queryWorkspaceStatus: (method, idle) =>
        bridge.queryWorkspaceStatus(method, idle),
      invokeWorkspaceCommand: (method, params, invokeOpts) =>
        bridge.invokeWorkspaceCommand(method, params, invokeOpts),
      refreshExtensionsForAllSessions: () =>
        bridge.refreshExtensionsForAllSessions(),
      publishWorkspaceEvent: (event) => {
        if (
          event.type === 'settings_changed' ||
          event.type === 'settings_reloaded'
        ) {
          invalidatePrimaryServeFeaturesCache();
        }
        bridge.publishWorkspaceEvent(event);
      },
    });

    const workspaceRuntimes: WorkspaceRuntime[] = [
      {
        workspaceId: daemonWorkspaceHash,
        workspaceCwd: boundWorkspace,
        sessionRuntimeBaseDir: primarySessionRuntimeBaseDir,
        ...(workspaceInputs[0]?.displayName
          ? { displayName: workspaceInputs[0].displayName }
          : {}),
        primary: true,
        trusted: trustedWorkspace,
        removable: false,
        registrationIds: workspaceInputs[0]?.registrationIds ?? [],
        env: primaryRuntimeEnv,
        bridge,
        workspaceService,
        routeFileSystemFactory: routeFsFactory,
        clientMcpSenderRegistry,
        generationGuard: primaryGenerationGuard,
        trustMaterialization: primaryTrustMaterialization,
      },
    ];

    const createRuntimeEnvMetadata = (
      workspace: string,
      settings: ReturnType<SettingsRuntime['loadSettings']> | undefined,
      trusted: boolean,
    ): {
      metadata: {
        mode: 'runtime-overlay';
        overlayKeys: string[];
        envFilePaths: string[];
        effectiveEnv: NodeJS.ProcessEnv;
        workflowsEnabledBySettings: boolean;
        envFileReadFailed: boolean;
        envFileReadFailures: Array<{ path: string; error: string }>;
        fallbackReason?: string;
      };
      effectiveEnv: NodeJS.ProcessEnv;
      sessionRuntimeBaseDir: string;
      replace: (nextEnv: Readonly<NodeJS.ProcessEnv>) => void;
    } => {
      const snapshot = settings
        ? settingsRuntime.environment.buildRuntimeEnvironment(
            settings.merged,
            workspace,
            daemonRuntimeBaseEnv,
            trusted,
          )
        : {
            effectiveEnv: { ...daemonRuntimeBaseEnv },
            overlayKeys: Object.freeze([] as string[]),
            envFilePaths: Object.freeze([] as string[]),
            envFileReadFailed: false,
            envFileReadFailures: Object.freeze([]),
          };
      logRuntimeEnvFileReadFailures(workspace, snapshot);
      const sessionRuntimeBaseDir = resolveSessionRuntimeBaseDir(
        workspace,
        settings,
        snapshot.effectiveEnv,
      );
      const effectiveEnv: NodeJS.ProcessEnv = {
        ...snapshot.effectiveEnv,
        O1CODE_RUNTIME_DIR: sessionRuntimeBaseDir,
      };
      const metadata: {
        mode: 'runtime-overlay';
        overlayKeys: string[];
        envFilePaths: string[];
        effectiveEnv: NodeJS.ProcessEnv;
        workflowsEnabledBySettings: boolean;
        envFileReadFailed: boolean;
        envFileReadFailures: Array<{ path: string; error: string }>;
        fallbackReason?: string;
      } = {
        mode: 'runtime-overlay',
        overlayKeys: [...snapshot.overlayKeys],
        effectiveEnv,
        workflowsEnabledBySettings:
          settings?.merged.tools?.workflowsEnabled === true,
        envFilePaths: [...snapshot.envFilePaths],
        envFileReadFailed: snapshot.envFileReadFailed,
        envFileReadFailures: [...snapshot.envFileReadFailures],
      };
      return {
        metadata,
        effectiveEnv,
        sessionRuntimeBaseDir,
        replace(nextEnv) {
          for (const key of Object.keys(effectiveEnv)) {
            delete effectiveEnv[key];
          }
          Object.assign(effectiveEnv, nextEnv);
          effectiveEnv['O1CODE_RUNTIME_DIR'] = sessionRuntimeBaseDir;
        },
      };
    };

    const reloadRuntimeOverlaySnapshotForModelProviders = (
      workspace: string,
      trusted: boolean,
      env: ReturnType<typeof createRuntimeEnvMetadata>,
      assertGenerationOpen?: () => void,
    ) =>
      withSettingsLock(workspace, async () => {
        assertGenerationOpen?.();
        const fresh = settingsRuntime.settings.loadSettings(workspace, {
          skipLoadEnvironment: true,
          skipWorkspaceSettings: !trusted,
          workspaceTrusted: trusted,
        });
        assertGenerationOpen?.();
        let refreshedRuntimeEnv: ReturnType<
          EnvironmentRuntime['buildRuntimeEnvironment']
        >;
        try {
          refreshedRuntimeEnv =
            settingsRuntime.environment.buildRuntimeEnvironment(
              fresh.merged,
              workspace,
              daemonRuntimeBaseEnv,
              trusted,
            );
        } catch (err) {
          env.metadata.fallbackReason =
            err instanceof Error ? err.message : String(err);
          daemonLog.warn(
            'failed to rebuild runtime overlay for model-provider reload; preserving previous runtime env',
            { workspace, error: env.metadata.fallbackReason },
          );
          return {
            updatedKeys: [],
            removedKeys: [],
            runtimeEnvironmentApplied: false,
          };
        }
        logRuntimeEnvFileReadFailures(workspace, refreshedRuntimeEnv);
        if (refreshedRuntimeEnv.envFileReadFailed) {
          return {
            updatedKeys: [],
            removedKeys: [],
            runtimeEnvironmentApplied: false,
          };
        }
        assertGenerationOpen?.();
        try {
          env.replace(refreshedRuntimeEnv.effectiveEnv);
          env.metadata.envFileReadFailed =
            refreshedRuntimeEnv.envFileReadFailed;
          env.metadata.envFileReadFailures.splice(
            0,
            env.metadata.envFileReadFailures.length,
            ...refreshedRuntimeEnv.envFileReadFailures,
          );
          env.metadata.overlayKeys.splice(
            0,
            env.metadata.overlayKeys.length,
            ...refreshedRuntimeEnv.overlayKeys,
          );
          env.metadata.envFilePaths.splice(
            0,
            env.metadata.envFilePaths.length,
            ...refreshedRuntimeEnv.envFilePaths,
          );
          delete env.metadata.fallbackReason;
          return {
            updatedKeys: [],
            removedKeys: [],
            runtimeEnvironmentApplied: true,
          };
        } catch (err) {
          env.metadata.fallbackReason =
            err instanceof Error ? err.message : String(err);
          daemonLog.warn(
            'failed to apply runtime overlay for model-provider reload; preserving previous runtime env',
            { workspace, error: env.metadata.fallbackReason },
          );
          return {
            updatedKeys: [],
            removedKeys: [],
            runtimeEnvironmentApplied: false,
          };
        }
      });

    const readLiveConversationScheduledTasks = async () => {
      if (!fs.existsSync(liveConversationWorkspace.rootPath)) return [];
      const { canonicalRoot } = await liveConversationWorkspace.revalidate();
      let settings: ReturnType<SettingsRuntime['loadSettings']> | undefined;
      try {
        settings = settingsRuntime.settings.loadSettings(canonicalRoot, {
          skipLoadEnvironment: true,
          skipWorkspaceSettings: false,
          workspaceTrusted: true,
        });
      } catch (err) {
        writeStderrLine(
          `o1-code serve: could not read full settings for Conversations ` +
            `(${err instanceof Error ? err.message : String(err)}); falling back to defaults.`,
        );
      }
      const env = createRuntimeEnvMetadata(canonicalRoot, settings, true);
      return core.Storage.runWithResolvedRuntimeBaseDir(
        env.sessionRuntimeBaseDir,
        () => core.readCronTasks(canonicalRoot),
      );
    };

    // Collects stop() callbacks from every per-workspace sub-session launcher
    // (primary + secondaries). Called during shutdown so no new sub-sessions
    // are admitted while bridges are being torn down.
    const subSessionStoppers: Array<() => void> = [];
    const subSessionStoppersByRuntime = new WeakMap<
      WorkspaceRuntime,
      () => void
    >();
    const runtimeCleanupPromises = new WeakMap<
      WorkspaceRuntime,
      Promise<void>
    >();
    const removeArrayValue = <T>(values: T[], value: T): void => {
      const index = values.indexOf(value);
      if (index >= 0) values.splice(index, 1);
    };

    for (const workspaceInput of workspaceInputs.slice(1)) {
      assertExecutionSandboxSupported(
        readOperatorSandboxSettings(),
        'serve workspace runtimes',
      );
      const secondaryDecision = trustPolicy.evaluateDaemonWorkspaceTrust(
        bootTrustSnapshot,
        workspaceInput.cwd,
      );
      const secondaryTrusted = secondaryDecision.targetTrusted;
      let secondarySettings:
        | ReturnType<SettingsRuntime['loadSettings']>
        | undefined;
      try {
        secondarySettings = settingsRuntime.settings.loadSettings(
          workspaceInput.cwd,
          {
            skipLoadEnvironment: true,
            skipWorkspaceSettings: !secondaryTrusted,
            workspaceTrusted: secondaryTrusted,
          },
        );
      } catch (err) {
        if (err instanceof InvalidExecutionSandboxConfigError) throw err;
        writeStderrLine(
          `o1-code serve: could not read full settings for secondary workspace ` +
            `${workspaceInput.cwd} (${err instanceof Error ? err.message : String(err)}); ` +
            `falling back to defaults.`,
        );
      }
      assertExecutionSandboxSupported(
        secondarySettings?.merged ?? {},
        'serve workspace runtimes',
      );
      if (!secondaryTrusted) {
        daemonLog.warn('secondary workspace is not trusted', {
          workspace: workspaceInput.cwd,
          trustSettingsAvailable: secondarySettings !== undefined,
        });
      }
      const secondaryEnv = createRuntimeEnvMetadata(
        workspaceInput.cwd,
        secondarySettings,
        secondaryTrusted,
      );
      const secondaryCustomIgnoreFiles =
        secondarySettings?.merged.context?.fileFiltering?.customIgnoreFiles;
      const secondaryContextFilename =
        extractContextFilename(secondarySettings?.merged.context?.fileName) ??
        contextFilenameForInit ??
        'AGENTS.md';
      const secondaryWorkspaceHash = core.hashDaemonWorkspace(
        workspaceInput.cwd,
      );
      const secondaryGenerationGuard = runtime.createWorkspaceGenerationGuard();
      const secondaryStatusProvider = runtime.createDaemonStatusProvider({
        env: secondaryEnv.effectiveEnv,
      });
      const secondaryBridgeFsFactory = runtime.resolveBridgeFsFactory({
        boundWorkspaces: [workspaceInput.cwd],
        trusted: secondaryTrusted,
        emit: deps.fsAuditEmit,
        pathLocks: sharedPathLocks,
        generationGuard: secondaryGenerationGuard,
        ...(secondaryCustomIgnoreFiles !== undefined
          ? { customIgnoreFiles: secondaryCustomIgnoreFiles }
          : {}),
      });
      const secondaryChannelFactory = runtime.createSpawnChannelFactory({
        processRegistry,
        childHeapPolicy,
        reclaimIdleChild: async (signal) => {
          await idleReclaimerRef.current?.(secondaryWorkspaceHash, signal);
        },
        pipeLimits: runtime.daemonAcpNdJsonLimits,
        sourceEnv: secondaryEnv.effectiveEnv,
        onDiagnosticLine: diagnosticSink,
        pipeHooks: {
          onMessageSent: (bytes) => recordPipeMessage('outbound', bytes),
          onMessageReceived: (bytes) => recordPipeMessage('inbound', bytes),
          onMessageObserved: ({ direction, bytes, message }) =>
            observeLargePipeFrame({
              direction: daemonPipeDirection(direction),
              bytes,
              message,
            }),
          onQueueSaturated: warnAcpQueueSaturated,
        },
        ...(acpChildExtraArgs(opts)
          ? { extraArgs: acpChildExtraArgs(opts) }
          : {}),
      });
      const secondaryClientMcpSenderRegistry = new ClientMcpSenderRegistry();
      // Wire sub-session support for the secondary workspace too — without
      // this, create_sub_session calls from sessions bound to a secondary
      // workspace hit methodNotFound.
      // eslint-disable-next-line prefer-const -- assigned once after bridge creation; `let` required because the launcher closure captures it before the assignment.
      let secondaryBridgeRef:
        | ReturnType<typeof runtime.createAcpSessionBridge>
        | undefined;
      const secondarySubSessionLauncher = createSubSessionLauncher({
        getBridge: () => secondaryBridgeRef,
        boundWorkspace: workspaceInput.cwd,
        runtimeBaseDir: secondaryEnv.sessionRuntimeBaseDir,
        ...subSessionConcurrencyCapsFromSettings(
          secondarySettings?.merged.serve ?? {},
        ),
      });
      const secondaryAttachmentsRoots = sessionAttachmentsRoots(
        workspaceInput.cwd,
        secondaryEnv.sessionRuntimeBaseDir,
      );
      const secondaryBridge = runtime.createAcpSessionBridge({
        artifactSnapshotRuntimeBaseDir: secondaryEnv.sessionRuntimeBaseDir,
        sessionAttachmentsRoot: secondaryAttachmentsRoots.root,
        sessionAttachmentsFallbackRoot: secondaryAttachmentsRoots.fallback,
        clientMcpSender: secondaryClientMcpSenderRegistry.lookup,
        onCreateSubSession: secondarySubSessionLauncher.launch,
        onCreateCurrentSessionScheduledTask:
          createCurrentSessionScheduledTaskHandler(
            workspaceInput.cwd,
            secondaryEnv.sessionRuntimeBaseDir,
            () => secondaryBridgeRef,
            () => secondaryGenerationGuard.assertOpen(),
          ),
        maxSessions: opts.maxSessions,
        ...(opts.restoreAskUserQuestion === true
          ? { restoreAskUserQuestion: true }
          : {}),
        freshSessionAdmission: totalSessionAdmission.admit,
        sessionLifecycle: (event) => {
          if (event.type === 'registered' && secondaryGenerationGuard.closed) {
            return;
          }
          sessionOwnerIndex.handleBridgeSessionLifecycle(event);
        },
        ...(opts.maxPendingPromptsPerSession !== undefined
          ? { maxPendingPromptsPerSession: opts.maxPendingPromptsPerSession }
          : {}),
        ...(opts.eventRingSize !== undefined
          ? { eventRingSize: opts.eventRingSize }
          : {}),
        ...(opts.compactedReplayMaxBytes !== undefined
          ? { compactedReplayMaxBytes: opts.compactedReplayMaxBytes }
          : {}),
        ...(opts.maxJournalEvents !== undefined
          ? { maxJournalEvents: opts.maxJournalEvents }
          : {}),
        ...(opts.maxJournalBytes !== undefined
          ? { maxJournalBytes: opts.maxJournalBytes }
          : {}),
        ...(journalGrowthPoolBytes !== undefined
          ? {
              journalGrowthPoolBytes,
              journalGrowthSessionLimits,
              registerJournalGrowthSessionLimits,
            }
          : {}),
        ...(opts.channelIdleTimeoutMs !== undefined
          ? { channelIdleTimeoutMs: opts.channelIdleTimeoutMs }
          : {}),
        ...(opts.initializeTimeoutMs !== undefined
          ? { initializeTimeoutMs: opts.initializeTimeoutMs }
          : {}),
        sessionRestoreTimeoutMs,
        ...(opts.sessionReapIntervalMs !== undefined
          ? { sessionReapIntervalMs: opts.sessionReapIntervalMs }
          : {}),
        ...(opts.sessionIdleTimeoutMs !== undefined
          ? { sessionIdleTimeoutMs: opts.sessionIdleTimeoutMs }
          : {}),
        ...(opts.sessionPromptSettledCloseGraceMs !== undefined
          ? {
              sessionPromptSettledCloseGraceMs:
                opts.sessionPromptSettledCloseGraceMs,
            }
          : {}),
        ...(opts.permissionResponseTimeoutMs !== undefined
          ? { permissionResponseTimeoutMs: opts.permissionResponseTimeoutMs }
          : {}),
        boundWorkspace: workspaceInput.cwd,
        runtimeEpochSource: runtimeEpochSourceFor(workspaceInput.cwd),
        acquireMcpAuthentication,
        promptLedger: runtime.createPromptLedgerSink(
          workspaceInput.cwd,
          secondaryEnv.sessionRuntimeBaseDir,
        ),
        sessionShellCommandEnabled,
        childEnvOverrides,
        channelFactory: secondaryChannelFactory,
        externalToolGuard: daemonToolGuardHandler,
        onDiagnosticLine: diagnosticSink,
        telemetry: createRuntimeBridgeTelemetry(secondaryWorkspaceHash),
        ...(permissionPolicy !== undefined ? { permissionPolicy } : {}),
        ...(permissionConsensusQuorum !== undefined
          ? {
              permissionConsensusQuorum,
            }
          : {}),
        permissionAudit: permissionAuditPublisher,
        statusProvider: secondaryStatusProvider,
        delegateReadTextFileToClient: false,
        fileSystem: createBridgeFileSystemAdapter(secondaryBridgeFsFactory, {
          allowSameHostToolWritesOutsideWorkspace: true,
        }),
        persistApprovalMode: (workspace, mode) =>
          withSettingsLock(workspace, async () => {
            secondaryGenerationGuard.assertOpen();
            if (!secondaryTrusted) {
              throw new Error(
                'Cannot persist approval mode for an untrusted workspace.',
              );
            }
            const fresh = settingsRuntime.settings.loadSettings(workspace, {
              skipLoadEnvironment: true,
              workspaceTrusted: secondaryTrusted,
            });
            secondaryGenerationGuard.assertOpen();
            fresh.setValue(
              WORKSPACE_SETTING_SCOPE,
              'tools.approvalMode',
              mode,
              () => secondaryGenerationGuard.assertOpen(),
            );
          }),
      });
      secondaryBridgeRef = secondaryBridge;
      runtimeBridges.push(secondaryBridge);
      internalRuntimeBridgesForCleanup.push(secondaryBridge);
      subSessionStoppers.push(secondarySubSessionLauncher.stop);
      const secondaryWorkspaceService = runtime.createDaemonWorkspaceService({
        boundWorkspace: workspaceInput.cwd,
        isWorkspaceTrusted: () => secondaryTrusted,
        assertGenerationOpen: () => secondaryGenerationGuard.assertOpen(),
        contextFilename: secondaryContextFilename,
        statusProvider: secondaryStatusProvider,
        workspaceProvidersStatusProvider:
          runtime.createWorkspaceProvidersStatusProvider({
            env: secondaryEnv.effectiveEnv,
            workspaceTrusted: secondaryTrusted,
          }),
        workspaceSkillsStatusProvider:
          runtime.createWorkspaceSkillsStatusProvider({
            workspaceTrusted: secondaryTrusted,
          }),
        skillInstallEnv: secondaryEnv.effectiveEnv,
        voiceEnv: secondaryEnv.effectiveEnv,
        voiceSettingsScope: WORKSPACE_SETTING_SCOPE,
        isChannelLive: () => secondaryBridge.isChannelLive(),
        preheatAcpChild: () => secondaryBridge.preheat(),
        persistDisabledTools: persistDisabledToolsFn,
        persistDisabledSkills: persistDisabledSkillsFn,
        persistDisabledSkillsBatch: persistDisabledSkillsBatchFn,
        persistSetting: persistSettingFn,
        persistSettings: persistSettingsFn,
        reloadDaemonEnv: (workspace, assertGenerationOpen) =>
          withSettingsLock(workspace, async () => {
            assertGenerationOpen?.();
            const fresh = settingsRuntime.settings.loadSettings(workspace, {
              skipLoadEnvironment: true,
              skipWorkspaceSettings: !secondaryTrusted,
              workspaceTrusted: secondaryTrusted,
            });
            assertGenerationOpen?.();
            let runtimeEnvironmentApplied = false;
            let refreshedRuntimeEnv: ReturnType<
              EnvironmentRuntime['buildRuntimeEnvironment']
            >;
            try {
              refreshedRuntimeEnv =
                settingsRuntime.environment.buildRuntimeEnvironment(
                  fresh.merged,
                  workspace,
                  daemonRuntimeBaseEnv,
                  secondaryTrusted,
                );
            } catch (err) {
              secondaryEnv.metadata.fallbackReason =
                err instanceof Error ? err.message : String(err);
              daemonLog.warn(
                'failed to rebuild secondary runtime env snapshot before daemon env reload; preserving previous runtime env',
                {
                  workspace,
                  error: secondaryEnv.metadata.fallbackReason,
                },
              );
              return {
                updatedKeys: [],
                removedKeys: [],
                runtimeEnvironmentApplied,
              };
            }
            logRuntimeEnvFileReadFailures(workspace, refreshedRuntimeEnv);
            if (refreshedRuntimeEnv.envFileReadFailed) {
              return {
                updatedKeys: [],
                removedKeys: [],
                runtimeEnvironmentApplied: false,
              };
            }
            const result = settingsRuntime.settings.reloadEnvironment(
              fresh.merged,
              workspace,
              secondaryTrusted,
              { failClosedOnEnvFileReadError: true },
            );
            if (result.envFileReadFailed) {
              return {
                updatedKeys: [],
                removedKeys: [],
                runtimeEnvironmentApplied: false,
              };
            }
            try {
              secondaryEnv.replace(refreshedRuntimeEnv.effectiveEnv);
              secondaryEnv.metadata.workflowsEnabledBySettings =
                fresh.merged.tools?.workflowsEnabled === true;
              secondaryEnv.metadata.envFileReadFailed =
                refreshedRuntimeEnv.envFileReadFailed;
              secondaryEnv.metadata.envFileReadFailures.splice(
                0,
                secondaryEnv.metadata.envFileReadFailures.length,
                ...refreshedRuntimeEnv.envFileReadFailures,
              );
              secondaryEnv.metadata.overlayKeys.splice(
                0,
                secondaryEnv.metadata.overlayKeys.length,
                ...refreshedRuntimeEnv.overlayKeys,
              );
              secondaryEnv.metadata.envFilePaths.splice(
                0,
                secondaryEnv.metadata.envFilePaths.length,
                ...refreshedRuntimeEnv.envFilePaths,
              );
              delete secondaryEnv.metadata.fallbackReason;
              runtimeEnvironmentApplied = true;
              return { ...result, runtimeEnvironmentApplied };
            } catch (err) {
              secondaryEnv.metadata.fallbackReason =
                err instanceof Error ? err.message : String(err);
              daemonLog.warn(
                'failed to apply secondary runtime env snapshot after daemon env reload; preserving previous runtime env',
                {
                  workspace,
                  error: secondaryEnv.metadata.fallbackReason,
                },
              );
              return { ...result, runtimeEnvironmentApplied };
            }
          }),
        reloadModelProvidersDaemonEnv: (workspace, assertGenerationOpen) =>
          reloadRuntimeOverlaySnapshotForModelProviders(
            workspace,
            secondaryTrusted,
            secondaryEnv,
            assertGenerationOpen,
          ),
        queryWorkspaceStatus: (method, idle) =>
          secondaryBridge.queryWorkspaceStatus(method, idle),
        invokeWorkspaceCommand: (method, params, invokeOpts) =>
          secondaryBridge.invokeWorkspaceCommand(method, params, invokeOpts),
        refreshExtensionsForAllSessions: () =>
          secondaryBridge.refreshExtensionsForAllSessions(),
        publishWorkspaceEvent: (event) =>
          secondaryBridge.publishWorkspaceEvent(event),
      });
      const secondaryRuntime: WorkspaceRuntime = {
        workspaceId: secondaryWorkspaceHash,
        workspaceCwd: workspaceInput.cwd,
        sessionRuntimeBaseDir: secondaryEnv.sessionRuntimeBaseDir,
        ...(workspaceInput.displayName
          ? { displayName: workspaceInput.displayName }
          : {}),
        primary: false,
        trusted: secondaryTrusted,
        removable: workspaceInput.removable,
        registrationIds: workspaceInput.registrationIds,
        env: secondaryEnv.metadata,
        bridge: secondaryBridge,
        workspaceService: secondaryWorkspaceService,
        routeFileSystemFactory: secondaryBridgeFsFactory,
        clientMcpSenderRegistry: secondaryClientMcpSenderRegistry,
        generationGuard: secondaryGenerationGuard,
        trustMaterialization: JSON.stringify({
          trusted: secondaryTrusted,
          boundWorkspaces: [workspaceInput.cwd],
        }),
      };
      subSessionStoppersByRuntime.set(
        secondaryRuntime,
        secondarySubSessionLauncher.stop,
      );
      workspaceRuntimes.push(secondaryRuntime);
    }

    const workspaceRegistry: WorkspaceRegistry =
      runtime.createWorkspaceRegistry(workspaceRuntimes, {
        sessionOwnerIndex,
        scanUnindexedOwners: deps.bridge !== undefined,
      });
    workspaceRegistryForPersistence.current = workspaceRegistry;
    const workspaceVoiceCoordinator = new WorkspaceVoiceCoordinator();

    core.registerDaemonGaugeCallbacks({
      sessionCount: () =>
        workspaceRegistry
          .listAll()
          .reduce((sum, item) => sum + item.bridge.sessionCount, 0),
      sseCount: () => runtime.getActiveSseCount(),
      heapUsed: () => process.memoryUsage().heapUsed,
    });

    // Start the metrics-ring sampler now that `bridge` exists: seal a bucket
    // every DAEMON_METRICS_SAMPLE_MS, reading memory / active sessions+prompts
    // and a window-scoped event-loop lag p99 (its own histogram, reset each
    // seal so the charted lag is per-interval, not the since-start average the
    // shared monitor reports). `unref()` so sampling never keeps the process
    // alive; torn down by `disposeDaemonEventLoopMonitor`.
    // Retire any prior sampler before building a new one so a runtime rebuild
    // (buildRuntime re-entry) can't leak the old interval + histogram —
    // symmetric with the `daemonEventLoopMonitor?.dispose()` above.
    daemonMetricsSampler?.dispose();
    const metricsLoopDelay = monitorEventLoopDelay({ resolution: 20 });
    metricsLoopDelay.enable();
    // Delta state for the cumulative counters. CPU% = delta CPU-µs over delta
    // wall-ms, normalized by core count (same formula as memoryPressureMonitor);
    // clamped to [0,100] to absorb non-monotonic cpuUsage on some VMs and
    // CPU-bursting. Rate-limit rejects are diffed against the prior total.
    const cpuCoreCount = os.availableParallelism?.() ?? os.cpus().length ?? 1;
    let prevCpu = safeCpuUsage();
    let prevCpuAt = Date.now();
    // undefined until the first tick sets the baseline, so the first sealed
    // window reports 0 rejects instead of the entire since-start backlog as a
    // y-axis-flattening spike.
    let prevRateRejected: number | undefined;
    const metricsSamplerTimer = setInterval(() => {
      const nowMs = Date.now();
      // Read the window lag BEFORE the try: a tick that throws is exactly when
      // the daemon is overloaded and lag is most diagnostic, so the catch path
      // must chart the real accumulated lag, not a misleading 0.
      const eventLoopLagP99Ms = metricsLoopDelay.percentile(99) / 1_000_000;
      try {
        const mem = process.memoryUsage();
        // CPU%: computeCpuPercent returns 0 (and we leave the baseline
        // untouched) when cpuUsage() throws, so a transient failure can't turn
        // the next successful read's since-start total into one giant spike.
        const cpu = safeCpuUsage();
        const cpuPercent = computeCpuPercent(
          prevCpu,
          cpu,
          nowMs - prevCpuAt,
          cpuCoreCount,
        );
        if (cpu) {
          prevCpu = cpu;
          prevCpuAt = nowMs;
        }
        // Connections + rate limiter live on `app` (the createServeApp const
        // just below); read lazily — the first tick is ≥5s out, so the forward
        // reference is assigned by call time. Guard with `?.` (ACP HTTP and the
        // limiter are both toggleable).
        const acp = (
          app.locals?.['acpHandle'] as AcpHttpHandle | undefined
        )?.getSnapshot();
        const hits = getRateLimiter(app)?.getHitCounts();
        const rejectedTotal = hits
          ? hits.prompt + hits.mutation + hits.read
          : 0;
        const rateLimitRejected =
          prevRateRejected === undefined
            ? 0
            : Math.max(0, rejectedTotal - prevRateRejected);
        prevRateRejected = rejectedTotal;
        // ACP child resource: read this tick's cached snapshot synchronously
        // and kick an async refresh for the next tick, keeping the sampler
        // sync. Optional-chained: an injected bridge (RunO1CodeServeDeps.bridge)
        // built against the older contract may not implement these hooks.
        const primaryEntry = workspaceRegistry.primaryEntry;
        const primaryRuntimeBridge =
          primaryEntry.state === 'active'
            ? primaryEntry.current?.runtime.bridge
            : undefined;
        // The ring's `childRssBytes` gauge stays the PRIMARY child's reading —
        // its published meaning is "ACP child process RSS", singular. The
        // aggregate across every workspace is reported separately, under
        // `runtime.memory.children` in daemon status.
        const child = primaryRuntimeBridge?.getChildResourceSnapshot?.();
        // Only poll the child's resources when someone is watching: the
        // staleness guard already drops the reading to 0 when idle, so gating
        // avoids a 5s RPC round-trip (pipe + child CPU) for a chart nobody has
        // open.
        if (runtime.getActiveSseCount() > 0 || (acp?.wsStreams ?? 0) > 0) {
          // Refresh EVERY managed workspace, not just the primary: the caches
          // this warms are what `runtime.memory.children` sums, and a child
          // nobody refreshed reads as unmeasured there. No `isChannelLive`
          // filter is needed — `refreshChildResource` already no-ops without a
          // live channel and is single-flight per bridge.
          for (const managed of workspaceRegistry.listManaged()) {
            // The shipped bridge's `refreshChildResource` never rejects: it
            // catches the RPC failure itself, keeps the last good cache, and
            // tees the reason to the serve debug log — which is why this
            // handler has never fired and why the fan-out cannot turn it into
            // 25 warnings a tick. It stays as a backstop rather than being
            // deleted, because the method is an optional interface member and
            // an `async` one, so any other implementation throwing before its
            // own try block would surface here as an unhandled rejection and
            // take the daemon down.
            //
            // Carrying the workspace matters for exactly that case: an
            // unattributable warning repeated across a 25-workspace fan-out is
            // the shape that is impossible to act on.
            void managed.bridge.refreshChildResource?.().catch((err) => {
              daemonLog.warn('ACP child resource refresh failed', {
                workspaceId: managed.workspaceId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        }
        metricsRing.sample(nowMs, {
          cpuPercent,
          rssBytes: mem.rss,
          heapUsedBytes: mem.heapUsed,
          activeSessions: workspaceRegistry
            .listAll()
            .reduce((sum, item) => sum + item.bridge.sessionCount, 0),
          activePrompts: workspaceRegistry
            .listAll()
            .reduce(
              (sum, item) => sum + (item.bridge.activePromptCount ?? 0),
              0,
            ),
          queuedPrompts: workspaceRegistry
            .listAll()
            .reduce(
              (sum, item) => sum + (item.bridge.pendingPromptTotal ?? 0),
              0,
            ),
          eventLoopLagP99Ms,
          sseConnections: runtime.getActiveSseCount(),
          wsConnections: acp?.wsStreams ?? 0,
          acpConnections: acp?.connectionCount ?? 0,
          rateLimitRejected,
          childCpuPercent: child?.cpuPercent ?? 0,
          childRssBytes: child?.rssBytes ?? 0,
        });
      } catch (err) {
        // A gauge getter threw (e.g. process.memoryUsage() in a restricted
        // container, or a bridge getter mid-teardown). Never let it surface as
        // an uncaughtException that takes down the daemon; seal a zeroed bucket
        // so the timeline stays contiguous rather than silently gapping.
        daemonLog.warn(
          `metrics sampler tick failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        try {
          metricsRing.sample(nowMs, {
            cpuPercent: 0,
            rssBytes: 0,
            heapUsedBytes: 0,
            activeSessions: 0,
            activePrompts: 0,
            queuedPrompts: 0,
            eventLoopLagP99Ms,
            sseConnections: 0,
            wsConnections: 0,
            acpConnections: 0,
            rateLimitRejected: 0,
            childCpuPercent: 0,
            childRssBytes: 0,
          });
        } catch {
          // The ring is pure data; a throw here is unexpected, but never let
          // the fallback path crash the timer either.
        }
      } finally {
        // Reset the window histogram AFTER sampling (or after a failed tick) so
        // a thrown tick can't permanently discard event-loop lag — which would
        // otherwise leave the chart reading a healthy 0ms while the daemon was
        // actually stalling.
        metricsLoopDelay.reset();
      }
    }, DAEMON_METRICS_SAMPLE_MS);
    metricsSamplerTimer.unref();
    daemonMetricsSampler = {
      dispose(): void {
        clearInterval(metricsSamplerTimer);
        metricsLoopDelay.disable();
      },
    };

    // Same lifecycle as the metrics sampler above: retire any prior timer
    // before starting a new one (buildRuntime re-entry), unref'd inside.
    // Dynamic import on purpose: session-pr-refresh statically pulls the
    // SessionService chain (glob et al.), which the serve fast-path bundle
    // closure check forbids in this pre-listen root's static closure.
    sessionPrRefreshTimer?.dispose();
    const refreshGeneration = ++sessionPrRefreshGeneration;
    void import('./server/session-pr-refresh.js')
      .then((mod) => {
        if (refreshGeneration !== sessionPrRefreshGeneration) return;
        sessionPrRefreshTimer = mod.startSessionPrRefreshTimer({
          workspaceRegistry,
          // The coordinator lives on the serve app (createServeApp below),
          // which is built after this timer starts; read it per tick like
          // the metrics sampler reads `acpHandle`.
          getArchiveCoordinator: () =>
            (
              app.locals as {
                sessionArchiveCoordinator?: SessionArchiveCoordinator;
              }
            ).sessionArchiveCoordinator,
        });
      })
      .catch((error) => {
        // Degrade to "no PR-state sweep" instead of leaking an unhandled
        // rejection: the serve fast path installs no process-level
        // unhandledRejection handler before this runs, and Node's default
        // for one is to exit — a failed chunk load (e.g. an in-place
        // upgrade replacing dist/ under the running daemon) would take
        // down every runtime, session, and connection the daemon serves.
        daemonLog.warn(
          `session-pr-refresh load failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    // Factory for dynamically creating workspace runtimes (POST /workspaces).
    interface WorkspaceRuntimeBuildOptions {
      readonly provenance?: WorkspaceRuntimeProvenance;
      readonly trusted?: boolean;
      readonly snapshot?: DaemonTrustPolicySnapshot;
      readonly decision?: DaemonWorkspaceTrustDecision;
      readonly generationGuard?: WorkspaceGenerationGuard;
      readonly primary?: boolean;
      readonly removable?: boolean;
      readonly displayName?: string;
      readonly registrationIds?: readonly string[];
      readonly boundWorkspaces?: readonly string[];
      readonly trustMaterialization?: string;
      readonly validationAttempt?: number;
    }
    const createDynamicWorkspaceRuntime = async (
      cwd: string,
      buildOptions?: WorkspaceRuntimeBuildOptions,
    ): Promise<import('./workspace-registry.js').WorkspaceRuntime> => {
      const provenance = buildOptions?.provenance ?? 'existing';
      // HTTP clients cannot choose provenance. This second boundary prevents a
      // future caller from granting managed trust to an arbitrary directory.
      if (
        provenance === 'managed-scratch' &&
        (!managedScratchRoot ||
          !isManagedScratchChild(cwd, managedScratchRoot.canonicalRoot))
      ) {
        throw new Error(
          'Managed scratch runtime must use an accepted direct child directory',
        );
      }
      if (provenance === 'live-conversation') {
        await liveConversationWorkspace.assertExactRoot(cwd);
      }
      const snapshot =
        buildOptions?.snapshot ??
        (await trustPolicy.readDaemonTrustPolicySnapshot());
      const decision =
        buildOptions?.decision ??
        trustPolicy.evaluateDaemonWorkspaceTrust(snapshot, cwd);
      const trusted =
        provenance === 'managed-scratch' || provenance === 'live-conversation'
          ? true
          : (buildOptions?.trusted ?? decision.targetTrusted);
      assertExecutionSandboxSupported(
        readOperatorSandboxSettings(),
        'serve workspace runtimes',
      );
      let wsSettings: ReturnType<SettingsRuntime['loadSettings']> | undefined;
      try {
        wsSettings = settingsRuntime.settings.loadSettings(cwd, {
          skipLoadEnvironment: true,
          skipWorkspaceSettings: !trusted,
          workspaceTrusted: trusted,
        });
      } catch (err) {
        if (err instanceof InvalidExecutionSandboxConfigError) throw err;
        // Match the startup secondary-workspace path: surface why full settings
        // couldn't be read instead of silently falling back to defaults.
        writeStderrLine(
          `o1-code serve: could not read full settings for dynamic workspace ` +
            `${cwd} (${err instanceof Error ? err.message : String(err)}); ` +
            `falling back to defaults.`,
        );
      }
      assertExecutionSandboxSupported(
        wsSettings?.merged ?? {},
        'serve workspace runtimes',
      );
      const wsEnv = createRuntimeEnvMetadata(cwd, wsSettings, trusted);
      const wsCustomIgnoreFiles =
        wsSettings?.merged.context?.fileFiltering?.customIgnoreFiles;
      const wsContextFilename =
        extractContextFilename(wsSettings?.merged.context?.fileName) ??
        contextFilenameForInit ??
        'AGENTS.md';
      const wsHash = core.hashDaemonWorkspace(cwd);
      const generationGuard =
        buildOptions?.generationGuard ??
        runtime.createWorkspaceGenerationGuard();
      const runtimeBoundWorkspaces = buildOptions?.boundWorkspaces ?? [cwd];
      const wsFsFactory = runtime.resolveBridgeFsFactory({
        boundWorkspaces: runtimeBoundWorkspaces,
        trusted,
        emit: deps.fsAuditEmit,
        pathLocks: sharedPathLocks,
        generationGuard,
        ...(wsCustomIgnoreFiles !== undefined
          ? { customIgnoreFiles: wsCustomIgnoreFiles }
          : {}),
      });
      const wsRouteFsFactory =
        buildOptions?.primary === true && runtimeBoundWorkspaces.length > 1
          ? runtime.resolveBridgeFsFactory({
              boundWorkspaces: [cwd],
              trusted,
              emit: deps.fsAuditEmit,
              pathLocks: sharedPathLocks,
              generationGuard,
              ...(wsCustomIgnoreFiles !== undefined
                ? { customIgnoreFiles: wsCustomIgnoreFiles }
                : {}),
            })
          : wsFsFactory;
      const wsChannelFactory = runtime.createSpawnChannelFactory({
        processRegistry,
        childHeapPolicy,
        reclaimIdleChild: async (signal) => {
          await idleReclaimerRef.current?.(wsHash, signal);
        },
        pipeLimits: runtime.daemonAcpNdJsonLimits,
        sourceEnv: wsEnv.effectiveEnv,
        onDiagnosticLine: diagnosticSink,
        pipeHooks: {
          onMessageSent: (bytes) => recordPipeMessage('outbound', bytes),
          onMessageReceived: (bytes) => recordPipeMessage('inbound', bytes),
          onMessageObserved: ({ direction, bytes, message }) =>
            observeLargePipeFrame({
              direction: daemonPipeDirection(direction),
              bytes,
              message,
            }),
          onQueueSaturated: warnAcpQueueSaturated,
        },
        ...(acpChildExtraArgs(opts)
          ? { extraArgs: acpChildExtraArgs(opts) }
          : {}),
      });
      const wsClientMcpRegistry = new ClientMcpSenderRegistry();
      // eslint-disable-next-line prefer-const
      let wsBridgeRef:
        | ReturnType<typeof runtime.createAcpSessionBridge>
        | undefined;
      const wsSubSessionLauncher = createSubSessionLauncher({
        getBridge: () => wsBridgeRef,
        boundWorkspace: cwd,
        runtimeBaseDir: wsEnv.sessionRuntimeBaseDir,
        ...(provenance === 'live-conversation'
          ? {
              notifySentCompletion: true,
              getStandaloneSessionService: () =>
                (runtimeApp ?? runtimeAppForCleanup)?.locals?.[
                  'standaloneSessionService'
                ],
              isolatedWorkspace: {
                materializeDirectory: (sessionId: string) =>
                  liveConversationWorkspace.materializeConversationDirectory(
                    sessionId,
                  ),
                discardEmptyDirectory: (sessionId: string) =>
                  liveConversationWorkspace.discardEmptyConversationDirectory(
                    sessionId,
                  ),
              },
            }
          : {}),
        ...subSessionConcurrencyCapsFromSettings(
          wsSettings?.merged.serve ?? {},
        ),
      });
      let wsBridge: ReturnType<typeof runtime.createAcpSessionBridge>;
      try {
        const wsAttachmentsRoots = sessionAttachmentsRoots(
          cwd,
          wsEnv.sessionRuntimeBaseDir,
        );
        wsBridge = runtime.createAcpSessionBridge({
          artifactSnapshotRuntimeBaseDir: wsEnv.sessionRuntimeBaseDir,
          sessionAttachmentsRoot: wsAttachmentsRoots.root,
          sessionAttachmentsFallbackRoot: wsAttachmentsRoots.fallback,
          clientMcpSender: wsClientMcpRegistry.lookup,
          onCreateSubSession: wsSubSessionLauncher.launch,
          onCreateCurrentSessionScheduledTask:
            createCurrentSessionScheduledTaskHandler(
              cwd,
              wsEnv.sessionRuntimeBaseDir,
              () => wsBridgeRef,
              () => generationGuard.assertOpen(),
            ),
          maxSessions: opts.maxSessions,
          ...(opts.restoreAskUserQuestion === true
            ? { restoreAskUserQuestion: true }
            : {}),
          freshSessionAdmission: totalSessionAdmission.admit,
          sessionLifecycle: (event) => {
            if (event.type === 'registered' && generationGuard.closed) return;
            sessionOwnerIndex.handleBridgeSessionLifecycle(event);
          },
          ...(opts.maxPendingPromptsPerSession !== undefined
            ? { maxPendingPromptsPerSession: opts.maxPendingPromptsPerSession }
            : {}),
          ...(opts.eventRingSize !== undefined
            ? { eventRingSize: opts.eventRingSize }
            : {}),
          ...(opts.compactedReplayMaxBytes !== undefined
            ? { compactedReplayMaxBytes: opts.compactedReplayMaxBytes }
            : {}),
          ...(opts.maxJournalEvents !== undefined
            ? { maxJournalEvents: opts.maxJournalEvents }
            : {}),
          ...(opts.maxJournalBytes !== undefined
            ? { maxJournalBytes: opts.maxJournalBytes }
            : {}),
          ...(journalGrowthPoolBytes !== undefined
            ? {
                journalGrowthPoolBytes,
                journalGrowthSessionLimits,
                registerJournalGrowthSessionLimits,
              }
            : {}),
          ...(opts.channelIdleTimeoutMs !== undefined
            ? { channelIdleTimeoutMs: opts.channelIdleTimeoutMs }
            : {}),
          ...(opts.initializeTimeoutMs !== undefined
            ? { initializeTimeoutMs: opts.initializeTimeoutMs }
            : {}),
          sessionRestoreTimeoutMs,
          ...(opts.sessionReapIntervalMs !== undefined
            ? { sessionReapIntervalMs: opts.sessionReapIntervalMs }
            : {}),
          ...(opts.sessionIdleTimeoutMs !== undefined
            ? { sessionIdleTimeoutMs: opts.sessionIdleTimeoutMs }
            : {}),
          ...(opts.sessionPromptSettledCloseGraceMs !== undefined
            ? {
                sessionPromptSettledCloseGraceMs:
                  opts.sessionPromptSettledCloseGraceMs,
              }
            : {}),
          ...(opts.permissionResponseTimeoutMs !== undefined
            ? { permissionResponseTimeoutMs: opts.permissionResponseTimeoutMs }
            : {}),
          boundWorkspace: cwd,
          runtimeEpochSource: runtimeEpochSourceFor(cwd),
          acquireMcpAuthentication,
          // Live-conversation workspaces keep transcripts outside the
          // runtime storage layout, so no ledger sink is wired there.
          ...(provenance === 'live-conversation'
            ? {}
            : {
                promptLedger: runtime.createPromptLedgerSink(
                  cwd,
                  wsEnv.sessionRuntimeBaseDir,
                ),
              }),
          sessionShellCommandEnabled,
          // Only the Conversations runtime's children carry the private
          // provenance marker; every other workspace keeps the shared
          // overrides' explicit removal.
          childEnvOverrides:
            provenance === 'live-conversation'
              ? {
                  ...childEnvOverrides,
                  [PRIVATE_CONVERSATIONS_RUNTIME_ENV]:
                    PRIVATE_CONVERSATIONS_RUNTIME_ENABLE,
                }
              : childEnvOverrides,
          channelFactory: wsChannelFactory,
          externalToolGuard: daemonToolGuardHandler,
          onDiagnosticLine: diagnosticSink,
          telemetry: createRuntimeBridgeTelemetry(wsHash),
          ...(permissionPolicy !== undefined ? { permissionPolicy } : {}),
          ...(permissionConsensusQuorum !== undefined
            ? {
                permissionConsensusQuorum,
              }
            : {}),
          permissionAudit: permissionAuditPublisher,
          statusProvider: runtime.createDaemonStatusProvider({
            env: wsEnv.effectiveEnv,
          }),
          delegateReadTextFileToClient: false,
          fileSystem: createBridgeFileSystemAdapter(wsFsFactory, {
            allowSameHostToolWritesOutsideWorkspace: true,
          }),
          persistApprovalMode: (workspace, mode) =>
            withSettingsLock(workspace, async () => {
              generationGuard.assertOpen();
              if (!trusted) {
                throw new Error(
                  'Cannot persist approval mode for an untrusted workspace.',
                );
              }
              const fresh = settingsRuntime.settings.loadSettings(workspace, {
                skipLoadEnvironment: true,
                workspaceTrusted: trusted,
              });
              generationGuard.assertOpen();
              fresh.setValue(
                WORKSPACE_SETTING_SCOPE,
                'tools.approvalMode',
                mode,
                () => generationGuard.assertOpen(),
              );
            }),
        });
      } catch (err) {
        wsSubSessionLauncher.stop();
        throw err;
      }
      wsBridgeRef = wsBridge;
      let wsService: ReturnType<typeof runtime.createDaemonWorkspaceService>;
      try {
        wsService = runtime.createDaemonWorkspaceService({
          boundWorkspace: cwd,
          isWorkspaceTrusted: () => trusted,
          assertGenerationOpen: () => generationGuard.assertOpen(),
          contextFilename: wsContextFilename,
          statusProvider: runtime.createDaemonStatusProvider({
            env: wsEnv.effectiveEnv,
          }),
          workspaceProvidersStatusProvider:
            runtime.createWorkspaceProvidersStatusProvider({
              env: wsEnv.effectiveEnv,
              workspaceTrusted: trusted,
            }),
          workspaceSkillsStatusProvider:
            runtime.createWorkspaceSkillsStatusProvider({
              workspaceTrusted: trusted,
            }),
          skillInstallEnv: wsEnv.effectiveEnv,
          voiceEnv: wsEnv.effectiveEnv,
          ...(buildOptions?.primary === true
            ? {}
            : { voiceSettingsScope: WORKSPACE_SETTING_SCOPE }),
          isChannelLive: () => wsBridge.isChannelLive(),
          preheatAcpChild: () => wsBridge.preheat(),
          persistDisabledTools: persistDisabledToolsFn,
          persistDisabledSkills: persistDisabledSkillsFn,
          persistDisabledSkillsBatch: persistDisabledSkillsBatchFn,
          persistSetting: persistSettingFn,
          persistSettings: persistSettingsFn,
          reloadDaemonEnv: (workspace, assertGenerationOpen) =>
            withSettingsLock(workspace, async () => {
              assertGenerationOpen?.();
              const fresh = settingsRuntime.settings.loadSettings(workspace, {
                skipLoadEnvironment: true,
                skipWorkspaceSettings: !trusted,
                workspaceTrusted: trusted,
              });
              assertGenerationOpen?.();
              // Mirror the startup secondary-workspace path: rebuild the runtime
              // env snapshot and update the metadata so `.env` changes actually
              // propagate to child processes spawned by this workspace's bridge.
              let runtimeEnvironmentApplied = false;
              let refreshedRuntimeEnv: ReturnType<
                EnvironmentRuntime['buildRuntimeEnvironment']
              >;
              try {
                refreshedRuntimeEnv =
                  settingsRuntime.environment.buildRuntimeEnvironment(
                    fresh.merged,
                    workspace,
                    daemonRuntimeBaseEnv,
                    trusted,
                  );
              } catch (err) {
                wsEnv.metadata.fallbackReason =
                  err instanceof Error ? err.message : String(err);
                daemonLog.warn(
                  'failed to rebuild dynamic runtime env snapshot before daemon env reload; preserving previous runtime env',
                  {
                    workspace,
                    error: wsEnv.metadata.fallbackReason,
                  },
                );
                return {
                  updatedKeys: [],
                  removedKeys: [],
                  runtimeEnvironmentApplied,
                };
              }
              logRuntimeEnvFileReadFailures(workspace, refreshedRuntimeEnv);
              if (refreshedRuntimeEnv.envFileReadFailed) {
                return {
                  updatedKeys: [],
                  removedKeys: [],
                  runtimeEnvironmentApplied: false,
                };
              }
              const result = settingsRuntime.settings.reloadEnvironment(
                fresh.merged,
                workspace,
                trusted,
                { failClosedOnEnvFileReadError: true },
              );
              if (result.envFileReadFailed) {
                return {
                  updatedKeys: [],
                  removedKeys: [],
                  runtimeEnvironmentApplied: false,
                };
              }
              try {
                wsEnv.replace(refreshedRuntimeEnv.effectiveEnv);
                wsEnv.metadata.workflowsEnabledBySettings =
                  fresh.merged.tools?.workflowsEnabled === true;
                wsEnv.metadata.envFileReadFailed =
                  refreshedRuntimeEnv.envFileReadFailed;
                wsEnv.metadata.envFileReadFailures.splice(
                  0,
                  wsEnv.metadata.envFileReadFailures.length,
                  ...refreshedRuntimeEnv.envFileReadFailures,
                );
                wsEnv.metadata.overlayKeys.splice(
                  0,
                  wsEnv.metadata.overlayKeys.length,
                  ...refreshedRuntimeEnv.overlayKeys,
                );
                wsEnv.metadata.envFilePaths.splice(
                  0,
                  wsEnv.metadata.envFilePaths.length,
                  ...refreshedRuntimeEnv.envFilePaths,
                );
                delete wsEnv.metadata.fallbackReason;
                runtimeEnvironmentApplied = true;
                return { ...result, runtimeEnvironmentApplied };
              } catch (err) {
                wsEnv.metadata.fallbackReason =
                  err instanceof Error ? err.message : String(err);
                daemonLog.warn(
                  'failed to apply dynamic runtime env snapshot after daemon env reload; preserving previous runtime env',
                  {
                    workspace,
                    error: wsEnv.metadata.fallbackReason,
                  },
                );
                return { ...result, runtimeEnvironmentApplied };
              }
            }),
          ...(buildOptions?.primary === true
            ? {}
            : {
                reloadModelProvidersDaemonEnv: (
                  workspace: string,
                  assertGenerationOpen?: () => void,
                ) =>
                  reloadRuntimeOverlaySnapshotForModelProviders(
                    workspace,
                    trusted,
                    wsEnv,
                    assertGenerationOpen,
                  ),
              }),
          queryWorkspaceStatus: (method, idle) =>
            wsBridge.queryWorkspaceStatus(method, idle),
          invokeWorkspaceCommand: (method, params, invokeOpts) =>
            wsBridge.invokeWorkspaceCommand(method, params, invokeOpts),
          refreshExtensionsForAllSessions: () =>
            wsBridge.refreshExtensionsForAllSessions(),
          publishWorkspaceEvent: (event) => {
            if (
              buildOptions?.primary === true &&
              (event.type === 'settings_changed' ||
                event.type === 'settings_reloaded')
            ) {
              invalidatePrimaryServeFeaturesCache();
            }
            wsBridge.publishWorkspaceEvent(event);
          },
        });
      } catch (err) {
        wsSubSessionLauncher.stop();
        await wsBridge.shutdown().catch(() => {
          try {
            wsBridge.killAllSync();
          } catch {
            // Preserve the workspace-service construction error.
          }
        });
        throw err;
      }
      // Register shared-array cleanup only after the runtime is fully built, so
      // a throw during createDaemonWorkspaceService (or any later step) can't
      // leave an orphaned bridge/channel in the shutdown arrays.
      runtimeBridges.push(wsBridge);
      internalRuntimeBridgesForCleanup.push(wsBridge);
      subSessionStoppers.push(wsSubSessionLauncher.stop);
      const wsRuntime: WorkspaceRuntime = {
        workspaceId: wsHash,
        workspaceCwd: cwd,
        sessionRuntimeBaseDir: wsEnv.sessionRuntimeBaseDir,
        ...(buildOptions?.displayName !== undefined
          ? { displayName: buildOptions.displayName }
          : provenance === 'live-conversation'
            ? { displayName: 'Conversations' }
            : {}),
        primary: buildOptions?.primary ?? false,
        trusted,
        provenance,
        removable:
          buildOptions?.removable ?? provenance !== 'live-conversation',
        registrationIds: [...(buildOptions?.registrationIds ?? [])],
        env: wsEnv.metadata,
        bridge: wsBridge,
        workspaceService: wsService,
        routeFileSystemFactory: wsRouteFsFactory,
        clientMcpSenderRegistry: wsClientMcpRegistry,
        generationGuard,
        trustMaterialization:
          buildOptions?.trustMaterialization ??
          JSON.stringify({
            trusted,
            boundWorkspaces: [...runtimeBoundWorkspaces].sort(),
          }),
      };
      subSessionStoppersByRuntime.set(wsRuntime, wsSubSessionLauncher.stop);
      if (provenance === 'existing' && !buildOptions?.snapshot) {
        const latest = await trustPolicy.readDaemonTrustPolicySnapshot();
        if (latest.revision !== snapshot.revision) {
          generationGuard.close();
          wsSubSessionLauncher.stop();
          await wsBridge
            .shutdown({ reason: 'trust_reconfigured' })
            .catch(() => {
              try {
                wsBridge.killAllSync();
              } catch {
                // Continue removing the stale unpublished runtime.
              }
            });
          subSessionStoppersByRuntime.delete(wsRuntime);
          removeArrayValue(subSessionStoppers, wsSubSessionLauncher.stop);
          removeArrayValue(runtimeBridges, wsBridge);
          removeArrayValue(internalRuntimeBridgesForCleanup, wsBridge);
          if ((buildOptions?.validationAttempt ?? 0) >= 2) {
            throw new Error(
              'Workspace trust policy kept changing during runtime creation.',
            );
          }
          const { generationGuard: _staleGuard, ...retryOptions } =
            buildOptions ?? {};
          return createDynamicWorkspaceRuntime(cwd, {
            ...retryOptions,
            validationAttempt: (buildOptions?.validationAttempt ?? 0) + 1,
          });
        }
      }
      return wsRuntime;
    };

    const serveAppForRuntimeLifecycle: {
      current: Application | undefined;
    } = { current: undefined };
    const workspaceRuntimeRemoval = {
      async runtimeAdded(runtimeAdded: WorkspaceRuntime): Promise<void> {
        const app =
          serveAppForRuntimeLifecycle.current ??
          runtimeApp ??
          runtimeAppForCleanup;
        const startScheduledTaskKeepaliveForWorkspace = app?.locals?.[
          'startScheduledTaskKeepaliveForWorkspace'
        ] as ((runtime: WorkspaceRuntime) => void) | undefined;
        startScheduledTaskKeepaliveForWorkspace?.(runtimeAdded);
      },
      beginDrain(runtimeToDrain: WorkspaceRuntime): void {
        if (runtimeToDrain.primary) {
          if (bridgeRef === runtimeToDrain.bridge) bridgeRef = undefined;
          invalidatePrimaryServeFeaturesCache();
        }
        totalSessionAdmission.beginWorkspaceDrain(runtimeToDrain.workspaceCwd);
        workspaceVoiceCoordinator.beginWorkspaceDrain(runtimeToDrain);
        const app =
          serveAppForRuntimeLifecycle.current ??
          runtimeApp ??
          runtimeAppForCleanup;
        const stopScheduledTaskKeepaliveForWorkspace = app?.locals?.[
          'stopScheduledTaskKeepaliveForWorkspace'
        ] as ((workspaceCwd: string) => void) | undefined;
        try {
          stopScheduledTaskKeepaliveForWorkspace?.(runtimeToDrain.workspaceCwd);
        } catch (err) {
          daemonLog.error(
            'workspace scheduled-task drain error',
            err instanceof Error ? err : null,
          );
        }
      },
      cancelDrain(runtimeToDrain: WorkspaceRuntime): void {
        if (runtimeToDrain.primary && bridgeRef === undefined) {
          bridgeRef = runtimeToDrain.bridge;
          invalidatePrimaryServeFeaturesCache();
        }
        totalSessionAdmission.cancelWorkspaceDrain(runtimeToDrain.workspaceCwd);
        workspaceVoiceCoordinator.cancelWorkspaceDrain(runtimeToDrain);
        const app =
          serveAppForRuntimeLifecycle.current ??
          runtimeApp ??
          runtimeAppForCleanup;
        const startScheduledTaskKeepaliveForWorkspace = app?.locals?.[
          'startScheduledTaskKeepaliveForWorkspace'
        ] as ((runtime: WorkspaceRuntime) => void) | undefined;
        try {
          startScheduledTaskKeepaliveForWorkspace?.(runtimeToDrain);
        } catch (err) {
          daemonLog.error(
            'workspace scheduled-task drain rollback error',
            err instanceof Error ? err : null,
          );
        }
      },
      completeDrain(runtimeToDrain: WorkspaceRuntime): void {
        totalSessionAdmission.completeWorkspaceDrain(
          runtimeToDrain.workspaceCwd,
        );
        workspaceVoiceCoordinator.completeWorkspaceDrain(runtimeToDrain);
      },
      getActivity(runtimeToDrain: WorkspaceRuntime) {
        return {
          pendingSessionStarts: totalSessionAdmission.snapshotForWorkspace(
            runtimeToDrain.workspaceCwd,
          ).inFlight,
          voiceSessions:
            workspaceVoiceCoordinator.getWorkspaceActivity(runtimeToDrain),
        };
      },
      disposeRuntime(
        runtimeToDrain: WorkspaceRuntime,
        reason:
          | 'daemon_shutdown'
          | 'workspace_removed'
          | 'trust_reconfigured' = 'workspace_removed',
      ): Promise<void> {
        const existing = runtimeCleanupPromises.get(runtimeToDrain);
        if (existing) return existing;
        const cleanup = (async () => {
          runtime
            .getWorkspaceRuntimeCoordinatorIfSupported(runtimeToDrain)
            ?.dispose();
          const containmentErrors: Error[] = [];
          try {
            await workspaceVoiceCoordinator.disposeRuntime(
              runtimeToDrain,
              reason,
            );
          } catch (err) {
            daemonLog.error(
              'workspace voice cleanup error',
              err instanceof Error ? err : null,
            );
          }
          if (
            reason === 'trust_reconfigured' &&
            workspaceVoiceCoordinator.getWorkspaceActivity(runtimeToDrain) > 0
          ) {
            containmentErrors.push(
              new Error('Workspace voice sessions are still active.'),
            );
          }
          const stopSubSessions =
            subSessionStoppersByRuntime.get(runtimeToDrain);
          try {
            stopSubSessions?.();
          } catch {
            // Continue to bridge teardown.
          }
          if (reason !== 'daemon_shutdown') {
            const app =
              serveAppForRuntimeLifecycle.current ??
              runtimeApp ??
              runtimeAppForCleanup;
            const stopWorkspaceGitStateForWorkspace = app?.locals?.[
              'stopWorkspaceGitStateForWorkspace'
            ] as ((workspaceCwd: string) => void) | undefined;
            const stopScheduledTaskKeepaliveForWorkspace = app?.locals?.[
              'stopScheduledTaskKeepaliveForWorkspace'
            ] as ((workspaceCwd: string) => void) | undefined;
            const releaseWebTerminalsForWorkspace = app?.locals?.[
              'releaseWebTerminalsForWorkspace'
            ] as ((workspaceCwd: string) => void) | undefined;
            try {
              stopWorkspaceGitStateForWorkspace?.(runtimeToDrain.workspaceCwd);
            } catch (err) {
              daemonLog.error(
                'workspace git-state cleanup error',
                err instanceof Error ? err : null,
              );
            }
            try {
              stopScheduledTaskKeepaliveForWorkspace?.(
                runtimeToDrain.workspaceCwd,
              );
            } catch (err) {
              daemonLog.error(
                'workspace scheduled-task cleanup error',
                err instanceof Error ? err : null,
              );
            }
            try {
              releaseWebTerminalsForWorkspace?.(runtimeToDrain.workspaceCwd);
            } catch (err) {
              daemonLog.error(
                'workspace web-terminal cleanup error',
                err instanceof Error ? err : null,
              );
            }
          }
          let bridgeStopped = false;
          try {
            if (!shutdownBridges.has(runtimeToDrain.bridge)) {
              try {
                await runtimeToDrain.bridge.shutdown({ reason });
              } catch (shutdownError) {
                try {
                  runtimeToDrain.bridge.killAllSync();
                  daemonLog.warn(
                    'workspace bridge required forceful shutdown',
                    {
                      workspace: runtimeToDrain.workspaceCwd,
                      reason,
                      error:
                        shutdownError instanceof Error
                          ? shutdownError.message
                          : String(shutdownError),
                    },
                  );
                } catch (killError) {
                  throw new AggregateError(
                    [shutdownError, killError],
                    'Workspace bridge shutdown could not be confirmed.',
                  );
                }
              }
            }
            bridgeStopped = true;
          } finally {
            if (bridgeStopped) {
              subSessionStoppersByRuntime.delete(runtimeToDrain);
              if (stopSubSessions) {
                removeArrayValue(subSessionStoppers, stopSubSessions);
              }
              removeArrayValue(runtimeBridges, runtimeToDrain.bridge);
              removeArrayValue(
                internalRuntimeBridgesForCleanup,
                runtimeToDrain.bridge,
              );
              shutdownBridges.add(runtimeToDrain.bridge);
            }
          }
          if (containmentErrors.length > 0) {
            throw new AggregateError(
              containmentErrors,
              'Workspace runtime containment could not be confirmed.',
            );
          }
        })();
        runtimeCleanupPromises.set(runtimeToDrain, cleanup);
        void cleanup.catch(() => {
          if (runtimeCleanupPromises.get(runtimeToDrain) === cleanup) {
            runtimeCleanupPromises.delete(runtimeToDrain);
          }
        });
        return cleanup;
      },
    };

    const validateWorkspaceRuntimeForPublication = async (
      runtimeForPublication: WorkspaceRuntime,
    ): Promise<WorkspaceRuntime> => {
      let candidate = runtimeForPublication;
      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = await trustPolicy.readDaemonTrustPolicySnapshot();
        const decision = trustPolicy.evaluateDaemonWorkspaceTrust(
          snapshot,
          candidate.workspaceCwd,
        );
        const materialization = JSON.stringify({
          trusted: decision.targetTrusted,
          boundWorkspaces: [candidate.workspaceCwd],
        });
        if (candidate.trustMaterialization === materialization) {
          return candidate;
        }

        candidate.generationGuard?.close();
        await workspaceRuntimeRemoval.disposeRuntime(
          candidate,
          'trust_reconfigured',
        );
        if (attempt === 2) {
          throw new Error(
            'Workspace trust policy kept changing before runtime publication.',
          );
        }
        candidate = await createDynamicWorkspaceRuntime(
          runtimeForPublication.workspaceCwd,
          {
            primary: runtimeForPublication.primary,
            removable: runtimeForPublication.removable,
            displayName: runtimeForPublication.displayName,
            registrationIds: runtimeForPublication.registrationIds,
          },
        );
      }
      throw new Error('Workspace runtime publication validation failed.');
    };

    const app = runtime.createServeApp(opts, () => actualPort, {
      serveAppLifecycle,
      conversationStableBaseDir,
      workspaceRegistry,
      getSessionBridges: () => runtimeBridges,
      createWorkspaceRuntime: createDynamicWorkspaceRuntime,
      ...(workspaceTrustHotReloadAvailable
        ? {
            validateWorkspaceRuntimeForPublication,
            runWorkspaceTrustOperation,
            getWorkspaceTrustPolicySnapshot: () => latestTrustPolicySnapshot,
          }
        : {}),
      managedScratchRoot,
      liveConversationWorkspace,
      readLiveConversationScheduledTasks,
      workspaceRegistrationStore,
      workspaceRuntimeRemoval,
      workspaceTrustHotReloadAvailable,
      voiceCoordinator: workspaceVoiceCoordinator,
      bridge,
      webShellDir,
      boundWorkspace,
      o1codeVersion: resolvedCliVersion,
      startup,
      // The real long-running daemon keeps scheduled-task sessions resident
      // (keepalive) and reloads them on boot (rehydration). Off by default so
      // direct createServeApp embeds/tests don't spawn sessions.
      manageScheduledTaskSessions: true,
      currentSessionSchedulingAvailable: deps.bridge === undefined,
      fsFactory: routeFsFactory,
      primaryWorkspaceTrusted: trustedWorkspace,
      primaryRuntimeEnv,
      daemonEnv: daemonRuntimeBaseEnv,
      modelSelectionBaseEnv: getEnvironmentBeforeLoad() ?? daemonRuntimeBaseEnv,
      daemonLog,
      isDaemonDraining: () => daemonDraining,
      getPerfSnapshot: () => ({
        eventLoop: currentDaemonEventLoopMonitor.snapshot(),
        promptQueueWait: {
          count: promptQueueWaitStats.count,
          meanMs:
            promptQueueWaitStats.count === 0
              ? 0
              : promptQueueWaitStats.totalMs / promptQueueWaitStats.count,
          maxMs: promptQueueWaitStats.maxMs,
          lastMs: promptQueueWaitStats.lastMs,
        },
        pipe: {
          inbound: { ...pipeStats.inbound },
          outbound: { ...pipeStats.outbound },
        },
      }),
      getMetricsSeries: () => metricsRing.snapshot(),
      getTotalSessionAdmissionSnapshot: totalSessionAdmission.snapshot,
      getChildHeapPolicySnapshot: () => managedChildHeapPolicy?.snapshot(),
      ...(childHeapPolicy
        ? {
            managedChildProcesses: {
              registry: processRegistry,
              policy: childHeapPolicy,
              ownsBridge: (candidate: AcpSessionBridge) =>
                runtimeBridges.includes(candidate),
            },
          }
        : {}),
      recordDaemonRequest: (durationMs, statusCode) =>
        metricsRing.recordRequest(durationMs, statusCode),
      workspace: workspaceService,
      // Reverse tool channel: the SAME registry wired into `bridge` above,
      // so the WS provider and the child-answering bridge share one sender map.
      clientMcpSenderRegistry,
      persistDisabledTools: persistDisabledToolsFn,
      persistDisabledSkills: persistDisabledSkillsFn,
      persistDisabledSkillsBatch: persistDisabledSkillsBatchFn,
      persistSetting: persistSettingFn,
      persistSettings: persistSettingsFn,
      sessionArtifactsPersistenceAvailable:
        sessionArtifactsPersistenceAvailableFromSettings(
          runtimeBootSettings?.merged,
        ),
      updateModelContextWindow: (workspace, key, size, assertGenerationOpen) =>
        withSettingsLock(workspace, async () => {
          assertGenerationOpen();
          const { updateModelContextWindow } = await import(
            './model-configuration.js'
          );
          return updateModelContextWindow(
            loadSettingsForPersistence(workspace),
            key,
            size,
            assertGenerationOpen,
          );
        }),
      installAuthProvider: (req, assertGenerationOpen) =>
        withSettingsLock(
          boundWorkspace,
          async (): Promise<ServeAuthProviderInstallResult> => {
            assertGenerationOpen?.();
            const provider = core.findProviderById(req.providerId);
            if (!provider) {
              throw new Error(`Unsupported auth provider: ${req.providerId}`);
            }
            const inputs = buildProviderSetupInputs(req, provider, {
              getDefaultModelIds: core.getDefaultModelIds,
              resolveBaseUrl: core.resolveBaseUrl,
            });
            const fresh = loadSettingsForPersistence(boundWorkspace);
            const plan = core.buildInstallPlan(
              provider,
              inputs,
              core.getModelsForProviderProtocol(
                fresh.merged.modelProviders,
                inputs.protocol ?? provider.protocol,
                fresh.merged.providerProtocol,
              ),
              {
                authType: fresh.merged.security?.auth?.selectedType,
                id: fresh.merged.model?.name,
                baseUrl: fresh.merged.model?.baseUrl,
              },
            );
            const adapter =
              settingsRuntime.loadedSettingsAdapter.createLoadedSettingsAdapter(
                fresh,
              );
            const { getAuthTypeFromEnv } = await import(
              '../utils/modelConfigUtils.js'
            );
            const hasConversationAuth =
              adapter.getValue('security.auth.selectedType') ||
              getAuthTypeFromEnv(primaryRuntimeEnv.effectiveEnv);
            await core.applyProviderInstallPlan(plan, {
              settings: adapter,
              doRefreshAuth: false,
            });
            assertGenerationOpen?.();
            core.emitDaemonLog('Auth provider installed.', {
              'o1-code.daemon.auth.provider_id': provider.id,
              'o1-code.daemon.auth.auth_type': plan.authType,
            });
            const effectiveModelId =
              (adapter.getValue('model.name') as string | undefined) ??
              plan.modelSelection?.modelId;
            const effectiveBaseUrl =
              (adapter.getValue('model.baseUrl') as string | undefined) ??
              plan.modelSelection?.baseUrl ??
              inputs.baseUrl;
            return {
              v: 1,
              providerId: provider.id,
              providerLabel: provider.label,
              authType: plan.authType,
              ...(effectiveModelId ? { modelId: effectiveModelId } : {}),
              ...(effectiveBaseUrl ? { baseUrl: effectiveBaseUrl } : {}),
              message: !plan.modelSelection
                ? hasConversationAuth
                  ? 'Service models saved.'
                  : 'Service models saved. Configure a conversation model to start chatting.'
                : `Successfully configured ${provider.label}. Use /model to switch models.`,
            };
          },
        ),
    });
    idleReclaimerRef.current = app.locals['reclaimIdleAcp'] as
      | IdleAcpReclaimer
      | undefined;
    serveAppForRuntimeLifecycle.current = app;
    invalidatePrimaryServeFeaturesCache =
      (
        app.locals as {
          invalidateServeFeaturesCache?: () => void;
        }
      ).invalidateServeFeaturesCache ?? invalidatePrimaryServeFeaturesCache;
    // Park the sub-session launcher's stop on app.locals so the close handler
    // can flip it off before tearing down the bridge it spawns into (symmetric
    // with stopScheduledTaskKeepalive). Defensive: a launch during drain would
    // otherwise just fail its spawnOrAttach against the shutting-down bridge.
    (
      app.locals as { subSessionStoppers?: Array<() => void> }
    ).subSessionStoppers = subSessionStoppers;
    subSessionStoppers.push(subSessionLauncher.stop);
    subSessionStoppersByRuntime.set(
      workspaceRegistry.primary,
      subSessionLauncher.stop,
    );
    if (workspaceTrustHotReloadAvailable) {
      const [
        { createWorkspaceTrustReconciler },
        { createDaemonTrustPolicyMonitor },
      ] = await Promise.all([
        import('./workspace-trust-reconciler.js'),
        import('../config/daemon-trust-policy-monitor.js'),
      ]);
      const materializationFor = (
        entry: import('./workspace-registry.js').WorkspaceEntry,
        snapshot: DaemonTrustPolicySnapshot,
        decision: DaemonWorkspaceTrustDecision,
      ): { key: string; boundWorkspaces: readonly string[] } => {
        const boundWorkspaces =
          entry.primary && decision.targetTrusted
            ? runtime.resolveBoundWorkspacesFromIdeEnv(
                entry.workspaceCwd,
                undefined,
                (workspace: string, index: number) =>
                  index === 0 ||
                  trustPolicy.evaluateDaemonWorkspaceTrust(snapshot, workspace)
                    .targetTrusted,
              )
            : [entry.workspaceCwd];
        return {
          key: JSON.stringify({
            trusted: decision.targetTrusted,
            boundWorkspaces: [...boundWorkspaces].sort(),
          }),
          boundWorkspaces,
        };
      };
      const acpHandle = () =>
        app.locals?.['acpHandle'] as AcpHttpHandle | undefined;
      const trustReconciler = createWorkspaceTrustReconciler({
        registry: workspaceRegistry,
        readLatestSnapshot: trustPolicy.readDaemonTrustPolicySnapshot,
        materializationKey: ({ entry, snapshot, decision }) =>
          materializationFor(entry, snapshot, decision).key,
        isTrustDecrease: ({
          runtime: current,
          nextMaterialization,
          decision,
        }) => {
          if (current.trusted && !decision.targetTrusted) return true;
          if (!current.primary || !current.trusted) return false;
          try {
            const previous = JSON.parse(
              current.trustMaterialization ?? '{}',
            ) as {
              boundWorkspaces?: unknown;
            };
            const next = JSON.parse(nextMaterialization) as {
              boundWorkspaces?: unknown;
            };
            if (
              !Array.isArray(previous.boundWorkspaces) ||
              !Array.isArray(next.boundWorkspaces)
            ) {
              return true;
            }
            const nextRoots = new Set(
              next.boundWorkspaces.filter(
                (value): value is string => typeof value === 'string',
              ),
            );
            return previous.boundWorkspaces.some(
              (value) => typeof value !== 'string' || !nextRoots.has(value),
            );
          } catch {
            return true;
          }
        },
        buildRuntime: async ({
          entry,
          trusted,
          snapshot,
          decision,
          generationGuard,
        }) => {
          const materialized = materializationFor(
            entry,
            snapshot,
            trusted === decision.targetTrusted
              ? decision
              : { ...decision, targetTrusted: trusted },
          );
          return createDynamicWorkspaceRuntime(entry.workspaceCwd, {
            trusted,
            snapshot,
            decision,
            generationGuard,
            primary: entry.primary,
            removable: entry.removable,
            displayName: entry.displayName,
            registrationIds: entry.registrationIds,
            boundWorkspaces: materialized.boundWorkspaces,
            trustMaterialization: materialized.key,
          });
        },
        drainRuntime: async (runtimeToDrain) => {
          workspaceRuntimeRemoval.beginDrain(runtimeToDrain);
          acpHandle()?.beginWorkspaceDrain(runtimeToDrain.workspaceId);
        },
        disposeRuntime: async (runtimeToDispose, reason) => {
          const errors: unknown[] = [];
          try {
            await workspaceRuntimeRemoval.disposeRuntime(
              runtimeToDispose,
              reason,
            );
          } catch (error) {
            errors.push(error);
          }
          try {
            const handle = acpHandle();
            if (!runtimeToDispose.primary) {
              handle?.commitWorkspaceRemoval(runtimeToDispose.workspaceId);
            }
            handle?.disposeWorkspace(runtimeToDispose.workspaceId);
            const deadline = Date.now() + 1000;
            while (
              (handle?.getWorkspaceActivity(runtimeToDispose.workspaceId)
                .memoryTasks ?? 0) > 0 &&
              Date.now() < deadline
            ) {
              await new Promise((resolve) => setTimeout(resolve, 25));
            }
            if (
              (handle?.getWorkspaceActivity(runtimeToDispose.workspaceId)
                .memoryTasks ?? 0) > 0
            ) {
              throw new Error(
                'Workspace memory tasks did not stop after runtime disposal.',
              );
            }
          } catch (error) {
            errors.push(error);
          }
          if (errors.length === 1) throw errors[0];
          if (errors.length > 1) {
            throw new AggregateError(
              errors,
              'Workspace runtime and ACP cleanup failed.',
            );
          }
        },
        runtimeActivated: async (runtimeAdded) => {
          workspaceRuntimeRemoval.cancelDrain(runtimeAdded);
          acpHandle()?.cancelWorkspaceDrain(runtimeAdded.workspaceId);
          if (runtimeAdded.primary) {
            bridgeRef = runtimeAdded.bridge;
            invalidatePrimaryServeFeaturesCache();
          }
          await workspaceRuntimeRemoval.runtimeAdded(runtimeAdded);
        },
        onError: (entry, error) => {
          daemonLog.error(
            `workspace trust reconciliation failed for ${entry.workspaceCwd}`,
            error instanceof Error ? error : null,
          );
        },
      });
      const trustMonitor = createDaemonTrustPolicyMonitor({
        onSnapshot: (snapshot) => {
          latestTrustPolicySnapshot = snapshot;
          return runWorkspaceTrustOperation(() =>
            trustReconciler.reconcile(snapshot),
          );
        },
        onError: (error) => {
          daemonLog.error(
            'workspace trust policy monitor failed',
            error instanceof Error ? error : null,
          );
        },
      });
      (
        app.locals as {
          stopTrustPolicyMonitor?: () => void;
          requestTrustReconcile?: () => Promise<void>;
          waitForTrustPolicyIdle?: () => Promise<void>;
        }
      ).stopTrustPolicyMonitor = () => trustMonitor.stop();
      (
        app.locals as {
          requestTrustReconcile?: () => Promise<void>;
        }
      ).requestTrustReconcile = () => trustMonitor.requestReconcile('manual');
      (
        app.locals as {
          waitForTrustPolicyIdle?: () => Promise<void>;
        }
      ).waitForTrustPolicyIdle = () =>
        runWorkspaceTrustOperation(async () => undefined);
      await trustMonitor.start();
    }
    const activePrimaryBridge =
      workspaceRegistry.primaryEntry.current?.runtime.bridge;
    bridgeRef = activePrimaryBridge;
    return { app, bridge: activePrimaryBridge };
  };

  if (deps.bridge) {
    const runtime = await buildRuntime();
    runtimeAppForCleanup = runtime.app;
    bridgeRef = runtime.bridge;
    runtimeApp = runtime.app;
    runtimeStartupSettled = true;
    markRuntimeReady();
  }

  cliVersion ??= await cliVersionPromise;

  const bootstrapApp = createBootstrapServeApp({
    opts,
    getPort: () => actualPort,
    boundWorkspace,
    startup,
    daemonLog,
    o1codeVersion: cliVersion,
    sessionShellCommandEnabled,
    sessionArtifactsPersistenceAvailable,
    workspaceRuntimeAvailable:
      deps.bridge === undefined ||
      typeof deps.bridge.getWorkspaceRuntimeLifecycleSnapshot === 'function',
    currentSessionSchedulingAvailable: false,
    permissionPolicy,
    multiWorkspaceCapabilitiesRequireRuntime: workspaceInputs.length > 1,
    getRuntimeError: () => runtimeStartupError,
    onHealthServed: deferRuntimeUntilFirstHealth
      ? () => startRuntimeAfterHealth?.()
      : undefined,
  });
  const app =
    runtimeApp ??
    createDelegatingServeApp(bootstrapApp, () => runtimeApp, {
      waitForDeferredRuntimeRoutes: deferRuntimeUntilFirstHealth,
      startRuntime: () => startRuntimeForRequest?.() ?? false,
      runtimeReady,
      authenticateDeferredRuntimeRequest: bearerAuth(opts.token),
      // The runtime app serves these before bearerAuth; a browser navigation
      // cannot attach the bearer header, so the cold gate must let them
      // through (and start the runtime) exactly like the warm app would.
      // Dynamic import keeps web-shell-static out of the serve fast-path
      // static closure (see the import-boundary guards in fast-path.test.ts).
      isPreAuthRequest: webShellMounted
        ? (req) =>
            import('./web-shell-static.js').then((webShellStatic) =>
              webShellStatic.isPreAuthWebShellRequest(req),
            )
        : undefined,
    });

  // Node's `app.listen()` wants the unbracketed IPv6 literal (`::1`) but
  // operators conventionally type `[::1]` (or copy/paste from URLs that
  // need the brackets to disambiguate the port). Strip brackets at
  // bind-time, keep them for the printed URL — without this fixup
  // `o1-code serve --hostname [::1]` would pass the loopback/token check
  // and then fail to start with ENOTFOUND.
  //
  // Only accept *pure* bracketed forms: `[…]` with no trailing `:port`
  // suffix. `[2001:db8::1]:8080` is operator-error (port goes through
  // `--port`, not the hostname) — fail loudly with a useful error
  // instead of silently stripping to a malformed `2001:db8::1]:8080`.
  let listenHostname = opts.hostname;
  if (opts.hostname.startsWith('[')) {
    const inner = opts.hostname.slice(1, -1);
    if (
      !opts.hostname.endsWith(']') ||
      inner.length === 0 ||
      inner.includes(']')
    ) {
      throw new Error(
        `Invalid --hostname "${opts.hostname}": brackets indicate an ` +
          `IPv6 literal but the value isn't a clean [addr] form. Pass the ` +
          `address without a trailing :port (use --port for that), e.g. ` +
          `"--hostname [::1] --port 4170".`,
      );
    }
    // Empty brackets `[]` would have stripped to `''`, which Node treats
    // as "bind to all interfaces" — the operator's intent was specific,
    // not wildcard. The check above (`inner.length === 0`) rejects.
    listenHostname = inner;
  }

  // Validate maxConnections BEFORE binding so a typo fails the
  // promise instead of escaping as an uncaught exception inside the
  // listen callback (which fires from the `listening` event after the
  // outer promise has already resolved). Silent fail-OPEN on NaN /
  // negative would weaken the DoS/FD-exhaustion guard the cap exists
  // for.
  if (
    opts.maxConnections !== undefined &&
    (Number.isNaN(opts.maxConnections) || opts.maxConnections < 0)
  ) {
    throw new TypeError(
      `Invalid maxConnections: ${opts.maxConnections}. Must be >= 0 ` +
        `(0 / Infinity = unlimited).`,
    );
  }

  return await new Promise<RunHandle>((resolve, reject) => {
    // When TLS is configured, wrap the Express app in an HTTPS listener
    // (`https.Server extends http.Server`, so everything downstream —
    // `server.maxConnections`, `server.address()`, `attachServer(server)`,
    // graceful close — is unchanged). Plain HTTP uses the same explicitly
    // lifecycle-bound server shape.
    let closeHost: (() => Promise<void>) | undefined;
    const onListening = (error?: Error) => {
      // Error handling (retry/reject) is owned by tryListen's
      // server.once('error') handler.
      if (error) return;

      startup.listenerReadyAt = new Date().toISOString();
      startup.processToListenMs = Math.round(process.uptime() * 1000);
      startup.runO1CodeServeToListenMs = Math.round(
        performance.now() - runStartedAt,
      );
      profileCheckpoint('serve_listener_ready');
      finalizeStartupProfile(`serve-${process.pid}`);

      // Listener-level connection cap, set inside the listen callback after
      // Node has opened the underlying `Server`. Each session's `EventBus`
      // already refuses to admit more than `DEFAULT_MAX_SUBSCRIBERS` (64), but
      // an attacker can still open *connections* that never finish
      // their headers, never reach the bus, and just sit consuming
      // socket descriptors. The default of 256 leaves room for many
      // sessions × many legitimate clients while keeping the FD count
      // bounded; operators with high-concurrency deployments raise it
      // via `--max-connections`.
      //
      // `0` and `Infinity` are operator-visible
      // "disable the cap" sentinels — but on Node 22 setting
      // `server.maxConnections = 0` causes the listener to refuse
      // EVERY connection (verified on v22.15.0: every fetch fails
      // with `SocketError: other side closed`). Treat 0 / Infinity
      // as "leave the property unset" so the documented disable
      // path actually disables instead of silently bricking the
      // daemon. NaN / negative are rejected upstream so
      // they never reach here.
      const cap = opts.maxConnections ?? 256;
      if (cap > 0 && Number.isFinite(cap)) {
        server.maxConnections = cap;
      }
      // else: leave unset (Node's default = unlimited at this layer).
      const addr = server.address();
      actualPort = typeof addr === 'object' && addr ? addr.port : opts.port;
      const scheme = tlsOptions ? 'https' : 'http';
      const url = `${scheme}://${formatHostForUrl(optsIn.hostname)}:${actualPort}`;
      let shuttingDown = false;
      let closePromise: Promise<void> | undefined;
      let runtimeStartupTimer: NodeJS.Timeout | undefined;
      let runtimeStartAfterHealthTimer: NodeJS.Timeout | undefined;
      let runtimeStartFallbackTimer: NodeJS.Timeout | undefined;
      const runtimeStartupTimeoutMs = resolveRuntimeStartupTimeoutMs(
        deps.runtimeStartupTimeoutMs,
      );
      const clearRuntimeStartupTimer = (): void => {
        if (!runtimeStartupTimer) return;
        clearTimeout(runtimeStartupTimer);
        runtimeStartupTimer = undefined;
      };
      const clearRuntimeStartFallbackTimer = (): void => {
        if (!runtimeStartFallbackTimer) return;
        clearTimeout(runtimeStartFallbackTimer);
        runtimeStartFallbackTimer = undefined;
      };
      const clearRuntimeStartAfterHealthTimer = (): void => {
        if (!runtimeStartAfterHealthTimer) return;
        clearTimeout(runtimeStartAfterHealthTimer);
        runtimeStartAfterHealthTimer = undefined;
      };
      const cancelDeferredRuntimeStartup = (): void => {
        if (
          !deferRuntimeUntilFirstHealth ||
          runtimeStarting ||
          runtimeStartupSettled
        )
          return;
        daemonLog.info(
          'deferred runtime: cancelled, server closed before startup',
        );
        runtimeStartupSettled = true;
        const error = new Error(RUNTIME_STARTUP_CANCELLED_MESSAGE);
        runtimeStartupError = error.message;
        markRuntimeFailed(error);
      };
      const shutdownBridgeAfterFailedStartup = async (
        bridge: AcpSessionBridge | undefined,
      ): Promise<void> => {
        if (!bridge || deps.bridge) return;
        if (shutdownBridges.has(bridge)) return;
        shutdownBridges.add(bridge);
        try {
          await bridge.shutdown();
        } catch (shutdownErr) {
          daemonLog.error(
            'bridge shutdown after runtime startup error failed',
            shutdownErr instanceof Error ? shutdownErr : null,
          );
        } finally {
          if (bridgeRef === bridge) {
            bridgeRef = undefined;
          }
        }
      };
      const failRuntimeStartup = async (
        err: unknown,
        bridgeForCleanup?: AcpSessionBridge,
      ): Promise<void> => {
        const error = err instanceof Error ? err : new Error(String(err));
        markServeAppStartupFailed(error);
        if (runtimeStartupSettled) {
          disposeRuntimeAppResources(runtimeApp ?? runtimeAppForCleanup);
          await shutdownBridgeAfterFailedStartup(bridgeForCleanup);
          return;
        }
        runtimeStartupSettled = true;
        disposeRuntimeAppResources(runtimeApp ?? runtimeAppForCleanup);
        runtimeApp = undefined;
        clearRuntimeStartupTimer();
        const message = error.message;
        runtimeStartupError = message;
        if (
          startup.preheat.status === 'scheduled' ||
          startup.preheat.status === 'running'
        ) {
          startup.preheat.status = 'failed';
          startup.preheat.error = message;
        }
        writeStderrLine(`o1-code serve: runtime startup failed: ${message}`);
        daemonLog.error('runtime startup failed', error);
        markRuntimeFailed(error);
        disposeDaemonEventLoopMonitor();
        const bridgesForCleanup = bridgeForCleanup
          ? [bridgeForCleanup, ...getRuntimeBridgesForCleanup()]
          : getRuntimeBridgesForCleanup();
        for (const bridge of [...new Set(bridgesForCleanup)]) {
          await shutdownBridgeAfterFailedStartup(bridge);
        }
      };
      const armRuntimeStartupTimer = (): void => {
        if (runtimeStartupTimeoutMs <= 0 || runtimeStartupTimer) return;
        runtimeStartupTimer = setTimeout(() => {
          const timeoutError = new Error(
            `Daemon runtime startup timed out after ${runtimeStartupTimeoutMs}ms.`,
          );
          void failRuntimeStartup(timeoutError);
        }, runtimeStartupTimeoutMs);
        runtimeStartupTimer.unref();
      };
      const completeRuntimeStartup = async (
        candidateApp: Application,
      ): Promise<void> => {
        if (runtimeStartupSettled) return;
        runtimeApp = candidateApp;
        const acpHandle = candidateApp.locals?.['acpHandle'] as
          | AcpHttpHandle
          | undefined;
        acpHandle?.attachServer?.(server);
        if (runtimeStartupSettled) return;
        markServeAppStartupReady();
        runtimeStartupSettled = true;
        clearRuntimeStartupTimer();
        markRuntimeReady();
      };
      const scheduleWorkspaceMcpDiscoveryAfterPreheat = (
        app: Application,
      ): void => {
        if (runtimeStartupError !== undefined) {
          daemonLog.info(
            'workspace runtime ensure after preheat skipped: runtime startup failed',
          );
          return;
        }
        if (shuttingDown) {
          daemonLog.info(
            'workspace runtime ensure after preheat skipped: shutting down',
          );
          return;
        }
        const registry = app.locals?.['workspaceRegistry'] as
          | WorkspaceRegistry
          | undefined;
        const primaryEntry = registry?.primaryEntry;
        const runtime =
          primaryEntry?.state === 'active'
            ? primaryEntry.current?.runtime
            : undefined;
        if (!runtime) {
          daemonLog.info(
            'workspace runtime ensure after preheat skipped: no primary runtime',
          );
          return;
        }
        const coordinator =
          getWorkspaceRuntimeCoordinatorIfSupported?.(runtime);
        if (!coordinator) {
          daemonLog.info(
            'workspace runtime ensure after preheat skipped: ' +
              'workspace runtime lifecycle is not supported',
          );
          return;
        }
        void coordinator
          .ensure({ keepAliveMs: ENSURE_KEEP_ALIVE_MS })
          .catch((err) => {
            if (shuttingDown || runtimeStartupError !== undefined) {
              return;
            }
            daemonLog.warn(
              `workspace runtime ensure after preheat failed: ${deepestErrorMessage(err)}`,
            );
          });
      };
      const startBridgePreheat = (
        bridge: AcpSessionBridge,
        app: Application,
      ): void => {
        startup.preheat.status = 'running';
        const preheatStartedAt = performance.now();
        bridge
          .preheat()
          .then(() => {
            startup.preheat.status = 'succeeded';
            startup.preheat.durationMs = Math.round(
              performance.now() - preheatStartedAt,
            );
            scheduleWorkspaceMcpDiscoveryAfterPreheat(app);
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            startup.preheat.status = 'failed';
            startup.preheat.durationMs = Math.round(
              performance.now() - preheatStartedAt,
            );
            startup.preheat.error = message;
            writeStderrLine(
              `o1-code serve: ACP preheat failed, will retry on first session: ${message}`,
            );
          });
      };
      const startRuntime = (): boolean => {
        if (runtimeStarting) return false;
        armRuntimeStartupTimer();
        clearRuntimeStartAfterHealthTimer();
        clearRuntimeStartFallbackTimer();
        runtimeStarting = buildRuntime()
          .then(async (runtime) => {
            if (runtimeStartupSettled) {
              disposeRuntimeAppResources(runtime.app);
              await shutdownBridgeAfterFailedStartup(runtime.bridge);
              return;
            }
            bridgeRef = runtime.bridge;
            runtimeAppForCleanup = runtime.app;
            if (shuttingDown) {
              await failRuntimeStartup(
                new Error('Daemon runtime stopped before mounting.'),
                runtime.bridge,
              );
              return;
            }
            if (shouldPreheat && runtime.bridge) {
              startBridgePreheat(runtime.bridge, runtime.app);
            }
            await completeRuntimeStartup(runtime.app);
          })
          .catch((err) => failRuntimeStartup(err));
        return true;
      };
      startRuntimeForRequest = startRuntime;
      const scheduleRuntimeStartFallback = (): void => {
        if (shuttingDown || runtimeStarting || runtimeStartFallbackTimer)
          return;
        daemonLog.info(
          `deferred runtime: scheduling fallback start in ${FAST_PATH_RUNTIME_START_FALLBACK_MS}ms`,
        );
        runtimeStartFallbackTimer = setTimeout(() => {
          runtimeStartFallbackTimer = undefined;
          if (shuttingDown) return;
          daemonLog.info('deferred runtime: fallback timer fired, starting');
          startRuntime();
        }, FAST_PATH_RUNTIME_START_FALLBACK_MS);
        runtimeStartFallbackTimer.unref();
      };
      startRuntimeAfterHealth = (): void => {
        if (shuttingDown || runtimeStarting || runtimeStartAfterHealthTimer) {
          return;
        }
        clearRuntimeStartFallbackTimer();
        daemonLog.info(
          `deferred runtime: health served, scheduling start in ${FAST_PATH_RUNTIME_START_AFTER_HEALTH_MS}ms`,
        );
        runtimeStartAfterHealthTimer = setTimeout(() => {
          runtimeStartAfterHealthTimer = undefined;
          if (shuttingDown) return;
          daemonLog.info('deferred runtime: health timer fired, starting');
          startRuntime();
        }, FAST_PATH_RUNTIME_START_AFTER_HEALTH_MS);
        runtimeStartAfterHealthTimer.unref();
      };

      // Forward declaration so handle.close can detach the listener after
      // drain completes. The handler is registered just before `resolve()`.
      const onSignal = async (signal: NodeJS.Signals) => {
        if (shuttingDown) {
          // Second signal forces exit. During drain (up to
          // ~15s for a stuck child + the 5s force-close timer) an
          // operator's reflexive `^C^C` would otherwise be dropped.
          // Match standard daemon behavior (nginx, redis, etc.):
          // first signal = graceful drain; second = hard exit.
          //
          // Synchronously SIGKILL every live `o1-code --acp`
          // child BEFORE `process.exit(1)`. Otherwise the daemon
          // vanishes but its child processes keep running with
          // dangling stdin/stdout pipes — visible as orphan
          // `o1-code` processes in the operator's `ps` output.
          daemonLog.warn(`received ${signal} during drain — forcing exit`);
          try {
            managedProcessRegistry?.killAllSync();
            for (const runtimeBridge of getRuntimeBridgesForCleanup()) {
              runtimeBridge.killAllSync();
            }
          } catch (err) {
            daemonLog.error(
              'force-kill error',
              err instanceof Error ? err : null,
            );
          }
          await flushDaemonLogBounded(
            daemonLog,
            DAEMON_LOG_FORCED_FLUSH_BUDGET_MS,
          );
          process.exit(1);
          return;
        }
        if (!loggerPublished) {
          loggerSignalOwned = true;
          loggerLifecycle.signalOwned();
        }
        daemonLog.warn(`received ${signal}, draining`);
        try {
          await handle.close();
          process.exit(runtimeStartupError === undefined ? 0 : 1);
        } catch (err) {
          daemonLog.error('shutdown error', err instanceof Error ? err : null);
          await flushDaemonLogBounded(
            daemonLog,
            DAEMON_LOG_FORCED_FLUSH_BUDGET_MS,
          );
          process.exit(1);
        }
      };
      const handle: RunHandle = {
        server,
        url,
        bridge: handleBridge,
        webShellMounted,
        resolvedToken: token,
        runtimeReady,
        getLocalControl: () =>
          (runtimeApp ?? runtimeAppForCleanup)?.locals?.[
            'localControlService'
          ] as LocalControlService | undefined,
        close: () => {
          // Idempotent: cache the in-flight (or settled) close promise so
          // overlapping calls (e.g. test harness + signal handler firing
          // simultaneously) all observe the same drain cycle. Without this
          // each caller would arm its own force-close timer + invoke
          // bridge.shutdown / server.close redundantly.
          if (closePromise) return closePromise;
          closePromise = new Promise<void>((res, rej) => {
            shuttingDown = true;
            daemonDraining = true;
            const initiallyMountedApp = runtimeApp ?? runtimeAppForCleanup;
            const beginRuntimeCoordinatorDrains = (
              app: typeof initiallyMountedApp,
            ): void => {
              const registry = app?.locals?.['workspaceRegistry'] as
                | WorkspaceRegistry
                | undefined;
              for (const workspaceRuntime of registry?.list() ?? []) {
                getWorkspaceRuntimeCoordinatorIfSupported?.(
                  workspaceRuntime,
                )?.beginDrain();
              }
            };
            beginRuntimeCoordinatorDrains(initiallyMountedApp);
            const initiallyMountedManagement = initiallyMountedApp?.locals?.[
              'workspaceManagementHandle'
            ] as { sealAndWait?: () => Promise<void> } | undefined;
            const initiallyMountedSessionMaintenance = initiallyMountedApp
              ?.locals?.['sessionArchiveCoordinator'] as
              | { sealMaintenanceAndWait?: () => Promise<void> }
              | undefined;
            const initiallyMountedConversationActivity = initiallyMountedApp
              ?.locals?.['conversationRuntimeActivity'] as
              | { sealAndWait?: () => Promise<void> }
              | undefined;
            // Calling an async function runs through its first await
            // synchronously. Seal an already-mounted runtime before close()
            // yields so no management request can enter the shutdown window.
            const initialManagementWait =
              initiallyMountedManagement?.sealAndWait?.();
            const initiallyMountedLive = initiallyMountedApp?.locals as
              | { sealAndWaitLiveCoordinator?: () => Promise<void> }
              | undefined;
            const initialLiveWait =
              initiallyMountedLive?.sealAndWaitLiveCoordinator?.();
            const initialSessionMaintenanceWait =
              initiallyMountedSessionMaintenance?.sealMaintenanceAndWait?.();
            const initialConversationActivityWait =
              initiallyMountedConversationActivity?.sealAndWait?.();
            let processRegistryShutdown: Promise<Error | undefined> | undefined;
            const startProcessRegistryShutdown = () => {
              processRegistryShutdown ??= managedProcessRegistry
                ?.shutdown()
                .then(
                  () => undefined,
                  (error: unknown) =>
                    error instanceof Error ? error : new Error(String(error)),
                );
            };
            startProcessRegistryShutdown();
            clearRuntimeStartAfterHealthTimer();
            clearRuntimeStartFallbackTimer();
            cancelDeferredRuntimeStartup();
            // NOTE: the shutdown signal handlers stay attached during the
            // drain so a second signal can take the explicit force-exit path
            // above. Detaching them up front would leave Node's default signal
            // behavior in charge and could orphan agent children. We detach
            // AFTER drain completes (`finish` below).

            // The shared lifecycle closes the listener in parallel with this
            // host drain, then releases Conversations ownership only after both
            // the listener callback and every child/bridge drain are proven.
            let settled = false;
            // Track bridge.shutdown failures so close()
            // doesn't silently report success when the bridge
            // teardown itself failed. The contract says "resolves
            // when the listener has fully closed and the bridge is
            // drained" — propagating the failure lets `onSignal`
            // exit 1 instead of 0, and lets embedders react.
            let bridgeShutdownError: Error | undefined;
            const finish = (err?: Error | null) => {
              if (settled) return;
              settled = true;
              const accessLogController = (
                (runtimeApp ?? runtimeAppForCleanup)?.locals as
                  | AccessLogAppLocals
                  | undefined
              )?.[ACCESS_LOG_CONTROLLER_LOCAL];
              accessLogController?.sealAndFlushSuppressed();
              process.removeListener('SIGINT', onSignal);
              process.removeListener('SIGTERM', onSignal);
              process.removeListener('SIGHUP', onSignal);
              void (
                coreRuntimePromise
                  ? coreRuntimePromise.then((core) => core.shutdownTelemetry())
                  : Promise.resolve()
              )
                .catch((telemetryErr) => {
                  writeStderrLine(
                    `o1-code serve: telemetry shutdown error: ${
                      telemetryErr instanceof Error
                        ? telemetryErr.message
                        : String(telemetryErr)
                    }`,
                  );
                })
                .finally(async () => {
                  // Server.close error takes precedence (operator-visible
                  // listener problem); fall back to the bridge error
                  // captured during shutdown if any.
                  const finalErr = err ?? bridgeShutdownError;
                  if (loggerPublished || loggerSignalOwned) {
                    writeDaemonLifecycleBestEffort(() => {
                      if (finalErr) {
                        daemonLog.error('daemon shutdown incomplete', finalErr);
                      } else {
                        daemonLog.info('daemon stopped');
                      }
                    });
                    clearLoaderKeyRejectionReporterIfCurrent(
                      loaderRejectionReporter,
                    );
                    await daemonLog.close();
                  }
                  restoreScrubbedLoaderEnv();
                  if (finalErr) rej(finalErr);
                  else res();
                });
            };

            void (
              coreRuntimePromise
                ? coreRuntimePromise.then((core) => core.forceFlushMetrics())
                : Promise.resolve()
            ).catch((flushErr) => {
              daemonLog.warn(
                `pre-shutdown metrics flush failed: ${
                  flushErr instanceof Error
                    ? flushErr.message
                    : String(flushErr)
                }`,
              );
            });

            Promise.resolve()
              .then(async () => {
                await waitForRuntimeStartingForShutdown(
                  runtimeStarting,
                  daemonLog,
                );
                const appForCleanup = runtimeApp ?? runtimeAppForCleanup;
                const workspaceManagementHandle = appForCleanup?.locals?.[
                  'workspaceManagementHandle'
                ] as { sealAndWait?: () => Promise<void> } | undefined;
                const sessionMaintenance = appForCleanup?.locals?.[
                  'sessionArchiveCoordinator'
                ] as
                  | { sealMaintenanceAndWait?: () => Promise<void> }
                  | undefined;
                const conversationActivity = appForCleanup?.locals?.[
                  'conversationRuntimeActivity'
                ] as { sealAndWait?: () => Promise<void> } | undefined;
                await initialManagementWait;
                if (workspaceManagementHandle !== initiallyMountedManagement) {
                  await workspaceManagementHandle?.sealAndWait?.();
                }
                const liveLifecycleHandle = appForCleanup?.locals as
                  | { sealAndWaitLiveCoordinator?: () => Promise<void> }
                  | undefined;
                await initialLiveWait;
                if (liveLifecycleHandle !== initiallyMountedLive) {
                  await liveLifecycleHandle?.sealAndWaitLiveCoordinator?.();
                }
                await initialSessionMaintenanceWait;
                if (sessionMaintenance !== initiallyMountedSessionMaintenance) {
                  await sessionMaintenance?.sealMaintenanceAndWait?.();
                }
                await initialConversationActivityWait;
                if (
                  conversationActivity !== initiallyMountedConversationActivity
                ) {
                  await conversationActivity?.sealAndWait?.();
                }
                stopTrustPolicyMonitor(appForCleanup);
                const waitForTrustPolicyIdle = appForCleanup?.locals?.[
                  'waitForTrustPolicyIdle'
                ] as (() => Promise<void>) | undefined;
                await waitForTrustPolicyIdle?.().catch((err) => {
                  daemonLog.error(
                    'workspace trust reconciliation shutdown wait failed',
                    err instanceof Error ? err : null,
                  );
                });
                beginRuntimeCoordinatorDrains(appForCleanup);
                startProcessRegistryShutdown();
                disposeRuntimeAppResources(appForCleanup);
                disposeDaemonEventLoopMonitor();
                const runtimeRemoval = appForCleanup?.locals?.[
                  'workspaceRuntimeRemoval'
                ] as WorkspaceRuntimeRemovalController | undefined;
                const workspaceRegistry = appForCleanup?.locals?.[
                  'workspaceRegistry'
                ] as WorkspaceRegistry | undefined;
                const managedRuntimeBridges = new Set<AcpSessionBridge>();
                if (runtimeRemoval && workspaceRegistry) {
                  const managedRuntimes = workspaceRegistry.listManaged();
                  for (const workspaceRuntime of managedRuntimes) {
                    managedRuntimeBridges.add(workspaceRuntime.bridge);
                  }
                  await Promise.all(
                    managedRuntimes.map((workspaceRuntime) =>
                      runtimeRemoval
                        .disposeRuntime(workspaceRuntime, 'daemon_shutdown')
                        .catch((err) => {
                          daemonLog.error(
                            'workspace runtime shutdown error',
                            err instanceof Error ? err : null,
                          );
                          bridgeShutdownError =
                            err instanceof Error ? err : new Error(String(err));
                          try {
                            workspaceRuntime.bridge.killAllSync();
                          } catch {
                            // Continue shutting down the remaining runtimes.
                          }
                        }),
                    ),
                  );
                }
                for (const bridgeForShutdown of getRuntimeBridgesForCleanup()) {
                  if (managedRuntimeBridges.has(bridgeForShutdown)) continue;
                  if (shutdownBridges.has(bridgeForShutdown)) continue;
                  shutdownBridges.add(bridgeForShutdown);
                  await bridgeForShutdown.shutdown().catch((err) => {
                    shutdownBridges.delete(bridgeForShutdown);
                    daemonLog.error(
                      'bridge shutdown error',
                      err instanceof Error ? err : null,
                    );
                    bridgeShutdownError =
                      err instanceof Error ? err : new Error(String(err));
                  });
                }
                const processRegistryError = await processRegistryShutdown;
                if (processRegistryError) {
                  daemonLog.error(
                    'ACP process registry shutdown error',
                    processRegistryError,
                  );
                  bridgeShutdownError ??= processRegistryError;
                }
              })
              .then(
                () => finish(),
                (error: unknown) =>
                  finish(
                    error instanceof Error ? error : new Error(String(error)),
                  ),
              );
          });
          return closePromise;
        },
      };
      closeHost = handle.close;
      handle.close = () => serveAppLifecycle.close();

      writeStdoutLine(
        `o1-code serve listening on ${url} (mode=${opts.mode}, ` +
          `workspace=${boundWorkspace})`,
      );
      // The quickstart block keys off the address the socket actually bound:
      // a DNS name that resolves to loopback binds loopback only, so its
      // addresses and QR would be undialable from anywhere else, while a
      // generated bearer is still printed because it is the operator's only
      // way in.
      const boundAddress =
        typeof addr === 'object' && addr ? addr.address : opts.hostname;
      // The settings source is resolved here rather than in the yargs
      // command layer so the serve fast path (which never runs that
      // handler) honors serve.tokenQr identically. An explicit flag
      // (either polarity) wins over the setting; the setting applies
      // only when the flag was omitted.
      const settingTokenQr = bootSettings?.serve?.tokenQr;
      if (
        opts.tokenQr === undefined &&
        settingTokenQr !== undefined &&
        typeof settingTokenQr !== 'boolean'
      ) {
        // Validated here rather than in the shared settings reader:
        // throwing there would discard the whole summary — policy.* with
        // it, silently downgrading permission
        // mediation to its default — because of a display knob. Name the
        // field and its type, never the value: a malformed value may be a
        // literal token pasted into the setting, and a `${VAR}` placeholder
        // outside INTERNAL_SECRET_ENV_VARS is substituted before it reaches
        // here — echoing either would re-publish a live bearer into
        // captured stderr on every boot.
        writeStderrLine(
          `o1-code serve: serve.tokenQr must be a boolean; ignoring a ${typeof settingTokenQr} value.`,
        );
      }
      // A workspace settings file may carry serve.tokenQr, but only
      // operator-owned scopes may set it. The interactive CLI warns about
      // the drop via getSettingsWarnings; the serve fast path has no
      // LoadedSettings, so the one path that reads the key names it itself.
      for (const ignoredKey of bootSettings?.ignoredWorkspaceKeys ?? []) {
        writeStderrLine(
          `o1-code serve: ${ignoredKey} in workspace settings ` +
            `(${path.join(boundWorkspace, '.o1-code', 'settings.json')}) is ` +
            'ignored; it is honored from user, system, and system-defaults ' +
            'scopes only.',
        );
      }
      // One resolved posture, not a requested/vetoed boolean pair whose two
      // falses mean opposite things: the veto is derived from the flag
      // alone, so a settings-level `false` only declines the opt-in and
      // leaves the default policy suppression in charge.
      const tokenQrMode =
        opts.tokenQr === false
          ? ('veto' as const)
          : opts.tokenQr === true || settingTokenQr === true
            ? ('force' as const)
            : ('policy' as const);
      // Name why a requested QR cannot print instead of discarding the
      // request silently — the same silent-no-op shape this flag exists to
      // remove. Outside the `if (token)` block on purpose: a loopback bind
      // with no bearer is the commonest inert case, and it must be reported
      // too.
      const tokenQrNoEffect = tokenQrNoEffectReason({
        requested: tokenQrMode === 'force',
        webShellMounted,
        boundAddress,
        generated: generatedToken,
      });
      if (tokenQrNoEffect) writeStderrLine(tokenQrNoEffect);
      if (token) {
        void printRemoteQuickstart({
          bind: opts.hostname,
          boundAddress,
          port: actualPort,
          tls: Boolean(tlsOptions),
          token,
          generated: generatedToken,
          web: webShellMounted,
          tokenQrMode,
        });
      }
      // Operator log on stderr too (systemd/docker/k8s default
      // captures only stderr for service diagnostics, and the
      // workspace= breadcrumb is the single piece of information
      // operators need most when triaging migration issues —
      // "did the daemon bind to the right workspace?"). The stdout
      // line above stays put so integration tests + scripts that
      // parse stdout for the listening URL keep working;
      // `JSON.stringify(boundWorkspace)` quotes the value
      // symmetrically with the workspace_mismatch log (defends
      // against control-char log injection if `boundWorkspace`
      // somehow contained one — operator-controlled today, but
      // cheap defense-in-depth).
      writeStderrLine(
        `o1-code serve: bound to workspace ${JSON.stringify(boundWorkspace)}`,
      );
      writeStderrLine(
        `o1-code serve: startup timing: processToListenMs=${startup.processToListenMs} ` +
          `runO1CodeServeToListenMs=${startup.runO1CodeServeToListenMs}`,
      );
      if (!token) {
        writeStderrLine(
          `o1-code serve: trusted loopback mode; local callers have full API ` +
            `access without bearer authentication, including code execution ` +
            `as the daemon user. Use --require-auth with ` +
            `${O1CODE_SERVER_TOKEN_ENV} on shared or untrusted hosts.`,
        );
        if (opts.clientMcpOverWs === true) {
          writeStderrLine(
            `o1-code serve: client-hosted MCP tools are accepted over the WebSocket without auth. ` +
              `Set ${O1CODE_SERVE_CLIENT_MCP_OVER_WS_ENV}=0 to disable.`,
          );
        }
      } else if (opts.requireAuth) {
        // The boot check above guarantees `token` is set whenever
        // `--require-auth` is on, so this branch only fires alongside
        // a successfully-authenticated daemon. The log line lets
        // operators confirm the hardening is active without parsing
        // `/capabilities` (and is a useful breadcrumb when triaging
        // "why is loopback returning 401" tickets).
        writeStderrLine(
          'o1-code serve: --require-auth enabled (bearer token mandatory ' +
            'on every route, including loopback /health).',
        );
      }

      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);
      process.on('SIGHUP', onSignal);

      // The per-attempt boot-error listener was removed by handleListening.
      // Keep the lifecycle listener and add persistent runtime diagnostics.
      server.on('error', (err) => {
        daemonLog.error('server error', err instanceof Error ? err : null);
      });
      const preparedRuntimeApp = runtimeApp ?? runtimeAppForCleanup;
      if (preparedRuntimeApp && bridgeRef && deps.bridge) {
        runtimeApp ??= preparedRuntimeApp;
        if (shouldPreheat) {
          startBridgePreheat(bridgeRef, preparedRuntimeApp);
        }
        const acpHandle = preparedRuntimeApp.locals?.['acpHandle'] as
          | AcpHttpHandle
          | undefined;
        acpHandle?.attachServer?.(server);
        markServeAppStartupReady();
        if (!runtimeStartupSettled) {
          runtimeStartupSettled = true;
          clearRuntimeStartupTimer();
          markRuntimeReady();
        }
      } else if (deferRuntimeUntilFirstHealth) {
        scheduleRuntimeStartFallback();
      } else {
        startRuntime();
      }

      if (deps.resolveOnListen) {
        loggerPublished = true;
        loggerLifecycle.published();
        resolve(handle);
      } else {
        void runtimeReady.then(
          async () => {
            loggerPublished = true;
            loggerLifecycle.published();
            resolve(handle);
          },
          (err) => {
            void handle.close().then(
              () => {
                reject(err instanceof Error ? err : new Error(String(err)));
              },
              (closeErr) => {
                writeDaemonLifecycleBestEffort(() =>
                  daemonLog.error(
                    'shutdown after runtime startup error failed',
                    closeErr instanceof Error ? closeErr : null,
                  ),
                );
                reject(err instanceof Error ? err : new Error(String(err)));
              },
            );
          },
        );
      }
    };
    let server: Server;
    if (tlsOptions) {
      try {
        server = https.createServer(tlsOptions, app);
      } catch (err) {
        // createSecureContext throws a raw OpenSSL string (e.g.
        // "error:0B080074:...key values mismatch") when cert/key don't pair.
        // Wrap it so the operator gets the same actionable framing as the
        // --tls-cert/--tls-key read errors above.
        reject(
          new Error(
            `--tls-cert "${opts.tlsCert}" and --tls-key "${opts.tlsKey}" ` +
              `could not be loaded (do they match?): ` +
              `${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        return;
      }
    } else {
      server = deps.httpServerFactory?.(app) ?? createServer(app);
    }
    serveAppLifecycle.bindServer(server, {
      startupReady: serveAppStartupReady,
      drainHost: () => {
        if (closeHost) return closeHost();
        if (!server.listening) return Promise.resolve();
        return new Promise<void>((resolve, rejectClose) => {
          server.close((error) => {
            if (error) rejectClose(error);
            else resolve();
          });
        });
      },
    });

    const tryListen = (attemptPort: number, attempt: number): void => {
      const handleListening = (): void => {
        server.removeListener('error', handleError);
        const address = server.address();
        if (
          trustedLoopbackMode &&
          (typeof address !== 'object' ||
            address === null ||
            !isLoopbackAddress(address.address))
        ) {
          const resolvedAddress =
            typeof address === 'object' && address !== null
              ? address.address
              : String(address);
          const error = new Error(
            `Refusing trusted-loopback mode because ${opts.hostname} ` +
              `bound to non-loopback address ${resolvedAddress}. Set ` +
              `${O1CODE_SERVER_TOKEN_ENV} or pass --token, or bind to an ` +
              `explicit loopback address.`,
          );
          markServeAppStartupFailed(error);
          void serveAppLifecycle.close().then(
            () => reject(error),
            (closeError: unknown) =>
              reject(
                closeError instanceof Error
                  ? new AggregateError([error, closeError], error.message)
                  : error,
              ),
          );
          return;
        }
        onListening();
      };
      const handleError = (err: NodeJS.ErrnoException): void => {
        server.removeListener('listening', handleListening);
        const nextPort = attemptPort + 1;
        if (
          err.code === 'EADDRINUSE' &&
          opts.port !== 0 &&
          nextPort <= 65535 &&
          attempt < MAX_PORT_ATTEMPTS - 1
        ) {
          writeStderrLine(
            `o1-code serve: port ${attemptPort} is in use, trying ${nextPort}...`,
          );
          tryListen(nextPort, attempt + 1);
          return;
        }
        if (err.code === 'EADDRINUSE' && attempt > 0) {
          writeStderrLine(
            `o1-code serve: all ports ${opts.port}–${attemptPort} are in use`,
          );
        }
        markServeAppStartupFailed(err);
        void serveAppLifecycle.close().then(
          () => reject(err),
          (closeError: unknown) =>
            reject(
              closeError instanceof Error
                ? new AggregateError([err, closeError], err.message)
                : err,
            ),
        );
      };
      try {
        server.once('listening', handleListening);
        server.once('error', handleError);
        server.listen(attemptPort, listenHostname);
      } catch (err) {
        // Synchronous listen failure (e.g. invalid address) — not
        // recoverable via port bump.
        server.removeListener('listening', handleListening);
        server.removeListener('error', handleError);
        const error = err instanceof Error ? err : new Error(String(err));
        markServeAppStartupFailed(error);
        void serveAppLifecycle.close().then(
          () => reject(error),
          (closeError: unknown) =>
            reject(
              closeError instanceof Error
                ? new AggregateError([error, closeError], error.message)
                : error,
            ),
        );
        return;
      }
    };

    tryListen(opts.port, 0);
  });
}
