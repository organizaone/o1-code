// Copyright 2026 Qwen Team
// Modified by the o1-code project; see NOTICE.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** `gitProbe`'s answer: the split cleanup's two refusal tests steer. */
type ProbeAnswer = {
  out: string | null;
  status: number | null;
  refusal: string | null;
};

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  existsSync: vi.fn((_path: string): boolean => false),
  lstatSync: vi.fn(
    (): { isSymbolicLink: () => boolean; isDirectory: () => boolean } => ({
      isSymbolicLink: () => false,
      isDirectory: () => true,
    }),
  ),
  // The return type is declared so `mockReturnValue` can take string arrays —
  // the sweep-retention tests hand it the tmp-dir listing.
  readdirSync: vi.fn((_path: string): string[] => []),
  readFileSync: vi.fn((_path: string): string => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }),
  // statSync drives retention's mtime signal (runEpochMs + the per-entry
  // comparison); unmocked it hit the REAL filesystem and the signal could
  // only ever fail open here. The default is the same fail-open
  // throw readFileSync carries.
  statSync: vi.fn((_path: string): { mtimeMs: number } => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }),
  // realpathSync is redirectedAncestor's canonicalisation probe. Unmocked it
  // hit the REAL filesystem, and on Windows each call on the '/repo/…'
  // fixture spellings — drive-relative there — re-read the spied
  // process.cwd() through win32 drive resolution, so the cwd-once witness
  // counted 9 such reads against the expected 1. The default is the
  // same fail-open throw statSync carries: every fixture path is nonexistent.
  realpathSync: vi.fn((_path: string): string => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }),
  rmSync: vi.fn(),
  writeStdoutLine: vi.fn(),
  writeStderrLine: vi.fn(),
  clearReviewWorktreeLease: vi.fn(),
  readReviewWorktreeLease: vi.fn(
    (_repositoryRoot: string, _target: string): unknown => null,
  ),
  reviewLeaseHeldByAnotherSession: vi.fn((_lease: unknown): boolean => false),
  // cleanup's two remaining git spawns go through `lib/git`'s gated wrappers:
  // both resolve their repository from `process.cwd()`, and a launch directory
  // inside a review temp dir is one the reviewed code can point elsewhere.
  git: vi.fn((..._args: string[]): string => ''),
  // The probe, not `gitOpt`/`refExists`: a launch-dir refusal has to stay
  // distinguishable from git's own "no such branch" and "nothing to prune",
  // which is what the two refusal tests below steer. `status: 0` is the
  // `refExists` default this replaces — the branch leg deletes.
  gitProbe: vi.fn(
    (..._args: string[]): ProbeAnswer => ({
      out: '',
      status: 0,
      refusal: null,
    }),
  ),
  // The parameter is declared so `mock.calls` is typed `[string][]` rather than
  // `[][]` — the paths it was asked to free are the assertion in the sweep test.
  releaseWorktree: vi.fn((_path: string) => ({
    existed: false,
    freed: false,
    reason: undefined,
  })),
  ghApiAll: vi.fn((_path: string): unknown[] => []),
  currentUser: vi.fn(() => 'reviewer'),
  setGhHost: vi.fn(),
  getGhHost: vi.fn((): string | undefined => undefined),
}));

// The fixtures below key on POSIX path literals (`/repo/.o1-code/tmp/…`), but
// cleanup.ts and the helpers it calls (redirectedAncestor, promptRecordDir,
// the deadline readers) run those strings through node:path. On Windows that
// would spell them with a drive letter and backslashes, so no literal-keyed
// mock or assertion could ever match. Pin POSIX semantics for this module
// graph; on POSIX hosts this is the identity.
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return { ...actual, ...actual.posix, default: actual.posix };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    default: { ...actual, execFileSync: mocks.execFileSync },
    execFileSync: mocks.execFileSync,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mocks.existsSync,
      lstatSync: mocks.lstatSync,
      readdirSync: mocks.readdirSync,
      readFileSync: mocks.readFileSync,
      statSync: mocks.statSync,
      realpathSync: mocks.realpathSync,
      rmSync: mocks.rmSync,
    },
    existsSync: mocks.existsSync,
    lstatSync: mocks.lstatSync,
    readdirSync: mocks.readdirSync,
    readFileSync: mocks.readFileSync,
    statSync: mocks.statSync,
    realpathSync: mocks.realpathSync,
    rmSync: mocks.rmSync,
  };
});

vi.mock('../../utils/stdioHelpers.js', () => ({
  writeStdoutLine: mocks.writeStdoutLine,
  writeStderrLine: mocks.writeStderrLine,
}));

vi.mock('../../services/review-worktree-lease.js', () => ({
  clearReviewWorktreeLease: mocks.clearReviewWorktreeLease,
  readReviewWorktreeLease: mocks.readReviewWorktreeLease,
  // The found-at variant the holder-skip message uses: delegate to the same
  // mock so `mockReturnValueOnce` steering and call assertions reach both.
  readReviewWorktreeLeaseAt: (repositoryRoot: string, target: string) => {
    const lease = mocks.readReviewWorktreeLease(repositoryRoot, target);
    return lease
      ? {
          lease,
          path: `${repositoryRoot}/.o1-code/review-leases/o1-code-review-lease-${target}.json`,
        }
      : null;
  },
  reviewLeaseHeldByAnotherSession: mocks.reviewLeaseHeldByAnotherSession,
  reviewLeasePath: (repositoryRoot: string, target: string) =>
    `${repositoryRoot}/.o1-code/review-leases/o1-code-review-lease-${target}.json`,
  isReviewLeaseFile: (fileName: string) =>
    /^o1-code-review-lease-pr-\d+\.json$/.test(fileName),
}));

vi.mock('./lib/git.js', () => ({
  releaseWorktree: mocks.releaseWorktree,
  git: mocks.git,
  gitProbe: mocks.gitProbe,
}));

vi.mock('./lib/gh.js', () => ({
  ghApiAll: mocks.ghApiAll,
  currentUser: mocks.currentUser,
  setGhHost: mocks.setGhHost,
  getGhHost: mocks.getGhHost,
}));

vi.mock('./lib/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/paths.js')>();
  return {
    ...actual,
    worktreePath: (prNumber: string) =>
      `/repo/.o1-code/tmp/review-pr-${prNumber}`,
    probeWorktreePath: (path: string) => `${path}-probe`,
    baseWorktreePath: (path: string) => `${path}-base`,
    scratchWorktreePrefix: (path: string) => `${path}-scratch-`,
    reviewBranch: (prNumber: string) => `o1-code-review/pr-${prNumber}`,
    LEASE_PREFIX: 'o1-code-review-lease-',
    REVIEW_TMP_DIR: '/repo/.o1-code/tmp',
    tmpFile: (target: string, suffix: string) =>
      `/repo/.o1-code/tmp/o1-code-review-${target}-${suffix}`,
    tmpPrefix: (target: string) => `o1-code-review-${target}-`,
  };
});

import {
  findUnsanctionedIssueComments,
  findUnsanctionedReviews,
  runCleanup,
  type RawIssueComment,
  type RawReview,
} from './cleanup.js';

// The deleted-cwd witness creates and removes a REAL directory, but node:fs
// is mocked module-wide above — reach the real module through importActual.
const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');

describe('runCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` clears calls, not implementations: a `mockReturnValue`
    // set in one test would otherwise decide what the next one's directory
    // sweep sees.
    mocks.readdirSync.mockReturnValue([]);
    mocks.lstatSync.mockReturnValue({
      isSymbolicLink: () => false,
      isDirectory: () => true,
    });
    mocks.existsSync.mockReturnValue(false);
    // Implementations survive clearAllMocks — restore the fail-open throw
    // so one retention test's mtimes cannot leak into the next test. The
    // readFileSync default is the same story: a leaked
    // marker-returning implementation short-circuits the retention `||`
    // on the marker signal, and the mtime/plan-missing branches under
    // test never even evaluate.
    mocks.statSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mocks.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mocks.realpathSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    // Same leak class for the listing: the retention tests install
    // path-dependent implementations, and a later test reading the declared
    // `[]` default would otherwise inherit them.
    mocks.readdirSync.mockImplementation((_path: string): string[] => []);
    // Implementations survive clearAllMocks, and both refusal tests below
    // install one: restore the branch-exists / no-prune-failure default.
    mocks.gitProbe.mockReturnValue({ out: '', status: 0, refusal: null });
    mocks.releaseWorktree.mockReturnValue({
      existed: false,
      freed: false,
      reason: undefined,
    });
    // clearAllMocks keeps implementations a prior test set — drop them so a
    // throwing rmSync cannot leak into tests that expect deletion to work.
    mocks.rmSync.mockReset();
  });

  it('spares THIS run\u2019s stop sidecar, sweeps a foreign one', () => {
    // The PR stop path writes the sidecar and runs cleanup in the same
    // breath, and the parent's first poll is up to 250 ms away — swept
    // here, no reader could ever observe the decision and a decided round
    // exited 1 (seen in human review). Kept only under a matching runId;
    // foreign or unstamped residue sweeps as before.
    const prev = process.env['O1CODE_REVIEW_RUN_ID'];
    process.env['O1CODE_REVIEW_RUN_ID'] = 'run-A';
    try {
      mocks.existsSync.mockReturnValue(true);
      mocks.readdirSync.mockImplementation((p: string): string[] =>
        String(p).endsWith('tmp') ? ['o1-code-review-pr-9-stop.json'] : [],
      );
      mocks.readFileSync.mockImplementation((p: string) => {
        if (String(p).endsWith('o1-code-review-pr-9-stop.json')) {
          return JSON.stringify({ reason: 'up-to-date', runId: 'run-A' });
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      runCleanup('pr-9');
      expect(mocks.rmSync).not.toHaveBeenCalledWith(
        expect.stringContaining('o1-code-review-pr-9-stop.json'),
        expect.anything(),
      );

      mocks.rmSync.mockClear();
      process.env['O1CODE_REVIEW_RUN_ID'] = 'run-B';
      runCleanup('pr-9');
      expect(mocks.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('o1-code-review-pr-9-stop.json'),
        expect.anything(),
      );
    } finally {
      if (prev === undefined) delete process.env['O1CODE_REVIEW_RUN_ID'];
      else process.env['O1CODE_REVIEW_RUN_ID'] = prev;
    }
  });

  it('refuses the bare `pr` target — its prefix engulfs every PR family', () => {
    // R20-4 follow-up: `tmpPrefix('pr')` is `o1-code-review-pr-`, a strict
    // prefix of EVERY PR round's family, and the lease guard lives inside
    // the `pr-<n>` branch a bare `pr` never enters — one `cleanup pr` swept
    // every PR's artifacts at once, unguarded. A repo-root file literally
    // named `pr` derives exactly this token.
    runCleanup('pr');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('Refusing to clean target "pr"'),
    );
    expect(mocks.rmSync).not.toHaveBeenCalled();
    // The numbered form is untouched.
    expect(() => runCleanup('pr-123')).not.toThrow();
  });

  it.skipIf(process.platform === 'win32')(
    'degrades instead of throwing when the process cwd is deleted out from under it',
    () => {
      // Gated off Windows (R28-9): the fixture deletes the process's own
      // cwd, which Windows forbids — the rmSync throws ERROR_ACCESS_DENIED
      // before any assertion, and the uv_cwd shape under test cannot be
      // produced there at all.
      // R19-4 (cleanup half): `redirectedAncestor`'s default stop reads
      // process.cwd() in the CALLER's frame, outside the walk's own try, and
      // REVIEW_TMP_DIR is a relative spelling — a launch directory deleted out
      // from under the process (an operator `rm -rf` mid-review, the nested
      // geometry) threw uv_cwd out of runCleanup before any degradation could
      // run. With no live cwd the relative root cannot be resolved at all, so
      // the sweep refuses with an explanation instead.
      const anchor = process.cwd();
      const gone = realFs.mkdtempSync(join(tmpdir(), 'cleanup-deleted-cwd-'));
      process.chdir(gone);
      try {
        realFs.rmSync(gone, { recursive: true, force: true });
        // The precondition, asserted rather than assumed: this is the throw the
        // default stopAt used to let escape (the same shape the gitProbe
        // witness pins in lib/git.integration.test.ts).
        expect(process.cwd).toThrow(/uv_cwd/);

        expect(() => runCleanup('pr-123')).not.toThrow();
        expect(mocks.writeStderrLine).toHaveBeenCalledWith(
          expect.stringContaining('working directory no longer exists'),
        );
        expect(process.exitCode).toBe(1);
        // Nothing was swept from inside a root that cannot be resolved.
        expect(mocks.rmSync).not.toHaveBeenCalled();
        expect(mocks.releaseWorktree).not.toHaveBeenCalled();
      } finally {
        process.chdir(anchor);
        process.exitCode = 0;
      }
    },
  );

  it('reads process.cwd() ONCE per run — the entry capture — and never downstream (R30-6)', () => {
    // The mid-run half of the deleted-cwd class: the entry guard covers a cwd
    // already gone, but `scratchWorktreesOf` used to read the cwd again later
    // (`resolve(worktree)` against it, `redirectedAncestor`'s default stop),
    // so a deletion AFTER the capture still threw uv_cwd out of the sweep.
    // Both now anchor at the captured root. The call-count is the pin: any
    // downstream cwd read returns this to red.
    //
    // The cwd is pinned to the fixture root instead of skipping this on
    // Windows. This file mocks `node:path` to posix, and a real Windows cwd
    // (`C:\…`) is not posix-absolute, so every downstream `resolve()` re-read
    // `process.cwd()` and the count came back 16 against an expected 1. That
    // is an artifact of the module-level posix mock, not of production, which
    // uses win32 semantics on Windows and has exactly one live `process.cwd()`
    // (`cleanup.ts:754`) with no platform branch. A posix-absolute cwd makes
    // the count platform-independent, so the witness runs on every lane.
    //
    // The second leg of the same artifact: `redirectedAncestor`'s
    // canonicalisation probes go through the real `realpathSync`, and on
    // Windows each one re-resolves the drive-relative '/repo/…' spellings
    // through win32 path resolution, which reads `process.cwd()` for the
    // drive — 9 reads across the run's three ancestor walks, counted against
    // the expected 1. `realpathSync` is mocked above with the same
    // fail-open ENOENT those probes always met here, so no fs internal
    // reaches the spy.
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');
    try {
      runCleanup('pr-123');
      expect(cwdSpy).toHaveBeenCalledTimes(1);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('keeps the lease when branch deletion fails', () => {
    // Once, because this suite's mocks keep their implementations across tests
    // and each one sets what it needs: a standing throw here would fail every
    // later branch delete and hold the lease for the wrong reason.
    mocks.git.mockImplementationOnce(() => {
      throw new Error('branch is locked');
    });

    runCleanup('pr-123');

    // The throwing wrapper, which carries the sanitized env and the launch-dir
    // gate the direct spawn had neither of.
    expect(mocks.git).toHaveBeenCalledWith(
      'branch',
      '-D',
      'o1-code-review/pr-123',
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete branch o1-code-review/pr-123'),
    );
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
  });

  it('keeps the lease when the branch leg is REFUSED, not merely absent', () => {
    // `refExists` answered a launch-dir refusal as "no such branch", so this
    // leg was skipped before `git` was ever reached: nothing on stderr, no
    // `failedDestruction`, the lease released and "Nothing to clean" printed
    // over a branch and a registration that both survived — the next
    // `worktree add` at the fixed path then fails "missing but already
    // registered" with nobody told why. The probe keeps the two apart.
    mocks.gitProbe.mockImplementation(
      (...args: string[]): ProbeAnswer =>
        args[0] === 'rev-parse'
          ? { out: null, status: null, refusal: 'POISONED LAUNCH DIR' }
          : { out: '', status: 0, refusal: null },
    );

    runCleanup('pr-123');

    expect(mocks.git).not.toHaveBeenCalledWith(
      'branch',
      '-D',
      'o1-code-review/pr-123',
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to delete branch o1-code-review/pr-123: git could not run from this directory',
      ),
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('POISONED LAUNCH DIR'),
    );
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
  });

  it('keeps the lease when the branch probe answers a fatal, not absence (exit 128)', () => {
    // R19-1: with `--verify --quiet`, exit 1 is the ONLY genuine "no such
    // branch". A 128 fatal (a corrupt .git) is a non-answer, and the leg used
    // to read every non-refusal failure as absence: the delete was silently
    // skipped, `failedDestruction` never set, the lease released, and
    // "Nothing to clean" printed over a surviving branch.
    mocks.gitProbe.mockImplementation(
      (...args: string[]): ProbeAnswer =>
        args[0] === 'rev-parse'
          ? { out: null, status: 128, refusal: null }
          : { out: '', status: 0, refusal: null },
    );

    runCleanup('pr-123');

    expect(mocks.git).not.toHaveBeenCalledWith(
      'branch',
      '-D',
      'o1-code-review/pr-123',
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to delete branch o1-code-review/pr-123: git could not answer whether it exists (exit 128)',
      ),
    );
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
    // The success report over a destruction that never ran.
    expect(mocks.writeStdoutLine).not.toHaveBeenCalledWith(
      expect.stringContaining('Nothing to clean'),
    );
  });

  it('keeps the lease when the branch probe could not run at all (status null)', () => {
    // R19-1's third shape: spawn ENOENT or the 120s timeout kill answers
    // `{out: null, status: null, refusal: null}` — "the command could not be
    // run at all" — which the leg read as absence exactly like the 128.
    mocks.gitProbe.mockImplementation(
      (...args: string[]): ProbeAnswer =>
        args[0] === 'rev-parse'
          ? { out: null, status: null, refusal: null }
          : { out: '', status: 0, refusal: null },
    );

    runCleanup('pr-123');

    expect(mocks.git).not.toHaveBeenCalledWith(
      'branch',
      '-D',
      'o1-code-review/pr-123',
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to delete branch o1-code-review/pr-123: git could not answer whether it exists (exit null)',
      ),
    );
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
    expect(mocks.writeStdoutLine).not.toHaveBeenCalledWith(
      expect.stringContaining('Nothing to clean'),
    );
  });

  it('treats exit 1 from the branch probe as genuine absence — silently', () => {
    // The idempotency contract at the top of cleanup.ts: missing branches are
    // silent OK. Only OTHER non-zero/null statuses are non-answers.
    mocks.gitProbe.mockImplementation(
      (...args: string[]): ProbeAnswer =>
        args[0] === 'rev-parse'
          ? { out: null, status: 1, refusal: null }
          : { out: '', status: 0, refusal: null },
    );

    runCleanup('pr-123');

    expect(mocks.git).not.toHaveBeenCalledWith(
      'branch',
      '-D',
      'o1-code-review/pr-123',
    );
    expect(mocks.writeStderrLine).not.toHaveBeenCalledWith(
      expect.stringContaining('branch'),
    );
    expect(mocks.clearReviewWorktreeLease).toHaveBeenCalledWith(
      process.cwd(),
      'pr-123',
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      'Nothing to clean for target "pr-123".',
    );
  });

  it('keeps the lease when the symlink arm cannot prune', () => {
    // The same collapse one call earlier: `pruneWorktrees()` answered null for
    // "refused" and for "nothing to prune" alike, so the arm announced
    // `Removed … link` and released the lease while the registration the prune
    // was there to clear survived. A genuine prune failure stays swallowed —
    // it must not mask the error that got us here — but a refusal is the one
    // cause a user can act on, so it is reported and holds the lease.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.lstatSync.mockImplementation(((p: string) => ({
      isSymbolicLink: () => String(p).includes('review-pr-123'),
      isDirectory: () => !String(p).includes('review-pr-123'),
    })) as unknown as () => {
      isSymbolicLink: () => boolean;
      isDirectory: () => boolean;
    });
    mocks.gitProbe.mockImplementation(
      (...args: string[]): ProbeAnswer =>
        args[0] === 'worktree'
          ? { out: null, status: null, refusal: 'POISONED LAUNCH DIR' }
          : { out: '', status: 0, refusal: null },
    );

    runCleanup('pr-123');

    // The link IS gone, so the announcement stays true — the stderr line is
    // about the registration behind it, not about the unlink.
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('Removed worktree link'),
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('Failed to prune after removing worktree link'),
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('POISONED LAUNCH DIR'),
    );
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
  });

  it('keeps the lease when the symlink arm cannot even ASK git to prune (R23-8)', () => {
    // The probe's third shape — `{out: null, status: null, refusal: null}`,
    // "the command could not be run at all" — used to read as a successful
    // prune: the arm announced `Removed … link`, wrote no stderr line, and
    // released the lease over a registration git never swept, so the next
    // `worktree add` met "missing but already registered" with nobody told
    // why. Only a genuine non-zero exit stays swallowed. Removing the
    // `status === null` arm in pruneWorktrees turns this red.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.lstatSync.mockImplementation(((p: string) => ({
      isSymbolicLink: () => String(p).includes('review-pr-123'),
      isDirectory: () => !String(p).includes('review-pr-123'),
    })) as unknown as () => {
      isSymbolicLink: () => boolean;
      isDirectory: () => boolean;
    });
    mocks.gitProbe.mockImplementation(
      (...args: string[]): ProbeAnswer =>
        args[0] === 'worktree'
          ? { out: null, status: null, refusal: null }
          : { out: '', status: 0, refusal: null },
    );

    runCleanup('pr-123');

    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('Removed worktree link'),
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('Failed to prune after removing worktree link'),
    );
    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('could not be run at all'),
    );
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
  });

  it('clears the lease when cleanup succeeds', () => {
    mocks.execFileSync.mockReturnValue(Buffer.from(''));

    runCleanup('pr-123');

    expect(mocks.clearReviewWorktreeLease).toHaveBeenCalledWith(
      process.cwd(),
      'pr-123',
    );
  });

  it('clears the lease when only a side file fails to delete', () => {
    // The lease guards the worktree and branch, not side files: once those
    // are freed, a residue a later sweep retries must not keep the lock held
    // — a leftover lease refuses every later fetch-pr of this PR and skips
    // every later cleanup, and nothing sweeps it automatically.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue(['o1-code-review-pr-123-diff.txt']);
    mocks.rmSync.mockImplementation(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });

    runCleanup('pr-123');

    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('Failed to remove'),
    );
    expect(mocks.clearReviewWorktreeLease).toHaveBeenCalledWith(
      process.cwd(),
      'pr-123',
    );
  });

  it('skips the whole target when another session holds the lease', () => {
    // The incident shape: session B cleans up while session A is mid-review.
    // Nothing of A's may be touched — worktree, siblings, branch, side files,
    // audit window, or the lease itself.
    const lease = {
      sessionId: 'session-a',
      promptId: 'prompt-a',
      target: 'pr-123',
      repositoryRoot: '/repo',
      worktreePath: '/repo/.o1-code/tmp/review-pr-123',
      branch: 'o1-code-review/pr-123',
    };
    mocks.readReviewWorktreeLease.mockReturnValueOnce(lease);
    mocks.reviewLeaseHeldByAnotherSession.mockImplementationOnce(
      (l: unknown) => l === lease,
    );
    // Populate the tmp dir so the per-target side-file sweep actually runs
    // once past the skip gate: a refactor that moves the sweep above the
    // gate would reach for the holder's side files and trip the
    // rmSync-not-called assertion below.
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue(['o1-code-review-pr-123-diff.txt']);

    runCleanup('pr-123');

    // The skip must key on THIS target's lease: mockReturnValueOnce is
    // argument-blind, so an unwired read consults another PR's lease.
    expect(mocks.readReviewWorktreeLease).toHaveBeenCalledWith(
      process.cwd(),
      'pr-123',
    );
    expect(mocks.releaseWorktree).not.toHaveBeenCalled();
    expect(mocks.execFileSync).not.toHaveBeenCalled();
    expect(mocks.rmSync).not.toHaveBeenCalled();
    expect(mocks.ghApiAll).not.toHaveBeenCalled();
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('skipped cleanup for "pr-123"'),
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('session-a'),
    );
    // The note must name the lease file itself — the operator cannot act on
    // "delete the lease file" without knowing which file that is.
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('o1-code-review-lease-pr-123.json'),
    );
  });

  it('proceeds when the lease belongs to this session', () => {
    const lease = {
      sessionId: 'session-b',
      promptId: 'prompt-b',
      target: 'pr-123',
      repositoryRoot: '/repo',
      worktreePath: '/repo/.o1-code/tmp/review-pr-123',
      branch: 'o1-code-review/pr-123',
    };
    mocks.readReviewWorktreeLease.mockReturnValueOnce(lease);
    mocks.reviewLeaseHeldByAnotherSession.mockReturnValueOnce(false);
    mocks.execFileSync.mockReturnValue(Buffer.from(''));

    runCleanup('pr-123');

    expect(mocks.releaseWorktree).toHaveBeenCalledTimes(3);
    expect(mocks.clearReviewWorktreeLease).toHaveBeenCalledWith(
      process.cwd(),
      'pr-123',
    );
  });

  it('re-checks the lease after the network-bound audit and skips if a session moved in during it', () => {
    // The gate above reads the lease BEFORE the audit, but the audit spawns
    // network-bound gh processes (seconds-scale). A review of the same PR that
    // starts inside that window — reading no lease, then writing its own —
    // must not be destroyed by this cleanup: re-read the lease after the audit,
    // before any destructive step, and take the same skip path.
    const lease = {
      sessionId: 'session-b',
      promptId: 'prompt-b',
      target: 'pr-123',
      repositoryRoot: '/repo',
      worktreePath: '/repo/.o1-code/tmp/review-pr-123',
      branch: 'o1-code-review/pr-123',
    };
    // First read (the gate): no lease yet — the gate short-circuits on the
    // absent holder without asking the held question about nothing. Second
    // read (post-audit): session B has acquired one.
    mocks.readReviewWorktreeLease
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(lease);
    mocks.reviewLeaseHeldByAnotherSession.mockReturnValueOnce(true);

    runCleanup('pr-123');

    expect(mocks.readReviewWorktreeLease).toHaveBeenCalledTimes(2);
    // Pin the ARGUMENTS of both reads: mockReturnValueOnce is argument-blind,
    // so a re-check that reads a malformed target stays green here while
    // failing open in production (validTarget rejects it -> null -> not held).
    expect(mocks.readReviewWorktreeLease).toHaveBeenNthCalledWith(
      1,
      process.cwd(),
      'pr-123',
    );
    expect(mocks.readReviewWorktreeLease).toHaveBeenNthCalledWith(
      2,
      process.cwd(),
      'pr-123',
    );
    // And the second read must come AFTER the audit, not merely exist:
    // hoisting it above auditPrWrites keeps every other assertion green while
    // the seconds-long audit again runs after the last lease check.
    // Here the audit no-ops on the missing fetch report and names that skip
    // on stderr — the note's position pins the audit inside the window.
    const auditNoteIndex = mocks.writeStderrLine.mock.calls.findIndex((c) =>
      String(c[0]).includes('bypass audit skipped'),
    );
    expect(auditNoteIndex).toBeGreaterThanOrEqual(0);
    expect(
      mocks.readReviewWorktreeLease.mock.invocationCallOrder[1]!,
    ).toBeGreaterThan(
      mocks.writeStderrLine.mock.invocationCallOrder[auditNoteIndex]!,
    );
    // Nothing of B's may be touched.
    expect(mocks.releaseWorktree).not.toHaveBeenCalled();
    expect(mocks.execFileSync).not.toHaveBeenCalled();
    expect(mocks.rmSync).not.toHaveBeenCalled();
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('acquired the lease'),
    );
  });

  it('releases the review worktree AND both disposable siblings', () => {
    // `base-tree` deliberately leaves its tree standing for the whole review
    // (a later verifier may need it, and a base that failed to build is kept as
    // evidence), so this is its ONLY removal — not a crash sweep like the
    // probe's. A missing entry here leaks a full built checkout per review and
    // blocks the next run's `git worktree add`.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));

    runCleanup('pr-123');

    expect(mocks.releaseWorktree.mock.calls.map((c) => c[0])).toEqual([
      '/repo/.o1-code/tmp/review-pr-123',
      '/repo/.o1-code/tmp/review-pr-123-probe',
      '/repo/.o1-code/tmp/review-pr-123-base',
    ]);
  });

  it('sweeps every verifier scratch tree, which it can only find by prefix', () => {
    // One per verifier shard, named for the shard's record key — so unlike the
    // probe and base siblings, the sweeper cannot reconstruct the names and
    // reads the directory instead. Missing them leaks a checkout per shard and
    // wedges the next review's `git worktree add` on the leftovers.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.readdirSync.mockReturnValue([
      'review-pr-123',
      'review-pr-123-scratch-verify--round-1--aaa',
      'review-pr-123-scratch-verify--round-2--bbb',
      // Neither of these belongs to this review: one is another PR's scratch
      // tree, the other an ordinary side file.
      'review-pr-999-scratch-verify--round-1--ccc',
      'o1-code-review-pr-123-diff.txt',
    ] as unknown as []);

    runCleanup('pr-123');

    expect(mocks.releaseWorktree.mock.calls.map((c) => c[0])).toEqual([
      '/repo/.o1-code/tmp/review-pr-123',
      '/repo/.o1-code/tmp/review-pr-123-probe',
      '/repo/.o1-code/tmp/review-pr-123-base',
      '/repo/.o1-code/tmp/review-pr-123-scratch-verify--round-1--aaa',
      '/repo/.o1-code/tmp/review-pr-123-scratch-verify--round-2--bbb',
    ]);
  });

  it('unlinks a dangling symlink at a family path, which releaseWorktree cannot see', () => {
    // `releaseWorktree`'s `existsSync` follows the link, reports "never
    // existed", and never runs its `rmSync` — while the link still wedges the
    // next review's `git worktree add` with `already exists`.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.readdirSync.mockReturnValue([
      'review-pr-123-scratch-verify--round-1--aaa',
    ] as unknown as []);
    mocks.existsSync.mockReturnValue(false);
    mocks.lstatSync.mockImplementation(((p: string) => ({
      // Only the family entry is a link; its parent directory is a directory.
      isSymbolicLink: () => String(p).includes('-scratch-'),
      isDirectory: () => !String(p).includes('-scratch-'),
    })) as unknown as () => {
      isSymbolicLink: () => boolean;
      isDirectory: () => boolean;
    });

    runCleanup('pr-123');

    expect(mocks.rmSync).toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/review-pr-123-scratch-verify--round-1--aaa',
      { force: true },
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('Removed scratch worktree link'),
    );
  });

  it('unlinks a symlink at the three NAMED family paths instead of releasing what it points at', () => {
    // A LIVE link at any of them used to reach `releaseWorktree`: its
    // `existsSync` followed the link and `git worktree remove --force`
    // resolved it — together they deleted whichever registered worktree the
    // link named, measured against the real function, while reporting the
    // family path as swept. A DANGLING one was invisible to it and survived
    // to wedge the next review's `worktree add`. Both shapes are unlinked
    // the way the scratch family's always were.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    // The family paths are links; their ANCESTORS are ordinary directories —
    // a symlink above the temp dir refuses the whole clean, which is a
    // different test.
    mocks.lstatSync.mockImplementation(((p: string) => ({
      isSymbolicLink: () => String(p).includes('review-pr-'),
      isDirectory: () => !String(p).includes('review-pr-'),
    })) as unknown as () => {
      isSymbolicLink: () => boolean;
      isDirectory: () => boolean;
    });

    runCleanup('pr-123');

    expect(mocks.releaseWorktree).not.toHaveBeenCalled();
    expect(mocks.rmSync).toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/review-pr-123',
      {
        force: true,
      },
    );
    expect(mocks.rmSync).toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/review-pr-123-probe',
      { force: true },
    );
    expect(mocks.rmSync).toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/review-pr-123-base',
      { force: true },
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('Removed worktree link'),
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('Removed probe worktree link'),
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining('Removed base worktree link'),
    );
    // The registration outlives the link. This branch returns before ever
    // reaching `releaseWorktree`, which is where the pipeline's only other
    // prune lives — so without one here the family paths were reported swept
    // while their admin entries stayed behind and wedged the next
    // `worktree add` with `already exists`.
    expect(mocks.gitProbe).toHaveBeenCalledWith('worktree', 'prune');
  });

  it('does not announce a clean sweep when it could not list the family', () => {
    // A silent skip leaks a full checkout per shard while stdout says
    // "Nothing to clean" and the lease is cleared.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.readdirSync.mockImplementation(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });

    runCleanup('pr-123');

    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('for scratch worktrees'),
    );
    expect(mocks.writeStdoutLine).not.toHaveBeenCalledWith(
      expect.stringContaining('Nothing to clean'),
    );
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
  });

  it('refuses to clean anything when the temp dir hangs off a symlink', () => {
    // The scratch sweep alone used to answer this: it announced the hazard and
    // the same function kept deleting under it — the base-tree lock and every
    // side file, all resolved through the same redirected ancestor.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.lstatSync.mockImplementation(((p: string) => ({
      isSymbolicLink: () => String(p) === '/repo/.o1-code',
      isDirectory: () => String(p) !== '/repo/.o1-code',
    })) as unknown as () => {
      isSymbolicLink: () => boolean;
      isDirectory: () => boolean;
    });

    runCleanup('pr-123');

    expect(mocks.writeStderrLine).toHaveBeenCalledWith(
      expect.stringContaining('Refusing to clean'),
    );
    expect(mocks.rmSync).not.toHaveBeenCalled();
    expect(mocks.releaseWorktree).not.toHaveBeenCalled();
    expect(mocks.clearReviewWorktreeLease).not.toHaveBeenCalled();
  });

  it('sweeps a stale base-tree build lock left by a killed builder', () => {
    // The lock is a plain directory (`mkdirSync` test-and-set), not a worktree,
    // so `releaseWorktree` never touches it; a builder killed mid-build leaves it
    // behind and every later base-tree probe reports "another probe is building"
    // until a manual rm. Cleanup sweeps it at the end of the review.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));

    runCleanup('pr-123');

    expect(mocks.rmSync).toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/review-pr-123-base.lock',
      { recursive: true, force: true },
    );
    // ...AND the host-side one, once the tree it guards is gone (the default
    // `existsSync` answer above): the lease-release reclaim skips locks, so
    // without this sweep a killed builder's lock outlived its tree and wedged
    // the next review of this PR for the whole staleness window — every ask
    // took EEXIST from `mkdirSync` and reported "another probe is building —
    // the fast path will then reuse it" over a tree this command had already
    // removed, a recovery that cannot happen.
    expect(mocks.rmSync).toHaveBeenCalledWith(
      '/repo/.o1-code/review-leases/base-tree/pr-123/review-pr-123-base.lock',
      { recursive: true, force: true },
    );
  });

  it('keeps the host-side base-tree build lock while its tree still stands', () => {
    // The release is keyed on the tree being GONE: a base tree that would not
    // delete may still have a killed builder's container writing into it, and
    // removing its lock lets the next review build over that tree at once,
    // where a lock that ages out at least holds the next build off for the
    // staleness window.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockImplementation(
      (path: string) => path === '/repo/.o1-code/tmp/review-pr-123-base',
    );

    runCleanup('pr-123');

    const hostSide = mocks.rmSync.mock.calls
      .map(([path]) => String(path))
      .filter((path) =>
        path.startsWith('/repo/.o1-code/review-leases/base-tree'),
      );
    expect(hostSide).toEqual([]);
  });

  it('never sweeps lease files, even for a target whose name collides with the lease prefix', () => {
    // `safeTarget` flattens `lease` (and `./lease`) to `lease`, so a
    // file-review target with that name sweeps with a prefix that IS the
    // lease prefix: unguarded, the rmSync below deletes every live PR lease
    // — including another session's — and defeats the lock this PR adds.
    // Lease removal belongs to `clearReviewWorktreeLease` alone.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue(['o1-code-review-lease-pr-123.json']);

    runCleanup('lease');

    expect(mocks.rmSync).not.toHaveBeenCalledWith(
      join('/repo/.o1-code/tmp', 'o1-code-review-lease-pr-123.json'),
      expect.anything(),
    );
    expect(
      mocks.writeStdoutLine.mock.calls.map((c) => String(c[0])).join('\n'),
    ).not.toContain('o1-code-review-lease-pr-123.json');
  });

  it('sweeps the side files of a lease-named target that share the lease prefix', () => {
    // The guard keys on the real lease shape, not the bare prefix: a
    // file-review target named `lease` flattens to exactly the lease prefix,
    // so keying on the prefix alone skips its OWN side files and nothing else
    // ever removes them (`clearReviewWorktreeLease` no-ops off `pr-\d+`) —
    // permanent residue. Only files shaped `…-pr-<n>.json` are real leases.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([
      'o1-code-review-lease-diff.txt',
      'o1-code-review-lease-pr-999.json',
    ]);

    runCleanup('lease');

    const sideFile = join(
      '/repo/.o1-code/tmp',
      'o1-code-review-lease-diff.txt',
    );
    expect(mocks.rmSync).toHaveBeenCalledWith(sideFile, {
      recursive: true,
      force: true,
    });
    // A live foreign lease survives the very same sweep.
    expect(mocks.rmSync).not.toHaveBeenCalledWith(
      join('/repo/.o1-code/tmp', 'o1-code-review-lease-pr-999.json'),
      expect.anything(),
    );
  });

  it('still sweeps side files that match the target prefix', () => {
    // The positive control for the lease guard: the skip keys on the lease
    // prefix, not on the sweep itself.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue(['o1-code-review-local-diff.txt']);

    runCleanup('local');

    const sideFile = join(
      '/repo/.o1-code/tmp',
      'o1-code-review-local-diff.txt',
    );
    expect(mocks.rmSync).toHaveBeenCalledWith(sideFile, {
      recursive: true,
      force: true,
    });
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      `Removed temp file: ${sideFile}`,
    );
  });

  it('keeps the record directory of a NON-CONVERGED reverse audit', () => {
    // The loop writes its stop marker inside the record directory when it
    // runs to the round cap (or the budget) without converging, and clears
    // it on a clean convergence — so a marker on disk is exactly the run
    // whose certification history must survive the sweep for diagnosis.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([
      'o1-code-review-pr-123-fetch.json',
      'o1-code-review-pr-123-fetch-prompts',
      'o1-code-review-pr-123-diff.txt',
    ]);
    mocks.readFileSync.mockImplementation((path: string): string => {
      if (path.endsWith('budget-stop.json')) {
        return JSON.stringify({
          cause: 'round-cap',
          cap: 5,
          entry: 'reverse audit — did not converge within the 5-round cap of 5',
          entryZh: '反向审计——在 5 轮的反审轮数上限内未收敛',
          round: 6,
          remainingSeconds: 0,
          reserveSeconds: 0,
          atMs: Date.now(),
        });
      }
      // The fetch report without `fetchedAt`: the bypass audit skips itself.
      return JSON.stringify({});
    });

    runCleanup('pr-123');

    const removed = mocks.rmSync.mock.calls.map((c) => c[0]);
    expect(removed).toContain(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-fetch.json',
    );
    expect(removed).toContain(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-diff.txt',
    );
    expect(removed).not.toContain(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'Kept /repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      ),
    );
  });

  it('keeps the record directory whose records predate the plan — a killed loop leaves no marker', () => {
    // Signal 2: a loop KILLED mid-round stops without converging and
    // writes no marker; its records predate the retry's fresh plan
    // capture. The mtime comparison is what keeps that history — pinned
    // here against an inverted `<` or a slack/sign slip.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockImplementation((p: string): string[] =>
      p === '/repo/.o1-code/tmp'
        ? [
            'o1-code-review-pr-123-fetch.json',
            'o1-code-review-pr-123-fetch-prompts',
          ]
        : ['reverse-audit--chunk-13--round-1--abc.txt'],
    );
    // No marker — the readFileSync default throws for budget-stop.json.
    const planNow = Date.now();
    mocks.statSync.mockImplementation((p: string) => ({
      mtimeMs: p.endsWith('.json') ? planNow : Date.parse('2020-01-01'),
    }));

    runCleanup('pr-123');

    expect(mocks.rmSync).not.toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      expect.anything(),
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'Kept /repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      ),
    );
  });

  it('keeps the record directory whose plan is already gone — a second cleanup keeps what the first kept', () => {
    // Signal 3: the first cleanup preserved the directory and swept the
    // plan beside it, so no marker read and no mtime comparison can run.
    // The directory that survived on that evidence must survive again —
    // and "Nothing to clean" must NOT print while something was kept.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockImplementation(
      (p: string) => p === '/repo/.o1-code/tmp',
    );
    mocks.readdirSync.mockReturnValue(['o1-code-review-pr-123-fetch-prompts']);

    runCleanup('pr-123');

    expect(mocks.rmSync).not.toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      expect.anything(),
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'Kept /repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      ),
    );
    expect(mocks.writeStdoutLine).not.toHaveBeenCalledWith(
      expect.stringContaining('Nothing to clean'),
    );
  });

  it('keeps the record directory on a PREVIOUS run’s marker — retention reads unfenced', () => {
    // The fence drops a marker older than the plan capture — exactly the
    // marker a killed run left behind. Retention reading through the
    // fenced `readBudgetStop` would sweep the evidence a killed run leaves;
    // this pins the unfenced read against that swap.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockImplementation((p: string): string[] =>
      p === '/repo/.o1-code/tmp'
        ? [
            'o1-code-review-pr-123-fetch.json',
            'o1-code-review-pr-123-fetch-prompts',
          ]
        : [],
    );
    const planNow = Date.now();
    mocks.statSync.mockImplementation((p: string) => {
      if (p.endsWith('.json')) return { mtimeMs: planNow };
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mocks.readFileSync.mockImplementation((path: string): string => {
      if (path.endsWith('budget-stop.json')) {
        // A stop from HOURS before the plan capture — the fenced reader
        // (deadline.ts's own tests pin this) returns null for it.
        return JSON.stringify({
          cause: 'round-cap',
          cap: 5,
          entry: 'reverse audit — did not converge within the 5-round cap',
          entryZh: '反向审计——在 5 轮的反审轮数上限内未收敛',
          round: 6,
          remainingSeconds: 0,
          reserveSeconds: 0,
          atMs: Date.parse('2020-01-01'),
        });
      }
      return JSON.stringify({});
    });

    runCleanup('pr-123');

    expect(mocks.rmSync).not.toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      expect.anything(),
    );
    expect(mocks.writeStdoutLine).toHaveBeenCalledWith(
      expect.stringContaining(
        'Kept /repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      ),
    );
  });

  it('still sweeps the record directory once the loop converged', () => {
    // A converged run cleared its marker (`refuseConverged` removes it): the
    // certification history earned nothing, and the sweep takes it like any
    // other side file. Same entries as the retention test, no marker.
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.existsSync.mockReturnValue(true);
    mocks.readdirSync.mockReturnValue([
      'o1-code-review-pr-123-fetch.json',
      'o1-code-review-pr-123-fetch-prompts',
    ]);
    mocks.readFileSync.mockReturnValue(JSON.stringify({}));

    runCleanup('pr-123');

    expect(mocks.rmSync).toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-fetch-prompts',
      { recursive: true, force: true },
    );
  });
});

describe('findUnsanctionedIssueComments', () => {
  const since = '2026-07-24T08:00:00Z';
  const comment = (over: Partial<RawIssueComment> & { id: number }) =>
    ({
      user: { login: 'reviewer' },
      created_at: '2026-07-24T09:00:00Z',
      ...over,
    }) as RawIssueComment;

  it('keeps only the reviewing account inside the window, case-insensitively', () => {
    const got = findUnsanctionedIssueComments(
      [
        comment({ id: 1 }),
        comment({ id: 2, user: { login: 'Reviewer' } }),
        comment({ id: 3, user: { login: 'someone-else' } }),
        comment({ id: 4, created_at: '2026-07-24T07:59:59Z' }),
      ],
      'reviewer',
      since,
    );
    expect(got.posted.map((c) => c.id)).toEqual([1, 2]);
    expect(got.edited).toEqual([]);
  });

  it('classifies a pre-window comment edited inside the window as an edit', () => {
    const got = findUnsanctionedIssueComments(
      [
        comment({
          id: 5,
          created_at: '2026-07-24T07:00:00Z',
          updated_at: '2026-07-24T09:00:00Z',
        }),
        comment({
          id: 6,
          created_at: '2026-07-24T07:00:00Z',
          updated_at: '2026-07-24T07:00:00Z',
        }),
      ],
      'reviewer',
      since,
    );
    expect(got.edited.map((c) => c.id)).toEqual([5]);
    expect(got.posted).toEqual([]);
  });

  it('still flags a comment that merely QUOTES an automation marker mid-body', () => {
    // The filter is anchored to the body start: a hand-posted summary quoting
    // a marked bot comment (or hiding the marker mid-body) stays visible.
    const got = findUnsanctionedIssueComments(
      [
        comment({
          id: 9,
          body: 'summary quoting:\n<!-- o1-code-triage stage=1 -->',
        }),
      ],
      'reviewer',
      since,
    );
    expect(got.posted.map((c) => c.id)).toEqual([9]);
  });

  it('drops comments carrying the repo automation marker — CI shares the bot account', () => {
    const got = findUnsanctionedIssueComments(
      [
        comment({
          id: 7,
          body: '<!-- o1-code-pr-precheck:manual-required -->\nchecks…',
        }),
        comment({ id: 8, body: 'a human sentence' }),
      ],
      'reviewer',
      since,
    );
    expect(got.posted.map((c) => c.id)).toEqual([8]);
  });

  it('drops comments with no author or no timestamp instead of guessing', () => {
    const got = findUnsanctionedIssueComments(
      [
        comment({ id: 1, user: null }),
        comment({ id: 2, created_at: undefined }),
      ],
      'reviewer',
      since,
    );
    expect(got.posted).toEqual([]);
    expect(got.edited).toEqual([]);
  });
});

describe('findUnsanctionedReviews', () => {
  const since = '2026-07-24T08:00:00Z';
  const review = (over: Partial<RawReview> & { id: number }) =>
    ({
      user: { login: 'reviewer' },
      state: 'COMMENTED',
      submitted_at: '2026-07-24T09:00:00Z',
      ...over,
    }) as RawReview;

  it('flags in-window reviews by the account that the receipt does not vouch for', () => {
    const got = findUnsanctionedReviews(
      [
        review({ id: 1 }),
        review({ id: 2, user: { login: 'someone-else' } }),
        review({ id: 3, submitted_at: '2026-07-24T07:00:00Z' }),
      ],
      'reviewer',
      since,
      new Set(),
    );
    expect(got.map((r) => r.id)).toEqual([1]);
  });

  it('excludes every receipt-vouched review id, not just the last', () => {
    // Two sanctioned submits in one window (drift restart) — both ids are on
    // the receipt, and NEITHER may be flagged.
    const got = findUnsanctionedReviews(
      [review({ id: 1 }), review({ id: 2 }), review({ id: 3 })],
      'reviewer',
      since,
      new Set([2, 3]),
    );
    expect(got.map((r) => r.id)).toEqual([1]);
  });
});

describe('runCleanup — bypass-write audit', () => {
  const fetchReport = JSON.stringify({
    prNumber: '123',
    ownerRepo: 'acme/widgets',
    fetchedAt: '2026-07-24T08:00:00Z',
    host: 'ghe.example.com',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Implementations survive `clearAllMocks`, so a `mockReturnValue` set in
    // the other describe would otherwise decide what this one's directory
    // sweep sees — the same drift the sibling beforeEach pins against.
    mocks.readdirSync.mockReturnValue([]);
    mocks.lstatSync.mockReturnValue({
      isSymbolicLink: () => false,
      isDirectory: () => true,
    });
    mocks.existsSync.mockReturnValue(false);
    mocks.execFileSync.mockReturnValue(Buffer.from(''));
    mocks.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mocks.currentUser.mockReturnValue('reviewer');
    mocks.ghApiAll.mockReturnValue([]);
  });

  it('flags reviewer issue comments posted inside the window', () => {
    mocks.readFileSync.mockReturnValue(fetchReport);
    mocks.ghApiAll.mockReturnValue([
      {
        id: 42,
        user: { login: 'reviewer' },
        created_at: '2026-07-24T09:02:32Z',
        html_url: 'https://ghe.example.com/acme/widgets/pull/123#c42',
      },
      {
        id: 43,
        user: { login: 'pr-author' },
        created_at: '2026-07-24T09:03:00Z',
      },
    ]);

    runCleanup('pr-123');

    expect(mocks.readFileSync).toHaveBeenCalledWith(
      '/repo/.o1-code/tmp/o1-code-review-pr-123-fetch.json',
      'utf8',
    );
    expect(mocks.setGhHost).toHaveBeenCalledWith('ghe.example.com');
    expect(mocks.ghApiAll).toHaveBeenCalledWith(
      expect.stringContaining('repos/acme/widgets/issues/123/comments'),
    );
    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    expect(warnings.join('\n')).toContain('posted comment 42');
    expect(warnings.join('\n')).not.toContain('comment 43');
    expect(warnings.join('\n')).toContain('o1-code review submit');
  });

  it('stays silent when the window is clean', () => {
    mocks.readFileSync.mockReturnValue(fetchReport);
    mocks.ghApiAll.mockReturnValue([
      {
        id: 7,
        user: { login: 'pr-author' },
        created_at: '2026-07-24T09:00:00Z',
      },
    ]);

    runCleanup('pr-123');

    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    expect(warnings).toEqual([]);
  });

  it('skips the audit without gh calls when the fetch report is absent or pre-fetchedAt, and names the skip', () => {
    runCleanup('pr-123'); // report missing (readFileSync throws)
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ prNumber: '123', ownerRepo: 'acme/widgets' }),
    );
    runCleanup('pr-123'); // old report without fetchedAt

    expect(mocks.ghApiAll).not.toHaveBeenCalled();
    expect(mocks.setGhHost).not.toHaveBeenCalled();
    const notes = mocks.writeStderrLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('note: bypass audit skipped'));
    expect(notes.some((l) => l.includes('no fetch report'))).toBe(true);
    expect(notes.some((l) => l.includes('no fetchedAt'))).toBe(true);
  });

  it('skips when the fetch report names a different PR than the cleanup target', () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({
        prNumber: '999',
        ownerRepo: 'acme/widgets',
        fetchedAt: '2026-07-24T08:00:00Z',
      }),
    );

    runCleanup('pr-123');

    expect(mocks.ghApiAll).not.toHaveBeenCalled();
    const notes = mocks.writeStderrLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('note: bypass audit skipped'));
    expect(notes.some((l) => l.includes('for PR 999'))).toBe(true);
  });

  it('clears any prior Enterprise host for a github.com report (host: null)', () => {
    // setGhHost(undefined) is what un-routes gh after an Enterprise review in
    // the same process; only the Enterprise fixture was asserted before.
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({
        prNumber: '123',
        ownerRepo: 'acme/widgets',
        fetchedAt: '2026-07-24T08:00:00Z',
        host: null,
      }),
    );
    mocks.ghApiAll.mockReturnValue([
      {
        id: 9,
        user: { login: 'reviewer' },
        created_at: '2026-07-24T09:00:00Z',
      },
    ]);

    runCleanup('pr-123');

    expect(mocks.setGhHost).toHaveBeenCalledWith(undefined);
    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    expect(warnings.join('\n')).toContain('posted comment 9');
  });

  it('restores the prior gh host after the audit instead of leaking the override', () => {
    // A host set before cleanup ran must be back in place afterwards — the
    // audit's Enterprise override is scoped to the audit block.
    mocks.getGhHost.mockReturnValue('prior.example.com');
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({
        prNumber: '123',
        ownerRepo: 'acme/widgets',
        fetchedAt: '2026-07-24T08:00:00Z',
        host: 'ghe.example.com',
      }),
    );
    mocks.ghApiAll.mockReturnValue([]);

    runCleanup('pr-123');

    // Override applied, then the prior host restored (the last call).
    expect(mocks.setGhHost).toHaveBeenCalledWith('ghe.example.com');
    expect(mocks.setGhHost).toHaveBeenLastCalledWith('prior.example.com');
  });

  it('does not resolve the current user when the window has no comments at all', () => {
    mocks.readFileSync.mockReturnValue(fetchReport);
    mocks.ghApiAll.mockReturnValue([]);

    runCleanup('pr-123');

    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it('reaches back past the recorded opening by the clock-skew allowance', () => {
    // fetchedAt 08:00:00 → boundary 07:58:00; a comment at 07:58:30 predates
    // the recorded opening but only by less than the allowance, so a fast
    // local clock cannot hide it.
    mocks.readFileSync.mockReturnValue(fetchReport);
    mocks.ghApiAll.mockImplementation((path: string) =>
      path.includes('/issues/')
        ? [
            {
              id: 11,
              user: { login: 'reviewer' },
              created_at: '2026-07-24T07:58:30Z',
            },
          ]
        : [],
    );

    runCleanup('pr-123');

    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    expect(warnings.join('\n')).toContain('posted comment 11');
    expect(
      String(
        mocks.ghApiAll.mock.calls.find(([p]) =>
          String(p).includes('/issues/'),
        )![0],
      ),
    ).toContain(encodeURIComponent('2026-07-24T07:58:00.000Z'));
  });

  it('audits from auditSince when drift restarts pushed fetchedAt forward', () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({
        prNumber: '123',
        ownerRepo: 'acme/widgets',
        fetchedAt: '2026-07-24T10:00:00Z',
        auditSince: '2026-07-24T08:00:00Z',
        host: null,
      }),
    );
    mocks.ghApiAll.mockImplementation((path: string) =>
      path.includes('/issues/')
        ? [
            {
              id: 12,
              user: { login: 'reviewer' },
              created_at: '2026-07-24T08:30:00Z',
            },
          ]
        : [],
    );

    runCleanup('pr-123');

    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    expect(warnings.join('\n')).toContain('posted comment 12');
  });

  it('renders the edited-comment warning with id, timestamp and URL through runCleanup', () => {
    mocks.readFileSync.mockReturnValue(fetchReport);
    mocks.ghApiAll.mockImplementation((path: string) =>
      path.includes('/issues/')
        ? [
            {
              id: 21,
              user: { login: 'reviewer' },
              created_at: '2026-07-24T06:00:00Z',
              updated_at: '2026-07-24T09:10:00Z',
              html_url: 'https://ghe.example.com/acme/widgets/pull/123#c21',
            },
          ]
        : [],
    );

    runCleanup('pr-123');

    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    expect(warnings.join('\n')).toContain(
      'edited comment 21 at 2026-07-24T09:10:00Z — https://ghe.example.com/acme/widgets/pull/123#c21',
    );
  });

  it('flags an in-window review with no receipt, and spares the receipt-vouched one', () => {
    mocks.readFileSync.mockImplementation((path: string) => {
      if (String(path).endsWith('submit-receipt.json')) {
        return JSON.stringify({ reviewId: 500 });
      }
      return fetchReport;
    });
    mocks.ghApiAll.mockImplementation((path: string) =>
      path.includes('/reviews')
        ? [
            {
              id: 500,
              user: { login: 'reviewer' },
              state: 'COMMENT',
              submitted_at: '2026-07-24T09:00:00Z',
            },
            {
              id: 501,
              user: { login: 'reviewer' },
              state: 'APPROVED',
              submitted_at: '2026-07-24T09:05:00Z',
              html_url: 'https://ghe.example.com/acme/widgets/pull/123#r501',
            },
          ]
        : [],
    );

    runCleanup('pr-123');

    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    expect(warnings.join('\n')).toContain('review 501 (APPROVED)');
    expect(warnings.join('\n')).toContain('no submit receipt vouches for it');
    expect(warnings.join('\n')).not.toContain('review 500');
    // The footer leads with the benign explanation — a same-account write is
    // usually external (you, a bot, or a concurrent workflow under the same
    // login) — names the account, and qualifies the bypass claim instead of
    // asserting a gate bypass outright. A concurrent same-account write on an
    // observe-only run must not read as "you bypassed the submit gate".
    expect(warnings.join('\n')).toContain('likely cause is benign');
    // Pin the interpolation SHAPE `(${me})`, not the bare word — the header
    // also says "reviewing account", so `toContain('reviewer')` would stay
    // green even if the account name were dropped from the footer.
    expect(warnings.join('\n')).toContain('(reviewer)');
    expect(warnings.join('\n')).toMatch(/real bypass of that gate only if/);
    // The relay instruction is the sentence that actually moves the warning to
    // a human — the rest of the audit is inert without it, so pin it here.
    expect(warnings.join('\n')).toContain('Relay this warning verbatim');
    // The footer's platform noun is contract text relayed verbatim.
    expect(warnings.join('\n')).toContain('writes to the PR');
  });

  it('spares every review in a multi-id receipt (two sanctioned submits in one window)', () => {
    mocks.readFileSync.mockImplementation((path: string) => {
      if (String(path).endsWith('submit-receipt.json')) {
        return JSON.stringify({ reviewIds: [500, 502] });
      }
      return fetchReport;
    });
    mocks.ghApiAll.mockImplementation((path: string) =>
      path.includes('/reviews')
        ? [
            {
              id: 500,
              user: { login: 'reviewer' },
              state: 'COMMENT',
              submitted_at: '2026-07-24T09:00:00Z',
            },
            {
              id: 502,
              user: { login: 'reviewer' },
              state: 'COMMENT',
              submitted_at: '2026-07-24T09:05:00Z',
            },
          ]
        : [],
    );

    runCleanup('pr-123');

    const warnings = mocks.writeStdoutLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('warning:'));
    // Both are receipt-vouched → no bypass warning at all.
    expect(warnings.join('\n')).not.toContain('review 500');
    expect(warnings.join('\n')).not.toContain('review 502');
  });

  it('names each malformed-report shape and never reaches GitHub', () => {
    const cases: Array<[string, string]> = [
      ['not json at all {', 'not valid JSON'],
      [
        JSON.stringify({ fetchedAt: '2026-07-24T08:00:00Z' }),
        'missing prNumber/ownerRepo',
      ],
      [
        JSON.stringify({
          prNumber: '123',
          ownerRepo: 'evil repo/../../x',
          fetchedAt: '2026-07-24T08:00:00Z',
        }),
        'not owner/repo-shaped',
      ],
    ];
    for (const [raw, expected] of cases) {
      vi.clearAllMocks();
      mocks.readFileSync.mockReturnValue(raw);
      runCleanup('pr-123');
      expect(mocks.ghApiAll).not.toHaveBeenCalled();
      const notes = mocks.writeStderrLine.mock.calls
        .map((c) => String(c[0]))
        .filter((l) => l.startsWith('note: bypass audit skipped'));
      expect(notes.join('\n')).toContain(expected);
    }
  });

  it('distinguishes an unreadable report from an absent one', () => {
    mocks.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES',
      });
    });

    runCleanup('pr-123');

    const notes = mocks.writeStderrLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('note: bypass audit skipped'));
    expect(notes.join('\n')).toContain('cannot read fetch report (EACCES)');
    expect(notes.join('\n')).not.toContain('no fetch report');
  });

  it('surfaces the first non-empty stderr line when gh fails, not the generic wrapper', () => {
    mocks.readFileSync.mockReturnValue(fetchReport);
    mocks.ghApiAll.mockImplementation(() => {
      throw Object.assign(new Error('Command failed: gh api …'), {
        stderr: '\ngh: Not authenticated. Run gh auth login.\n',
      });
    });

    runCleanup('pr-123');

    const notes = mocks.writeStderrLine.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.startsWith('note: bypass audit skipped'));
    expect(notes.join('\n')).toContain('gh: Not authenticated');
  });

  it('never fails the cleanup when the audit itself fails', () => {
    mocks.readFileSync.mockReturnValue(fetchReport);
    mocks.ghApiAll.mockImplementation(() => {
      throw new Error('gh: not authenticated');
    });

    expect(() => runCleanup('pr-123')).not.toThrow();
    expect(mocks.clearReviewWorktreeLease).toHaveBeenCalled();
  });
});
