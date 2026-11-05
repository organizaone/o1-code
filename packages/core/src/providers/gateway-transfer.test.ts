/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import {
  assertGatewayTransferCompatible,
  getGatewayAccountSelection,
  hasPendingGatewayTools,
  isGatewayAccountSelectionInProgress,
  recordGatewayAccountSelection,
  registerGatewayTransferConfirmation,
  switchWithGatewayAccountSelection,
  prepareGatewayTransfer,
  takeGatewayTransfer,
} from './gateway-transfer.js';

describe('explicit gateway account selection', () => {
  function selectedAccount() {
    let sessionId = 'conversation-a';
    let selected: ContentGeneratorConfig = {
      model: 'o1gw/own/claude/7/sonnet',
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'disposable-device',
    };
    const config = {
      getSessionId: () => sessionId,
      getContentGeneratorConfig: () => selected,
    } as unknown as Config;
    return {
      config,
      changeSession: () => {
        sessionId = 'conversation-b';
      },
      changeConfig: (patch: Partial<ContentGeneratorConfig>) => {
        selected = { ...selected, ...patch };
      },
    };
  }

  it('retains an exact selection across explicit retries without staging native transfer', () => {
    const { config, changeConfig } = selectedAccount();
    recordGatewayAccountSelection(
      config,
      'o1gw/account/copilot/2/auto',
      'o1gw/own/claude/7/sonnet',
    );
    expect(getGatewayAccountSelection(config)).toMatchObject({
      sessionId: 'conversation-a',
      sourceModel: 'o1gw/account/copilot/2/auto',
      destinationModel: 'o1gw/own/claude/7/sonnet',
    });
    changeConfig({ reasoning: { effort: 'high' } });
    expect(getGatewayAccountSelection(config)).toBeDefined();
    changeConfig({ baseUrl: 'https://GATEWAY.example:443/v1/' });
    expect(getGatewayAccountSelection(config)).toBeDefined();
    expect(takeGatewayTransfer(config)).toBeUndefined();
  });

  it('never authorizes another session or Config instance', () => {
    const { config, changeSession } = selectedAccount();
    recordGatewayAccountSelection(config, 'source', 'o1gw/own/claude/7/sonnet');
    expect(
      getGatewayAccountSelection(selectedAccount().config),
    ).toBeUndefined();
    changeSession();
    expect(getGatewayAccountSelection(config)).toBeUndefined();
  });

  it.each([
    { model: 'o1gw/own/claude/8/sonnet' },
    { baseUrl: 'https://another-gateway.example/v1' },
    { apiKey: 'another-disposable-device' },
  ])(
    'does not reuse consent after destination identity changes: %j',
    (patch) => {
      const { config, changeConfig } = selectedAccount();
      recordGatewayAccountSelection(
        config,
        'source',
        'o1gw/own/claude/7/sonnet',
      );
      changeConfig(patch);
      expect(getGatewayAccountSelection(config)).toBeUndefined();
    },
  );

  it('records no grant when the switch did not select the intended destination', () => {
    const { config } = selectedAccount();
    expect(() =>
      recordGatewayAccountSelection(config, 'source', 'another-model'),
    ).toThrow();
    expect(getGatewayAccountSelection(config)).toBeUndefined();
  });

  it('keeps native transfers restricted independently of manual selection', () => {
    expect(() =>
      assertGatewayTransferCompatible(
        'o1gw/account/copilot/2/auto',
        'o1gw/own/claude/7/sonnet',
      ),
    ).toThrow('Native transfer requires');
    expect(() =>
      assertGatewayTransferCompatible(
        'o1gw/account/copilot/2/auto',
        'o1gw/account/copilot/3/auto',
      ),
    ).not.toThrow();
  });
});

describe('explicit selection transaction', () => {
  it.each([false, true])(
    'preserves the source until scoped consent: %s',
    async (confirmed) => {
      const source = 'o1gw/account/copilot/2/auto';
      const destination = 'o1gw/own/claude/7/sonnet';
      const selected = { model: source, baseUrl: 'https://gateway.example/v1' };
      const config = {
        getSessionId: () => 'conversation-a',
        getContentGeneratorConfig: () => selected,
        getLlmClient: () => ({
          getHistoryShallow: () => [
            { role: 'user', parts: [{ text: 'first request was refused' }] },
          ],
        }),
      } as unknown as Config;
      const switchModel = vi.fn(async () => {
        selected.model = destination;
      });
      const unregister = registerGatewayTransferConfirmation(
        config,
        async () => confirmed,
      );
      try {
        expect(
          await switchWithGatewayAccountSelection(
            config,
            { model: destination },
            switchModel,
          ),
        ).toBe(confirmed);
        expect(switchModel).toHaveBeenCalledTimes(confirmed ? 1 : 0);
        expect(selected.model).toBe(confirmed ? destination : source);
        if (confirmed)
          expect(getGatewayAccountSelection(config)).toMatchObject({
            sourceModel: source,
            destinationModel: destination,
          });
        else expect(getGatewayAccountSelection(config)).toBeUndefined();
      } finally {
        unregister();
      }
    },
  );

  it.each([false, true])(
    'reserves the current session while switching and releases after failure=%s',
    async (fails) => {
      const source = 'o1gw/account/copilot/2/auto';
      const destination = 'o1gw/own/claude/7/sonnet';
      const selected = { model: source, baseUrl: 'https://gateway.example/v1' };
      let sessionId = 'conversation-a';
      const config = {
        getSessionId: () => sessionId,
        getContentGeneratorConfig: () => selected,
        getLlmClient: () => ({ getHistoryShallow: () => [] }),
      } as unknown as Config;
      let releaseSwitch!: () => void;
      const switchReady = new Promise<void>((resolve) => {
        releaseSwitch = resolve;
      });
      const switchModel = vi.fn(async () => {
        await switchReady;
        if (fails) throw new Error('switch failed');
        selected.model = destination;
      });
      const selection = switchWithGatewayAccountSelection(
        config,
        { model: destination },
        switchModel,
      );
      expect(isGatewayAccountSelectionInProgress(config)).toBe(true);
      selected.model = 'partially-selected-direct-model';
      const duplicateSwitch = vi.fn(async () => {});
      await expect(
        switchWithGatewayAccountSelection(
          config,
          { model: 'another-direct-model' },
          duplicateSwitch,
        ),
      ).rejects.toThrow('Finish or cancel');
      expect(duplicateSwitch).not.toHaveBeenCalled();
      sessionId = 'conversation-b';
      expect(isGatewayAccountSelectionInProgress(config)).toBe(false);
      sessionId = 'conversation-a';
      expect(isGatewayAccountSelectionInProgress(config)).toBe(true);
      releaseSwitch();
      if (fails) await expect(selection).rejects.toThrow('switch failed');
      else await expect(selection).resolves.toBe(true);
      expect(isGatewayAccountSelectionInProgress(config)).toBe(false);
    },
  );

  it('preserves the server error from native transfer preparation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'permission_error',
            message: 'The selected account was revoked.',
          },
        }),
        { status: 403 },
      ),
    );
    await expect(
      prepareGatewayTransfer(
        fetcher,
        'https://gateway.example/v1/messages',
        {
          headers: { authorization: 'Bearer disposable' },
          body: JSON.stringify({
            model: 'o1gw/account/copilot/3/auto',
            messages: [],
          }),
        },
        'o1gw/account/copilot/2/auto',
      ),
    ).rejects.toMatchObject({
      status: 403,
      providerCode: 'permission_error',
      reason: 'authorization',
      message: 'The selected account was revoked.',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('renews current destination consent after a refused selection is resumed', async () => {
    const source = 'o1gw/account/copilot/2/auto';
    const destination = 'o1gw/own/claude/7/sonnet';
    const selected = {
      model: destination,
      baseUrl: 'https://gateway.example/v1',
    };
    const config = {
      getSessionId: () => 'conversation-a',
      getContentGeneratorConfig: () => selected,
      getLlmClient: () => ({
        getHistoryShallow: () => [
          { role: 'model', parts: [{ text: 'completed on source' }] },
        ],
      }),
      getResumedSessionData: () => ({
        conversation: {
          messages: [
            {
              subtype: 'gateway_conversation',
              sessionId: 'conversation-a',
              systemPayload: {
                actor: 'main',
                conversationId: 'conversation-a',
                endpoint: 'https://GATEWAY.example:443/v1/',
                model: source,
                phase: 'complete',
              },
            },
          ],
        },
      }),
    } as unknown as Config;
    const confirm = vi.fn(async () => true);
    await expect(
      switchWithGatewayAccountSelection(
        config,
        { model: destination },
        async () => {},
        { confirm },
      ),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ source, destination }),
    );
    expect(getGatewayAccountSelection(config)).toMatchObject({
      sourceModel: source,
      destinationModel: destination,
    });
  });
});

describe('pending gateway tools', () => {
  const calls: Content = {
    role: 'model',
    parts: [
      { functionCall: { id: 'one', name: 'read', args: {} } },
      { functionCall: { id: 'two', name: 'read', args: {} } },
    ],
  };
  it('requires each pending call to receive its own result', () => {
    const first: Content = {
      role: 'user',
      parts: [
        { text: 'result with text' },
        { functionResponse: { id: 'one', name: 'read', response: {} } },
      ],
    };
    expect(hasPendingGatewayTools([calls, first])).toBe(true);
    expect(hasPendingGatewayTools([calls, first, first])).toBe(true);
    expect(
      hasPendingGatewayTools([
        calls,
        first,
        {
          role: 'user',
          parts: [
            { functionResponse: { id: 'two', name: 'read', response: {} } },
          ],
        },
      ]),
    ).toBe(false);
  });

  it('matches legacy calls without IDs only by their names', () => {
    const call: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'read', args: {} } }],
    };
    expect(
      hasPendingGatewayTools([
        call,
        {
          role: 'user',
          parts: [{ functionResponse: { name: 'write', response: {} } }],
        },
      ]),
    ).toBe(true);
    expect(
      hasPendingGatewayTools([
        call,
        {
          role: 'user',
          parts: [{ functionResponse: { name: 'read', response: {} } }],
        },
      ]),
    ).toBe(false);
  });
});
