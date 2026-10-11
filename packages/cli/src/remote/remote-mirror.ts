/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Writable } from 'node:stream';
import type {
  Config,
  ServerLlmStreamEvent,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '@organizaone/o1-code-core';
import type { Part } from '@google/genai';
import { StreamJsonOutputAdapter } from '../nonInteractive/io/index.js';
import type { DualOutputSink } from '../dualOutput/dual-output-sink.js';

/** Where the mirror's events go: a remote session, or anything that takes one. */
export interface RemoteEventTarget {
  send(ev: unknown): void;
  readonly state: 'online' | 'reconnecting' | 'ended';
}

/**
 * The terminal's stream-json events, as `DualOutputBridge` would write
 * them to a file, handed one by one to the remote session (contract §5.5,
 * the mirror). The adapter writes lines; this splits them back into the
 * objects the gateway relays. Permission control frames are not mirrored:
 * a remote viewer answers through decision requests instead.
 */
export class RemoteMirrorSink implements DualOutputSink {
  private readonly adapter: StreamJsonOutputAdapter;

  constructor(
    config: Config,
    private readonly target: RemoteEventTarget,
  ) {
    let pending = '';
    const lines = new Writable({
      write: (chunk: Buffer | string, _encoding, callback) => {
        pending += chunk.toString();
        let newline = pending.indexOf('\n');
        while (newline !== -1) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          if (line.trim()) {
            try {
              target.send(JSON.parse(line));
            } catch {
              // A line the adapter wrote that is not JSON is its own bug;
              // the mirror never breaks the turn over it.
            }
          }
          newline = pending.indexOf('\n');
        }
        callback();
      },
    });
    this.adapter = new StreamJsonOutputAdapter(config, true, lines);
  }

  get isConnected(): boolean {
    return this.target.state !== 'ended';
  }

  processEvent(event: ServerLlmStreamEvent): void {
    this.adapter.processEvent(event);
  }

  startAssistantMessage(): void {
    this.adapter.startAssistantMessage();
  }

  finalizeAssistantMessage(): void {
    this.adapter.finalizeAssistantMessage();
  }

  emitUserMessage(parts: Part[]): void {
    this.adapter.emitUserMessage(parts);
  }

  emitToolResult(
    request: ToolCallRequestInfo,
    response: ToolCallResponseInfo,
  ): void {
    this.adapter.emitToolResult(request, response);
  }

  emitPermissionRequest(): void {}

  emitControlResponse(): void {}

  emitControlError(): void {}

  emitSystemMessage(subtype: string, data?: unknown): void {
    this.adapter.emitSystemMessage(subtype, data);
  }

  async shutdown(): Promise<void> {}
}
