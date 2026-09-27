/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from '../../i18n/index.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago a session was touched, short and translated (spec §6.1). */
export function formatSessionAge(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE) return t('just now');
  if (elapsed < HOUR) {
    return t('{{count}} min ago', {
      count: String(Math.floor(elapsed / MINUTE)),
    });
  }
  if (elapsed < DAY) {
    return t('{{count}} h ago', { count: String(Math.floor(elapsed / HOUR)) });
  }
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return t('yesterday');
  if (days < 7) return t('{{count}} days ago', { count: String(days) });
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return t('1 week ago');
  return t('{{count}} weeks ago', { count: String(weeks) });
}
