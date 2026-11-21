/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UnreadableSecretFileError } from '@organizaone/o1-code-core/mcp/token-storage/file-token-storage.js';
import {
  O1ConnectError,
  describeO1ConnectError,
} from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import { describeOrganizaOneUnauthorized } from '@organizaone/o1-code-core/providers/organizaone-device-state.js';
import { setLanguageAsync, t } from '../../i18n/index.js';
import { localizeO1ConnectError } from './o1-connect-message.js';

type Context = Parameters<typeof describeO1ConnectError>[1];

const error = (code: string, cause?: unknown) =>
  new O1ConnectError(code as never, `lib: ${code}`, { cause });

// Every text the library's errors can produce: the core package writes them
// in English and the locale is keyed by that exact text, so a change on one
// side only would silently show English.
const cases: Array<[string, unknown, Context?]> = [
  ['invalid_code', error('invalid_code')],
  ['invalid_code (o1gw1.)', error('invalid_code'), { code: 'o1gw1.abc' }],
  ['code_used', error('code_used'), { stage: 'setup' }],
  ['code_expired', error('code_expired'), { stage: 'setup' }],
  ['device_refused', error('device_refused')],
  ['fingerprint_rejected', error('fingerprint_rejected')],
  ['not_set_up', error('not_set_up')],
  ['invalid_config', error('invalid_config')],
  ['store_failed', error('store_failed', new Error('keychain locked'))],
  ['store_failed (no reason)', error('store_failed')],
  [
    'store_failed (unreadable file)',
    error('store_failed', new UnreadableSecretFileError('/home/u/secrets')),
  ],
  ['identity_mismatch', error('identity_mismatch')],
  [
    'tunnel_unavailable (setup)',
    error('tunnel_unavailable'),
    { stage: 'setup' },
  ],
  ['tunnel_unavailable (open)', error('tunnel_unavailable'), { stage: 'open' }],
  ['port_in_use', error('port_in_use')],
  ['remote_refused', error('remote_refused')],
  ['remote_protocol', error('remote_protocol')],
  ['decision_closed', error('decision_closed')],
];

describe('o1-connect messages in pt-BR', () => {
  beforeAll(async () => {
    await setLanguageAsync('pt');
  });
  afterAll(async () => {
    await setLanguageAsync('en');
  });

  it.each(cases)('translates %s', (_name, failure, context) => {
    const english = describeO1ConnectError(failure, context).message;
    const localized = localizeO1ConnectError(failure, context);
    expect(localized).not.toBe(english);
    expect(localized).not.toContain('{{');
  });

  it('keeps the values a message carries', () => {
    expect(
      localizeO1ConnectError(
        error('store_failed', new Error('keychain locked')),
      ),
    ).toContain('keychain locked');
    expect(localizeO1ConnectError(error('port_in_use'))).toContain(
      'lib: port_in_use',
    );
  });

  it('leaves an error that is not the library’s as it came', () => {
    expect(localizeO1ConnectError(new Error('plain'))).toBe('plain');
  });

  it('translates the refusal of a device, through the tunnel and directly', () => {
    const viaTunnel = describeOrganizaOneUnauthorized(
      { status: 401, message: 'invalid key' },
      'http://127.0.0.1:4242',
      { tunnel: true },
    )!;
    const direct = describeOrganizaOneUnauthorized(
      { status: 401, message: 'invalid key' },
      'https://api.organizaone.com',
    )!;
    for (const refusal of [viaTunnel, direct]) {
      expect(refusal.kind).toBe('revoked');
      expect(t(refusal.message)).not.toBe(refusal.message);
    }
  });
});
