/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ServerLlmStreamEvent,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '@organizaone/o1-code-core';
import type { Part } from '@google/genai';
import type { PermissionSuggestion } from '../nonInteractive/types.js';

/**
 * Where the interactive UI's structured event stream goes: the fd/file
 * sidecar of `--json-fd`/`--json-file`, the mirror of a remote session, or
 * a fan-out over several of them. The hooks call these as the turn runs
 * and never ask who is listening.
 */
export interface DualOutputSink {
  readonly isConnected: boolean;
  processEvent(event: ServerLlmStreamEvent): void;
  startAssistantMessage(): void;
  finalizeAssistantMessage(): void;
  emitUserMessage(parts: Part[]): void;
  emitToolResult(
    request: ToolCallRequestInfo,
    response: ToolCallResponseInfo,
  ): void;
  emitPermissionRequest(
    requestId: string,
    toolName: string,
    toolUseId: string,
    input: unknown,
    blockedPath?: string | null,
    permissionSuggestions?: PermissionSuggestion[] | null,
  ): void;
  emitControlResponse(requestId: string, allowed: boolean): void;
  emitControlError(requestId: string, message: string): void;
  emitSystemMessage(subtype: string, data?: unknown): void;
  shutdown(): Promise<void>;
}
