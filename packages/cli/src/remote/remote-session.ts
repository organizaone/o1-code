/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  openRemoteSession,
  type RemoteAgent,
  type RemoteAgentEvents,
  type RemoteDecision,
  type RemoteDecisionRequest,
  type RemoteSessionInfo,
  type RemoteState,
  type RemoteTransport,
} from '@organizaone/o1-code-core/providers/o1-connect/remote.js';

/** A hello's `history` may carry this much (contract §5.3). */
export const REMOTE_HISTORY_BYTES = 512 * 1024;

export interface RemoteSessionOpenOptions {
  transport: RemoteTransport;
  session: RemoteSessionInfo;
  /**
   * The conversation the terminal is showing, as whole stream-json events
   * (user and assistant messages, tool results; never `stream_event`
   * deltas). Read at every hello, so it may grow while the mode is on.
   */
  seedHistory?: () => unknown[];
  log?: (line: string) => void;
  /** Test seam; the library's own dial otherwise. */
  open?: typeof openRemoteSession;
}

/** What the footer and the history items read. */
export interface RemoteSessionSnapshot {
  state: RemoteState;
  viewers: number;
  /** Why the session ended (a `bye` reason, or `closed`), once it has. */
  reason?: string;
}

type StateListener = (snapshot: RemoteSessionSnapshot) => void;

interface RingEntry {
  ev: unknown;
  bytes: number;
}

const bytesOf = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

/**
 * One terminal session in remote mode (contract §5.5): the library's agent
 * plus what the terminal keeps around it — the ring of events sent since
 * the mode started, which with the conversation already on screen is what
 * a viewer sees first and what a `resync` re-sends; the viewer count; and
 * the state the footer shows.
 */
export class RemoteSession {
  private readonly ring: RingEntry[] = [];
  private ringBytes = 0;
  private viewerCount = 0;
  private current: RemoteState = 'online';
  private endReason: string | undefined;
  private readonly stateListeners = new Set<StateListener>();
  private readonly unsubscribe: Array<() => void> = [];
  readonly since: number;

  private constructor(
    private readonly agent: RemoteAgent,
    private readonly seedHistory: () => unknown[],
  ) {
    this.since = Date.now();
    this.unsubscribe.push(
      agent.on('viewer', ({ count }) => {
        this.viewerCount = count;
        this.notify();
      }),
      agent.on('state', ({ state, reason }) => {
        this.current = state;
        if (state === 'ended') {
          this.endReason = reason ?? 'closed';
          this.viewerCount = 0;
        }
        this.notify();
      }),
    );
  }

  static async open(options: RemoteSessionOpenOptions): Promise<RemoteSession> {
    const seed = options.seedHistory ?? (() => []);
    // The ring does not exist before the agent does, and the hello is sent
    // while it is being opened: the history function reads through a
    // holder the constructor fills in.
    const holder: { session?: RemoteSession } = {};
    const agent = await (options.open ?? openRemoteSession)(options.transport, {
      session: options.session,
      history: () => holder.session?.history() ?? trimToBudget(seed()),
      ...(options.log ? { log: options.log } : {}),
    });
    const session = new RemoteSession(agent, seed);
    holder.session = session;
    return session;
  }

  get remoteId(): string {
    return this.agent.remoteId;
  }

  get url(): string {
    return this.agent.url;
  }

  get state(): RemoteState {
    return this.current;
  }

  get viewers(): number {
    return this.viewerCount;
  }

  snapshot(): RemoteSessionSnapshot {
    return {
      state: this.current,
      viewers: this.viewerCount,
      ...(this.endReason !== undefined ? { reason: this.endReason } : {}),
    };
  }

  /**
   * Mirrors one event. Deltas stream to the viewers but stay out of the
   * ring: the whole assistant message that follows replaces them, and a
   * replay made of deltas would spend the hello's budget on fragments.
   */
  send(ev: unknown): void {
    if (this.current === 'ended') return;
    this.agent.send(ev);
    if ((ev as { type?: unknown })?.type === 'stream_event') return;
    const bytes = bytesOf(ev);
    this.ring.push({ ev, bytes });
    this.ringBytes += bytes;
    while (this.ringBytes > REMOTE_HISTORY_BYTES && this.ring.length > 1) {
      this.ringBytes -= this.ring.shift()!.bytes;
    }
  }

  status(s: Parameters<RemoteAgent['status']>[0]): void {
    if (this.current === 'ended') return;
    this.agent.status(s);
  }

  requestDecision(req: RemoteDecisionRequest): Promise<RemoteDecision> {
    return this.agent.requestDecision(req);
  }

  closeDecision(
    id: string,
    by: 'local' | 'remote' | 'expired',
    outcome?: string | null,
  ): void {
    this.agent.closeDecision(id, by, outcome);
  }

  on<K extends keyof RemoteAgentEvents>(
    event: K,
    fn: (e: RemoteAgentEvents[K]) => void,
  ): () => void {
    return this.agent.on(event, fn);
  }

  /** Called on every change of state or viewer count, with the snapshot. */
  onChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** The conversation on screen and the ring, the newest that fit the hello. */
  history(): unknown[] {
    return trimToBudget([...this.seedHistory(), ...this.ring.map((e) => e.ev)]);
  }

  /** Leaves remote mode: close code 1000, the gateway ends the session at once. */
  async close(): Promise<void> {
    await this.agent.close();
    for (const off of this.unsubscribe.splice(0)) off();
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.stateListeners) {
      try {
        listener(snapshot);
      } catch {
        // A listener's failure must not stop the others, nor the session.
      }
    }
  }
}

/** The newest items that fit the hello's history budget, in order. */
export function trimToBudget(items: unknown[]): unknown[] {
  let total = 0;
  let start = items.length;
  while (start > 0) {
    const bytes = bytesOf(items[start - 1]);
    if (total + bytes > REMOTE_HISTORY_BYTES) break;
    total += bytes;
    start -= 1;
  }
  return items.slice(start);
}
