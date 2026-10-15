/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ShellConfiguration } from '@organizaone/o1-code-core/utils/shell-utils.js';

/**
 * Flags forwarded to a spawned `o1-code --acp` child. Shared by `runO1CodeServe`
 * (injected channel factory) and `createServeApp`'s default bridge spawn.
 */
export function acpChildExtraArgs(
  opts: {
    experimentalLsp?: boolean;
    restoreAskUserQuestion?: boolean;
  },
  shellConfiguration?: ShellConfiguration,
  platform = process.platform,
): string[] | undefined {
  const extraArgs = [
    ...(opts.experimentalLsp === true ? ['--experimental-lsp'] : []),
    ...(opts.restoreAskUserQuestion === true
      ? ['--restore-ask-user-question']
      : []),
    ...(platform === 'win32' && shellConfiguration
      ? [
          '--internal-agent-shell-type',
          shellConfiguration.shell === 'bash'
            ? 'git-bash'
            : shellConfiguration.shell,
          '--internal-agent-shell-executable',
          shellConfiguration.executable,
        ]
      : []),
  ];
  return extraArgs.length > 0 ? extraArgs : undefined;
}
