/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolDisplayNames,
  ToolNames,
} from '@organizaone/o1-code-core/tools/tool-names.js';
import { StreamingState, type HistoryItemWithoutId } from '../types.js';

const SKILL_TOOL_NAMES = new Set<string>([
  ToolNames.SKILL,
  ToolDisplayNames.SKILL,
]);

function lastSkillIn(items: readonly HistoryItemWithoutId[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type === 'user') return null;
    if (item.type !== 'tool_group') continue;
    for (let j = item.tools.length - 1; j >= 0; j--) {
      const tool = item.tools[j]!;
      const skill = tool.args?.['skill'];
      if (SKILL_TOOL_NAMES.has(tool.name) && typeof skill === 'string') {
        return skill;
      }
    }
  }
  return null;
}

/**
 * The skill loaded in the turn that is running, for the activity line
 * (spec §5.4): the last `skill` tool call since the person's last message.
 */
export function getActiveSkill(
  history: readonly HistoryItemWithoutId[],
  pending: readonly HistoryItemWithoutId[],
  streamingState: StreamingState,
  /**
   * Where the running turn starts in the history, when known: turns started
   * by a notification, a teammate or a schedule have no user message to stop
   * at.
   */
  turnStartIndex = 0,
): string | null {
  if (streamingState === StreamingState.Idle) return null;
  const fromPending = lastSkillIn(pending);
  if (fromPending) return fromPending;
  return lastSkillIn(history.slice(turnStartIndex));
}
