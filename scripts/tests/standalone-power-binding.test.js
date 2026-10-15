/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { copyWindowsPowerBinding } from '../create-standalone-package.js';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(version = '3.3.2') {
  const directory = mkdtempSync(path.join(tmpdir(), 'o1-power-package-'));
  directories.push(directory);
  const modules = path.join(directory, 'modules');
  const output = path.join(directory, 'output');
  const write = (file, contents) => {
    const target = path.join(modules, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  write(
    'koffi/package.json',
    JSON.stringify({ name: 'koffi', version: '3.3.2' }),
  );
  write('koffi/index.cjs', 'module.exports = {};');
  write('@koromix/koffi-win32-x64/package.json', JSON.stringify({ version }));
  write('@koromix/koffi-win32-x64/win32_x64/koffi.node', 'x64 native fixture');
  write('@koromix/koffi-win32-arm64/package.json', JSON.stringify({ version }));
  return { modules, output };
}

it('stages the Windows power loader and matching x64 binary only', () => {
  const { modules, output } = fixture();
  copyWindowsPowerBinding(output, 'win-x64', modules);
  expect(
    readFileSync(path.join(output, 'lib/node_modules/koffi/index.cjs'), 'utf8'),
  ).toBe('module.exports = {};');
  expect(
    readFileSync(
      path.join(
        output,
        'lib/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node',
      ),
      'utf8',
    ),
  ).toBe('x64 native fixture');
  expect(
    existsSync(
      path.join(output, 'lib/node_modules/@koromix/koffi-win32-arm64'),
    ),
  ).toBe(false);
});

it('rejects a missing Windows power prebuild instead of shipping an unusable backend', () => {
  const { modules, output } = fixture();
  rmSync(path.join(modules, '@koromix/koffi-win32-x64'), { recursive: true });
  expect(() => copyWindowsPowerBinding(output, 'win-x64', modules)).toThrow(
    'Windows power binding',
  );
});

it('rejects a native package version that does not match its loader', () => {
  const { modules, output } = fixture('3.3.1');
  expect(() => copyWindowsPowerBinding(output, 'win-x64', modules)).toThrow(
    'version',
  );
});

it('does not stage the Windows-only power binding for other targets', () => {
  const { modules, output } = fixture();
  copyWindowsPowerBinding(output, 'darwin-arm64', modules);
  expect(existsSync(output)).toBe(false);
});
