/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import stripAnsi from 'strip-ansi';
import { Kind } from '@organizaone/o1-code-core/tools/tools.js';
import { ToolStatusIndicator } from './ToolStatusIndicator.js';
import { StreamingState, ToolCallStatus } from '../../types.js';
import { StreamingContext } from '../../contexts/StreamingContext.js';
import { extendedTheme } from '../../semantic-colors.js';

vi.mock('../RespondingSpinner.js', () => ({
  Spinner: ({ color }: { color?: string }) => <Text>{`spin:${color}`}</Text>,
}));

const frame = (showLabel: boolean) =>
  stripAnsi(
    render(
      <StreamingContext.Provider value={StreamingState.Idle}>
        <Box>
          <ToolStatusIndicator
            status={ToolCallStatus.Success}
            name="read_file"
            kind={Kind.Read}
            showLabel={showLabel}
          />
          <Text>X</Text>
        </Box>
      </StreamingContext.Provider>,
    ).lastFrame() ?? '',
  ).replaceAll('︎', '');

describe('ToolStatusIndicator', () => {
  it('shows the dot and the category label in 11 columns', () => {
    expect(frame(true)).toBe('● reading    X');
  });

  it('shows only the dot without the label', () => {
    expect(frame(false)).toBe('● X');
  });

  it('spins in the category colour while a turn is responding', () => {
    const out = stripAnsi(
      render(
        <StreamingContext.Provider value={StreamingState.Responding}>
          <ToolStatusIndicator
            status={ToolCallStatus.Executing}
            name="read_file"
            kind={Kind.Read}
          />
        </StreamingContext.Provider>,
      ).lastFrame() ?? '',
    );
    expect(out).toContain(`spin:${extendedTheme.activity.read}`);
  });
});
