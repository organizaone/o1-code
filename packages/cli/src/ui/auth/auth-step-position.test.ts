/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getAuthStepPosition } from './auth-step-position.js';

describe('getAuthStepPosition', () => {
  it('counts the main screen as the first step, total not yet known', () => {
    expect(getAuthStepPosition({ screensBefore: 0 })).toEqual({ step: 1 });
  });

  it('counts a group list as the second step', () => {
    expect(getAuthStepPosition({ screensBefore: 1 })).toEqual({ step: 2 });
  });

  it('counts the plan list of Alibaba Cloud as the third step', () => {
    expect(getAuthStepPosition({ screensBefore: 2 })).toEqual({ step: 3 });
  });

  it('continues after the group list inside a provider flow', () => {
    // main → API key → DeepSeek: key (1 of 2), then models.
    expect(
      getAuthStepPosition({
        screensBefore: 2,
        flow: { stepIndex: 1, totalSteps: 2 },
      }),
    ).toEqual({ step: 3, total: 4 });
  });

  it('opens a custom provider flow from the main screen', () => {
    expect(
      getAuthStepPosition({
        screensBefore: 1,
        flow: { stepIndex: 1, totalSteps: 4 },
      }),
    ).toEqual({ step: 2, total: 5 });
  });

  it('counts the plan list of Alibaba Cloud before its steps', () => {
    expect(
      getAuthStepPosition({
        screensBefore: 3,
        flow: { stepIndex: 1, totalSteps: 3 },
      }),
    ).toEqual({ step: 4, total: 6 });
  });

  it('ends on the last step of the flow', () => {
    const position = getAuthStepPosition({
      screensBefore: 2,
      flow: { stepIndex: 3, totalSteps: 3 },
    });
    expect(position.step).toBe(position.total);
  });
});
