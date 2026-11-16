/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Kind } from '../tools/tools.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import {
  canonicalToolName,
  resolveBuiltinToolName,
  ToolNames,
} from '../tools/tool-names.js';

/**
 * What a tool call says about the phase the turn is in. `exploration` gathers
 * information without changing anything; `progress` is everything else and
 * ends the exploration phase.
 */
export type ToolExplorationClass = 'exploration' | 'progress';

// Built-in tools are classified by name rather than by their declared kind:
// most of them are registered as lazy factories, so the instance (and its
// kind) is not loaded yet when the model's request is observed, and several
// read-only ones (`lsp`, `tool_search`, `cron_list`, `get_goal`) declare
// `Kind.Other` for scheduling reasons that have nothing to do with this.
const EXPLORATION_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  ToolNames.READ_FILE,
  ToolNames.ZOOM_IMAGE,
  ToolNames.GREP,
  ToolNames.GLOB,
  ToolNames.LS,
  ToolNames.LSP,
  ToolNames.WEB_FETCH,
  ToolNames.WEB_SEARCH,
  ToolNames.TOOL_SEARCH,
  ToolNames.READ_MCP_RESOURCE,
  ToolNames.LIST_AGENTS,
  ToolNames.TASK_LIST,
  ToolNames.CRON_LIST,
  ToolNames.GET_GOAL,
  ToolNames.OMNI_RECALL_MEDIA_MEMORY,
]);

const EXPLORATION_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);

export const TOOL_EXPLORATION_REMINDER =
  'System: this read-only exploration phase has reached the configured tool-call allowance. Review the information already gathered before continuing discovery. For an implementation request, proceed to the requested deliverable or explain the concrete blocker. For a read-only investigation, summarize the findings and identify any remaining question. Continue using tools only to resolve a specific remaining gap or to perform necessary verification. This reminder does not authorize writes and does not bypass plan approval or tool permissions.';

/**
 * Classifies one requested tool call.
 *
 * - A built-in tool is `exploration` when its registered name is in the
 *   read-only table above, `progress` otherwise (edits, shell, planning,
 *   todo and memory bookkeeping, delegation, user questions).
 * - Any other registered tool (MCP, discovered) follows its declared kind: an
 *   MCP tool annotated read-only is registered as `Kind.Read`.
 * - A `tool_call` envelope is classified by its target.
 * - A name the session does not have registered, and anything else that
 *   cannot be identified, is `progress`. That is the quiet default: an
 *   unrecognised call ends the phase instead of counting toward a reminder.
 */
export function classifyToolForExploration(
  registry: ToolRegistry | undefined,
  name: string,
  args: object,
): ToolExplorationClass {
  const registered = registry?.getAllToolNames?.() ?? [];
  let target = name;
  let bridged = false;
  if (name === ToolNames.TOOL_CALL) {
    const targetName = (args as Record<string, unknown>)['name'];
    if (typeof targetName !== 'string') return 'progress';
    bridged = true;
    target = targetName;
  }

  let resolved = canonicalToolName(target);
  if (bridged) {
    // The bridge matches its target case-insensitively, last match winning.
    const lower = resolved.toLowerCase();
    for (const candidate of registered) {
      if (candidate.toLowerCase() === lower) resolved = candidate;
    }
    // The bridge refuses both of its own halves, so such a call reads nothing.
    if (
      resolved === ToolNames.TOOL_CALL ||
      resolved === ToolNames.TOOL_SEARCH
    ) {
      return 'progress';
    }
  }

  if (!registered.includes(resolved)) return 'progress';
  if (EXPLORATION_TOOL_NAMES.has(resolved)) return 'exploration';
  if (resolveBuiltinToolName(resolved) !== undefined) return 'progress';

  const kind = registry?.getTool(resolved)?.kind;
  return kind !== undefined && EXPLORATION_KINDS.has(kind)
    ? 'exploration'
    : 'progress';
}

/**
 * Counts one uninterrupted run of exploration calls and hands out a single
 * reminder when the run reaches the allowance. It stores counters only: no
 * tool names, arguments or results.
 */
export class ToolExplorationBudget {
  private calls = 0;
  private reminded = false;
  private committedCalls = 0;
  private committedReminded = false;

  record(toolClass: ToolExplorationClass): void {
    if (toolClass === 'exploration') {
      this.calls++;
    } else {
      this.reset();
    }
  }

  takeReminder(allowance: number): string | undefined {
    if (
      !Number.isFinite(allowance) ||
      allowance <= 0 ||
      this.calls < allowance ||
      this.reminded
    ) {
      return undefined;
    }
    this.reminded = true;
    // A reminder that went out stays delivered even if the attempt that
    // follows it is rolled back.
    this.committedReminded = true;
    return TOOL_EXPLORATION_REMINDER;
  }

  /** Marks the calls recorded so far as belonging to a completed attempt. */
  commit(): void {
    this.committedCalls = this.calls;
    this.committedReminded = this.reminded;
  }

  /** Forgets the calls of an attempt that is about to be streamed again. */
  rollback(): void {
    this.calls = this.committedCalls;
    this.reminded = this.committedReminded;
  }

  // Commits the zeroed state too, so a later rollback cannot bring back the
  // count or the delivered flag of the phase that just ended.
  reset(): void {
    this.calls = 0;
    this.reminded = false;
    this.commit();
  }
}
