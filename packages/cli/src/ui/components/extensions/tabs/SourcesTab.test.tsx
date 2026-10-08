/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment jsdom

import { act, type ReactElement } from 'react';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import stringWidth from 'string-width';
import type { Config } from '@organizaone/o1-code-core';
import type { Extension } from '@organizaone/o1-code-core/extension/extensionManager.js';
import type { ExtensionSource } from '@organizaone/o1-code-core/extension/sourceRegistry.js';
import type { ClaudeMarketplaceConfig } from '@organizaone/o1-code-core/extension/claude-converter.js';
import type { Key } from '../../../hooks/useKeypress.js';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';
import { SourcesTab } from './SourcesTab.js';
import type { RadioButtonSelectProps } from '../../shared/RadioButtonSelect.js';
import { setLanguageAsync, t } from '../../../../i18n/index.js';

const mockUseKeypress = vi.hoisted(() => vi.fn());
const mockTextInput = vi.hoisted(() =>
  vi.fn<typeof import('../../shared/TextInput.js').TextInput>(() => null),
);
const mockRadioButtonSelect = vi.hoisted(() =>
  vi.fn((_props: unknown): ReactElement | null => null),
);
const terminal = vi.hoisted(() => ({ columns: 120, rows: 40 }));
const mockParseInstallSource = vi.hoisted(() =>
  vi.fn(async (source: string) => ({ type: 'git' as const, source })),
);

vi.mock('../../../hooks/useKeypress.js', () => ({
  useKeypress: mockUseKeypress,
}));

vi.mock('../../shared/TextInput.js', () => ({ TextInput: mockTextInput }));

vi.mock('../../shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: mockRadioButtonSelect,
}));

vi.mock('../../../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => terminal,
}));

vi.mock('../../../hooks/usePreferredEditor.js', () => ({
  usePreferredEditor: () => undefined,
}));

vi.mock('@organizaone/o1-code-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@organizaone/o1-code-core')>();
  return { ...actual, parseInstallSource: mockParseInstallSource };
});

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
  inputWidth?: number;
  height?: number;
  showScrollIndicator?: boolean;
  allowExternalEditor?: boolean;
  isActive?: boolean;
  mask?: (text: string) => string;
}

interface SourceActionProps {
  items: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}

function sourceInput(): TextInputProps {
  return mockTextInput.mock.calls.at(-1)?.[0] as TextInputProps;
}

function sourceActions(): SourceActionProps {
  return mockRadioButtonSelect.mock.calls.at(-1)?.[0] as SourceActionProps;
}

async function press(key: Partial<Key>): Promise<void> {
  await act(async () => activeKeypress()(key as Key));
}

async function selectAction(value: string): Promise<void> {
  await act(async () => sourceActions().onSelect(value));
}

function renderSourceTab(
  source = 'owner/store',
  terminalWidth = 96,
  availableTerminalHeight?: number,
  installedExtensions: Extension[] = [],
) {
  let sources: ExtensionSource[] = [
    {
      name: 'demo-store',
      source,
      type: 'git',
      addedAt: '2026-10-01T12:00:00Z',
    },
    { name: 'other-store', source: 'other/store', type: 'git' },
  ];
  const manager = {
    refreshCache: vi.fn().mockResolvedValue(undefined),
    getLoadedExtensions: vi.fn(() => installedExtensions),
    getSources: vi.fn(() => sources),
    loadSource: vi.fn<
      (source: string) => Promise<ClaudeMarketplaceConfig | null>
    >(async () => ({ name: 'demo-store', plugins: [] })),
    updateSource: vi.fn(async (name: string, replacement: string) => {
      const updated: ExtensionSource = {
        ...sources[0],
        name: 'updated-store',
        source: replacement,
        type: 'http',
      };
      sources = sources.map((entry) => (entry.name === name ? updated : entry));
      return updated;
    }),
    removeSource: vi.fn(() => true),
    markSourceUpdated: vi.fn(),
  };
  const statuses: Array<StatusMessage | null> = [];
  const onChanged = vi.fn();
  const onBrowse = vi.fn();
  const onLockChange = vi.fn();
  const onFooter = vi.fn();
  const rendered = render(
    <SourcesTab
      config={{ getExtensionManager: () => manager } as unknown as Config}
      isActive
      onLockChange={onLockChange}
      onStatus={(status) => statuses.push(status)}
      onChanged={onChanged}
      onBrowse={onBrowse}
      onFooter={onFooter}
      reloadSignal={0}
      terminalWidth={terminalWidth}
      availableTerminalHeight={availableTerminalHeight}
    />,
  );
  return {
    ...rendered,
    manager,
    statuses,
    onChanged,
    onBrowse,
    onLockChange,
    onFooter,
  };
}

async function openFirstSource(): Promise<void> {
  await press({ name: 'down' });
  await press({ name: 'down' });
  await press({ name: 'return' });
  await waitFor(() =>
    expect(sourceActions().items.some((item) => item.value === 'edit')).toBe(
      true,
    ),
  );
}

function activeKeypress(): (key: Key) => void {
  const call = mockUseKeypress.mock.calls.findLast(
    (args) => (args[1] as { isActive: boolean }).isActive,
  );
  return call?.[0] as (key: Key) => void;
}

function committedWarning(): Error {
  return Object.assign(new Error('committed with warnings'), {
    code: 'extension_committed_with_warnings',
    committed: true,
    identity: { id: 'demo-id', name: 'demo' },
    warnings: [
      { code: 'extension_runtime_refresh_failed', error: 'refresh failed' },
    ],
  });
}

describe('SourcesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTextInput.mockImplementation(() => null);
    mockRadioButtonSelect.mockImplementation(() => null);
    terminal.columns = 120;
    terminal.rows = 40;
  });

  it('reports a committed install warning without treating it as failure', async () => {
    const manager = {
      refreshCache: vi.fn().mockResolvedValue(undefined),
      getLoadedExtensions: vi.fn(() => []),
      getSources: vi.fn(() => []),
      installExtension: vi.fn().mockRejectedValue(committedWarning()),
    };
    const config = {
      getExtensionManager: () => manager,
    } as unknown as Config;
    const statuses: Array<StatusMessage | null> = [];
    const onChanged = vi.fn();

    render(
      <SourcesTab
        config={config}
        isActive
        onLockChange={vi.fn()}
        onStatus={(status) => statuses.push(status)}
        onChanged={onChanged}
        onBrowse={vi.fn()}
        onFooter={vi.fn()}
        reloadSignal={0}
      />,
    );
    await waitFor(() => expect(manager.refreshCache).toHaveBeenCalled());

    await act(async () => {
      activeKeypress()({ name: 'return' } as Key);
    });
    let input = mockTextInput.mock.calls.at(-1)?.[0] as
      | TextInputProps
      | undefined;
    await act(async () => {
      input?.onChange('owner/demo');
    });
    input = mockTextInput.mock.calls.at(-1)?.[0] as TextInputProps | undefined;
    await act(async () => {
      input?.onSubmit();
    });

    await waitFor(() =>
      expect(statuses).toContainEqual({
        type: 'warning',
        text: 'committed with warnings',
      }),
    );
    expect(manager.installExtension).toHaveBeenCalledWith({
      type: 'git',
      source: 'owner/demo',
    });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(manager.refreshCache).toHaveBeenCalledTimes(2);
  });

  it('cancels source editing without changing the registry or detail selection', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    expect(sourceInput().value).toBe('owner/store');
    expect(harness.onFooter).toHaveBeenLastCalledWith(
      'Enter save source · Esc cancel',
    );
    await act(async () => sourceInput().onChange('replacement/store'));
    await press({ name: 'escape' });
    expect(harness.manager.updateSource).not.toHaveBeenCalled();
    expect(harness.manager.getSources()[0].source).toBe('owner/store');
    expect(harness.lastFrame()).toContain('demo-store');
    expect(harness.lastFrame()).not.toContain('Edit marketplace source');
    expect(harness.onChanged).not.toHaveBeenCalled();
    expect(harness.onLockChange).toHaveBeenLastCalledWith(true);
    harness.unmount();
  });

  it('keeps the replacement and every registered source when validation fails', async () => {
    const harness = renderSourceTab();
    const before = structuredClone(harness.manager.getSources());
    harness.manager.updateSource.mockRejectedValue(
      new Error('Invalid marketplace source.'),
    );
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    await act(async () => sourceInput().onChange('invalid/store'));
    await act(async () => sourceInput().onSubmit());
    await waitFor(() =>
      expect(harness.statuses).toContainEqual({
        type: 'error',
        text: 'Invalid marketplace source.',
      }),
    );
    expect(sourceInput().value).toBe('invalid/store');
    expect(sourceInput().isActive).toBe(true);
    expect(harness.lastFrame()).toContain('Edit marketplace source');
    expect(harness.manager.getSources()).toEqual(before);
    expect(harness.onChanged).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('saves once, reloads discovery and returns to the updated source detail and list cursor', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    await act(async () =>
      sourceInput().onChange('https://store.example/marketplace.json'),
    );
    const submit = sourceInput().onSubmit;
    await act(async () => {
      submit();
      submit();
    });
    await waitFor(() =>
      expect(harness.statuses).toContainEqual({
        type: 'success',
        text: 'Marketplace source saved.',
      }),
    );
    expect(harness.manager.updateSource).toHaveBeenCalledExactlyOnceWith(
      'demo-store',
      'https://store.example/marketplace.json',
    );
    expect(harness.manager.loadSource).toHaveBeenLastCalledWith(
      'https://store.example/marketplace.json',
    );
    expect(harness.manager.refreshCache).toHaveBeenCalledTimes(2);
    expect(harness.onChanged).toHaveBeenCalledOnce();
    expect(harness.lastFrame()).toContain('updated-store');
    expect(harness.manager.getSources()[1]).toEqual({
      name: 'other-store',
      source: 'other/store',
      type: 'git',
    });
    expect(harness.manager.getSources()[0].addedAt).toBe(
      '2026-10-01T12:00:00Z',
    );
    expect(harness.manager.removeSource).not.toHaveBeenCalled();
    await press({ name: 'escape' });
    await press({ name: 'return' });
    await waitFor(() =>
      expect(harness.manager.loadSource).toHaveBeenCalledTimes(3),
    );
    expect(harness.manager.loadSource).toHaveBeenLastCalledWith(
      'https://store.example/marketplace.json',
    );
    harness.unmount();
  });

  it('shows saving progress and blocks cancellation and duplicate submits while the save is pending', async () => {
    const harness = renderSourceTab();
    let resolveSave: ((source: ExtensionSource) => void) | undefined;
    harness.manager.updateSource.mockImplementation(
      () =>
        new Promise<ExtensionSource>((resolve) => {
          resolveSave = resolve;
        }),
    );
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    const submit = sourceInput().onSubmit;
    await act(async () => submit());
    expect(harness.lastFrame()).toContain('Saving source...');
    expect(sourceInput().isActive).toBe(false);
    expect(harness.onFooter).toHaveBeenLastCalledWith('Saving source...');
    await press({ name: 'escape' });
    await act(async () => submit());
    expect(harness.manager.updateSource).toHaveBeenCalledOnce();
    await act(async () => resolveSave?.(harness.manager.getSources()[0]));
    await waitFor(() =>
      expect(harness.lastFrame()).not.toContain('Saving source...'),
    );
    harness.unmount();
  });

  it.each([32, 96])(
    'keeps a long source in a bounded editor with continuation at width %s',
    async (width) => {
      terminal.columns = width + 8;
      const source = `https://store.example/${'long-path/'.repeat(40)}marketplace.json`;
      const harness = renderSourceTab(source, width);
      await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
      const listLines = harness.lastFrame()?.split('\n') ?? [];
      const sourceRow = listLines.findIndex((line) =>
        line.includes('demo-store'),
      );
      expect(listLines[sourceRow]).toContain('https://');
      expect(listLines[sourceRow].length).toBeLessThanOrEqual(width);
      expect(listLines[sourceRow + 1]).toContain('other-store');
      expect(harness.lastFrame()).not.toContain(source);
      await openFirstSource();
      const detailLines = harness.lastFrame()?.split('\n') ?? [];
      const headerRow = detailLines.findIndex((line) =>
        line.includes('demo-store'),
      );
      expect(detailLines[headerRow + 1]).toContain('https://store.example/');
      expect(detailLines[headerRow + 1].length).toBeLessThanOrEqual(width);
      expect(harness.lastFrame()).not.toContain(source);
      await selectAction('edit');
      expect(sourceInput()).toMatchObject({
        value: source,
        height: 3,
        inputWidth: width - 3,
        showScrollIndicator: true,
      });
      await act(async () => sourceInput().onSubmit());
      await waitFor(() =>
        expect(harness.manager.updateSource).toHaveBeenCalledWith(
          'demo-store',
          source,
        ),
      );
      harness.unmount();
    },
  );

  it.each([
    {
      width: 32,
      rows: 24,
      language: 'pt' as const,
      privateOriginal: true,
      availableHeight: 9,
    },
    {
      width: 96,
      rows: 24,
      language: 'en' as const,
      privateOriginal: true,
      availableHeight: undefined,
    },
    {
      width: 32,
      rows: 18,
      language: 'en' as const,
      privateOriginal: true,
      availableHeight: undefined,
    },
    {
      width: 96,
      rows: 18,
      language: 'en' as const,
      privateOriginal: true,
      availableHeight: undefined,
    },
    {
      width: 32,
      rows: 24,
      language: 'en' as const,
      privateOriginal: false,
      availableHeight: undefined,
    },
    {
      width: 32,
      rows: 24,
      language: 'en' as const,
      privateOriginal: true,
      availableHeight: 4,
    },
  ])(
    'keeps the real private-source editor and controls within $width columns and $rows terminal rows in $language',
    async ({ width, rows, language, privateOriginal, availableHeight }) => {
      const actual = await vi.importActual<
        typeof import('../../shared/TextInput.js')
      >('../../shared/TextInput.js');
      let inputKeypress: ((key: Key) => void) | undefined;
      mockTextInput.mockImplementation((props) => {
        const element = actual.TextInput(props);
        inputKeypress = mockUseKeypress.mock.calls.at(-1)?.[0] as
          | ((key: Key) => void)
          | undefined;
        return element;
      });
      terminal.columns = width + 8;
      terminal.rows = rows;
      await setLanguageAsync(language);
      const source = privateOriginal
        ? 'https://saved:private-password@store.example/marketplace.json?token=private-token'
        : 'https://store.example/marketplace.json';
      const harness = renderSourceTab(source, width, availableHeight);
      try {
        await waitFor(() =>
          expect(harness.lastFrame()).toContain('demo-store'),
        );
        await openFirstSource();
        await selectAction('edit');
        await waitFor(() => {
          expect(inputKeypress).toBeTypeOf('function');
          expect(sourceInput().isActive).toBe(true);
          expect(harness.lastFrame()).toContain(t('Enter save · Esc cancel'));
        });
        expect(sourceInput().value).toBe(privateOriginal ? '' : source);
        expect(sourceInput().inputWidth).toBe(width - 3);
        const prefix = 'https://user:replacement-password@store.example/';
        const suffix = '?token=replacement-token';
        const replacement = `${prefix}${'x'.repeat((width - 3) * 8 - prefix.length - suffix.length)}${suffix}`;
        if (!privateOriginal) {
          await act(async () =>
            inputKeypress?.({
              name: 'c',
              sequence: '\x03',
              paste: false,
              ctrl: true,
              meta: false,
              shift: false,
            } as Key),
          );
          await waitFor(() => expect(sourceInput().value).toBe(''));
          for (const character of 'https://user:replacement-password') {
            await act(async () =>
              inputKeypress?.({
                name: '',
                sequence: character,
                paste: false,
                ctrl: false,
                meta: false,
                shift: false,
              } as Key),
            );
          }
          await waitFor(() =>
            expect(sourceInput().value).toBe(
              'https://user:replacement-password',
            ),
          );
        }
        await act(async () =>
          inputKeypress?.({
            name: '',
            sequence: privateOriginal
              ? replacement
              : replacement.slice('https://user:replacement-password'.length),
            paste: true,
            ctrl: false,
            meta: false,
            shift: false,
          } as Key),
        );
        await waitFor(() => {
          expect(sourceInput().value).toBe(replacement);
          expect(harness.lastFrame()).toMatch(/\d+–\d+\/\d+/);
        });
        const frame = harness.lastFrame() ?? '';
        expect(frame).toContain(t('Enter save · Esc cancel'));
        if (language === 'pt') {
          expect(frame).toContain('Enter salvar · Esc cancelar');
        }
        expect(frame).not.toMatch(
          /private-password|private-token|replacement-password|replacement-token/,
        );
        expect(harness.frames.join('\n')).not.toMatch(
          /private-password|private-token|replacement-password|replacement-token/,
        );
        expect(frame.split('\n').length).toBeLessThanOrEqual(
          availableHeight ?? rows - 10,
        );
        for (const line of frame.split('\n')) {
          expect(stringWidth(line)).toBeLessThanOrEqual(width);
        }
        expect(sourceInput().height).toBeGreaterThanOrEqual(1);
        expect(sourceInput().height).toBeLessThanOrEqual(3);
        await act(async () =>
          inputKeypress?.({
            name: 'return',
            sequence: '\r',
            paste: false,
            ctrl: false,
            meta: false,
            shift: false,
          } as Key),
        );
        await waitFor(() =>
          expect(harness.manager.updateSource).toHaveBeenCalledWith(
            'demo-store',
            replacement,
          ),
        );
      } finally {
        harness.unmount();
        await setLanguageAsync('en');
      }
    },
  );

  it('blocks detail navigation until the saved source finishes reopening', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    let resolveDetail: ((config: ClaudeMarketplaceConfig) => void) | undefined;
    harness.manager.loadSource.mockImplementationOnce(
      () =>
        new Promise<ClaudeMarketplaceConfig>((resolve) => {
          resolveDetail = resolve;
        }),
    );
    await act(async () => sourceInput().onSubmit());
    await waitFor(() => {
      expect(harness.lastFrame()).toContain('updated-store');
      expect(harness.lastFrame()).toContain('Saving source...');
    });
    await press({ name: 'escape' });
    await press({ name: 'r', sequence: 'r' });
    await selectAction('browse');
    expect(harness.lastFrame()).toContain('updated-store');
    expect(harness.lastFrame()).toContain('Saving source...');
    expect(harness.manager.loadSource).toHaveBeenCalledTimes(2);
    expect(harness.onBrowse).not.toHaveBeenCalled();
    expect(harness.onLockChange).toHaveBeenLastCalledWith(true);
    await act(async () =>
      resolveDetail?.({ name: 'updated-store', plugins: [] }),
    );
    await waitFor(() =>
      expect(harness.statuses).toContainEqual({
        type: 'success',
        text: 'Marketplace source saved.',
      }),
    );
    await press({ name: 'escape' });
    expect(harness.lastFrame()).toContain('Marketplaces');
    expect(harness.onLockChange).toHaveBeenLastCalledWith(false);
    harness.unmount();
  });

  it('saves the submitted buffer value before its change notification reaches parent state', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    expect(sourceInput().value).toBe('owner/store');
    const submitted = 'https://store.example/latest-buffer.json';
    await act(async () => sourceInput().onSubmit(submitted));
    await waitFor(() =>
      expect(harness.manager.updateSource).toHaveBeenCalledExactlyOnceWith(
        'demo-store',
        submitted,
      ),
    );
    harness.unmount();
  });

  it('validates the submitted buffer independently of the previous parent value', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    await act(async () => sourceInput().onSubmit(''));
    expect(harness.statuses.at(-1)).toEqual({
      type: 'error',
      text: 'Enter a marketplace source.',
    });
    await act(async () => sourceInput().onSubmit('new/store\nother/store'));
    expect(harness.statuses.at(-1)).toEqual({
      type: 'error',
      text: 'Enter a source on a single line without control characters.',
    });
    expect(sourceInput().value).toBe('owner/store');
    expect(harness.manager.updateSource).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('masks partial URL credentials while preserving complete public URLs and local sources', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    for (const value of [
      'owner/store',
      './local/store',
      'https://store.example/marketplace.json',
      'https://store.example:443/marketplace.json',
      'http://[::1]:8080/marketplace.json',
    ]) {
      expect(sourceInput().mask?.(value)).toBe(value);
    }
    for (const value of [
      'https://user:private-password',
      'https://user:1234',
      ' https://user:private-password',
      'https://store.example:443',
      'https://user:private-password@store.example/file.json',
      'https://store.example/file.json?token=private-token',
    ]) {
      expect(sourceInput().mask?.(value)).toBe('*'.repeat(value.length));
    }
    harness.unmount();
  });

  it.each(['open', 'retry', 'update'] as const)(
    'ignores a stale %s response after another source opens, including its loading state',
    async (operation) => {
      const harness = renderSourceTab();
      await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
      if (operation !== 'open') await openFirstSource();
      let resolveOld: ((config: ClaudeMarketplaceConfig) => void) | undefined;
      let resolveCurrent:
        | ((config: ClaudeMarketplaceConfig) => void)
        | undefined;
      harness.manager.loadSource.mockImplementationOnce(
        () =>
          new Promise<ClaudeMarketplaceConfig>((resolve) => {
            resolveOld = resolve;
          }),
      );
      if (operation === 'open') {
        await press({ name: 'down' });
        await press({ name: 'down' });
        await press({ name: 'return' });
      } else if (operation === 'retry') {
        await press({ name: 'r', sequence: 'r' });
      } else {
        await selectAction('update');
      }
      await waitFor(() => expect(harness.lastFrame()).toContain('Loading...'));
      await press({ name: 'escape' });
      harness.manager.loadSource.mockImplementationOnce(
        () =>
          new Promise<ClaudeMarketplaceConfig>((resolve) => {
            resolveCurrent = resolve;
          }),
      );
      await press({ name: 'down' });
      await press({ name: 'return' });
      await waitFor(() => expect(harness.lastFrame()).toContain('other-store'));
      await act(async () => resolveOld?.({ name: 'stale-store', plugins: [] }));
      expect(harness.lastFrame()).toContain('other-store');
      expect(harness.lastFrame()).toContain('Loading...');
      expect(harness.lastFrame()).not.toContain('available extensions');
      expect(harness.manager.markSourceUpdated).not.toHaveBeenCalled();
      expect(harness.onChanged).not.toHaveBeenCalled();
      await act(async () =>
        resolveCurrent?.({
          name: 'other-store',
          plugins: [
            { name: 'one', source: './one', version: '1.0.0' },
            { name: 'two', source: './two', version: '1.0.0' },
          ],
        }),
      );
      await waitFor(() =>
        expect(harness.lastFrame()).toContain('2 available extensions'),
      );
      expect(harness.lastFrame()).not.toContain('Loading...');
      expect(harness.manager.loadSource).toHaveBeenLastCalledWith(
        'other/store',
      );
      harness.unmount();
    },
  );

  it('ignores a stale refresh error after another source has loaded', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    let rejectOld: ((error: Error) => void) | undefined;
    harness.manager.loadSource.mockImplementationOnce(
      () =>
        new Promise<ClaudeMarketplaceConfig>((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    await selectAction('update');
    await press({ name: 'escape' });
    await press({ name: 'down' });
    await press({ name: 'return' });
    await waitFor(() =>
      expect(harness.lastFrame()).toContain('0 available extensions'),
    );
    const frame = harness.lastFrame();
    const statuses = [...harness.statuses];
    await act(async () =>
      rejectOld?.(new Error('Stale private transport failure.')),
    );
    expect(harness.lastFrame()).toBe(frame);
    expect(harness.statuses).toEqual(statuses);
    expect(harness.manager.markSourceUpdated).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('invalidates a detail request on unmount without emitting later status or footer updates', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    let resolveDetail: ((config: ClaudeMarketplaceConfig) => void) | undefined;
    harness.manager.loadSource.mockImplementationOnce(
      () =>
        new Promise<ClaudeMarketplaceConfig>((resolve) => {
          resolveDetail = resolve;
        }),
    );
    await press({ name: 'down' });
    await press({ name: 'down' });
    await press({ name: 'return' });
    await waitFor(() => expect(harness.lastFrame()).toContain('Loading...'));
    harness.unmount();
    const statuses = [...harness.statuses];
    const footerCalls = harness.onFooter.mock.calls.length;
    await act(async () => resolveDetail?.({ name: 'demo-store', plugins: [] }));
    expect(harness.statuses).toEqual(statuses);
    expect(harness.onFooter.mock.calls.length).toBe(footerCalls);
    expect(harness.onChanged).not.toHaveBeenCalled();
  });

  it.each([
    'https://user:private-password@store.example/marketplace.json',
    'https://store.example/marketplace.json?token=private-token#private-fragment',
  ])(
    'never prefills or saves a redacted substitute for a credential-containing source',
    async (source) => {
      const harness = renderSourceTab(source);
      await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
      expect(harness.lastFrame()).not.toMatch(
        /private-password|private-token|private-fragment/,
      );
      await openFirstSource();
      await selectAction('edit');
      expect(sourceInput().value).toBe('');
      expect(harness.lastFrame()).toContain('contains hidden values');
      expect(harness.lastFrame()).not.toMatch(
        /private-password|private-token|private-fragment/,
      );
      await act(async () => sourceInput().onSubmit());
      expect(harness.manager.updateSource).not.toHaveBeenCalled();
      await press({ name: 'escape' });
      expect(harness.manager.getSources()[0].source).toBe(source);
      harness.unmount();
    },
  );

  it('masks a typed private URL and strips credentials, parameters and controls from save errors', async () => {
    const harness = renderSourceTab();
    const source =
      'https://user:private-password@store.example/marketplace.json?token=private-token';
    harness.manager.updateSource.mockRejectedValue(
      new Error(`Failed to fetch ${source}\x1b[2J`),
    );
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    await selectAction('edit');
    await act(async () => sourceInput().onChange(source));
    expect(sourceInput().mask?.(source)).toBe('*'.repeat(source.length));
    expect(sourceInput().allowExternalEditor).toBe(false);
    await act(async () => sourceInput().onSubmit());
    await waitFor(() => expect(harness.statuses.at(-1)?.type).toBe('error'));
    expect(harness.statuses.at(-1)?.text).not.toMatch(
      /private-password|private-token/,
    );
    expect(harness.statuses.at(-1)?.text).not.toContain('\x1b');
    expect(sourceInput().value).toBe(source);
    harness.unmount();
  });

  it.each([
    'owner/store\nother/store',
    'owner/store\tother/store',
    'owner/\x7fstore',
    '\x1b[2Jowner/store',
  ])(
    'rejects multiline or terminal-control source input without calling the manager',
    async (source) => {
      const harness = renderSourceTab();
      await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
      await openFirstSource();
      await selectAction('edit');
      await act(async () => sourceInput().onChange(source));
      await act(async () => sourceInput().onSubmit());
      expect(harness.manager.updateSource).not.toHaveBeenCalled();
      expect(harness.statuses.at(-1)).toEqual({
        type: 'error',
        text: 'Enter a source on a single line without control characters.',
      });
      harness.unmount();
    },
  );

  it('keeps edit available after a failed load and preserves R retry', async () => {
    const harness = renderSourceTab();
    harness.manager.loadSource.mockResolvedValueOnce(null);
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    expect(harness.lastFrame()).toContain('Could not load this marketplace.');
    expect(sourceActions().items.map((item) => item.value)).toEqual([
      'edit',
      'remove',
    ]);
    await press({ name: 'r', sequence: 'r' });
    await waitFor(() =>
      expect(
        sourceActions().items.some((item) => item.value === 'browse'),
      ).toBe(true),
    );
    expect(harness.manager.loadSource).toHaveBeenCalledTimes(2);
    harness.unmount();
  });

  it('keeps every source action visible when installed plugins exceed the short panel budget', async () => {
    const actual = await vi.importActual<
      typeof import('../../shared/RadioButtonSelect.js')
    >('../../shared/RadioButtonSelect.js');
    mockRadioButtonSelect.mockImplementation((props) =>
      actual.RadioButtonSelect(props as RadioButtonSelectProps<string>),
    );
    const installed: Extension[] = Array.from({ length: 10 }, (_, index) => ({
      id: `plugin-${index}`,
      name: `plugin-${index}`,
      version: '1.0.0',
      path: `/extensions/plugin-${index}`,
      isActive: true,
      contextFiles: [],
      config: { name: `plugin-${index}`, version: '1.0.0' },
    }));
    const harness = renderSourceTab('owner/store', 32, 10, installed);
    harness.manager.loadSource.mockResolvedValue({
      name: 'demo-store',
      plugins: installed.map((extension) => ({
        name: extension.name,
        source: `./${extension.name}`,
        version: '1.0.0',
      })),
    });
    try {
      await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
      await openFirstSource();
      await waitFor(() => expect(harness.lastFrame()).toContain('Edit source'));
      const frame = harness.lastFrame() ?? '';
      expect(frame).toContain('Browse extensions (10)');
      expect(frame).toContain('Update marketplace');
      expect(frame).toContain('Remove marketplace');
      expect(frame).toContain('... and 9 more');
      expect(frame.split('\n').length).toBeLessThanOrEqual(10);
    } finally {
      harness.unmount();
    }
  });

  it.each([2, 4])(
    'keeps edit and remove visible after a store load fails with %s available rows',
    async (availableHeight) => {
      const actual = await vi.importActual<
        typeof import('../../shared/RadioButtonSelect.js')
      >('../../shared/RadioButtonSelect.js');
      mockRadioButtonSelect.mockImplementation((props) =>
        actual.RadioButtonSelect(props as RadioButtonSelectProps<string>),
      );
      const harness = renderSourceTab('owner/store', 32, availableHeight);
      harness.manager.loadSource.mockRejectedValue(new Error('Unavailable'));
      try {
        await waitFor(() =>
          expect(harness.lastFrame()).toContain('demo-store'),
        );
        await openFirstSource();
        await waitFor(() =>
          expect(harness.lastFrame()).toContain('Edit source'),
        );
        const frame = harness.lastFrame() ?? '';
        expect(frame).toContain('Remove marketplace');
        expect(frame.split('\n').length).toBeLessThanOrEqual(availableHeight);
      } finally {
        harness.unmount();
      }
    },
  );

  it('preserves browse, refresh and confirmed removal as distinct actions', async () => {
    const harness = renderSourceTab();
    await waitFor(() => expect(harness.lastFrame()).toContain('demo-store'));
    await openFirstSource();
    expect(sourceActions().items.map((item) => item.value)).toEqual([
      'browse',
      'update',
      'edit',
      'remove',
    ]);
    await selectAction('browse');
    expect(harness.onBrowse).toHaveBeenCalledExactlyOnceWith('demo-store');
    await selectAction('update');
    await waitFor(() =>
      expect(harness.manager.markSourceUpdated).toHaveBeenCalledExactlyOnceWith(
        'demo-store',
      ),
    );
    await waitFor(() =>
      expect(harness.statuses).toContainEqual({
        type: 'success',
        text: 'Updated marketplace "demo-store".',
      }),
    );
    expect(harness.manager.updateSource).not.toHaveBeenCalled();
    await selectAction('remove');
    expect(harness.manager.removeSource).not.toHaveBeenCalled();
    await press({ name: 'escape' });
    expect(harness.manager.removeSource).not.toHaveBeenCalled();
    await press({ name: 'return' });
    await waitFor(() =>
      expect(harness.manager.loadSource).toHaveBeenCalledTimes(3),
    );
    await selectAction('remove');
    await press({ name: 'return' });
    expect(harness.manager.removeSource).toHaveBeenCalledExactlyOnceWith(
      'demo-store',
    );
    expect(harness.manager.updateSource).not.toHaveBeenCalled();
    harness.unmount();
  });
});
