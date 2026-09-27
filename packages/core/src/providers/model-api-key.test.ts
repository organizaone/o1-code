/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetExportedCredentials,
  writeCredential,
} from './credential-store.js';
import { exportSavedCredentials, resolveModelApiKey } from './model-api-key.js';

describe('resolveModelApiKey', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-model-key-'));
    vi.stubEnv('O1CODE_HOME', home);
    vi.stubEnv('DEEPSEEK_API_KEY', undefined);
    vi.stubEnv('O1_ENTRY_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    forgetExportedCredentials();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('prefers the variable set in the environment', () => {
    vi.stubEnv('O1_ENTRY_KEY', 'from-shell');
    writeCredential('mine', { apiKey: 'saved' });
    expect(
      resolveModelApiKey({ envKey: 'O1_ENTRY_KEY', credential: 'mine' }),
    ).toBe('from-shell');
  });

  it('then the credential the entry names', () => {
    writeCredential('mine', { apiKey: 'saved' });
    expect(
      resolveModelApiKey({ envKey: 'O1_ENTRY_KEY', credential: 'mine' }),
    ).toBe('saved');
  });

  it('then the credential of the preset the entry belongs to', () => {
    writeCredential('deepseek', { apiKey: 'preset-key' });
    expect(
      resolveModelApiKey({
        envKey: 'DEEPSEEK_API_KEY',
        baseUrl: 'https://api.deepseek.com',
      }),
    ).toBe('preset-key');
  });

  it('exports a saved key into the entry variable for this process', () => {
    writeCredential('mine', { apiKey: 'saved' });
    resolveModelApiKey({ envKey: 'O1_ENTRY_KEY', credential: 'mine' });
    expect(process.env['O1_ENTRY_KEY']).toBe('saved');
  });

  it('finds nothing for an entry with no key anywhere', () => {
    expect(resolveModelApiKey({ envKey: 'O1_ENTRY_KEY' })).toBeUndefined();
    expect(process.env['O1_ENTRY_KEY']).toBeUndefined();
  });
});

describe('exportSavedCredentials', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-model-key-'));
    vi.stubEnv('O1CODE_HOME', home);
    vi.stubEnv('O1_ENTRY_KEY', undefined);
    vi.stubEnv('O1_SHELL_KEY', 'from-shell');
    vi.stubEnv('DEEPSEEK_API_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    forgetExportedCredentials();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('exports the saved keys of the entries so placeholders can read them', () => {
    writeCredential('mine', { apiKey: 'saved' });
    writeCredential('deepseek', { apiKey: 'preset-key' });
    writeCredential('shell', { apiKey: 'saved-too' });

    const names = exportSavedCredentials({
      openai: [
        { id: 'a', envKey: 'O1_ENTRY_KEY', credential: 'mine' },
        {
          id: 'b',
          envKey: 'DEEPSEEK_API_KEY',
          baseUrl: 'https://api.deepseek.com',
        },
        { id: 'c', envKey: 'O1_SHELL_KEY', credential: 'shell' },
        { id: 'd', envKey: '${PLACEHOLDER}', credential: 'mine' },
        { id: 'e' },
      ],
      broken: 'not a list',
    });

    expect(names).toEqual(['O1_ENTRY_KEY', 'DEEPSEEK_API_KEY']);
    expect(process.env['O1_ENTRY_KEY']).toBe('saved');
    expect(process.env['DEEPSEEK_API_KEY']).toBe('preset-key');
    expect(process.env['O1_SHELL_KEY']).toBe('from-shell');
  });

  it('does nothing without providers', () => {
    expect(exportSavedCredentials(undefined)).toEqual([]);
  });
});
