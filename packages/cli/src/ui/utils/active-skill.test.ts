/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getActiveSkill } from './active-skill.js';
import {
  StreamingState,
  ToolCallStatus,
  type HistoryItemWithoutId,
} from '../types.js';

const skillCall = (skill: string) =>
  ({
    type: 'tool_group',
    tools: [
      {
        callId: skill,
        name: 'Skill',
        description: skill,
        resultDisplay: undefined,
        status: ToolCallStatus.Success,
        confirmationDetails: undefined,
        args: { skill },
      },
    ],
  }) as unknown as HistoryItemWithoutId;

const user = (text: string) => ({ type: 'user', text }) as HistoryItemWithoutId;

describe('getActiveSkill', () => {
  it('finds the skill loaded in the running turn', () => {
    expect(
      getActiveSkill(
        [user('build it'), skillCall('build-release')],
        [],
        StreamingState.Responding,
      ),
    ).toBe('build-release');
  });

  it('prefers a skill still pending over the history', () => {
    expect(
      getActiveSkill(
        [user('go'), skillCall('old')],
        [skillCall('new')],
        StreamingState.Responding,
      ),
    ).toBe('new');
  });

  it('ignores skills from earlier turns', () => {
    expect(
      getActiveSkill(
        [user('first'), skillCall('old'), user('second')],
        [],
        StreamingState.Responding,
      ),
    ).toBeNull();
  });

  it('ignores skills before the turn started, even with no user message between', () => {
    // A notification, teammate or cron turn starts without a user message.
    expect(
      getActiveSkill(
        [
          user('go'),
          skillCall('old'),
          { type: 'info', text: 'cron' } as HistoryItemWithoutId,
        ],
        [],
        StreamingState.Responding,
        2,
      ),
    ).toBeNull();
  });

  it('shows nothing while the session is idle', () => {
    expect(
      getActiveSkill(
        [user('go'), skillCall('build-release')],
        [],
        StreamingState.Idle,
      ),
    ).toBeNull();
  });
});
