/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Storage } from '@organizaone/o1-code-core/config/storage.js';
import { computeWhatsNew, takeWhatsNew } from './whats-new.js';

const notes = {
  '0.1.0': { highlights: ['first'] },
  '0.2.0': { highlights: ['a', 'b'] },
  '0.2.1': { highlights: ['c', 'd', 'e'] },
};

describe('computeWhatsNew', () => {
  it('lists the newest release first, capped at four, and counts the rest', () => {
    expect(
      computeWhatsNew(notes, '0.1.0', '0.2.1', 'https://example.test/repo'),
    ).toEqual({
      version: '0.2.1',
      fromVersion: '0.1.0',
      highlights: ['c', 'd', 'e', 'a'],
      moreCount: 1,
      notesUrl: 'https://example.test/repo/releases/tag/v0.2.1',
    });
  });

  it('leaves out the release already seen and any later than this one', () => {
    expect(
      computeWhatsNew(notes, '0.2.0', '0.2.0', 'https://example.test/repo'),
    ).toBeUndefined();
    expect(
      computeWhatsNew(notes, '0.2.0', '0.2.1', 'https://example.test/repo')
        ?.highlights,
    ).toEqual(['c', 'd', 'e']);
  });
});

describe('takeWhatsNew', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whats-new-'));
    vi.spyOn(Storage, 'getGlobalO1CodeDir').mockReturnValue(dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const seen = () =>
    fs.readFileSync(path.join(dir, 'last-seen-version'), 'utf8').trim();

  it('records a first install and shows nothing', () => {
    expect(takeWhatsNew('0.2.1', notes)).toBeUndefined();
    expect(seen()).toBe('0.2.1');
  });

  it('shows what changed once after an upgrade', () => {
    fs.writeFileSync(path.join(dir, 'last-seen-version'), '0.2.0\n');
    expect(takeWhatsNew('0.2.1', notes)?.highlights).toEqual(['c', 'd', 'e']);
    expect(seen()).toBe('0.2.1');
    expect(takeWhatsNew('0.2.1', notes)).toBeUndefined();
  });

  it('shows nothing after a downgrade', () => {
    fs.writeFileSync(path.join(dir, 'last-seen-version'), '0.2.1\n');
    expect(takeWhatsNew('0.2.0', notes)).toBeUndefined();
    expect(seen()).toBe('0.2.0');
  });
});
