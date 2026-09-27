/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Types
export type {
  BaseUrlOption,
  ModelSpec,
  ProviderId,
  ProviderConfig,
  ProviderCredentialStore,
  ProviderInstallPlan,
  ProviderInstallState,
  ProviderModelConfig,
  ProviderModelProvidersPatch,
  ProviderSettingsAdapter,
  ProviderFamily,
  ProviderSetupInputs,
  UiGroup,
} from './types.js';

// Provider config utilities
export {
  buildInstallPlan,
  buildProviderTemplate,
  computeModelListVersion,
  findExistingProviderModels,
  getModelsForProviderProtocol,
  getDefaultBaseUrlForProtocol,
  getDefaultModelIds,
  providerMatchesCredentials,
  PROVIDER_METADATA_NS,
  resolveBaseUrl,
  resolveMetadataKey,
  requiresApiKey,
  resolveOwnsModel,
  shouldShowStep,
} from './provider-config.js';

export { checkProviderKey, discoverProviderModels } from './model-discovery.js';
export type { ProviderKeyCheck, ProviderProtocol } from './model-discovery.js';

// Local model servers
export {
  LMSTUDIO_BASE_URL,
  OLLAMA_BASE_URL,
  probeLocalServers,
  probeOpenAiServer,
} from './local-servers.js';
export type {
  LocalServerId,
  LocalServerProbe,
  OpenAiServerProbe,
  ProbeOptions,
} from './local-servers.js';

// Credential store
export {
  credentialIdForProvider,
  isValidCredentialId,
  listCredentials,
  readCredential,
  readSavedApiKey,
  removeCredential,
  resolveApiKey,
  writeCredential,
} from './credential-store.js';
export type { StoredCredential } from './credential-store.js';
export {
  exportSavedCredentials,
  resolveModelApiKey,
  resolveSavedModelApiKey,
} from './model-api-key.js';
export type { ModelKeyReference } from './model-api-key.js';

// Provider registry
export {
  ALL_PROVIDERS,
  alibabaStandardProvider,
  anthropicProvider,
  codingPlanProvider,
  CUSTOM_API_KEY_ENV_PREFIX,
  customProvider,
  deepseekProvider,
  findProviderByCredentials,
  findProviderById,
  generateCustomCredentialId,
  generateCustomEnvKey,
  geminiProvider,
  getAllProviderBaseUrls,
  getMenuRows,
  grokProvider,
  lmstudioProvider,
  localOpenAiProvider,
  minimaxProvider,
  modelscopeProvider,
  moonshotProvider,
  ollamaProvider,
  openaiProvider,
  organizaoneAippProvider,
  organizaoneLoginProvider,
  organizaoneProvider,
  PROVIDERS_BY_GROUP,
  tokenPlanProvider,
  zaiProvider,
} from './all-providers.js';
export type { MenuRow } from './all-providers.js';
export { MODELSTUDIO_FAMILY } from './presets/modelstudio-family.js';

// Preset constants
export {
  CODING_PLAN_CHINA_BASE_URL,
  CODING_PLAN_ENV_KEY,
  CODING_PLAN_GLOBAL_BASE_URL,
} from './presets/alibaba-coding-plan.js';
export {
  TOKEN_PLAN_BASE_URL,
  TOKEN_PLAN_CHINA_BASE_URL,
  TOKEN_PLAN_ENV_KEY,
  TOKEN_PLAN_GLOBAL_BASE_URL,
} from './presets/alibaba-token-plan.js';
export { GROK_BASE_URL, GROK_ENV_KEY } from './presets/grok.js';
export {
  ORGANIZAONE_ANTHROPIC_BASE_URL,
  ORGANIZAONE_ENV_KEY,
  ORGANIZAONE_OPENAI_BASE_URL,
} from './presets/organizaone.js';
export { LOCAL_API_KEY_PLACEHOLDER } from './presets/local-openai.js';

// Install logic
export {
  applyProviderInstallPlan,
  ProviderInstallError,
  type ApplyProviderInstallPlanOptions,
  type ApplyProviderInstallPlanResult,
} from './install.js';

export { preserveModelProviderPlaceholders } from './model-config-serialization.js';
