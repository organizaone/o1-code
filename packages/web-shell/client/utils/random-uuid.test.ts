/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from './random-uuid';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  const realCrypto = globalThis.crypto;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delegates to crypto.randomUUID when the context exposes it', () => {
    const minted = vi.fn(() => '0b9c6f4e-1d2a-4f3b-9c8d-7e6f5a4b3c2d');
    vi.stubGlobal('crypto', { randomUUID: minted });
    expect(randomUUID()).toBe('0b9c6f4e-1d2a-4f3b-9c8d-7e6f5a4b3c2d');
    expect(minted).toHaveBeenCalledTimes(1);
  });

  it('mints unique v4 ids without crypto.randomUUID (non-secure context)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
    });
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = randomUUID();
      expect(id).toMatch(UUID_V4);
      ids.add(id);
    }
    expect(ids.size).toBe(200);
  });

  it('forces the version and variant bits whatever the entropy', () => {
    const fill = (byte: number) => ({
      getRandomValues: (bytes: Uint8Array) => bytes.fill(byte),
    });
    vi.stubGlobal('crypto', fill(0x00));
    expect(randomUUID()).toBe('00000000-0000-4000-8000-000000000000');
    vi.stubGlobal('crypto', fill(0xff));
    expect(randomUUID()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
