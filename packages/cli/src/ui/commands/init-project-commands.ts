/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Commands found in one build manifest. Each field is a shell command line;
 * `testFile` contains the literal placeholder `<file>`.
 */
export interface DetectedProjectCommands {
  source: string;
  build?: string;
  lint?: string;
  typecheck?: string;
  testFile?: string;
  test?: string;
}

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

function readText(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const text = fs.readFileSync(filePath, 'utf8');
    return typeof text === 'string' ? text : undefined;
  } catch {
    return undefined;
  }
}

function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function detectPackageManager(dir: string): PackageManager {
  if (exists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (
    exists(path.join(dir, 'bun.lockb')) ||
    exists(path.join(dir, 'bun.lock'))
  ) {
    return 'bun';
  }
  return 'npm';
}

function runScript(pm: PackageManager, script: string): string {
  if (script === 'test') return pm === 'npm' ? 'npm test' : `${pm} test`;
  return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;
}

function execBinary(pm: PackageManager, binary: string): string {
  switch (pm) {
    case 'pnpm':
      return `pnpm exec ${binary}`;
    case 'yarn':
      return `yarn ${binary}`;
    case 'bun':
      return `bunx ${binary}`;
    default:
      return `npx ${binary}`;
  }
}

function fromPackageJson(dir: string): DetectedProjectCommands | undefined {
  const text = readText(path.join(dir, 'package.json'));
  if (text === undefined) return undefined;
  let scripts: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return undefined;
    const raw = (parsed as { scripts?: unknown }).scripts;
    scripts =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return undefined;
  }
  const has = (name: string) => typeof scripts[name] === 'string';
  const pm = detectPackageManager(dir);
  const result: DetectedProjectCommands = { source: 'package.json' };
  if (has('build')) result.build = runScript(pm, 'build');
  if (has('lint')) result.lint = runScript(pm, 'lint');
  const typecheck = ['typecheck', 'type-check', 'check-types', 'tsc'].find(has);
  if (typecheck) result.typecheck = runScript(pm, typecheck);
  if (has('test')) {
    result.test = runScript(pm, 'test');
    const testScript = String(scripts['test']);
    if (/\bvitest\b/.test(testScript)) {
      result.testFile = `${execBinary(pm, 'vitest')} run <file>`;
    } else if (/\bjest\b/.test(testScript)) {
      result.testFile = `${execBinary(pm, 'jest')} <file>`;
    } else if (/\bmocha\b/.test(testScript)) {
      result.testFile = `${execBinary(pm, 'mocha')} <file>`;
    } else if (/\bnode\s+--test\b/.test(testScript)) {
      result.testFile = 'node --test <file>';
    }
  }
  return result;
}

function fromMakefile(dir: string): DetectedProjectCommands | undefined {
  const name = ['Makefile', 'GNUmakefile', 'makefile'].find((candidate) =>
    exists(path.join(dir, candidate)),
  );
  if (!name) return undefined;
  const text = readText(path.join(dir, name));
  if (text === undefined) return undefined;
  const targets = new Set(
    Array.from(text.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?!=)/gm), (m) => m[1]),
  );
  const result: DetectedProjectCommands = { source: name };
  if (targets.has('build')) result.build = 'make build';
  if (targets.has('lint')) result.lint = 'make lint';
  const typecheck = ['typecheck', 'check'].find((t) => targets.has(t));
  if (typecheck) result.typecheck = `make ${typecheck}`;
  if (targets.has('test')) result.test = 'make test';
  return result;
}

function fromCargo(dir: string): DetectedProjectCommands | undefined {
  if (!exists(path.join(dir, 'Cargo.toml'))) return undefined;
  return {
    source: 'Cargo.toml',
    build: 'cargo build',
    lint: 'cargo clippy',
    typecheck: 'cargo check',
    testFile: 'cargo test <test name>',
    test: 'cargo test',
  };
}

function fromGoMod(dir: string): DetectedProjectCommands | undefined {
  if (!exists(path.join(dir, 'go.mod'))) return undefined;
  return {
    source: 'go.mod',
    build: 'go build ./...',
    lint: 'go vet ./...',
    testFile: 'go test ./<package> -run <TestName>',
    test: 'go test ./...',
  };
}

function fromPython(dir: string): DetectedProjectCommands | undefined {
  const pyproject = readText(path.join(dir, 'pyproject.toml'));
  const hasPytestConfig =
    exists(path.join(dir, 'pytest.ini')) || exists(path.join(dir, 'tox.ini'));
  if (pyproject === undefined && !hasPytestConfig) return undefined;
  const result: DetectedProjectCommands = {
    source: pyproject !== undefined ? 'pyproject.toml' : 'pytest.ini',
  };
  const config = pyproject ?? '';
  if (/\bruff\b/.test(config)) result.lint = 'ruff check .';
  if (/\bmypy\b/.test(config)) result.typecheck = 'mypy .';
  if (hasPytestConfig || /\bpytest\b/.test(config)) {
    result.testFile = 'pytest <file>';
    result.test = 'pytest';
  }
  return result;
}

/**
 * Reads the build manifests at the root of `dir` and returns the commands
 * they declare. Best effort: unreadable or malformed files are skipped, and
 * the model that writes AGENTS.md verifies what it uses.
 */
export function detectProjectCommands(dir: string): DetectedProjectCommands[] {
  return [
    fromPackageJson(dir),
    fromMakefile(dir),
    fromCargo(dir),
    fromGoMod(dir),
    fromPython(dir),
  ].filter(
    (entry): entry is DetectedProjectCommands =>
      entry !== undefined && Object.keys(entry).length > 1,
  );
}

const COMMAND_LABELS: ReadonlyArray<
  [keyof Omit<DetectedProjectCommands, 'source'>, string]
> = [
  ['build', 'build'],
  ['lint', 'lint'],
  ['typecheck', 'typecheck'],
  ['testFile', 'test one file'],
  ['test', 'full test suite'],
];

/** Renders detected commands as a Markdown list for the /init prompt. */
export function formatDetectedCommands(
  detected: readonly DetectedProjectCommands[],
): string {
  if (detected.length === 0) {
    return 'No build manifest was recognized at the project root. Find the commands yourself; if a command does not exist, leave a `TODO` line instead of inventing one.';
  }
  const lines = [
    'Commands declared by the build manifests at the project root (verify each one before you write it down):',
  ];
  for (const entry of detected) {
    for (const [key, label] of COMMAND_LABELS) {
      const command = entry[key];
      if (command) lines.push(`- ${label} (${entry.source}): \`${command}\``);
    }
  }
  return lines.join('\n');
}
