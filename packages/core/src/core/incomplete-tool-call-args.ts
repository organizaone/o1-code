/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { FunctionCall, Part } from '@google/genai';

/**
 * Marker for tool calls whose arguments arrived unterminated and were repaired
 * by the streaming parser, on a response that the output-token limit did not
 * cut. "The arguments were incomplete" and "max_tokens cut them" are separate
 * facts: the scheduler's refusal to write partial file content depends on the
 * first, the truncation wording and recovery on the second.
 *
 * The marker is a non-enumerable symbol, so it never reaches the wire, a log or
 * the recorded history. It also does not survive an object spread: any layer
 * that rebuilds a FunctionCall must carry it over explicitly.
 */
const INCOMPLETE_TOOL_CALL_ARGS = Symbol('incompleteToolCallArgs');

type FunctionCallWithIncompleteArgs = FunctionCall & {
  [INCOMPLETE_TOOL_CALL_ARGS]?: true;
};

function mark(functionCall: FunctionCall): void {
  Object.defineProperty(functionCall, INCOMPLETE_TOOL_CALL_ARGS, {
    value: true,
    enumerable: false,
  });
}

/** Marks every function call in `parts` as having arrived unterminated. */
export function markToolCallArgumentsIncomplete(
  parts: readonly Part[] | undefined,
): void {
  for (const part of parts ?? []) {
    if (part?.functionCall) mark(part.functionCall);
  }
}

export function toolCallArgumentsWereIncomplete(
  functionCall: FunctionCall,
): boolean {
  return (
    (functionCall as FunctionCallWithIncompleteArgs)[
      INCOMPLETE_TOOL_CALL_ARGS
    ] === true
  );
}

/** Copies the marker from `source` onto `target`, a rebuilt copy of the call. */
export function carryIncompleteArgumentsMarker(
  source: FunctionCall,
  target: FunctionCall,
): void {
  if (toolCallArgumentsWereIncomplete(source)) mark(target);
}
