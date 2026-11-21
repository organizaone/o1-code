/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The install scripts are standalone files: they cannot read brand.json or
// import the updater. These tests hold the strings they share with both.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const brand = JSON.parse(read('brand.json')).identity;
const shell = read('scripts/install/install.sh');
const powershell = read('scripts/install/install.ps1');
const updater = read('packages/cli/src/ui/standalone-update.ts');
const packager = read('scripts/create-standalone-package.js');

test('both scripts name the repository and the package from brand.json', () => {
  assert.ok(shell.includes(`REPO_URL='${brand.repoUrl}'`));
  assert.ok(shell.includes(`PACKAGE_NAME='${brand.npmName}'`));
  assert.ok(powershell.includes(`$repoUrl = '${brand.repoUrl}'`));
  assert.ok(powershell.includes(`$packageName = '${brand.npmName}'`));
});

test('the shell script writes the PATH block the updater recognizes', () => {
  for (const name of ['beginMarker', 'endMarker']) {
    const marker = updater.match(new RegExp(`const ${name} = '([^']+)'`))?.[1];
    assert.ok(marker, `${name} not found in the updater`);
    assert.ok(shell.includes(`'${marker}'`), `install.sh lacks "${marker}"`);
  }
});

test('the launchers are the ones the updater writes', () => {
  // Unix: `#!/usr/bin/env sh` + `exec '<dir>/bin/o1-code' "$@"`.
  assert.ok(
    updater.includes('`#!/usr/bin/env sh\\nexec ${quotedO1CodeBin} "$@"\\n`'),
  );
  assert.ok(shell.includes(`printf '#!/usr/bin/env sh\\nexec %s "$@"\\n'`));
  // Windows: `@echo off` + `call "<dir>\bin\o1-code.cmd" %*`, CRLF.
  assert.ok(
    updater.includes(
      '`@echo off\\r\\ncall "${standaloneDir}\\\\bin\\\\o1-code.cmd" %*\\r\\n`',
    ),
  );
  assert.ok(
    powershell.includes(
      '"@echo off`r`ncall `"$programDir\\bin\\o1-code.cmd`" %*`r`n"',
    ),
  );
});

test('the scripts ask for the archive names the packager produces', () => {
  assert.ok(
    packager.includes(
      'return `o1-code-${target}.${targetConfig.outputExtension}`',
    ),
  );
  assert.ok(shell.includes('archive="o1-code-${target}.tar.gz"'));
  assert.ok(powershell.includes('$archive = "o1-code-$target.zip"'));
  for (const target of [
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
    'win-x64',
  ]) {
    assert.ok(
      packager.includes(`'${target}'`),
      `${target} is not a packager target`,
    );
  }
});

test('the shell script runs only from its last line', () => {
  assert.match(shell.trimEnd(), /\nmain "\$@"$/);
  assert.match(
    powershell.trimEnd(),
    /\nInstall-O1Code [^\n]*(\n {2}-[^\n]*)*$/,
  );
});
