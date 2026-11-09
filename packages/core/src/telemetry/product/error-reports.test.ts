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
  buildErrorReport,
  collectErrorReports,
  sanitizeErrorText,
  storeErrorReport,
} from './error-reports.js';

const HOME = 'C:\\Users\\alice';

describe('sanitizeErrorText', () => {
  it('keeps the package path of a dependency and hides the user', () => {
    const text = sanitizeErrorText(
      'at run (file:///C:/Users/alice/AppData/npm/node_modules/@organizaone/o1-code/dist/cli.js:10:5)',
      HOME,
    );
    expect(text).toBe(
      'at run (node_modules/@organizaone/o1-code/dist/cli.js:10:5)',
    );
  });

  it("keeps Node's own module frames", () => {
    expect(
      sanitizeErrorText(
        'at process.processTicksAndRejections (node:internal/process/task_queues:103:5)',
        '/home/bob',
      ),
    ).toBe(
      'at process.processTicksAndRejections (node:internal/process/task_queues:103:5)',
    );
  });

  it('reduces a project path to its file name', () => {
    expect(
      sanitizeErrorText(
        "ENOENT: no such file, open '/home/bob/work/secret-repo/src/app.ts'",
        '/home/bob',
      ),
    ).toBe("ENOENT: no such file, open '…/app.ts'");
  });

  it('removes URLs, e-mail addresses and tokens', () => {
    // Built at run time so the sample does not read as a real key to scanners.
    const token = ['tok', 'abcdefghijklmnopqrstuvwxyz123456'].join('_');
    const text = sanitizeErrorText(
      `POST https://api.example.com/v1?key=1 by bob@example.com with ${token}`,
      '/home/bob',
    );
    expect(text).toBe('POST <url> by <email> with <redacted>');
  });

  it('removes short credentials and echoed content', () => {
    expect(
      sanitizeErrorText(
        'Authorization: Bearer abc123 password=hunter2 key AKIAABCDEFGHIJKLMNOP',
        '/home/bob',
      ),
    ).toBe(
      'Authorization: <redacted> <redacted> password=<redacted> key <redacted>',
    );
    expect(
      sanitizeErrorText(
        `Unexpected token 'x', "my private notes about the deal, page one" is not valid JSON`,
        '/home/bob',
      ),
    ).toBe(`Unexpected token 'x', "…" is not valid JSON`);
    expect(
      sanitizeErrorText(
        "Cannot read properties of undefined (reading 'id')",
        '/home/bob',
      ),
    ).toBe("Cannot read properties of undefined (reading 'id')");
  });
});

describe('error reports', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'error-reports-'));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('groups occurrences of the same failure across line numbers', () => {
    const at = (line: number) => {
      const error = new TypeError(`Cannot read ${HOME}\\notes.txt`);
      error.stack = `TypeError: x\n    at render (C:\\Users\\alice\\npm\\node_modules\\@organizaone\\o1-code\\dist\\cli.js:${line}:3)`;
      return error;
    };
    const first = buildErrorReport(
      at(10),
      'uncaughtException',
      '1.0.0',
      new Date('2026-11-09T10:00:00Z'),
      HOME,
    );
    const second = buildErrorReport(
      at(99),
      'uncaughtException',
      '1.0.0',
      new Date('2026-11-09T11:00:00Z'),
      HOME,
    );
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.message).toBe('Cannot read …/notes.txt');

    storeErrorReport(directory, first);
    storeErrorReport(directory, second);
    const { reports, files } = collectErrorReports(directory);
    expect(files).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      count: 2,
      firstSeen: '2026-11-09T10:00:00.000Z',
      lastSeen: '2026-11-09T11:00:00.000Z',
    });
  });

  it('keeps versions apart and accepts values that are not errors', () => {
    storeErrorReport(
      directory,
      buildErrorReport('boom', 'unhandledRejection', '1.0.0'),
    );
    storeErrorReport(
      directory,
      buildErrorReport('boom', 'unhandledRejection', '1.0.1'),
    );
    const { reports } = collectErrorReports(directory);
    expect(reports.map((report) => report.version).sort()).toEqual([
      '1.0.0',
      '1.0.1',
    ]);
    expect(reports[0]!.message).toBe('boom');
  });

  it('drops a stored report the intake would refuse', () => {
    storeErrorReport(
      directory,
      buildErrorReport('boom', 'uncaughtException', '1.0.0'),
    );
    fs.writeFileSync(
      path.join(directory, 'bad.json'),
      JSON.stringify({ fingerprint: 'x', count: '1' }),
    );
    const { reports } = collectErrorReports(directory);
    expect(reports).toHaveLength(1);
    expect(fs.readdirSync(directory)).toHaveLength(1);
  });
});
