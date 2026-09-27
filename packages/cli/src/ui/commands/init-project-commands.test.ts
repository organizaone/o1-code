/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  detectProjectCommands,
  formatDetectedCommands,
} from './init-project-commands.js';

describe('detectProjectCommands', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-commands-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, content: string) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }

  it('returns nothing for a directory without build manifests', () => {
    expect(detectProjectCommands(dir)).toEqual([]);
  });

  it('reads package.json scripts with the package manager of the lockfile', () => {
    write(
      'package.json',
      JSON.stringify({
        scripts: {
          build: 'tsc -b',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
        },
      }),
    );
    write('pnpm-lock.yaml', '');

    expect(detectProjectCommands(dir)).toEqual([
      {
        source: 'package.json',
        build: 'pnpm build',
        lint: 'pnpm lint',
        typecheck: 'pnpm typecheck',
        test: 'pnpm test',
        testFile: 'pnpm exec vitest run <file>',
      },
    ]);
  });

  it('uses npm by default and skips scripts that do not exist', () => {
    write('package.json', JSON.stringify({ scripts: { test: 'jest' } }));

    expect(detectProjectCommands(dir)).toEqual([
      { source: 'package.json', test: 'npm test', testFile: 'npx jest <file>' },
    ]);
  });

  it('ignores a malformed package.json', () => {
    write('package.json', '{ not json');

    expect(detectProjectCommands(dir)).toEqual([]);
  });

  it('reads Makefile targets', () => {
    write(
      'Makefile',
      'VAR := 1\nbuild:\n\tgo build\nlint: build\n\tgolangci-lint run\ntest:\n\tgo test\n',
    );

    expect(detectProjectCommands(dir)).toEqual([
      {
        source: 'Makefile',
        build: 'make build',
        lint: 'make lint',
        test: 'make test',
      },
    ]);
  });

  it('recognizes Cargo, Go and Python projects', () => {
    write('Cargo.toml', '[package]\nname = "x"\n');
    write('go.mod', 'module example.com/x\n');
    write(
      'pyproject.toml',
      '[tool.ruff]\n[tool.mypy]\n[tool.pytest.ini_options]\n',
    );

    const sources = detectProjectCommands(dir).map((entry) => entry.source);
    expect(sources).toEqual(['Cargo.toml', 'go.mod', 'pyproject.toml']);
    const python = detectProjectCommands(dir)[2];
    expect(python).toEqual({
      source: 'pyproject.toml',
      lint: 'ruff check .',
      typecheck: 'mypy .',
      testFile: 'pytest <file>',
      test: 'pytest',
    });
  });
});

describe('formatDetectedCommands', () => {
  it('lists each detected command with its source', () => {
    const text = formatDetectedCommands([
      { source: 'package.json', build: 'npm run build', test: 'npm test' },
    ]);

    expect(text).toContain('- build (package.json): `npm run build`');
    expect(text).toContain('- full test suite (package.json): `npm test`');
  });

  it('asks for TODO lines when nothing was detected', () => {
    expect(formatDetectedCommands([])).toContain('`TODO`');
  });
});
