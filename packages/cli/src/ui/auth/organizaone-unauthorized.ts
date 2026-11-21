/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OrganizaOneUnauthorized } from '@organizaone/o1-code-core/providers/organizaone-device-state.js';
import { t } from '../../i18n/index.js';

/**
 * What the interface does when the OrganizaOne proxy refuses the device's
 * key (contract §2.6, and §3.2 for a device reached through the tunnel).
 * Returns true when the sign-in dialog takes over: a refused device's
 * credential is forgotten first, so the dialog does not offer the stale key
 * back, and a tunnel's configuration with it, since only a new connection
 * code brings that device back; an expired key is kept, since its owner can
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
      // A fixed text, so the locale has it; an expired key's message carries
      // the proxy's own words and stays as it came.
      actions.onAuthError(t(unauthorized.message));
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
