/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  O1ConnectError,
  forget,
  open,
  setup,
  type O1ConnectErrorCode,
  type SecretStore,
  type SetupInfo,
  type Transport,
} from '../../../vendor/o1-connect/lib.mjs';
import { AuthType } from '../../core/contentGenerator.js';
import {
  isUnreadableSecretFileError,
  setAsideUnreadableSecretFile,
} from '../../mcp/token-storage/file-token-storage.js';
import { createO1ConnectStore } from './store.js';

export { O1ConnectError };
export type { O1ConnectErrorCode, SecretStore, SetupInfo };

/** The tunnel of one session: its loopback endpoint and how to stop it. */
export interface O1ConnectSession {
  /** `http://127.0.0.1:<port>`: the Anthropic protocol. */
  baseUrl: string;
  /** `http://127.0.0.1:<port>/v1`: the OpenAI protocol. */
  openaiBaseUrl: string;
  /** The endpoint's own key for this session; not the device token. */
  apiKey: string;
  device: string;
  close(): Promise<void>;
}

export interface O1ConnectSetupResult extends SetupInfo {
  fingerprints: string[];
}

/**
 * Saves a connection code after the user confirmed every fingerprint it
 * pins. `onFingerprint` must answer true for the configuration to be saved
 * (contract §3.2). No network access.
 */
export async function setupO1Connect(
  code: string,
  options: {
    onFingerprint(
      fingerprints: string[],
      info: SetupInfo,
    ): boolean | Promise<boolean>;
    store?: SecretStore;
    transport?: Transport;
  },
): Promise<O1ConnectSetupResult> {
  return setup(code.trim(), {
    store: options.store ?? createO1ConnectStore(),
    onFingerprint: options.onFingerprint,
    ...(options.transport ? { transport: options.transport } : {}),
  });
}

/**
 * Opens the pinned tunnel from the saved configuration and checks the
 * proxy's keys through it before resolving, so an interception fails here
 * instead of at the first request.
 */
export async function openO1Connect(
  options: { store?: SecretStore; log?(line: string): void } = {},
): Promise<O1ConnectSession> {
  let connection: Awaited<ReturnType<typeof open>>;
  try {
    connection = await open({
      store: options.store ?? createO1ConnectStore(),
      ...(options.log ? { log: options.log } : {}),
    });
  } catch (error) {
    // The library's own text ("failed to read the configuration") hides why;
    // outside the setup screen this message is all the user sees.
    if (
      isO1ConnectError(error) &&
      error.code === 'store_failed' &&
      isUnreadableSecretFileError(error.cause)
    ) {
      throw new O1ConnectError(
        'store_failed',
        describeO1ConnectError(error).message,
        { cause: error.cause },
      );
    }
    throw error;
  }
  return {
    baseUrl: connection.baseUrl,
    openaiBaseUrl: connection.openaiBaseUrl,
    apiKey: connection.apiKey,
    device: connection.device,
    close: () => connection.close(),
  };
}

/** Deletes the saved configuration; the device's token keeps working until the console removes it. */
export async function forgetO1Connect(
  options: { store?: SecretStore } = {},
): Promise<void> {
  await forget({ store: options.store ?? createO1ConnectStore() });
}

/**
 * Moves a secret file this machine cannot decrypt to a `.bak` beside it, so
 * the next save starts a new one. Only on the user's explicit request: the
 * file may still hold other secrets readable on the machine that sealed it.
 */
export async function setAsideUnreadableSecretStore(
  filePath: string,
): Promise<string> {
  return setAsideUnreadableSecretFile(filePath);
}

/** The endpoint of the session for the protocol the session speaks. */
export function o1ConnectBaseUrlFor(
  session: Pick<O1ConnectSession, 'baseUrl' | 'openaiBaseUrl'>,
  authType: AuthType | undefined,
): string {
  return authType === AuthType.USE_OPENAI ||
    authType === AuthType.USE_OPENAI_RESPONSES
    ? session.openaiBaseUrl
    : session.baseUrl;
}

export function isO1ConnectError(error: unknown): error is O1ConnectError {
  return error instanceof O1ConnectError;
}

/**
 * What the user reads for each library error (contract §3.2), and whether
 * the saved configuration should be forgotten before trying again.
 */
export function describeO1ConnectError(error: unknown): {
  message: string;
  forgetAndSetUpAgain: boolean;
  /** Set when the secret file cannot be decrypted here; the user may set it aside. */
  unreadableSecretFile?: string;
} {
  if (
    isO1ConnectError(error) &&
    error.code === 'store_failed' &&
    isUnreadableSecretFileError(error.cause)
  ) {
    return {
      message: `The secret store at ${error.cause.filePath} cannot be decrypted on this machine: it was saved under another host name or user, or it is damaged. Setting up the connection code again offers to keep it as a .bak and start a new one.`,
      forgetAndSetUpAgain: false,
      unreadableSecretFile: error.cause.filePath,
    };
  }
  if (!isO1ConnectError(error)) {
    return {
      message: error instanceof Error ? error.message : String(error),
      forgetAndSetUpAgain: false,
    };
  }
  switch (error.code) {
    case 'invalid_code':
      return {
        message:
          'That is not an o1-gateway connection code (it starts with o1gw1.), or it is damaged. Paste it again.',
        forgetAndSetUpAgain: false,
      };
    case 'fingerprint_rejected':
      return {
        message: 'Nothing was saved: the fingerprints were not confirmed.',
        forgetAndSetUpAgain: false,
      };
    case 'not_set_up':
      return {
        message:
          'No o1-gateway connection is saved on this machine. Paste a connection code to set one up.',
        forgetAndSetUpAgain: false,
      };
    case 'invalid_config':
      return {
        message:
          'The saved o1-gateway connection is not one this version can read. Paste a connection code to set it up again.',
        forgetAndSetUpAgain: true,
      };
    case 'store_failed':
      return {
        message: `The secret store refused the connection (${
          error.cause instanceof Error
            ? error.cause.message
            : 'locked or unavailable'
        }).`,
        forgetAndSetUpAgain: false,
      };
    case 'identity_mismatch':
      return {
        message:
          "The proxy's key is not the one you pinned: this network may be intercepting the connection. Nothing was sent. Do not use a direct connection on this network.",
        forgetAndSetUpAgain: false,
      };
    case 'tunnel_unavailable':
      return {
        message:
          'The tunnel to o1-gateway could not be opened (network, proxy, or a device that may not tunnel). Try again later; if it persists, paste a new connection code.',
        forgetAndSetUpAgain: false,
      };
    case 'port_in_use':
    case 'port_unavailable':
      return {
        message: `No loopback port could be opened for the tunnel: ${error.message}`,
        forgetAndSetUpAgain: false,
      };
    default:
      return { message: error.message, forgetAndSetUpAgain: false };
  }
}
