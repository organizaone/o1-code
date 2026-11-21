/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

/** Words a vendor puts in the id of the small model of a family. */
const SMALL_MARKERS = new Set([
  'fast',
  'flash',
  'haiku',
  'lite',
  'mini',
  'nano',
  'small',
]);

const tokensOf = (id: string): string[] => id.toLowerCase().split(/[-._]/);

const isSmall = (id: string): boolean =>
  tokensOf(id).some((token) => SMALL_MARKERS.has(token));

/**
 * An id that names an exact account, group, provider or own credential on the
 * gateway. A catalog sibling of such a route may run on another account, so
 * the session model is kept for it.
 */
const isExactRoute = (id: string): boolean =>
  id.includes('/') || id.toLowerCase().startsWith('own-');

/** The version numbers of an id; a longer run of digits is a release date. */
const versionOf = (id: string): number[] =>
  tokensOf(id)
    .filter((token) => /^\d{1,3}$/.test(token))
    .map(Number);

function newestFirst(left: string, right: string): number {
  const a = versionOf(left);
  const b = versionOf(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length || left.localeCompare(right);
}

/**
 * The small model of the session model's family among the ids the gateway
 * lists for this device, for the short calls made around a turn. Undefined
 * when the list has none, or when the session model is itself small or an
 * exact route: the caller then stays on the session model.
 */
export function pickGatewaySmallModel(
  sessionModel: string,
  listed: readonly string[],
): string | undefined {
  if (isExactRoute(sessionModel) || isSmall(sessionModel)) return undefined;
  const [vendor, ...rest] = tokensOf(sessionModel);
  if (!vendor || rest.length === 0) return undefined;
  return listed
    .filter(
      (id) =>
        id !== sessionModel &&
        !isExactRoute(id) &&
        tokensOf(id)[0] === vendor &&
        isSmall(id),
    )
    .sort(newestFirst)[0];
}
