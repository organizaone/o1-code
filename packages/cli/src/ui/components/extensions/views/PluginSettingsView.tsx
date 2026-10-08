/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import type { Extension } from '@organizaone/o1-code-core/extension/extensionManager.js';
import {
  ExtensionSettingScope,
  getScopedEnvContents,
  updateSetting,
  type ExtensionSetting,
} from '@organizaone/o1-code-core/extension/extensionSettings.js';
import { stripAnsiAndControl } from '@organizaone/o1-code-core/utils/textUtils.js';
import { t } from '../../../../i18n/index.js';
import { useKeypress } from '../../../hooks/useKeypress.js';
import { useTerminalSize } from '../../../hooks/useTerminalSize.js';
import { theme } from '../../../semantic-colors.js';
import { SelectionDialog } from '../../shared/SelectionDialog.js';
import { TextInput } from '../../shared/TextInput.js';
import type { StatusMessage } from '../ExtensionsManagerDialog.js';

interface PluginSettingsViewProps {
  extension: Extension;
  isActive: boolean;
  onExit: () => void;
  onReload: () => void;
  onStatus: (status: StatusMessage | null) => void;
  availableTerminalHeight?: number;
}

interface SettingValue {
  configured: boolean;
  value?: string;
}

type ScopedValues = Record<string, SettingValue>;
type SettingsSnapshot = Record<ExtensionSettingScope, ScopedValues>;

function settingMetadata(
  settings: readonly ExtensionSetting[],
  contents: Record<string, string>,
): ScopedValues {
  return Object.fromEntries(
    settings.map((setting) => {
      const configured = Object.hasOwn(contents, setting.envVar);
      return [
        setting.envVar,
        {
          configured,
          ...(!setting.sensitive && configured
            ? { value: contents[setting.envVar] }
            : {}),
        },
      ];
    }),
  );
}

const maskSecret = (text: string): string =>
  '*'.repeat(Array.from(text).length);

// Preserve the buffer and cursor offsets while preventing stored controls from
// reaching the terminal; removing them here would shift the software cursor.
const displayValue = (text: string): string =>
  Array.from(text, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 && code !== 9 && code !== 10) ||
      (code >= 127 && code <= 159)
      ? '?'
      : character;
  }).join('');

export function PluginSettingsView({
  extension,
  isActive,
  onExit,
  onReload,
  onStatus,
  availableTerminalHeight,
}: PluginSettingsViewProps) {
  const { columns, rows } = useTerminalSize();
  const width = Math.max(1, Math.min(columns - 4, 100) - 4);
  const budget = Math.max(1, availableTerminalHeight ?? rows - 10);
  const settings = useMemo(
    () => extension.config.settings ?? [],
    [extension.config.settings],
  );
  const [scope, setScope] = useState(ExtensionSettingScope.USER);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
  const [highlighted, setHighlighted] = useState<string>();
  const [editing, setEditing] = useState<ExtensionSetting>();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [validation, setValidation] = useState<string>();
  const [revision, setRevision] = useState(0);
  const mounted = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const readScope = async (settingScope: ExtensionSettingScope) =>
      settingMetadata(
        settings,
        await getScopedEnvContents(
          extension.config,
          extension.id,
          settingScope,
        ),
      );
    void Promise.all([
      readScope(ExtensionSettingScope.USER),
      readScope(ExtensionSettingScope.WORKSPACE),
    ]).then(
      ([user, workspace]) => {
        if (cancelled) return;
        setSnapshot({ user, workspace });
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setSnapshot(undefined);
        setLoading(false);
        setFailed(true);
        onStatus({ type: 'error', text: t('Could not load plugin settings.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [extension.config, extension.id, settings, revision, onStatus]);

  const resolved = useCallback(
    (setting: ExtensionSetting) => {
      const own = snapshot?.[scope][setting.envVar];
      const inherited =
        scope === ExtensionSettingScope.WORKSPACE && !own?.configured;
      const effective = inherited ? snapshot?.user[setting.envVar] : own;
      return { effective, inherited: inherited && !!effective?.configured };
    },
    [scope, snapshot],
  );
  const statusFor = (setting: ExtensionSetting): string => {
    const { effective, inherited } = resolved(setting);
    if (inherited) return t('Inherited from user settings');
    return effective?.configured ? t('Configured') : t('Not configured');
  };
  const scopeLabel =
    scope === ExtensionSettingScope.USER ? t('User') : t('Project');

  const save = async (submittedValue: string) => {
    if (!editing || saving.current || !isActive) return;
    if (editing.sensitive && submittedValue.length === 0) {
      setValidation(t('Enter a replacement value.'));
      return;
    }
    const setting = editing;
    saving.current = true;
    setBusy(true);
    onStatus(null);
    setValidation(undefined);
    if (setting.sensitive) setValue('');
    try {
      await updateSetting(
        extension.config,
        extension.id,
        setting.envVar,
        async () => submittedValue,
        scope,
      );
    } catch {
      if (mounted.current) {
        onStatus({
          type: 'error',
          text: t(
            'Could not save plugin setting. Check secure storage and try again.',
          ),
        });
      }
      return;
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
    if (!mounted.current) return;
    setEditing(undefined);
    setValue('');
    setRevision((previous) => previous + 1);
    onStatus({
      type: 'success',
      text: t('Plugin setting saved. Restart the application to apply it.'),
    });
    onReload();
  };

  useKeypress(
    (key) => {
      if (saving.current) return;
      if (key.name === 'escape') {
        if (editing) {
          setEditing(undefined);
          setValue('');
          setValidation(undefined);
          onStatus(null);
        } else onExit();
      } else if (key.name === 'tab' && !editing) {
        onStatus(null);
        setScope((previous) =>
          previous === ExtensionSettingScope.USER
            ? ExtensionSettingScope.WORKSPACE
            : ExtensionSettingScope.USER,
        );
      }
    },
    { isActive },
  );

  const title = t('Settings for {{name}}', {
    name: stripAnsiAndControl(extension.displayName ?? extension.name),
  });
  if (loading || failed || settings.length === 0) {
    return (
      <Box
        width={width}
        height={Math.min(budget, 2)}
        flexDirection="column"
        overflow="hidden"
      >
        <Text bold color={theme.text.accent} wrap="truncate-end">
          {title}
        </Text>
        <Text
          color={failed ? theme.status.error : theme.text.secondary}
          wrap="truncate-end"
        >
          {loading
            ? t('Loading plugin settings...')
            : failed
              ? t('Could not load plugin settings.')
              : t('This plugin has no settings.')}
        </Text>
      </Box>
    );
  }

  if (editing) {
    const indicatorRows = budget >= 4 ? 2 : 0;
    const headerRows = budget >= 6 ? 2 : budget >= 5 ? 1 : 0;
    const showDescription = budget >= 9;
    const showSecretHint = budget >= 10 && !!editing.sensitive;
    const showFooter = budget >= 2;
    const inputHeight = Math.max(
      1,
      Math.min(
        3,
        budget -
          headerRows -
          Number(showDescription) -
          Number(showSecretHint) -
          Number(showFooter) -
          indicatorRows -
          Number(!!validation),
      ),
    );
    return (
      <Box
        width={width}
        height={Math.min(budget, 10)}
        flexDirection="column"
        overflow="hidden"
      >
        {headerRows > 0 && (
          <Text bold color={theme.text.accent} wrap="truncate-end">
            {stripAnsiAndControl(editing.name)}
          </Text>
        )}
        {headerRows > 1 && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {t('Scope: {{scope}}', { scope: scopeLabel })} ·{' '}
            {statusFor(editing)}
          </Text>
        )}
        {showDescription && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {stripAnsiAndControl(editing.description)}
          </Text>
        )}
        {showSecretHint && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {t('Enter a replacement; the saved secret is never displayed.')}
          </Text>
        )}
        <TextInput
          key={`${scope}:${editing.envVar}`}
          value={value}
          onChange={(text) => {
            setValue(text);
            setValidation(undefined);
          }}
          onSubmit={(text) => {
            void save(text);
          }}
          inputWidth={Math.max(1, width - 3)}
          initialCursorOffset={Array.from(value).length}
          height={inputHeight}
          showScrollIndicator={indicatorRows > 0}
          allowExternalEditor={!editing.sensitive}
          validationErrors={validation ? [validation] : []}
          mask={editing.sensitive ? maskSecret : displayValue}
          isActive={isActive && !busy}
        />
        {showFooter && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {busy
              ? t('Saving plugin setting...')
              : t('Enter save · Esc cancel')}
          </Text>
        )}
      </Box>
    );
  }

  return (
    <SelectionDialog<string>
      embedded
      isActive={isActive}
      availableWidth={width}
      availableTerminalHeight={budget}
      title={title}
      subtitle={t('Scope: {{scope}}', { scope: scopeLabel })}
      items={settings.map((setting) => ({
        key: setting.envVar,
        value: setting.envVar,
        label: `${stripAnsiAndControl(setting.name)} · ${statusFor(setting)}`,
        description: [
          stripAnsiAndControl(setting.description),
          setting.sensitive
            ? t('Sensitive value hidden')
            : stripAnsiAndControl(resolved(setting).effective?.value ?? ''),
        ]
          .filter(Boolean)
          .join('\n'),
      }))}
      currentValue=""
      initialValue={highlighted ?? settings[0]?.envVar ?? ''}
      onHighlight={setHighlighted}
      onSelect={(envVar) => {
        if (!isActive) return;
        const setting = settings.find((entry) => entry.envVar === envVar);
        if (!setting) return;
        onStatus(null);
        setValidation(undefined);
        setValue(
          setting.sensitive ? '' : (resolved(setting).effective?.value ?? ''),
        );
        setEditing(setting);
      }}
      textNavigation
      footer={t('↑↓ select · Enter edit · Tab user/project · Esc back')}
    />
  );
}
