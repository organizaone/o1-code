/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stage 1 HTTP→ACP bridge — backward-compat re-export shim.
 *
 * The bridge core (`BridgeClient`,
 * `defaultSpawnChannelFactory`, `createAcpSessionBridge` factory closure,
 * plus the supporting types/errors/options/status) lives in
 * `@organizaone/o1-code-acp-bridge`. This shim preserves the CLI-local bridge import
 * surface so `server.ts`, `run-o1-code-serve.ts`, `workspace-agents.ts`,
 * `workspace-memory.ts`, `index.ts`, plus the bridge test suite, keep resolving
 * through one module.
 *
 * The implementation now lives at:
 *   - `@organizaone/o1-code-acp-bridge/bridge` — `createAcpSessionBridge` factory
 *   - `@organizaone/o1-code-acp-bridge/bridgeClient` — `BridgeClient` class +
 *     permission record types
 *   - `@organizaone/o1-code-acp-bridge/spawnChannel` — `defaultSpawnChannelFactory`
 *   - `@organizaone/o1-code-acp-bridge/bridgeOptions` — `BridgeOptions` +
 *     `DaemonStatusProvider` interfaces
 *   - `@organizaone/o1-code-acp-bridge/bridgeTypes` — bridge session + heartbeat
 *     types + `AcpSessionBridge` interface
 *   - `@organizaone/o1-code-acp-bridge/bridgeErrors` — typed bridge error classes
 *   - `@organizaone/o1-code-acp-bridge/workspacePaths` — `canonicalizeWorkspace`
 *     + `MAX_WORKSPACE_PATH_LENGTH`
 *   - `@organizaone/o1-code-acp-bridge/status` — protocol-versioned status types
 *     + idle envelope helpers
 *   - `@organizaone/o1-code-acp-bridge/channel` — `AcpChannel` + `ChannelFactory`
 *
 * The bridge is bound to a single canonical workspace
 * (`BridgeOptions.boundWorkspace`); multi-workspace deployments use
 * multiple daemon processes. See the module docstring on `bridge.ts`
 * in the lifted package for the full Stage 1/Stage 2 contract.
 */

export {
  createAcpSessionBridge,
  createHttpAcpBridge,
} from '@organizaone/o1-code-acp-bridge/bridge';
export {
  DEFAULT_SESSION_RESTORE_TIMEOUT_MS,
  MAX_SESSION_RESTORE_TIMEOUT_MS,
  resolveSessionRestoreTimeoutMs,
} from '@organizaone/o1-code-acp-bridge/sessionRestoreTimeout';
export {
  defaultSpawnChannelFactory,
  createSpawnChannelFactory,
} from '@organizaone/o1-code-acp-bridge/spawnChannel';
// `MAX_RESOLVED_PERMISSION_RECORDS`, `PendingPermission`,
// `PermissionResolutionRecord` re-exports were removed alongside the
// source definitions — the mediator now owns pending+resolved state.
export { BridgeClient } from '@organizaone/o1-code-acp-bridge/bridgeClient';
export type { BridgeClientSessionEntry } from '@organizaone/o1-code-acp-bridge/bridgeClient';

export type {
  AcpChannel,
  AcpChannelExitInfo,
  ChannelFactory,
} from '@organizaone/o1-code-acp-bridge';

export type {
  BridgeFreshSessionAdmission,
  BridgeFreshSessionAdmissionContext,
  BridgeFreshSessionReservation,
  BridgeSessionLifecycle,
  BridgeSessionLifecycleEvent,
  BridgeOptions,
  BridgeRuntimeEpochSource,
  DaemonStatusProvider,
} from '@organizaone/o1-code-acp-bridge/bridgeOptions';

export type { BridgeFileSystem } from '@organizaone/o1-code-acp-bridge/bridgeFileSystem';

export type {
  BridgeSpawnRequest,
  BridgeSession,
  BridgeRestoreSessionRequest,
  BridgeSessionState,
  BridgeRestoredSession,
  BridgeSessionTranscriptPage,
  BridgeSessionTranscriptPageRequest,
  BridgeGenerationModelSource,
  BridgeGenerationStreamEvent,
  BridgeWorkspaceGenerationStreamEvent,
  BridgePromptContentBlock,
  BridgeSessionSummary,
  BridgeTurnStatus,
  BridgeSessionCatalogVersion,
  SessionMetadataUpdate,
  BridgeClientRequestContext,
  BridgeHeartbeatResult,
  BridgeHeartbeatState,
  BridgeWorkspaceMemoryRememberContextMode,
  BridgeWorkspaceMemoryRememberTargetScope,
  BridgeWorkspaceMemoryRememberRequest,
  BridgeWorkspaceMemoryRememberResult,
  BridgeAutoMemoryTopic,
  BridgeWorkspaceMemoryForgetRequest,
  BridgeWorkspaceMemoryForgetMatch,
  BridgeWorkspaceMemoryForgetResult,
  BridgeWorkspaceMemoryDreamResult,
  BridgeDaemonStatusLimits,
  BridgeDaemonSessionDiagnostic,
  BridgeDaemonStatusSnapshot,
  BridgeWorkspaceRuntimeLifecycleSnapshot,
  BridgeShutdownOptions,
  WorkspaceEventPublisher,
  WorkspaceEventBridge,
  AcpSessionBridge,
  HttpAcpBridge,
} from '@organizaone/o1-code-acp-bridge/bridgeTypes';

export {
  AcpChildCapacityExceededError,
  BranchWhilePromptActiveError,
  CdWhilePromptActiveError,
  SessionNotFoundError,
  RestoreInProgressError,
  SessionArchivedError,
  SessionNotArchivedError,
  SessionConflictError,
  SessionArchivingError,
  InvalidSessionScopeError,
  SessionLimitExceededError,
  PromptQueueFullError,
  PromptDeadlineExceededError,
  WorkspaceMismatchError,
  InvalidClientIdError,
  InvalidPermissionOptionError,
  InvalidSessionMetadataError,
  WorkspaceInitConflictError,
  WorkspaceInitPathEscapeError,
  WorkspaceInitSymlinkError,
  WorkspaceInitRaceError,
  McpAuthenticationInProgressError,
  McpServerNotFoundError,
  McpServerRestartFailedError,
  SessionBusyError,
  SessionResetPendingError,
  WorkspaceDrainingError,
  BridgeChannelQuarantinedError,
  InvalidRewindTargetError,
  TotalSessionLimitExceededError,
  NOT_CURRENTLY_GENERATING_CANCEL_MESSAGE,
  // Multi-client permission coordination errors.
  CancelSentinelCollisionError,
  PermissionForbiddenError,
  PermissionPolicyNotImplementedError,
  SessionShellClientRequiredError,
  SessionShellDisabledError,
} from '@organizaone/o1-code-acp-bridge/bridgeErrors';

export {
  BridgeTimeoutError,
  SessionRestoreTimeoutError,
} from '@organizaone/o1-code-acp-bridge/status';

export {
  MAX_WORKSPACE_PATH_LENGTH,
  canonicalizeWorkspace,
} from '@organizaone/o1-code-acp-bridge/workspacePaths';

export {
  SessionArtifactAuthorizationError,
  SessionArtifactValidationError,
} from '@organizaone/o1-code-acp-bridge/sessionArtifacts';
