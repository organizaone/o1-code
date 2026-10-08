/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { RequestHandler } from 'express';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import { registerWorkspaceAuthRoutes } from './workspace-auth.js';

const probeLocalServersMock = vi.hoisted(() => vi.fn());

vi.mock('@organizaone/o1-code-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@organizaone/o1-code-core')>()),
  probeLocalServers: probeLocalServersMock,
}));

function makeApp() {
  const app = express();
  const passThrough: RequestHandler = (_req, _res, next) => next();
  registerWorkspaceAuthRoutes(app, {
    mutate: () => passThrough,
    sendBridgeError: vi.fn(),
    boundWorkspace: '/work/bound',
    allowPrivateAuthBaseUrl: false,
  });
  return app;
}

describe('GET /workspace/auth/local-servers', () => {
  beforeEach(() => {
    probeLocalServersMock.mockReset();
  });

  it('answers with what the probes found on the daemon host', async () => {
    probeLocalServersMock.mockResolvedValue([
      {
        id: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        running: true,
        models: ['llama3.2:3b'],
      },
      {
        id: 'lmstudio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        running: false,
        models: [],
      },
    ]);

    const res = await request(makeApp()).get('/workspace/auth/local-servers');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        running: true,
        models: ['llama3.2:3b'],
      },
      {
        id: 'lmstudio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        running: false,
        models: [],
      },
    ]);
    expect(probeLocalServersMock).toHaveBeenCalledTimes(1);
  });

  it('probes again on every request', async () => {
    probeLocalServersMock.mockResolvedValue([]);
    const app = makeApp();
    await request(app).get('/workspace/auth/local-servers');
    await request(app).get('/workspace/auth/local-servers');
    expect(probeLocalServersMock).toHaveBeenCalledTimes(2);
  });
});

describe('POST /workspace/auth/provider', () => {
  it('allows the OrganizaOne API-key provider', async () => {
    const result = {
      v: 1 as const,
      providerId: 'organizaone',
      providerLabel: 'OrganizaOne',
      authType: AuthType.USE_OPENAI,
      message: 'Provider saved.',
    };
    const installAuthProvider = vi.fn(async () => result);
    const app = express();
    app.use(express.json());
    const passThrough: RequestHandler = (_req, _res, next) => next();
    registerWorkspaceAuthRoutes(app, {
      mutate: () => passThrough,
      sendBridgeError: vi.fn(),
      boundWorkspace: '/work/bound',
      allowPrivateAuthBaseUrl: false,
      installAuthProvider,
    });

    const res = await request(app)
      .post('/workspace/auth/provider')
      .send({ providerId: 'organizaone', apiKey: 'token' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(installAuthProvider).toHaveBeenCalledExactlyOnceWith({
      providerId: 'organizaone',
      apiKey: 'token',
    });
  });

  it.each(['organizaone-login', 'organizaone-o1gw'])(
    'refuses a catalog entry requiring a dedicated connection flow: %s',
    async (providerId) => {
      const installAuthProvider = vi.fn();
      const app = express();
      app.use(express.json());
      const passThrough: RequestHandler = (_req, _res, next) => next();
      registerWorkspaceAuthRoutes(app, {
        mutate: () => passThrough,
        sendBridgeError: vi.fn(),
        boundWorkspace: '/work/bound',
        allowPrivateAuthBaseUrl: false,
        installAuthProvider,
      });

      const res = await request(app)
        .post('/workspace/auth/provider')
        .send({ providerId, apiKey: 'token' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('unsupported_provider');
      expect(installAuthProvider).not.toHaveBeenCalled();
    },
  );
});
