/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setSandboxMountExistsForTest } from '@organizaone/o1-code-acp-bridge/workspacePaths';
import { validateAndCanonicalizeWorkspaceInput } from './run-o1-code-serve.js';

// Container-sandbox wiring for the PRIMARY reproduction path: `o1-code serve --workspace
// C:\o1-code-repro` relaunched into a Linux Docker sandbox. The boot validator
// must translate to the bind mount BEFORE its absolute-path guard. statSync
// is mocked so the (root-level, uncreatable) translated mount stats as a
// directory; acp-bridge's canonicalizeWorkspace then falls back to the
// resolved path on ENOENT, matching a real container where the mount exists.
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:fs');
  return {
    ...actual,
    statSync: ((p: unknown, ...rest: unknown[]) =>
      p === '/c/o1-code-repro'
        ? ({ isDirectory: () => true } as ReturnType<typeof actual.statSync>)
        : (actual.statSync as (...a: unknown[]) => unknown)(
            p,
            ...rest,
          )) as typeof actual.statSync,
  };
});

describe('validateAndCanonicalizeWorkspaceInput inside a POSIX container sandbox', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    _setSandboxMountExistsForTest(undefined);
  });

  it.skipIf(process.platform === 'win32')(
    'boots a Windows-shaped --workspace via its bind-mount location',
    () => {
      vi.stubEnv('SANDBOX', 'o1-code-sandbox-0');
      _setSandboxMountExistsForTest((p) => p === '/c/o1-code-repro');
      expect(validateAndCanonicalizeWorkspaceInput('C:\\o1-code-repro')).toBe(
        '/c/o1-code-repro',
      );
    },
  );

  it.skipIf(process.platform === 'win32')(
    'still rejects a Windows-shaped --workspace outside a sandbox',
    () => {
      vi.stubEnv('SANDBOX', '');
      expect(() =>
        validateAndCanonicalizeWorkspaceInput('C:\\o1-code-repro'),
      ).toThrow('must be an absolute path');
    },
  );

  it('echoes the operator-typed input in the rejection, not the translation result', () => {
    vi.stubEnv('SANDBOX', '');
    // The extraction renamed the parameter; the message must interpolate
    // the RAW input ("relative/path"), never the null translation result.
    expect(() =>
      validateAndCanonicalizeWorkspaceInput('relative/path'),
    ).toThrow('Invalid --workspace "relative/path": must be an absolute path.');
  });
});
