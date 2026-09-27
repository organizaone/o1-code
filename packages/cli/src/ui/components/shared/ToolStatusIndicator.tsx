/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useContext } from 'react';
import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import type { Kind } from '@organizaone/o1-code-core/tools/tools.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { Spinner } from '../RespondingSpinner.js';
import { StreamingContext } from '../../contexts/StreamingContext.js';
import { SCREEN_READER_RESPONDING } from '../../textConstants.js';
import { toolRowMarker } from '../../utils/activity-category.js';
import { t } from '../../../i18n/index.js';

// One column for the status glyph plus one trailing column so the tool
// name never sits flush against the indicator. Paired with flexShrink={0}
// on the indicator Box so the reservation survives a tight header row.
// The fixed 2-col width ensures both 1-col and 2-col glyphs push text
// to the same start position.
export const STATUS_INDICATOR_WIDTH = 2;

/** Columns the category label takes, so tool names line up (spec §5.2). */
export const CATEGORY_LABEL_WIDTH = 11;

/** Below this content width a tool row keeps only its marker glyph. */
export const TOOL_LABEL_MIN_WIDTH = 40;

export function showsToolLabel(contentWidth: number): boolean {
  return contentWidth >= TOOL_LABEL_MIN_WIDTH;
}

/** Columns a tool row's marker takes: the glyph, plus the label if shown. */
export function toolRowPrefixWidth(
  status: ToolCallStatus,
  kind: Kind | undefined,
  showLabel: boolean,
): number {
  if (!showLabel) return STATUS_INDICATOR_WIDTH;
  const label = t(toolRowMarker(status, kind).label);
  return (
    STATUS_INDICATOR_WIDTH +
    Math.max(CATEGORY_LABEL_WIDTH, stringWidth(label) + 1)
  );
}

const ARIA_LABELS: Partial<Record<ToolCallStatus, string>> = {
  [ToolCallStatus.Success]: 'Success:',
  [ToolCallStatus.Confirming]: 'Confirming:',
  [ToolCallStatus.Canceled]: 'Canceled:',
  [ToolCallStatus.Error]: 'Error:',
};

type ToolStatusIndicatorProps = {
  status: ToolCallStatus;
  name: string;
  kind?: Kind;
  /** Shows the category label beside the marker, as a tool row does. */
  showLabel?: boolean;
};

export const ToolStatusIndicator: React.FC<ToolStatusIndicatorProps> = ({
  status,
  kind,
  showLabel = false,
}) => {
  // Read without the throwing hook: summaries render outside a turn too.
  const streamingState = useContext(StreamingContext);
  const marker = toolRowMarker(status, kind);
  // Outside a responding turn the spinner rests on the marker glyph, still in
  // the category colour.
  const spinning = marker.spin && streamingState === StreamingState.Responding;
  const label = t(marker.label);
  const labelPad =
    toolRowPrefixWidth(status, kind, true) -
    STATUS_INDICATOR_WIDTH -
    stringWidth(label);

  return (
    <>
      {/* minWidth (not width) so the box can grow for wider content like the
          tmux spinner frames or test mocks; all production glyphs are ≤2 cols. */}
      <Box minWidth={STATUS_INDICATOR_WIDTH} flexShrink={0}>
        {spinning ? (
          <Spinner
            spinnerType="dots"
            altText={SCREEN_READER_RESPONDING}
            color={marker.color}
          />
        ) : (
          <Text color={marker.color} aria-label={ARIA_LABELS[status]}>
            {marker.glyph}
          </Text>
        )}
      </Box>
      {showLabel && (
        <Box flexShrink={0}>
          <Text color={marker.color}>{label + ' '.repeat(labelPad)}</Text>
        </Box>
      )}
    </>
  );
};
