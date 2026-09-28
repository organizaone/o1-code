/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildBackgroundEntryLabel,
  type AgentTask,
  type MonitorTask,
  type ShellTask,
} from '@organizaone/o1-code-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { formatDuration } from '../utils/formatters.js';
import { stripUnsafeCharacters } from '../utils/textUtils.js';

type TaskEntry = AgentTask | ShellTask | MonitorTask;

function statusLabel(entry: TaskEntry): string {
  switch (entry.kind) {
    case 'agent': {
      // Bind to a local so the `never`-typed default below operates on a
      // narrow-able value. Using `entry.status` directly inside the default
      // hits TS narrowing the whole `entry` to `never` after the case arms
      // exhaust the discriminated union, breaking the `.status` access.
      const status = entry.status;
      switch (status) {
        case 'completed':
          return 'completed';
        case 'failed':
          return `failed: ${entry.error ?? 'unknown error'}`;
        case 'cancelled':
          return 'cancelled';
        case 'paused':
          return entry.resumeBlockedReason
            ? `paused (resume blocked): ${entry.resumeBlockedReason}`
            : 'paused';
        case 'running':
          return 'running';
        default: {
          const _exhaustive: never = status;
          throw new Error(
            `statusLabel(agent): unknown status: ${JSON.stringify(_exhaustive)}`,
          );
        }
      }
    }
    case 'shell': {
      const status = entry.status;
      switch (status) {
        case 'completed':
          return `completed (exit ${entry.exitCode ?? '?'})`;
        case 'failed':
          return `failed: ${entry.error ?? 'unknown error'}`;
        case 'cancelled':
          return 'cancelled';
        case 'running':
          return 'running';
        default: {
          const _exhaustive: never = status;
          throw new Error(
            `statusLabel(shell): unknown status: ${JSON.stringify(_exhaustive)}`,
          );
        }
      }
    }
    case 'monitor': {
      // Append eventCount as a glanceable signal for activity. error (set
      // on `failed` and on auto-stopped `completed`) is included verbatim.
      const events = `${entry.eventCount} event${entry.eventCount === 1 ? '' : 's'}`;
      const status = entry.status;
      switch (status) {
        case 'completed':
          return entry.error
            ? `completed (${entry.error}, ${events})`
            : `completed (exit ${entry.exitCode ?? '?'}, ${events})`;
        case 'failed':
          return `failed: ${entry.error ?? 'unknown error'} (${events})`;
        case 'cancelled':
          return `cancelled (${events})`;
        case 'running':
          return `running (${events})`;
        default: {
          const _exhaustive: never = status;
          throw new Error(
            `statusLabel(monitor): unknown status: ${JSON.stringify(_exhaustive)}`,
          );
        }
      }
    }
    default: {
      const _exhaustive: never = entry;
      throw new Error(
        `statusLabel: unknown TaskEntry kind: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function taskLabel(entry: TaskEntry): string {
  switch (entry.kind) {
    case 'agent':
      return buildBackgroundEntryLabel(entry);
    case 'shell':
      return entry.command;
    case 'monitor':
      return entry.description;
    default: {
      const _exhaustive: never = entry;
      throw new Error(
        `taskLabel: unknown TaskEntry kind: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function taskId(entry: TaskEntry): string {
  switch (entry.kind) {
    case 'agent':
      return entry.agentId;
    case 'shell':
      return entry.shellId;
    case 'monitor':
      return entry.monitorId;
    default: {
      const _exhaustive: never = entry;
      throw new Error(
        `taskId: unknown TaskEntry kind: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function taskOutputPath(entry: TaskEntry): string | undefined {
  switch (entry.kind) {
    case 'agent':
    case 'shell':
      return entry.outputFile;
    case 'monitor':
      // Monitors stream to the agent via task_notification rather than a
      // file on disk — no output path to surface here.
      return undefined;
    default: {
      const _exhaustive: never = entry;
      throw new Error(
        `taskOutputPath: unknown TaskEntry kind: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

export const tasksCommand: SlashCommand = {
  name: 'tasks',
  get description() {
    return t('Open the background tasks (monitors, shells, agents)');
  },
  kind: CommandKind.BUILT_IN,
  // Kept on all three modes: the interactive dialog (reachable via ↓ +
  // Enter on the footer Background tasks pill) is the richer surface
  // when a TTY is available, but `non_interactive` and `acp` consumers
  // (headless `-p`, IDE bridges, SDK) have no dialog and rely on this
  // text dump as the only way to inspect background task state. See the
  // interactive-mode hint at the top of the output for the soft redirect.
  supportedModes: ['interactive', 'non_interactive', 'acp'] as const,
  canRunDuringStreaming: true,
  action: async (context) => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content: 'Config not available.',
      };
    }

    // Each registry already tags entries with `kind`, so no per-entry
    // mapping is needed here — just spread into a single sorted list.
    const agentEntries: AgentTask[] = [
      ...config.getBackgroundTaskRegistry().getAll(),
    ];
    const shellEntries: ShellTask[] = [
      ...config.getBackgroundShellRegistry().getAll(),
    ];
    const monitorEntries: MonitorTask[] = [
      ...config.getMonitorRegistry().getAll(),
    ];
    const entries: TaskEntry[] = [
      ...agentEntries,
      ...shellEntries,
      ...monitorEntries,
    ].sort((a, b) => a.startTime - b.startTime);

    if (entries.length === 0) {
      return {
        type: 'message' as const,
        messageType: 'info' as const,
        content: 'No background tasks.',
      };
    }

    // With a TTY the dialog is the richer surface: detail view, live
    // updates, cancel. Headless and ACP consumers keep the text dump below.
    if (context.executionMode === 'interactive') {
      return { type: 'dialog' as const, dialog: 'background_tasks' as const };
    }

    const now = Date.now();
    const lines: string[] = [];
    lines.push(`Background tasks (${entries.length} total)`, '');
    for (const entry of entries) {
      const endTime = entry.endTime ?? now;
      const runtime = formatDuration(endTime - entry.startTime, {
        hideTrailingZeros: true,
      });
      const pidPart =
        (entry.kind === 'shell' || entry.kind === 'monitor') &&
        entry.pid !== undefined
          ? ` pid=${entry.pid}`
          : '';
      lines.push(
        `[${taskId(entry)}] ${statusLabel(entry)}  ${runtime}${pidPart}  ${taskLabel(entry)}`,
      );
      const outputPath = taskOutputPath(entry);
      if (outputPath) {
        lines.push(`            output: ${outputPath}`);
      }
    }

    // Defense in depth: registry entries carry user-supplied / process-
    // supplied strings (description, command, error from spawn / settle).
    // A maliciously-crafted value could otherwise reach the terminal
    // verbatim and corrupt display via:
    //   - ANSI escape sequences (CSI / OSC / SGR — start with ESC)
    //   - bare C0 control bytes (BEL 0x07 audible bell, BS 0x08 cursor
    //     back, VT 0x0B, FF 0x0C, …)
    //   - C1 control bytes (0x80–0x9F)
    //   - VT control sequences
    // `stripUnsafeCharacters` (textUtils.ts) handles all four classes in
    // one pass while preserving TAB / CR / LF that we genuinely need
    // for line breaks and tabular formatting. Wrapping the joined
    // output once covers every field — including any future kind's
    // fields — without per-site sanitization sprawl.
    return {
      type: 'message' as const,
      messageType: 'info' as const,
      content: stripUnsafeCharacters(lines.join('\n')),
    };
  },
};
