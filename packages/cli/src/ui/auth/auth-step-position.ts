/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AuthStepInput {
  /**
   * Menu screens already passed: none on the main screen, one on a group
   * list or at the start of a custom flow, two on the Alibaba Cloud plans.
   */
  screensBefore: number;
  /** Set inside a provider's own steps, as the flow reports them (1-based). */
  flow?: { stepIndex: number; totalSteps: number };
}

/**
 * Where the person is across the whole connection: the main screen, the
 * group lists, then the provider's own steps, the last of which is the
 * review. The total is known only once a provider is chosen, since each
 * provider has its own number of steps.
 */
export function getAuthStepPosition(input: AuthStepInput): {
  step: number;
  total?: number;
} {
  if (!input.flow) return { step: input.screensBefore + 1 };
  return {
    step: input.screensBefore + input.flow.stepIndex,
    total: input.screensBefore + input.flow.totalSteps,
  };
}
