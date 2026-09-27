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
  exportCredentialToEnv,
  forgetExportedCredentials,
  isExportedCredentialEnv,
  withdrawExportedCredential,
  credentialIdForProvider,
  listCredentials,
  readCredential,
  removeCredential,
  resolveApiKey,
  writeCredential,
} from './credential-store.js';

const isPosix = process.platform !== 'win32';

describe('credential store', () => {
  let home: string;
  const originalHome = process.env['O1CODE_HOME'];

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-credentials-'));
    process.env['O1CODE_HOME'] = home;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['O1CODE_HOME'];
    else process.env['O1CODE_HOME'] = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    vi.useRealTimers();
  });

  const fileOf = (id: string) => path.join(home, 'credentials', `${id}.json`);

  it('writes one file per provider with the key and when it was saved', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));

    writeCredential('anthropic', { apiKey: 'sk-ant-1' });

    expect(JSON.parse(fs.readFileSync(fileOf('anthropic'), 'utf8'))).toEqual({
      apiKey: 'sk-ant-1',
      savedAt: '2026-09-27T12:00:00.000Z',
    });
    expect(readCredential('anthropic')).toEqual({
      apiKey: 'sk-ant-1',
      savedAt: '2026-09-27T12:00:00.000Z',
    });
  });

  it.runIf(isPosix)('keeps the directory 0700 and the file 0600', () => {
    writeCredential('openai', { apiKey: 'sk-1' });

    expect(fs.statSync(path.join(home, 'credentials')).mode & 0o777).toBe(
      0o700,
    );
    expect(fs.statSync(fileOf('openai')).mode & 0o777).toBe(0o600);
  });

  it('replaces a saved key and leaves no temporary file behind', () => {
    writeCredential('openai', { apiKey: 'sk-old' });
    writeCredential('openai', { apiKey: 'sk-new' });

    expect(readCredential('openai')?.apiKey).toBe('sk-new');
    expect(fs.readdirSync(path.join(home, 'credentials'))).toEqual([
      'openai.json',
    ]);
  });

  it('reads a missing credential as absent', () => {
    expect(readCredential('gemini')).toBeUndefined();
  });

  it.each([
    ['not JSON', '{nope'],
    ['no key', JSON.stringify({ savedAt: 'x' })],
    ['an empty key', JSON.stringify({ apiKey: '', savedAt: 'x' })],
    ['a key that is not text', JSON.stringify({ apiKey: 42 })],
  ])('reads a corrupt file (%s) as absent', (_label, body) => {
    fs.mkdirSync(path.join(home, 'credentials'), { recursive: true });
    fs.writeFileSync(fileOf('zai'), body);

    expect(readCredential('zai')).toBeUndefined();
  });

  it.each(['', 'Anthropic', '../settings', 'a/b', '-lead', 'a.b', 'a b'])(
    'refuses the id %j',
    (id) => {
      expect(() => writeCredential(id, { apiKey: 'k' })).toThrow(
        /credential id/i,
      );
      expect(() => readCredential(id)).toThrow(/credential id/i);
      expect(() => removeCredential(id)).toThrow(/credential id/i);
    },
  );

  it('refuses an empty key', () => {
    expect(() => writeCredential('openai', { apiKey: '  ' })).toThrow(/empty/i);
  });

  it('removes a credential and says whether there was one', () => {
    writeCredential('deepseek', { apiKey: 'sk-d' });

    expect(removeCredential('deepseek')).toBe(true);
    expect(fs.existsSync(fileOf('deepseek'))).toBe(false);
    expect(removeCredential('deepseek')).toBe(false);
  });

  it('lists the saved ids, sorted, ignoring other files', () => {
    expect(listCredentials()).toEqual([]);
    writeCredential('openai', { apiKey: 'a' });
    writeCredential('anthropic', { apiKey: 'b' });
    fs.writeFileSync(path.join(home, 'credentials', 'notes.txt'), 'x');
    fs.writeFileSync(path.join(home, 'credentials', 'Bad.json'), '{}');

    expect(listCredentials()).toEqual(['anthropic', 'openai']);
  });
});

describe('exportCredentialToEnv', () => {
  afterEach(() => {
    delete process.env['O1_EXPORT_KEY'];
    delete process.env['O1_USER_KEY'];
    forgetExportedCredentials();
  });

  it('sets an unset variable for this process and remembers it', () => {
    expect(exportCredentialToEnv('O1_EXPORT_KEY', 'saved')).toBe(true);
    expect(process.env['O1_EXPORT_KEY']).toBe('saved');
    expect(isExportedCredentialEnv('O1_EXPORT_KEY')).toBe(true);
  });

  it('never overrides a variable the user set', () => {
    process.env['O1_USER_KEY'] = 'from-shell';
    expect(exportCredentialToEnv('O1_USER_KEY', 'saved')).toBe(false);
    expect(process.env['O1_USER_KEY']).toBe('from-shell');
    expect(isExportedCredentialEnv('O1_USER_KEY')).toBe(false);
  });

  it('replaces a value it exported itself, so a rotated key takes effect', () => {
    exportCredentialToEnv('O1_EXPORT_KEY', 'old');
    expect(exportCredentialToEnv('O1_EXPORT_KEY', 'new')).toBe(true);
    expect(process.env['O1_EXPORT_KEY']).toBe('new');
  });

  it('stops treating a variable as its own once something else changed it', () => {
    exportCredentialToEnv('O1_EXPORT_KEY', 'old');
    process.env['O1_EXPORT_KEY'] = 'edited';
    expect(exportCredentialToEnv('O1_EXPORT_KEY', 'new')).toBe(false);
    expect(process.env['O1_EXPORT_KEY']).toBe('edited');
  });

  it.each(['PATH', 'NODE_OPTIONS', 'home', 'not a name', '1ABC', ''])(
    'refuses the variable name %j',
    (name) => {
      const before = process.env[name];
      expect(exportCredentialToEnv(name, 'x')).toBe(false);
      expect(process.env[name]).toBe(before);
    },
  );

  it('withdraws a value it exported', () => {
    exportCredentialToEnv('O1_EXPORT_KEY', 'saved');
    withdrawExportedCredential('O1_EXPORT_KEY');
    expect(process.env['O1_EXPORT_KEY']).toBeUndefined();
    process.env['O1_USER_KEY'] = 'from-shell';
    withdrawExportedCredential('O1_USER_KEY');
    expect(process.env['O1_USER_KEY']).toBe('from-shell');
  });
});

describe('credentialIdForProvider', () => {
  it.each([
    ['anthropic', 'anthropic'],
    ['coding-plan', 'coding-plan'],
    ['alibabaStandard', 'alibaba-standard'],
  ])('maps the provider %s to the credential id %s', (providerId, id) => {
    expect(credentialIdForProvider(providerId)).toBe(id);
  });
});

describe('resolveApiKey', () => {
  let home: string;
  const originalHome = process.env['O1CODE_HOME'];

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'o1-credentials-'));
    process.env['O1CODE_HOME'] = home;
    delete process.env['O1_TEST_KEY'];
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['O1CODE_HOME'];
    else process.env['O1CODE_HOME'] = originalHome;
    delete process.env['O1_TEST_KEY'];
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('prefers a key set in the environment', () => {
    process.env['O1_TEST_KEY'] = 'from-shell';
    writeCredential('openai', { apiKey: 'from-store' });

    expect(resolveApiKey({ envKey: 'O1_TEST_KEY', credential: 'openai' })).toBe(
      'from-shell',
    );
  });

  it('then reads the credential the entry names', () => {
    writeCredential('openai', { apiKey: 'from-store' });
    writeCredential('grok', { apiKey: 'from-provider' });

    expect(
      resolveApiKey({
        envKey: 'O1_TEST_KEY',
        credential: 'openai',
        providerId: 'grok',
      }),
    ).toBe('from-store');
  });

  it('then the credential saved under the provider id', () => {
    writeCredential('alibaba-standard', { apiKey: 'from-provider' });

    expect(
      resolveApiKey({ envKey: 'O1_TEST_KEY', providerId: 'alibabaStandard' }),
    ).toBe('from-provider');
  });

  it('finds nothing else', () => {
    expect(resolveApiKey({ envKey: 'O1_TEST_KEY' })).toBeUndefined();
    expect(resolveApiKey({})).toBeUndefined();
  });

  it('treats an unusable credential reference as absent', () => {
    expect(resolveApiKey({ credential: '../escape' })).toBeUndefined();
  });
});
