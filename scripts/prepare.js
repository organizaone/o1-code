/**
 * @license
 * Copyright 2026 Qwen Team
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';

// The inherited prepare script built and bundled the entire workspace on every
// install. That is why this repository's guide told contributors to install
// with `--ignore-scripts` and then run `patch-package` by hand: the flag was there to dodge this script.
// It is an easy thing to get half right, and getting it half right is quiet —
// without patch-package, `patches/ink+7.0.3.patch` never lands and
// `packages/cli` fails to compile for reasons that point nowhere near the
// install command.
//
// So the default is inverted here. Installing does the cheap, necessary part
// and nothing else; building is what `npm run build` is for. Set
// O1CODE_PREPARE_BUILD=1 to get the old behaviour, which the release workflows
// want because they install and expect a built tree in one step.
//
// The cheap part is not optional: `generate` writes git-commit.ts, which is
// gitignored and imported by packages that would otherwise fail to build or
// typecheck on a fresh clone.
const buildOnInstall = ['1', 'true'].includes(
  (process.env.O1CODE_PREPARE_BUILD ?? '').toLowerCase(),
);

run('npm', ['run', 'generate']);

if (!buildOnInstall) {
  // Git hooks are a convenience of a working copy, not a build requirement, so
  // a machine without husky still gets a usable install.
  run('husky', [], { optional: true });
  console.log(
    'prepare: generated sources only. Run `npm run build` to build, or set O1CODE_PREPARE_BUILD=1 to build on install.',
  );
  process.exit(0);
}

run('husky');
run('npm', ['run', 'build']);
run('npm', ['run', 'bundle']);

function run(command, args = [], { optional = false } = {}) {
  const result = spawnSync(command, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  const label = args.length ? `${command} ${args.join(' ')}` : command;

  const fail = (message) => {
    if (optional) {
      console.warn(`prepare: ${label} skipped: ${message}`);
      return;
    }
    console.error(`prepare: ${label} failed: ${message}`);
    process.exit(1);
  };

  if (result.error) {
    fail(result.error.message);
    return;
  }

  if (result.signal) {
    if (optional) {
      console.warn(
        `prepare: ${label} skipped: killed by signal ${result.signal}`,
      );
      return;
    }
    console.error(`prepare: ${label} killed by signal ${result.signal}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (optional) {
      console.warn(`prepare: ${label} exited with status ${result.status}`);
      return;
    }
    console.error(`prepare: ${label} exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
