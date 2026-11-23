import { describe, expect, it, vi } from 'vitest';
import {
  createBuiltinProviderCache,
  createFileProvider,
  escapeGlobQuery,
  fileReferenceInsertText,
  fileSearchGlobPattern,
  type AtMentionWorkspaceActions,
} from './useAtMentionSources';

type GlobWorkspace = NonNullable<AtMentionWorkspaceActions['globWorkspace']>;

function globProvider(globWorkspace: GlobWorkspace) {
  const cache = createBuiltinProviderCache();
  return createFileProvider(
    () => ({ globWorkspace }),
    () => '.',
    () => cache,
    'Files',
    '',
    () => null,
  );
}

describe('file provider lookup cache', () => {
  it('does not hand an aborted in-flight lookup to the next query', async () => {
    const firstRequest =
      Promise.withResolvers<Awaited<ReturnType<GlobWorkspace>>>();
    const globWorkspace = vi
      .fn<GlobWorkspace>()
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValue({ matches: ['package.json'] });
    const provider = globProvider(globWorkspace);
    const first = new AbortController();
    const second = new AbortController();
    const stale = provider.search({ query: 'pack', signal: first.signal });
    first.abort();
    const current = provider.search({ query: 'pack', signal: second.signal });
    const settled = Promise.allSettled([stale, current]);
    firstRequest.reject(new DOMException('Aborted', 'AbortError'));

    expect(await settled).toMatchObject([
      { status: 'rejected', reason: { name: 'AbortError' } },
      { status: 'fulfilled', value: [{ label: 'package.json' }] },
    ]);
    // The late rejection of the aborted lookup must not evict its replacement.
    second.abort();
    expect(
      await provider.search({
        query: 'pack',
        signal: new AbortController().signal,
      }),
    ).toMatchObject([{ label: 'package.json' }]);
    expect(globWorkspace).toHaveBeenCalledTimes(2);
  });

  it('keeps a completed lookup cached after its query is aborted', async () => {
    const globWorkspace = vi
      .fn<GlobWorkspace>()
      .mockResolvedValue({ matches: ['package.json'] });
    const provider = globProvider(globWorkspace);
    const first = new AbortController();
    expect(
      await provider.search({ query: 'pack', signal: first.signal }),
    ).toMatchObject([{ label: 'package.json' }]);
    first.abort();
    expect(
      await provider.search({
        query: 'pack',
        signal: new AbortController().signal,
      }),
    ).toMatchObject([{ label: 'package.json' }]);
    expect(globWorkspace).toHaveBeenCalledTimes(1);
  });
});

describe('useAtMentionSources helpers', () => {
  it('escapes glob metacharacters and folds letters into case-insensitive classes', () => {
    expect(escapeGlobQuery('a*b?')).toBe('[aA]\\*[bB]\\?');
    expect(escapeGlobQuery('')).toBe('');
  });

  it('builds a **/*<escaped>* pattern and strips a leading ./', () => {
    expect(fileSearchGlobPattern('')).toBe('**/*');
    expect(fileSearchGlobPattern('./src/foo')).toBe(
      '**/*[sS][rR][cC]/[fF][oO][oO]*',
    );
  });

  it('produces an @-prefixed, trailing-space file reference insert', () => {
    expect(fileReferenceInsertText('a/b c.txt')).toBe('@a/b\\ c.txt ');
  });
});
