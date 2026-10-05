/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Text } from 'ink';
import Link from 'ink-link';
import { DescriptiveRadioButtonSelect } from '../components/shared/DescriptiveRadioButtonSelect.js';
import { TextInput } from '../components/shared/TextInput.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { abbreviateKey, maskKey } from './mask-key.js';
import { glyphs } from '../glyphs.js';
import { ICON } from '../constants.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';
import {
  AuthType,
  checkProviderKey,
  requiresApiKey,
} from '@organizaone/o1-code-core';
import { Spinner } from '../components/RespondingSpinner.js';
import type {
  ModelWireApi,
  ProviderConfig,
  ProviderKeyCheck,
  ProviderProtocol,
  BaseUrlOption,
  ModelSpec,
} from '@organizaone/o1-code-core';
import type { ProviderSetupFlow } from './useProviderSetupFlow.js';
import { SignInStep } from './SignInStep.js';
import { normalizeModelIds } from './useAuth.js';
import { AppContext } from '../contexts/AppContext.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NAV_HINT_SELECT = () => (
  <Box marginTop={1}>
    <Text color={theme?.text?.secondary}>
      {t('Enter to select, ↑↓ to navigate, Esc to go back')}
    </Text>
  </Box>
);

const NAV_HINT_INPUT = () => (
  <Box marginTop={1}>
    <Text color={theme.text.secondary}>
      {t('Enter to submit, Esc to go back')}
    </Text>
  </Box>
);

function resolveDocumentationUrl(
  config: ProviderConfig,
  baseUrl: string,
): string | undefined {
  if (!config.documentationUrl) return undefined;
  return typeof config.documentationUrl === 'function'
    ? config.documentationUrl(baseUrl)
    : config.documentationUrl;
}

// ---------------------------------------------------------------------------
// Step: Select BaseURL from options
// ---------------------------------------------------------------------------

function BaseUrlSelectStep({
  config,
  flow,
}: {
  config: ProviderConfig;
  flow: ProviderSetupFlow;
}): React.JSX.Element {
  const options = config.baseUrl as BaseUrlOption[];
  const items = options.map((opt) => ({
    key: opt.id,
    title: t(opt.label),
    label: t(opt.label),
    description: <Text color={theme.text.secondary}>{opt.url}</Text>,
    value: opt.url,
  }));

  return (
    <>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={items}
          initialIndex={flow.state.baseUrlOptionIndex}
          onSelect={flow.selectBaseUrl}
          onHighlight={flow.highlightBaseUrl}
          itemGap={1}
        />
      </Box>
      <NAV_HINT_SELECT />
    </>
  );
}

// ---------------------------------------------------------------------------
// Step: Free-form BaseURL input (custom provider)
// ---------------------------------------------------------------------------

function BaseUrlInputStep({
  flow,
  documentationUrl,
  onThisMachine = false,
}: {
  flow: ProviderSetupFlow;
  documentationUrl?: string;
  /** A server on this machine: a port is enough. */
  onThisMachine?: boolean;
}): React.JSX.Element {
  return (
    <Box marginTop={1} flexDirection="column">
      <Box marginTop={1}>
        <Text color={theme.text.primary}>
          {onThisMachine
            ? t('Port of the server on this machine, or its full URL.')
            : t('Enter the API endpoint for this protocol.')}
        </Text>
      </Box>
      <Box marginTop={1}>
        <TextInput
          key="base-url-input"
          value={flow.state.baseUrl}
          onChange={flow.changeBaseUrl}
          onSubmit={flow.submitBaseUrl}
          placeholder={
            onThisMachine
              ? '8080'
              : flow.state.baseUrlPlaceholder || 'https://api.openai.com/v1'
          }
        />
      </Box>
      {flow.state.baseUrlError && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{flow.state.baseUrlError}</Text>
        </Box>
      )}
      {documentationUrl && (
        <Box marginTop={1}>
          <Link url={documentationUrl} fallback={false}>
            <Text color={theme.text.link}>{t('Documentation')}</Text>
          </Link>
        </Box>
      )}
      <NAV_HINT_INPUT />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step: API Key input
// ---------------------------------------------------------------------------

function ApiKeyStep({
  config,
  flow,
}: {
  config: ProviderConfig;
  flow: ProviderSetupFlow;
}): React.JSX.Element {
  const docUrl = resolveDocumentationUrl(config, flow.state.baseUrl);
  // The OrganizaOne proxy records the app's version from the model list call.
  const clientVersion = useContext(AppContext)?.version;
  const [checking, setChecking] = useState(false);
  const checkRef = useRef<AbortController | null>(null);
  // The last key the provider refused. A key without permission to list
  // models can still work for chat, so enter again on it moves on unverified.
  const refusedKeyRef = useRef<string | null>(null);
  useEffect(() => () => checkRef.current?.abort(), []);

  // Ask the provider before moving on (spec §6.6): a refused key stays here
  // with the reason; an accepted one moves on with the models it serves.
  // Takes what the input submits: a paste and enter in one burst reach the
  // input before the flow state.
  const submit = (value: string) => {
    // One question at a time: a second enter while the provider answers is
    // dropped, even from a key handler that has not caught up with the
    // input going inactive.
    if (checkRef.current && !checkRef.current.signal.aborted) return;
    const key = value.trim();
    const localError = !key
      ? true
      : Boolean(config.validateApiKey?.(key, flow.state.baseUrl));
    if (localError) {
      flow.submitApiKey(value);
      return;
    }
    if (key === refusedKeyRef.current) {
      flow.setKeyCheck({ status: 'unavailable' });
      flow.submitApiKey(key);
      return;
    }
    checkRef.current?.abort();
    const controller = new AbortController();
    checkRef.current = controller;
    setChecking(true);
    void checkProviderKey({
      protocol: protocolOf(flow.state.protocol),
      baseUrl: flow.state.baseUrl,
      apiKey: key,
      staticModels: config.models ?? [],
      signal: controller.signal,
      clientVersion,
    }).then((result) => {
      if (controller.signal.aborted) return;
      checkRef.current = null;
      setChecking(false);
      if (result.status === 'rejected') {
        refusedKeyRef.current = key;
        flow.rejectApiKey(rejectedKeyMessage(result.httpStatus));
        return;
      }
      flow.setKeyCheck(result);
      flow.submitApiKey(key);
    });
  };

  return (
    <Box marginTop={1} flexDirection="column">
      {docUrl && (
        <Box marginTop={1}>
          <Link url={docUrl} fallback={false}>
            <Text color={theme.text.link}>
              {t('Documentation')}: {docUrl}
            </Text>
          </Link>
        </Box>
      )}
      <Box marginTop={1}>
        <TextInput
          key="api-key-input"
          value={flow.state.apiKey}
          onChange={flow.changeApiKey}
          onSubmit={submit}
          placeholder={config.apiKeyPlaceholder ?? 'sk-...'}
          mask={maskKey}
          isActive={!checking}
        />
      </Box>
      <Box marginTop={1}>
        {checking ? (
          <Box>
            <Box marginRight={1}>
              <Spinner color={extendedTheme.ui.brand} />
            </Box>
            <Text color={extendedTheme.text.muted}>
              {t('checking the key…')}
            </Text>
          </Box>
        ) : (
          <Text color={extendedTheme.text.muted}>
            {t(
              'the key is saved in ~/.o1-code/credentials/, for your user only',
            )}
          </Text>
        )}
      </Box>
      {flow.state.apiKeyError && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{flow.state.apiKeyError}</Text>
        </Box>
      )}
      <NAV_HINT_INPUT />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step: Model IDs input
// ---------------------------------------------------------------------------

const MODEL_DESCRIPTION_COLUMN = 28;
const MODALITY_DISPLAY_ORDER = ['image', 'video', 'audio', 'pdf'] as const;
export const MODEL_CUSTOM_INPUT_FOCUS_INDEX = -2;
export const MODEL_SEARCH_INPUT_FOCUS_INDEX = -1;
export const MAX_MODELS_TO_SHOW = 8;

export interface ModelOption {
  key: string;
  value: string;
  label: string;
}

type ModelRecommendationSource = 'provider' | 'fallback';

export function formatModelOptionLabel(model: ModelSpec): string {
  const details: string[] = [];
  if (model.contextWindowSize) {
    details.push(`${model.contextWindowSize.toLocaleString('en-US')} tokens`);
  }
  if (model.enableThinking) {
    details.push('thinking');
  }
  const modalities = MODALITY_DISPLAY_ORDER.filter(
    (name) => model.modalities?.[name],
  );
  details.push(['text', ...modalities].join('/'));
  const suffix = details.length > 0 ? ` ${details.join(', ')}` : '';
  return `${model.id.padEnd(MODEL_DESCRIPTION_COLUMN)}${suffix}`;
}

export function modelOptionSearchText(item: ModelOption): string {
  return `${item.key} ${item.label} ${item.value}`.toLowerCase();
}

function uniqueModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function mergeModelIds(
  customModelIdsText: string,
  selectedRecommendationKeys: string[],
): string[] {
  // Checked recommendations lead: models[0] becomes the active model on
  // first-time setup, and checked ids are catalog-served while free-form ids
  // can include defaults the account's catalog does not serve.
  return uniqueModelIds([
    ...selectedRecommendationKeys,
    ...normalizeModelIds(customModelIdsText),
  ]);
}

function orderSelectedModelKeys(
  selectedKeys: Iterable<string>,
  modelOptions: ModelOption[],
  builtInModelIds: string[],
): string[] {
  const selected = new Set(selectedKeys);
  const builtIns = builtInModelIds.filter((id) => selected.has(id));
  const builtInSet = new Set(builtIns);
  return [
    ...builtIns,
    ...modelOptions
      .map((item) => item.key)
      .filter((id) => selected.has(id) && !builtInSet.has(id)),
  ];
}

function getRecommendedSelections(
  selectedModelIds: string[],
  modelOptions: ModelOption[],
  builtInModelIds: string[],
): string[] {
  const selectedSet = new Set(selectedModelIds);
  const servedIds = new Set(modelOptions.map((item) => item.key));
  return builtInModelIds.filter(
    (id) => selectedSet.has(id) && servedIds.has(id),
  );
}

function getCustomModelIdsText(
  selectedModelIds: string[],
  selectedRecommendationKeys: string[],
): string {
  const recommendedSelections = new Set(selectedRecommendationKeys);
  return selectedModelIds
    .filter((id) => !recommendedSelections.has(id))
    .join(', ');
}

function ModelIdsStep({
  config,
  flow,
  models = config.models ?? [],
  recommendationSource,
  syncChangesToFlow = true,
  preselect,
  keyVerified = false,
  draftModelIds,
  onDraftChange,
}: {
  config: ProviderConfig;
  flow: ProviderSetupFlow;
  models?: ModelSpec[];
  recommendationSource?: ModelRecommendationSource;
  syncChangesToFlow?: boolean;
  /**
   * The selection being edited when the step was mounted again (ctrl+r):
   * it starts there instead of from the flow, and is not preselected.
   */
  draftModelIds?: string[];
  /** Hears every edit when changes are not synced to the flow. */
  onDraftChange?: (modelIds: string[]) => void;
  /** Models to check on a first setup, when nothing was chosen before. */
  preselect?: string[];
  /** The provider accepted the key while listing its models. */
  keyVerified?: boolean;
}): React.JSX.Element {
  const defaultIds = config.models?.map((m) => m.id).join(', ') ?? '';
  const hasSelectableModels = models.length > 0;
  const selectedModelIds = useMemo(
    () => draftModelIds ?? normalizeModelIds(flow.state.modelIds),
    [draftModelIds, flow.state.modelIds],
  );
  const modelOptions = useMemo<ModelOption[]>(
    () =>
      models.map((model) => ({
        key: model.id,
        value: model.id,
        label: formatModelOptionLabel(model),
      })),
    [models],
  );
  const builtInModelIds = useMemo(
    () => config.models?.map((model) => model.id) ?? [],
    [config.models],
  );
  const [focusedModelIndex, setFocusedModelIndex] = useState(
    MODEL_CUSTOM_INPUT_FOCUS_INDEX,
  );
  // A first setup arrives with the built-in models filled in, or nothing:
  // with the provider's list at hand, check what it serves instead, so
  // built-in models it does not serve are not saved unseen. A selection the
  // person made before is kept as it is.
  const [usePreselect] = useState(
    () =>
      preselect !== undefined &&
      draftModelIds === undefined &&
      (selectedModelIds.length === 0 ||
        (flow.state.firstSetup === true &&
          selectedModelIds.length === builtInModelIds.length &&
          builtInModelIds.every((id) => selectedModelIds.includes(id)))),
  );
  const initialModelIds =
    usePreselect && preselect ? preselect : selectedModelIds;
  const [selectedRecommendationKeys, setSelectedRecommendationKeys] = useState(
    () =>
      // A draft carried over a reload was checked on the list: keep every
      // model the provider still serves checked, not only the built-ins.
      usePreselect || draftModelIds !== undefined
        ? orderSelectedModelKeys(initialModelIds, modelOptions, builtInModelIds)
        : getRecommendedSelections(
            initialModelIds,
            modelOptions,
            builtInModelIds,
          ),
  );
  const [customModelIdsText, setCustomModelIdsText] = useState(() =>
    getCustomModelIdsText(initialModelIds, selectedRecommendationKeys),
  );
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const filteredModelOptions = useMemo(() => {
    const normalizedQuery = modelSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return modelOptions;
    }
    return modelOptions.filter((item) =>
      modelOptionSearchText(item).includes(normalizedQuery),
    );
  }, [modelOptions, modelSearchQuery]);
  const recommendedScrollOffset =
    focusedModelIndex < 0
      ? 0
      : Math.max(
          0,
          Math.min(
            focusedModelIndex - MAX_MODELS_TO_SHOW + 1,
            filteredModelOptions.length - MAX_MODELS_TO_SHOW,
          ),
        );
  const visibleModelOptions = filteredModelOptions.slice(
    recommendedScrollOffset,
    recommendedScrollOffset + MAX_MODELS_TO_SHOW,
  );

  const syncModelIds = useCallback(
    (customText: string, recommendationKeys: string[]) => {
      if (syncChangesToFlow) {
        flow.changeModelIds(
          mergeModelIds(customText, recommendationKeys).join(', '),
        );
      } else {
        // Edits commit only on Enter here, but a stale submit error must
        // still clear on edit, as changeModelIds does on the synced path.
        flow.clearModelIdsError();
        onDraftChange?.(mergeModelIds(customText, recommendationKeys));
      }
    },
    [flow, syncChangesToFlow, onDraftChange],
  );

  const handleSubmitModelIds = useCallback(() => {
    flow.submitModelIds({
      modelIds: mergeModelIds(customModelIdsText, selectedRecommendationKeys),
    });
  }, [customModelIdsText, flow, selectedRecommendationKeys]);

  const handleCustomModelIdsChange = useCallback(
    (value: string) => {
      setCustomModelIdsText(value);
      syncModelIds(value, selectedRecommendationKeys);
    },
    [selectedRecommendationKeys, syncModelIds],
  );

  const toggleRecommendationAtIndex = useCallback(
    (index: number) => {
      const item = filteredModelOptions[index];
      if (!item) {
        return;
      }

      const nextSet = new Set(selectedRecommendationKeys);
      if (nextSet.has(item.key)) {
        nextSet.delete(item.key);
      } else {
        nextSet.add(item.key);
      }
      const nextKeys = orderSelectedModelKeys(
        nextSet,
        modelOptions,
        builtInModelIds,
      );
      setSelectedRecommendationKeys(nextKeys);
      syncModelIds(customModelIdsText, nextKeys);
    },
    [
      customModelIdsText,
      filteredModelOptions,
      builtInModelIds,
      modelOptions,
      selectedRecommendationKeys,
      syncModelIds,
    ],
  );

  useKeypress(
    (key) => {
      if (focusedModelIndex < 0) {
        return;
      }

      if (key.name === 'tab') {
        setFocusedModelIndex(MODEL_CUSTOM_INPUT_FOCUS_INDEX);
        return;
      }

      if (key.name === 'up') {
        setFocusedModelIndex((index) =>
          index <= 0 ? MODEL_SEARCH_INPUT_FOCUS_INDEX : index - 1,
        );
        return;
      }

      if (key.name === 'down') {
        setFocusedModelIndex((index) =>
          Math.max(0, Math.min(index + 1, filteredModelOptions.length - 1)),
        );
        return;
      }

      if (key.name === 'space' || key.sequence === ' ') {
        toggleRecommendationAtIndex(focusedModelIndex);
        return;
      }

      if (key.name === 'return') {
        handleSubmitModelIds();
        return;
      }
    },
    { isActive: hasSelectableModels && focusedModelIndex >= 0 },
  );

  if (hasSelectableModels) {
    return (
      <Box marginTop={1} flexDirection="column">
        {keyVerified && (
          <Box marginTop={1}>
            <Text color={theme.status.success}>
              {`${glyphs().done} ${t('key valid')}`}
            </Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {t(
              'Enter model IDs directly. Use commas to configure multiple models.',
            )}
          </Text>
        </Box>
        <Box marginTop={1}>
          <TextInput
            key="model-ids-input"
            value={customModelIdsText}
            onChange={handleCustomModelIdsChange}
            onSubmit={handleSubmitModelIds}
            onDown={() => {
              setFocusedModelIndex(MODEL_SEARCH_INPUT_FOCUS_INDEX);
            }}
            onTab={() => {
              setFocusedModelIndex(MODEL_SEARCH_INPUT_FOCUS_INDEX);
            }}
            placeholder="model-id"
            height={3}
            isActive={focusedModelIndex === MODEL_CUSTOM_INPUT_FOCUS_INDEX}
          />
        </Box>
        <Box marginTop={0}>
          <Text color={theme.text.secondary}>
            {t(
              recommendationSource === 'provider'
                ? 'Checked models are applied on submit but not copied into the input.'
                : 'Checked recommended models are applied on submit but not copied into the input.',
            )}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {recommendationSource === 'provider'
              ? t('Models · from the provider · {{count}} checked', {
                  count: String(selectedRecommendationKeys.length),
                })
              : t('Recommended models')}
            {recommendationSource === 'fallback' &&
              t(' · provider list unavailable, showing built-ins')}
          </Text>
        </Box>
        <Box marginTop={0} flexDirection="column">
          <Text color={theme.text.secondary}>{t('Search')}</Text>
          <TextInput
            key="model-search-input"
            value={modelSearchQuery}
            onChange={setModelSearchQuery}
            onSubmit={handleSubmitModelIds}
            onUp={() => setFocusedModelIndex(MODEL_CUSTOM_INPUT_FOCUS_INDEX)}
            onDown={() => {
              if (filteredModelOptions.length > 0) {
                setFocusedModelIndex(0);
              }
            }}
            onTab={() => {
              if (filteredModelOptions.length > 0) {
                setFocusedModelIndex(0);
              }
            }}
            placeholder="search"
            isActive={focusedModelIndex === MODEL_SEARCH_INPUT_FOCUS_INDEX}
          />
        </Box>
        <Box marginTop={1} flexDirection="column">
          {visibleModelOptions.length > 0 ? (
            visibleModelOptions.map((item, visibleIndex) => {
              const modelIndex = recommendedScrollOffset + visibleIndex;
              const isFocused = focusedModelIndex === modelIndex;
              const isSelected = selectedRecommendationKeys.includes(item.key);
              // Selection style of spec §6.3/§6.6: the pointer marks focus,
              // the green dot marks a checked model.
              return (
                <Box key={item.key} alignItems="flex-start">
                  <Box minWidth={2} flexShrink={0}>
                    <Text color={extendedTheme.ui.brand}>
                      {isFocused ? glyphs().prompt : ' '}
                    </Text>
                  </Box>
                  <Box minWidth={2} flexShrink={0}>
                    <Text
                      color={
                        isSelected
                          ? theme.status.success
                          : extendedTheme.text.muted
                      }
                    >
                      {isSelected ? glyphs().dot : glyphs().hollow}
                    </Text>
                  </Box>
                  <Box flexGrow={1}>
                    <Text
                      color={
                        isFocused ? theme.text.primary : theme.text.secondary
                      }
                      bold={isFocused}
                    >
                      {item.label}
                    </Text>
                  </Box>
                </Box>
              );
            })
          ) : (
            <Text color={theme.text.secondary}>
              {t(
                recommendationSource === 'provider'
                  ? 'No models match.'
                  : 'No recommended models match.',
              )}
            </Text>
          )}
        </Box>
        {flow.state.modelIdsError && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>{flow.state.modelIdsError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {t(
              recommendationSource === 'provider'
                ? 'Enter to submit, ↑↓/Tab to switch input, search, and models, Space to toggle models, Esc to go back'
                : 'Enter to submit, ↑↓/Tab to switch input, search, and recommendations, Space to toggle recommendations, Esc to go back',
            )}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {defaultIds
            ? t('Enter model IDs separated by commas. Examples: {{modelIds}}', {
                modelIds: defaultIds,
              })
            : t('Enter model IDs separated by commas.')}
        </Text>
      </Box>
      <Box marginTop={1}>
        <TextInput
          key="model-ids-input"
          value={flow.state.modelIds}
          onChange={flow.changeModelIds}
          onSubmit={() => flow.submitModelIds()}
          placeholder={defaultIds || 'model-id-1, model-id-2'}
        />
      </Box>
      {flow.state.modelIdsError && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{flow.state.modelIdsError}</Text>
        </Box>
      )}
      <NAV_HINT_INPUT />
    </Box>
  );
}

/** Most models to check at once on a first setup with no built-in list. */
const MAX_PRESELECTED_MODELS = 10;

function rejectedKeyMessage(httpStatus: number): string {
  return t(
    'The provider refused this key ({{status}}). Check it, or press enter again to use it anyway.',
    { status: String(httpStatus) },
  );
}

function protocolOf(authType: AuthType): ProviderProtocol {
  if (authType === AuthType.USE_ANTHROPIC) return 'anthropic';
  if (authType === AuthType.USE_GEMINI) return 'gemini';
  return 'openai';
}

/**
 * The models to check on a first setup: the provider's built-in models it
 * actually serves or, for a provider with no built-in list, everything it
 * serves when that list is short enough to be a choice.
 */
function preselectedModels(
  served: readonly ModelSpec[],
  builtIn: readonly ModelSpec[],
  onThisMachine = false,
): string[] {
  const servedIds = served.map((model) => model.id);
  // A server on this machine serves only the models its user pulled.
  if (onThisMachine) return servedIds;
  const servedBuiltIns = builtIn
    .map((model) => model.id)
    .filter((id) => servedIds.includes(id));
  if (servedBuiltIns.length > 0) return servedBuiltIns;
  return servedIds.length <= MAX_PRESELECTED_MODELS ? servedIds : [];
}

/** The models step's list, from what the provider said about the key. */
function snapshotOf(
  result: ProviderKeyCheck,
  builtInModels: ModelSpec[],
): {
  models: ModelSpec[];
  source: ModelRecommendationSource;
  verified: boolean;
} {
  if (result.status === 'ok' && result.models.length > 0) {
    return { models: result.models, source: 'provider', verified: true };
  }
  return {
    models: builtInModels,
    source: 'fallback',
    verified: result.status === 'ok',
  };
}

function DiscoveringModelIdsStep({
  config,
  flow,
}: {
  config: ProviderConfig;
  flow: ProviderSetupFlow;
}): React.JSX.Element {
  const keyCheck = flow.state.keyCheck;
  // Only a list the key step actually got is reused. A check that timed out
  // or failed on the network says nothing about the provider, so the first
  // visit asks again instead of opening on an empty list.
  const reusableCheck = keyCheck?.status === 'ok' ? keyCheck : undefined;
  // Each ctrl+r asks the provider again; the key step's answer serves the first.
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    models: ModelSpec[];
    source: ModelRecommendationSource;
    verified: boolean;
  } | null>(() =>
    reusableCheck ? snapshotOf(reusableCheck, config.models ?? []) : null,
  );
  const baseUrl = flow.state.baseUrl;
  const apiKey = flow.state.apiKey;
  const protocol = protocolOf(flow.state.protocol);
  const clientVersion = useContext(AppContext)?.version;
  // The flow object changes on every render; the check must run once per key.
  const rejectApiKeyRef = useRef(flow.rejectApiKey);
  rejectApiKeyRef.current = flow.rejectApiKey;
  const setKeyCheckRef = useRef(flow.setKeyCheck);
  setKeyCheckRef.current = flow.setKeyCheck;
  // The answer is handed to the flow, which changes `keyCheck`: an attempt
  // already answered is not asked again.
  const answeredAttemptRef = useRef<number | null>(null);
  // A reload that fails keeps the provider's list already on screen.
  const providerSnapshotRef = useRef(
    snapshot?.source === 'provider' ? snapshot : null,
  );
  const [reloadFailed, setReloadFailed] = useState(false);

  useEffect(() => {
    // The key step already got the list: nothing to fetch again.
    if (reusableCheck && attempt === 0) return;
    if (answeredAttemptRef.current === attempt) return;
    const controller = new AbortController();
    let active = true;
    const builtInModels = config.models ?? [];

    void checkProviderKey({
      protocol,
      baseUrl,
      apiKey,
      staticModels: builtInModels,
      signal: controller.signal,
      clientVersion,
    }).then((result) => {
      if (!active) return;
      // Fetching again is asked here, on a key already past its step: a
      // refusal then leaves the list as it was instead of going back.
      if (result.status === 'rejected' && attempt === 0) {
        rejectApiKeyRef.current(rejectedKeyMessage(result.httpStatus));
        return;
      }
      answeredAttemptRef.current = attempt;
      const next = snapshotOf(result, builtInModels);
      if (next.source === 'provider') {
        providerSnapshotRef.current = next;
        setReloadFailed(false);
        setSnapshot(next);
      } else if (providerSnapshotRef.current) {
        setReloadFailed(true);
        setSnapshot(providerSnapshotRef.current);
      } else {
        setSnapshot(next);
      }
      // The review reads the answer from the flow. A failed attempt says
      // nothing new about the key, so an earlier answer stands.
      if (result.status === 'ok' || !keyCheck) setKeyCheckRef.current(result);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    apiKey,
    baseUrl,
    protocol,
    config.models,
    keyCheck,
    reusableCheck,
    attempt,
    clientVersion,
  ]);

  // What the person had chosen when they asked for the list again: the new
  // step starts from it.
  const draftRef = useRef<string[] | undefined>(undefined);
  const [draftModelIds, setDraftModelIds] = useState<string[] | undefined>();

  // The list can be asked for again at any time: a provider that just
  // enabled a model, or a list that failed to load.
  const canFetchAgain = snapshot !== null;
  const listFailed =
    reloadFailed ||
    (snapshot?.source === 'fallback' && snapshot.models.length === 0);
  useKeypress(
    (key) => {
      if (key.ctrl && key.name === 'r') {
        setDraftModelIds(draftRef.current);
        setSnapshot(null);
        setAttempt((value) => value + 1);
      }
    },
    { isActive: canFetchAgain },
  );

  if (!snapshot) {
    return (
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box marginRight={1}>
            <Spinner color={extendedTheme.ui.brand} />
          </Box>
          <Text color={extendedTheme.text.muted}>{t('checking the key…')}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>{t('Esc to go back')}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {listFailed && (
        <Box marginTop={1}>
          <Text color={theme.status.warning}>
            {t(
              'The provider list could not be read · ctrl+r fetches the models again',
            )}
          </Text>
        </Box>
      )}
      <ModelIdsStep
        key={attempt}
        config={config}
        flow={flow}
        models={snapshot.models}
        recommendationSource={snapshot.source}
        syncChangesToFlow={false}
        draftModelIds={draftModelIds}
        onDraftChange={(ids) => {
          draftRef.current = ids;
        }}
        keyVerified={snapshot.verified && requiresApiKey(config)}
        preselect={
          snapshot.verified
            ? preselectedModels(
                snapshot.models,
                config.models ?? [],
                !requiresApiKey(config),
              )
            : undefined
        }
      />
      <Box marginTop={1}>
        <Text color={extendedTheme.text.muted}>
          {t('ctrl+r fetches the models again')}
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step: Advanced config
// ---------------------------------------------------------------------------

function AdvancedConfigStep({
  flow,
}: {
  flow: ProviderSetupFlow;
}): React.JSX.Element {
  const {
    focusedConfigIndex,
    thinkingEnabled,
    modalityEnabled,
    modalityImage,
    modalityVideo,
    modalityAudio,
    modalityPdf,
    contextWindowSize,
  } = flow.state;
  const checkmark = (v: boolean) => (v ? ICON.RADIO_FILLED : ICON.CIRCLE_EMPTY);
  const cursor = (index: number) => (focusedConfigIndex === index ? '›' : ' ');

  const ctxIdx = modalityEnabled ? 6 : 2;

  return (
    <Box marginTop={1} flexDirection="column">
      <Box marginTop={1}>
        <Text color={theme.text.primary}>
          {t('Optional: configure advanced generation settings.')}
        </Text>
      </Box>
      <Box marginTop={1} marginLeft={2}>
        <Text
          color={focusedConfigIndex === 0 ? theme.status.success : undefined}
        >
          {cursor(0)} {checkmark(thinkingEnabled)} {t('Enable thinking')}
        </Text>
      </Box>
      <Box marginTop={0} marginLeft={4}>
        <Text color={theme.text.secondary}>
          {t(
            'Allows the model to perform extended reasoning before responding.',
          )}
        </Text>
      </Box>
      <Box marginTop={1} marginLeft={2}>
        <Text
          color={focusedConfigIndex === 1 ? theme.status.success : undefined}
        >
          {cursor(1)} {checkmark(modalityEnabled)} {t('Enable modality')}
        </Text>
      </Box>
      <Box marginTop={0} marginLeft={4}>
        <Text color={theme.text.secondary}>
          {t('Enables multimodal input capabilities (image, video, etc.).')}
        </Text>
      </Box>
      {modalityEnabled && (
        <Box marginTop={0} marginLeft={6}>
          <Text
            color={focusedConfigIndex === 2 ? theme.status.success : undefined}
          >
            {cursor(2)} {checkmark(modalityImage)} {'Image  '}
          </Text>
          <Text
            color={focusedConfigIndex === 3 ? theme.status.success : undefined}
          >
            {cursor(3)} {checkmark(modalityVideo)} {'Video  '}
          </Text>
          <Text
            color={focusedConfigIndex === 4 ? theme.status.success : undefined}
          >
            {cursor(4)} {checkmark(modalityAudio)} {'Audio  '}
          </Text>
          <Text
            color={focusedConfigIndex === 5 ? theme.status.success : undefined}
          >
            {cursor(5)} {checkmark(modalityPdf)} {'PDF'}
          </Text>
        </Box>
      )}
      <Box marginTop={1} marginLeft={2}>
        <Text
          color={
            focusedConfigIndex === ctxIdx ? theme.status.success : undefined
          }
        >
          {cursor(ctxIdx)} {t('Context window')}:{' '}
        </Text>
        <TextInput
          value={contextWindowSize}
          onChange={flow.changeContextWindowSize}
          placeholder="auto"
          isActive={focusedConfigIndex === ctxIdx}
        />
      </Box>
      <Box marginTop={0} marginLeft={4}>
        <Text color={theme.text.secondary}>
          {t('Max input tokens (leave empty to auto-detect from model name).')}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {t(
            '↑↓ to navigate, Space to toggle, Enter to continue, Esc to go back',
          )}
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step: Review JSON
// ---------------------------------------------------------------------------

const REVIEW_LABEL_WIDTH = 12;

function ReviewRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): React.JSX.Element {
  return (
    <Box>
      <Box minWidth={REVIEW_LABEL_WIDTH} flexShrink={0}>
        <Text color={extendedTheme.text.muted}>{label}</Text>
      </Box>
      <Text color={theme.text.primary} wrap="truncate-end">
        {value}
      </Text>
      {note && (
        <Box marginLeft={2} flexShrink={0}>
          <Text color={theme.status.success}>{note}</Text>
        </Box>
      )}
    </Box>
  );
}

function ReviewStep({ flow }: { flow: ProviderSetupFlow }): React.JSX.Element {
  const { provider, baseUrl, apiKey, modelIds } = flow.state;
  return (
    <Box marginTop={1} flexDirection="column">
      {/* What the connection is, in the person's terms: one line per field,
          so the step fits a 40-row terminal. The key shows only its ends. */}
      <Box marginTop={1} flexDirection="column">
        {provider && (
          <ReviewRow
            label={t('Provider')}
            value={t(provider.uiLabels?.flowTitle ?? provider.label)}
          />
        )}
        {baseUrl && <ReviewRow label={t('Endpoint')} value={baseUrl} />}
        {apiKey && (
          <ReviewRow
            label={t('Key')}
            value={abbreviateKey(apiKey)}
            note={
              flow.state.keyCheck?.status === 'ok'
                ? `${glyphs().done} ${t('key valid')}`
                : undefined
            }
          />
        )}
        {modelIds && (
          <ReviewRow
            label={t('Models')}
            value={normalizeModelIds(modelIds).join(', ')}
          />
        )}
      </Box>
      <Box marginTop={1}>
        {flow.state.previewError ? (
          <Text color={theme.status.error}>{flow.state.previewError}</Text>
        ) : (
          <Text color={extendedTheme.text.muted}>
            {t(
              'The key is saved in ~/.o1-code/credentials/ and the models in settings.json.',
            )}
          </Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {t('Enter to save, Esc to go back')}
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Protocol options
// ---------------------------------------------------------------------------

const PROTOCOL_ITEMS = [
  {
    key: AuthType.USE_OPENAI,
    title: t('OpenAI-compatible'),
    label: t('OpenAI-compatible'),
    description: t('Standard OpenAI API format (most common)'),
    value: AuthType.USE_OPENAI,
  },
  {
    key: AuthType.USE_ANTHROPIC,
    title: t('Anthropic-compatible'),
    label: t('Anthropic-compatible'),
    description: t('Anthropic Messages API format'),
    value: AuthType.USE_ANTHROPIC,
  },
  {
    key: AuthType.USE_GEMINI,
    title: t('Gemini-compatible'),
    label: t('Gemini-compatible'),
    description: t('Google Gemini API format'),
    value: AuthType.USE_GEMINI,
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ProviderSetupStepsProps {
  flow: ProviderSetupFlow;
}

export function ProviderSetupSteps({
  flow,
}: ProviderSetupStepsProps): React.JSX.Element | null {
  const { provider, step } = flow.state;

  // Keyboard handling for steps that need it (advancedConfig, review)
  useKeypress(
    (key) => {
      if (step === 'advancedConfig') {
        // The context-window row has an embedded TextInput that's conditionally
        // active. Restrict the focus-row navigation to unambiguous shortcuts —
        // arrow keys and the readline-style Ctrl+P/Ctrl+N — so typing a letter
        // into the context-window field never simultaneously moves the focus.
        const isFocusUp = key.name === 'up' || (key.ctrl && key.name === 'p');
        const isFocusDown =
          key.name === 'down' || (key.ctrl && key.name === 'n');
        if (isFocusUp) {
          flow.moveAdvancedFocusUp();
          return;
        }
        if (isFocusDown) {
          flow.moveAdvancedFocusDown();
          return;
        }
        if (key.name === 'space') {
          flow.toggleFocusedAdvancedOption();
          return;
        }
        if (key.name === 'return') {
          flow.submitAdvancedConfig();
          return;
        }
      }

      if (step === 'review' && key.name === 'return') {
        flow.submit();
      }
    },
    { isActive: step === 'advancedConfig' || step === 'review' },
  );

  if (!provider || !step) return null;

  switch (step) {
    case 'protocol': {
      const protocolOpts = provider.protocolOptions ?? [provider.protocol];
      const items = PROTOCOL_ITEMS.filter((p) =>
        protocolOpts.includes(p.value as AuthType),
      );
      return (
        <>
          <Box marginTop={1}>
            <DescriptiveRadioButtonSelect
              items={items}
              initialIndex={Math.max(
                0,
                items.findIndex((item) => item.value === flow.state.protocol),
              )}
              onSelect={flow.selectProtocol}
              itemGap={1}
            />
          </Box>
          <NAV_HINT_SELECT />
        </>
      );
    }

    case 'wireApi':
      return (
        <>
          <Box marginTop={1}>
            <DescriptiveRadioButtonSelect
              items={[
                {
                  key: 'chat-completions',
                  title: t('Chat Completions'),
                  description: t('Standard OpenAI API format (most common)'),
                  value: 'chat-completions' as ModelWireApi,
                },
                {
                  key: 'responses',
                  title: t('Responses'),
                  description: t(
                    'OpenAI Responses API — streaming reasoning + tool use',
                  ),
                  value: 'responses' as ModelWireApi,
                },
              ]}
              initialIndex={flow.state.wireApi === 'responses' ? 1 : 0}
              onSelect={flow.selectWireApi}
              itemGap={1}
            />
          </Box>
          <NAV_HINT_SELECT />
        </>
      );

    case 'baseUrl':
      if (Array.isArray(provider.baseUrl)) {
        return <BaseUrlSelectStep config={provider} flow={flow} />;
      }
      return (
        <BaseUrlInputStep
          flow={flow}
          onThisMachine={provider.uiGroup === 'local'}
          documentationUrl={resolveDocumentationUrl(
            provider,
            flow.state.baseUrl,
          )}
        />
      );

    case 'signIn':
      return <SignInStep config={provider} flow={flow} />;

    case 'apiKey':
      return <ApiKeyStep config={provider} flow={flow} />;

    case 'models':
      if (provider.supportsModelDiscovery || flow.state.keyCheck) {
        return <DiscoveringModelIdsStep config={provider} flow={flow} />;
      }
      return <ModelIdsStep config={provider} flow={flow} />;

    case 'advancedConfig':
      return <AdvancedConfigStep flow={flow} />;

    case 'review':
      return <ReviewStep flow={flow} />;

    default:
      return null;
  }
}
