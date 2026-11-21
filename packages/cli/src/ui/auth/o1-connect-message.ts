/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import {
  describeO1ConnectError,
  type O1ConnectErrorDescription,
} from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import { t } from '../../i18n/index.js';

/** An o1-connect error's text in the interface's language. */
export function localizeO1ConnectDescription(
  described: O1ConnectErrorDescription,
): string {
  return described.template
    ? t(described.template, described.params)
    : described.message;
}

/** What the user reads for an o1-connect error, in the interface's language. */
export function localizeO1ConnectError(
  error: unknown,
  context?: Parameters<typeof describeO1ConnectError>[1],
): string {
  return localizeO1ConnectDescription(describeO1ConnectError(error, context));
}
