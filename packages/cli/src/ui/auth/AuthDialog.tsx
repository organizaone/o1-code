/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Text } from 'ink';
import Link from 'ink-link';
import wrapAnsi from 'wrap-ansi';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { getDialogMaxHeight } from '../utils/layoutUtils.js';
import { getFixedHeaderHeight } from '../components/Header.js';
import { getAuthStepPosition } from './auth-step-position.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  DescriptiveRadioButtonSelect,
  type DescriptiveRadioSelectItem,
} from '../components/shared/DescriptiveRadioButtonSelect.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { DisplayModeStep } from './DisplayModeStep.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { t } from '../../i18n/index.js';
import { repoDocUrl } from '../repo-links.js';
import { getRawModelProviders } from '../../config/loadedSettingsAdapter.js';
import {
  findProviderById,
  findProviderByCredentials,
  getMenuRows,
  organizaoneProvider,
  type MenuRow,
} from '@organizaone/o1-code-core/providers/all-providers.js';
import {
  credentialIdForProvider,
  readSavedApiKey,
} from '@organizaone/o1-code-core/providers/credential-store.js';
import {
  probeLocalServers,
  type LocalServerProbe,
} from '@organizaone/o1-code-core/providers/local-servers.js';
import { customProvider } from '@organizaone/o1-code-core/providers/presets/custom-provider.js';
import {
  findExistingProviderModels,
  getDefaultModelIds,
} from '@organizaone/o1-code-core/providers/provider-config.js';
import type {
  ProviderConfig,
  ProviderFamily,
} from '@organizaone/o1-code-core/providers/types.js';
import { useProviderSetupFlow } from './useProviderSetupFlow.js';
import {
  MODEL_CATALOG_MIN_VISIBLE_ROWS,
  ProviderSetupSteps,
} from './ProviderSetupSteps.js';

const TOS_PRIVACY_URL = repoDocUrl('users/support/tos-privacy.md');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MenuView = 'main' | 'organizaone' | 'apiKey' | 'local' | 'family';
type ViewLevel = MenuView | 'provider-setup';

export type MainOption = 'organizaone' | 'apiKey' | 'local' | 'custom';

/** What the probes said: `null` while they run. */
export type LocalServersState = readonly LocalServerProbe[] | null;

/**
 * A menu row. An `unavailable` row is drawn disabled but can still be
 * highlighted, so enter on it can say why it does nothing.
 */
export interface AuthMenuItem<T extends string = string>
  extends DescriptiveRadioSelectItem<T> {
  unavailable?: string;
}

/** Width of the label column in the one-line rows of the API key list. */
const ROW_LABEL_WIDTH = 18;
const FAMILY_VALUE_PREFIX = 'family:';

// ---------------------------------------------------------------------------
// Menu rows
// ---------------------------------------------------------------------------

function Badge({
  text,
  color,
}: {
  text: string;
  color: string;
}): React.JSX.Element {
  return <Text color={color}>{`  ${text}`}</Text>;
}

/** The title of a row that cannot be chosen yet: muted, with its badge. */
function unavailableTitle(
  label: string,
  badge: string,
  badgeColor: string,
): React.ReactNode {
  return (
    <>
      <Text color={extendedTheme.text.muted}>{label}</Text>
      <Badge text={badge} color={badgeColor} />
    </>
  );
}

function probeFor(
  provider: ProviderConfig,
  servers: LocalServersState,
): LocalServerProbe | undefined {
  const kind = provider.localProbe?.kind;
  return kind ? servers?.find((server) => server.id === kind) : undefined;
}

/** The badge the main screen shows on the Local entry, if any. */
export function mainLocalBadge(
  servers: LocalServersState,
): { text: string; color: string } | undefined {
  if (servers === null) {
    return { text: t('… looking'), color: extendedTheme.text.muted };
  }
  const running = servers.find((server) => server.running);
  if (!running) return undefined;
  const provider = getMenuRows('local').find(
    (row) =>
      row.kind === 'provider' && row.provider.localProbe?.kind === running.id,
  );
  const label =
    provider?.kind === 'provider' ? t(provider.provider.label) : running.id;
  return {
    text: `${glyphs().dot} ${t('{{server}} detected', { server: label })}`,
    color: theme.status.success,
  };
}

export function buildMainItems(
  servers: LocalServersState,
): Array<AuthMenuItem<MainOption>> {
  const localBadge = mainLocalBadge(servers);
  return [
    {
      key: 'organizaone',
      title: t(organizaoneProvider.label),
      description: t(organizaoneProvider.description),
      value: 'organizaone',
    },
    {
      key: 'apiKey',
      title: t('API key'),
      description: t('Anthropic, OpenAI, Google Gemini, xAI and others'),
      value: 'apiKey',
    },
    {
      key: 'local',
      title: localBadge ? (
        <>
          {t('Local')}
          <Badge text={localBadge.text} color={localBadge.color} />
        </>
      ) : (
        t('Local')
      ),
      description: t('Models running on this machine'),
      value: 'local',
    },
    {
      key: 'custom',
      title: t('Custom'),
      description: t('Any URL, OpenAI-compatible or Anthropic'),
      value: 'custom',
    },
  ];
}

const COMING_SOON_NOTICE = () =>
  t('Coming soon: this path depends on the OrganizaOne server.');

export function buildOrganizaOneItems(): AuthMenuItem[] {
  return getMenuRows('organizaone').flatMap((row): AuthMenuItem[] => {
    if (row.kind !== 'provider') return [];
    const provider = row.provider;
    if (provider.comingSoon) {
      return [
        {
          key: provider.id,
          title: unavailableTitle(
            t(provider.label),
            t('coming soon'),
            theme.status.warning,
          ),
          description: t(provider.description),
          value: provider.id,
          unavailable: COMING_SOON_NOTICE(),
        },
      ];
    }
    // The path already names OrganizaOne: the row says what the user does.
    if (provider.signIn || provider.connection) {
      return [
        {
          key: provider.id,
          title: t(provider.label),
          description: t(provider.description),
          value: provider.id,
        },
      ];
    }
    return [
      {
        key: provider.id,
        title: t('API key'),
        description: t('Paste your key; the models come from OrganizaOne'),
        value: provider.id,
      },
    ];
  });
}

function rowLabel(row: MenuRow): { label: string; description: string } {
  return row.kind === 'family'
    ? { label: t(row.family.label), description: t(row.family.description) }
    : {
        label: t(row.provider.label),
        description: t(row.provider.description),
      };
}

/** One line per row: the label in a column, the description muted. */
export function buildApiKeyItems(): AuthMenuItem[] {
  return getMenuRows('apiKey').map((row) => {
    const { label, description } = rowLabel(row);
    const value =
      row.kind === 'family'
        ? `${FAMILY_VALUE_PREFIX}${row.family.id}`
        : row.provider.id;
    return {
      key: value,
      title: (
        <>
          {label.padEnd(ROW_LABEL_WIDTH)}
          <Text color={extendedTheme.text.muted}>{description}</Text>
        </>
      ),
      description: '',
      value,
    };
  });
}

export function buildFamilyItems(family: ProviderFamily): AuthMenuItem[] {
  const row = getMenuRows('apiKey').find(
    (candidate) =>
      candidate.kind === 'family' && candidate.family.id === family.id,
  );
  const providers = row?.kind === 'family' ? row.providers : [];
  return providers.map((provider) => ({
    key: provider.id,
    title: t(provider.label),
    description: t(provider.description),
    value: provider.id,
  }));
}

export function buildLocalItems(servers: LocalServersState): AuthMenuItem[] {
  return getMenuRows('local').flatMap((row): AuthMenuItem[] => {
    if (row.kind !== 'provider') return [];
    const provider = row.provider;
    const base = {
      key: provider.id,
      description: t(provider.description),
      value: provider.id,
    };
    if (!provider.localProbe) {
      return [{ ...base, title: t(provider.label) }];
    }
    if (servers === null) {
      return [
        {
          ...base,
          title: (
            <>
              {t(provider.label)}
              <Badge text={t('… looking')} color={extendedTheme.text.muted} />
            </>
          ),
          unavailable: t('Still looking for the server on this machine.'),
        },
      ];
    }
    const probe = probeFor(provider, servers);
    if (!probe?.running) {
      return [
        {
          ...base,
          title: unavailableTitle(
            t(provider.label),
            `${glyphs().hollow} ${t('not running')}`,
            extendedTheme.text.muted,
          ),
          unavailable: t(
            'Nothing answered on that port. Start the server and press ctrl+r.',
          ),
        },
      ];
    }
    return [
      {
        ...base,
        title: (
          <>
            {t(provider.label)}
            <Badge
              text={`${glyphs().dot} ${t('detected · {{count}} models', {
                count: String(probe.models.length),
              })}`}
              color={theme.status.success}
            />
          </>
        ),
      },
    ];
  });
}

function menuText(node: React.ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number')
        return String(child);
      if (
        isValidElement<{ children?: React.ReactNode; text?: string }>(child)
      ) {
        if (child.type === Badge) return `  ${child.props.text ?? ''}`;
        return menuText(child.props.children ?? child.props.text);
      }
      return '';
    })
    .join('');
}

/** A menu list; the one-line API key rows are drawn without a gap. */
export function AuthMenuList<T extends string>({
  items,
  initialIndex,
  onSelect,
  onHighlight,
  compact = false,
  maxItemsToShow = items.length,
}: {
  items: Array<AuthMenuItem<T>>;
  initialIndex: number;
  onSelect: (value: T) => void;
  onHighlight?: (value: T) => void;
  compact?: boolean;
  maxItemsToShow?: number;
}): React.JSX.Element {
  return (
    <DescriptiveRadioButtonSelect
      items={items}
      initialIndex={initialIndex}
      onSelect={onSelect}
      onHighlight={onHighlight}
      itemGap={compact ? 0 : 1}
      maxItemsToShow={Math.max(maxItemsToShow, 1)}
    />
  );
}

// ---------------------------------------------------------------------------
// Step label for provider-setup title bar
// ---------------------------------------------------------------------------

function getStepLabel(step: string | null, p: ProviderConfig): string {
  if (step === 'protocol') return t('Protocol');
  if (step === 'wireApi') return t('API');
  if (step === 'baseUrl') {
    if (p.uiGroup === 'local') return t('Port');
    if (p.uiLabels?.baseUrlStepTitle) return t(p.uiLabels.baseUrlStepTitle);
    return Array.isArray(p.baseUrl) ? t('Endpoint') : t('Base URL');
  }
  if (step === 'apiKey') return t('API Key');
  if (step === 'models') return t('Model IDs');
  if (step === 'advancedConfig') return t('Advanced Config');
  if (step === 'review') return t('Review');
  return '';
}

/** The key saved for a preset, keyed by its env var, to prefill the key step. */
function savedKeyEnv(config: ProviderConfig): Record<string, string> {
  if (typeof config.envKey !== 'string') return {};
  const saved = readSavedApiKey(
    credentialIdForProvider(config.credentialId ?? config.id),
  );
  return saved ? { [config.envKey]: saved } : {};
}

const MAIN_INDEX_BY_GROUP: Record<string, number> = {
  organizaone: 0,
  apiKey: 1,
  local: 2,
  custom: 3,
};

// ---------------------------------------------------------------------------
// AuthDialog
// ---------------------------------------------------------------------------

export function AuthDialog(): React.JSX.Element {
  const uiState = useUIState();
  const {
    auth: { authError, choosingDisplayMode },
  } = uiState;
  const {
    auth: {
      closeAuthDialog,
      handleProviderSubmit,
      onAuthError,
      chooseDisplayMode,
      skipDisplayModeChoice,
    },
  } = useUIActions();
  const config = useConfig();
  const settings = useSettings();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewLevel, setViewLevel] = useState<ViewLevel>('main');
  const [viewStack, setViewStack] = useState<ViewLevel[]>([]);
  const [family, setFamily] = useState<ProviderFamily | null>(null);

  const [mainIndex, setMainIndex] = useState<number | null>(null);
  const [subMenuIndex, setSubMenuIndex] = useState<Record<string, number>>({});

  const setupFlow = useProviderSetupFlow(
    handleProviderSubmit,
    settings.merged.modelProviders,
    settings.merged.providerProtocol,
    {
      authType: settings.merged.security?.auth?.selectedType,
      id: settings.merged.model?.name,
      baseUrl: settings.merged.model?.baseUrl,
    },
    getRawModelProviders(settings),
  );

  // -- Local servers --------------------------------------------------------

  // Probed once when the dialog opens and again on ctrl+r in the Local list.
  const [localServers, setLocalServers] = useState<LocalServersState>(null);
  const probeRef = useRef<AbortController | null>(null);
  const probeAgain = useCallback(() => {
    probeRef.current?.abort();
    const controller = new AbortController();
    probeRef.current = controller;
    setLocalServers(null);
    void probeLocalServers({ signal: controller.signal }).then((servers) => {
      if (!controller.signal.aborted) setLocalServers(servers);
    });
  }, []);
  useEffect(() => {
    probeAgain();
    return () => probeRef.current?.abort();
  }, [probeAgain]);

  // -- Navigation -----------------------------------------------------------

  const clearErrors = () => {
    setErrorMessage(null);
    setNotice(null);
    onAuthError(null);
  };

  const pushView = (view: ViewLevel) => {
    setViewStack((prev) => [...prev, viewLevel]);
    setViewLevel(view);
  };

  const goBack = () => {
    clearErrors();

    if (viewLevel === 'provider-setup') {
      if (setupFlow.goBack()) return;
    }

    setViewStack((prev) => {
      const next = [...prev];
      const parent = next.pop() ?? 'main';
      setViewLevel(parent);
      return next;
    });
  };

  // The saved route and ids the wizard reopens with. Both must come from the
  // same lookup: seeding the ids of a Responses install while the API step
  // defaults to Chat Completions would restamp them onto the other wire.
  const findSavedModels = (providerConfig: ProviderConfig) =>
    findExistingProviderModels(
      providerConfig,
      settings.merged.modelProviders,
      settings.merged.providerProtocol,
      {
        authType: settings.merged.security?.auth?.selectedType,
        id: settings.merged.model?.name,
        baseUrl: settings.merged.model?.baseUrl,
      },
    );

  // Undefined when the provider was never set up: the flow tells a first
  // setup from a provider saved with only its built-in models by it.
  const getExistingModelIds = (
    providerConfig: ProviderConfig,
  ): string[] | undefined => {
    const saved = findSavedModels(providerConfig);
    if (!saved) return undefined;
    const builtinIds = new Set(getDefaultModelIds(providerConfig));
    return saved.models.map((m) => m.id).filter((id) => !builtinIds.has(id));
  };

  const startProvider = (providerConfig: ProviderConfig) => {
    setupFlow.start(
      providerConfig,
      findSavedModels(providerConfig)?.protocol,
      savedKeyEnv(providerConfig),
      getExistingModelIds(providerConfig),
    );
    // A detected server has already listed its models: the models step
    // opens on them, checked, with no key to ask for.
    const probe = probeFor(providerConfig, localServers);
    if (probe?.running) {
      setupFlow.setKeyCheck({
        status: 'ok',
        models: probe.models.map((id) => ({ id })),
      });
    }
    pushView('provider-setup');
  };

  // -- Menu items -----------------------------------------------------------

  const mainItems = useMemo(() => buildMainItems(localServers), [localServers]);
  const organizaOneItems = useMemo(() => buildOrganizaOneItems(), []);
  const apiKeyItems = useMemo(() => buildApiKeyItems(), []);
  const localItems = useMemo(
    () => buildLocalItems(localServers),
    [localServers],
  );
  const familyItems = useMemo(
    () => (family ? buildFamilyItems(family) : []),
    [family],
  );

  const subMenus: Partial<Record<MenuView, AuthMenuItem[]>> = {
    organizaone: organizaOneItems,
    apiKey: apiKeyItems,
    local: localItems,
    family: familyItems,
  };

  const handleSubMenuSelect = (items: AuthMenuItem[], value: string) => {
    clearErrors();
    const item = items.find((candidate) => candidate.value === value);
    if (item?.unavailable) {
      setNotice(item.unavailable);
      return;
    }
    if (value.startsWith(FAMILY_VALUE_PREFIX)) {
      const row = getMenuRows('apiKey').find(
        (candidate) =>
          candidate.kind === 'family' &&
          `${FAMILY_VALUE_PREFIX}${candidate.family.id}` === value,
      );
      if (row?.kind !== 'family') return;
      setFamily(row.family);
      pushView('family');
      return;
    }
    const providerConfig = findProviderById(value);
    if (providerConfig) startProvider(providerConfig);
  };

  // -- Default main index from current auth state ---------------------------

  const contentGenConfig = config.getContentGeneratorConfig();
  const matchedProvider = findProviderByCredentials(
    contentGenConfig?.baseUrl,
    contentGenConfig?.apiKeyEnvKey,
  );

  // Land on the entry that lists the active provider.
  const defaultMainIndex = useMemo(
    () => MAIN_INDEX_BY_GROUP[matchedProvider?.uiGroup ?? ''] ?? 0,
    [matchedProvider],
  );

  // -- Handlers -------------------------------------------------------------

  const handleMainSelect = (value: MainOption) => {
    clearErrors();
    if (value === 'custom') {
      startProvider(customProvider);
      return;
    }
    pushView(value);
  };

  // -- Keyboard handling ----------------------------------------------------

  useKeypress(
    (key) => {
      if (choosingDisplayMode) {
        if (key.name === 'escape') skipDisplayModeChoice();
        return;
      }
      if (key.name === 'escape') {
        if (viewLevel !== 'main') {
          goBack();
          return;
        }
        if (errorMessage) return;
        if (config.getAuthType() === undefined) {
          setErrorMessage(
            t(
              'You must connect a provider to proceed. Press Ctrl+C again to exit.',
            ),
          );
          return;
        }
        closeAuthDialog();
        return;
      }
      if (viewLevel === 'local' && key.ctrl && key.name === 'r') {
        setNotice(null);
        probeAgain();
      }
    },
    { isActive: true },
  );

  // -- View title -----------------------------------------------------------

  // The title names the dialog; the path says where the person is, and the
  // step counts across the menu screens and the provider's steps.
  const { viewPath, stepText } = useMemo(() => {
    const p = setupFlow.state.provider;
    const { stepIndex, totalSteps, step } = setupFlow.state;
    const menuPaths: Record<MenuView, string[]> = {
      main: [],
      organizaone: [t(organizaoneProvider.label)],
      apiKey: [t('API key')],
      local: [t('Local')],
      family: [t('API key'), family ? t(family.label) : ''],
    };
    const path =
      viewLevel !== 'provider-setup'
        ? menuPaths[viewLevel]
        : p
          ? [t(p.uiLabels?.flowTitle ?? p.label), getStepLabel(step, p)]
          : [t('Provider Setup')];
    const position = getAuthStepPosition({
      screensBefore: viewStack.length,
      ...(viewLevel === 'provider-setup'
        ? { flow: { stepIndex, totalSteps } }
        : {}),
    });
    if (choosingDisplayMode) {
      // The display choice comes after the provider's last step: one more.
      const total = String((position.total ?? position.step) + 1);
      return {
        viewPath: [
          ...(p ? [t(p.uiLabels?.flowTitle ?? p.label)] : []),
          t('display'),
        ],
        stepText: t('step {{step}} of {{total}}', { step: total, total }),
      };
    }
    return {
      viewPath: path,
      stepText:
        position.total === undefined
          ? t('step {{step}}', { step: String(position.step) })
          : t('step {{step}} of {{total}}', {
              step: String(position.step),
              total: String(position.total),
            }),
    };
  }, [
    viewLevel,
    viewStack.length,
    family,
    setupFlow.state,
    choosingDisplayMode,
  ]);

  // -- Render ---------------------------------------------------------------

  const activeItems =
    viewLevel === 'main' || viewLevel === 'provider-setup'
      ? undefined
      : subMenus[viewLevel];

  const constrained = uiState.useTerminalBuffer || uiState.constrainHeight;
  const dialogHeight = constrained
    ? uiState.useTerminalBuffer
      ? Math.max(
          1,
          uiState.terminalHeight -
            getFixedHeaderHeight(uiState.terminalWidth) -
            (uiState.ctrlCPressedOnce ? 2 : 0) -
            (uiState.ctrlDPressedOnce ? 2 : 0),
        )
      : getDialogMaxHeight(uiState.terminalHeight, uiState.staticExtraHeight)
    : undefined;
  const contentWidth = Math.max(1, uiState.mainAreaWidth - 4);
  const isMenu = viewLevel !== 'provider-setup';
  const compactFrame =
    (isMenu || setupFlow.state.step === 'models') &&
    dialogHeight !== undefined &&
    dialogHeight < 22;
  const compactMenu = isMenu && compactFrame;
  const paddingY = compactFrame ? 0 : 1;
  const innerHeight =
    dialogHeight === undefined
      ? undefined
      : Math.max(1, dialogHeight - 3 - paddingY * 2);
  const menuItems = viewLevel === 'main' ? mainItems : activeItems;
  const itemGap = viewLevel === 'apiKey' ? 0 : 1;
  const wrappedRows = (text: string, width = contentWidth) =>
    wrapAnsi(text, width, { hard: true }).split('\n').length;
  const itemRows = Math.max(
    1,
    ...(menuItems ?? []).map(
      (item) =>
        wrappedRows(menuText(item.title), Math.max(1, contentWidth - 2)) +
        (menuText(item.description).trim()
          ? wrappedRows(
              menuText(item.description),
              Math.max(1, contentWidth - 2),
            )
          : 0),
    ),
  );
  const noticeRows = notice && activeItems ? 2 : 0;
  const error = authError || errorMessage;
  const showTermsUrl =
    innerHeight === undefined || innerHeight >= itemRows + 4 + (error ? 2 : 0);
  const footerRows =
    viewLevel === 'main'
      ? (compactMenu ? 2 : 4) + Number(showTermsUrl)
      : isMenu
        ? 2
        : 0;
  const errorLines = error
    ? wrapAnsi(error, contentWidth, { hard: true }).split('\n')
    : [];
  const maxErrorRows =
    innerHeight === undefined
      ? errorLines.length
      : Math.max(
          1,
          innerHeight -
            footerRows -
            noticeRows -
            (isMenu
              ? itemRows + 1
              : 6 + Number(Boolean(setupFlow.state.modelIdsError))) -
            1,
        );
  const visibleErrorLines = errorLines.slice(0, maxErrorRows);
  if (visibleErrorLines.length < errorLines.length)
    visibleErrorLines[visibleErrorLines.length - 1] =
      `${visibleErrorLines.at(-1)?.slice(0, -1)}…`;
  const errorRows =
    visibleErrorLines.length > 0 ? visibleErrorLines.length + 1 : 0;
  const availableHeight =
    innerHeight === undefined
      ? undefined
      : Math.max(1, innerHeight - errorRows);
  const menuRows =
    availableHeight === undefined
      ? undefined
      : availableHeight - footerRows - noticeRows - 1;
  const maxMenuItems =
    menuRows === undefined
      ? menuItems?.length
      : Math.max(1, Math.floor((menuRows + itemGap) / (itemRows + itemGap)));
  const menuIndex =
    viewLevel === 'main'
      ? (mainIndex ?? defaultMainIndex)
      : (subMenuIndex[viewLevel] ?? 0);
  const menuOverflow =
    menuItems && maxMenuItems !== undefined && menuItems.length > maxMenuItems;

  const header = (
    <Box flexShrink={0}>
      <Box flexGrow={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text bold>{t('Connect a provider')}</Text>
          <Text color={extendedTheme.text.muted}>
            {viewPath.map((segment) => ` › ${segment}`).join('')}
          </Text>
        </Text>
      </Box>
      <Box flexShrink={0} marginLeft={2}>
        <Text color={extendedTheme.text.muted}>
          {stepText}
          {menuOverflow ? ` · ↑↓ ${menuIndex + 1}/${menuItems.length}` : ''}
        </Text>
      </Box>
    </Box>
  );

  if (choosingDisplayMode) {
    return (
      <Box
        borderStyle={glyphs().borderStyle}
        borderColor={extendedTheme.ui.brand}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        {header}
        <DisplayModeStep onChoose={chooseDisplayMode} />
      </Box>
    );
  }

  return (
    <Box
      borderStyle={glyphs().borderStyle}
      borderColor={extendedTheme.ui.brand}
      flexDirection="column"
      paddingX={1}
      paddingY={paddingY}
      width="100%"
      flexShrink={isMenu || setupFlow.state.step === 'models' ? 0 : 1}
    >
      {header}

      {viewLevel === 'main' && (
        <Box marginTop={1}>
          <AuthMenuList
            key={maxMenuItems}
            items={mainItems}
            maxItemsToShow={maxMenuItems}
            initialIndex={mainIndex != null ? mainIndex : defaultMainIndex}
            onSelect={handleMainSelect}
            onHighlight={(value) => {
              setMainIndex(mainItems.findIndex((item) => item.value === value));
            }}
          />
        </Box>
      )}

      {activeItems && (
        <>
          <Box marginTop={1}>
            <AuthMenuList
              key={`${viewLevel}-${maxMenuItems}`}
              items={activeItems}
              compact={viewLevel === 'apiKey'}
              maxItemsToShow={maxMenuItems}
              initialIndex={subMenuIndex[viewLevel] ?? 0}
              onSelect={(value) => handleSubMenuSelect(activeItems, value)}
              onHighlight={(value) => {
                setNotice(null);
                setSubMenuIndex((prev) => ({
                  ...prev,
                  [viewLevel]: activeItems.findIndex((i) => i.value === value),
                }));
              }}
            />
          </Box>
          {notice && (
            <Box marginTop={1}>
              <Text color={theme.status.warning} wrap="truncate-end">
                {notice}
              </Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color={extendedTheme.text.muted} wrap="truncate-end">
              {viewLevel === 'local'
                ? t('↑↓ navigate · enter select · ctrl+r look again · esc back')
                : t('↑↓ navigate · enter select · esc back')}
            </Text>
          </Box>
        </>
      )}

      {viewLevel === 'provider-setup' && (
        <ProviderSetupSteps
          flow={setupFlow}
          minVisibleModelRows={MODEL_CATALOG_MIN_VISIBLE_ROWS}
          availableHeight={availableHeight}
        />
      )}

      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{visibleErrorLines.join('\n')}</Text>
        </Box>
      )}

      {viewLevel === 'main' && (
        <>
          <Box marginY={compactMenu ? 0 : 1}>
            <Text color={theme.border.default}>{'─'.repeat(contentWidth)}</Text>
          </Box>
          <Box>
            <Text
              color={theme.text.primary}
              wrap={constrained ? 'truncate-end' : undefined}
            >
              <Link url={TOS_PRIVACY_URL} fallback={false}>
                {t('Terms of Services and Privacy Notice')}:
              </Link>
            </Text>
          </Box>
          {showTermsUrl && (
            <Box>
              <Text
                color={theme.text.secondary}
                underline
                wrap={constrained ? 'truncate-end' : undefined}
              >
                <Link url={TOS_PRIVACY_URL} fallback={false}>
                  {TOS_PRIVACY_URL}
                </Link>
              </Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
