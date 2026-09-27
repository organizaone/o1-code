/**
 * @license
 * Copyright 2026 Qwen Team
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

// The submit receipt is the WRITE half of cleanup's bypass-audit contract:
// `submit` records the writes it was authorised to make, and `cleanup` reads
// them to tell a sanctioned write from a bypass. The id axis is review ids
// (submit posts a review, never an issue comment). Both sides share
// these parsers, so a schema change (new field, renamed key) is a single
// edit both call sites inherit, rather than two implementations that must be
// kept in lockstep.

/**
 * The shared receipt-read contract, single home so a schema change or guard
 * fix is one edit every reader inherits: JSON.parse, the object guard, and the
 * numeric filter. Malformed input yields `null`; callers decide what that
 * means. Exported beyond the axis parsers because a writer rewriting the
 * file needs the WHOLE prior object to preserve fields it does not own.
 */
export function parseReceiptObject(
  raw: string,
): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  // `JSON.parse('null')` (and any non-object) succeeds but has no fields to
  // read — dereferencing it would throw, breaking the "never throws"
  // contract callers may rely on.
  if (value === null || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

/** The numeric ids under `key`, dropping non-numbers rather than trusting them. */
function numericIds(
  parsed: Record<string, unknown> | null,
  key: string,
): number[] {
  if (!parsed) return [];
  const field = parsed[key];
  if (!Array.isArray(field)) return [];
  return field.filter((n): n is number => typeof n === 'number');
}

/**
 * The review ids a receipt vouches for. Accepts the current
 * `reviewIds: number[]` shape and migrates a legacy single `reviewId` a
 * receipt written by an older CLI carries. Never throws: a malformed shape
 * yields an empty list, and the caller decides what an empty list means.
 */
export function parseReceiptIds(raw: string): number[] {
  const parsed = parseReceiptObject(raw);
  if (parsed && Array.isArray(parsed['reviewIds'])) {
    return numericIds(parsed, 'reviewIds');
  }
  const legacy = parsed ? parsed['reviewId'] : undefined;
  return typeof legacy === 'number' ? [legacy] : [];
}
