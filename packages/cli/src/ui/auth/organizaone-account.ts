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
import { organizaoneLoginProvider } from '@organizaone/o1-code-core/providers/presets/organizaone.js';

/** The stored OrganizaOne sign-in token, shared by the OrganizaOne presets. */
export function organizaOneAccountCredential(): StoredCredential | undefined {
  return readCredential(
    credentialIdForProvider(
      organizaoneLoginProvider.credentialId ?? organizaoneLoginProvider.id,
    ),
  );
}

/**
 * Whether this key is the browser sign-in token of an OrganizaOne account.
 * A pasted API key under the same credential carries no expiry and is not
 * an account login.
 */
export function isOrganizaOneAccountLogin(apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  const credential = organizaOneAccountCredential();
  return credential?.apiKey === apiKey && credential.expiresAt !== undefined;
}
