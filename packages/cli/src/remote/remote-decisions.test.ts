/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
} from '@organizaone/o1-code-core/tools/tools.js';
import {
  REMOTE_OTHER_ANSWER,
  RemoteDecisionBridge,
  describeToolConfirmation,
  remoteAnswerToConfirmation,
} from './remote-decisions.js';

const onConfirm = vi.fn().mockResolvedValue(undefined);

const exec: ToolCallConfirmationDetails = {
  type: 'exec',
  title: 'Shell',
  command: 'npm test',
  rootCommand: 'npm',
  onConfirm,
};

const ask: ToolCallConfirmationDetails = {
  type: 'ask_user_question',
  title: 'Question',
  questions: [
    {
      question: 'Which library?',
      header: 'Library',
      options: [
        { label: 'date-fns', description: 'Small' },
        { label: 'dayjs', description: 'Tiny' },
      ],
    },
  ],
  onConfirm,
};

describe('describeToolConfirmation', () => {
  it('offers a shell command as once / always / deny, without the editor', () => {
    const spec = describeToolConfirmation(exec, { trustedFolder: true });
    expect(spec).toMatchObject({
      kind: 'can_use_tool',
      summary: 'npm test',
    });
    expect(spec?.options.map((o) => o.value)).toEqual([
      ToolConfirmationOutcome.ProceedOnce,
      ToolConfirmationOutcome.ProceedAlwaysProject,
      ToolConfirmationOutcome.Cancel,
    ]);
    expect(spec?.options.at(-1)?.danger).toBe(true);
    expect(spec?.options.map((o) => o.value)).not.toContain(
      ToolConfirmationOutcome.ModifyWithEditor,
    );
  });

  it('withholds the always option in an untrusted folder', () => {
    const spec = describeToolConfirmation(exec, { trustedFolder: false });
    expect(spec?.options.map((o) => o.value)).toEqual([
      ToolConfirmationOutcome.ProceedOnce,
      ToolConfirmationOutcome.Cancel,
    ]);
  });

  it('puts a single question with its options and an "other"', () => {
    const spec = describeToolConfirmation(ask, { trustedFolder: true });
    expect(spec).toMatchObject({ kind: 'ask_user', title: 'Which library?' });
    expect(spec?.options.map((o) => o.value)).toEqual([
      'date-fns',
      'dayjs',
      REMOTE_OTHER_ANSWER,
    ]);
  });

  it('keeps a multi-question ask in the terminal', () => {
    const two: ToolCallConfirmationDetails = {
      ...ask,
      type: 'ask_user_question',
      questions: [ask.questions[0]!, { ...ask.questions[0]!, header: 'B' }],
    };
    expect(describeToolConfirmation(two, { trustedFolder: true })).toBeNull();
  });

  it('describes a plan with its exits', () => {
    const plan: ToolCallConfirmationDetails = {
      type: 'plan',
      title: 'Ship it?',
      plan: '1. do\n2. done',
      prePlanMode: 'auto-edit',
      onConfirm,
    };
    const spec = describeToolConfirmation(plan, { trustedFolder: true });
    expect(spec).toMatchObject({ kind: 'plan', summary: '1. do\n2. done' });
    expect(spec?.options.map((o) => o.value)).toEqual([
      ToolConfirmationOutcome.RestorePrevious,
      ToolConfirmationOutcome.ProceedAlways,
      ToolConfirmationOutcome.ProceedOnce,
      ToolConfirmationOutcome.Cancel,
    ]);
  });
});

describe('remoteAnswerToConfirmation', () => {
  it('applies an offered outcome and refuses one that was not offered', () => {
    const spec = describeToolConfirmation(exec, { trustedFolder: false })!;
    expect(
      remoteAnswerToConfirmation(exec, spec, { outcome: 'proceed_once' }),
    ).toEqual({ outcome: ToolConfirmationOutcome.ProceedOnce });
    expect(
      remoteAnswerToConfirmation(exec, spec, {
        outcome: 'proceed_always_project',
      }),
    ).toBeNull();
  });

  it('turns a question’s answer, picked or typed, into the tool’s answers', () => {
    const spec = describeToolConfirmation(ask, { trustedFolder: true })!;
    expect(remoteAnswerToConfirmation(ask, spec, { outcome: 'dayjs' })).toEqual(
      {
        outcome: ToolConfirmationOutcome.ProceedOnce,
        payload: { answers: { 0: 'dayjs' } },
      },
    );
    expect(
      remoteAnswerToConfirmation(ask, spec, {
        outcome: REMOTE_OTHER_ANSWER,
        payload: { text: '  luxon ' },
      }),
    ).toEqual({
      outcome: ToolConfirmationOutcome.ProceedOnce,
      payload: { answers: { 0: 'luxon' } },
    });
    expect(
      remoteAnswerToConfirmation(ask, spec, { outcome: REMOTE_OTHER_ANSWER }),
    ).toBeNull();
  });
});

describe('RemoteDecisionBridge', () => {
  function agent() {
    const pending = new Map<
      string,
      { resolve: (v: unknown) => void; reject: (e: unknown) => void }
    >();
    return {
      pending,
      requestDecision: vi.fn(
        (req: { id: string }) =>
          new Promise((resolve, reject) => {
            pending.set(req.id, { resolve, reject });
          }),
      ),
      closeDecision: vi.fn(),
    };
  }

  it('applies a viewer’s answer first and closes the request as remote', async () => {
    const a = agent();
    const onAnswer = vi.fn();
    const bridge = new RemoteDecisionBridge(a as never, {
      onAnswer,
      now: () => 1_000,
    });
    const spec = describeToolConfirmation(exec, { trustedFolder: false })!;
    bridge.offer('d1', spec);
    bridge.offer('d1', spec);
    expect(a.requestDecision).toHaveBeenCalledTimes(1);
    expect(a.requestDecision.mock.calls[0]![0]).toMatchObject({
      id: 'd1',
      kind: 'can_use_tool',
      expiresAt: new Date(1_000 + 3_600_000).toISOString(),
    });

    a.pending.get('d1')!.resolve({ outcome: 'proceed_once', by: 'remote' });
    await vi.waitFor(() => expect(onAnswer).toHaveBeenCalled());
    expect(onAnswer).toHaveBeenCalledWith('d1', {
      outcome: 'proceed_once',
      by: 'remote',
    });
    expect(a.closeDecision).toHaveBeenCalledWith(
      'd1',
      'remote',
      'proceed_once',
    );
    expect(bridge.isOpen('d1')).toBe(false);
  });

  it('closes a request the terminal answered first, and ignores a late viewer', async () => {
    const a = agent();
    const onAnswer = vi.fn();
    const bridge = new RemoteDecisionBridge(a as never, { onAnswer });
    bridge.offer(
      'd2',
      describeToolConfirmation(exec, { trustedFolder: false })!,
    );
    bridge.closeLocal('d2', 'cancel');
    expect(a.closeDecision).toHaveBeenCalledWith('d2', 'local', 'cancel');
    a.pending.get('d2')!.reject(new Error('decision_closed'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onAnswer).not.toHaveBeenCalled();
    bridge.closeLocal('d2');
    expect(a.closeDecision).toHaveBeenCalledTimes(1);
  });

  it('expires and closes everything on leave', () => {
    const a = agent();
    const bridge = new RemoteDecisionBridge(a as never, { onAnswer: vi.fn() });
    const spec = describeToolConfirmation(exec, { trustedFolder: false })!;
    bridge.offer('d3', spec);
    bridge.offer('d4', spec);
    bridge.expire('d3');
    expect(a.closeDecision).toHaveBeenCalledWith('d3', 'expired');
    bridge.closeAll();
    expect(a.closeDecision).toHaveBeenCalledWith('d4', 'local', null);
    expect(bridge.isOpen('d4')).toBe(false);
  });
});
