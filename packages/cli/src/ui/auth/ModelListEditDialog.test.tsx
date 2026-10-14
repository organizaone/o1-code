/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { act } from 'react';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import type { Config } from '@organizaone/o1-code-core';
import type { LoadedSettings } from '../../config/settings.js';
import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { ModelListEditDialog } from './ModelListEditDialog.js';

type UseKeypressMockOptions = { isActive: boolean };

const checkProviderKeyMock = vi.hoisted(() => vi.fn());
const applyProviderInstallPlanMock = vi.hoisted(() => vi.fn());
const organizaOneAccountCredentialMock = vi.hoisted(() => vi.fn());

vi.mock('@organizaone/o1-code-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@organizaone/o1-code-core')>()),
  checkProviderKey: checkProviderKeyMock,
}));
vi.mock(
  '@organizaone/o1-code-core/providers/install.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@organizaone/o1-code-core/providers/install.js')
    >()),
    applyProviderInstallPlan: applyProviderInstallPlanMock,
  }),
);
vi.mock('./organizaone-account.js', () => ({
  organizaOneAccountCredential: organizaOneAccountCredentialMock,
  isOrganizaOneAccountLogin: vi.fn(() => true),
}));
vi.mock('../../config/loadedSettingsAdapter.js', () => ({
  createLoadedSettingsAdapter: vi.fn(() => ({})),
}));
vi.mock('../hooks/useKeypress.js');

let activeKeypressHandlers: KeypressHandler[] = [];

const savedModel = (id: string) => ({
  id,
  name: `[OrganizaOne] ${id}`,
  baseUrl: 'https://api.organizaone.com',
  envKey: 'ORGANIZAONE_API_KEY',
});

const renderDialog = ({
  onClose = vi.fn<() => void>(),
  onSaved = vi.fn<() => void>(),
}: {
  onClose?: () => void;
  onSaved?: () => void;
} = {}) => {
  const mockSettings = {
    isTrusted: true,
    merged: {
      modelProviders: {
        anthropic: [savedModel('model-a'), savedModel('model-b')],
      },
      security: { auth: { selectedType: AuthType.USE_ANTHROPIC } },
      model: { name: 'model-b', baseUrl: 'https://api.organizaone.com' },
    },
    setValue: vi.fn(),
  } as unknown as LoadedSettings;

  const mockConfig = {
    getModel: vi.fn(() => 'model-b'),
    getContentGeneratorConfig: vi.fn(() => ({
      authType: AuthType.USE_ANTHROPIC,
      model: 'model-b',
      apiKey: 'device-token',
      baseUrl: 'https://api.organizaone.com',
    })),
    reloadModelProvidersConfig: vi.fn(),
    syncModelSelection: vi.fn(),
    refreshAuth: vi.fn().mockResolvedValue(undefined),
  } as unknown as Config;

  const result = render(
    <SettingsContext.Provider value={mockSettings}>
      <ConfigContext.Provider value={mockConfig}>
        <ModelListEditDialog
          onClose={() => onClose()}
          onSaved={() => onSaved()}
        />
      </ConfigContext.Provider>
    </SettingsContext.Provider>,
  );

  return { ...result, onClose, onSaved, mockConfig };
};

const pressKey = (name: string, sequence: string = name, ctrl = false) => {
  const event: Key = {
    name,
    sequence,
    ctrl,
    meta: false,
    shift: false,
    paste: false,
  };
  for (const handler of [...activeKeypressHandlers]) {
    handler(event);
  }
};

// Older renders leave their handlers behind. Focus hops are absolute per
// field, so every handler may see them; a toggle is relative to the focused
// row and must reach only the latest handler.
const pressLatestKey = (name: string, sequence: string = name) => {
  const handler = activeKeypressHandlers.at(-1);
  if (!handler) {
    throw new Error(`No active keypress handler for ${name}`);
  }
  handler({
    name,
    sequence,
    ctrl: false,
    meta: false,
    shift: false,
    paste: false,
  });
};

describe('ModelListEditDialog', () => {
  beforeEach(() => {
    activeKeypressHandlers = [];
    checkProviderKeyMock.mockReset();
    applyProviderInstallPlanMock.mockReset();
    applyProviderInstallPlanMock.mockResolvedValue({
      updatedModelProviders: {},
    });
    organizaOneAccountCredentialMock.mockReset();
    organizaOneAccountCredentialMock.mockReturnValue({
      apiKey: 'device-token',
      savedAt: '2026-10-13T00:00:00.000Z',
      expiresAt: '2026-11-13T00:00:00.000Z',
    });
    checkProviderKeyMock.mockResolvedValue({
      status: 'ok',
      models: [{ id: 'model-a' }, { id: 'model-b' }, { id: 'model-c' }],
    });
    vi.mocked(useKeypress).mockImplementation(
      (handler: KeypressHandler, options?: UseKeypressMockOptions) => {
        if (options?.isActive) {
          activeKeypressHandlers.push(handler);
        }
      },
    );
  });

  it('fetches the account models on open and marks the saved ones checked', async () => {
    const { lastFrame, unmount } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });

    expect(checkProviderKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'device-token',
        baseUrl: 'https://api.organizaone.com',
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Edit model list');
    const title = frame
      .split('\n')
      .find((line) => line.includes('Edit model list'));
    expect(title).toContain('key valid');
    expect(
      frame.split('\n').filter((line) => line.includes('key valid')),
    ).toHaveLength(1);
    const count = frame
      .split('\n')
      .find((line) => line.includes('Models from the provider'));
    expect(count).toContain('2 checked');
    expect(frame).toContain('model-id');
    expect(frame).toContain('─');
    expect(
      frame
        .split('\n')
        .some((line) => line.includes('search') && line.includes('│')),
    ).toBe(true);
    expect(frame).toMatch(/●︎\s+model-a/);
    expect(frame).toMatch(/●︎\s+model-b/);
    expect(frame).toMatch(/○︎\s+model-c/);
    expect(frame).toContain('ctrl+r fetches the models again');
    unmount();
  });

  it('blocks the submit that drops the current model', async () => {
    const { lastFrame, unmount } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      pressKey('down');
    });
    await act(async () => {
      pressKey('down');
    });
    await act(async () => {
      pressKey('down');
    });
    await act(async () => {
      pressLatestKey('space', ' ');
    });
    // The submit must come from the handler holding the post-toggle state.
    await act(async () => {
      pressLatestKey('return', '\r');
    });

    const frame = lastFrame() ?? '';
    expect(frame).toContain('model-b');
    expect(frame).toContain('current model');
    expect(applyProviderInstallPlanMock).not.toHaveBeenCalled();
    unmount();
  });

  it('saves the edited list and reports it', async () => {
    const { onSaved, unmount } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      pressKey('return', '\r');
    });

    expect(applyProviderInstallPlanMock).toHaveBeenCalledTimes(1);
    const [plan] = applyProviderInstallPlanMock.mock.calls[0]!;
    expect(
      plan.modelProviders.flatMap((patch: { models: Array<{ id: string }> }) =>
        patch.models.map((model) => model.id),
      ),
    ).toEqual(['model-a', 'model-b']);
    expect(onSaved).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('goes back to the picker on esc', async () => {
    const { onClose, unmount } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      pressKey('escape');
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
});
