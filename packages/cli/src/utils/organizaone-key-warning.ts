/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  credentialIdForProvider,
  readCredential,
  type StoredCredential,
} from '@organizaone/o1-code-core/providers/credential-store.js';
import {
  ORGANIZAONE_ACCOUNT_PATH,
  organizaOneKeyExpiryWarning,
} from '@organizaone/o1-code-core/providers/organizaone-device-state.js';
import {
  isOrganizaOneBaseUrl,
  organizaoneProvider,
} from '@organizaone/o1-code-core/providers/presets/organizaone.js';

/**
 * The startup warning about the OrganizaOne device key, when the session
 * talks to the proxy with a key that expires within the warning window
 * (contract §2.6). A key pasted by hand has no expiry and gets no warning.
 */
export function organizaOneStartupWarnings(options: {
  baseUrl: string | undefined;
  readCredential?: (id: string) => StoredCredential | undefined;
  now?: number;
}): string[] {
  if (!isOrganizaOneBaseUrl(options.baseUrl)) return [];
  const read = options.readCredential ?? readCredential;
  const credential = read(credentialIdForProvider(organizaoneProvider.id));
  const accountUrl = new URL(
    ORGANIZAONE_ACCOUNT_PATH,
    options.baseUrl,
  ).toString();
  const warning = organizaOneKeyExpiryWarning(
    credential?.expiresAt,
    accountUrl,
    options.now,
  );
  return warning ? [warning] : [];
}
