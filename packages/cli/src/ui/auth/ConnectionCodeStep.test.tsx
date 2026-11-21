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
const checkStoreMock = vi.hoisted(() => vi.fn());

vi.mock(
  '@organizaone/o1-code-core/providers/o1-connect/session.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/o1-connect/session.js')
    >()),
    checkO1ConnectStore: checkStoreMock,
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
const info = { device: 'my-laptop', url: 'https://api.organizaone.com' };
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
      baseUrl: 'https://api.organizaone.com',
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
    checkStoreMock.mockReset();
    checkStoreMock.mockResolvedValue(undefined);
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
    expect(lastFrame()).toContain('works once');
    expect(lastFrame()).toContain('30 minutes');
    expect(lastFrame()).toContain('never leaves it');

    act(() => {
      type('o1gw2.abc');
      press('return', '\r');
    });
    await settle();
    expect(checkStoreMock).toHaveBeenCalledTimes(1);
    expect(setupMock).toHaveBeenCalledWith('o1gw2.abc', expect.anything());
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
      type('o1gw2.abc');
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
    writeFileSync(kit, 'o1gw2.fromkit\n');
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
    expect(setupMock).toHaveBeenCalledWith('o1gw2.fromkit', expect.anything());
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
    // Found before the code is used: a code works once, so the store is
    // read first and set aside while the code is still good.
    const failTheStoreCheckOnce = () =>
      checkStoreMock.mockRejectedValueOnce(
        new O1ConnectError('store_failed', 'store', {
          cause: new UnreadableSecretFileError(filePath),
        }),
      );

    async function reachUnreadable(flow: ProviderSetupFlow) {
      const rendered = renderWithProviders(
        <ConnectionCodeStep config={organizaoneO1gwProvider} flow={flow} />,
      );
      await settle();
      act(() => {
        type('o1gw2.abc');
        press('return', '\r');
      });
      await settle();
      return rendered;
    }

    it('names the file before the code is used and, on replace, sets it aside and goes on with the same code', async () => {
      failTheStoreCheckOnce();
      const flow = makeFlow();
      const { lastFrame, unmount } = await reachUnreadable(flow);
      expect(lastFrame()).toContain('secrets.json');
      expect(lastFrame()).toContain('Type replace');
      expect(setAsideMock).not.toHaveBeenCalled();
      expect(setupMock).not.toHaveBeenCalled();

      act(() => {
        type('replace');
        press('return', '\r');
      });
      await settle();
      await settle();
      expect(setAsideMock).toHaveBeenCalledWith(filePath);
      expect(setupMock).toHaveBeenCalledTimes(1);
      expect(setupMock).toHaveBeenCalledWith('o1gw2.abc', expect.anything());
      expect(lastFrame()).toContain('Type yes');

      act(() => {
        type('yes');
        press('return', '\r');
      });
      await settle();
      await settle();
      expect(flow.submitConnection).toHaveBeenCalled();
      unmount();
    });

    it('moves nothing unless the answer is replace', async () => {
      failTheStoreCheckOnce();
      const flow = makeFlow();
      const { lastFrame, unmount } = await reachUnreadable(flow);
      act(() => {
        type('no');
        press('return', '\r');
      });
      await settle();
      expect(lastFrame()).toContain('Nothing was moved');
      expect(setAsideMock).not.toHaveBeenCalled();
      expect(setupMock).not.toHaveBeenCalled();
      unmount();
    });
  });

  /** Confirms the fingerprints, then fails the enrolment with `code`. */
  const failEnrolmentOnce = (code: string) =>
    setupMock.mockImplementationOnce(
      async (
        _code: string,
        options: { onFingerprint: (fps: string[], i: typeof info) => unknown },
      ) => {
        await options.onFingerprint(fingerprints, info);
        throw new O1ConnectError(code as never, `lib: ${code}`);
      },
    );

  async function submitAndConfirm(text: string, flow = makeFlow()) {
    const rendered = renderWithProviders(
      <ConnectionCodeStep config={organizaoneO1gwProvider} flow={flow} />,
    );
    await settle();
    act(() => {
      type(text);
      press('return', '\r');
    });
    await settle();
    act(() => {
      type('yes');
      press('return', '\r');
    });
    await settle();
    await settle();
    return { ...rendered, flow };
  }

  it('shows that it is enrolling while the setup is on the network', async () => {
    let finish: () => void = () => undefined;
    setupMock.mockImplementationOnce(
      async (
        _code: string,
        options: { onFingerprint: (fps: string[], i: typeof info) => unknown },
      ) => {
        await options.onFingerprint(fingerprints, info);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return { ...info, fingerprints };
      },
    );
    const { lastFrame, flow, unmount } = await submitAndConfirm('o1gw2.abc');
    expect(lastFrame()).toContain('enrolling it through the tunnel');
    expect(openMock).not.toHaveBeenCalled();

    await act(async () => finish());
    await settle();
    expect(flow.submitConnection).toHaveBeenCalled();
    unmount();
  });

  it('says a used code works once and what to do if someone else used it', async () => {
    const kit = path.join(tempDir, 'o1-connect.code');
    writeFileSync(kit, 'o1gw2.fromkit\n');
    failEnrolmentOnce('code_used');
    const { lastFrame, flow, unmount } = await submitAndConfirm(kit);
    const frame = lastFrame()!.replace(/\s+/g, ' ');
    expect(frame).toContain('already used');
    expect(frame).toContain('someone else did');
    expect(frame).toContain('Disconnect');
    expect(frame).toContain('enter paste another code');
    // The kit's code is dead: its file goes.
    expect(existsSync(kit)).toBe(false);
    expect(openMock).not.toHaveBeenCalled();
    expect(flow.submitConnection).not.toHaveBeenCalled();

    act(() => {
      press('return', '\r');
    });
    await settle();
    expect(lastFrame()).toContain('connection code');
    expect(setupMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('says a lapsed code expired and deletes the kit file that held it', async () => {
    const kit = path.join(tempDir, 'o1-connect.code');
    writeFileSync(kit, 'o1gw2.fromkit\n');
    failEnrolmentOnce('code_expired');
    const { lastFrame, unmount } = await submitAndConfirm(kit);
    const frame = lastFrame()!.replace(/\s+/g, ' ');
    expect(frame).toContain('expired');
    expect(frame).toContain('30 minutes');
    expect(existsSync(kit)).toBe(false);
    unmount();
  });

  it('says a code from before one-use codes is from an older version', async () => {
    setupMock.mockRejectedValueOnce(new O1ConnectError('invalid_code', 'old'));
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
    expect(setupMock).toHaveBeenCalledWith('o1gw1.abc', expect.anything());
    expect(lastFrame()!.replace(/\s+/g, ' ')).toContain('older version');
    unmount();
  });

  it('keeps the kit file and offers the same code again when the tunnel could not be opened', async () => {
    const kit = path.join(tempDir, 'o1-connect.code');
    writeFileSync(kit, 'o1gw2.fromkit\n');
    failEnrolmentOnce('tunnel_unavailable');
    const { lastFrame, flow, unmount } = await submitAndConfirm(kit);
    const frame = lastFrame()!.replace(/\s+/g, ' ');
    expect(frame).toContain('Nothing was saved');
    expect(frame).toContain('enter try again');
    expect(existsSync(kit)).toBe(true);

    act(() => {
      press('return', '\r');
    });
    await settle();
    await settle();
    await settle();
    expect(setupMock).toHaveBeenCalledTimes(2);
    expect(setupMock).toHaveBeenLastCalledWith(
      'o1gw2.fromkit',
      expect.anything(),
    );
    expect(flow.submitConnection).toHaveBeenCalled();
    expect(existsSync(kit)).toBe(false);
    unmount();
  });

  it('warns of a possible interception and offers no way around it', async () => {
    failEnrolmentOnce('identity_mismatch');
    const { lastFrame, unmount } = await submitAndConfirm('o1gw2.abc');
    const frame = lastFrame()!.replace(/\s+/g, ' ');
    expect(frame).toContain('intercepting');
    expect(frame).toContain('Do not use a direct connection');
    expect(openMock).not.toHaveBeenCalled();
    unmount();
  });

  it('tries only the tunnel again when it fails after the code was used', async () => {
    openMock.mockRejectedValueOnce(
      new O1ConnectError('tunnel_unavailable', 'down'),
    );
    const { lastFrame, flow, unmount } = await submitAndConfirm('o1gw2.abc');
    expect(lastFrame()).toContain('enter try again');
    act(() => {
      press('return', '\r');
    });
    await settle();
    await settle();
    expect(setupMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledTimes(2);
    expect(flow.submitConnection).toHaveBeenCalled();
    unmount();
  });

  it('sends a device the gateway refuses back to a new code, without opening again', async () => {
    openMock.mockRejectedValueOnce(
      new O1ConnectError('device_refused', 'refused'),
    );
    const { lastFrame, flow, unmount } = await submitAndConfirm('o1gw2.abc');
    const frame = lastFrame()!.replace(/\s+/g, ' ');
    expect(frame).toContain('disconnected or set up on another machine');
    expect(frame).toContain('enter paste another code');
    act(() => {
      press('return', '\r');
    });
    await settle();
    expect(lastFrame()).toContain('connection code');
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(flow.submitConnection).not.toHaveBeenCalled();
    unmount();
  });

  it('explains a library error and asks for another code', async () => {
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
    expect(lastFrame()).toContain('enter paste another code');
    act(() => {
      press('return', '\r');
    });
    await settle();
    expect(lastFrame()).toContain('connection code');
    unmount();
  });
});
