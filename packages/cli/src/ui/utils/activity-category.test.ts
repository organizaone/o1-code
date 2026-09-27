/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Kind } from '@organizaone/o1-code-core/tools/tools.js';
import {
  categoryOfKind,
  getActivityCategory,
  toolRowMarker,
} from './activity-category.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import {
  StreamingState,
  ToolCallStatus,
  type HistoryItemWithoutId,
} from '../types.js';

const group = (kind: Kind | undefined, status: ToolCallStatus) =>
  ({
    type: 'tool_group',
    tools: [
      {
        callId: 'c',
        name: 'tool',
        description: '',
        resultDisplay: undefined,
        status,
        confirmationDetails: undefined,
        kind,
      },
    ],
  }) as unknown as HistoryItemWithoutId;

describe('categoryOfKind', () => {
  it('maps tool kinds to the design categories', () => {
    expect(
      [
        Kind.Read,
        Kind.Search,
        Kind.Fetch,
        Kind.Edit,
        Kind.Delete,
        Kind.Move,
        Kind.Execute,
        Kind.Think,
        Kind.Agent,
        Kind.Other,
        undefined,
      ].map(categoryOfKind),
    ).toEqual([
      'read',
      'read',
      'read',
      'write',
      'write',
      'write',
      'execute',
      'info',
      'info',
      'info',
      'info',
    ]);
  });
});

describe('getActivityCategory', () => {
  it('uses the category of the tool that is executing', () => {
    expect(
      getActivityCategory(
        [group(Kind.Execute, ToolCallStatus.Executing)],
        StreamingState.Responding,
      ),
    ).toBe('execute');
  });

  it('falls back to info while the agent responds without a running tool', () => {
    expect(
      getActivityCategory(
        [group(Kind.Read, ToolCallStatus.Success)],
        StreamingState.Responding,
      ),
    ).toBe('info');
  });

  it('shows the write category while an edit waits for approval', () => {
    expect(
      getActivityCategory(
        [group(Kind.Edit, ToolCallStatus.Confirming)],
        StreamingState.WaitingForConfirmation,
      ),
    ).toBe('write');
  });

  it('has no active category when idle', () => {
    expect(getActivityCategory([], StreamingState.Idle)).toBeNull();
  });
});

describe('toolRowMarker', () => {
  it('marks a finished tool with a dot in its category colour', () => {
    expect(toolRowMarker(ToolCallStatus.Success, Kind.Read)).toEqual({
      glyph: glyphs().dot,
      spin: false,
      color: extendedTheme.activity.read,
      label: 'reading',
    });
  });

  it('spins in the category colour while the tool runs', () => {
    expect(toolRowMarker(ToolCallStatus.Executing, Kind.Execute)).toEqual({
      glyph: glyphs().dot,
      spin: true,
      color: extendedTheme.activity.execute,
      label: 'running',
    });
  });

  it('spins in amber while the tool waits for approval', () => {
    expect(toolRowMarker(ToolCallStatus.Confirming, Kind.Edit)).toEqual({
      glyph: glyphs().dot,
      spin: true,
      color: extendedTheme.activity.execute,
      label: 'writing',
    });
  });

  it('keeps a quiet but readable dot for a tool not started yet', () => {
    expect(toolRowMarker(ToolCallStatus.Pending, undefined)).toEqual({
      glyph: glyphs().dot,
      spin: false,
      color: extendedTheme.text.muted,
      label: 'info',
    });
  });

  it('marks a failure in red, outside the categories', () => {
    expect(toolRowMarker(ToolCallStatus.Error, Kind.Read)).toEqual({
      glyph: glyphs().failed,
      spin: false,
      color: theme.status.error,
      label: 'failed',
    });
  });

  it('marks a canceled tool with a hollow dot in the muted colour', () => {
    expect(toolRowMarker(ToolCallStatus.Canceled, Kind.Read)).toEqual({
      glyph: glyphs().hollow,
      spin: false,
      color: extendedTheme.text.muted,
      label: 'canceled',
    });
  });
});
