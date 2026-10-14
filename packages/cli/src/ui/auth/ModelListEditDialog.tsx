/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import {
  buildInstallPlan,
  findExistingProviderModels,
  getDefaultModelIds,
  getModelsForProviderProtocol,
} from '@organizaone/o1-code-core/providers/provider-config.js';
import { applyProviderInstallPlan } from '@organizaone/o1-code-core/providers/install.js';
import {
  organizaoneLoginProvider,
  organizaoneProvider,
} from '@organizaone/o1-code-core/providers/presets/organizaone.js';
import type {
  ProviderConfig,
  ProviderSetupInputs,
} from '@organizaone/o1-code-core/providers/types.js';
import { createLoadedSettingsAdapter } from '../../config/loadedSettingsAdapter.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { t } from '../../i18n/index.js';
import { organizaOneAccountCredential } from './organizaone-account.js';
import { ProviderSetupSteps } from './ProviderSetupSteps.js';
import { useProviderSetupFlow } from './useProviderSetupFlow.js';

export interface ModelListEditDialogProps {
  /** Back to the model picker without saving. */
  onClose: () => void;
  /** The edited list was installed. */
  onSaved: () => void;
}

/**
 * The model list of the signed-in OrganizaOne account, edited the way the
 * sign-in wizard edits it: the provider is asked for its list on open, ctrl+r
 * asks again, and models are added or removed by checkbox or by typing.
 */
export function ModelListEditDialog({
  onClose,
  onSaved,
}: ModelListEditDialogProps): React.JSX.Element {
  const config = useConfig();
  const settings = useSettings();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isKeyValid, setIsKeyValid] = useState(false);
  // One keystroke can reach the dialog twice before the picker unmounts it.
  const closeLatchRef = useRef(false);
  const submitInFlightRef = useRef(false);

  const selection = {
    authType: settings.merged.security?.auth?.selectedType,
    id: settings.merged.model?.name,
    baseUrl: settings.merged.model?.baseUrl,
  };

  const submitEdit = useCallback(
    async (providerConfig: ProviderConfig, inputs: ProviderSetupInputs) => {
      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      // The sign-in token keeps its expiry: losing it would end the account
      // login at the next check of the credential.
      const credential = organizaOneAccountCredential();
      const withTokenExtras: ProviderSetupInputs = {
        ...inputs,
        ...(credential?.expiresAt !== undefined
          ? {
              credentialExtras: {
                expiresAt: credential.expiresAt,
                ...(credential.deviceName
                  ? { deviceName: credential.deviceName }
                  : {}),
              },
            }
          : {}),
      };
      try {
        const plan = buildInstallPlan(
          providerConfig,
          withTokenExtras,
          getModelsForProviderProtocol(
            settings.merged.modelProviders,
            inputs.protocol ?? providerConfig.protocol,
            settings.merged.providerProtocol,
          ),
          selection,
        );
        await applyProviderInstallPlan(plan, {
          settings: createLoadedSettingsAdapter(settings),
          reloadModelProviders: (mp) => config.reloadModelProvidersConfig(mp),
          syncAuthState: (authType, modelId, baseUrl) =>
            config.syncModelSelection(authType, modelId, baseUrl),
          refreshAuth: (authType) => config.refreshAuth(authType),
        });
      } catch (error) {
        submitInFlightRef.current = false;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        return;
      }
      onSaved();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selection is rebuilt from the same settings fields every render
    [config, onSaved, settings],
  );

  const flow = useProviderSetupFlow(
    submitEdit,
    settings.merged.modelProviders,
    settings.merged.providerProtocol,
    selection,
  );

  useEffect(() => {
    const saved = findExistingProviderModels(
      organizaoneLoginProvider,
      settings.merged.modelProviders,
      settings.merged.providerProtocol,
      selection,
    );
    const builtInIds = new Set(getDefaultModelIds(organizaoneLoginProvider));
    flow.start(
      organizaoneLoginProvider,
      saved?.protocol ?? config.getContentGeneratorConfig?.()?.authType,
      undefined,
      saved
        ? saved.models
            .map((model) => model.id)
            .filter((id) => !builtInIds.has(id))
        : undefined,
      {
        startAt: 'models',
        validateModelIds: (ids) => {
          const active = config.getModel();
          return active && !ids.includes(active)
            ? t(
                "'{{model}}' is the current model. Keep it in the list, or switch models with /model first.",
                { model: active },
              )
            : null;
        },
      },
    );
    const credential = organizaOneAccountCredential();
    if (credential?.apiKey) flow.changeApiKey(credential.apiKey);
    // One flow per open: the account and its saved list are fixed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeypress(
    (key) => {
      if (key.name !== 'escape' || closeLatchRef.current) return;
      closeLatchRef.current = true;
      onClose();
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle={glyphs().borderStyle}
      borderColor={extendedTheme.ui.brand}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box flexDirection="row">
        <Box flexGrow={1} minWidth={0}>
          <Text wrap="truncate-end">
            <Text bold>{t('Edit model list')}</Text>
            <Text color={extendedTheme.text.muted}>
              {` › ${t(organizaoneProvider.label)} › ${t('Model IDs')}`}
            </Text>
          </Text>
        </Box>
        {isKeyValid && (
          <Box flexShrink={0} marginLeft={1}>
            <Text color={theme.status.success}>
              {t('key valid')} {glyphs().done}
            </Text>
          </Box>
        )}
      </Box>
      <ProviderSetupSteps
        flow={flow}
        showKeyStatus={false}
        onKeyStatusChange={setIsKeyValid}
        minVisibleModelRows={6}
      />
      {(flow.state.apiKeyError || errorMessage) && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>
            {flow.state.apiKeyError || errorMessage}
          </Text>
        </Box>
      )}
    </Box>
  );
}
