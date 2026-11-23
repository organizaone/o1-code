/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionOrganizationService,
  GROUP_COLOR_OPTIONS,
} from '@organizaone/o1-code-core/services/session-organization-service.js';
import { Storage } from '@organizaone/o1-code-core/config/storage.js';
import { SessionService } from '@organizaone/o1-code-core';
import type {
  AcpSessionBridge,
  BridgeSessionSummary,
} from '../acp-session-bridge.js';
import {
  isPersistedSessionCursor,
  listWorkspaceSessionsForResponse,
} from './session-list.js';

describe('merged session catalog pagination', () => {
  let directory: string;
  let workspaceCwd: string;
  let runtimeBaseDir: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'session-catalog-'));
    workspaceCwd = path.join(directory, 'workspace');
    runtimeBaseDir = path.join(directory, 'runtime');
    await fs.mkdir(workspaceCwd);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  function summary(index: number): BridgeSessionSummary {
    return {
      sessionId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      workspaceCwd,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      clientCount: 1,
      hasActivePrompt: false,
    };
  }

  async function persist(session: BridgeSessionSummary): Promise<void> {
    const chats = path.join(
      new Storage(workspaceCwd, runtimeBaseDir).getProjectDir(),
      'chats',
    );
    await fs.mkdir(chats, { recursive: true });
    const file = path.join(chats, `${session.sessionId}.jsonl`);
    await fs.writeFile(
      file,
      `${JSON.stringify({
        uuid: `${session.sessionId}-user`,
        parentUuid: null,
        sessionId: session.sessionId,
        timestamp: session.createdAt,
        type: 'user',
        message: { role: 'user', parts: [{ text: 'stored prompt' }] },
        cwd: workspaceCwd,
      })}\n`,
    );
    const time = new Date(session.createdAt);
    await fs.utimes(file, time, time);
  }

  function bridgeFor(sessions: BridgeSessionSummary[]) {
    const list = vi.fn(() => sessions);
    return {
      list,
      bridge: { listWorkspaceSessions: list } as unknown as AcpSessionBridge,
    };
  }

  function chatsDir(): string {
    return path.join(
      new Storage(workspaceCwd, runtimeBaseDir).getProjectDir(),
      'chats',
    );
  }

  function prUrl(number: number): string {
    return `https://github.com/example/project/pull/${number}`;
  }

  async function writeSidecars(
    session: BridgeSessionSummary,
    sidecars: { worktree?: string; prs?: number[] },
  ): Promise<void> {
    const chats = chatsDir();
    await fs.mkdir(chats, { recursive: true });
    if (sidecars.worktree !== undefined) {
      await fs.writeFile(
        path.join(chats, `${session.sessionId}.worktree.json`),
        JSON.stringify({
          slug: sidecars.worktree,
          worktreePath: path.join(directory, sidecars.worktree),
          worktreeBranch: `branch-${sidecars.worktree}`,
          originalCwd: workspaceCwd,
          originalBranch: 'main',
          originalHeadCommit: 'head-sha',
        }),
      );
    }
    if (sidecars.prs !== undefined) {
      await fs.writeFile(
        path.join(chats, `${session.sessionId}.pr.json`),
        JSON.stringify({
          prs: sidecars.prs.map((number) => ({
            number,
            url: prUrl(number),
            createdAt: session.createdAt,
            state: 'merged',
          })),
        }),
      );
    }
  }

  function spySidecarPaths() {
    return {
      worktree: vi.spyOn(
        SessionService.prototype,
        'getWorktreeSessionPathForArchiveState',
      ),
      pr: vi.spyOn(SessionService.prototype, 'getPrSessionPathForArchiveState'),
    };
  }

  it.each([undefined, 'organized'] as const)(
    'reads sidecars only for the rows of the returned page (%s)',
    async (view) => {
      const first = summary(2);
      const second = summary(1);
      const liveOnly = summary(0);
      await persist(first);
      await persist(second);
      const { bridge } = bridgeFor([liveOnly]);
      const options = { size: 1, ...(view ? { view } : {}) };
      const readOptions = { runtimeBaseDir, paginateMerged: true };
      const reads = spySidecarPaths();

      const firstPage = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        options,
        readOptions,
      );
      expect(firstPage.sessions.map((row) => row.sessionId)).toEqual([
        first.sessionId,
      ]);
      expect(reads.worktree.mock.calls).toEqual([[first.sessionId, 'active']]);
      expect(reads.pr.mock.calls).toEqual([[first.sessionId, 'active']]);

      const secondPage = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        { ...options, cursor: firstPage.nextCursor },
        readOptions,
      );
      const lastPage = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        { ...options, cursor: secondPage.nextCursor },
        readOptions,
      );
      expect(secondPage.sessions.map((row) => row.sessionId)).toEqual([
        second.sessionId,
      ]);
      expect(lastPage.sessions.map((row) => row.sessionId)).toEqual([
        liveOnly.sessionId,
      ]);
      expect(lastPage.nextCursor).toBeUndefined();
      expect(reads.worktree.mock.calls).toEqual([
        [first.sessionId, 'active'],
        [second.sessionId, 'active'],
      ]);
      expect(reads.pr.mock.calls).toEqual([
        [first.sessionId, 'active'],
        [second.sessionId, 'active'],
        [liveOnly.sessionId, 'active'],
      ]);
    },
  );

  it.each([undefined, 'organized'] as const)(
    'keeps page membership, cursors and sidecar fields across pages (%s)',
    async (view) => {
      const [liveOnly, plain, merged, stored] = [0, 1, 2, 3].map(summary);
      for (const session of [plain, merged, stored]) await persist(session);
      await writeSidecars(stored, { worktree: 'stored', prs: [30] });
      await writeSidecars(merged, { worktree: 'merged', prs: [20, 21] });
      await writeSidecars(liveOnly, { prs: [10] });
      const { bridge } = bridgeFor([
        // The live entry knows one sidecar binding plus a newer one of its own.
        {
          ...merged,
          prs: [
            { number: 21, url: prUrl(21), state: 'open' },
            { number: 22, url: prUrl(22) },
          ],
        },
        { ...liveOnly, prs: [{ number: 11, url: prUrl(11) }] },
      ]);
      const options = { size: 2, ...(view ? { view } : {}) };
      const readOptions = { runtimeBaseDir, paginateMerged: true };

      const firstPage = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        options,
        readOptions,
      );
      expect(firstPage.nextCursor).toEqual(expect.any(String));
      const lastPage = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        { ...options, cursor: firstPage.nextCursor },
        readOptions,
      );
      expect(lastPage.nextCursor).toBeUndefined();

      const rows = [...firstPage.sessions, ...lastPage.sessions];
      expect(rows.map((row) => row.sessionId)).toEqual(
        [stored, merged, plain, liveOnly].map((row) => row.sessionId),
      );
      expect(firstPage.sessions).toHaveLength(2);
      const fields = rows.map((row) => ({
        worktree: row.worktree?.slug,
        prs: row.prs?.map((pr) => [pr.number, pr.state]),
      }));
      expect(fields).toEqual([
        { worktree: 'stored', prs: [[30, 'merged']] },
        {
          worktree: 'merged',
          prs: [
            [20, 'merged'],
            [21, 'merged'],
            [22, undefined],
          ],
        },
        { worktree: undefined, prs: undefined },
        {
          worktree: undefined,
          prs: [
            [10, 'merged'],
            [11, undefined],
          ],
        },
      ]);
    },
  );

  it('paginates persisted and live-only rows without dropping or duplicating merged rows', async () => {
    await persist(summary(0));
    await persist(summary(2));
    const live = [1, 2, 3, 4, 5].map(summary);
    live[1] = { ...live[1]!, updatedAt: summary(6).createdAt };
    const { bridge } = bridgeFor(live);
    const readOptions = { runtimeBaseDir, paginateMerged: true };

    const first = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { size: 2 },
      readOptions,
    );
    expect(first.sessions.map((session) => session.sessionId)).toEqual(
      [2, 5].map((index) => summary(index).sessionId),
    );
    expect(first.sessions[0]?.clientCount).toBe(1);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { size: 2, cursor: first.nextCursor },
      readOptions,
    );
    expect(second.sessions.map((session) => session.sessionId)).toEqual(
      [4, 3].map((index) => summary(index).sessionId),
    );
    expect(second.nextCursor).toEqual(expect.any(String));

    const last = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { size: 2, cursor: second.nextCursor },
      readOptions,
    );
    expect(last.sessions.map((session) => session.sessionId)).toEqual(
      [1, 0].map((index) => summary(index).sessionId),
    );
    expect(last.nextCursor).toBeUndefined();
  });

  it.each([
    { options: undefined, expectedSize: 20 },
    { options: { size: 1_000 }, expectedSize: 100 },
  ])(
    'bounds live-only pages to $expectedSize rows',
    async ({ options, expectedSize }) => {
      const { bridge } = bridgeFor(
        Array.from({ length: 101 }, (_, i) => summary(i)),
      );

      const result = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        options,
        { runtimeBaseDir, paginateMerged: true },
      );

      expect(result.sessions).toHaveLength(expectedSize);
      expect(result.nextCursor).toEqual(expect.any(String));
    },
  );

  it('continues live-only organized pages when merged pagination is enabled', async () => {
    const { bridge } = bridgeFor([summary(0), summary(1), summary(2)]);
    const options = { size: 1, view: 'organized' as const, group: 'all' };
    const readOptions = { runtimeBaseDir, paginateMerged: true };
    const seen: string[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 3; page++) {
      const result = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        { ...options, cursor },
        readOptions,
      );
      expect(result.sessions).toHaveLength(1);
      seen.push(result.sessions[0]!.sessionId);
      cursor = result.nextCursor;
      if (page < 2) expect(cursor).toEqual(expect.any(String));
    }

    expect(seen).toEqual([2, 1, 0].map((index) => summary(index).sessionId));
    expect(cursor).toBeUndefined();
  });

  it('keeps legacy organized live-only rows on the first page only', async () => {
    const { bridge } = bridgeFor([summary(0), summary(1), summary(2)]);
    const options = { size: 1, view: 'organized' as const, group: 'all' };
    const first = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      options,
      { runtimeBaseDir },
    );
    expect(first.sessions.map((row) => row.sessionId)).toEqual([
      summary(2).sessionId,
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { ...options, cursor: first.nextCursor },
      { runtimeBaseDir },
    );
    expect(second.sessions).toEqual([]);
    expect(second.nextCursor).toBeUndefined();
  });

  it('rejects an unfiltered legacy cursor as a metadata cursor', async () => {
    const { bridge } = bridgeFor([]);
    await expect(
      listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        { cursor: '40' },
        { runtimeBaseDir, paginateMerged: true },
      ),
    ).rejects.toThrow('not a valid metadata cursor');
  });

  it('rejects an organized cursor when switching to activity ordering', async () => {
    await Promise.all([0, 1, 2].map((index) => persist(summary(index))));
    vi.spyOn(
      SessionOrganizationService.prototype,
      'readSnapshot',
    ).mockResolvedValue({
      groups: [],
      sessions: new Map([
        [
          summary(0).sessionId,
          {
            groupId: null,
            color: null,
            isPinned: true,
            updatedAt: summary(0).createdAt,
          },
        ],
      ]),
    });
    const { bridge } = bridgeFor([]);
    const readOptions = { runtimeBaseDir, paginateMerged: true };
    const first = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { size: 1, view: 'organized' },
      readOptions,
    );
    expect(first.sessions.map((row) => row.sessionId)).toEqual([
      summary(0).sessionId,
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    await expect(
      listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        { size: 1, cursor: first.nextCursor },
        readOptions,
      ),
    ).rejects.toThrow('not a valid metadata cursor');
  });

  describe.each(['organized', 'metadata'] as const)(
    '%s cursor context',
    (kind) => {
      it.each([true, false])(
        'rejects a change from paginateMerged=%s',
        async (paginateMerged) => {
          const { bridge } = bridgeFor([summary(0), summary(1), summary(2)]);
          const options =
            kind === 'organized'
              ? { size: 1, view: 'organized' as const }
              : { size: 1, sourceType: 'default' };
          const first = await listWorkspaceSessionsForResponse(
            bridge,
            workspaceCwd,
            options,
            { runtimeBaseDir, paginateMerged },
          );
          expect(first.nextCursor).toEqual(expect.any(String));
          await expect(
            listWorkspaceSessionsForResponse(
              bridge,
              workspaceCwd,
              { ...options, cursor: first.nextCursor },
              { runtimeBaseDir, paginateMerged: !paginateMerged },
            ),
          ).rejects.toThrow(`not a valid ${kind} cursor`);
        },
      );

      it('rejects a foreign family marker even when the cursor structure matches', async () => {
        const { bridge } = bridgeFor([summary(0), summary(1)]);
        const options =
          kind === 'organized'
            ? { size: 1, view: 'organized' as const }
            : { size: 1 };
        const readOptions = { runtimeBaseDir, paginateMerged: true };
        const first = await listWorkspaceSessionsForResponse(
          bridge,
          workspaceCwd,
          options,
          readOptions,
        );
        expect(first.nextCursor).toEqual(expect.any(String));
        const payload = JSON.parse(
          Buffer.from(first.nextCursor!, 'base64url').toString('utf8'),
        );
        payload.catalogKind = kind === 'organized' ? 'metadata' : 'organized';
        const cursor = Buffer.from(JSON.stringify(payload)).toString(
          'base64url',
        );
        await expect(
          listWorkspaceSessionsForResponse(
            bridge,
            workspaceCwd,
            { ...options, cursor },
            readOptions,
          ),
        ).rejects.toThrow(`not a valid ${kind} cursor`);
      });

      it.each([true, false])(
        'accepts marker-free pre-upgrade cursors with paginateMerged=%s',
        async (paginateMerged) => {
          await Promise.all([0, 1, 2].map((index) => persist(summary(index))));
          const { bridge } = bridgeFor([]);
          const options =
            kind === 'organized'
              ? { size: 1, view: 'organized' as const }
              : { size: 1, sourceType: 'default' };
          const readOptions = { runtimeBaseDir, paginateMerged };
          const first = await listWorkspaceSessionsForResponse(
            bridge,
            workspaceCwd,
            options,
            readOptions,
          );
          expect(first.nextCursor).toEqual(expect.any(String));
          const payload = JSON.parse(
            Buffer.from(first.nextCursor!, 'base64url').toString('utf8'),
          );
          delete payload.catalogKind;
          delete payload.paginateMerged;
          const cursor = Buffer.from(JSON.stringify(payload)).toString(
            'base64url',
          );
          const second = await listWorkspaceSessionsForResponse(
            bridge,
            workspaceCwd,
            { ...options, cursor },
            readOptions,
          );
          expect(second.sessions.map((row) => row.sessionId)).toEqual([
            summary(1).sessionId,
          ]);
          expect(second.nextCursor).toEqual(expect.any(String));
        },
      );
    },
  );

  it('returns groups from the same snapshot used to organize rows', async () => {
    await persist(summary(0));
    const { bridge } = bridgeFor([]);
    const groups = [
      {
        id: 'group-1',
        name: 'Group',
        color: 'blue' as const,
        order: 0,
        createdAt: summary(0).createdAt,
        updatedAt: summary(0).createdAt,
      },
    ];
    const snapshot = vi
      .spyOn(SessionOrganizationService.prototype, 'readSnapshot')
      .mockResolvedValue({
        groups,
        sessions: new Map([
          [
            summary(0).sessionId,
            {
              groupId: 'group-1',
              color: null,
              isPinned: false,
              updatedAt: summary(0).createdAt,
            },
          ],
        ]),
      });
    const result = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { view: 'organized' },
      { runtimeBaseDir, paginateMerged: true, includeGroups: true },
    );
    expect(snapshot).toHaveBeenCalledOnce();
    expect(result.sessions[0]?.groupId).toBe('group-1');
    expect(result.groups).toEqual({
      groups,
      colorOptions: [...GROUP_COLOR_OPTIONS],
    });
  });

  it('honors persisted-only reads without querying the live bridge', async () => {
    await persist(summary(0));
    await persist(summary(2));
    const { bridge, list } = bridgeFor([summary(3)]);

    const result = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { size: 1 },
      { runtimeBaseDir, paginateMerged: true, mergeLive: false },
    );

    expect(result.sessions.map((session) => session.sessionId)).toEqual([
      summary(2).sessionId,
    ]);
    expect(result.sessions[0]?.clientCount).toBe(0);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(list).not.toHaveBeenCalled();
  });

  it('preserves the legacy first-page live overlay unless explicitly enabled', async () => {
    await persist(summary(0));
    const { bridge } = bridgeFor([summary(1), summary(2)]);

    const result = await listWorkspaceSessionsForResponse(
      bridge,
      workspaceCwd,
      { size: 1 },
      { runtimeBaseDir },
    );

    expect(result.sessions.map((session) => session.sessionId)).toEqual(
      [2, 1, 0].map((index) => summary(index).sessionId),
    );
    expect(result.nextCursor).toBeUndefined();
  });

  describe('persisted cursor', () => {
    const readOptions = () => ({ runtimeBaseDir, mergeLive: false });

    it('pages through sessions that share an mtime without skipping any', async () => {
      const sessions = [0, 1, 2].map((index) => ({
        ...summary(index),
        createdAt: summary(0).createdAt,
      }));
      await Promise.all(sessions.map(persist));
      const { bridge } = bridgeFor([]);

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const result = await listWorkspaceSessionsForResponse(
          bridge,
          workspaceCwd,
          { size: 1, ...(cursor !== undefined ? { cursor } : {}) },
          readOptions(),
        );
        seen.push(...result.sessions.map((session) => session.sessionId));
        cursor = result.nextCursor;
        if (cursor === undefined) break;
        expect(isPersistedSessionCursor(cursor)).toBe(true);
      }

      expect(seen).toEqual(sessions.map((session) => session.sessionId));
    });

    it('still accepts a bare mtime cursor', async () => {
      await Promise.all([0, 1, 2].map((index) => persist(summary(index))));
      const { bridge } = bridgeFor([]);

      const result = await listWorkspaceSessionsForResponse(
        bridge,
        workspaceCwd,
        { cursor: String(Date.parse(summary(1).createdAt)) },
        readOptions(),
      );

      expect(result.sessions.map((session) => session.sessionId)).toEqual([
        summary(0).sessionId,
      ]);
    });

    it('rejects a malformed cursor', async () => {
      const { bridge } = bridgeFor([]);
      for (const cursor of ['abc', '|a.jsonl', '1|', '1|a|b', '-1|a.jsonl']) {
        expect(isPersistedSessionCursor(cursor)).toBe(false);
        await expect(
          listWorkspaceSessionsForResponse(
            bridge,
            workspaceCwd,
            { cursor },
            readOptions(),
          ),
        ).rejects.toThrow('not a valid persisted cursor');
      }
    });
  });
});
