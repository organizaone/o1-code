/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Storage,
  fetchGitHubPullRequestIssues,
  fetchGitHubPullRequests,
  readSessionPrs,
  updateSessionPrStates,
  upsertSessionPr,
  type SessionService,
} from '@organizaone/o1-code-core';
import { createWorkspaceRuntimeSessionService } from '../workspace-runtime-storage.js';
import {
  WorkspaceGenerationClosedError,
  createWorkspaceGenerationGuard,
  createWorkspaceRegistry,
  type WorkspaceGenerationGuard,
  type WorkspaceRegistry,
  type WorkspaceRuntime,
} from '../workspace-registry.js';
import {
  DaemonDrainingError,
  SessionArchiveCoordinator,
} from './session-archive.js';
import * as sessionListModule from './session-list.js';
import {
  refreshWorkspaceSessionPrStates,
  resolveSessionPrRefreshIntervalMs,
  startSessionPrRefreshTimer,
} from './session-pr-refresh.js';

// dispose() stops the next tick but does not await the sweep already in
// flight, so a sweep can still be writing under the temp tree while teardown
// walks it — recursive rm then fails with ENOTEMPTY when a file lands between
// its readdir and rmdir. Retry so cleanup waits the writer out instead of
// failing a test that already passed.
const removeTempTree = (dir: string) =>
  fsp.rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  });

vi.mock('@organizaone/o1-code-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@organizaone/o1-code-core')>()),
  fetchGitHubPullRequests: vi.fn(),
  fetchGitHubPullRequestIssues: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn<typeof import('node:fs/promises').readFile>(),
  realReadFile: undefined as
    | undefined
    | typeof import('node:fs/promises').readFile,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  fsMocks.realReadFile = actual.readFile;
  fsMocks.readFile.mockImplementation(actual.readFile);
  return { ...actual, readFile: fsMocks.readFile };
});

const fetchGitHubPullRequestsMock = vi.mocked(fetchGitHubPullRequests);
const fetchGitHubPullRequestIssuesMock = vi.mocked(
  fetchGitHubPullRequestIssues,
);

function closingIssue(number: number, state: 'open' | 'completed' = 'open') {
  return { number, url: `https://github.com/o/r/issues/${number}`, state };
}

function prIssues(
  entries: Array<[number, Array<ReturnType<typeof closingIssue>>]>,
): Awaited<ReturnType<typeof fetchGitHubPullRequestIssues>> {
  return {
    kind: 'ok',
    pullRequests: new Map(
      entries.map(([number, issues]) => [
        number,
        { url: `https://github.com/o/r/pull/${number}`, issues },
      ]),
    ),
  };
}

const SESSION_A = '00000000-0000-4000-8000-000000000001';
const SESSION_B = '00000000-0000-4000-8000-000000000002';
const SESSION_C = '00000000-0000-4000-8000-000000000003';

function pr(number: number, state: string) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/o/r/pull/${number}`,
    author: 'octocat',
    headRefName: `fix/${number}`,
    state: state as 'open' | 'merged' | 'closed',
    reviewDecision: null,
    checks: 'passing' as const,
    updatedAt: 1_800_000_000,
  };
}

describe('resolveSessionPrRefreshIntervalMs', () => {
  it('defaults to five minutes', () => {
    expect(resolveSessionPrRefreshIntervalMs({})).toBe(300_000);
  });

  it('disables on 0 and honors a custom interval', () => {
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '0',
      }),
    ).toBeUndefined();
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '2',
      }),
    ).toBe(120_000);
  });

  it('falls back to the default on garbage', () => {
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: 'later',
      }),
    ).toBe(300_000);
  });

  it('treats a blank value as unset, not as a disable', () => {
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '',
      }),
    ).toBe(300_000);
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '   ',
      }),
    ).toBe(300_000);
  });

  it('falls back to the default below one minute', () => {
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '0.0001',
      }),
    ).toBe(300_000);
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '1',
      }),
    ).toBe(60_000);
  });

  it('falls back to the default when the converted ms overflows the 32-bit timer max', () => {
    // setInterval clamps out-of-range delays to 1 ms; without the fallback a
    // "monthly" interval would become a continuous sweep hot loop.
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '43200',
      }),
    ).toBe(300_000);
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '1e308',
      }),
    ).toBe(300_000);
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '35792',
      }),
    ).toBe(300_000);
    expect(
      resolveSessionPrRefreshIntervalMs({
        O1CODE_SESSION_PR_REFRESH_MINUTES: '35791',
      }),
    ).toBe(2_147_460_000);
  });
});

describe('refreshWorkspaceSessionPrStates', () => {
  let runtimeDir: string;
  let workspaceCwd: string;
  let runtime: WorkspaceRuntime;
  let sessionService: SessionService;
  let markSessionCatalogChanged: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    runtimeDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-pr-refresh-runtime-'),
    );
    workspaceCwd = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-pr-refresh-work-'),
    );
    process.env['O1CODE_RUNTIME_DIR'] = runtimeDir;
    fetchGitHubPullRequestIssuesMock.mockResolvedValue(prIssues([]));
    markSessionCatalogChanged = vi.fn();
    runtime = {
      workspaceId: 'primary',
      workspaceCwd,
      sessionRuntimeBaseDir: runtimeDir,
      primary: true,
      trusted: true,
      env: {
        mode: 'parent-process',
        overlayKeys: [],
        effectiveEnv: { GH_TOKEN: 'x' },
      },
      bridge: { markSessionCatalogChanged },
    } as unknown as WorkspaceRuntime;
    sessionService = createWorkspaceRuntimeSessionService(runtime);
  });

  afterEach(async () => {
    delete process.env['O1CODE_RUNTIME_DIR'];
    fsMocks.readFile.mockImplementation(fsMocks.realReadFile!);
    await fsp.rm(runtimeDir, { recursive: true, force: true });
    await fsp.rm(workspaceCwd, { recursive: true, force: true });
  });

  async function seedSession(sessionId: string): Promise<void> {
    const chatsDir = path.join(
      new Storage(workspaceCwd).getProjectDir(),
      'chats',
    );
    await fsp.mkdir(chatsDir, { recursive: true });
    await fsp.writeFile(
      path.join(chatsDir, `${sessionId}.jsonl`),
      `${JSON.stringify({
        uuid: `${sessionId}-user-1`,
        parentUuid: null,
        sessionId,
        timestamp: '2026-08-01T00:00:00.000Z',
        type: 'user',
        message: { role: 'user', parts: [{ text: 'hello' }] },
        cwd: workspaceCwd,
      })}\n`,
      'utf8',
    );
  }

  it('rewrites open bindings to merged, preserving createdAt', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    const seeded = await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    const persisted = await readSessionPrs(prPath);
    expect(persisted?.[0]?.state).toBe('merged');
    expect(persisted?.[0]?.createdAt).toBe(seeded[0]?.createdAt);
    expect(fetchGitHubPullRequestsMock).toHaveBeenCalledWith(
      workspaceCwd,
      { GH_TOKEN: 'x' },
      { state: 'all', limit: 500, slim: true },
    );
  });

  it("never applies this workspace's state to a binding pointing at another repository", async () => {
    // The metadata route accepts any http(s) pr.url, so a client can bind a
    // foreign-repo PR whose number collides with this workspace's own; the
    // workspace's same-numbered PR state must not leak onto it (a wrong
    // 'merged' would also be permanent — merged entries leave the sweep).
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/other-org/other-repo/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
  });

  it('does not resurrect a sidecar whose session is deleted mid-sweep', async () => {
    // Session deletion unlinks the transcript and sidecar outside the
    // mutation queue. Land the deletion the moment the queued refresh read
    // resolves; without the commit-step guard the write recreates the
    // sidecar at the stale path and it haunts every future sweep.
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    const chatsDir = path.join(
      new Storage(workspaceCwd).getProjectDir(),
      'chats',
    );
    const transcriptPath = path.join(chatsDir, `${SESSION_A}.jsonl`);
    let prPathReads = 0;
    fsMocks.readFile.mockImplementation(async (...args) => {
      const content = await fsMocks.realReadFile!(...args);
      if (args[0] === prPath) {
        prPathReads += 1;
        // Second read is the queued refresh write's own read — the
        // deletion lands right after it captured the contents.
        if (prPathReads === 2) {
          await fsp.unlink(transcriptPath);
          await fsp.unlink(prPath);
        }
      }
      return content;
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect(existsSync(prPath)).toBe(false);
    expect(markSessionCatalogChanged).not.toHaveBeenCalled();
  });

  function attachGuard(target: WorkspaceRuntime): WorkspaceGenerationGuard {
    const guard = createWorkspaceGenerationGuard();
    (target as { generationGuard?: WorkspaceGenerationGuard }).generationGuard =
      guard;
    return guard;
  }

  async function seedOpenBinding(sessionId: string): Promise<string> {
    await seedSession(sessionId);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      sessionId,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    return prPath;
  }

  it('never runs gh for a retired runtime generation', async () => {
    const prPath = await seedOpenBinding(SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    // The timer snapshots the runtime from the registry; a trust/env
    // replacement that lands while the sidecar scan awaits closes its guard,
    // and `gh` must not run with the retired generation's env.
    attachGuard(runtime).close();

    await expect(
      refreshWorkspaceSessionPrStates(runtime),
    ).rejects.toBeInstanceOf(WorkspaceGenerationClosedError);

    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
    expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
    expect(markSessionCatalogChanged).not.toHaveBeenCalled();
  });

  it('commits nothing and notifies nobody once the generation closes mid-sweep', async () => {
    const prPath = await seedOpenBinding(SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    const guard = attachGuard(runtime);
    let prPathReads = 0;
    fsMocks.readFile.mockImplementation(async (...args) => {
      const content = await fsMocks.realReadFile!(...args);
      if (args[0] === prPath) {
        prPathReads += 1;
        // Second read is the queued write's own read: the replacement lands
        // after the sweep already fetched from gh and planned the rewrite.
        if (prPathReads === 2) guard.close();
      }
      return content;
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
    expect(markSessionCatalogChanged).not.toHaveBeenCalled();
  });

  it('defers a sidecar held by an archive lane to the next sweep', async () => {
    const prPath = await seedOpenBinding(SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    const archiveCoordinator = new SessionArchiveCoordinator();
    let release!: () => void;
    // An archive/delete in flight holds the session's exclusive lane across
    // its renames; the commit must not race it.
    const archiving = archiveCoordinator.runExclusiveMany(
      [SESSION_A],
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const held = await refreshWorkspaceSessionPrStates(runtime, undefined, {
      archiveCoordinator,
    });
    expect(held).toEqual({ scanned: 1, updated: 0 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
    expect(markSessionCatalogChanged).not.toHaveBeenCalled();

    release();
    await archiving;
    const retried = await refreshWorkspaceSessionPrStates(runtime, undefined, {
      archiveCoordinator,
    });
    expect(retried).toEqual({ scanned: 1, updated: 1 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('merged');
    expect(markSessionCatalogChanged).toHaveBeenCalledTimes(1);
  });

  it('stops the sweep once the daemon seals session maintenance', async () => {
    const prPath = await seedOpenBinding(SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    const archiveCoordinator = new SessionArchiveCoordinator();
    await archiveCoordinator.sealMaintenanceAndWait();

    await expect(
      refreshWorkspaceSessionPrStates(runtime, undefined, {
        archiveCoordinator,
      }),
    ).rejects.toBeInstanceOf(DaemonDrainingError);

    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
    expect(markSessionCatalogChanged).not.toHaveBeenCalled();
  });

  it('counts only the bindings whose state was rewritten', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    // 42 changes, 43 stays open: counting every pending binding present in
    // the gh page would report two rewrites for one actual change.
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    await upsertSessionPr(prPath, {
      number: 43,
      url: 'https://github.com/o/r/pull/43',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged'), pr(43, 'open')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(
      (await readSessionPrs(prPath))?.map((p) => [p.number, p.state]),
    ).toEqual([
      [42, 'merged'],
      [43, 'open'],
    ]);
  });

  it('invalidates the session-list cache and marks the catalog when a binding changed', async () => {
    // The sidebar refetch is catalog-version-gated and the live-state
    // payload carries no `prs`; a rewrite without this pairing leaves the
    // stale badge on an otherwise-idle workspace indefinitely.
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    const invalidateSpy = vi.spyOn(
      sessionListModule,
      'invalidateWorkspaceSessionListCache',
    );

    try {
      const result = await refreshWorkspaceSessionPrStates(runtime);

      expect(result).toEqual({ scanned: 1, updated: 1 });
      expect(invalidateSpy).toHaveBeenCalledWith({
        runtimeBaseDir: runtimeDir,
        workspaceCwd,
        archiveStates: ['active', 'archived'],
      });
      expect(markSessionCatalogChanged).toHaveBeenCalledTimes(1);
    } finally {
      invalidateSpy.mockRestore();
    }
  });

  it('leaves the cache and catalog untouched when no binding changed', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'open')],
    });
    const invalidateSpy = vi.spyOn(
      sessionListModule,
      'invalidateWorkspaceSessionListCache',
    );

    try {
      const result = await refreshWorkspaceSessionPrStates(runtime);

      expect(result).toEqual({ scanned: 1, updated: 0 });
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(markSessionCatalogChanged).not.toHaveBeenCalled();
    } finally {
      invalidateSpy.mockRestore();
    }
  });

  it('skips the list query when every binding is merged, and every query once their issues are snapshotted', async () => {
    await seedSession(SESSION_A);
    const prPathA = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPathA, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'merged',
    });
    await seedSession(SESSION_B);
    const prPathB = sessionService.getPrSessionPathForArchiveState(
      SESSION_B,
      'active',
    );
    await upsertSessionPr(prPathB, {
      number: 43,
      url: 'https://github.com/o/r/pull/43',
      state: 'merged',
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue(
      prIssues([
        [42, [closingIssue(7, 'completed')]],
        [43, []],
      ]),
    );

    // Merged bindings that predate the issue snapshot get one by-number
    // lookup (legacy sidecars), never the list query.
    const first = await refreshWorkspaceSessionPrStates(runtime);

    expect(first).toEqual({ scanned: 2, updated: 2 });
    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
    expect(fetchGitHubPullRequestIssuesMock).toHaveBeenCalledWith(
      workspaceCwd,
      { GH_TOKEN: 'x' },
      [42, 43],
    );
    expect((await readSessionPrs(prPathA))?.[0]?.issues).toEqual([
      closingIssue(7, 'completed'),
    ]);
    expect((await readSessionPrs(prPathB))?.[0]?.issues).toEqual([]);

    fetchGitHubPullRequestIssuesMock.mockClear();
    const second = await refreshWorkspaceSessionPrStates(runtime);

    expect(second).toEqual({ scanned: 2, updated: 0 });
    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
    expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
  });

  it('snapshots the closing issues of an open binding alongside its state', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    const seeded = await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue(
      prIssues([[42, [closingIssue(7)]]]),
    );

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    const persisted = await readSessionPrs(prPath);
    expect(persisted?.[0]).toMatchObject({
      state: 'merged',
      issues: [closingIssue(7)],
      createdAt: seeded[0]?.createdAt,
    });
    expect(markSessionCatalogChanged).toHaveBeenCalledTimes(1);

    // Closing references change while a PR is open: the next sweep tracks
    // an issue added to the body, and a closed issue's state.
    await updateSessionPrStates(
      prPath,
      new Map([[42, { state: 'open' as const, url: persisted![0]!.url }]]),
    );
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'open')],
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue(
      prIssues([[42, [closingIssue(7, 'completed'), closingIssue(8)]]]),
    );

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 1,
    });
    expect((await readSessionPrs(prPath))?.[0]?.issues).toEqual([
      closingIssue(7, 'completed'),
      closingIssue(8),
    ]);
  });

  it("never applies issues from this workspace's same-numbered PR to a foreign binding", async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/other-org/other-repo/pull/42',
      state: 'merged',
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue(
      prIssues([[42, [closingIssue(7)]]]),
    );

    // The repository cannot resolve a foreign binding, so the lookup
    // converges it with an empty snapshot instead of re-querying it every
    // sweep forever.
    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 1,
    });
    expect((await readSessionPrs(prPath))?.[0]?.issues).toEqual([]);

    fetchGitHubPullRequestIssuesMock.mockClear();
    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 0,
    });
    expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
  });

  it('converges a merged binding the lookup resolves to nothing', async () => {
    // Another repository's merged PR whose number this repository does not
    // have at all: the lookup succeeds with an empty result, and the
    // binding must leave the sweep on that success instead of being
    // re-queried every five minutes.
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 424242,
      url: 'https://github.com/other-org/other-repo/pull/424242',
      state: 'merged',
    });

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 1,
    });
    expect((await readSessionPrs(prPath))?.[0]?.issues).toEqual([]);
    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
    expect(fetchGitHubPullRequestIssuesMock).toHaveBeenCalledTimes(1);

    fetchGitHubPullRequestIssuesMock.mockClear();
    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 0,
    });
    expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
  });

  it('keeps a foreign open binding out of the issue lookup', async () => {
    // The list query names this workspace's repository; an open binding to
    // another repository can never resolve here and must not cost the
    // lookup every sweep.
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/other-org/other-repo/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'open')],
    });

    for (const round of [1, 2]) {
      expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
        scanned: 1,
        updated: 0,
      });
      expect(fetchGitHubPullRequestsMock).toHaveBeenCalledTimes(round);
      expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
    }
    expect((await readSessionPrs(prPath))?.[0]).toMatchObject({
      state: 'open',
    });
    expect((await readSessionPrs(prPath))?.[0]?.issues).toBeUndefined();
  });

  it('converges merged bindings locally when the lookup is structurally impossible', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'merged',
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue({
      kind: 'cli_unavailable',
    });

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 1,
    });
    expect((await readSessionPrs(prPath))?.[0]?.issues).toEqual([]);

    fetchGitHubPullRequestIssuesMock.mockClear();
    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 0,
    });
    expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
  });

  it('converges merged bindings when the cwd is not a git repository or gh has no usable remote', async () => {
    for (const kind of ['not_a_repo', 'repo_unresolved'] as const) {
      const sessionId = kind === 'not_a_repo' ? SESSION_A : SESSION_B;
      await seedSession(sessionId);
      const prPath = sessionService.getPrSessionPathForArchiveState(
        sessionId,
        'active',
      );
      await upsertSessionPr(prPath, {
        number: kind === 'not_a_repo' ? 42 : 43,
        url: `https://github.com/o/r/pull/${kind === 'not_a_repo' ? 42 : 43}`,
        state: 'merged',
      });
      fetchGitHubPullRequestIssuesMock.mockClear();
      fetchGitHubPullRequestIssuesMock.mockResolvedValue({ kind });

      expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
        scanned: kind === 'not_a_repo' ? 1 : 2,
        updated: 1,
      });
      expect((await readSessionPrs(prPath))?.[0]?.issues).toEqual([]);

      fetchGitHubPullRequestIssuesMock.mockClear();
      expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
        scanned: kind === 'not_a_repo' ? 1 : 2,
        updated: 0,
      });
      expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
    }
  });

  it('applies fetched issues to bindings spelled with non-canonical urls', async () => {
    // The bind path accepts any http(s) url: `/files`, `www.`, `http:`,
    // `.diff`, `.patch` all name the same PR and must receive its issues,
    // not a false empty snapshot (which would be permanent for a merged
    // binding).
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    const spellings: Array<[number, string]> = [
      [42, 'http://www.github.com/O/R/pull/42/files'],
      [43, 'https://github.com/o/r/pull/43.diff'],
      [44, 'https://github.com/o/r/pull/44.patch'],
    ];
    for (const [number, url] of spellings) {
      await upsertSessionPr(prPath, { number, url, state: 'merged' });
    }
    fetchGitHubPullRequestIssuesMock.mockResolvedValue(
      prIssues(spellings.map(([number]) => [number, [closingIssue(number)]])),
    );

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 3,
    });
    const persisted = await readSessionPrs(prPath);
    for (const [number, url] of spellings) {
      expect(persisted?.find((entry) => entry.number === number)).toMatchObject(
        { url, issues: [closingIssue(number)] },
      );
    }
  });

  it('refreshes the state of a non-canonically spelled binding during a lookup outage', async () => {
    // The list query reports the canonical url; the write must still ride
    // the entry's own spelling or the sidecar's canonical gate drops it and
    // the badge stays open for as long as the lookup keeps failing.
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    const url = 'http://www.github.com/O/R/pull/42/files';
    await upsertSessionPr(prPath, { number: 42, url, state: 'open' });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue({
      kind: 'failed',
      message: 'HTTP 502',
      gitRoot: workspaceCwd,
    });

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 1,
    });
    expect((await readSessionPrs(prPath))?.[0]).toMatchObject({
      url,
      state: 'merged',
    });
    expect((await readSessionPrs(prPath))?.[0]?.issues).toBeUndefined();
  });

  it('converges a merged foreign binding during a lookup outage', async () => {
    // The list query (run for the open local binding) names the
    // repository; the merged foreign binding can never resolve here, so it
    // converges even while the lookup itself is failing.
    await seedSession(SESSION_A);
    const prPathA = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPathA, {
      number: 42,
      url: 'https://github.com/other-org/other-repo/pull/42',
      state: 'merged',
    });
    await seedSession(SESSION_B);
    const prPathB = sessionService.getPrSessionPathForArchiveState(
      SESSION_B,
      'active',
    );
    await upsertSessionPr(prPathB, {
      number: 43,
      url: 'https://github.com/o/r/pull/43',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(43, 'open')],
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue({
      kind: 'failed',
      message: 'HTTP 502',
      gitRoot: workspaceCwd,
    });

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 2,
      updated: 1,
    });
    expect(fetchGitHubPullRequestIssuesMock).toHaveBeenCalledWith(
      workspaceCwd,
      { GH_TOKEN: 'x' },
      [43],
    );
    expect((await readSessionPrs(prPathA))?.[0]?.issues).toEqual([]);
    expect((await readSessionPrs(prPathB))?.[0]?.issues).toBeUndefined();
  });

  it('keeps retrying a merged binding after a transient lookup failure', async () => {
    // A 5xx or rate limit says nothing about the PR's references; an
    // empty snapshot here would permanently record "fetched, none".
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'merged',
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue({
      kind: 'failed',
      message: 'HTTP 502',
      gitRoot: workspaceCwd,
    });

    for (const round of [1, 2]) {
      expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
        scanned: 1,
        updated: 0,
      });
      expect(fetchGitHubPullRequestIssuesMock).toHaveBeenCalledTimes(round);
    }
    expect((await readSessionPrs(prPath))?.[0]?.issues).toBeUndefined();
  });

  it('runs the list query for a mixed workspace', async () => {
    // One legacy merged binding (issue catch-up only) next to one open
    // binding: the open one still needs its state refreshed.
    await seedSession(SESSION_A);
    const prPathA = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPathA, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'merged',
    });
    await seedSession(SESSION_B);
    const prPathB = sessionService.getPrSessionPathForArchiveState(
      SESSION_B,
      'active',
    );
    await upsertSessionPr(prPathB, {
      number: 43,
      url: 'https://github.com/o/r/pull/43',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(43, 'merged')],
    });

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 2,
      updated: 2,
    });
    expect(fetchGitHubPullRequestsMock).toHaveBeenCalledTimes(1);
    expect((await readSessionPrs(prPathB))?.[0]?.state).toBe('merged');
    expect((await readSessionPrs(prPathA))?.[0]?.issues).toEqual([]);
  });

  it('never runs the issue lookup once the generation closes between the two queries', async () => {
    const prPath = await seedOpenBinding(SESSION_A);
    const guard = attachGuard(runtime);
    fetchGitHubPullRequestsMock.mockImplementation(async () => {
      // A trust/env replacement lands while the list query is in flight.
      guard.close();
      return { kind: 'ok', pullRequests: [pr(42, 'merged')] };
    });

    await expect(
      refreshWorkspaceSessionPrStates(runtime),
    ).rejects.toBeInstanceOf(WorkspaceGenerationClosedError);

    expect(fetchGitHubPullRequestIssuesMock).not.toHaveBeenCalled();
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
    expect(markSessionCatalogChanged).not.toHaveBeenCalled();
  });

  it('still snapshots issues when the list query fails', async () => {
    const prPath = await seedOpenBinding(SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({ kind: 'cli_unavailable' });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue(
      prIssues([[42, [closingIssue(7)]]]),
    );

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 1,
    });
    expect((await readSessionPrs(prPath))?.[0]).toMatchObject({
      state: 'open',
      issues: [closingIssue(7)],
    });
  });

  it('still refreshes states when the issue lookup fails', async () => {
    const prPath = await seedOpenBinding(SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    fetchGitHubPullRequestIssuesMock.mockResolvedValue({
      kind: 'failed',
      message: 'HTTP 502',
      gitRoot: workspaceCwd,
    });

    expect(await refreshWorkspaceSessionPrStates(runtime)).toEqual({
      scanned: 1,
      updated: 1,
    });
    expect((await readSessionPrs(prPath))?.[0]).toMatchObject({
      state: 'merged',
    });
    expect((await readSessionPrs(prPath))?.[0]?.issues).toBeUndefined();
  });

  it('tracks a reopened closed PR back to open', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'closed',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'open')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
  });

  it('swallows gh failures and updates nothing', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'cli_unavailable',
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
  });

  async function seedArchivedSession(sessionId: string): Promise<void> {
    await seedSession(sessionId);
    const chatsDir = path.join(
      new Storage(workspaceCwd).getProjectDir(),
      'chats',
    );
    await fsp.mkdir(path.join(chatsDir, 'archive'), { recursive: true });
    await fsp.rename(
      path.join(chatsDir, `${sessionId}.jsonl`),
      path.join(chatsDir, 'archive', `${sessionId}.jsonl`),
    );
  }

  it('refreshes a sidecar written before the session flushed a transcript', async () => {
    // No transcript: the bind route persists the sidecar before the first
    // flush, and the sweep must still discover it.
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('merged');
  });

  it('updates every pending session with one gh call per workspace', async () => {
    await seedSession(SESSION_A);
    const prPathA = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPathA, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    await seedSession(SESSION_B);
    const prPathB = sessionService.getPrSessionPathForArchiveState(
      SESSION_B,
      'active',
    );
    await upsertSessionPr(prPathB, {
      number: 43,
      url: 'https://github.com/o/r/pull/43',
      state: 'closed',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged'), pr(43, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 2, updated: 2 });
    expect(fetchGitHubPullRequestsMock).toHaveBeenCalledTimes(1);
    expect(fetchGitHubPullRequestsMock).toHaveBeenCalledWith(
      workspaceCwd,
      { GH_TOKEN: 'x' },
      { state: 'all', limit: 500, slim: true },
    );
    expect((await readSessionPrs(prPathA))?.[0]?.state).toBe('merged');
    expect((await readSessionPrs(prPathB))?.[0]?.state).toBe('merged');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'keeps sweeping archived sessions when a sidecar write fails',
    async () => {
      await seedSession(SESSION_A);
      const prPathA = sessionService.getPrSessionPathForArchiveState(
        SESSION_A,
        'active',
      );
      await upsertSessionPr(prPathA, {
        number: 42,
        url: 'https://github.com/o/r/pull/42',
        state: 'open',
      });
      await seedArchivedSession(SESSION_B);
      const prPathB = sessionService.getPrSessionPathForArchiveState(
        SESSION_B,
        'archived',
      );
      await upsertSessionPr(prPathB, {
        number: 43,
        url: 'https://github.com/o/r/pull/43',
        state: 'open',
      });
      fetchGitHubPullRequestsMock.mockResolvedValue({
        kind: 'ok',
        pullRequests: [pr(42, 'merged'), pr(43, 'merged')],
      });

      const chatsDir = path.join(
        new Storage(workspaceCwd).getProjectDir(),
        'chats',
      );
      await fsp.chmod(chatsDir, 0o555);
      try {
        const result = await refreshWorkspaceSessionPrStates(runtime);

        expect(result).toEqual({ scanned: 2, updated: 1 });
        expect((await readSessionPrs(prPathA))?.[0]?.state).toBe('open');
        expect((await readSessionPrs(prPathB))?.[0]?.state).toBe('merged');
      } finally {
        await fsp.chmod(chatsDir, 0o755);
      }
    },
  );

  it('does not write back open for bindings missing from the gh page', async () => {
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 999,
      url: 'https://github.com/o/r/pull/999',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
  });

  it('keeps a closed binding closed when its number is missing from the gh page', async () => {
    // The sibling case seeds 'open', so a regression defaulting gh-absent
    // numbers to 'open' would rewrite nothing and survive it; a 'closed'
    // seed turns red under the same mutation.
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 999,
      url: 'https://github.com/o/r/pull/999',
      state: 'closed',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('closed');
  });

  it('treats a draft PR as open for the state snapshot', async () => {
    // The sidecar snapshot has no 'draft' variant, and isValidSessionPr
    // rejects it — a persisted 'draft' would hide the session's bindings.
    // Seeded 'closed' so the normalization is an observable rewrite.
    await seedSession(SESSION_A);
    const prPath = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPath, {
      number: 44,
      url: 'https://github.com/o/r/pull/44',
      state: 'closed',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(44, 'draft')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');
  });

  it('keeps sweeping when a sidecar is corrupt or unreadable', async () => {
    await seedSession(SESSION_A);
    const prPathA = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPathA, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    // Invalid JSON makes readSessionPrs return null...
    await seedSession(SESSION_B);
    const prPathB = sessionService.getPrSessionPathForArchiveState(
      SESSION_B,
      'active',
    );
    await fsp.writeFile(prPathB, '{invalid', 'utf8');
    // ...and a directory at the path makes it throw (EISDIR). Neither may
    // abort the sweep for the healthy sessions that follow.
    await seedSession(SESSION_C);
    const prPathC = sessionService.getPrSessionPathForArchiveState(
      SESSION_C,
      'active',
    );
    await fsp.mkdir(prPathC, { recursive: true });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect((await readSessionPrs(prPathA))?.[0]?.state).toBe('merged');
    expect(await fsp.readFile(prPathB, 'utf8')).toBe('{invalid');
  });

  it('keeps sweeping when a transcript head has no string cwd', async () => {
    await seedSession(SESSION_A);
    const prPathA = sessionService.getPrSessionPathForArchiveState(
      SESSION_A,
      'active',
    );
    await upsertSessionPr(prPathA, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    // A head that parses as an object but carries no string cwd is
    // inconclusive; it must not abort the whole workspace's sweep.
    const chatsDir = path.join(
      new Storage(workspaceCwd).getProjectDir(),
      'chats',
    );
    await fsp.writeFile(
      path.join(chatsDir, `${SESSION_B}.jsonl`),
      `${JSON.stringify({})}\n`,
      'utf8',
    );
    const prPathB = sessionService.getPrSessionPathForArchiveState(
      SESSION_B,
      'active',
    );
    await upsertSessionPr(prPathB, {
      number: 43,
      url: 'https://github.com/o/r/pull/43',
      state: 'open',
    });
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged'), pr(43, 'merged')],
    });

    const result = await refreshWorkspaceSessionPrStates(runtime);

    expect(result).toEqual({ scanned: 2, updated: 2 });
    expect((await readSessionPrs(prPathA))?.[0]?.state).toBe('merged');
    expect((await readSessionPrs(prPathB))?.[0]?.state).toBe('merged');
  });

  it('does not rewrite sidecars owned by a colliding project', async () => {
    // sanitizeCwd maps every non-alphanumeric to '-', so `my-app` and
    // `my.app` share one chats dir; the sweep must stay on its own side of
    // the collision.
    const parent = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-pr-collide-'),
    );
    try {
      const cwdA = path.join(parent, 'my-app');
      const cwdB = path.join(parent, 'my.app');
      await fsp.mkdir(cwdA, { recursive: true });
      await fsp.mkdir(cwdB, { recursive: true });
      const runtimeA = {
        workspaceId: 'collide-a',
        workspaceCwd: cwdA,
        sessionRuntimeBaseDir: runtimeDir,
        primary: true,
        trusted: true,
        env: { mode: 'parent-process', overlayKeys: [] },
      } as unknown as WorkspaceRuntime;
      const runtimeB = {
        ...runtimeA,
        workspaceId: 'collide-b',
        workspaceCwd: cwdB,
      } as unknown as WorkspaceRuntime;
      const serviceA = createWorkspaceRuntimeSessionService(runtimeA);
      const chatsDir = path.join(new Storage(cwdA).getProjectDir(), 'chats');
      await fsp.mkdir(chatsDir, { recursive: true });
      await fsp.writeFile(
        path.join(chatsDir, `${SESSION_A}.jsonl`),
        `${JSON.stringify({
          uuid: `${SESSION_A}-user-1`,
          parentUuid: null,
          sessionId: SESSION_A,
          timestamp: '2026-08-01T00:00:00.000Z',
          type: 'user',
          message: { role: 'user', parts: [{ text: 'hello' }] },
          cwd: cwdA,
        })}\n`,
        'utf8',
      );
      const prPathA = serviceA.getPrSessionPathForArchiveState(
        SESSION_A,
        'active',
      );
      await upsertSessionPr(prPathA, {
        number: 42,
        url: 'https://github.com/o/r/pull/42',
        state: 'open',
      });
      fetchGitHubPullRequestsMock.mockResolvedValue({
        kind: 'ok',
        pullRequests: [pr(42, 'merged')],
      });

      const result = await refreshWorkspaceSessionPrStates(runtimeB);

      expect(result).toEqual({ scanned: 0, updated: 0 });
      expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
      expect((await readSessionPrs(prPathA))?.[0]?.state).toBe('open');
    } finally {
      await fsp.rm(parent, { recursive: true, force: true });
    }
  });

  it('refreshes a pre-flush sidecar despite a cwd collision (accepted fail-open)', async () => {
    // Same collision as above, but the foreign session has no transcript
    // yet: the belongs-check is inconclusive and deliberately fails open so
    // pre-flush bindings stay refreshable. Harm is bounded — only `state`
    // is rewritten, and the owner's flush reasserts its own project.
    const parent = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-pr-collide-open-'),
    );
    try {
      const cwdA = path.join(parent, 'my-app');
      const cwdB = path.join(parent, 'my.app');
      await fsp.mkdir(cwdA, { recursive: true });
      await fsp.mkdir(cwdB, { recursive: true });
      const runtimeB = {
        workspaceId: 'collide-b',
        workspaceCwd: cwdB,
        sessionRuntimeBaseDir: runtimeDir,
        primary: true,
        trusted: true,
        env: { mode: 'parent-process', overlayKeys: [] },
        bridge: { markSessionCatalogChanged: vi.fn() },
      } as unknown as WorkspaceRuntime;
      const serviceA = createWorkspaceRuntimeSessionService({
        ...runtimeB,
        workspaceId: 'collide-a',
        workspaceCwd: cwdA,
      } as unknown as WorkspaceRuntime);
      const prPathA = serviceA.getPrSessionPathForArchiveState(
        SESSION_A,
        'active',
      );
      await upsertSessionPr(prPathA, {
        number: 42,
        url: 'https://github.com/o/r/pull/42',
        state: 'open',
      });
      fetchGitHubPullRequestsMock.mockResolvedValue({
        kind: 'ok',
        pullRequests: [pr(42, 'merged')],
      });

      const result = await refreshWorkspaceSessionPrStates(runtimeB);

      expect(result).toEqual({ scanned: 1, updated: 1 });
      expect((await readSessionPrs(prPathA))?.[0]?.state).toBe('merged');
    } finally {
      await fsp.rm(parent, { recursive: true, force: true });
    }
  });
});

describe('startSessionPrRefreshTimer', () => {
  let baseDir: string;
  let trustedCwd: string;
  let untrustedCwd: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    baseDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-pr-timer-base-'),
    );
    trustedCwd = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-pr-timer-trusted-'),
    );
    untrustedCwd = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'o1-code-pr-timer-untrusted-'),
    );
    process.env['O1CODE_RUNTIME_DIR'] = baseDir;
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env['O1CODE_RUNTIME_DIR'];
    for (const dir of [baseDir, trustedCwd, untrustedCwd]) {
      await removeTempTree(dir);
    }
  });

  function timerRuntime(
    workspaceId: string,
    workspaceCwd: string,
    trusted: boolean,
  ): WorkspaceRuntime {
    return {
      workspaceId,
      workspaceCwd,
      sessionRuntimeBaseDir: baseDir,
      primary: trusted,
      trusted,
      env: { mode: 'parent-process', overlayKeys: [] },
      bridge: { markSessionCatalogChanged: vi.fn() },
    } as unknown as WorkspaceRuntime;
  }

  async function seedPendingBinding(
    runtime: WorkspaceRuntime,
    sessionId: string,
  ): Promise<string> {
    const service = createWorkspaceRuntimeSessionService(runtime);
    const chatsDir = path.join(
      new Storage(runtime.workspaceCwd).getProjectDir(),
      'chats',
    );
    await fsp.mkdir(chatsDir, { recursive: true });
    await fsp.writeFile(
      path.join(chatsDir, `${sessionId}.jsonl`),
      `${JSON.stringify({
        uuid: `${sessionId}-user-1`,
        parentUuid: null,
        sessionId,
        timestamp: '2026-08-01T00:00:00.000Z',
        type: 'user',
        message: { role: 'user', parts: [{ text: 'hello' }] },
        cwd: runtime.workspaceCwd,
      })}\n`,
      'utf8',
    );
    const prPath = service.getPrSessionPathForArchiveState(sessionId, 'active');
    await upsertSessionPr(prPath, {
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      state: 'open',
    });
    return prPath;
  }

  it('returns undefined when disabled via O1CODE_SESSION_PR_REFRESH_MINUTES=0', () => {
    const registry = createWorkspaceRegistry([
      timerRuntime('trusted', trustedCwd, true),
    ]);

    expect(
      startSessionPrRefreshTimer({
        workspaceRegistry: registry,
        env: { O1CODE_SESSION_PR_REFRESH_MINUTES: '0' },
      }),
    ).toBeUndefined();
  });

  it('sweeps only trusted workspaces after the first-run delay', async () => {
    const trustedRuntime = timerRuntime('trusted', trustedCwd, true);
    const untrustedRuntime = timerRuntime('untrusted', untrustedCwd, false);
    const registry = createWorkspaceRegistry([
      trustedRuntime,
      untrustedRuntime,
    ]);
    const trustedPrPath = await seedPendingBinding(trustedRuntime, SESSION_A);
    const untrustedPrPath = await seedPendingBinding(
      untrustedRuntime,
      SESSION_B,
    );
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    vi.useFakeTimers();

    const handle = startSessionPrRefreshTimer({
      workspaceRegistry: registry,
      env: {},
    });
    expect(handle).toBeDefined();
    // The first sweep is delayed to stay out of boot's way.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000); // crosses the first-run delay
    await vi.waitFor(() => {
      expect(fetchGitHubPullRequestsMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchGitHubPullRequestsMock).toHaveBeenCalledWith(
      trustedCwd,
      undefined,
      { state: 'all', limit: 500, slim: true },
    );
    await vi.waitFor(async () => {
      expect((await readSessionPrs(trustedPrPath))?.[0]?.state).toBe('merged');
    });
    // The untrusted workspace's sidecar must never be read or rewritten.
    expect((await readSessionPrs(untrustedPrPath))?.[0]?.state).toBe('open');

    handle?.dispose();
  });

  it('skips an overlapping tick while a sweep is still running', async () => {
    const trustedRuntime = timerRuntime('trusted', trustedCwd, true);
    const registry = createWorkspaceRegistry([trustedRuntime]);
    const prPath = await seedPendingBinding(trustedRuntime, SESSION_A);
    let releaseFetch!: () => void;
    fetchGitHubPullRequestsMock.mockReturnValue(
      new Promise((resolve) => {
        releaseFetch = () =>
          resolve({ kind: 'ok', pullRequests: [pr(42, 'merged')] });
      }),
    );
    vi.useFakeTimers();

    const handle = startSessionPrRefreshTimer({
      workspaceRegistry: registry,
      env: { O1CODE_SESSION_PR_REFRESH_MINUTES: '1' },
    });
    expect(handle).toBeDefined();

    // The first tick reaches the (hung) gh fetch and holds `running`; every
    // tick that lands while it is in flight must be skipped, not start a
    // second sweep.
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => {
      expect(fetchGitHubPullRequestsMock).toHaveBeenCalledTimes(1);
    });
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(fetchGitHubPullRequestsMock).toHaveBeenCalledTimes(1);

    releaseFetch();
    await vi.waitFor(async () => {
      expect((await readSessionPrs(prPath))?.[0]?.state).toBe('merged');
    });
    handle?.dispose();
  });

  it('stops ticking after dispose', async () => {
    const trustedRuntime = timerRuntime('trusted', trustedCwd, true);
    const registry = createWorkspaceRegistry([trustedRuntime]);
    await seedPendingBinding(trustedRuntime, SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    vi.useFakeTimers();

    const handle = startSessionPrRefreshTimer({
      workspaceRegistry: registry,
      env: {},
    });
    expect(handle).toBeDefined();
    handle?.dispose();

    // Far past the first-run delay and several default intervals: a
    // still-armed timer would have swept long before this point.
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
  });

  it('commits every sweep under the archive lane resolved at tick time', async () => {
    const trustedRuntime = timerRuntime('trusted', trustedCwd, true);
    const registry = createWorkspaceRegistry([trustedRuntime]);
    const prPath = await seedPendingBinding(trustedRuntime, SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    // The daemon parks the coordinator on the serve app, which exists only
    // after the timer starts — so it is looked up per tick, not captured.
    const app: { archiveCoordinator?: SessionArchiveCoordinator } = {};
    const getArchiveCoordinator = vi.fn(() => app.archiveCoordinator);
    vi.useFakeTimers();

    const handle = startSessionPrRefreshTimer({
      workspaceRegistry: registry,
      env: {},
      getArchiveCoordinator,
    });
    app.archiveCoordinator = new SessionArchiveCoordinator();
    const runSharedMany = vi.spyOn(app.archiveCoordinator, 'runSharedMany');

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(async () => {
      expect((await readSessionPrs(prPath))?.[0]?.state).toBe('merged');
    });
    expect(getArchiveCoordinator).toHaveBeenCalled();
    expect(runSharedMany).toHaveBeenCalledWith(
      [SESSION_A],
      expect.any(Function),
    );

    handle?.dispose();
  });

  function attachTimerGuard(
    target: WorkspaceRuntime,
  ): WorkspaceGenerationGuard {
    const guard = createWorkspaceGenerationGuard();
    (target as { generationGuard?: WorkspaceGenerationGuard }).generationGuard =
      guard;
    return guard;
  }

  it('retries a workspace on the next tick after its sweep throws', async () => {
    // A workspace whose sweep throws (non-draining: here a generation retired
    // mid-sweep) must not disarm the timer; the next tick retries it.
    const runtime = timerRuntime('trusted', trustedCwd, true);
    const prPath = await seedPendingBinding(runtime, SESSION_A);
    fetchGitHubPullRequestsMock.mockResolvedValue({
      kind: 'ok',
      pullRequests: [pr(42, 'merged')],
    });
    const registry = {
      listAll: () => [runtime],
    } as unknown as WorkspaceRegistry;
    const closedGuard = attachTimerGuard(runtime);
    closedGuard.close();
    const assertOpen = vi.spyOn(closedGuard, 'assertOpen');
    vi.useFakeTimers();

    const handle = startSessionPrRefreshTimer({
      workspaceRegistry: registry,
      env: {},
    });

    // Tick 1: the guard assert sits after the real-fs sidecar scan, so wait
    // on the assert itself before concluding the tick threw.
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(
      () => {
        expect(assertOpen).toHaveBeenCalled();
      },
      { timeout: 30_000 },
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchGitHubPullRequestsMock).not.toHaveBeenCalled();
    expect((await readSessionPrs(prPath))?.[0]?.state).toBe('open');

    // Tick 2: the successor generation is open, and the sweep lands.
    attachTimerGuard(runtime);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await vi.waitFor(
      async () => {
        expect((await readSessionPrs(prPath))?.[0]?.state).toBe('merged');
      },
      { timeout: 30_000 },
    );
    expect(fetchGitHubPullRequestsMock).toHaveBeenCalledTimes(1);
    handle?.dispose();
  });
});
