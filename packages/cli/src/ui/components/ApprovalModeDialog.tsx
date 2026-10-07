/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { APPROVAL_MODES } from '@organizaone/o1-code-core/config/approval-mode.js';
import type { ApprovalMode } from '@organizaone/o1-code-core/config/approval-mode.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  getScopeItems,
  getScopeMessageForSetting,
  SCOPE_LABELS,
} from '../../config/dialogScopeUtils.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';
import {
  formatApprovalModeDescription,
  formatApprovalModeName,
} from '../utils/approvalModeDisplay.js';
import { SelectionDialog } from './shared/SelectionDialog.js';

interface ApprovalModeDialogProps {
  onSelect: (mode: ApprovalMode | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  currentMode: ApprovalMode;
  availableTerminalHeight?: number;
}

export function ApprovalModeDialog({
  onSelect,
  settings,
  currentMode,
  availableTerminalHeight,
}: ApprovalModeDialogProps): React.JSX.Element {
  const [selectedScope, setSelectedScope] = useState(SettingScope.User);
  const [highlightedMode, setHighlightedMode] = useState(currentMode);
  const [panel, setPanel] = useState<'mode' | 'scope'>('mode');
  const otherScopeMessage = getScopeMessageForSetting(
    'tools.approvalMode',
    selectedScope,
    settings,
  );
  const workspaceOverridesUser =
    selectedScope === SettingScope.User &&
    settings.workspace.settings.tools?.approvalMode !== undefined;

  useKeypress(
    (key) => {
      if (key.name === 'tab')
        setPanel((previous) => (previous === 'mode' ? 'scope' : 'mode'));
      if (key.name === 'escape') onSelect(undefined, selectedScope);
    },
    { isActive: true },
  );

  if (panel === 'scope') {
    return (
      <SelectionDialog
        key="scope"
        title={`${t('Tool Approval Mode')} › ${t('Apply To')}`}
        subtitle={otherScopeMessage}
        items={getScopeItems().map((item) => ({
          key: item.value,
          value: item.value,
          label: t(item.label),
          description: t(item.label),
        }))}
        initialValue={selectedScope}
        currentValue={selectedScope}
        onHighlight={setSelectedScope}
        onSelect={(scope) => {
          setSelectedScope(scope);
          setPanel('mode');
        }}
        footer={t('(Use Enter to apply scope, Tab to go back)')}
        availableTerminalHeight={availableTerminalHeight}
      />
    );
  }

  return (
    <SelectionDialog
      key="mode"
      title={t('Tool Approval Mode')}
      subtitle={`${t(selectedScope === SettingScope.Workspace ? SCOPE_LABELS[SettingScope.Workspace] : SCOPE_LABELS[SettingScope.User])} ${otherScopeMessage}`.trim()}
      items={APPROVAL_MODES.map((mode) => ({
        key: mode,
        value: mode,
        label: formatApprovalModeName(mode),
        description: formatApprovalModeDescription(mode),
      }))}
      initialValue={highlightedMode}
      currentValue={currentMode}
      onHighlight={setHighlightedMode}
      onSelect={(mode) => onSelect(mode, selectedScope)}
      warning={
        workspaceOverridesUser
          ? t(
              'Workspace approval mode exists and takes priority. User-level change will have no effect.',
            )
          : undefined
      }
      footer={t('(Use Enter to select, Tab to configure scope)')}
      availableTerminalHeight={availableTerminalHeight}
    />
  );
}
