/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AgentSessionForegroundTransport {
  canAttach(sessionId: string): Promise<boolean>;
  waitDetached?(sessionId: string): Promise<void>;
  attach(
    sessionId: string,
    detachSignal: AbortSignal,
    onAttached: () => void,
  ): Promise<{ reason: 'detached' | 'stdin-ended' }>;
}

interface ActiveAttachment {
  sessionId: string;
  abort: AbortController;
  outcome: Promise<{ error?: unknown }>;
}

export class AgentSessionForegroundController {
  private active?: ActiveAttachment;
  private lastSessionId?: string;
  private sequence: Promise<void> = Promise.resolve();

  constructor(private readonly transport: AgentSessionForegroundTransport) {}

  get activeSessionId(): string | undefined {
    return this.active?.sessionId;
  }

  select(sessionId: string): Promise<void> {
    return this.serialize(() => this.selectLocked(sessionId));
  }

  suspend(): Promise<void> {
    return this.serialize(() => this.detachActive());
  }

  resume(): Promise<void> {
    return this.serialize(async () => {
      if (!this.lastSessionId)
        throw new Error('No previous session to resume.');
      await this.selectLocked(this.lastSessionId);
    });
  }

  private async selectLocked(sessionId: string): Promise<void> {
    if (this.active?.sessionId === sessionId) return;
    if (!(await this.transport.canAttach(sessionId))) {
      throw new Error(`Session ${sessionId} is unavailable.`);
    }
    const outgoing = this.active?.sessionId;
    await this.detachActive();
    try {
      await this.attach(sessionId);
      this.lastSessionId = sessionId;
    } catch (error) {
      if (outgoing) {
        try {
          await this.attach(outgoing);
          this.lastSessionId = outgoing;
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            'Could not attach the target or restore the previous session.',
          );
        }
      }
      throw error;
    }
  }

  private async attach(sessionId: string): Promise<void> {
    const abort = new AbortController();
    let markAttached = () => {};
    const attached = new Promise<void>((resolve) => {
      markAttached = resolve;
    });
    const outcome = this.transport
      .attach(sessionId, abort.signal, markAttached)
      .then(
        () => ({ error: undefined }),
        (error: unknown) => ({ error }),
      );
    const attachment: ActiveAttachment = { sessionId, abort, outcome };
    this.active = attachment;
    void outcome.then(() => {
      if (this.active === attachment) this.active = undefined;
    });
    await Promise.race([
      attached,
      outcome.then(({ error }) => {
        throw error ?? new Error(`Session ${sessionId} detached before ready.`);
      }),
    ]);
  }

  private async detachActive(): Promise<void> {
    const attachment = this.active;
    if (!attachment) return;
    attachment.abort.abort();
    await attachment.outcome;
    await this.transport.waitDetached?.(attachment.sessionId);
    if (this.active === attachment) this.active = undefined;
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.sequence.then(action, action);
    this.sequence = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
