/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { RemoteController } from '../../remote/remote-controller.js';
import {
  describeRemoteOutcome,
  describeRemoteSnapshot,
  rcCommand,
} from './rc-command.js';

function controller(active: boolean) {
  const remote = {
    status: vi.fn(() => ({
      active,
      name: 'laptop-a1b2',
      snapshot: active ? { state: 'online', viewers: 1 } : null,
      ...(active ? { url: 'https://account.example/#/me/remote/rm_1' } : {}),
    })),
    stop: vi.fn().mockResolvedValue(undefined),
    rename: vi
      .fn()
      .mockResolvedValue({ status: 'started', url: 'u', remoteId: 'r' }),
  };
  return remote as unknown as RemoteController & typeof remote;
}

function context(remote: RemoteController | null) {
  return createMockCommandContext({
    services: { remote } as never,
  });
}

describe('/rc', () => {
  it('opens the remote dialog with no arguments', async () => {
    const result = await rcCommand.action!(context(controller(false)), '');
    expect(result).toEqual({ type: 'dialog', dialog: 'remote' });
  });

  it('explains itself when remote sessions are not available', async () => {
    const result = await rcCommand.action!(context(null), '');
    expect(result).toMatchObject({ type: 'message', messageType: 'error' });
  });

  it('turns remote mode off, and says so when it was not on', async () => {
    const on = controller(true);
    await expect(rcCommand.action!(context(on), 'off')).resolves.toMatchObject({
      messageType: 'info',
      content: expect.stringContaining('off'),
    });
    expect(on.stop).toHaveBeenCalled();

    const off = controller(false);
    await expect(rcCommand.action!(context(off), 'off')).resolves.toMatchObject(
      { content: 'Remote mode is not on.' },
    );
  });

  it('reports the status with the viewer count and the URL', async () => {
    const result = await rcCommand.action!(context(controller(true)), 'status');
    expect(result).toMatchObject({ messageType: 'info' });
    const content = (result as { content: string }).content;
    expect(content).toContain('remote: active · 1 viewer');
    expect(content).toContain('laptop-a1b2');
    expect(content).toContain('https://account.example/#/me/remote/rm_1');
  });

  it('renames the session, and asks for a name when none is given', async () => {
    const remote = controller(true);
    await expect(
      rcCommand.action!(context(remote), 'name desk side'),
    ).resolves.toMatchObject({
      messageType: 'info',
      content: 'Remote session renamed to desk side.',
    });
    expect(remote.rename).toHaveBeenCalledWith('desk side');
    await expect(
      rcCommand.action!(context(remote), 'name'),
    ).resolves.toMatchObject({
      messageType: 'error',
      content: 'Usage: /rc name <name>',
    });
  });

  it('rejects an unknown verb with the usage', async () => {
    await expect(
      rcCommand.action!(context(controller(false)), 'dance'),
    ).resolves.toMatchObject({ messageType: 'error' });
  });
});

describe('describeRemoteOutcome', () => {
  it('names the live sessions when the plan’s ceiling is reached', () => {
    expect(
      describeRemoteOutcome({
        status: 'refused',
        code: 'limit',
        sessions: ['desk-a1', 'desk-b2'],
        message: 'limit',
      }),
    ).toContain('desk-a1, desk-b2');
  });

  it('points to the account page for a plan without remote sessions', () => {
    expect(describeRemoteOutcome({ status: 'plan' })).toContain(
      'account.organizaone.com',
    );
  });
});

describe('describeRemoteSnapshot', () => {
  it('reads as the footer line', () => {
    expect(describeRemoteSnapshot({ state: 'online', viewers: 0 })).toBe(
      'remote: active · 0 viewers',
    );
    expect(describeRemoteSnapshot({ state: 'reconnecting', viewers: 1 })).toBe(
      'remote: reconnecting',
    );
    expect(
      describeRemoteSnapshot({ state: 'ended', viewers: 0, reason: 'revoked' }),
    ).toBe('remote: ended: revoked');
  });
});
