/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
  type ToolConfirmationPayload,
} from '@organizaone/o1-code-core/tools/tools.js';
import type {
  RemoteAgent,
  RemoteDecision,
  RemoteDecisionKind,
  RemoteDecisionOption,
} from '@organizaone/o1-code-core/providers/o1-connect/remote.js';
import { t } from '../i18n/index.js';

/** The option a viewer picks to answer a question in its own words (`payload.text`). */
export const REMOTE_OTHER_ANSWER = 'other';

/** The gateway holds a request open at most an hour, whatever this says. */
export const REMOTE_DECISION_TTL_MS = 60 * 60 * 1000;

const SUMMARY_CHARS = 4000;

export interface RemoteDecisionSpec {
  kind: RemoteDecisionKind;
  title: string;
  summary: string;
  options: RemoteDecisionOption[];
}

const clip = (text: string): string =>
  text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS - 1)}…` : text;

const once = (): RemoteDecisionOption => ({
  value: ToolConfirmationOutcome.ProceedOnce,
  label: t('Yes, allow once'),
});
const deny = (label = t('No')): RemoteDecisionOption => ({
  value: ToolConfirmationOutcome.Cancel,
  label,
  danger: true,
});

/**
 * The question the terminal is asking, as a viewer may answer it
 * (contract §5.5): the outcomes the terminal's own prompt offers, minus the
 * ones that need the terminal (an external editor, a toggle of the view).
 * Null when the question cannot travel: a multi-question ask, whose
 * answers the tool wants all at once.
 */
export function describeToolConfirmation(
  details: ToolCallConfirmationDetails,
  options: { trustedFolder: boolean },
): RemoteDecisionSpec | null {
  const always =
    options.trustedFolder &&
    !('hideAlwaysAllow' in details && details.hideAlwaysAllow);
  switch (details.type) {
    case 'exec':
      return {
        kind: 'can_use_tool',
        title: t("Allow execution of: '{{command}}'?", {
          command: details.rootCommand,
        }),
        summary: clip(details.command),
        options: [
          once(),
          ...(always
            ? [
                {
                  value: ToolConfirmationOutcome.ProceedAlwaysProject,
                  label: t('Always allow in this project'),
                },
              ]
            : []),
          deny(t('No, suggest changes (esc)')),
        ],
      };
    case 'edit':
      return {
        kind: 'can_use_tool',
        title: t('Apply this change?'),
        summary: clip(`${details.filePath}\n${details.fileDiff}`),
        options: [
          once(),
          ...(always
            ? [
                {
                  value: ToolConfirmationOutcome.ProceedAlways,
                  label: t('Yes, allow always'),
                },
              ]
            : []),
          deny(t('No, suggest changes (esc)')),
        ],
      };
    case 'mcp':
      return {
        kind: 'can_use_tool',
        title: t(
          'Allow execution of MCP tool "{{tool}}" from server "{{server}}"?',
          { tool: details.toolDisplayName, server: details.serverName },
        ),
        summary: clip(details.title),
        options: [
          once(),
          ...(always
            ? [
                {
                  value: ToolConfirmationOutcome.ProceedAlwaysProject,
                  label: t('Always allow in this project'),
                },
              ]
            : []),
          deny(t('No, suggest changes (esc)')),
        ],
      };
    case 'info':
      return {
        kind: 'can_use_tool',
        title: clip(details.title),
        summary: clip(
          [details.prompt, ...(details.urls ?? [])].filter(Boolean).join('\n'),
        ),
        options: [
          once(),
          ...(always
            ? [
                {
                  value: ToolConfirmationOutcome.ProceedAlwaysProject,
                  label: t('Always allow in this project'),
                },
              ]
            : []),
          deny(t('No, suggest changes (esc)')),
        ],
      };
    case 'plan':
      return {
        kind: 'plan',
        title: clip(details.title),
        summary: clip(details.plan),
        options: [
          {
            value: ToolConfirmationOutcome.RestorePrevious,
            label: t('Yes, restore previous mode ({{mode}})', {
              mode: details.prePlanMode ?? 'default',
            }),
          },
          ...(options.trustedFolder
            ? [
                {
                  value: ToolConfirmationOutcome.ProceedAlways,
                  label: t('Yes, and auto-accept edits'),
                },
              ]
            : []),
          {
            value: ToolConfirmationOutcome.ProceedOnce,
            label: t('Yes, and manually approve edits'),
          },
          deny(t('No, keep planning (esc)')),
        ],
      };
    case 'ask_user_question': {
      const [question, ...rest] = details.questions;
      if (!question || rest.length > 0) return null;
      return {
        kind: 'ask_user',
        title: clip(question.question),
        summary: clip(
          question.options
            .map((option) =>
              option.description
                ? `${option.label}: ${option.description}`
                : option.label,
            )
            .join('\n'),
        ),
        options: [
          ...question.options.map((option) => ({
            value: option.label,
            label: option.label,
          })),
          { value: REMOTE_OTHER_ANSWER, label: t('Other') },
        ],
      };
    }
    default:
      return null;
  }
}

/**
 * What the terminal applies for a viewer's answer: the outcome the
 * terminal's own prompt would have produced, with the payload the tool
 * expects. Null when the answer names nothing the request offered.
 */
export function remoteAnswerToConfirmation(
  details: ToolCallConfirmationDetails,
  spec: RemoteDecisionSpec,
  answer: Pick<RemoteDecision, 'outcome' | 'payload'>,
): {
  outcome: ToolConfirmationOutcome;
  payload?: ToolConfirmationPayload;
} | null {
  if (!spec.options.some((option) => option.value === answer.outcome)) {
    return null;
  }
  if (details.type === 'ask_user_question') {
    const text =
      answer.outcome === REMOTE_OTHER_ANSWER
        ? typeof (answer.payload as { text?: unknown } | undefined)?.text ===
          'string'
          ? (answer.payload as { text: string }).text.trim() || null
          : null
        : answer.outcome;
    if (!text) return null;
    return {
      outcome: ToolConfirmationOutcome.ProceedOnce,
      payload: { answers: { 0: text } },
    };
  }
  return { outcome: answer.outcome as ToolConfirmationOutcome };
}

export interface RemoteDecisionBridgeOptions {
  /** A viewer answered first: apply it as if typed in the terminal. */
  onAnswer(id: string, answer: RemoteDecision): void;
  now?: () => number;
}

/**
 * Puts the terminal's open questions to the viewers and keeps the
 * first-answer rule (contract §5.5): the terminal's answer closes the
 * request `local`, a viewer's resolves it and is closed `remote` once the
 * terminal applied it, and one the terminal lets go is closed `expired`.
 */
export class RemoteDecisionBridge {
  private readonly open = new Map<string, RemoteDecisionSpec>();

  constructor(
    private readonly agent: Pick<
      RemoteAgent,
      'requestDecision' | 'closeDecision'
    >,
    private readonly options: RemoteDecisionBridgeOptions,
  ) {}

  isOpen(id: string): boolean {
    return this.open.has(id);
  }

  offer(id: string, spec: RemoteDecisionSpec): void {
    if (this.open.has(id)) return;
    this.open.set(id, spec);
    const expiresAt = new Date(
      (this.options.now ?? Date.now)() + REMOTE_DECISION_TTL_MS,
    ).toISOString();
    this.agent
      .requestDecision({ id, expiresAt, ...spec })
      .then((answer) => {
        if (!this.open.delete(id)) return;
        this.options.onAnswer(id, answer);
        this.agent.closeDecision(id, 'remote', answer.outcome);
      })
      .catch(() => {
        // `decision_closed`: the terminal answered first, or the session
        // ended; nothing is left to apply.
        this.open.delete(id);
      });
  }

  /** The terminal answered: tell the viewers, whatever they were about to say. */
  closeLocal(id: string, outcome?: string | null): void {
    if (!this.open.delete(id)) return;
    this.agent.closeDecision(id, 'local', outcome ?? null);
  }

  expire(id: string): void {
    if (!this.open.delete(id)) return;
    this.agent.closeDecision(id, 'expired');
  }

  /** Leaving remote mode: every open request is closed on the way out. */
  closeAll(): void {
    for (const id of [...this.open.keys()]) this.closeLocal(id);
  }
}
