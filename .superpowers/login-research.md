# Login redesign research — "Connect a provider"

Read-only research, no edits/builds/tests run. Decisions referenced from
`docs/fork/ROADMAP.md:121-147` ("Connect a provider: new login").

## Part 1 — current flow, from the code

### 1.1 The dialog and its state machine

- `packages/cli/src/ui/auth/AuthDialog.tsx` (450 lines) — top-level dialog,
  three menu levels: `main` (`MAIN_ITEMS`, lines 59-85: Alibaba ModelStudio /
  Third-party Providers / Custom Provider), `alibaba-select` /
  `thirdparty-select` (data-driven sub-menus from `ALIBABA_PROVIDERS` /
  `THIRD_PARTY_PROVIDERS`, lines 188-250), `provider-setup` (delegates to
  `ProviderSetupSteps`). View stack/back nav: `pushView`/`goBack` (166-184).
  Default landing tab from the active provider's `uiGroup` via
  `findProviderByCredentials` (256-270). Step counter from
  `getAuthStepPosition` (325-350). Terms/privacy link on the main menu only
  (428-446), URL from `repoDocUrl('users/support/tos-privacy.md')`.
- `packages/cli/src/ui/auth/useProviderSetupFlow.ts` (666 lines) — generic
  step-machine hook. `SetupStep` union: `protocol | wireApi | baseUrl |
apiKey | models | advancedConfig | review` (35-52); `getVisibleSteps`
  filters `STEP_ORDER` per provider via core's `shouldShowStep`. Holds all
  step state and exposes `start/goBack/selectProtocol/selectWireApi/
selectBaseUrl/submitBaseUrl/submitApiKey/rejectApiKey/submitModelIds/
submitAdvancedConfig/submit`. `buildPreview` (561-602) calls
  `buildInstallPlan` to render the review-step JSON, catching refusals as
  `previewError` instead of throwing into React.
- `packages/cli/src/ui/auth/ProviderSetupSteps.tsx` (1281 lines) — renders
  each step: `BaseUrlSelectStep`/`BaseUrlInputStep` (66-142), `ApiKeyStep`
  (148-255, calls `checkProviderKey` on submit, blocks a second Enter while
  checking, a once-refused key can be accepted unverified on a second
  Enter), `ModelIdsStep` (359-732, the search + checkbox picker —
  `MAX_MODELS_TO_SHOW = 8`, up/down/space/tab handling, `mergeModelIds`),
  `DiscoveringModelIdsStep` (786-921, wraps `ModelIdsStep` while
  `checkProviderKey` resolves; ctrl+r re-fetches, guarded by `canFetchAgain =
source === 'fallback' && protocol !== 'gemini'`), `AdvancedConfigStep`
  (927-1033, thinking/modality/context-window toggles), `ReviewStep`
  (1067-1113, masked key via `abbreviateKey` + JSON preview).
- `packages/cli/src/ui/auth/useAuth.ts` (340 lines) — the `/auth` command
  controller: `handleProviderSubmit` builds the plan, calls
  `applyProviderInstallPlan`, emits `AuthEvent` telemetry. Validates
  `O1CODE_DEFAULT_AUTH_TYPE` against `AuthType` (266-283). Exposes
  `AuthUiState.externalAuthState` (title/message/detail) for a generic
  "waiting for external auth" screen (see 1.4).
- Small helpers: `auth-step-position.ts` (38 lines), `mask-key.ts` (31
  lines, `maskKey`/`abbreviateKey`, 8 head / 4 tail chars visible). Each has
  a matching `.test.ts`/`.test.tsx`, alongside `AuthDialog.test.tsx`,
  `ProviderSetupSteps.test.tsx`, `use-provider-setup-flow.test.ts`, and
  `useAuth.test.ts` (all under `packages/cli/src/ui/auth/`).

### 1.2 Core modules the dialog drives

- `packages/core/src/providers/types.ts` — `ProviderConfig`, the declarative
  shape every preset implements: `id`, `label`, `description`, `protocol`
  (`AuthType`), `baseUrl` (fixed string | `BaseUrlOption[]` | undefined for
  free entry), `envKey` (string or `(protocol, baseUrl) => string`),
  `models?` (`ModelSpec[]`), `modelsEditable?`, `supportsModelDiscovery?`,
  `modelNamePrefix`, `protocolOptions?`, `showAdvancedConfig?`,
  `validateApiKey?`, `apiKeyPlaceholder?`, `customHeaders?`,
  `documentationUrl?`, `ownsModel?`, `mergeModelsByIdentity?`, `webSearch?`,
  `uiGroup?`, `uiLabels?`. Also `ProviderSetupInputs`, `ProviderInstallPlan`,
  `ProviderSettingsAdapter` (the abstraction the CLI's `LoadedSettings` and
  the VS Code file adapter both implement).
- `packages/core/src/providers/provider-config.ts` (891 lines) — logic
  layer: `buildInstallPlan` (assembles env + modelProviders patch + model
  selection, handling wire-API stamping and credential/purpose conflicts),
  `resolveBaseUrl`, `getDefaultBaseUrlForProtocol` (fixed table, 599-612:
  openai → `https://api.openai.com/v1`, openai-responses →
  `https://api.openai.com`, anthropic → `https://api.anthropic.com/v1`,
  gemini → `https://generativelanguage.googleapis.com`), `shouldShowStep`,
  `providerMatchesCredentials`, `findExistingProviderModels`.
- `packages/core/src/providers/install.ts` (709 lines) —
  `applyProviderInstallPlan`: writes `env.<KEY>` and
  `modelProviders.<authType>` into settings, guards against overwriting a
  service (image/voice) model's role, denies process-altering env vars
  (`DENY_ENV_KEYS`: `NODE_OPTIONS`, `LD_PRELOAD`, `PATH`, `HOME`, etc.,
  34-46), snapshots/rolls back on failure, then calls
  `reloadModelProviders`/`syncAuthState`/`refreshAuth`. No secret-store
  integration — everything lands in `settings.json` and `process.env`.
- `packages/core/src/providers/model-discovery.ts` (246 lines, see 1.6);
  `all-providers.ts` (the registry, see 1.3); `index.ts` (public re-exports).

### 1.3 Provider presets registered today

`packages/core/src/providers/all-providers.ts:51-64` — `ALL_PROVIDERS` array,
in display order: `codingPlanProvider`, `tokenPlanProvider`,
`alibabaStandardProvider`, `deepseekProvider`, `grokProvider`,
`minimaxProvider`, `zaiProvider`, `moonshotProvider`, `modelscopeProvider`,
`openRouterProvider`, `requestyProvider`, `customProvider`. Filtered into
`ALIBABA_PROVIDERS` (`uiGroup === 'alibaba'`) and `THIRD_PARTY_PROVIDERS`
(`uiGroup === 'third-party'`); `customProvider` has `uiGroup: 'custom'` and is
reached directly from the main menu, not a sub-list.

Per-preset facts (`packages/core/src/providers/presets/*.ts`):

| file                     | id                         | envKey                                    | baseUrl                                                                                                         | uiGroup       |
| ------------------------ | -------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------- |
| `alibaba-standard.ts`    | `alibabaStandard`          | `DASHSCOPE_API_KEY`                       | 4-region options                                                                                                | `alibaba`     |
| `alibaba-coding-plan.ts` | coding plan                | `CODING_PLAN_ENV_KEY`                     | 2 options                                                                                                       | `alibaba`     |
| `alibaba-token-plan.ts`  | token plan                 | `TOKEN_PLAN_ENV_KEY`                      | 3 options                                                                                                       | `alibaba`     |
| `deepseek.ts`            | `deepseek`                 | `DEEPSEEK_API_KEY`                        | fixed `api.deepseek.com`                                                                                        | `third-party` |
| `grok.ts`                | `grok`                     | `XAI_API_KEY`                             | fixed `api.x.ai/v1`, 6 editable built-ins                                                                       | `third-party` |
| `minimax.ts`             | `minimax`                  | `MINIMAX_API_KEY`                         | 2-region, +2 `imageOnly` models                                                                                 | `third-party` |
| `zai.ts`                 | `zai`                      | `ZAI_API_KEY`                             | standard-api-key / coding-plan options                                                                          | `third-party` |
| `moonshot.ts`            | `moonshot`                 | `MOONSHOT_API_KEY`                        | international/china options                                                                                     | `third-party` |
| `modelscope.ts`          | `modelscope`               | `MODELSCOPE_API_KEY`                      | fixed `api-inference.modelscope.cn/v1`                                                                          | `third-party` |
| `openrouter.ts`          | `openrouter`               | `OPENROUTER_ENV_KEY`                      | fixed; `customHeaders`; special-cased in `checkProviderKey` (`isOpenRouter`, verifies via `/key` not `/models`) | `third-party` |
| `requesty.ts`            | `requesty`                 | `REQUESTY_ENV_KEY`                        | fixed; `customHeaders`                                                                                          | `third-party` |
| `custom-provider.ts`     | `custom-openai-compatible` | `generateCustomEnvKey` (SHA-256-suffixed) | free entry; `protocolOptions: [OPENAI,ANTHROPIC,GEMINI]`                                                        | `custom`      |

All presets use `protocol: USE_OPENAI` except the custom provider's
`protocolOptions`. Preset tests:
`packages/core/src/providers/__tests__/presets/*.test.ts` (one per preset
except alibaba-coding-plan) plus `provider-config.test.ts`, `install.test.ts`,
`model-discovery.test.ts`, `released-responses.test.ts`.

**Gap vs. the new "API key" menu** (`ROADMAP.md:137-139`, Main:
Anthropic/OpenAI/Google Gemini/xAI, Others: DeepSeek/Kimi/Z.AI/MiniMax/
Alibaba/ModelScope): **no preset exists for Anthropic, OpenAI, or Google
Gemini** as a one-click card — only reachable via `custom-provider.ts`'s
`protocolOptions`, with no fixed label/baseUrl/model-list/documentation card
the way DeepSeek or Grok get. xAI already has a preset (`grok.ts`); all six
"Others" already have presets. `openrouter.ts`/`requesty.ts` exist but the
roadmap says they "go (reachable through custom)" — drop from the picker,
keep the protocol support.

### 1.4 Credentials, AuthType, and the env-key table

- `AuthType` enum — `packages/core/src/utils/auth-type.ts:8-14`:
  `USE_OPENAI='openai'`, `USE_OPENAI_RESPONSES='openai-responses'`,
  `USE_GEMINI='gemini'`, `USE_VERTEX_AI='vertex-ai'`,
  `USE_ANTHROPIC='anthropic'`. **No OAuth/device-code auth types remain** —
  the enum is API-key/ADC only.
- Storage today: **no per-provider credential file.** Everything lands in
  `settings.json`: API keys under `env.<ENV_KEY>` (and `process.env` at
  runtime) via `applyProviderInstallPlan`
  (`packages/core/src/providers/install.ts:377-395`); model lists under
  `modelProviders.<authType>`
  (`packages/cli/src/config/settingsSchema.ts:355-365`, `mergeStrategy:
REPLACE`); selected auth type under `security.auth.selectedType`
  (`settingsSchema.ts:3293`); a legacy single-key/baseUrl fallback under
  `security.auth.apiKey`/`security.auth.baseUrl`
  (`install.ts:524-533`, `auth.ts:194-201`). `packages/core/src/config/storage.ts`
  (the `Storage` class for `~/.o1-code/`) has **no `credentials` concept** —
  `grep -r credentials packages/core/src/utils/paths.ts` finds nothing. The
  `~/.o1-code/credentials/` per-provider store from the roadmap is new work.
- The env-key/pre-flight table lives in **`packages/cli/src/config/auth.ts`**,
  not a file named `authPreflight`: `DEFAULT_ENV_KEYS`
  (lines 24-30) — `USE_OPENAI`/`USE_OPENAI_RESPONSES` → `OPENAI_API_KEY`,
  `USE_ANTHROPIC` → `ANTHROPIC_API_KEY`, `USE_GEMINI` → `GEMINI_API_KEY`,
  `USE_VERTEX_AI` → `GOOGLE_API_KEY`. `validateAuthMethod` (lines 275-366) is
  the pre-flight check invoked before a session starts; `hasApiKeyForAuth`
  (117-208) prefers a model-specific `envKey` from `modelProviders` over the
  default env var, then `process.env`, then `settings.env`, then the legacy
  `security.auth.apiKey`.
- **Removed-OAuth leftovers** (`device|oauth|refreshToken|credentials`
  search under `packages/core/src`, `packages/cli/src`, excluding tests):
  matches are all **MCP-server auth**, a separate subsystem from
  model-provider login, but a plausible donor. `packages/core/src/mcp/
oauth-provider.ts` is a full authorization-code+PKCE OAuth client for MCP
  servers: local callback HTTP server, browser launch via
  `openBrowserSecurely`, token exchange, `oauth-display-message`/
  `oauth-auth-url` event emitters. `mcp/constants.ts:11-27` —
  `MCP_OAUTH_CLIENT_NAME = 'O1-Code MCP Client'`, `OAUTH_REDIRECT_PORT =
7777`, `OAUTH_REDIRECT_PATH = '/oauth/callback'`. Also `oauth-utils.ts`,
  `oauth-token-storage.ts`, `google-auth-provider.ts` (Google ADC, allowlists
  `*.googleapis.com`/`*.luci.app`), `sa-impersonation-provider.ts`. Token
  storage: `mcp/token-storage/types.ts` defines `TokenStorage`/
  `SecretStorage`/`TokenStorageType` (`KEYCHAIN`|`ENCRYPTED_FILE`);
  `keychain-token-storage.ts` (OS keychain) and `file-token-storage.ts`
  (AES-256-GCM, key from `scrypt(hostname-username-o1-code)`, file
  `mcp-oauth-tokens-v2.json`, dir `mode 0o700`, file `mode 0o600`) are the
  fallback; `hybrid-token-storage.ts` picks between them.
  **No device-code flow exists anywhere** — `grep -ri
"device_code|deviceCode|device flow"` across `packages/` is empty; plan B
  (Copilot) and plan C (OrganizaOne, RFC 8628) both need this from scratch.
  `AuthType` carries no OAuth member — the "discontinued upstream OAuth
  login" (`ROADMAP.md:199`) is fully gone from model-auth; the MCP plumbing
  above is the template for plan B's Codex-style flow (same shape: local
  callback, browser launch, refresh), but its client id/port/path/storage
  keys are MCP-scoped and need a new namespace for provider logins.
  Reusable UI: `ui/auth/AuthInProgress.tsx` (spinner + 180s timeout, Esc/
  Ctrl+C cancel) and `ui/components/ExternalAuthProgress.tsx`
  (title/message/detail + cancel), both wired through
  `AuthUiState.externalAuthState` — a ready-made "check your browser" screen
  for plan B/C.

### 1.5 Local model detection (Ollama / LM Studio)

**Nothing today probes `localhost:11434`/`localhost:1234` or references
`ollama`/`lm-studio`/`lmstudio` as a detection target.** `grep -r 11434
packages/` hits only `serve/server.test.ts` and `ui/auth/useAuth.test.ts:485`,
using it purely as an example URL in a `generateCustomApiKeyEnvKey` test, not
detection. `grep -ri "ollama|lm-studio|lmstudio"` hits only a comment in
`core/contentGenerator.ts:196` about strict servers rejecting non-text
tool-message content — unrelated to discovery. The "Local" menu item is new
work; no existing prober, port list, or fingerprinting helper to extend. See
Part 3 for the endpoint facts a prober would use.

### 1.6 How the models step lists models

`packages/core/src/providers/model-discovery.ts`:

- `checkProviderKey({protocol, baseUrl, apiKey, staticModels, signal})`
  (141-197) is the single entry point the UI calls (from `ApiKeyStep.submit`
  and `DiscoveringModelIdsStep`). `protocolOf`
  (`ProviderSetupSteps.tsx:744-748`) maps `AuthType` → `'openai' |
'anthropic' | 'gemini'`. OpenAI: `GET {baseUrl}/models`, `Authorization:
Bearer <key>` (128-136). Anthropic: `GET {anthropicSdkBaseUrl(base)}/v1/models`,
  headers `x-api-key` + `anthropic-version: 2023-06-01` (116-127).
  **Gemini has no list request** (`modelListRequest` returns `null`, line 137) — `checkProviderKey` returns `{status:'unavailable'}` immediately,
  and `DiscoveringModelIdsStep`'s `canFetchAgain` excludes
  `protocol === 'gemini'` (line 858): ctrl+r is disabled since there is
  nothing to re-fetch. OpenRouter special-case (`isOpenRouter`, 199-206):
  since it serves `/models` unauthenticated, the key is checked against
  `{baseUrl}/key` instead. `readModels` (31-70) expects the OpenAI
  `{data:[{id,...}]}` shape and rejects unsafe model ids. Result type
  `ProviderKeyCheck` (99-102): `ok` (key works, `models` from the provider or
  the built-in list), `rejected` (401/403), `unavailable` (no list to ask,
  network failure, or unparsable 2xx).
- **Provider that cannot list models**: `snapshotOf`
  (`ProviderSetupSteps.tsx:768-784`) falls back to `config.models` with
  `source:'fallback'`, `verified: result.status === 'ok'` (true only if the
  key worked despite no list). The UI shows "provider list unavailable,
  showing built-ins" and offers ctrl+r to retry when the protocol _can_ list
  models (`canFetchAgain`); Gemini has no retry.

### 1.7 i18n

- CLI: raw-string keys via `t('English sentence', {vars})`, no namespaced
  IDs. `packages/cli/src/ui/auth/*.{ts,tsx}` has **182 `t('...')` call
  sites** (`AuthDialog.tsx` 22, `ProviderSetupSteps.tsx` 42, `useAuth.ts` 3,
  `useProviderSetupFlow.ts` 4, rest in test files). Locales:
  `packages/cli/src/i18n/locales/{en,de,fr,ja,pt,ru,zh,zh-TW,ca}.js`; `en.js`
  is 3033 lines (source-of-truth; pt-BR reviewed by hand per `AGENTS.md`).
- Web Shell: namespaced keys (`auth.step.protocol`, `auth.purpose.voiceHint`)
  via `useI18n()`. `packages/web-shell/client/i18n.tsx` has **118
  occurrences of `'auth.`** — a separate, parallel key set, so a redesign
  touches two independent i18n surfaces unless unified as part of this work.
- No i18n-specific test file was found for the auth strings themselves.

### 1.8 Web Shell provider setup UI

The Web Shell **has its own full parallel implementation**, not a thin
wrapper over the terminal dialog:

- `packages/web-shell/client/components/messages/AuthMessage.tsx` (1246
  lines) — a server-driven wizard with the same conceptual steps
  (`groups → providers → step(protocol/wireApi/baseUrl/apiKey/models/
advancedConfig) → review`) as the CLI's `ProviderSetupSteps`, reading its
  catalog from `workspaceActions.getAuthProviders()`
  (`DaemonAuthProviderCatalog`) and submitting via
  `workspaceActions.installAuthProvider(...)` (types in
  `@organizaone/o1-code-web-shell/daemon-react-sdk`).
- Daemon side: `packages/cli/src/serve/routes/workspace-auth.ts`
  (`registerWorkspaceAuthRoutes`) and
  `packages/cli/src/serve/server/auth-provider-helpers.ts`
  (`buildAuthProviderCatalog`, `parseAuthProviderInstallRequest`) build the
  catalog **directly from `ALL_PROVIDERS`**, the same registry the terminal
  reads — a new preset reaches both surfaces automatically, but **the wizard
  UI, step components, group tabs, `auth.*` i18n keys, and the "coming
  soon"/subscription/local-detect flows all need their own redesign in
  `AuthMessage.tsx`** in lockstep with the terminal: there is no shared React
  component between `packages/cli` and `packages/web-shell`, only the shared
  `ALL_PROVIDERS` data contract — `AuthMessage.tsx` hand-rolls its own state
  machine rather than importing `useProviderSetupFlow.ts` (Ink/Node vs.
  browser SPA against the daemon's REST API).
- Terms/privacy link duplicated verbatim (`TOS_PRIVACY_URL`,
  `AuthMessage.tsx:40` vs `AuthDialog.tsx:38`).

---

## Part 2 — vendor facts for plan B (ChatGPT, GitHub Copilot, Grok)

External research below; every claim is cited, and anything not confirmed
against an official/primary source is marked **UNCONFIRMED**.

### 2.1 ChatGPT subscription sign-in (OpenAI Codex CLI's "Sign in with ChatGPT")

Highest-confidence section: read directly from `openai/codex` (Apache-2.0)
source,
[`codex-rs/login/src/server.rs`](https://github.com/openai/codex/blob/main/codex-rs/login/src/server.rs).

- **Flow:** authorization-code + PKCE against a local loopback callback
  server. `DEFAULT_ISSUER = "https://auth.openai.com"`,
  `DEFAULT_PORT = 1455`, `FALLBACK_PORT = 1457`, redirect URI
  `http://127.0.0.1:{port}/auth/callback`; authorize at
  `{issuer}/oauth/authorize`, token at `{issuer}/oauth/token`; PKCE generated
  per-flow (`generate_pkce()`).
- **Scopes** (literal string in source): `"openid profile email
offline_access api.connectors.read api.connectors.invoke"`.
- **Client id:** `app_EMoamEEZ73f0CkXaXp7hrann` — corroborated by the
  third-party OSS project
  [`simonw/llm-openai-via-codex`](https://github.com/simonw/llm-openai-via-codex/blob/main/llm_openai_via_codex.py),
  which hardcodes the same id and refresh endpoint
  `https://auth.openai.com/oauth/token`.
- **API base granted:** `https://chatgpt.com/backend-api/codex` — distinct
  from `api.openai.com`, reachable only with a valid ChatGPT OAuth token;
  not the general OpenAI Platform API.
- **Refresh:** automatic — OpenAI's docs state Codex "refreshes tokens
  automatically during use before they expire." Source:
  [learn.chatgpt.com/docs/auth](https://learn.chatgpt.com/docs/auth).
- **Token storage:** file mode `0o600`
  (`codex-rs/login/src/auth/storage.rs`), plus optional OS-keyring backends;
  OpenAI's docs also mention `auth.json`, OS keyring, or memory-only.
  **Encryption at rest beyond the OS keyring: UNCONFIRMED** (not documented).
- **Qualifying plans:** usage meters against the ChatGPT plan tier
  (Free/Go/Plus/Pro/Business/Enterprise) as rolling token credits; exact
  limits are on OpenAI's live pricing page —
  [rate card](https://help.openai.com/en/articles/20001106-codex-rate-card)
  (direct fetch 403'd; summarized from a search cache, **numbers
  UNCONFIRMED**) and [pricing docs](https://learn.chatgpt.com/docs/pricing).
- **Model list:** no fixed static list — fetched dynamically from
  `chatgpt.com/backend-api/codex` once authenticated; no public model-list
  doc endpoint found.
- **Third-party reuse / ToS:** Apache-2.0 permits reading the client id, but
  an OpenAI maintainer declined to rule on whether a third-party tool reusing
  this OAuth client violates OpenAI's Terms of Use ("I'm an engineer, not a
  lawyer") — **unresolved, not affirmatively sanctioned.** Source:
  [Discussion #8338](https://github.com/openai/codex/discussions/8338).
  Separately, OpenAI's actually-official third-party "Sign in with ChatGPT"
  (for ChatGPT Apps/Sites — a _different_ OAuth client than Codex CLI's)
  requires integrators to "not pool, share, or redistribute access tokens"
  and "not bypass rate limits"; each user must use their own account. Source:
  [ChatGPT Sites Terms](https://openai.com/policies/chatgpt-sites-terms/).
  Do not conflate the two surfaces — different clients, different sanctioning.

### 2.2 GitHub Copilot device-code flow

- **Endpoints:** device-code request at
  `https://github.com/login/device/code`, user verification at
  `https://github.com/login/device`, polling GitHub's OAuth token endpoint,
  then an internal exchange at `api.github.com/copilot_internal/v2/token`
  turning the GitHub token into a short-lived Copilot API token. GitHub's own
  CLI docs confirm the device flow is the default for headless/remote
  environments (SSH, Codespaces, CI). Source:
  [Authenticate Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli).
  The `copilot_internal/v2/token` path is **UNCONFIRMED against an official
  GitHub page** — widely reported by community reverse-engineering but not
  stated verbatim on any GitHub doc page reached.
- **Client id reuse:** multiple community sources report third-party
  integrations (`copilot.vim`/`copilot.lua`, OpenAI-compatible proxies)
  reusing VS Code Copilot Chat's public client id, reported as
  `Iv1.b507a08c87ecfe98` — **UNCONFIRMED-precise-value** (not re-derived from
  an official source this pass), though the general practice is corroborated.
- **API base / models:** `https://api.githubcopilot.com`; a `GET /models`
  endpoint (Bearer token + `Copilot-Integration-Id` header) is reported by
  open-source proxies (`ericc-ch/copilot-api`, `Alorse/copilot-to-api`) —
  **not an officially documented public endpoint; UNCONFIRMED.**
- **Qualifying plans:** GitHub documents named tiers generally (Individual,
  Business, Enterprise, limited Free), but the exact plan-to-CLI-eligibility
  mapping could not be fetched — **UNCONFIRMED**.
- **ToS position — clearest official finding:** GitHub's **Copilot
  Extension Developer Policy** explicitly prohibits "bypass[ing] or
  circumvent[ing] protocols and access controls" and "us[ing] unpublished
  APIs," and prohibits misleading users about an extension's origin — this
  directly implies a non-GitHub third party reusing the internal client id /
  `copilot_internal` endpoint is **against GitHub's official developer
  policy**, not merely tolerated. Source:
  [Copilot Extension Developer Policy](https://docs.github.com/en/site-policy/github-terms/github-copilot-extension-developer-policy).
- **Token storage (official, confirmed):** OS credential store (Keychain
  macOS, Credential Manager Windows, libsecret/GNOME Keyring/KWallet Linux),
  plaintext fallback `~/.copilot/config.json` only headless without a
  keyring; precedence `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` >
  OAuth-in-keyring > `gh` CLI fallback. Same source as above.
- **Rate limits:** not documented in pages reached — **UNCONFIRMED**.

### 2.3 Grok (xAI) subscription sign-in

- **The general developer API (`docs.x.ai`) is API-key-only** — directly
  fetched: "The only authentication method described is API key-based...
  `Authorization: Bearer $XAI_API_KEY`... no alternative mechanisms." Sources:
  [docs.x.ai/docs/overview](https://docs.x.ai/docs/overview),
  [Management API auth](https://docs.x.ai/developers/rest-api-reference/management/auth),
  [xai-sdk-python](https://github.com/xai-org/xai-sdk-python). **No
  OAuth/device-code flow for the pay-per-token developer API.**
- **xAI does ship a separate, official first-party CLI with subscription
  login: Grok Build** (`grok` CLI), announced 2026-05-14, open-sourced at
  [xai-org/grok-build](https://github.com/xai-org/grok-build) — see
  [x.ai/news/grok-build-cli](https://x.ai/news/grok-build-cli). `grok login`
  opens a browser for OAuth, caches a token at `~/.grok/auth.json`, billed
  against a **SuperGrok or X Premium+ subscription** instead of per-token
  billing — analogous to Codex CLI's "Sign in with ChatGPT," but for xAI's
  own agent product, not the general `api.x.ai` developer API.
- **Precise OAuth internals are not published:** `docs.x.ai/build/overview`
  only says "opens a browser for authentication," no client_id/endpoint/
  PKCE/scope/lifetime detail — **UNCONFIRMED at the official-doc level.** A
  third-party write-up
  ([steipete/CodexBar](https://github.com/steipete/CodexBar/blob/main/docs/grok.md))
  reports tokens expire ~7 days with CLI-side refresh, talking to
  `cli-chat-proxy.grok.com` and an auth host referenced as `auth.x.ai` —
  third-party observation, not xAI's own reference. **No official
  third-party OAuth client id published**; Grok Build is open-source so a
  client id could in principle be read from its source, but none was
  verified this pass — UNCONFIRMED.
- **Unofficial/community flows are clearly distinct** from Grok Build:
  several tools scrape the grok.com/X **web session cookie** instead of
  OAuth — e.g. [`mem0ai/grok3-api`](https://github.com/mem0ai/grok3-api) and
  [`herobytes/x-grok-client`](https://github.com/herobytes/x-grok-client)
  ("unofficial... uses private web endpoints that can change without
  notice"), both self-labeled unofficial/unsupported.
- **Model list / rate limits / encrypted storage:** no official
  documentation tied to the SuperGrok login mode was found — **UNCONFIRMED**.
  Token storage is a local JSON file per community observation, no evidence
  of OS-keyring/encryption use (unlike Codex CLI) — **weaker posture than
  Codex/Copilot, encryption UNCONFIRMED.**

### 2.4 Cross-cutting notes for plan B

Only **Codex CLI** yielded a directly-verifiable primary-source answer for
OAuth internals — highest confidence, and the most direct donor for an
o1-code implementation (same authorization-code+PKCE+local-callback shape as
the existing MCP OAuth plumbing, see 1.4). **GitHub Copilot**'s low-level
facts rest on convergent community reverse-engineering rather than an
official reference; GitHub's _policy_ explicitly forbids the practice
(unpublished APIs / bypassing access controls) — the one clearly-official
position, arguing for caution/legal review distinct from technical
feasibility. **xAI/Grok** has a genuine official subscription-login product
(Grok Build, 2026-05-14) but undocumented OAuth internals; the general xAI
developer API stays API-key-only. Community "OAuth-like" Grok tools are
session-cookie scrapers, self-labeled unofficial — materially shakier than
the Codex CLI or Copilot device-flow options.

---

## Part 3 — Ollama and LM Studio detection facts

### Ollama

- **Default bind:** `127.0.0.1:11434`; override via `OLLAMA_HOST` env var
  (e.g. `OLLAMA_HOST=0.0.0.0:11434`). CORS allows `127.0.0.1`/`0.0.0.0` by
  default, more via `OLLAMA_ORIGINS`. Source: [Ollama FAQ](https://docs.ollama.com/faq).
- **Native list-models:** `GET /api/tags` → `{"models":[{"name","model",
"modified_at","size","digest","details":{"format","family","families",
"parameter_size","quantization_level"}}]}`. Distinctive: top-level
  `models` array (not `data`), `digest` (sha256), `details.family`. Source:
  [Ollama API — list models](https://docs.ollama.com/api/tags).
- **Version:** `GET /api/version` → `{"version":"0.5.1"}`. Source:
  [ollama/docs/api.md](https://github.com/ollama/ollama/blob/main/docs/api.md).
- **OpenAI-compatible surface:** mounted at `/v1` (`http://localhost:11434/v1`)
  — chat/completions/models/embeddings/responses. Fingerprint quirks: model
  `created` reflects last modification; `owned_by` defaults to `"library"`
  (not `"openai"`/`"system"`); no `logprobs`/`tool_choice`/`logit_bias`/
  `user`/`n`; images must be base64. Source:
  [OpenAI compatibility — Ollama](https://docs.ollama.com/api/openai-compatibility).
- **UNCONFIRMED:** `GET /`/`HEAD /` reportedly returns plain text
  `"Ollama is running"` (widely relied on, e.g.
  [stdapi.ai#254](https://github.com/stdapi-ai/stdapi.ai/issues/254)) but not
  in the official API reference. No documented distinguishing header.

### LM Studio

- **Default bind:** `127.0.0.1:1234` (localhost-only); change with
  `lms server start --port <N>`, `--bind 0.0.0.0` opens to the network.
  Source: [`lms server start`](https://lmstudio.ai/docs/cli/serve/server-start).
- **OpenAI-compatible list-models:** `GET /v1/models` under
  `http://localhost:1234/v1`, standard `{object:"list",data:[...]}` shape.
  Source: [LM Studio Developer Docs](https://lmstudio.ai/docs/developer).
- **Native REST API (`/api/v0`):** `GET /api/v0/models` returns
  LM-Studio-specific metadata (`type`, `publisher`, `arch`,
  `compatibility_type` [`gguf`/`mlx`], `quantization`, `state`
  [`loaded`/`not-loaded`], `max_context_length`, and a `capabilities` array
  e.g. `"tool_use"`); also `POST /api/v0/chat|completions|embeddings` with
  tokens/sec + TTFT stats. Sources:
  [REST API v0 endpoints](https://lmstudio.ai/docs/developer/rest/endpoints),
  [API changelog](https://github.com/lmstudio-ai/docs/blob/main/1_developer/api-changelog.md).
- **UNCONFIRMED:** no officially documented identifying header/banner (a
  non-official blog claims `Access-Control-Allow-Origin: *`, a generic CORS
  header, not LM-Studio-specific).
- **Practical detector signal:** `GET /api/v0/models` returning 200 is the
  strongest official-docs-backed positive ID, since Ollama and other
  OpenAI-compatible servers don't implement this path.

### Generic OpenAI-compatible local servers

- **llama.cpp server:** `GET /v1/models` returns the standard OpenAI shape,
  but `id` is normally the on-disk model path (unless `--alias` is set) and
  `owned_by` is `"llamacpp"`; non-OpenAI `GET /health`
  (`{"status":"ok"}`) and `GET /props` (`model_path`, `chat_template`,
  `total_slots`) have no OpenAI-spec equivalent. No distinguishing header.
  Source: [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).
- **vLLM:** binds `0.0.0.0:8000` by default (`--host`/`--port`); `/v1/models`
  follows the OpenAI schema; field-level detail beyond that is
  **UNCONFIRMED**. Sources:
  [OpenAI-Compatible Server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/),
  [`vllm serve` CLI](https://docs.vllm.ai/en/stable/cli/serve/).
- **text-generation-webui:** OpenAI extension listens on port `5000` by
  default (`--api-port`/`OPENEDAI_PORT`); `/v1/models` lists the loaded
  model first. Source:
  [12 - OpenAI API](https://github.com/oobabooga/text-generation-webui/blob/main/docs/12%20-%20OpenAI%20API.md).
- **LocalAI:** default bind `:8080` (`LOCALAI_ADDRESS`); `/v1/models`;
  also `/swagger/index.html` and `/readyz`. Exact `/v1/models` schema
  **UNCONFIRMED** beyond "OpenAI compatible". Sources:
  [LocalAI docs](https://localai.io/docs/basics/try/index.html),
  [Troubleshooting](https://localai.io/docs/basics/troubleshooting/).
- **Conclusion:** `GET /v1/models` alone is close to indistinguishable
  across these tools. The only officially-documented differentiators are
  (a) the well-known default port (11434/1234/8000/5000/8080) as a
  first-pass probe list; (b) a vendor-specific side-channel endpoint for
  positive ID (`/api/tags`/`/api/version` → Ollama; `/api/v0/models` → LM
  Studio; `/props`/`/health` → llama.cpp; `/readyz`+Swagger → LocalAI); and
  (c) small `/v1/models` tells (`owned_by: "library"` Ollama vs
  `"llamacpp"`). No universal header identifies backend identity — probe
  known ports, then each vendor's native endpoint, falling back to "generic
  OpenAI-compatible" if only `/v1/models` answers.
