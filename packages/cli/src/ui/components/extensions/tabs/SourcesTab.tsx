/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../../semantic-colors.js';
import { ICON } from '../../../constants.js';
import { useKeypress } from '../../../hooks/useKeypress.js';
import { useTerminalSize } from '../../../hooks/useTerminalSize.js';
import { keyMatchers, Command } from '../../../keyMatchers.js';
import { TextInput } from '../../shared/TextInput.js';
import { RadioButtonSelect } from '../../shared/RadioButtonSelect.js';
import { t } from '../../../../i18n/index.js';
import {
  type Config,
  type Extension,
  type ExtensionSource,
  type ClaudeMarketplaceConfig,
  parseInstallSource,
  createDebugLogger,
  isExtensionCommittedWithWarningsError,
} from '@organizaone/o1-code-core';
import { redactUrlCredentials } from '@organizaone/o1-code-core/extension/redaction.js';
import { getErrorMessage } from '../../../../utils/errors.js';
import { stripUnsafeCharacters } from '../../../utils/textUtils.js';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';

const debugLogger = createDebugLogger('SOURCES_TAB');

// How many installed plugins to list in the marketplace detail before
// collapsing the rest into a "… and N more" summary (keeps the view short).
const INSTALLED_PREVIEW_LIMIT = 5;

type SourcesView =
  | 'list'
  | 'install-extension'
  | 'add'
  | 'detail'
  | 'edit'
  | 'remove-confirm';
type SourceDetailAction = 'browse' | 'update' | 'edit' | 'remove';

// Flat, navigable entries shown on the Marketplaces tab list. Installed
// extensions are not listed here — they live on the Installed tab.
type Entry =
  | { kind: 'install-extension' }
  | { kind: 'add-marketplace' }
  | { kind: 'marketplace'; source: ExtensionSource };

interface SourcesTabProps {
  config: Config;
  isActive: boolean;
  onLockChange: (locked: boolean) => void;
  onStatus: (status: StatusMessage | null) => void;
  onChanged: () => void;
  /** Switch to the Discover tab filtered to the given marketplace. */
  onBrowse: (marketplaceName: string) => void;
  /** Provide a context-aware footer hint for the list (null = default). */
  onFooter: (hint: string | null) => void;
  reloadSignal: number;
  terminalWidth?: number;
  availableTerminalHeight?: number;
}

function sourceDisplay(value: string): string {
  return stripUnsafeCharacters(redactUrlCredentials(value))
    .replace(/[\r\n\t\x7f]/g, ' ')
    .replace(/([?#])[^\s]*/g, '$1…');
}

function sourceInputDisplay(value: string, savedSourceHidden: boolean): string {
  const authority = value.match(/^\s*[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i);
  // An unfinished authority's colon can start either a password or a port.
  const partialUserinfo =
    authority &&
    !authority[1].startsWith('[') &&
    authority[1].includes(':') &&
    (authority[0].length === value.length || !/:\d+$/.test(authority[1]));
  return savedSourceHidden || partialUserinfo || sourceDisplay(value) !== value
    ? value.replace(/./gu, '*')
    : value;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleDateString();
}

export const SourcesTab = ({
  config,
  isActive,
  onLockChange,
  onStatus,
  onChanged,
  onBrowse,
  onFooter,
  reloadSignal,
  terminalWidth,
  availableTerminalHeight,
}: SourcesTabProps) => {
  const { columns, rows } = useTerminalSize();
  const contentHeight = Math.max(1, availableTerminalHeight ?? rows - 10);
  const inputWidth = Math.max(
    1,
    Math.min(terminalWidth ?? Math.min(columns - 8, 96), columns - 8),
  );
  const [sources, setSources] = useState<ExtensionSource[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<SourcesView>('list');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const savingSource = useRef(false);
  const detailRequest = useRef(0);
  const mounted = useRef(true);
  const [detailConfig, setDetailConfig] =
    useState<ClaudeMarketplaceConfig | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // The marketplace currently being viewed or confirmed.
  const [detailSource, setDetailSource] = useState<ExtensionSource | null>(
    null,
  );

  const extensionManager = config.getExtensionManager();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      detailRequest.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    if (!extensionManager) return;
    try {
      await extensionManager.refreshCache();
    } catch (error) {
      debugLogger.error('Failed to refresh extensions:', error);
    }
    setExtensions(extensionManager.getLoadedExtensions());
    setSources(extensionManager.getSources());
  }, [extensionManager]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  // Entries: two action rows, then the configured marketplaces.
  const entries = useMemo<Entry[]>(
    () => [
      { kind: 'install-extension' },
      { kind: 'add-marketplace' },
      ...sources.map((source) => ({ kind: 'marketplace' as const, source })),
    ],
    [sources],
  );

  // Keep the cursor in range as the list changes.
  useEffect(() => {
    if (selectedIndex >= entries.length) {
      setSelectedIndex(0);
    }
  }, [entries.length, selectedIndex]);

  const selectedEntry = entries[selectedIndex];

  // Context-aware footer hint. Mostly list-view only, but the marketplace
  // detail surfaces an R-to-retry hint when its load failed.
  useEffect(() => {
    if (!isActive) {
      onFooter(null);
      return;
    }
    if (view === 'edit') {
      onFooter(
        busy ? t('Saving source...') : t('Enter save source · Esc cancel'),
      );
      return () => onFooter(null);
    }
    if (view === 'detail') {
      if (busy) {
        onFooter(t('Saving source...'));
        return () => onFooter(null);
      }
      // R re-fetches in the detail view either way; advertise it in the
      // footer (as a retry on failure, a refresh once loaded).
      if (detailLoading) {
        onFooter(null);
      } else if (!detailConfig) {
        onFooter(t('Press R to retry · Esc to go back'));
      } else {
        onFooter(t('Enter to select · R refresh · Esc to go back'));
      }
      return () => onFooter(null);
    }
    if (view !== 'list') {
      onFooter(null);
      return;
    }
    const kind = selectedEntry?.kind;
    if (kind === 'marketplace') {
      onFooter(
        t('↑↓ navigate · Enter open · d remove marketplace · Esc close'),
      );
    } else {
      onFooter(t('↑↓ navigate · Enter select · Esc close'));
    }
    return () => onFooter(null);
  }, [
    isActive,
    view,
    selectedEntry?.kind,
    onFooter,
    detailLoading,
    detailConfig,
    busy,
  ]);

  const goToList = useCallback(() => {
    if (savingSource.current) return;
    detailRequest.current++;
    setView('list');
    setInput('');
    setDetailConfig(null);
    setDetailSource(null);
    setDetailLoading(false);
    onLockChange(false);
  }, [onLockChange]);

  const submitAdd = useCallback(async () => {
    if (!extensionManager || !input.trim()) return;
    setBusy(true);
    try {
      const entry = await extensionManager.addSource(input.trim());
      onStatus({
        type: 'success',
        text: t('Added marketplace "{{name}}".', {
          name: sourceDisplay(entry.name),
        }),
      });
      await load();
      onChanged();
      goToList();
    } catch (error) {
      onStatus({
        type: 'error',
        text: sourceDisplay(getErrorMessage(error)),
      });
    } finally {
      setBusy(false);
    }
  }, [extensionManager, input, onStatus, load, onChanged, goToList]);

  const submitInstall = useCallback(async () => {
    if (!extensionManager || !input.trim()) return;
    setBusy(true);
    try {
      const metadata = await parseInstallSource(input.trim());
      const ext = await extensionManager.installExtension(metadata);
      onStatus({
        type: 'success',
        text: t('Installed extension "{{name}}".', {
          name: sourceDisplay(ext.name),
        }),
      });
      await load();
      onChanged();
      goToList();
    } catch (error) {
      if (isExtensionCommittedWithWarningsError(error)) {
        onStatus({
          type: 'warning',
          text: sourceDisplay(getErrorMessage(error)),
        });
        await load();
        onChanged();
        goToList();
        return;
      }
      onStatus({
        type: 'error',
        text: sourceDisplay(getErrorMessage(error)),
      });
    } finally {
      setBusy(false);
    }
  }, [extensionManager, input, onStatus, load, onChanged, goToList]);

  const openSourceDetail = useCallback(
    async (source: ExtensionSource) => {
      if (!mounted.current) return;
      const request = ++detailRequest.current;
      onStatus(null);
      setDetailSource(source);
      setView('detail');
      onLockChange(true);
      setDetailLoading(true);
      setDetailConfig(null);
      try {
        const cfg = await extensionManager?.loadSource(source.source);
        if (mounted.current && request === detailRequest.current) {
          setDetailConfig(cfg ?? null);
        }
      } catch (error) {
        if (mounted.current && request === detailRequest.current) {
          debugLogger.error('Failed to load marketplace detail:', error);
        }
      } finally {
        if (mounted.current && request === detailRequest.current) {
          setDetailLoading(false);
        }
      }
    },
    [extensionManager, onLockChange, onStatus],
  );

  const submitEdit = useCallback(
    async (submittedValue = input) => {
      if (!extensionManager || !detailSource || savingSource.current) return;
      if (!submittedValue.trim()) {
        onStatus({ type: 'error', text: t('Enter a marketplace source.') });
        return;
      }
      if (
        /[\r\n\t\x7f]/.test(submittedValue) ||
        stripUnsafeCharacters(submittedValue) !== submittedValue
      ) {
        onStatus({
          type: 'error',
          text: t(
            'Enter a source on a single line without control characters.',
          ),
        });
        return;
      }
      savingSource.current = true;
      setBusy(true);
      onStatus(null);
      try {
        const updated = await extensionManager.updateSource(
          detailSource.name,
          submittedValue.trim(),
        );
        if (!mounted.current) return;
        await load();
        if (!mounted.current) return;
        const index = extensionManager
          .getSources()
          .findIndex((source) => source.name === updated.name);
        if (index >= 0) setSelectedIndex(index + 2);
        onChanged();
        setInput('');
        await openSourceDetail(updated);
        if (!mounted.current) return;
        onStatus({
          type: 'success',
          text: t('Marketplace source saved.'),
        });
      } catch (error) {
        if (!mounted.current) return;
        onStatus({
          type: 'error',
          text: t(sourceDisplay(getErrorMessage(error))),
        });
      } finally {
        savingSource.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [
      extensionManager,
      detailSource,
      input,
      load,
      onChanged,
      onStatus,
      openSourceDetail,
    ],
  );

  // Re-fetch the marketplace config for the currently-open detail. Used by the
  // R key so a failed load can be retried without leaving the detail view.
  const refetchDetail = useCallback(async () => {
    if (!extensionManager || !detailSource || savingSource.current) return;
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setDetailConfig(null);
    try {
      const cfg = await extensionManager.loadSource(detailSource.source);
      if (mounted.current && request === detailRequest.current) {
        setDetailConfig(cfg ?? null);
      }
    } catch (error) {
      if (mounted.current && request === detailRequest.current) {
        debugLogger.error('Failed to load marketplace detail:', error);
      }
    } finally {
      if (mounted.current && request === detailRequest.current) {
        setDetailLoading(false);
      }
    }
  }, [extensionManager, detailSource]);

  const removeSource = useCallback(() => {
    if (!extensionManager || !detailSource) return;
    // removeSource() -> atomicWriteFileSync can throw (EACCES/EROFS/ENOSPC, or
    // a Windows lock on marketplaces.json). Unlike the async sibling handlers,
    // this runs synchronously inside the keypress broadcast loop, so an
    // unguarded throw would tear down the whole TUI session. Degrade to an
    // error toast instead.
    try {
      const removed = extensionManager.removeSource(detailSource.name);
      if (removed) {
        onStatus({
          type: 'success',
          text: t('Removed marketplace "{{name}}".', {
            name: sourceDisplay(detailSource.name),
          }),
        });
        void load();
        onChanged();
      }
    } catch (error) {
      onStatus({ type: 'error', text: sourceDisplay(getErrorMessage(error)) });
    }
    goToList();
  }, [extensionManager, detailSource, onStatus, load, onChanged, goToList]);

  const updateSource = useCallback(async () => {
    if (!extensionManager || !detailSource || savingSource.current) return;
    const request = ++detailRequest.current;
    setDetailLoading(true);
    try {
      const cfg = await extensionManager.loadSource(detailSource.source);
      if (!mounted.current || request !== detailRequest.current) return;
      setDetailConfig(cfg ?? null);
      // loadSource returns null when the marketplace is unreachable / invalid.
      // Only advance the lastUpdated timestamp and report success on a real
      // refresh — otherwise a failed update would show "Updated marketplace X".
      if (cfg === null) {
        onStatus({
          type: 'error',
          text: t('Could not update marketplace "{{name}}".', {
            name: sourceDisplay(detailSource.name),
          }),
        });
        await load();
        return;
      }
      extensionManager.markSourceUpdated(detailSource.name);
      await load();
      if (!mounted.current || request !== detailRequest.current) return;
      onChanged();
      onStatus({
        type: 'success',
        text: t('Updated marketplace "{{name}}".', {
          name: sourceDisplay(detailSource.name),
        }),
      });
    } catch (error) {
      if (!mounted.current || request !== detailRequest.current) return;
      onStatus({
        type: 'error',
        text: sourceDisplay(getErrorMessage(error)),
      });
    } finally {
      if (mounted.current && request === detailRequest.current) {
        setDetailLoading(false);
      }
    }
  }, [extensionManager, detailSource, load, onChanged, onStatus]);

  const handleSourceDetailAction = useCallback(
    (action: SourceDetailAction) => {
      if (!detailSource || detailLoading || savingSource.current) return;
      if (action === 'browse') {
        onBrowse(detailSource.name);
      } else if (action === 'update') {
        void updateSource();
      } else if (action === 'edit') {
        onStatus(null);
        setInput(
          sourceDisplay(detailSource.source) === detailSource.source
            ? detailSource.source
            : '',
        );
        setView('edit');
      } else if (action === 'remove') {
        setView('remove-confirm');
      }
    },
    [detailSource, detailLoading, onBrowse, updateSource, onStatus],
  );

  // List keyboard: navigate entries, Enter dispatches by kind, d removes.
  useKeypress(
    (key) => {
      if (entries.length === 0) return;
      if (keyMatchers[Command.SELECTION_UP](key)) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : entries.length - 1));
        return;
      }
      if (keyMatchers[Command.SELECTION_DOWN](key)) {
        setSelectedIndex((prev) => (prev < entries.length - 1 ? prev + 1 : 0));
        return;
      }
      if (key.name === 'return') {
        if (!selectedEntry) return;
        onStatus(null);
        switch (selectedEntry.kind) {
          case 'install-extension':
            setView('install-extension');
            onLockChange(true);
            break;
          case 'add-marketplace':
            setView('add');
            onLockChange(true);
            break;
          case 'marketplace':
            void openSourceDetail(selectedEntry.source);
            break;
          default:
            break;
        }
        return;
      }
      if (
        (key.sequence === 'd' || key.sequence === 'x') &&
        !key.ctrl &&
        !key.meta &&
        selectedEntry?.kind === 'marketplace'
      ) {
        setDetailSource(selectedEntry.source);
        setView('remove-confirm');
        onLockChange(true);
      }
    },
    { isActive: isActive && view === 'list' },
  );

  // Input views: Escape cancels.
  useKeypress(
    (key) => {
      if (key.name === 'escape' && !busy) {
        goToList();
      }
    },
    {
      isActive: isActive && (view === 'add' || view === 'install-extension'),
    },
  );

  // Marketplace detail: Escape goes back; R re-fetches (retry on load failure);
  // the selector owns Enter.
  useKeypress(
    (key) => {
      if (savingSource.current) return;
      if (key.name === 'escape') {
        goToList();
      } else if (
        (key.name === 'r' || key.sequence === 'r') &&
        !key.ctrl &&
        !key.meta &&
        !detailLoading
      ) {
        void refetchDetail();
      }
    },
    { isActive: isActive && view === 'detail' },
  );

  useKeypress(
    (key) => {
      if (key.name === 'escape' && !savingSource.current) {
        setInput('');
        onStatus(null);
        setView('detail');
      }
    },
    { isActive: isActive && view === 'edit' },
  );

  // Remove-marketplace confirmation.
  useKeypress(
    (key) => {
      if (key.name === 'return' || key.sequence === 'y') {
        removeSource();
      } else if (key.name === 'escape' || key.sequence === 'n') {
        goToList();
      }
    },
    { isActive: isActive && view === 'remove-confirm' },
  );

  if (view === 'edit' && detailSource) {
    const savedSourceHidden =
      sourceDisplay(detailSource.source) !== detailSource.source;
    const budget = contentHeight;
    const headerRows = budget >= 9 ? 3 : budget >= 7 ? 2 : budget >= 5 ? 1 : 0;
    const showFooter = budget >= 2;
    const indicatorRows = budget >= 4 ? 2 : 0;
    const inputHeight = Math.max(
      1,
      Math.min(3, budget - headerRows - Number(showFooter) - indicatorRows),
    );
    const helpHeight = Math.max(
      0,
      Math.min(
        4,
        budget - headerRows - inputHeight - Number(showFooter) - indicatorRows,
      ),
    );
    return (
      <Box
        flexDirection="column"
        width={inputWidth}
        maxHeight={budget}
        overflowY="hidden"
      >
        {headerRows > 0 && (
          <Text color={theme.text.primary} bold wrap="truncate-end">
            {t('Edit marketplace source')}
          </Text>
        )}
        {headerRows > 1 && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {sourceDisplay(detailSource.name)}
          </Text>
        )}
        {headerRows > 2 && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {sourceDisplay(detailSource.source)}
          </Text>
        )}
        {helpHeight > 0 && (
          <Box height={helpHeight} flexShrink={0} overflowY="hidden">
            <Text
              color={
                savedSourceHidden ? theme.status.warning : theme.text.secondary
              }
            >
              {savedSourceHidden
                ? t(
                    'The saved source contains hidden values. Enter a replacement; cancel keeps the original source.',
                  )
                : t(
                    'Changes affect marketplace discovery. Installed extensions keep their sources.',
                  )}
            </Text>
          </Box>
        )}
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={(text) => void submitEdit(text)}
          inputWidth={Math.max(1, inputWidth - 3)}
          height={inputHeight}
          showScrollIndicator={indicatorRows > 0}
          allowExternalEditor={false}
          isActive={isActive && !busy}
          mask={(text) => sourceInputDisplay(text, savedSourceHidden)}
          placeholder={t('URL, repository or local path')}
        />
        {showFooter && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {busy ? t('Saving source...') : t('Enter save · Esc cancel')}
          </Text>
        )}
      </Box>
    );
  }

  if (view === 'install-extension') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.text.primary} bold>
          {t('Install Extension')}
        </Text>

        <Box flexDirection="column">
          <Text color={theme.text.primary}>{t('Enter extension source:')}</Text>
          <Text color={theme.text.secondary}>{t('Examples:')}</Text>
          <Text color={theme.text.secondary}>{' · owner/repo (GitHub)'}</Text>
          <Text color={theme.text.secondary}>
            {' · git@github.com:owner/repo.git (SSH)'}
          </Text>
          <Text color={theme.text.secondary}>{' · @scope/name (npm)'}</Text>
          <Text color={theme.text.secondary}>{' · ./path/to/extension'}</Text>
        </Box>

        {busy ? (
          <Text color={theme.text.secondary}>{t('Installing...')}</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={() => void submitInstall()}
            isActive={isActive}
          />
        )}
      </Box>
    );
  }

  if (view === 'add') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.text.primary} bold>
          {t('Add Marketplace')}
        </Text>

        <Box flexDirection="column">
          <Text color={theme.text.primary}>
            {t('Enter marketplace source (Claude format):')}
          </Text>
          <Text color={theme.text.secondary}>{t('Examples:')}</Text>
          <Text color={theme.text.secondary}>{' · owner/repo (GitHub)'}</Text>
          <Text color={theme.text.secondary}>
            {' · git@github.com:owner/repo.git (SSH)'}
          </Text>
          <Text color={theme.text.secondary}>
            {' · https://example.com/marketplace.json'}
          </Text>
          <Text color={theme.text.secondary}>{' · ./path/to/marketplace'}</Text>
        </Box>

        {busy ? (
          <Text color={theme.text.secondary}>{t('Adding...')}</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={() => void submitAdd()}
            isActive={isActive}
          />
        )}
      </Box>
    );
  }

  if (view === 'detail' && detailSource) {
    const detailHeight = Math.max(
      1,
      availableTerminalHeight ?? Number.MAX_SAFE_INTEGER,
    );
    const compact = detailHeight < 12;
    const headerRows = detailHeight >= 8 ? 2 : detailHeight >= 6 ? 1 : 0;
    const showCount = detailHeight >= 7;
    const previewLimit = Math.max(
      0,
      Math.min(
        INSTALLED_PREVIEW_LIMIT,
        detailHeight -
          headerRows -
          Number(showCount) -
          4 -
          (compact ? 0 : 3) -
          2,
      ),
    );
    const showInstalled =
      detailHeight > headerRows + Number(showCount) + 4 + (compact ? 0 : 3);
    const plugins = detailConfig?.plugins ?? [];
    const availableCount = plugins.length;
    const installedNames = new Set(extensions.map((ext) => ext.name));
    const installedHere = plugins.filter((p) => installedNames.has(p.name));
    const lastUpdated = formatDate(
      detailSource.lastUpdatedAt ?? detailSource.addedAt,
    );

    const actions: Array<{
      key: string;
      label: string;
      value: SourceDetailAction;
    }> = [
      {
        key: 'browse',
        label: t('Browse extensions ({{count}})', {
          count: String(availableCount),
        }),
        value: 'browse',
      },
      {
        key: 'update',
        label: lastUpdated
          ? t('Update marketplace (last updated {{date}})', {
              date: lastUpdated,
            })
          : t('Update marketplace'),
        value: 'update',
      },
      { key: 'edit', label: t('Edit source'), value: 'edit' },
      { key: 'remove', label: t('Remove marketplace'), value: 'remove' },
    ];

    return (
      <Box flexDirection="column" gap={compact ? 0 : 1}>
        {headerRows > 0 && (
          <Box flexDirection="column" width={inputWidth}>
            <Text color={theme.text.primary} bold wrap="truncate-end">
              {sourceDisplay(detailSource.name)}
            </Text>
            {headerRows > 1 && (
              <Text color={theme.text.secondary} wrap="truncate-end">
                {sourceDisplay(detailSource.source)}
              </Text>
            )}
          </Box>
        )}

        {detailLoading ? (
          <Text color={theme.text.secondary}>
            {busy ? t('Saving source...') : t('Loading...')}
          </Text>
        ) : detailConfig ? (
          <Box flexDirection="column" gap={compact ? 0 : 1}>
            {showCount && (
              <Text color={theme.text.primary}>
                {t('{{count}} available extensions', {
                  count: String(availableCount),
                })}
              </Text>
            )}

            {installedHere.length > 0 && showInstalled ? (
              <Box flexDirection="column">
                {previewLimit > 0 && (
                  <Text color={theme.text.primary} bold>
                    {t('Installed extensions ({{count}}):', {
                      count: String(installedHere.length),
                    })}
                  </Text>
                )}
                {installedHere.slice(0, previewLimit).map((p) => (
                  <Box key={p.name}>
                    <Box minWidth={2} flexShrink={0}>
                      <Text color={theme.status.success}>
                        {ICON.CIRCLE_FILLED}
                      </Text>
                    </Box>
                    <Text color={theme.text.primary} wrap="truncate-end">
                      {stripUnsafeCharacters(p.name)}
                    </Text>
                  </Box>
                ))}
                {installedHere.length > previewLimit ? (
                  <Text color={theme.text.secondary} wrap="truncate-end">
                    {t('... and {{count}} more', {
                      count: String(installedHere.length - previewLimit),
                    })}
                  </Text>
                ) : null}
              </Box>
            ) : null}

            <RadioButtonSelect
              items={actions}
              isFocused={isActive}
              showNumbers={false}
              onSelect={handleSourceDetailAction}
            />
          </Box>
        ) : (
          <Box flexDirection="column" gap={compact ? 0 : 1}>
            {detailHeight - headerRows >= 3 && (
              <Text color={theme.status.error} wrap="truncate-end">
                {t('Could not load this marketplace.')}
              </Text>
            )}
            {detailHeight - headerRows >= 4 + (compact ? 0 : 2) && (
              <Text color={theme.text.secondary} wrap="truncate-end">
                {t('Press R to retry · Esc to go back')}
              </Text>
            )}
            <RadioButtonSelect
              items={[
                {
                  key: 'edit',
                  label: t('Edit source'),
                  value: 'edit' as SourceDetailAction,
                },
                {
                  key: 'remove',
                  label: t('Remove marketplace'),
                  value: 'remove' as SourceDetailAction,
                },
              ]}
              isFocused={isActive}
              showNumbers={false}
              onSelect={handleSourceDetailAction}
            />
          </Box>
        )}
      </Box>
    );
  }

  if (view === 'remove-confirm') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.status.warning}>
          {t('Remove marketplace "{{name}}"?', {
            name: sourceDisplay(detailSource?.name ?? ''),
          })}
        </Text>
        <Text color={theme.text.secondary}>
          {t('Y/Enter to confirm · N/Esc to cancel')}
        </Text>
      </Box>
    );
  }

  // List view.
  const renderRow = (
    index: number,
    label: string,
    rightText?: string,
    isAction = false,
  ) => {
    const isSelected = index === selectedIndex;
    const markerWidth = Math.min(2, inputWidth);
    const availableWidth = inputWidth - markerWidth;
    const showRight =
      rightText && availableWidth >= 24 && (!isAction || inputWidth >= 64);
    const rightWidth = showRight ? Math.floor((availableWidth - 1) / 2) : 0;
    const labelWidth = availableWidth - (showRight ? rightWidth + 1 : 0);
    const labelColor = isSelected
      ? theme.text.accent
      : isAction
        ? theme.text.link
        : theme.text.primary;
    return (
      <Box key={`row-${index}`} width={inputWidth} flexShrink={0}>
        <Box width={markerWidth} flexShrink={0}>
          <Text color={isSelected ? theme.text.accent : theme.text.primary}>
            {isSelected ? ICON.CIRCLE_FILLED : ' '}
          </Text>
        </Box>
        <Box width={labelWidth} flexShrink={0}>
          <Text color={labelColor} wrap="truncate-end">
            {label}
          </Text>
        </Box>
        {showRight ? (
          <Box width={rightWidth} marginLeft={1} flexShrink={0}>
            <Text color={theme.text.secondary} wrap="truncate-end">
              {rightText}
            </Text>
          </Box>
        ) : null}
      </Box>
    );
  };

  const sourcesStart = 2;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Text color={theme.text.accent} bold>
          {t('Add new')}
        </Text>
        {renderRow(0, t('+ Install a new extension'), undefined, true)}
        {renderRow(
          1,
          t('+ Add new marketplace'),
          t('Claude plugin marketplace'),
          true,
        )}
      </Box>

      {sources.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.accent} bold>
            {t('Marketplaces')} ({sources.length})
          </Text>
          {sources.map((source, j) =>
            renderRow(
              sourcesStart + j,
              // Persisted marketplace name is stored raw from untrusted config;
              // scrub it at the render site (also defends already-persisted
              // entries) like the detail header does.
              sourceDisplay(source.name),
              `${sourceDisplay(source.source)} (${source.type})`,
            ),
          )}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {t('No marketplaces added yet.')}
          </Text>
        </Box>
      )}
    </Box>
  );
};
