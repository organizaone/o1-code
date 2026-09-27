/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A script to handle versioning and ensure all related changes are in a single, atomic commit.

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// 1. Get the version from the command line arguments.
const versionType = process.argv[2];
if (!versionType) {
  console.error('Error: No version specified.');
  console.error(
    'Usage: npm run version <version> (e.g., 1.2.3 or patch|minor|major|prerelease)',
  );
  process.exit(1);
}

// Resolve patch/minor/etc. once at the root, the single source of the
// version, then align every workspace package to it: they release in lockstep.
run(
  `corepack pnpm version ${versionType} --no-git-tag-version --allow-same-version --no-git-checks`,
);
const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
const newVersion = readJson(rootPackageJsonPath).version;
run(
  `corepack pnpm -r version ${newVersion} --no-git-tag-version --allow-same-version --no-git-checks`,
);

// 5. Keep the published Mem0 Extension manifest aligned with its package.
const mem0ManifestPath = resolve(
  process.cwd(),
  'integrations/external-context-mem0/o1-code-extension.json',
);
const mem0Manifest = readJson(mem0ManifestPath);
mem0Manifest.version = newVersion;
writeJson(mem0ManifestPath, mem0Manifest);
run(
  'npx prettier --experimental-cli --write integrations/external-context-mem0/o1-code-extension.json',
);

// 6. Update the sandboxImageUri in the root package.json
const rootPackageJson = readJson(rootPackageJsonPath);
if (rootPackageJson.config?.sandboxImageUri) {
  rootPackageJson.config.sandboxImageUri =
    rootPackageJson.config.sandboxImageUri.replace(/:.*$/, `:${newVersion}`);
  console.log(`Updated sandboxImageUri in root to use version ${newVersion}`);
  writeJson(rootPackageJsonPath, rootPackageJson);
}

// 7. Update the sandboxImageUri in the cli package.json
const cliPackageJsonPath = resolve(process.cwd(), 'packages/cli/package.json');
const cliPackageJson = readJson(cliPackageJsonPath);
if (cliPackageJson.config?.sandboxImageUri) {
  cliPackageJson.config.sandboxImageUri =
    cliPackageJson.config.sandboxImageUri.replace(/:.*$/, `:${newVersion}`);
  console.log(
    `Updated sandboxImageUri in cli package to use version ${newVersion}`,
  );
  writeJson(cliPackageJsonPath, cliPackageJson);
}

console.log(`Successfully bumped versions to v${newVersion}.`);
