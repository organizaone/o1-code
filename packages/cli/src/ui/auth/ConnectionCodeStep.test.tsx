/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { AuthType, organizaoneO1gwProvider } from '@organizaone/o1-code-core';
import { renderWithProviders } from '../../test-utils/render.js';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { O1ConnectError } from '@organizaone/o1-code-core/providers/o1-connect/session.js';
import { UnreadableSecretFileError } from '@organizaone/o1-code-core/mcp/token-storage/file-token-storage.js';
import { ConnectionCodeStep } from './ConnectionCodeStep.js';
import type { ProviderSetupFlow } from './useProviderSetupFlow.js';

const setupMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());
const forgetMock = vi.hoisted(() => vi.fn());
const setAsideMock = vi.hoisted(() => vi.fn());
const checkMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@organizaone/o1-code-core/providers/o1-connect/session.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/o1-connect/session.js')
    >()),
    setupO1Connect: setupMock,
    openO1Connect: openMock,
    forgetO1Connect: forgetMock,
    setAsideUnreadableSecretStore: setAsideMock,
  }),
);
vi.mock(
  '@organizaone/o1-code-core/providers/model-discovery.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/model-discovery.js')
    >()),
    checkProviderKey: checkMock,
  }),
);
vi.mock('../hooks/useKeypress.js');

let handlers: KeypressHandler[] = [];
const key = (name: string, sequence = name): Key =>
  ({
    name,
    sequence,
    ctrl: false,
    meta: false,
    shift: false,
    paste: false,
  }) as Key;
const type = (text: string) => {
  const handler = handlers.at(-1);
  if (!handler) throw new Error('no keypress handler');
  for (const char of text) handler(key(char, char));
};
const press = (name: string, sequence = name) => {
  const handler = handlers.at(-1);
  if (!handler) throw new Error('no keypress handler');
  handler(key(name, sequence));
};

const fingerprints = ['3F9A-12C7-0000-1111', 'AB12-CD34-5678-90EF'];
const info = { device: 'my-laptop', url: 'https://api.organizago.com' };
const session = {
  baseUrl: 'http://127.0.0.1:4242',
  openaiBaseUrl: 'http://127.0.0.1:4242/v1',
  apiKey: 'session-key',
  device: 'my-laptop',
  close: vi.fn().mockResolvedValue(undefined),
};

function makeFlow(): ProviderSetupFlow {
  return {
    state: {
      provider: organizaoneO1gwProvider,
      step: 'connectionCode',
      protocol: AuthType.USE_ANTHROPIC,
      baseUrl: 'https://api.organizago.com',
    },
    submitConnection: vi.fn(),
    goBack: vi.fn(),
  } as unknown as ProviderSetupFlow;
}

const settle = () => act(async () => {});

describe('ConnectionCodeStep', () => {
  let tempDir: string;

  beforeEach(() => {
    handlers = [];
    setupMock.mockReset();
    openMock.mockReset();
    forgetMock.mockReset();
    setAsideMock.mockReset();
    setAsideMock.mockResolvedValue('/home/u/.o1-code/secrets.json.bak');
    checkMock.mockReset();
    session.close.mockClear();
    vi.mocked(useKeypress).mockImplementation((handler, options) => {
      if (options?.isActive) handlers.push(handler);
    });
    setupMock.mockImplementation(
      async (
        _code: string,
        options: {
          onFingerprint: (
            fps: string[],
            i: typeof info,
          ) => boolean | Promise<boolean>;
        },
      ) => {
        const confirmed = await options.onFingerprint(fingerprints, info);
        if (!confirmed) {
          throw new O1ConnectError('fingerprint_rejected', 'rejected');
        }
        return { ...info, fingerprints };
      },
    );
    openMock.mockResolvedValue(session);
    checkMock.mockResolvedValue({
      status: 'ok',
      models: [{ id: 'claude-sonnet-4-5' }],
    });
    tempDir = mkdtempSync(path.join(tmpdir(), 'o1-connect-step-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows every fingerprint, saves on yes, lists the models through the tunnel and moves on', async () => {
    const flow = makeFlow();
    const { lastFrame, unmount } = renderWithProviders(
      <ConnectionCodeStep config={organizaoneO1gwProvider} flow={flow} />,
    );
    await settle();
    expect(lastFrame()).toContain('connection code');

    act(() => {
      type('o1gw1.abc');
      press('return', '\r');
    });
    await settle();
    expect(setupMock).toHaveBeenCalledWith('o1gw1.abc', expect.anything());
    expect(lastFrame()).toContain('my-laptop');
    expect(lastFrame()).toContain('3F9A-12C7-0000-1111');
    expect(lastFrame()).toContain('AB12-CD34-5678-90EF');
    expect(lastFrame()).toContain('Type yes');

    act(() => {
      type('yes');
      press('return', '\r');
    });
    await settle();
    await settle();

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'anthropic',
        baseUrl: 'http://127.0.0.1:4242',
        apiKey: 'session-key',
      }),
    );
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(flow.submitConnection).toHaveBeenCalledWith({
      status: 'ok',
      models: [{ id: 'claude-sonnet-4-5' }],
    });
    unmount();
  });

  it('saves nothing when the fingerprints are not confirmed', async () => {
    const flow = makeFlow();
    const { lastFrame, unmount } = renderWithProviders(
      <ConnectionCodeStep config={organizaoneO1gwProvider} flow={flow} />,
    );
    await settle();
    act(() => {
      type('o1gw1.abc');
      press('return', '\r');
    });
    await settle();
    act(() => {
      type('no');
      press('return', '\r');
    });
    await settle();
    expect(lastFrame()).toContain('Nothing was saved');
    expect(openMock).not.toHaveBeenCalled();
    expect(flow.submitConnection).not.toHaveBeenCalled();
    unmount();
  });

  it('reads a kit’s o1-connect.code from its path and deletes the file once saved', async () => {
    const kit = path.join(tempDir, 'o1-connect.code');
    writeFileSync(kit, 'o1gw1.fromkit\n');
    const flow = makeFlow();
    const { unmount } = renderWithProviders(
      <ConnectionCodeStep config={organizaoneO1gwProvider} flow={flow} />,
    );
    await settle();
    act(() => {
      type(kit);
      press('return', '\r');
    });
    await settle();
    expect(setupMock).toHaveBeenCalledWith('o1gw1.fromkit', expect.anything());
    act(() => {
      type('yes');
      press('return', '\r');
    });
    await settle();
    await settle();
    expect(existsSync(kit)).toBe(false);
    expect(flow.submitConnection).toHaveBeenCalled();
    unmount();
  });

  describe('when the secret store cannot be decrypted on this machine', () => {
    const filePath = '/home/u/.o1-code/secrets.json';
    const failOnceAfterConfirm = () =>
      setupMock.mockImplementationOnce(
        async (
          _code: string,
          options: {
            onFingerprint: (fps: string[], i: typeof info) => unknown;
          },
        ) => {
          await options.onFingerprint(fingerprints, info);
          throw new O1ConnectError('store_failed', 'store', {
            cause: new UnreadableSecretFileError(filePath),
          });
        },
      );

    async function reachUnreadable(flow: ProviderSetupFlow) {
      const rendered = renderWithProviders(
        <ConnectionCodeStep config={organizaoneO1gwProvider} flow={flow} />,
      );
      await settle();
      act(() => {
        type('o1gw1.abc');
        press('return', '\r');
      });
      await settle();
      act(() => {
        type('yes');
        press('return', '\r');
      });
      await settle();
      return rendered;
    }

    it('names the file and, on replace, sets it aside and saves without asking for the fingerprints again', async () => {
      failOnceAfterConfirm();
      const flow = makeFlow();
      const { lastFrame, unmount } = await reachUnreadable(flow);
      expect(lastFrame()).toContain('secrets.json');
      expect(lastFrame()).toContain('Type replace');
      expect(setAsideMock).not.toHaveBeenCalled();

      act(() => {
        type('replace');
        press('return', '\r');
      });
      await settle();
      await settle();
      await settle();

      expect(setAsideMock).toHaveBeenCalledWith(filePath);
      expect(setupMock).toHaveBeenCalledTimes(2);
      expect(lastFrame()).not.toContain('Type yes');
      expect(flow.submitConnection).toHaveBeenCalled();
      unmount();
    });

    it('moves nothing unless the answer is replace', async () => {
      failOnceAfterConfirm();
      const flow = makeFlow();
      const { lastFrame, unmount } = await reachUnreadable(flow);
      act(() => {
        type('no');
        press('return', '\r');
      });
      await settle();
      expect(lastFrame()).toContain('Nothing was moved');
      expect(setAsideMock).not.toHaveBeenCalled();
      expect(setupMock).toHaveBeenCalledTimes(1);
      unmount();
    });
  });

  it('explains a library error and lets the user paste the code again', async () => {
    setupMock.mockRejectedValueOnce(new O1ConnectError('invalid_code', 'bad'));
    const flow = makeFlow();
    const { lastFrame, unmount } = renderWithProviders(
      <ConnectionCodeStep config={organizaoneO1gwProvider} flow={flow} />,
    );
    await settle();
    act(() => {
      type('nonsense');
      press('return', '\r');
    });
    await settle();
    expect(lastFrame()).toContain('enter try again');
    act(() => {
      press('return', '\r');
    });
    await settle();
    expect(lastFrame()).toContain('connection code');
    unmount();
  });
});
