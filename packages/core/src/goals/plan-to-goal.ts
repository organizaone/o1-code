/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The `On block:` shape the goal-draft skill asks for, so a Goal drafted from
 * a plan reports a block the same way as one drafted by the skill.
 */
export const GOAL_ON_BLOCK_FORMAT =
  'propose blocked with 1) the context in a few lines, 2) what was tried, 3) options A/B/C with a recommendation, 4) one closed question, 5) what continues meanwhile; never claim completion without evidence for every Done-when item';

/** Guardrails a Goal keeps unless the user allows them explicitly. */
export const GOAL_DEFAULT_MUST_NOT =
  'push, force-push, --no-verify unless the user allows them';

const NO_CHECK = '<TODO: the check the plan names for this task>';
const NO_TASKS = '<TODO: the plan tasks, each with the check the plan names>';
const PASTE = '(paste the decisive output line)';

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const NUMBERED_ITEM = /^\s{0,3}\d+[.)]\s+(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
/** A labelled check, on its own line or at the tail of a task. */
const CHECK_LABEL =
  /^(.*?)[\s.;,(-]*\b(?:verify|verification|check|test)\s*:\s*(.+)$/i;
const STEP_PREFIX = /^(?:step|task|phase)\s*\d+\s*[:.)-]?\s*/i;
const PLAN_PREFIX = /^plan\s*:\s*/i;
const VERIFICATION_SECTION = /verif|validat|testing|how to test|checks?\b/i;
const CONSTRAINT_SECTION =
  /constraint|must not|do not|don't|guardrail|out of scope|non-goal/i;

type SectionKind = 'body' | 'verification' | 'constraints';

interface PlanTask {
  text: string;
  check?: string;
}

/** Strips emphasis markers, collapses whitespace and trailing punctuation. */
function clean(text: string): string {
  return text
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.:;,]+$/, '')
    .trim();
}

function sectionKind(heading: string): SectionKind {
  if (CONSTRAINT_SECTION.test(heading)) return 'constraints';
  if (VERIFICATION_SECTION.test(heading)) return 'verification';
  return 'body';
}

/** Splits `Do X. Verify: Y` into the task and its check. */
function splitCheck(text: string): PlanTask {
  const match = CHECK_LABEL.exec(text.replace(/\*\*|__/g, ''));
  if (!match) return { text: clean(text) };
  return { text: clean(match[1]), check: clean(match[2]) };
}

/**
 * Builds a first draft of a Goal objective from a plan's numbered tasks (or,
 * without them, its step headings), the checks the plan names for each task,
 * its constraints and its verification section. The draft is a starting
 * point for the model, which refines it before proposing it; anything the
 * plan does not state is left as a `<TODO: …>` rather than invented.
 */
export function draftGoalFromPlan(planMarkdown: string): string {
  const lines = planMarkdown.split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim() !== '');
  let title = '';
  if (firstIndex >= 0) {
    const first = lines[firstIndex];
    const heading = HEADING.exec(first);
    title = clean((heading ? heading[1] : first).replace(PLAN_PREFIX, ''));
  }

  const numbered: PlanTask[] = [];
  const headed: PlanTask[] = [];
  const checks: string[] = [];
  const constraints: string[] = [];
  let kind: SectionKind = 'body';
  // The task a following check line belongs to, per extraction mode.
  let lastNumbered: PlanTask | undefined;
  let lastHeaded: PlanTask | undefined;

  lines.forEach((line, index) => {
    if (index <= firstIndex || line.trim() === '') return;

    const heading = HEADING.exec(line);
    if (heading) {
      kind = sectionKind(heading[1]);
      lastNumbered = undefined;
      lastHeaded = undefined;
      if (kind === 'body') {
        lastHeaded = splitCheck(heading[1].replace(STEP_PREFIX, ''));
        if (lastHeaded.text !== '') headed.push(lastHeaded);
      }
      return;
    }

    const listItem = LIST_ITEM.exec(line);
    const content = clean(listItem ? listItem[1] : line);
    if (content === '') return;

    if (kind === 'verification') {
      checks.push(content);
      return;
    }
    if (kind === 'constraints') {
      constraints.push(content);
      return;
    }

    const item = NUMBERED_ITEM.exec(line);
    if (item) {
      lastNumbered = splitCheck(item[1]);
      numbered.push(lastNumbered);
      return;
    }
    const labelled = CHECK_LABEL.exec(line.replace(/\*\*|__/g, ''));
    if (labelled && clean(labelled[1].replace(/^\s*[-*+]\s*/, '')) === '') {
      const check = clean(labelled[2]);
      const owner = lastNumbered ?? lastHeaded;
      if (owner && owner.check === undefined) owner.check = check;
    }
  });

  const tasks = numbered.length > 0 ? numbered : headed;
  const items = [
    ...tasks.map(
      (task) =>
        `${task.text}, checked by ${task.check ? `${task.check} ${PASTE}` : NO_CHECK}`,
    ),
    ...checks.map((check) => `${check} ${PASTE}`),
  ];
  const doneWhen =
    items.length > 0
      ? `${items.map((item, i) => `${i + 1}) ${item}`).join('; ')}.`
      : `1) ${NO_TASKS}.`;

  return [
    `Outcome: the approved plan${title ? ` "${title}"` : ''} is carried out.`,
    `Done when: ${doneWhen}`,
    `Must not: ${[...constraints, GOAL_DEFAULT_MUST_NOT].join('; ')}.`,
    'Budget: as model guidance, stop as blocked after 20 turns.',
    `On block: ${GOAL_ON_BLOCK_FORMAT}.`,
    "Context: [ASSUMPTION] the 20-turn budget is the drafter's default, not the user's; drafted from the approved plan.",
  ].join(' ');
}
