/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// The vendored o1-connect library protects the session on a network that
// intercepts TLS, so a copy that differs from the one recorded in
// vendor/o1-connect/VENDOR.json (checked against the proxy's published
// SHA-256 on a trusted network) must not ship.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemorySecretStore, setup } from '../../../vendor/o1-connect/lib.mjs';

const vendorDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../vendor/o1-connect',
);

const sha256 = (file: string): string =>
  createHash('sha256')
    .update(readFileSync(path.join(vendorDir, file)))
    .digest('hex');

describe('vendored o1-connect library', () => {
  it.each([undefined, ['https://failover.example']])(
    'preserves optional failover hosts in setup and stored credentials: %s',
    async (urls) => {
      const store = new MemorySecretStore();
      const payload = {
        url: 'https://primary.example',
        device: 'test-device',
        pins: [`sha256/${Buffer.alloc(32).toString('base64')}`],
        token: 'a'.repeat(64),
        ...(urls ? { urls } : {}),
      };
      const code = `o1gw1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
      const result = await setup(code, {
        store,
        onFingerprint: (_fingerprints, info) => {
          expect(info.urls).toEqual(urls);
          return true;
        },
      });
      expect(result.urls).toEqual(urls);
      expect(JSON.parse((await store.get('aipp-connect'))!).urls).toEqual(urls);
    },
  );
  const manifest = JSON.parse(
    readFileSync(path.join(vendorDir, 'VENDOR.json'), 'utf8'),
  ) as { version: string; files: Record<string, string> };

  it('matches the hashes recorded for the version it was copied from', () => {
    for (const [file, hash] of Object.entries(manifest.files)) {
      expect(`${file} ${sha256(file)}`).toBe(`${file} ${hash}`);
    }
  });

  it('carries the library banner of that version', () => {
    const firstLine = readFileSync(path.join(vendorDir, 'lib.mjs'), 'utf8')
      .split('\n')[0]!
      .trim();
    expect(firstLine).toMatch(
      new RegExp(
        `^// o1-connect-lib ${manifest.version.replace(/\./g, '\\.')} `,
      ),
    );
  });

  it('depends on nothing but node: modules', () => {
    const source = readFileSync(path.join(vendorDir, 'lib.mjs'), 'utf8');
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((specifier) => specifier.startsWith('node:'))).toBe(
      true,
    );
  });
});
