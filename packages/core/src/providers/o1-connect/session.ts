/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  O1ConnectError,
  forget,
  open,
  openRemote,
  setup,
  type O1ConnectErrorCode,
  type RemoteAgent,
  type RemoteOpenOptions,
  type SecretStore,
  type SetupInfo,
  type Transport,
} from '../../../vendor/o1-connect/lib.mjs';
import { AuthType } from '../../core/contentGenerator.js';
import {
  isUnreadableSecretFileError,
  setAsideUnreadableSecretFile,
} from '../../mcp/token-storage/file-token-storage.js';
import { O1_CONNECT_ENTRY_NAME, createO1ConnectStore } from './store.js';

export { O1ConnectError };
export type { O1ConnectErrorCode, SecretStore, SetupInfo };

/** What a remote session announces and serves, without how it is reached (contract §5.4). */
export type RemoteSessionOptions = Omit<
  RemoteOpenOptions,
  'baseUrl' | 'apiKey' | 'connection'
>;

/** The tunnel of one session: its loopback endpoint and how to stop it. */
export interface O1ConnectSession {
  /** `http://127.0.0.1:<port>`: the Anthropic protocol. */
  baseUrl: string;
  /** `http://127.0.0.1:<port>/v1`: the OpenAI protocol. */
  openaiBaseUrl: string;
  /** The endpoint's own key for this session; not the device's key. */
  apiKey: string;
  device: string;
  /**
   * Puts a terminal session in remote mode through this tunnel: the
   * WebSocket rides its inner TLS as the device whose key the tunnel proved,
   * so a network that passes the tunnel passes remote mode (contract §5.4).
   */
  openRemote(options: RemoteSessionOptions): Promise<RemoteAgent>;
  close(): Promise<void>;
}

export interface O1ConnectSetupResult extends SetupInfo {
  fingerprints: string[];
}

/** A code from before one-use codes: refused, never migrated. */
const OLD_CODE_PREFIX = 'o1gw1.';

/**
 * Reads the secret store before a connection code is spent. A code works
 * once, so a store that cannot be read has to be found before the enrolment,
 * not at the save that follows it. Rejects with `store_failed`.
 */
export async function checkO1ConnectStore(
  options: { store?: SecretStore } = {},
): Promise<void> {
  const store = options.store ?? createO1ConnectStore();
  try {
    await store.get(O1_CONNECT_ENTRY_NAME);
  } catch (error) {
    throw new O1ConnectError(
      'store_failed',
      'the secret store failed to read the configuration',
      { cause: error },
    );
  }
}

/**
 * Sets this machine up from a connection code, after the user confirmed
 * every fingerprint it pins: `onFingerprint` must answer true (contract
 * §3.2). Then it needs the network: the library makes the device's key pair
 * here, enrols the public key through the pinned tunnel with the code's
 * one-use secret, and only then saves the configuration. On any failure
 * nothing is saved.
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
 * proxy's keys through it before resolving, so an interception, or a device
 * key the gateway no longer accepts, fails here instead of at the first
 * request. A configuration that cannot come back (`device_refused`,
 * `invalid_config`) is forgotten before the error is thrown, so the next
 * start asks for a connection code instead of failing the same way.
 */
export async function openO1Connect(
  options: {
    store?: SecretStore;
    log?(line: string): void;
    /** The library's `open`; replaced in tests, which never reach a gateway. */
    open?: typeof open;
  } = {},
): Promise<O1ConnectSession> {
  const store = options.store ?? createO1ConnectStore();
  let connection: Awaited<ReturnType<typeof open>>;
  try {
    connection = await (options.open ?? open)({
      store,
      ...(options.log ? { log: options.log } : {}),
    });
  } catch (error) {
    if (
      isO1ConnectError(error) &&
      (error.code === 'device_refused' || error.code === 'invalid_config')
    ) {
      await forget({ store }).catch(() => undefined);
      throw new O1ConnectError(
        error.code,
        describeO1ConnectError(error).message,
      );
    }
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
    openRemote: (remoteOptions) => openRemote({ ...remoteOptions, connection }),
    close: () => connection.close(),
  };
}

/**
 * Deletes the saved configuration, and the device's private key with it:
 * this machine then needs a new connection code to come back.
 */
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

export interface O1ConnectErrorDescription {
  /** The text in English, with its values filled in. */
  message: string;
  /**
   * The same text with `{{name}}` in place of each value, and the values: what
   * an interface translates, since this package has no locale of its own.
   * Absent for an error that is not the library's, whose text is its own.
   */
  template?: string;
  params?: Record<string, string>;
  /**
   * The connection code can never work again (used, or lapsed): a kit file
   * that held it is dead and may be deleted.
   */
  codeIsDead?: boolean;
  /**
   * Nothing was saved and the code was not spent: the same code may be tried
   * again while it is inside its 30 minutes.
   */
  retrySameCode?: boolean;
  /** Set when the secret file cannot be decrypted here; the user may set it aside. */
  unreadableSecretFile?: string;
}

function say(
  template: string,
  params?: Record<string, string>,
): Pick<O1ConnectErrorDescription, 'message' | 'template' | 'params'> {
  return {
    message: template.replace(
      /\{\{(\w+)\}\}/g,
      (_match, name: string) => params?.[name] ?? '',
    ),
    template,
    ...(params ? { params } : {}),
  };
}

/**
 * What the user reads for each library error (contract §3.2). `stage` says
 * where it happened: a setup that could not reach the gateway spent nothing,
 * while an open that could not has a saved configuration to try again with.
 * `code` is the text the user gave, read only for its prefix.
 */
export function describeO1ConnectError(
  error: unknown,
  context: { stage?: 'setup' | 'open'; code?: string } = {},
): O1ConnectErrorDescription {
  if (
    isO1ConnectError(error) &&
    error.code === 'store_failed' &&
    isUnreadableSecretFileError(error.cause)
  ) {
    return {
      ...say(
        'The secret store cannot be read: {{reason}}. Setting up the connection code again offers to keep it as a .bak and start a new one.',
        { reason: error.cause.message },
      ),
      unreadableSecretFile: error.cause.filePath,
    };
  }
  if (!isO1ConnectError(error)) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
  switch (error.code) {
    case 'invalid_code':
      return say(
        context.code?.trim().startsWith(OLD_CODE_PREFIX)
          ? 'This connection code is from an older version (it starts with o1gw1.) and no longer works. Make a new one on the account page or in the console and paste it.'
          : 'That is not a connection code the gateway accepts: it does not start with o1gw2., it is damaged, or a newer code replaced it. Make a new one and paste it.',
      );
    case 'code_used':
      return {
        ...say(
          'This connection code was already used: a code works once. Make a new one and paste it. If you did not use it, someone else did: check the device on your account page and use Disconnect if the connected machine is not yours.',
        ),
        codeIsDead: true,
      };
    case 'code_expired':
      return {
        ...say(
          'This connection code expired: a code works for 30 minutes after it is made. Make a new one and paste it.',
        ),
        codeIsDead: true,
      };
    case 'device_refused':
      return say(
        'This device was disconnected or set up on another machine: the gateway no longer accepts its key. The connection saved here was removed. Paste a new connection code with /auth.',
      );
    case 'fingerprint_rejected':
      return say('Nothing was saved: the fingerprints were not confirmed.');
    case 'not_set_up':
      return say(
        'No o1-gateway connection is saved on this machine. Paste a connection code with /auth to set one up.',
      );
    case 'invalid_config':
      return say(
        'This o1-gateway setup is from an older version and cannot be used. The connection saved here was removed. Paste a new connection code with /auth.',
      );
    case 'store_failed':
      return error.cause instanceof Error
        ? say('The secret store refused the connection ({{reason}}).', {
            reason: error.cause.message,
          })
        : say(
            'The secret store refused the connection (locked or unavailable).',
          );
    case 'identity_mismatch':
      return say(
        "The proxy's key is not the one you pinned: this network may be intercepting the connection. Nothing was sent. Do not use a direct connection on this network.",
      );
    case 'tunnel_unavailable':
      return context.stage === 'setup'
        ? {
            ...say(
              'The tunnel to o1-gateway could not be opened (network, proxy, or a device that may not tunnel). Nothing was saved, and the code was not used: it still works inside its 30 minutes.',
            ),
            retrySameCode: true,
          }
        : say(
            'The tunnel to o1-gateway could not be opened (network, proxy, or a device that may not tunnel). Try again later; if it persists, paste a new connection code.',
          );
    case 'port_in_use':
    case 'port_unavailable':
      return say(
        'No loopback port could be opened for the tunnel: {{reason}}',
        { reason: error.message },
      );
    case 'remote_refused':
      return say('The gateway would not open the remote session: {{reason}}', {
        reason: error.message,
      });
    case 'remote_protocol':
      return say(
        'The address answered, but not as a remote session gateway. Check the connection and try again.',
      );
    case 'decision_closed':
      return say('The question was answered elsewhere before a viewer could.');
    default:
      return { message: error.message };
  }
}
