/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { pickGatewaySmallModel } from './gateway-small-model.js';

describe('pickGatewaySmallModel', () => {
  it('picks the small model of the same family from the listed ids', () => {
    expect(
      pickGatewaySmallModel('claude-opus-5-5', [
        'claude-opus-5-5',
        'claude-sonnet-5',
        'claude-haiku-4-5',
        'gpt-5.5-mini',
      ]),
    ).toBe('claude-haiku-4-5');
    expect(
      pickGatewaySmallModel('gpt-5.6-terra', [
        'gpt-5.6-terra',
        'gpt-5.5-mini',
        'claude-haiku-4-5',
      ]),
    ).toBe('gpt-5.5-mini');
  });

  it('prefers the newest small model, then the plainest id', () => {
    expect(
      pickGatewaySmallModel('claude-opus-5-5', [
        'claude-haiku-4-5',
        'claude-haiku-5-5',
        'claude-haiku-5-5-20261001',
      ]),
    ).toBe('claude-haiku-5-5');
  });

  it('never returns an id the list does not have', () => {
    expect(
      pickGatewaySmallModel('claude-opus-5-5', [
        'claude-opus-5-5',
        'claude-sonnet-5',
      ]),
    ).toBeUndefined();
    expect(pickGatewaySmallModel('claude-opus-5-5', [])).toBeUndefined();
  });

  it('stays on a session model that is already small', () => {
    expect(
      pickGatewaySmallModel('claude-haiku-5-5', [
        'claude-haiku-5-5',
        'claude-haiku-4-5',
      ]),
    ).toBeUndefined();
  });

  it('stays on an exact account, group or own-credential route', () => {
    const listed = ['claude-haiku-4-5', 'o1gw/account/claude/2/claude-haiku'];
    expect(
      pickGatewaySmallModel('o1gw/account/claude/2/claude-opus-5-5', listed),
    ).toBeUndefined();
    expect(pickGatewaySmallModel('own-gpt-5.5', ['gpt-5.5-mini'])).toBe(
      undefined,
    );
    expect(pickGatewaySmallModel('claude-opus-5-5', listed)).toBe(
      'claude-haiku-4-5',
    );
  });
});
