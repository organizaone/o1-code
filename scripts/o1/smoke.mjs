#!/usr/bin/env node
// Bundle smoke test: proves that the publishable artifact starts and responds.
// Rejected approach: checking only for the existence of dist/cli.js. A bundle
// can exist and fail on the first import; only running it proves that it starts.
// The real prompt against a provider comes in Phase 1, once there is a brand to validate.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundle = join(root, 'dist', 'cli.js');
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL ${name}`);
  }
}

function runBundle(args) {
  return execFileSync(process.execPath, [bundle, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
    // Without this, execFileSync inherits the child's stderr and dumps it to the
    // terminal, while also embedding it in error.message: a broken bundle prints
    // the stack trace twice in the middle of the FAIL lines. Capturing both
    // streams keeps the summarized output a tooling script should have, without
    // losing the error message, which still arrives via error.message.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, O1CODE_SANDBOX: 'false' },
  });
}

check('bundle exists', () => {
  if (!existsSync(bundle)) throw new Error(`not found: ${bundle}`);
});

check('reports a version', () => {
  const out = runBundle(['--version']).trim();
  if (!/^\d+\.\d+\.\d+/.test(out)) throw new Error(`unexpected output: ${out}`);
});

check('prints help', () => {
  const out = runBundle(['--help']);
  if (out.length < 200) throw new Error(`help too short: ${out.length} chars`);
});

console.log(
  `smoke: ${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`}`,
);
for (const failure of failures) console.error(`  - ${failure}`);
process.exitCode = failures.length === 0 ? 0 : 1;
