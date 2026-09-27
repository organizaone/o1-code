/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Application, RequestHandler } from 'express';
import {
  ALL_PROVIDERS,
  probeLocalServers,
  ProviderInstallError,
  resolveModelProtocol,
} from '@organizaone/o1-code-core';
import { writeStderrLine } from '../../utils/stdioHelpers.js';
import {
  buildAuthProviderCatalog,
  parseAuthProviderInstallRequest,
} from '../server/auth-provider-helpers.js';
import type { SendBridgeError } from '../server/error-response.js';
import { safeBody } from '../server/request-helpers.js';
import { sendGenerationClosedError } from '../workspace-route-runtime.js';
import type {
  ServeAuthProviderInstallRequest,
  ServeAuthProviderInstallResult,
  ServeLocalServerProbe,
  ServeModelProviderRuntimeSyncResult,
} from '../types.js';

interface RegisterWorkspaceAuthRoutesDeps {
  mutate: (opts?: { strict?: boolean }) => RequestHandler;
  sendBridgeError: SendBridgeError;
  boundWorkspace: string;
  allowPrivateAuthBaseUrl: boolean;
  installAuthProvider?: (
    req: ServeAuthProviderInstallRequest,
    assertGenerationOpen?: () => void,
  ) => Promise<ServeAuthProviderInstallResult>;
  syncModelProvidersRuntime?: () => Promise<ServeModelProviderRuntimeSyncResult>;
  captureGenerationAssertion?: () => (() => void) | undefined;
}

export function registerWorkspaceAuthRoutes(
  app: Application,
  deps: RegisterWorkspaceAuthRoutesDeps,
): void {
  const {
    mutate,
    sendBridgeError,
    boundWorkspace,
    allowPrivateAuthBaseUrl,
    installAuthProvider,
    syncModelProvidersRuntime,
    captureGenerationAssertion,
  } = deps;

  app.get('/workspace/auth/status', (_req, res) => {
    res.status(200).json({
      v: 1,
      workspaceCwd: boundWorkspace,
      providers: [],
    });
  });

  app.get('/workspace/auth/providers', (_req, res) => {
    res.status(200).json(buildAuthProviderCatalog(boundWorkspace));
  });

  // Ownership classification: process-global. The browser cannot reach the
  // daemon host's loopback, so the daemon asks Ollama and LM Studio on their
  // ports; no runtime, workspace or session is involved. A probe never fails:
  // a server that does not answer reads as not running.
  app.get('/workspace/auth/local-servers', async (_req, res) => {
    try {
      const servers: ServeLocalServerProbe[] = await probeLocalServers();
      res.status(200).json(servers);
    } catch (err) {
      sendBridgeError(res, err, {
        route: 'GET /workspace/auth/local-servers',
      });
    }
  });

  app.post(
    '/workspace/auth/provider',
    mutate({ strict: true }),
    async (req, res) => {
      if (!installAuthProvider) {
        res.status(501).json({
          error: 'Auth provider installation is not implemented by this daemon',
          code: 'not_implemented',
        });
        return;
      }
      const parsed = parseAuthProviderInstallRequest(safeBody(req), {
        allowPrivateBaseUrl: allowPrivateAuthBaseUrl,
      });
      if (!parsed.ok) {
        res.status(400).json({
          error: parsed.error,
          code: parsed.code,
        });
        return;
      }
      const installRequest = parsed.value;
      const knownProvider = ALL_PROVIDERS.find(
        (provider) => provider.id === installRequest.providerId,
      );
      if (!knownProvider) {
        res.status(400).json({
          error: `Unsupported auth provider: ${installRequest.providerId}`,
          code: 'unsupported_provider',
        });
        return;
      }
      if (installRequest.protocol) {
        const allowedProtocols =
          knownProvider.protocolOptions && knownProvider.protocolOptions.length
            ? knownProvider.protocolOptions
            : [knownProvider.protocol];
        if (!allowedProtocols.includes(installRequest.protocol)) {
          res.status(400).json({
            error: `protocol must be one of: ${allowedProtocols.join(', ')}`,
            code: 'unsupported_protocol',
          });
          return;
        }
      }
      try {
        resolveModelProtocol(
          installRequest.protocol ?? knownProvider.protocol,
          {
            wireApi: installRequest.wireApi,
          },
        );
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : String(error),
          code: 'invalid_api',
        });
        return;
      }
      try {
        const assertGenerationOpen = captureGenerationAssertion?.();
        assertGenerationOpen?.();
        const result = assertGenerationOpen
          ? await installAuthProvider(installRequest, assertGenerationOpen)
          : await installAuthProvider(installRequest);
        assertGenerationOpen?.();
        let runtimeSync: ServeModelProviderRuntimeSyncResult | undefined;
        if (syncModelProvidersRuntime) {
          try {
            runtimeSync = await syncModelProvidersRuntime();
          } catch (syncError) {
            if (sendGenerationClosedError(res, syncError)) return;
            writeStderrLine(
              'o1-code serve: POST /workspace/auth/provider runtime sync failed after persistence',
            );
            runtimeSync = { status: 'failed' };
          }
        }
        assertGenerationOpen?.();
        res.status(200).json({
          ...result,
          ...(runtimeSync ? { runtimeSync } : {}),
        });
      } catch (err) {
        if (
          err instanceof ProviderInstallError &&
          err.step === 'modelPurpose'
        ) {
          res
            .status(400)
            .json({ error: err.message, code: 'model_purpose_conflict' });
          return;
        }
        sendBridgeError(res, err, {
          route: 'POST /workspace/auth/provider',
          providerId: installRequest.providerId,
        });
      }
    },
  );
}
