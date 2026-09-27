/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Every pnpm workspace member name, so any spelling of an internal
// dependency (file:, an exact release version, or *) rewrites to
// workspace:*. scripts/tests/package-scripts.test.js pins this set against
// the workspace manifests, so a newly added package fails that test until
// it is listed here.
export const workspacePackageNames = new Set([
  '@organizaone/o1-code-acp-bridge',
  '@organizaone/o1-code-audio-capture',
  '@organizaone/o1-code-external-context',
  '@organizaone/o1-code-external-context-mem0',
  '@organizaone/o1-code-node-repl-mcp',
  '@organizaone/o1-code',
  '@organizaone/o1-code-core',
  '@organizaone/o1-code-sdk',
  '@organizaone/o1-code-web-shell',
  '@organizaone/o1-code-web-templates',
  'o1-code-vscode-ide-companion',
]);

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

export const hooks = {
  readPackage(packageJson) {
    for (const field of dependencyFields) {
      const dependencies = packageJson[field];
      if (!dependencies) continue;

      for (const name of Object.keys(dependencies)) {
        if (workspacePackageNames.has(name)) {
          dependencies[name] = 'workspace:*';
        }
      }
    }

    return packageJson;
  },
};
