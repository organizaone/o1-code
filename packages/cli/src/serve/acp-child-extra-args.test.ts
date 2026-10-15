/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { acpChildExtraArgs } from './acp-child-extra-args.js';

describe('acpChildExtraArgs', () => {
  it('pins the Windows child executable before a pending spawn', () => {
    const selection = Object.freeze({
      shell: 'bash' as const,
      executable: 'C:\\Git\\bin\\bash.exe',
      argsPrefix: Object.freeze(['--noprofile', '--norc', '-c']),
    });
    const args = acpChildExtraArgs({}, selection, 'win32');
    expect(args).toEqual([
      '--internal-agent-shell-type',
      'git-bash',
      '--internal-agent-shell-executable',
      selection.executable,
    ]);
    expect(acpChildExtraArgs({}, selection, 'darwin')).toBeUndefined();
  });
  it('returns undefined when no child flags are set', () => {
    expect(acpChildExtraArgs({})).toBeUndefined();
    expect(acpChildExtraArgs({ experimentalLsp: false })).toBeUndefined();
    expect(
      acpChildExtraArgs({ restoreAskUserQuestion: false }),
    ).toBeUndefined();
  });

  it('merges lsp and restore flags in spawn order', () => {
    expect(acpChildExtraArgs({ experimentalLsp: true })).toEqual([
      '--experimental-lsp',
    ]);
    expect(acpChildExtraArgs({ restoreAskUserQuestion: true })).toEqual([
      '--restore-ask-user-question',
    ]);
    expect(
      acpChildExtraArgs({
        experimentalLsp: true,
        restoreAskUserQuestion: true,
      }),
    ).toEqual(['--experimental-lsp', '--restore-ask-user-question']);
  });
});
