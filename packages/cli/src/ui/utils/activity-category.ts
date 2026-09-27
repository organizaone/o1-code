/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Kind } from '@organizaone/o1-code-core/tools/tools.js';
import {
  StreamingState,
  ToolCallStatus,
  type HistoryItemWithoutId,
} from '../types.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';

/** The activity categories of the design; keys of `extendedTheme.activity`. */
export type ActivityCategory =
  | 'info'
  | 'read'
  | 'write'
  | 'execute'
  | 'success';

export function categoryOfKind(kind: Kind | undefined): ActivityCategory {
  switch (kind) {
    case Kind.Read:
    case Kind.Search:
    case Kind.Fetch:
      return 'read';
    case Kind.Edit:
    case Kind.Delete:
    case Kind.Move:
      return 'write';
    case Kind.Execute:
      return 'execute';
    default:
      return 'info';
  }
}

/** i18n keys of the category labels, shared by the activity line and tool rows. */
export const CATEGORY_LABELS: Readonly<Record<ActivityCategory, string>> = {
  info: 'info',
  read: 'reading',
  write: 'writing',
  execute: 'running',
  success: 'done',
};

export interface ToolRowMarker {
  glyph: string;
  /** A spinner replaces the glyph while the tool runs or awaits approval. */
  spin: boolean;
  color: string;
  /** i18n key of the label shown beside the marker. */
  label: string;
}

/** How a tool row is marked: its category, or a state outside the categories. */
export function toolRowMarker(
  status: ToolCallStatus,
  kind: Kind | undefined,
): ToolRowMarker {
  const category = categoryOfKind(kind);
  const label = CATEGORY_LABELS[category];
  switch (status) {
    case ToolCallStatus.Error:
      return {
        glyph: glyphs().failed,
        spin: false,
        color: theme.status.error,
        label: 'failed',
      };
    case ToolCallStatus.Canceled:
      return {
        glyph: glyphs().hollow,
        spin: false,
        color: extendedTheme.text.muted,
        label: 'canceled',
      };
    case ToolCallStatus.Pending:
      // Muted, not the separator colour: the label beside it must stay legible.
      return {
        glyph: glyphs().dot,
        spin: false,
        color: extendedTheme.text.muted,
        label,
      };
    case ToolCallStatus.Confirming:
      return {
        glyph: glyphs().dot,
        spin: true,
        color: extendedTheme.activity.execute,
        label,
      };
    case ToolCallStatus.Executing:
      return {
        glyph: glyphs().dot,
        spin: true,
        color: extendedTheme.activity[category],
        label,
      };
    default:
      return {
        glyph: glyphs().dot,
        spin: false,
        color: extendedTheme.activity[category],
        label,
      };
  }
}

const ACTIVE = new Set([ToolCallStatus.Executing, ToolCallStatus.Confirming]);

export function getActivityCategory(
  pending: readonly HistoryItemWithoutId[],
  streamingState: StreamingState,
): ActivityCategory | null {
  if (streamingState === StreamingState.Idle) return null;
  for (const item of pending) {
    if (item.type !== 'tool_group') continue;
    const active = item.tools.find((tool) => ACTIVE.has(tool.status));
    if (active) return categoryOfKind(active.kind);
  }
  return 'info';
}
