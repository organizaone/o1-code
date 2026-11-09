/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectUsage,
  localDay,
  MAX_MAP_KEYS,
  UsageLedger,
} from './usage-ledger.js';

describe('UsageLedger', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-ledger-'));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('sums the files of concurrent processes per day', () => {
    const now = new Date(2026, 10, 9, 12);
    const first = new UsageLedger(directory, () => now, 'a');
    const second = new UsageLedger(directory, () => now, 'b');
    first.session('interactive');
    first.toolCall('read_file');
    first.apiResponse('organizaone', 100, 20);
    second.session('headless');
    second.toolCall('read_file');
    second.prompt();
    first.persist();
    second.persist();

    const { days, completedFiles } = collectUsage(directory, now);
    expect(completedFiles).toEqual([]);
    expect(days).toEqual([
      expect.objectContaining({
        day: '2026-11-09',
        sessions: { interactive: 1, headless: 1, sdk: 0 },
        prompts: 1,
        toolCalls: { read_file: 2 },
        providers: { organizaone: 1 },
        tokens: { input: 100, output: 20 },
      }),
    ]);
  });

  it('starts a new day at local midnight and keeps the finished one', () => {
    let now = new Date(2026, 10, 8, 23, 59);
    const ledger = new UsageLedger(directory, () => now, 'a');
    ledger.prompt();
    now = new Date(2026, 10, 9, 0, 1);
    ledger.prompt();
    ledger.persist();

    const collected = collectUsage(directory, now);
    expect(collected.days.map((day) => [day.day, day.prompts])).toEqual([
      ['2026-11-08', 1],
      ['2026-11-09', 1],
    ]);
    expect(collected.completedFiles).toHaveLength(1);
    expect(collected.completedFiles[0]).toContain('2026-11-08');
  });

  it('folds names beyond the limit into other', () => {
    const now = new Date(2026, 10, 9);
    const ledger = new UsageLedger(directory, () => now, 'a');
    for (let index = 0; index <= MAX_MAP_KEYS + 5; index++) {
      ledger.toolCall(`tool_${index}`);
    }
    ledger.persist();
    const [day] = collectUsage(directory, now).days;
    expect(Object.keys(day!.toolCalls)).toHaveLength(MAX_MAP_KEYS + 1);
    expect(day!.toolCalls['other']).toBe(6);
  });

  it('drops days older than the window and unreadable files', () => {
    const now = new Date(2026, 10, 9);
    fs.writeFileSync(path.join(directory, '2026-09-01.old.json'), '{}');
    fs.writeFileSync(path.join(directory, '2026-11-08.bad.json'), '{');
    expect(collectUsage(directory, now).days).toEqual([]);
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it('always sends every session mode, and only those', () => {
    const now = new Date(2026, 10, 9);
    fs.writeFileSync(
      path.join(directory, '2026-11-09.old.json'),
      JSON.stringify({ sessions: { headless: 2, server: 1 }, prompts: 1 }),
    );
    const [day] = collectUsage(directory, now).days;
    expect(day!.sessions).toEqual({ interactive: 0, headless: 2, sdk: 0 });
  });

  it('skips map keys from disk that the intake would refuse', () => {
    const now = new Date(2026, 10, 9);
    fs.writeFileSync(
      path.join(directory, '2026-11-09.old.json'),
      JSON.stringify({
        toolCalls: { read_file: 1, '../x': 1, constructor: 2 },
      }),
    );
    const [day] = collectUsage(directory, now).days;
    expect(day!.toolCalls).toEqual({ read_file: 1, constructor: 2 });
  });

  it('formats the local day', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
