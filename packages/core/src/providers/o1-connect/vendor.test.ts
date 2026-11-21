/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The vendored o1-connect library protects the session on a network that
// intercepts TLS, so a copy that differs from the gateway's own bytes, recorded
// in vendor/o1-connect/VENDOR.json, must not ship.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, createServer, type Server } from 'node:http';
import { connect } from 'node:net';
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
  // Setup is online from 13.0.0 on, so these stop at the confirmation: the
  // answer is no, and nothing is sent or saved.
  it.each([undefined, ['https://failover.example']])(
    'shows a code’s optional failover hosts at the confirmation: %s',
    async (urls) => {
      const store = new MemorySecretStore();
      const payload = {
        url: 'https://primary.example',
        device: 'test-device',
        pins: [`sha256/${Buffer.alloc(32).toString('base64')}`],
        enroll: 'a'.repeat(64),
        expires: '2099-01-01T00:00:00.000Z',
        ...(urls ? { urls } : {}),
      };
      const code = `o1gw2.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
      const shown: unknown[] = [];
      await expect(
        setup(code, {
          store,
          onFingerprint: (_fingerprints, info) => {
            shown.push(info.urls);
            return false;
          },
        }),
      ).rejects.toMatchObject({ code: 'fingerprint_rejected' });
      expect(shown).toEqual([urls]);
      expect(await store.get('aipp-connect')).toBeNull();
    },
  );

  it('refuses a code from before one-use codes by name', async () => {
    const store = new MemorySecretStore();
    const old = `o1gw1.${Buffer.from('{}').toString('base64url')}`;
    const refused = setup(old, { store, onFingerprint: () => true });
    await expect(refused).rejects.toMatchObject({ code: 'invalid_code' });
    await expect(refused).rejects.toThrow('o1gw1.');
    expect(await store.get('aipp-connect')).toBeNull();
  });
  const manifest = JSON.parse(
    readFileSync(path.join(vendorDir, 'VENDOR.json'), 'utf8'),
  ) as {
    version: string;
    files: Record<string, string>;
  };

  it.each(['main', 'operation', 'transfer'])(
    'forwards %s headers without replaying a consumed request after a tunnel reset',
    async (kind) => {
      const source = readFileSync(path.join(vendorDir, 'lib.mjs'), 'utf8');
      const testModule: {
        startLocalServer(options: {
          agent: Agent;
          target: URL;
          port: number;
          localKeyHash: string;
        }): Promise<Server>;
        hashLocalKey(key: string): string;
      } = await import(
        `data:text/javascript;base64,${Buffer.from(`${source}\nexport { startLocalServer, hashLocalKey };\n`).toString('base64')}`
      );
      let posts = 0;
      let forwarded: Record<string, string | string[] | undefined> = {};
      const backend = createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          if (req.method === 'GET') res.end('ready');
          else {
            posts++;
            forwarded = req.headers;
            req.socket.destroy();
          }
        });
      });
      await new Promise<void>((resolve) =>
        backend.listen(0, '127.0.0.1', resolve),
      );
      const address = backend.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing backend address');
      const backendPort = address.port;
      class TestTunnelAgent extends Agent {
        createConnection() {
          return connect({ host: '127.0.0.1', port: backendPort });
        }
      }
      const agent = new TestTunnelAgent({ keepAlive: true, maxSockets: 1 });
      const localKey = 'synthetic-local-key';
      const local = await testModule.startLocalServer({
        agent,
        target: new URL(`http://127.0.0.1:${address.port}`),
        port: 0,
        localKeyHash: testModule.hashLocalKey(localKey),
      });
      const localAddress = local.address();
      if (!localAddress || typeof localAddress === 'string')
        throw new Error('Missing relay address');
      const url = `http://127.0.0.1:${localAddress.port}`;
      const headers: Record<string, string> = {
        authorization: `Bearer ${localKey}`,
        'content-type': 'application/json',
      };
      try {
        const ready = await fetch(`${url}/v1/models`, { headers });
        await ready.text();
        headers['x-o1gw-conversation-id'] = 'synthetic-conversation';
        if (kind === 'operation') {
          headers['x-o1gw-operation-id'] = 'synthetic-operation';
          headers['x-o1gw-operation-purpose'] = 'summary';
        }
        if (kind === 'transfer')
          headers['x-o1gw-conversation-transfer'] = 'synthetic-grant-only';
        const response = await fetch(`${url}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'o1gw/account/copilot/2/auto',
            messages: [],
          }),
        });
        const answer = await response.text();
        expect(response.status).toBe(502);
        expect(answer).toContain('not sent again');
        expect(posts).toBe(1);
        for (const name of Object.keys(headers).filter((name) =>
          name.startsWith('x-o1gw-'),
        ))
          expect(forwarded[name]).toBe(headers[name]);
      } finally {
        agent.destroy();
        local.closeAllConnections();
        backend.closeAllConnections();
        await Promise.all([
          new Promise<void>((resolve) => local.close(() => resolve())),
          new Promise<void>((resolve) => backend.close(() => resolve())),
        ]);
      }
    },
  );

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
