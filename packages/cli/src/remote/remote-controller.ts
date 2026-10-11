/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { hostname } from 'node:os';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import {
  describeO1ConnectError,
  isO1ConnectError,
} from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import type {
  RemoteAgentEvents,
  RemoteDecision,
  RemoteState,
} from '@organizaone/o1-code-core/providers/o1-connect/remote.js';
import type { DualOutputFanout } from '../dualOutput/dual-output-fanout.js';
import {
  checkRemoteEligibility,
  type RemoteEligibility,
} from './eligibility.js';
import {
  RemoteDecisionBridge,
  type RemoteDecisionSpec,
} from './remote-decisions.js';
import { RemoteMirrorSink } from './remote-mirror.js';
import {
  RemoteSession,
  type RemoteSessionOpenOptions,
  type RemoteSessionSnapshot,
} from './remote-session.js';

/** The gateway bounds a session's name (contract §5.3). */
const NAME_CHARS = 128;

export type RemoteStartOutcome =
  | { status: 'started'; url: string; remoteId: string }
  | { status: 'active'; url: string }
  | { status: 'disabled' }
  | {
      status: 'refused';
      code: string;
      httpStatus?: number;
      sessions?: string[];
      message: string;
    }
  | { status: 'failed'; message: string }
  | Exclude<RemoteEligibility, { status: 'ok' }>;

export interface RemoteStatus {
  active: boolean;
  name: string;
  url?: string;
  remoteId?: string;
  since?: number;
  /** The live session's state, while there is one. */
  snapshot: RemoteSessionSnapshot | null;
  /** How the last session ended, until the next starts or `/rc off` clears it. */
  last?: RemoteSessionSnapshot;
}

export type RemoteEvent =
  | { kind: 'started'; url: string; remoteId: string; name: string }
  | { kind: 'viewer'; op: 'attached' | 'detached'; count: number }
  | { kind: 'state'; state: RemoteState; reason?: string }
  | { kind: 'stopped'; reason: string };

export type RemoteTurnStatus = Parameters<RemoteSession['status']>[0];

export interface RemoteControllerOptions {
  config: Config;
  version: string;
  /** Where the terminal's event stream fans out; the mirror joins it while remote. */
  sinks: DualOutputFanout;
  checkEligibility?: typeof checkRemoteEligibility;
  open?: (options: RemoteSessionOpenOptions) => Promise<RemoteSession>;
  log?: (line: string) => void;
}

type Listener<T> = (event: T) => void;

/**
 * Owns remote mode for one terminal session (contract §5.5): starts and
 * stops the session, keeps the mirror on the fan-out while it is on,
 * forwards a viewer's input, commands and answers to the UI, and tells
 * the registry so `ps` can show it. Lives outside React, like the peer
 * inbox: `/rc` and the dialog drive it, the UI subscribes.
 */
export class RemoteController {
  private session: RemoteSession | null = null;
  private starting: Promise<RemoteStartOutcome> | null = null;
  private bridge: RemoteDecisionBridge | null = null;
  private removeSink: (() => void) | null = null;
  private readonly unsubscribe: Array<() => void> = [];
  private readonly specs = new Map<string, RemoteDecisionSpec>();
  private sessionName: string;
  private last: RemoteSessionSnapshot | undefined;
  private lastStatus: RemoteTurnStatus | null = null;
  private historyProvider: () => unknown[] = () => [];
  private readonly eventListeners = new Set<Listener<RemoteEvent>>();
  private readonly inputListeners = new Set<
    Listener<RemoteAgentEvents['input']>
  >();
  private readonly commandListeners = new Set<
    Listener<RemoteAgentEvents['command']>
  >();
  private readonly answerListeners = new Set<
    (id: string, answer: RemoteDecision, spec: RemoteDecisionSpec) => void
  >();

  constructor(private readonly options: RemoteControllerOptions) {
    this.sessionName = this.defaultName();
  }

  /** The conversation on screen, read at every hello; wired by the UI. */
  setHistoryProvider(provider: () => unknown[]): void {
    this.historyProvider = provider;
  }

  status(): RemoteStatus {
    const session = this.session;
    return {
      active: session !== null,
      name: this.sessionName,
      ...(session
        ? {
            url: session.url,
            remoteId: session.remoteId,
            since: session.since,
            snapshot: session.snapshot(),
          }
        : { snapshot: null }),
      ...(this.last ? { last: this.last } : {}),
    };
  }

  onEvent(listener: Listener<RemoteEvent>): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onInput(listener: Listener<RemoteAgentEvents['input']>): () => void {
    this.inputListeners.add(listener);
    return () => this.inputListeners.delete(listener);
  }

  onCommand(listener: Listener<RemoteAgentEvents['command']>): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  /** A viewer answered one of the terminal's questions before the terminal did. */
  onDecisionAnswer(
    listener: (
      id: string,
      answer: RemoteDecision,
      spec: RemoteDecisionSpec,
    ) => void,
  ): () => void {
    this.answerListeners.add(listener);
    return () => this.answerListeners.delete(listener);
  }

  /** What the terminal is doing; remembered, and sent while remote. */
  setStatus(status: RemoteTurnStatus): void {
    this.lastStatus = status;
    this.session?.status(status);
  }

  offerDecision(id: string, spec: RemoteDecisionSpec): void {
    if (!this.bridge) return;
    this.specs.set(id, spec);
    this.bridge.offer(id, spec);
  }

  closeDecision(id: string, outcome?: string | null): void {
    this.specs.delete(id);
    this.bridge?.closeLocal(id, outcome);
  }

  expireDecision(id: string): void {
    this.specs.delete(id);
    this.bridge?.expire(id);
  }

  isDecisionOpen(id: string): boolean {
    return this.bridge?.isOpen(id) ?? false;
  }

  start(options: { name?: string } = {}): Promise<RemoteStartOutcome> {
    if (this.session) {
      return Promise.resolve({ status: 'active', url: this.session.url });
    }
    if (this.starting) return this.starting;
    this.starting = this.doStart(options).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /** Leaves remote mode; the gateway ends the session at once. */
  async stop(): Promise<void> {
    const session = this.session;
    if (!session) {
      this.last = undefined;
      return;
    }
    this.bridge?.closeAll();
    this.detach('closed');
    await session.close();
  }

  /** A new name means a new hello: the same session id re-opens the same remote id. */
  async rename(name: string): Promise<RemoteStartOutcome> {
    if (this.session) await this.stop();
    return this.start({ name });
  }

  private async doStart({
    name,
  }: {
    name?: string;
  }): Promise<RemoteStartOutcome> {
    const { config } = this.options;
    if (!config.isRemoteEnabled()) return { status: 'disabled' };
    const eligibility = await (
      this.options.checkEligibility ?? checkRemoteEligibility
    )(config);
    if (eligibility.status !== 'ok') return eligibility;

    const sessionName = boundName(name?.trim() || this.sessionName);
    let session: RemoteSession;
    try {
      session = await (this.options.open ?? RemoteSession.open)({
        transport: eligibility.transport,
        session: {
          id: config.getSessionId(),
          name: sessionName,
          cwd: config.getTargetDir(),
          version: this.options.version,
          approvalMode: config.getApprovalMode(),
          model: config.getModel(),
        },
        seedHistory: () => this.historyProvider(),
        ...(this.options.log ? { log: this.options.log } : {}),
      });
    } catch (error) {
      if (isO1ConnectError(error) && error.code === 'remote_refused') {
        const cause = (error.cause ?? {}) as {
          status?: number;
          code?: string;
          sessions?: string[];
        };
        return {
          status: 'refused',
          code: cause.code ?? 'refused',
          ...(cause.status !== undefined ? { httpStatus: cause.status } : {}),
          ...(cause.sessions ? { sessions: cause.sessions } : {}),
          message: error.message,
        };
      }
      return {
        status: 'failed',
        message: describeO1ConnectError(error).message,
      };
    }
    this.attach(session, sessionName);
    return { status: 'started', url: session.url, remoteId: session.remoteId };
  }

  private attach(session: RemoteSession, name: string): void {
    const { config, sinks } = this.options;
    this.session = session;
    this.sessionName = name;
    this.last = undefined;
    this.removeSink = sinks.add(new RemoteMirrorSink(config, session));
    this.bridge = new RemoteDecisionBridge(session, {
      onAnswer: (id, answer) => {
        const spec = this.specs.get(id);
        this.specs.delete(id);
        if (!spec) return;
        for (const listener of this.answerListeners) listener(id, answer, spec);
      },
    });
    this.unsubscribe.push(
      session.on('input', (event) => {
        for (const listener of this.inputListeners) listener(event);
      }),
      session.on('command', (event) => {
        for (const listener of this.commandListeners) listener(event);
      }),
      session.on('viewer', ({ op, count }) => {
        this.emit({ kind: 'viewer', op, count });
      }),
      session.onChange((snapshot) => {
        if (snapshot.state === 'ended') {
          // A final `bye`, or a drop the gateway gave up on: the library
          // ended the session, and the terminal leaves remote mode with it.
          if (this.session === session) this.detach(snapshot.reason ?? 'ended');
          return;
        }
        this.emit({ kind: 'state', state: snapshot.state });
      }),
    );
    session.status(
      this.lastStatus ?? {
        state: 'idle',
        model: config.getModel(),
        approvalMode: config.getApprovalMode(),
      },
    );
    void config.updateSessionRegistryRemote({
      id: session.remoteId,
      since: session.since,
    });
    this.emit({
      kind: 'started',
      url: session.url,
      remoteId: session.remoteId,
      name,
    });
  }

  private detach(reason: string): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.bridge = null;
    this.specs.clear();
    this.removeSink?.();
    this.removeSink = null;
    for (const off of this.unsubscribe.splice(0)) off();
    this.last = { state: 'ended', viewers: 0, reason };
    void this.options.config.updateSessionRegistryRemote(undefined);
    this.emit({ kind: 'stopped', reason });
  }

  private emit(event: RemoteEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // A listener's failure must not stop the others.
      }
    }
  }

  private defaultName(): string {
    const configured = this.options.config.getRemoteSessionName()?.trim();
    if (configured) return boundName(configured);
    const host = hostname().split('.')[0] || 'terminal';
    return boundName(
      `${host}-${this.options.config.getSessionId().slice(0, 4)}`,
    );
  }
}

function boundName(name: string): string {
  const flat = name.replace(/\s+/g, ' ').trim();
  return Array.from(flat).slice(0, NAME_CHARS).join('') || 'terminal';
}
