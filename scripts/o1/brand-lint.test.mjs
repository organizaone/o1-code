import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findResidual, lintedFiles, selectFiles } from './brand-lint.mjs';

test('lints tracked files and untracked ones git does not ignore', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    return args.includes('--others')
      ? 'packages/new.ts\0docs/new.md\0'
      : 'packages/a.ts\0docs/new.md\0';
  };
  assert.deepEqual(lintedFiles(git), [
    'packages/a.ts',
    'docs/new.md',
    'packages/new.ts',
  ]);
  assert.deepEqual(calls, [
    'ls-files -z',
    'ls-files -z --others --exclude-standard',
  ]);
});

const rules = {
  patterns: ['qwen', 'alibaba'],
  allow: ['Qwen OAuth', 'qwen3-'],
};

test('reports each line that names a forbidden term, case-insensitively', () => {
  assert.deepEqual(findResidual('ok\nWelcome to Qwen Code\nALIBABA', rules), [
    { line: 2, match: 'Qwen', text: 'Welcome to Qwen Code' },
    { line: 3, match: 'ALIBABA', text: 'ALIBABA' },
  ]);
});

test('an allowed use exempts its whole line', () => {
  assert.deepEqual(
    findResidual('Sign in with Qwen OAuth\nmodel qwen3-coder', rules),
    [],
  );
});

test('an empty allowlist allows nothing', () => {
  assert.equal(
    findResidual('qwen', { patterns: ['qwen'], allow: [] }).length,
    1,
  );
});

test('selects files under the linted paths, minus excluded and exempt ones', () => {
  const files = [
    'packages/cli/src/a.ts',
    'packages/cli/LICENSE',
    'packages/core/src/provider/b.ts',
    'docs/guide.md',
    'README.md',
    'dist/cli.js',
  ];
  assert.deepEqual(
    selectFiles(files, {
      paths: ['packages/**', 'docs/**', '*.md'],
      exclude: ['**/LICENSE'],
      allowPaths: ['packages/core/src/provider/**'],
    }),
    ['packages/cli/src/a.ts', 'docs/guide.md', 'README.md'],
  );
});
