/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OrganizaOneUnauthorized } from '@organizaone/o1-code-core/providers/organizaone-device-state.js';

/**
 * What the interface does when the OrganizaOne proxy refuses the device
 * token (contract §2.6). Returns true when the sign-in dialog takes over:
 * a removed device's credential is forgotten first, so the dialog does not
 * offer the stale key back; an expired key is kept, since its owner can
 * renew it on the account page and the same key then works again. A
 * suspended device is left to the error display: only its owner or an
 * administrator can resume it, and signing in again would not help.
 */
export function reactToOrganizaOneUnauthorized(
  unauthorized: OrganizaOneUnauthorized | undefined,
  actions: {
    forget: () => void;
    /** Drops the o1-connect configuration, for a device reached through the tunnel. */
    forgetTunnel?: () => void;
    onAuthError: (message: string) => void;
  },
): boolean {
  if (!unauthorized) return false;
  switch (unauthorized.kind) {
    case 'revoked':
      if (unauthorized.via === 'o1-connect') actions.forgetTunnel?.();
      else actions.forget();
      actions.onAuthError(unauthorized.message);
      return true;
    case 'expired':
      actions.onAuthError(unauthorized.message);
      return true;
    case 'suspended':
      return false;
    default:
      return false;
  }
}
