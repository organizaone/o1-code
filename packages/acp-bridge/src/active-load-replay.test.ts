/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest';
import {
  makeBridge,
  makeChannel,
  WS_A,
  type ChannelHandle,
} from './internal/testUtils.js';
import { SERVE_STATUS_EXT_METHODS } from './status.js';

type TurnKind = 'foreground' | 'background' | 'goal';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function persistedPage(text: string, hasMore = false) {
  return {
    v: 1,
    events: [
      {
        v: 1,
        type: 'session_update',
        data: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text },
        },
      },
    ],
    hasMore,
  };
}

function loadRequest(session: { sessionId: string; clientId?: string }) {
  return {
    sessionId: session.sessionId,
    workspaceCwd: WS_A,
    clientId: session.clientId,
    historyReplay: 'response' as const,
    liveReplayMode: 'summary' as const,
    historyPageSize: 100,
  };
}

function transcriptCalls(handle: ChannelHandle): number {
  return handle.agent.extMethodCalls.filter(
    (call) => call.method === SERVE_STATUS_EXT_METHODS.sessionTranscript,
  ).length;
}

describe('paged load during an active session', () => {
  // The foreground prompt comes back wrapped: an async function returning the
  // bare promise would wait for the turn to end.
  async function startTurn(
    kind: TurnKind,
    handle: ChannelHandle,
    bridge: ReturnType<typeof makeBridge>,
    sessionId: string,
  ): Promise<{ prompt?: Promise<unknown> }> {
    if (kind === 'foreground') {
      const prompt = bridge.sendPrompt(sessionId, {
        sessionId,
        prompt: [{ type: 'text', text: 'keep the turn active' }],
      });
      await vi.waitFor(() => expect(handle.agent.promptCalls).toHaveLength(1));
      return { prompt };
    }
    if (kind === 'goal') {
      await handle.agentConnection.extNotification('_o1code/start_turn', {
        sessionId,
        source: 'goal',
      });
      return {};
    }
    await expect(
      handle.agentConnection.extMethod('_o1code/start_turn', {
        sessionId,
        source: 'background_notification',
        turnId: 'notification-1',
        taskId: 'agent-1',
        kind: 'agent',
        sourceTurnId: 'user-1',
        toolUseId: 'call-1',
        label: 'Agent',
        startedAt: 1000,
      }),
    ).resolves.toMatchObject({ accepted: true });
    return {};
  }

  it.each(['foreground', 'background', 'goal'] as const)(
    'serves concurrent loads from memory without transcript reads during a %s turn',
    async (kind) => {
      const promptGate = deferred<void>();
      const handle = makeChannel({
        promptImpl: async () => {
          await promptGate.promise;
          return { stopReason: 'end_turn' };
        },
        extMethodImpl: () => ({ v: 1, events: [], hasMore: false }),
      });
      const bridge = makeBridge({ channelFactory: async () => handle.channel });
      let prompt: Promise<unknown> | undefined;
      try {
        const session = await bridge.spawnOrAttach({ workspaceCwd: WS_A });
        ({ prompt } = await startTurn(kind, handle, bridge, session.sessionId));
        await handle.agentConnection.sessionUpdate({
          sessionId: session.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'live response' },
          },
        });

        const results = await Promise.all([
          bridge.loadSession(loadRequest(session)),
          bridge.loadSession(loadRequest(session)),
        ]);

        expect(transcriptCalls(handle)).toBe(0);
        for (const result of results) {
          expect(JSON.stringify(result.liveJournal)).toContain('live response');
        }
      } finally {
        promptGate.resolve();
        await prompt;
        await bridge.shutdown();
      }
    },
  );

  it.each([
    { kind: 'foreground', emptyPage: false },
    { kind: 'background', emptyPage: false },
    { kind: 'goal', emptyPage: false },
    { kind: 'foreground', emptyPage: true },
    { kind: 'background', emptyPage: true },
    { kind: 'goal', emptyPage: true },
  ] as const)(
    'stops reading when a $kind turn starts during a transcript read (empty page: $emptyPage)',
    async ({ kind, emptyPage }) => {
      const promptGate = deferred<void>();
      const pageGate = deferred<Record<string, unknown>>();
      const stale = persistedPage('stale persisted response');
      let transcriptReads = 0;
      const handle = makeChannel({
        promptImpl: async () => {
          await promptGate.promise;
          return { stopReason: 'end_turn' };
        },
        extMethodImpl: async (method) => {
          if (method !== SERVE_STATUS_EXT_METHODS.sessionTranscript) return {};
          return ++transcriptReads === 1 ? pageGate.promise : stale;
        },
      });
      const bridge = makeBridge({ channelFactory: async () => handle.channel });
      let prompt: Promise<unknown> | undefined;
      try {
        const session = await bridge.spawnOrAttach({ workspaceCwd: WS_A });
        const load = bridge.loadSession(loadRequest(session));
        await vi.waitFor(() => expect(transcriptReads).toBe(1));
        ({ prompt } = await startTurn(kind, handle, bridge, session.sessionId));
        await handle.agentConnection.sessionUpdate({
          sessionId: session.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'new live response' },
          },
        });
        pageGate.resolve(
          emptyPage
            ? { v: 1, events: [], hasMore: true, nextCursor: 'older' }
            : stale,
        );

        const result = await load;
        expect(transcriptReads).toBe(1);
        expect(JSON.stringify(result.liveJournal)).toContain(
          'new live response',
        );
        expect(JSON.stringify(result)).not.toContain(
          'stale persisted response',
        );
      } finally {
        pageGate.resolve(stale);
        promptGate.resolve();
        await prompt;
        await bridge.shutdown();
      }
    },
  );

  it('keeps the memory replay when a Goal turn starts during a read without publishing an event', async () => {
    const pageGate = deferred<Record<string, unknown>>();
    const stale = persistedPage('stale persisted response');
    let transcriptReads = 0;
    const handle = makeChannel({
      extMethodImpl: (method) => {
        if (method !== SERVE_STATUS_EXT_METHODS.sessionTranscript) return {};
        transcriptReads++;
        return pageGate.promise;
      },
    });
    const bridge = makeBridge({ channelFactory: async () => handle.channel });
    try {
      const session = await bridge.spawnOrAttach({ workspaceCwd: WS_A });
      const load = bridge.loadSession(loadRequest(session));
      await vi.waitFor(() => expect(transcriptReads).toBe(1));
      await handle.agentConnection.extNotification('_o1code/start_turn', {
        sessionId: session.sessionId,
        source: 'goal',
      });
      pageGate.resolve(stale);

      expect(JSON.stringify(await load)).not.toContain(
        'stale persisted response',
      );
      expect(transcriptReads).toBe(1);
    } finally {
      pageGate.resolve(stale);
      await bridge.shutdown();
    }
  });

  it('refreshes the persisted page again after a malformed Goal terminal', async () => {
    let transcriptReads = 0;
    const handle = makeChannel({
      extMethodImpl: (method) => {
        if (method !== SERVE_STATUS_EXT_METHODS.sessionTranscript) return {};
        transcriptReads++;
        return persistedPage('persisted history page', true);
      },
    });
    const bridge = makeBridge({ channelFactory: async () => handle.channel });
    try {
      const session = await bridge.spawnOrAttach({ workspaceCwd: WS_A });
      await handle.agentConnection.extNotification('_o1code/start_turn', {
        sessionId: session.sessionId,
        source: 'goal',
      });
      await handle.agentConnection.sessionUpdate({
        sessionId: session.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'active live response' },
        },
      });
      const active = await bridge.loadSession(loadRequest(session));
      expect(transcriptReads).toBe(0);
      expect(JSON.stringify(active.liveJournal)).toContain(
        'active live response',
      );

      await handle.agentConnection.extNotification('_o1code/end_turn', {
        sessionId: session.sessionId,
        source: 'goal',
        reason: '',
        promptId: `${session.sessionId}########1`,
      });
      const refreshed = await bridge.loadSession(loadRequest(session));

      expect(transcriptReads).toBe(1);
      expect(JSON.stringify(refreshed.compactedReplay)).toContain(
        'persisted history page',
      );
      expect(refreshed.liveJournal).toEqual([]);
      expect(refreshed.historyHasMore).toBe(true);
    } finally {
      await bridge.shutdown();
    }
  });

  it('still refreshes from the persisted page once the session is idle', async () => {
    let transcriptReads = 0;
    const handle = makeChannel({
      extMethodImpl: (method) => {
        if (method !== SERVE_STATUS_EXT_METHODS.sessionTranscript) return {};
        transcriptReads++;
        return persistedPage('fresh persisted page');
      },
    });
    const bridge = makeBridge({ channelFactory: async () => handle.channel });
    try {
      const session = await bridge.spawnOrAttach({ workspaceCwd: WS_A });
      const result = await bridge.loadSession(loadRequest(session));
      expect(transcriptReads).toBe(1);
      expect(JSON.stringify(result.compactedReplay)).toContain(
        'fresh persisted page',
      );
    } finally {
      await bridge.shutdown();
    }
  });
});
