/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  companionAssetName,
  writeCompanionChecksum,
} from './o1/companion-artifact.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const target =
  targetIndex === -1
    ? `${process.platform}-${process.arch}`
    : args[targetIndex + 1];
const version = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).version;
const output = join(
  root,
  'packages',
  'vscode-ide-companion',
  companionAssetName(version, target),
);
execSync(
  `npm --workspace=o1-code-vscode-ide-companion run package -- --target ${target} --out "${output}"`,
  {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      VSCODE_TARGET: target,
      UNIVERSAL_BUILD: 'false',
      O1CODE_COMPANION_REUSE_BUILD: args.includes('--reuse-build') ? '1' : '0',
    },
  },
);
writeCompanionChecksum(output);
