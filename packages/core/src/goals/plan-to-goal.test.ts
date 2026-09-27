/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { draftGoalFromPlan } from './plan-to-goal.js';

const ON_BLOCK =
  'On block: propose blocked with 1) the context in a few lines, 2) what was tried, 3) options A/B/C with a recommendation, 4) one closed question, 5) what continues meanwhile; never claim completion without evidence for every Done-when item.';
const BUDGET_AND_CONTEXT =
  "Budget: as model guidance, stop as blocked after 20 turns. Context: [ASSUMPTION] the 20-turn budget is the drafter's default, not the user's; drafted from the approved plan.";

describe('draftGoalFromPlan', () => {
  it('turns numbered tasks, their checks, the constraints and the verification section into an objective', () => {
    const plan = [
      '# Add a dark mode toggle',
      '',
      'Some context about why.',
      '',
      '## Tasks',
      '1. Add a `theme` setting to `src/settings.ts`. Verify: `npm test -- settings` passes',
      '2. Render the toggle in `src/ui/Header.tsx`',
      '   - uses the existing `Switch` component',
      '   - **Check:** `npm run test:ui` exits 0',
      '3. Document it in `docs/theme.md`.',
      '',
      '## Constraints',
      '- Do not touch `src/legacy/`.',
      '- Keep the public API unchanged',
      '',
      '## Verification',
      '- `npm run lint` exits 0',
      '- `npm test` exits 0.',
    ].join('\n');

    expect(draftGoalFromPlan(plan)).toBe(
      [
        'Outcome: the approved plan "Add a dark mode toggle" is carried out.',
        'Done when:',
        '1) Add a `theme` setting to `src/settings.ts`, checked by `npm test -- settings` passes (paste the decisive output line);',
        '2) Render the toggle in `src/ui/Header.tsx`, checked by `npm run test:ui` exits 0 (paste the decisive output line);',
        '3) Document it in `docs/theme.md`, checked by <TODO: the check the plan names for this task>;',
        '4) `npm run lint` exits 0 (paste the decisive output line);',
        '5) `npm test` exits 0 (paste the decisive output line).',
        'Must not: Do not touch `src/legacy/`; Keep the public API unchanged; push, force-push, --no-verify unless the user allows them.',
        BUDGET_AND_CONTEXT.split(' Context: ')[0],
        ON_BLOCK,
        `Context: ${BUDGET_AND_CONTEXT.split(' Context: ')[1]}`,
      ].join(' '),
    );
  });

  it('falls back to the step headings when the plan has no numbered list', () => {
    const plan = [
      'Plan: speed up the importer',
      '',
      '### Step 1: Cache parsed files',
      'Keep the cache in memory.',
      'Verification: `npm run bench` prints under 2s',
      '',
      '### Step 2 - Parallelize reads',
    ].join('\n');

    const draft = draftGoalFromPlan(plan);

    expect(draft).toBe(
      [
        'Outcome: the approved plan "speed up the importer" is carried out.',
        'Done when:',
        '1) Cache parsed files, checked by `npm run bench` prints under 2s (paste the decisive output line);',
        '2) Parallelize reads, checked by <TODO: the check the plan names for this task>.',
        'Must not: push, force-push, --no-verify unless the user allows them.',
        BUDGET_AND_CONTEXT.split(' Context: ')[0],
        ON_BLOCK,
        `Context: ${BUDGET_AND_CONTEXT.split(' Context: ')[1]}`,
      ].join(' '),
    );
    // The /goal parser and propose_goal both want the objective on one line.
    expect(draft).not.toContain('\n');
  });

  it('leaves a TODO rather than inventing tasks for a plan it cannot read', () => {
    const draft = draftGoalFromPlan('Just do the thing carefully.');

    expect(draft).toContain(
      'Outcome: the approved plan "Just do the thing carefully" is carried out.',
    );
    expect(draft).toContain(
      'Done when: 1) <TODO: the plan tasks, each with the check the plan names>.',
    );
  });
});
