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
import type { DualOutputSink } from './dual-output-sink.js';

/**
 * One sink the UI holds for the whole session, behind which sinks come and
 * go: the `--json-fd` bridge from startup, a remote session's mirror from
 * `/rc` on. Nothing is buffered for a sink that is not there yet; a sink
 * that joins sees the stream from its next event (a remote session gets
 * what came before through its hello's history).
 */
export class DualOutputFanout implements DualOutputSink {
  private readonly sinks = new Set<DualOutputSink>();

  add(sink: DualOutputSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  remove(sink: DualOutputSink): void {
    this.sinks.delete(sink);
  }

  get size(): number {
    return this.sinks.size;
  }

  get isConnected(): boolean {
    for (const sink of this.sinks) if (sink.isConnected) return true;
    return false;
  }

  processEvent(event: ServerLlmStreamEvent): void {
    for (const sink of this.live()) sink.processEvent(event);
  }

  startAssistantMessage(): void {
    for (const sink of this.live()) sink.startAssistantMessage();
  }

  finalizeAssistantMessage(): void {
    for (const sink of this.live()) sink.finalizeAssistantMessage();
  }

  emitUserMessage(parts: Part[]): void {
    for (const sink of this.live()) sink.emitUserMessage(parts);
  }

  emitToolResult(
    request: ToolCallRequestInfo,
    response: ToolCallResponseInfo,
  ): void {
    for (const sink of this.live()) sink.emitToolResult(request, response);
  }

  emitPermissionRequest(
    requestId: string,
    toolName: string,
    toolUseId: string,
    input: unknown,
    blockedPath: string | null = null,
    permissionSuggestions: PermissionSuggestion[] | null = null,
  ): void {
    for (const sink of this.live()) {
      sink.emitPermissionRequest(
        requestId,
        toolName,
        toolUseId,
        input,
        blockedPath,
        permissionSuggestions,
      );
    }
  }

  emitControlResponse(requestId: string, allowed: boolean): void {
    for (const sink of this.live())
      sink.emitControlResponse(requestId, allowed);
  }

  emitControlError(requestId: string, message: string): void {
    for (const sink of this.live()) sink.emitControlError(requestId, message);
  }

  emitSystemMessage(subtype: string, data?: unknown): void {
    for (const sink of this.live()) sink.emitSystemMessage(subtype, data);
  }

  async shutdown(): Promise<void> {
    const sinks = [...this.sinks];
    this.sinks.clear();
    await Promise.all(sinks.map((sink) => sink.shutdown()));
  }

  private live(): DualOutputSink[] {
    return [...this.sinks].filter((sink) => sink.isConnected);
  }
}
