/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setSandboxMountExistsForTest } from '@organizaone/o1-code-acp-bridge/workspacePaths';
import { parseOptionalWorkspaceCwd } from './dispatch.js';

// Container-sandbox wiring: the ACP JSON-RPC `cwd` entry point must translate a
// Windows-shaped path to its bind mount BEFORE its absolute-path guard —
// this is the dispatch-side sibling of request-helpers.sandbox.test.ts.
describe('ACP dispatch parseOptionalWorkspaceCwd inside a POSIX container sandbox', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    _setSandboxMountExistsForTest(undefined);
  });

  it.skipIf(process.platform === 'win32')(
    'accepts a Windows-shaped cwd and returns its bind-mount location',
    () => {
      vi.stubEnv('SANDBOX', 'o1-code-sandbox-0');
      _setSandboxMountExistsForTest((p) => p === '/c/o1-code-repro');
      expect(
        parseOptionalWorkspaceCwd(
          { cwd: 'C:\\o1-code-repro' },
          '/c/o1-code-repro',
        ),
      ).toBe('/c/o1-code-repro');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'still rejects a Windows-shaped cwd outside a sandbox',
    () => {
      vi.stubEnv('SANDBOX', '');
      expect(() =>
        parseOptionalWorkspaceCwd({ cwd: 'C:\\o1-code-repro' }, '/tmp'),
      ).toThrow('`cwd` must be an absolute path when provided');
    },
  );
});
