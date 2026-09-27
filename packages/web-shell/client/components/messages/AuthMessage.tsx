import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useDaemonSessionOwnerGuard,
  useWorkspaceActions,
  type DaemonAuthProviderBaseUrlOption,
  type DaemonAuthProviderCatalog,
  type DaemonAuthProviderDescriptor,
  type DaemonAuthProviderGroupId,
  type DaemonAuthProviderInstallRequest,
  type DaemonLocalServerProbe,
} from '@organizaone/o1-code-web-shell/daemon-react-sdk';
import { useI18n } from '../../i18n';
import { useExternalLinkOpener } from '../../hooks/useExternalLinkOpener';
import { Checkbox } from '../ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '../ui/field';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { isVoiceModelId } from '../../voice/voiceModels';
import { Switch } from '../ui/switch';
import styles from './AuthMessage.module.css';
import { repoDocUrl } from '../../utils/repoLinks';

const TOS_PRIVACY_URL = repoDocUrl('users/support/tos-privacy.md');

type AuthView = 'groups' | 'providers' | 'family' | 'step' | 'review';
type AuthGroupId = DaemonAuthProviderGroupId;
type AuthGroup = DaemonAuthProviderCatalog['groups'][number];
type ProviderFamily = NonNullable<DaemonAuthProviderDescriptor['family']>;

/** A row of a group: one provider, or a family chosen on a second list. */
type ProviderRow =
  | { kind: 'provider'; provider: DaemonAuthProviderDescriptor }
  | {
      kind: 'family';
      family: ProviderFamily;
      providers: DaemonAuthProviderDescriptor[];
    };

// VS15 keeps the dots one cell wide in monospace fonts, as in the terminal.
const DOT = '●︎';
const HOLLOW = '○︎';

/** Folds each family into the row of its first member. */
function rowsOf(providers: DaemonAuthProviderDescriptor[]): ProviderRow[] {
  const rows: ProviderRow[] = [];
  for (const provider of providers) {
    const family = provider.family;
    if (!family) {
      rows.push({ kind: 'provider', provider });
      continue;
    }
    const existing = rows.find(
      (row) => row.kind === 'family' && row.family.id === family.id,
    );
    if (existing?.kind === 'family') {
      existing.providers.push(provider);
    } else {
      rows.push({ kind: 'family', family, providers: [provider] });
    }
  }
  return rows;
}

/** A bare port typed for a server on the daemon host. */
function localPortUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return undefined;
  const port = Number(trimmed);
  return port >= 1 && port <= 65535 ? `http://127.0.0.1:${port}/v1` : undefined;
}
type ModelWireApi = 'chat-completions' | 'responses';
type AuthStep =
  | 'protocol'
  | 'wireApi'
  | 'baseUrl'
  | 'apiKey'
  | 'models'
  | 'advancedConfig';

interface AuthMessageProps {
  onMessage: (text: string, type?: 'status' | 'error') => void;
  onClose: () => void;
}

interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  badge?: { text: string; tone?: 'warning' | 'success' };
  disabled?: boolean;
}

function getProtocolOptions(
  t: (key: string, vars?: Record<string, string | number>) => string,
): Array<Option<string>> {
  return [
    {
      value: 'openai',
      label: t('auth.protocol.openai'),
      description: t('auth.protocol.openaiDesc'),
    },
    {
      value: 'anthropic',
      label: t('auth.protocol.anthropic'),
      description: t('auth.protocol.anthropicDesc'),
    },
    {
      value: 'gemini',
      label: t('auth.protocol.gemini'),
      description: t('auth.protocol.geminiDesc'),
    },
  ];
}

function defaultBaseUrl(protocol: string, wireApi?: ModelWireApi): string {
  if (protocol === 'anthropic') return 'https://api.anthropic.com/v1';
  if (protocol === 'gemini') return 'https://generativelanguage.googleapis.com';
  // The Responses wire dials the /v1-less default endpoint (the pipeline
  // appends /v1/responses itself); the Chat Completions wire keeps /v1.
  if (protocol === 'openai-responses' || wireApi === 'responses') {
    return 'https://api.openai.com';
  }
  return 'https://api.openai.com/v1';
}

function modelIds(provider: DaemonAuthProviderDescriptor | null): string {
  return (
    provider?.models
      ?.map(
        (model: NonNullable<DaemonAuthProviderDescriptor['models']>[number]) =>
          model.id,
      )
      .join(', ') ?? ''
  );
}

function titleForStep(
  step: AuthStep,
  provider: DaemonAuthProviderDescriptor,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (step === 'protocol') return t('auth.step.protocol');
  if (step === 'wireApi') return t('auth.step.api');
  if (step === 'baseUrl') {
    if (provider.uiGroup === 'local') return t('auth.step.port');
    return provider.uiLabels?.baseUrlStepTitle ?? t('auth.step.baseUrl');
  }
  if (step === 'apiKey') return t('auth.step.apiKey');
  if (step === 'models') return t('auth.step.models');
  return t('auth.step.advanced');
}

function invalidTokenLimit(value: string): boolean {
  return (
    value.trim() !== '' &&
    (!/^\d+$/.test(value.trim()) ||
      Number(value) < 1 ||
      Number(value) > 10_000_000)
  );
}

function normalizeModelIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ];
}

export function AuthMessage({ onMessage, onClose }: AuthMessageProps) {
  const { t } = useI18n();
  // The daemon's own text stands in for a key this shell does not know.
  const translated = (key: string, fallback: string) => {
    const text = t(key);
    return text === key ? t(fallback) : text;
  };
  const fieldId = useId();
  const openExternalLink = useExternalLinkOpener();
  const workspaceActions = useWorkspaceActions();
  const sessionOwnerGuard = useDaemonSessionOwnerGuard();
  const ownerRef = useRef(sessionOwnerGuard.capture());
  const ownerChanged = !ownerRef.current.isCurrent();
  if (ownerChanged) ownerRef.current = sessionOwnerGuard.capture();
  const saveOperationRef = useRef(0);
  const [view, setView] = useState<AuthView>('groups');
  const [groupIndex, setGroupIndex] = useState(0);
  const [providerIndex, setProviderIndex] = useState(0);
  const [setupBackView, setSetupBackView] = useState<AuthView>('providers');
  const [stepIndex, setStepIndex] = useState(0);
  const [catalog, setCatalog] = useState<DaemonAuthProviderCatalog>();
  const [groupId, setGroupId] = useState<AuthGroupId>('organizaone');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyIndex, setFamilyIndex] = useState(0);
  // What the daemon found on its host: `null` while it looks.
  const [localServers, setLocalServers] = useState<
    DaemonLocalServerProbe[] | null
  >(null);
  const probeOperationRef = useRef(0);
  const [provider, setProvider] = useState<DaemonAuthProviderDescriptor | null>(
    null,
  );
  const [protocol, setProtocol] = useState('openai');
  const [wireApi, setWireApi] = useState<ModelWireApi>('chat-completions');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');
  const [thinking, setThinking] = useState(false);
  const [modality, setModality] = useState(false);
  const [modalityImage, setModalityImage] = useState(true);
  const [modalityVideo, setModalityVideo] = useState(true);
  const [modalityAudio, setModalityAudio] = useState(false);
  const [modalityPdf, setModalityPdf] = useState(false);
  const [purpose, setPurpose] = useState<'chat' | 'image' | 'voice'>('chat');
  const [contextWindow, setContextWindow] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workspaceActions
      .getAuthProviders()
      .then((next) => {
        setCatalog(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [workspaceActions]);

  const groups = useMemo(() => catalog?.groups ?? [], [catalog]);
  const providers = useMemo(() => {
    const ids =
      groups.find((group: AuthGroup) => group.id === groupId)?.providerIds ??
      [];
    return ids
      .map((id: string) =>
        catalog?.providers.find(
          (item: DaemonAuthProviderDescriptor) => item.id === id,
        ),
      )
      .filter(
        (
          item: DaemonAuthProviderDescriptor | undefined,
        ): item is DaemonAuthProviderDescriptor => !!item,
      );
  }, [catalog, groupId, groups]);
  const rows = useMemo(() => rowsOf(providers), [providers]);
  const familyProviders = useMemo(() => {
    const row = rows.find(
      (candidate) =>
        candidate.kind === 'family' && candidate.family.id === familyId,
    );
    return row?.kind === 'family' ? row.providers : [];
  }, [familyId, rows]);

  // The browser cannot reach the daemon host's loopback: the daemon probes.
  const probeLocalServers = useCallback(() => {
    const operation = ++probeOperationRef.current;
    setLocalServers(null);
    workspaceActions
      .getLocalAuthServers()
      .then((servers) => {
        if (probeOperationRef.current === operation) setLocalServers(servers);
      })
      .catch(() => {
        // Nothing found is the honest answer when the daemon cannot say.
        if (probeOperationRef.current === operation) setLocalServers([]);
      });
  }, [workspaceActions]);
  const probeOf = useCallback(
    (item: DaemonAuthProviderDescriptor) =>
      item.localProbe
        ? localServers?.find((server) => server.id === item.localProbe?.kind)
        : undefined,
    [localServers],
  );

  const steps = useMemo(
    () =>
      (provider?.steps ?? []).filter(
        (step) => step !== 'wireApi' || protocol === 'openai',
      ),
    [provider?.steps, protocol],
  );
  const protocolOptions = useMemo(
    () =>
      getProtocolOptions(t).filter((option) =>
        (provider?.protocolOptions ?? [provider?.protocol]).includes(
          option.value,
        ),
      ),
    [provider, t],
  );
  const apiOptions: Array<Option<ModelWireApi>> = [
    { value: 'chat-completions', label: t('auth.api.chatCompletions') },
    { value: 'responses', label: t('auth.api.responses') },
  ];
  const currentStep = steps[stepIndex] as AuthStep | undefined;
  const shouldReview = provider?.showAdvancedConfig === true;
  const isInputStep =
    currentStep === 'apiKey' ||
    currentStep === 'models' ||
    (currentStep === 'baseUrl' && !Array.isArray(provider?.baseUrl));

  const [optionIndex, setOptionIndex] = useState(0);

  useEffect(() => {
    if (currentStep === 'wireApi') {
      setOptionIndex(wireApi === 'responses' ? 1 : 0);
    }
  }, [wireApi, currentStep]);

  useEffect(() => {
    if (!ownerChanged) return;
    saveOperationRef.current += 1;
    setSaving(false);
    setError(null);
  }, [ownerChanged]);

  const startProvider = useCallback(
    (
      nextProvider: DaemonAuthProviderDescriptor,
      backView: AuthView = 'providers',
      detectedModels?: string[],
    ) => {
      setProvider(nextProvider);
      setSetupBackView(backView);
      const nextProtocol =
        nextProvider.protocolOptions?.[0] ?? nextProvider.protocol;
      const nextWireApi: ModelWireApi =
        nextProtocol === 'openai-responses' ? 'responses' : 'chat-completions';
      setProtocol(
        nextProtocol === 'openai-responses' ? 'openai' : nextProtocol,
      );
      setWireApi(nextWireApi);
      const onDaemonHost = nextProvider.uiGroup === 'local';
      if (typeof nextProvider.baseUrl === 'string') {
        setBaseUrl(nextProvider.baseUrl);
      } else if (Array.isArray(nextProvider.baseUrl)) {
        setBaseUrl(nextProvider.baseUrl[0]?.url ?? '');
      } else {
        // A server on the daemon host has no remote default to offer.
        setBaseUrl(
          onDaemonHost ? '' : defaultBaseUrl(nextProtocol, nextWireApi),
        );
      }
      setApiKey('');
      // A detected server has already listed what it serves.
      setModels(
        detectedModels?.length
          ? detectedModels.join(', ')
          : modelIds(nextProvider),
      );
      setThinking(false);
      setModality(false);
      setModalityImage(true);
      setModalityVideo(true);
      setModalityAudio(false);
      setModalityPdf(false);
      setPurpose('chat');
      setContextWindow('');
      setMaxTokens('');
      setStepIndex(0);
      setOptionIndex(0);
      setError(null);
      setView(nextProvider.steps.length > 0 ? 'step' : 'review');
    },
    [],
  );

  const goBack = useCallback(() => {
    setError(null);
    if (view === 'groups') {
      onClose();
      return;
    }
    if (view === 'providers') {
      setView('groups');
      return;
    }
    if (view === 'family') {
      setView('providers');
      return;
    }
    if (view === 'review') {
      if (steps.length === 0) {
        setView(setupBackView);
        return;
      }
      setView('step');
      setStepIndex(Math.max(0, steps.length - 1));
      return;
    }
    if (stepIndex > 0) {
      setStepIndex((idx) => idx - 1);
      setOptionIndex(0);
      return;
    }
    setView(setupBackView);
  }, [onClose, setupBackView, stepIndex, steps.length, view]);

  const advancedConfig = useMemo<
    DaemonAuthProviderInstallRequest['advancedConfig']
  >(() => {
    if (!steps.includes('advancedConfig')) return undefined;
    const config: NonNullable<
      DaemonAuthProviderInstallRequest['advancedConfig']
    > = {
      replaceExisting: true,
      ...(purpose !== 'chat' ? { purpose } : {}),
      ...(purpose === 'chat' && thinking ? { enableThinking: true } : {}),
      ...(purpose === 'chat' && modality
        ? {
            multimodal: {
              ...(modalityImage ? { image: true } : {}),
              ...(modalityVideo ? { video: true } : {}),
              ...(modalityAudio ? { audio: true } : {}),
              ...(modalityPdf ? { pdf: true } : {}),
            },
          }
        : {}),
      ...(contextWindow.trim() && !invalidTokenLimit(contextWindow)
        ? { contextWindowSize: Number(contextWindow) }
        : {}),
      ...(purpose === 'chat' &&
      maxTokens.trim() &&
      !invalidTokenLimit(maxTokens)
        ? { maxTokens: Number(maxTokens) }
        : {}),
    };
    return config;
  }, [
    steps,
    purpose,
    thinking,
    modality,
    modalityImage,
    modalityVideo,
    modalityAudio,
    modalityPdf,
    contextWindow,
    maxTokens,
  ]);

  const validateAdvanced = useCallback(() => {
    if (!steps.includes('advancedConfig')) return true;
    if (
      purpose === 'voice' &&
      (protocol !== 'openai' ||
        wireApi === 'responses' ||
        !normalizeModelIds(models).every(isVoiceModelId))
    ) {
      setError(t('auth.purpose.voiceHint'));
      return false;
    }
    if (purpose === 'image') {
      try {
        const url = new URL(baseUrl.trim());
        if (url.protocol !== 'https:' || url.search || url.hash)
          throw new Error();
      } catch {
        setError(t('auth.purpose.imageHint'));
        return false;
      }
    }
    for (const [value, label] of [
      [contextWindow, 'auth.advanced.contextWindow'],
      [purpose === 'chat' ? maxTokens : '', 'auth.advanced.maxTokens'],
    ]) {
      if (invalidTokenLimit(value)) {
        setError(t('auth.advanced.tokenLimitInvalid', { field: t(label) }));
        return false;
      }
    }
    if (
      purpose === 'chat' &&
      modality &&
      !modalityImage &&
      !modalityVideo &&
      !modalityAudio &&
      !modalityPdf
    ) {
      setError(t('auth.advanced.modalitiesRequired'));
      return false;
    }
    return true;
  }, [
    purpose,
    protocol,
    wireApi,
    models,
    baseUrl,
    steps,
    contextWindow,
    maxTokens,
    modality,
    modalityImage,
    modalityVideo,
    modalityAudio,
    modalityPdf,
    t,
  ]);

  const save = useCallback(() => {
    if (!provider || saving || !validateAdvanced()) return;
    const owner = ownerRef.current;
    const operation = ++saveOperationRef.current;
    const isCurrent = () =>
      saveOperationRef.current === operation && owner.isCurrent();
    setSaving(true);
    setError(null);
    workspaceActions
      .installAuthProvider({
        providerId: provider.id,
        protocol,
        ...(protocol === 'openai' && provider.steps.includes('wireApi')
          ? { wireApi }
          : {}),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        modelIds: normalizeModelIds(models),
        advancedConfig,
      })
      .then((result) => {
        if (!isCurrent()) return;
        onMessage(
          result.runtimeSync?.status === 'failed'
            ? `${result.message}\n\n${t('settings.models.runtimeSyncFailed')}`
            : result.message,
        );
        onClose();
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        onMessage(message, 'error');
      })
      .finally(() => {
        if (isCurrent()) setSaving(false);
      });
  }, [
    wireApi,
    apiKey,
    baseUrl,
    advancedConfig,
    validateAdvanced,
    models,
    onClose,
    onMessage,
    protocol,
    provider,
    saving,
    t,
    workspaceActions,
  ]);

  const goNext = useCallback(() => {
    if (!provider || saving) return;
    if (currentStep === 'baseUrl') {
      const onDaemonHost = provider.uiGroup === 'local';
      const port = onDaemonHost ? localPortUrl(baseUrl) : undefined;
      const effective =
        port ??
        (baseUrl.trim() ||
          (onDaemonHost ? '' : defaultBaseUrl(protocol, wireApi)));
      if (!effective) {
        setError(t('auth.baseUrlRequired'));
        return;
      }
      if (!/^https?:\/\//i.test(effective)) {
        setError(t('auth.baseUrlInvalid'));
        return;
      }
      if (effective !== baseUrl.trim()) setBaseUrl(effective);
    }
    if (currentStep === 'apiKey' && apiKey.trim().length === 0) {
      setError(t('auth.apiKeyRequired'));
      return;
    }
    if (currentStep === 'models' && normalizeModelIds(models).length === 0) {
      setError(t('auth.modelsRequired'));
      return;
    }
    if (currentStep === 'advancedConfig' && !validateAdvanced()) return;
    setError(null);
    if (stepIndex >= steps.length - 1) {
      if (shouldReview) {
        setView('review');
      } else {
        save();
      }
    } else {
      setStepIndex((idx) => idx + 1);
      setOptionIndex(0);
    }
  }, [
    wireApi,
    apiKey,
    baseUrl,
    currentStep,
    models,
    saving,
    validateAdvanced,
    protocol,
    provider,
    save,
    shouldReview,
    stepIndex,
    steps.length,
    t,
  ]);

  const selectGroup = useCallback(
    (group: AuthGroup | undefined) => {
      if (!group) return;
      if (group.id === 'custom') {
        const customProvider = group.providerIds
          .map((id: string) =>
            catalog?.providers.find(
              (item: DaemonAuthProviderDescriptor) => item.id === id,
            ),
          )
          .find(
            (
              item: DaemonAuthProviderDescriptor | undefined,
            ): item is DaemonAuthProviderDescriptor => !!item,
          );
        if (customProvider) startProvider(customProvider, 'groups');
        return;
      }
      if (group.id === 'local') probeLocalServers();
      setGroupId(group.id);
      setProviderIndex(0);
      setView('providers');
    },
    [catalog, probeLocalServers, startProvider],
  );

  /** A provider that cannot be chosen now: coming soon, or not running. */
  const isUnavailable = useCallback(
    (item: DaemonAuthProviderDescriptor) =>
      item.comingSoon === true ||
      (item.localProbe !== undefined && !probeOf(item)?.running),
    [probeOf],
  );

  const selectRow = useCallback(
    (row: ProviderRow | undefined) => {
      if (!row) return;
      if (row.kind === 'family') {
        setFamilyId(row.family.id);
        setFamilyIndex(0);
        setView('family');
        return;
      }
      if (isUnavailable(row.provider)) return;
      startProvider(row.provider, 'providers', probeOf(row.provider)?.models);
    },
    [isUnavailable, probeOf, startProvider],
  );

  const activate = useCallback(() => {
    if (view === 'groups') {
      selectGroup(groups[groupIndex]);
      return;
    }
    if (view === 'providers') {
      selectRow(rows[providerIndex]);
      return;
    }
    if (view === 'family') {
      const selected = familyProviders[familyIndex];
      if (selected) startProvider(selected, 'family');
      return;
    }
    if (view === 'review') {
      save();
      return;
    }
    if (!provider || !currentStep) return;
    if (currentStep === 'protocol') {
      const value = protocolOptions[optionIndex]?.value;
      if (value) {
        setProtocol(value);
        setWireApi('chat-completions');
        if (!provider.baseUrl) setBaseUrl(defaultBaseUrl(value));
      }
      goNext();
      return;
    }
    if (currentStep === 'wireApi') {
      const nextWireApi: ModelWireApi =
        optionIndex === 1 ? 'responses' : 'chat-completions';
      // A wire change re-derives the default endpoint; a no-op re-selection
      // must not clobber a baseUrl the user already typed.
      if (
        nextWireApi !== wireApi &&
        !provider.baseUrl &&
        baseUrl === defaultBaseUrl(protocol, wireApi)
      ) {
        setBaseUrl(defaultBaseUrl(protocol, nextWireApi));
      }
      setWireApi(nextWireApi);
      goNext();
      return;
    }
    if (currentStep === 'baseUrl' && Array.isArray(provider.baseUrl)) {
      const selected = provider.baseUrl[optionIndex];
      if (selected) setBaseUrl(selected.url);
      goNext();
      return;
    }
    goNext();
  }, [
    wireApi,
    baseUrl,
    currentStep,
    familyIndex,
    familyProviders,
    goNext,
    groupIndex,
    groups,
    optionIndex,
    provider,
    providerIndex,
    protocol,
    protocolOptions,
    rows,
    save,
    selectGroup,
    selectRow,
    startProvider,
    view,
  ]);

  const activateAtIndex = useCallback(
    (index: number) => {
      if (view === 'groups') {
        selectGroup(groups[index]);
        return;
      }
      if (view === 'providers') {
        selectRow(rows[index]);
        return;
      }
      if (view === 'family') {
        const selected = familyProviders[index];
        if (selected) startProvider(selected, 'family');
        return;
      }
      if (!provider || !currentStep) {
        if (view === 'review') save();
        return;
      }
      if (currentStep === 'protocol') {
        const value = protocolOptions[index]?.value;
        if (value) {
          setProtocol(value);
          setWireApi('chat-completions');
          if (!provider.baseUrl) setBaseUrl(defaultBaseUrl(value));
        }
        goNext();
        return;
      }
      if (currentStep === 'wireApi') {
        const nextWireApi: ModelWireApi =
          index === 1 ? 'responses' : 'chat-completions';
        if (
          nextWireApi !== wireApi &&
          !provider.baseUrl &&
          baseUrl === defaultBaseUrl(protocol, wireApi)
        ) {
          setBaseUrl(defaultBaseUrl(protocol, nextWireApi));
        }
        setWireApi(nextWireApi);
        goNext();
        return;
      }
      if (currentStep === 'baseUrl' && Array.isArray(provider.baseUrl)) {
        const selected = provider.baseUrl[index];
        if (selected) setBaseUrl(selected.url);
        goNext();
        return;
      }
    },
    [
      wireApi,
      baseUrl,
      currentStep,
      familyProviders,
      goNext,
      groups,
      provider,
      protocol,
      protocolOptions,
      rows,
      save,
      selectGroup,
      selectRow,
      startProvider,
      view,
    ],
  );

  const renderOptions = <T extends string>(
    options: Array<Option<T>>,
    selected: number,
    onSelect: (index: number) => void,
  ) => (
    <div className={styles.options}>
      {options.map((option, index) => (
        <button
          type="button"
          key={option.value}
          disabled={saving || option.disabled}
          className={`${styles.option} ${selected === index ? styles.optionActive : ''}`}
          onClick={() => {
            onSelect(index);
            activateAtIndex(index);
          }}
        >
          <div className={styles.optionText}>
            <div className={styles.label}>
              {option.label}
              {option.badge && (
                <span
                  className={`${styles.badge} ${
                    option.badge.tone === 'warning'
                      ? styles.badgeWarning
                      : option.badge.tone === 'success'
                        ? styles.badgeSuccess
                        : ''
                  }`}
                >
                  {option.badge.text}
                </span>
              )}
            </div>
            {option.description && (
              <div className={styles.description}>{option.description}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  );

  const renderStep = () => {
    if (!provider || !currentStep) return null;
    if (currentStep === 'protocol') {
      return renderOptions(protocolOptions, optionIndex, setOptionIndex);
    }
    if (currentStep === 'wireApi') {
      return renderOptions(apiOptions, optionIndex, setOptionIndex);
    }
    if (currentStep === 'baseUrl') {
      if (Array.isArray(provider.baseUrl)) {
        return renderOptions(
          provider.baseUrl.map((option: DaemonAuthProviderBaseUrlOption) => ({
            value: option.url,
            label: option.label,
            description: option.url,
          })),
          optionIndex,
          setOptionIndex,
        );
      }
      const onDaemonHost = provider.uiGroup === 'local';
      return (
        <>
          <div className={styles.text}>
            {onDaemonHost
              ? t('auth.local.portPrompt')
              : t('auth.baseUrlPrompt')}
          </div>
          <input
            className={styles.input}
            value={baseUrl}
            aria-label={
              onDaemonHost ? t('auth.step.port') : t('auth.step.baseUrl')
            }
            disabled={saving}
            placeholder={
              onDaemonHost ? '8080' : defaultBaseUrl(protocol, wireApi)
            }
            onChange={(event) => {
              setBaseUrl(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                goNext();
              }
            }}
            autoFocus
          />
          {provider.documentationUrl && (
            <a
              className={styles.link}
              href={provider.documentationUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) =>
                openExternalLink(event, provider.documentationUrl)
              }
            >
              {t('auth.documentation')}
            </a>
          )}
        </>
      );
    }
    if (currentStep === 'apiKey') {
      return (
        <>
          {provider.documentationUrl && (
            <a
              className={styles.link}
              href={provider.documentationUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) =>
                openExternalLink(event, provider.documentationUrl)
              }
            >
              {t('auth.documentation')}: {provider.documentationUrl}
            </a>
          )}
          <input
            className={styles.input}
            type="password"
            value={apiKey}
            aria-label={t('auth.step.apiKey')}
            autoComplete="new-password"
            disabled={saving}
            placeholder={
              provider.apiKeyPlaceholder ?? t('auth.apiKeyPlaceholder')
            }
            onChange={(event) => {
              setApiKey(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                goNext();
              }
            }}
            autoFocus
          />
          <div className={styles.muted}>{t('auth.apiKeyHint')}</div>
        </>
      );
    }
    if (currentStep === 'models') {
      const defaultIds = modelIds(provider);
      return (
        <>
          {defaultIds && (
            <div className={styles.muted}>
              {t('auth.modelsPrompt', { modelIds: defaultIds })}
            </div>
          )}
          <input
            className={styles.input}
            value={models}
            aria-label={t('auth.step.models')}
            disabled={saving}
            placeholder={defaultIds || t('auth.modelsPlaceholder')}
            onChange={(event) => {
              setModels(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                goNext();
              }
            }}
            autoFocus
          />
        </>
      );
    }
    return (
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-purpose`}>
            {t('auth.purpose.label')}
          </FieldLabel>
          <Select
            value={purpose}
            disabled={saving}
            onValueChange={(value) => {
              setPurpose(value as typeof purpose);
              setError(null);
            }}
          >
            <SelectTrigger
              id={`${fieldId}-purpose`}
              aria-label={t('auth.purpose.label')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['chat', 'image', 'voice'] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`auth.purpose.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {purpose !== 'chat' && (
            <FieldDescription>
              {t(`auth.purpose.${purpose}Hint`)}
            </FieldDescription>
          )}
        </Field>

        <p className="text-sm text-muted-foreground">
          {t('auth.advanced.prompt')}
        </p>
        {purpose === 'chat' &&
          (
            [
              [
                'thinking',
                thinking,
                setThinking,
                'auth.advanced.thinking',
                'auth.advanced.thinkingDesc',
              ],
              [
                'modality',
                modality,
                setModality,
                'auth.advanced.modality',
                'auth.advanced.modalityDesc',
              ],
            ] as const
          ).map(([key, checked, setChecked, label, description]) => (
            <Field orientation="horizontal" key={key}>
              <FieldContent>
                <FieldLabel htmlFor={`${fieldId}-${key}`}>
                  {t(label)}
                </FieldLabel>
                <FieldDescription id={`${fieldId}-${key}-hint`}>
                  {t(description)}
                </FieldDescription>
              </FieldContent>
              <Switch
                id={`${fieldId}-${key}`}
                checked={checked}
                disabled={saving || purpose !== 'chat'}
                aria-label={t(label)}
                aria-describedby={`${fieldId}-${key}-hint`}
                onCheckedChange={(value) => {
                  setChecked(value);
                  setError(null);
                }}
              />
            </Field>
          ))}
        {purpose === 'chat' && modality && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                [
                  'image',
                  modalityImage,
                  setModalityImage,
                  'auth.advanced.modalityImage',
                ],
                [
                  'video',
                  modalityVideo,
                  setModalityVideo,
                  'auth.advanced.modalityVideo',
                ],
                [
                  'audio',
                  modalityAudio,
                  setModalityAudio,
                  'auth.advanced.modalityAudio',
                ],
                [
                  'pdf',
                  modalityPdf,
                  setModalityPdf,
                  'auth.advanced.modalityPdf',
                ],
              ] as const
            ).map(([key, checked, setChecked, label]) => (
              <Field orientation="horizontal" key={key}>
                <Checkbox
                  id={`${fieldId}-${key}`}
                  checked={checked}
                  disabled={saving || purpose !== 'chat'}
                  onCheckedChange={(value) => {
                    setChecked(value === true);
                    setError(null);
                  }}
                />
                <FieldLabel htmlFor={`${fieldId}-${key}`}>
                  {t(label)}
                </FieldLabel>
              </Field>
            ))}
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              [
                'context',
                contextWindow,
                setContextWindow,
                'auth.advanced.contextWindow',
                'auth.advanced.contextDesc',
              ],
              [
                'output',
                maxTokens,
                setMaxTokens,
                'auth.advanced.maxTokens',
                'auth.advanced.maxTokensDesc',
              ],
            ] as const
          )
            .filter(([key]) => purpose === 'chat' || key === 'context')
            .map(([key, value, setValue, label, description]) => (
              <Field key={key} data-invalid={invalidTokenLimit(value)}>
                <FieldLabel htmlFor={`${fieldId}-${key}`}>
                  {t(label)}
                </FieldLabel>
                <Input
                  id={`${fieldId}-${key}`}
                  aria-label={t(label)}
                  inputMode="numeric"
                  value={value}
                  placeholder={t('common.auto')}
                  disabled={saving || (key === 'output' && purpose !== 'chat')}
                  aria-invalid={invalidTokenLimit(value)}
                  aria-describedby={`${fieldId}-${key}-hint`}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                      goNext();
                    }
                  }}
                />
                <FieldDescription id={`${fieldId}-${key}-hint`}>
                  {invalidTokenLimit(value)
                    ? t('auth.advanced.tokenLimitInvalid', { field: t(label) })
                    : t(description)}
                </FieldDescription>
              </Field>
            ))}
        </div>
      </FieldGroup>
    );
  };

  const review = provider
    ? [
        [t('auth.step.provider'), t(provider.label)],
        [
          t('auth.step.protocol'),
          getProtocolOptions(t).find((option) => option.value === protocol)
            ?.label ?? protocol,
        ],
        ...(steps.includes('wireApi')
          ? [
              [
                t('auth.step.api'),
                apiOptions.find((option) => option.value === wireApi)?.label ??
                  wireApi,
              ],
            ]
          : []),
        [t('auth.step.baseUrl'), baseUrl.trim()],
        [
          t('auth.step.apiKey'),
          apiKey.trim() ? t('auth.apiKeySet') : t('auth.notSet'),
        ],
        [t('auth.step.models'), normalizeModelIds(models).join(', ')],
        ...(steps.includes('advancedConfig')
          ? [[t('auth.purpose.label'), t(`auth.purpose.${purpose}`)]]
          : []),
        ...(steps.includes('advancedConfig')
          ? [
              [
                t('auth.advanced.thinking'),
                advancedConfig?.enableThinking
                  ? t('common.enabled')
                  : t('auth.advanced.defaults'),
              ],
              [
                t('auth.advanced.modality'),
                (
                  [
                    ['image', 'auth.advanced.modalityImage'],
                    ['video', 'auth.advanced.modalityVideo'],
                    ['audio', 'auth.advanced.modalityAudio'],
                    ['pdf', 'auth.advanced.modalityPdf'],
                  ] as const
                )
                  .filter(([key]) => advancedConfig?.multimodal?.[key])
                  .map(([, label]) => t(label))
                  .join(', ') || t('auth.advanced.defaults'),
              ],
              [
                t('auth.advanced.contextWindow'),
                advancedConfig?.contextWindowSize ??
                  t('auth.advanced.defaults'),
              ],
              [
                t('auth.advanced.maxTokens'),
                advancedConfig?.maxTokens ?? t('auth.advanced.defaults'),
              ],
            ]
          : []),
      ]
    : [];

  const stepItems = useMemo(() => {
    const items = [t('auth.step.group'), t('auth.step.provider')];
    if (provider) {
      items.push(
        ...steps.map((step) => titleForStep(step as AuthStep, provider, t)),
      );
      if (shouldReview) items.push(t('auth.review'));
    }
    return items;
  }, [provider, shouldReview, steps, t]);

  const activeStep = useMemo(() => {
    if (view === 'groups') return 1;
    if (view === 'providers' || view === 'family') return 2;
    if (view === 'step') return Math.min(3 + stepIndex, stepItems.length);
    return stepItems.length;
  }, [stepIndex, stepItems.length, view]);

  const body = (() => {
    if (loading)
      return <div className={styles.muted}>{t('common.loading')}</div>;
    if (view === 'groups') {
      return (
        <>
          {renderOptions(
            groups.map((group: AuthGroup) => ({
              value: group.id,
              label: translated(`auth.group.${group.id}`, group.label),
              description: translated(
                `auth.group.${group.id}Desc`,
                group.description,
              ),
            })),
            groupIndex,
            setGroupIndex,
          )}
          <div className={styles.terms}>
            <div>{t('auth.termsTitle')}:</div>
            <a
              className={styles.link}
              href={TOS_PRIVACY_URL}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => openExternalLink(event, TOS_PRIVACY_URL)}
            >
              {TOS_PRIVACY_URL}
            </a>
          </div>
        </>
      );
    }
    if (view === 'providers') {
      const options = rows.map((row): Option<string> => {
        if (row.kind === 'family') {
          return {
            value: `family:${row.family.id}`,
            label: t(row.family.label),
            description: t(row.family.description),
          };
        }
        const item = row.provider;
        const option: Option<string> = {
          value: item.id,
          label: t(item.label),
          description: t(item.description),
          disabled: isUnavailable(item),
        };
        if (item.comingSoon) {
          return {
            ...option,
            badge: { text: t('auth.comingSoon'), tone: 'warning' },
          };
        }
        // The path already names OrganizaOne: its key entry says what to do.
        if (groupId === 'organizaone') {
          return {
            ...option,
            label: t('auth.organizaone.apiKey'),
            description: t('auth.organizaone.apiKeyDesc'),
          };
        }
        if (!item.localProbe) return option;
        const probe = probeOf(item);
        return {
          ...option,
          badge:
            localServers === null
              ? { text: t('auth.local.looking') }
              : probe?.running
                ? {
                    text: `${DOT} ${t('auth.local.detected', {
                      count: probe.models.length,
                    })}`,
                    tone: 'success',
                  }
                : { text: `${HOLLOW} ${t('auth.local.notRunning')}` },
        };
      });
      return (
        <>
          {renderOptions(options, providerIndex, setProviderIndex)}
          {groupId === 'local' && (
            <button
              type="button"
              className={styles.actionButton}
              disabled={saving || localServers === null}
              onClick={probeLocalServers}
            >
              {t('auth.local.lookAgain')}
            </button>
          )}
        </>
      );
    }
    if (view === 'family') {
      return renderOptions(
        familyProviders.map((item: DaemonAuthProviderDescriptor) => ({
          value: item.id,
          label: t(item.label),
          description: t(item.description),
        })),
        familyIndex,
        setFamilyIndex,
      );
    }
    if (view === 'step') return renderStep();
    return (
      <>
        <div className={styles.text}>{t('auth.reviewText')}</div>
        <dl className="grid gap-3 rounded-lg border border-border bg-background p-4 text-sm">
          {review.map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 break-words [overflow-wrap:anywhere]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {provider?.showAdvancedConfig && (
          <div className={styles.text}>{t(`auth.purpose.${purpose}Hint`)}</div>
        )}
      </>
    );
  })();

  const primaryAction = () => {
    if (view === 'review') {
      save();
      return;
    }
    if (isInputStep || currentStep === 'advancedConfig') {
      goNext();
      return;
    }
    activate();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.steps}>
        {stepItems.map((label, index) => {
          const stepNumber = index + 1;
          return (
            <div
              key={`${stepNumber}:${label}`}
              className={`${styles.stepPill} ${
                stepNumber === activeStep ? styles.stepPillActive : ''
              } ${stepNumber < activeStep ? styles.stepPillDone : ''}`}
            >
              <span className={styles.stepNumber}>{stepNumber}</span>
              <span className={styles.stepLabel}>{label}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.body}>{body}</div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={goBack}
          disabled={view === 'groups' || loading || saving}
        >
          {t('common.previous')}
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={primaryAction}
          disabled={loading || saving}
        >
          {view === 'review'
            ? saving
              ? t('auth.saving')
              : t('auth.save')
            : t('common.next')}
        </button>
      </div>
    </div>
  );
}
