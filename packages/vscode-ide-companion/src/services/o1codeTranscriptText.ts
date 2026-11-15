/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { projectUserTranscriptForDisplay } from '@organizaone/o1-code-core';

type O1CodeTextRecord = {
  type?: unknown;
  subtype?: unknown;
  message?: unknown;
  systemPayload?: unknown;
};

/**
 * User records the session wrote for the model, not typed by the person:
 * their parts hold notification envelopes and runtime prompts. Only the
 * display text recorded with them is shown, as the ACP replay does.
 */
const SYNTHETIC_USER_SUBTYPES: ReadonlySet<unknown> = new Set([
  'goal_runtime',
  'notification',
  'cron',
]);

export function isSyntheticO1CodeUserRecord(record: O1CodeTextRecord): boolean {
  return record.type === 'user' && SYNTHETIC_USER_SUBTYPES.has(record.subtype);
}

/** A synthetic user record with nothing to show: callers leave it out. */
export function isHiddenO1CodeUserRecord(record: O1CodeTextRecord): boolean {
  return (
    isSyntheticO1CodeUserRecord(record) && o1codeRecordToText(record) === ''
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageParts(message: unknown): readonly unknown[] {
  if (!isRecord(message) || !Array.isArray(message.parts)) return [];
  return message.parts;
}

function partsToText(parts: readonly unknown[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (!isRecord(part)) continue;
    if (typeof part.text === 'string') {
      texts.push(part.text);
    } else if (typeof part.data === 'string') {
      texts.push(part.data);
    }
  }
  return texts.join('\n');
}

export function o1codeContentToText(message: unknown): string {
  return partsToText(messageParts(message));
}

export function o1codeRecordToText(record: O1CodeTextRecord): string {
  if (record.type !== 'user') return o1codeContentToText(record.message);

  const recordedDisplayText = isRecord(record.systemPayload)
    ? record.systemPayload['displayText']
    : undefined;
  if (SYNTHETIC_USER_SUBTYPES.has(record.subtype)) {
    return typeof recordedDisplayText === 'string' ? recordedDisplayText : '';
  }
  if (
    record.subtype === 'mid_turn_user_message' &&
    typeof recordedDisplayText === 'string'
  ) {
    // The parts carry the prefix written for the model around what was typed.
    return recordedDisplayText;
  }

  const projection = projectUserTranscriptForDisplay({
    message: { parts: messageParts(record.message) },
    systemPayload: record.systemPayload,
  });
  return projection.displayText ?? partsToText(projection.parts);
}
