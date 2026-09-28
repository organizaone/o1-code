# Login plan A1 — core: report

Branch `login-core`, working tree only (nothing staged, committed or stashed). Spec: the scratchpad
`login-design-spec.md` (not yet in `docs/fork/specs/`). Brief: `login-core-brief.md`.

## What was built

### §1 Groups and presets (`packages/core/src/providers`)

- `types.ts`: `UiGroup = 'organizaone' | 'apiKey' | 'local' | 'custom'`; `ProviderConfig` gains
  `comingSoon?: true`, `localProbe?: { kind }` and `baseUrlByProtocol?` (see decisions);
  `ProviderInstallPlan` loses `env` and `legacyCredentials` and gains `credential?: { id, apiKey }`;
  `ProviderSettingsAdapter` gains optional `credentials?: ProviderCredentialStore` (read/write/remove).
- `all-providers.ts`: `ALL_PROVIDERS` = `organizaone`, the three Alibaba plans, then Anthropic,
  DeepSeek, Google Gemini, Kimi (Moonshot), MiniMax, ModelScope, OpenAI, xAI, Z.AI (sorted by label),
  then `ollama`, `lmstudio`, `local-openai`, then `custom-openai-compatible`.
  `PROVIDERS_BY_GROUP: Record<UiGroup, readonly ProviderConfig[]>`; `ALIBABA_PROVIDERS` and
  `THIRD_PARTY_PROVIDERS` deleted. `getAllProviderBaseUrls()` leaves the local servers out.
- New presets: `anthropic.ts`, `openai.ts` (wire-API step through `protocolOptions: [openai]`),
  `gemini.ts`, `organizaone.ts` (+ `organizaone-login`, `organizaone-aipp`, `comingSoon`),
  `ollama.ts`, `lmstudio.ts`, `local-openai.ts` (`LOCAL_API_KEY_PLACEHOLDER = 'local'`,
  `mergeModelsByIdentity`). Labels: `xAI` ("Grok · key from console.x.ai"), `DeepSeek`,
  `Kimi (Moonshot)`, `MiniMax`, `ModelScope`, `Z.AI`; Alibaba labels unchanged. All key presets are
  `uiGroup: 'apiKey'`.
- `buildInstallPlan` refuses `comingSoon` entries ("… is not available yet"), pins the base URL of a
  `baseUrlByProtocol` preset, and installs a local preset with the key `local`.
  `shouldShowStep('apiKey')` is false for `uiGroup: 'local'` (`requiresApiKey()` exported);
  `shouldShowStep('baseUrl')` is false with `baseUrlByProtocol`. `resolveBaseUrl(config, selected,
protocol?)` gained the optional protocol.
- Deleted `openrouter.ts`, `requesty.ts` and their tests; the OpenRouter `/key` special case in
  `model-discovery.ts`; OpenRouter/Requesty from the legacy `auth` notice and sub-commands, the
  locales (9), `scripts/unused-keys-only-in-locales.json`, CONTRIBUTING, quickstart, auth and
  model-providers docs, and a comment in `openaiContentGenerator/provider/openrouter.ts`.

### §2 Credential store

- `Storage.getCredentialsDir()` → `<o1-code home>/credentials`.
- `credential-store.ts`: `readCredential`, `writeCredential` (dir `0o700`, file `0o600` passed to
  `writeFileSync` and `chmod` after, `EPERM` ignored; temp file + `rename`), `removeCredential`,
  `listCredentials`, `isValidCredentialId` (`^[a-z0-9][a-z0-9-]*$`), `credentialIdForProvider`
  (`alibabaStandard` → `alibaba-standard`), `readSavedApiKey`, `resolveApiKey({ envKey, credential,
providerId })` = env → named credential → provider-id credential. Corrupt file → absent + one
  debug line. Synchronous on purpose (read where generator configs are built).
- Plans carry `credential: { id, apiKey }` (omitted when no key was entered, e.g. model-list
  updates); every model built by a plan carries `credential: "<id>"` next to its `envKey`.
  Credential ids: preset → its id; custom → `custom-<12 hex>` (same hash as the env key), plus
  `-image` / `-voice` for service purposes; a reconnect keeps an existing entry's `credential`, and
  an existing entry with an env key of its own and no credential gets `env-<env-key>`.
- `applyProviderInstallPlan` writes the store (adapter's store or the file store), restores the
  previous key (or removes the new one) on any failure, and warns when the entry's env variable is
  set to a different value (it wins). The `env.<KEY>` write path, `DENY_ENV_KEYS` and the
  `security.auth.*` legacy write are gone. The post-write "higher-precedence scope" comparison ignores
  `credential` as it ignores `wireApi`.
- Readers: `modelConfigResolver` (layer after the env key, source `modelProviders/credential`),
  `ModelsConfig.applyResolvedModel…` (same), `content-generator-config`, `BaseLlmClient.resolveForModel`,
  web search (gate, explicit model, request time via `apiKeyCredential`), CLI `hasApiKeyForAuth`
  (env → named credential → credential of the preset matched by base URL + env key; the
  `settings.env` and `security.auth.apiKey` branches removed), `/doctor` (resolved key counts).
  `AvailableModel` and `ModelConfig` gained `credential`; the settings schema description mentions it
  (VS Code schema regenerated).
- `o1-code auth logout <id>` (`packages/cli/src/commands/auth.ts`): validates the id, deletes the
  file, removes `credential: "<id>"` from the raw user and workspace `modelProviders` entries, prints
  both. `logoutProvider` / `formatLogoutResult` exported for tests.

### §3 Discovery

`checkProviderKey` asks Gemini `GET {base}/v1beta/models` with `x-goog-api-key`, strips `models/`,
keeps `generateContent` models, maps 400/403 to `rejected`. The CLI `canFetchAgain` Gemini exclusion
is gone (ctrl+r works for Gemini).

### §4 Local probes

`local-servers.ts`: `probeLocalServers({ signal, timeoutMs = 800, fetch })` (Ollama `/api/tags`,
LM Studio `/api/v0/models`, in parallel, never throws) and `probeOpenAiServer(baseUrl, …)`;
`OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL` exported and used by the presets.

### §5 Docs, changelog, i18n

`docs/users/configuration/auth.md` (menu, new "Where `/auth` saves your key" section, OrganizaOne and
local presets, `credential` field, security note), `model-providers.md` (overview, `/auth` note,
gateway example without OpenRouter/Requesty, local presets, Coding Plan key storage, resolution
table), `quickstart.md`, `CONTRIBUTING.md`, `CHANGELOG.md` (`### Connect a provider`, plus the logout
line). Locales (9): the two `security.auth.apiKey` messages replaced ("Connect a provider with
/auth, or …"), six logout strings added, three OpenRouter/Requesty strings removed; pt-BR written by
hand.

### Transitional CLI / Web Shell / VS Code changes (to keep the tree green)

- `AuthDialog.tsx`: same three entries; "Alibaba ModelStudio" lists the three plans, "Third-party
  Providers" lists OrganizaOne + the other key presets + the local presets (coming-soon entries
  hidden); the key step prefills from the store instead of `settings.env`.
- `useProviderSetupFlow.ts`: review JSON shows `credential` (masked) instead of `env`; local presets
  start with the key `local`; OrganizaOne moves to the protocol's base URL on the protocol step.
- `useProviderUpdates.ts`: `delete installPlan.credential` (was `.env`).
- Daemon `auth-provider-helpers.ts`: catalog group ids kept (`alibaba`, `third-party`, `custom` — a
  contract with the Web Shell), filled from `PROVIDERS_BY_GROUP`; install requests for local presets
  may omit the key.
- VS Code companion: `AuthMessageHandler` groups by `PROVIDERS_BY_GROUP` and skips the key prompt
  for local presets; tests updated to the store.

## Decisions and deviations

1. **`uiGroup` values** follow the brief (`apiKey`), not the spec's §3 (`main` / `others`); the
   spec's own §2 asks for one flat API-key list, which the brief implements.
2. **Coming-soon entries** are `ProviderConfig`s with `protocol: USE_ANTHROPIC` and `envKey: ''`
   (the type requires both; making them optional would ripple through CLI, daemon and VS Code). They
   are **not in `ALL_PROVIDERS`** (so no installer, registry lookup or daemon catalog sees them); they
   are only in `PROVIDERS_BY_GROUP.organizaone`.
3. **OrganizaOne base URL per protocol**: added `ProviderConfig.baseUrlByProtocol` instead of a
   base-URL option list (which would show a URL step). `buildInstallPlan` pins it whatever URL the
   caller passes.
4. **OpenAI base URL** is always `https://api.openai.com/v1`: the Responses generator strips `/v1` and
   adds it back, so one fixed base serves both wires (the brief's `https://api.openai.com` for
   Responses would also work but needs a per-wire base).
5. **Credential ids** for `alibabaStandard` are normalised to `alibaba-standard`; the provider id was
   not renamed (it keys `providerMetadata`).
6. **Provider-id fallback at runtime**: content generators read env → named credential only; the
   third step (credential of the provider id) is applied where the provider is known (CLI
   `hasApiKeyForAuth`, via `findProviderByCredentials`). Every install writes the `credential`
   reference, so the runtime finds it; this avoids reading a user's store for hand-written entries in
   every test and keeps `models/` free of a registry lookup.
7. **`security.auth.apiKey` / `settings.env`**: removed where the brief points (install write, CLI
   pre-flight). The resolver layers that still read `security.auth.apiKey` (core
   `modelConfigResolver`, CLI `modelConfigUtils`, `voice-transcriber`) and `ModelDialog`'s
   `settings.env` hydration are untouched (open point).
8. **Header placeholders** such as `${MY_KEY}` in `customHeaders` keep reading the environment; since
   the install no longer writes the key to `settings.env`/`process.env`, a rotated key reaches such a
   header only through the environment. Tests in `loadedSettingsAdapter.test.ts` and the VS Code
   `settingsWriter.test.ts` were rewritten to this behaviour.
9. **OpenRouter runtime support stays** (`isOpenRouterHostname`, pipeline reasoning switch, telemetry
   mapping `OPENROUTER_API_KEY`/`REQUESTY_API_KEY`, the daemon's env presence list, cost/token
   comments): the spec keeps existing entries working; only the presets left.
10. **Local presets test** is one file (`local.test.ts`) for the three local presets.
11. **Brand lint** scans tracked files only; the new untracked files were checked with the same
    `findResidual` rules (one hit fixed).

## Tests (TDD: failing test first, then the code)

New: `credential-store.test.ts` (26), `local-servers.test.ts` (10), `__tests__/all-providers.test.ts`,
`__tests__/presets/{anthropic,openai,gemini,organizaone,local}.test.ts`, Gemini discovery tests,
store readers in `modelConfigResolver`, `modelsConfig`, `content-generator-config`, `baseLlmClient`,
`web-search` (gate, explicit, request), CLI `config/auth.test.ts` (store, provider-id, no
`settings.env`, no `security.auth.apiKey`), `commands/auth.test.ts` (logout ×5), flow tests
(preview credential, OrganizaOne base, local key), daemon catalog + key-optional tests, doctor.
Rewritten on the store: `install.test.ts`, `released-responses.test.ts`, preset tests,
`provider-config.test.ts`, `useAuth.test.ts`, `useProviderUpdates.test.ts`,
`loadedSettingsAdapter.test.ts`, VS Code `settingsWriter.test.ts` and `WebViewProvider.test.ts`.

Affected files run green (per package, `--coverage.enabled=false`): core 34 files (providers, models,
baseLlmClient, web-search, storage) + pipeline/config; CLI 14 files (auth, commands/auth, ui/auth,
provider updates, doctor, adapter, daemon helpers, preconnect, acpAgent) + server, systemInfo,
providers-status, model-configuration, AppContainer, ModelDialog, workspace-models, cli; Web Shell
`AuthMessage.dom.test.tsx`, `actions.test.ts`; VS Code `settingsWriter`, `AuthMessageHandler`,
`WebViewProvider`. The TUI-navigation `AuthDialog` cases are `it.skip` on Windows, so their updated
labels (OrganizaOne first, `DeepSeek`, `MiniMax › Endpoint`) are unverified here (Linux CI runs them).

## Gates (repo root, one at a time)

| Gate                                                | Result                                                       |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `npm run build -- --cli-only`                       | pass                                                         |
| `npm run typecheck` (+ VS Code `tsc --noEmit`)      | pass                                                         |
| `npm run lint`                                      | exit 0 (after the follow-up ignores `ops/`)                  |
| `node scripts/o1/brand-lint.mjs`                    | 0 hits over 5837 files, untracked non-ignored files included |
| `npx tsx scripts/check-i18n.ts`                     | passed                                                       |
| `npm run bundle`                                    | pass                                                         |
| `node scripts/o1/provider-smoke.mjs`                | PASS (run on the new bundle)                                 |
| `node scripts/o1/smoke.mjs`                         | PASS                                                         |
| `npx prettier --check` (docs, changelog, new files) | clean                                                        |
| `node scripts/o1/check-guides.mjs`                  | 0 problems                                                   |

## Real check

Script `scratchpad/real-check.mjs`, scratch `O1CODE_HOME`, the built CLI `loadSettings` +
`createLoadedSettingsAdapter` + core `applyProviderInstallPlan`:

- DeepSeek (key) and Ollama (no key) installed → `<home>/credentials/deepseek.json` and
  `ollama.json` exist with `{ apiKey, savedAt }`, `apiKey` = the key / `local`. On Windows the
  reported modes are `666` (Node reports only the read-only bit; the profile ACL is the boundary, as
  the spec says).
- `settings.json` holds no key and no `env`; entries carry `deepseek-v4-flash -> deepseek`,
  `llama3.2:3b -> ollama`.
- `ModelsConfig` resolves the DeepSeek key from the store with `DEEPSEEK_API_KEY` unset.
- `logoutProvider('deepseek')` removed the file and the reference; `node dist/cli.js auth logout
gemini` prints "No saved key for gemini."; `auth logout ../bad` is refused.
- `probeLocalServers()` on this machine: Ollama `running: false`, LM Studio `running: false`
  (neither server running; 6 ms, connection refused).
- The real `~/.o1-code/credentials` was not created by any test run (one early run of
  `released-responses.test.ts`, before its adapter got an in-memory store, wrote
  `env-released-key.json` there; it was removed, and the directory did not exist before).

## Follow-up (coordinator round 2)

1. **One reading order everywhere.** New `packages/core/src/providers/model-api-key.ts`:
   `resolveModelApiKey(model)` = `process.env[envKey]` → the credential the entry names → the
   credential of the preset matched by base URL + env key; `resolveSavedModelApiKey` (store only) and
   `exportSavedCredentials(modelProviders)`. Switched to it: core `modelConfigResolver`,
   `ModelsConfig`, `content-generator-config`, `BaseLlmClient`, web search (gate, explicit model,
   request), CLI `config/auth.ts`, `voice-transcriber.ts`, `ModelDialog.tsx` (replaces the
   `settings.env` copy into the environment), ACP `acpAgent.ts` (`hasApiKey` and the kept key, the
   old `readSettingsEnv` is gone), VS Code `settingsWriter.ts` (`readO1CodeSettingsForVSCode`).
   Removed: the `security.auth.apiKey` / `security.auth.baseUrl` resolver layers and settings-schema
   entries, `modelConfigUtils` passing them, the voice fallback to `security.auth.apiKey` and to
   `settings.env`, the `MissingApiKeyError` hint naming `security.auth.apiKey`, their tests and docs
   rows (`settings.md`, `model-providers.md`). The VS Code companion's own writers
   (`writeCodingPlanConfig`, `writeModelProvidersConfig`) now save to the store (`coding-plan`,
   `openai`) instead of `settings.env`. Not changed: `environment.ts` still loads `settings.env` into
   `process.env` as a general variable feature (a key put there by hand reaches the environment, the
   first source).
2. **`${VAR}` compatibility.** `credential-store.ts` gained `exportCredentialToEnv` (sets an unset
   variable, or one it exported itself so a rotation takes effect; never a user value; refuses
   invalid names and a denylist such as `PATH`, `NODE_OPTIONS`, `HOME`), `isExportedCredentialEnv`,
   `withdrawExportedCredential`. Keys are exported (process only, never to disk) when the runtime
   resolves a saved key, when `applyProviderInstallPlan` saves one (withdrawn on rollback; the shadow
   warning ignores its own exports), and at `loadSettings` / `reloadScopeFromDisk` before
   placeholders are resolved — for system, system-defaults and user scopes only, never workspace
   (trust is not decided there; a cloned repository must not pull a key into its placeholders).
   Tests: store, `model-api-key`, install (export, rotation, user value kept, rollback),
   `loadedSettingsAdapter` (a placeholder resolves from the store; settings file unchanged), VS Code
   settings writer (unset variable receives the rotated key, a user one wins).
3. **VS Code rollback.** `snapshotCredential` / `restoreCredential` in `settingsWriter.ts`;
   `WebViewProvider` snapshots the plan's credential before applying and restores it with
   `settings.json`. `clearPersistedAuth` removes every saved key.
4. **Locales.** New labels and descriptions (OrganizaOne, Anthropic, OpenAI, Google Gemini, Ollama,
   LM Studio, Other local server, xAI, the renamed key presets, the two coming-soon entries, and
   their descriptions) in the nine locales, pt-BR by hand; the old `… API Key` labels and the old Grok
   description removed. `check-i18n` passes.
5. **Lint.** `ops/**` added to the global ignores in `eslint.config.js`; `npm run lint` exits 0.
6. **Brand lint.** `scripts/o1/brand-lint.mjs` lints `git ls-files` plus `git ls-files --others
--exclude-standard` through an exported `lintedFiles(git)`; test added (5 pass).

Deviation: the provider-id fallback for a Custom-provider entry without a `credential` resolves the
generic preset id, not `custom-<hash>` (every install writes the `credential` reference, so this only
concerns hand-written entries).

## Open points

1. The daemon descriptor does not carry `comingSoon` / `localProbe`, and local presets typed with a
   private base URL still meet the daemon's private-host guard.
2. Telemetry and the daemon env presence list still name OpenRouter/Requesty env keys (provider
   names, allowed); decide in A2 whether to keep them.
3. Exported keys are inherited by child processes of the session (shell tools), as `settings.env`
   keys were before.
4. Some `ModelsConfig` tests still use a `{ kind: 'settings', detail: 'security.auth.apiKey' }`
   source fixture to exercise the generic "keep the resolved key on restart" logic; the logic is not
   specific to that setting.

## Call sites plan A2 must touch

- CLI dialog: `packages/cli/src/ui/auth/AuthDialog.tsx` (`MAIN_ITEMS`, `VIEW_PATHS`,
  `MODELSTUDIO_PLAN_IDS` / `PLAN_PROVIDERS` / `OTHER_PROVIDERS` transitional lists, `savedKeyEnv`,
  `defaultMainIndex`, the "coming soon" rendering, the Local screen with `probeLocalServers` +
  ctrl+r), `useProviderSetupFlow.ts` (`start` prefill and `existingEnv` param, local placeholder,
  `baseUrlByProtocol` in `selectProtocol`, review `credential`), `ProviderSetupSteps.tsx`
  (`ApiKeyStep` masked stored key, `DiscoveringModelIdsStep` pre-selecting probed models,
  `protocolOf`), `useAuth.ts` (`handleProviderSubmit`), `auth-step-position.ts`, `AuthDialog.test.tsx`
  (TUI cases), `use-provider-setup-flow.test.ts`, `ProviderSetupSteps.test.tsx`.
- CLI other: `packages/cli/src/acp-integration/acpAgent.ts` (`serializeProviderConfig`
  `uiGroup ?? 'third-party'`), locales for the new menu strings (the preset labels are in).
- Daemon: `packages/cli/src/serve/server/auth-provider-helpers.ts` (`buildAuthProviderCatalog`
  groups, descriptor `comingSoon` / `localProbe`, key-optional parse), `packages/cli/src/serve/types.ts`
  (`ServeAuthProviderCatalog.groups[].id`), `packages/sdk-typescript/src/daemon/types.ts` (same
  union), `packages/cli/src/serve/routes/workspace-auth.ts` (new `GET /workspace/auth/local-servers`
  running `probeLocalServers`), `packages/cli/src/serve/run-o1-code-serve.ts`
  (`buildProviderSetupInputs`, `installAuthProvider`).
- Web Shell: `packages/web-shell/client/components/messages/AuthMessage.tsx` (`AuthGroupId`, default
  `'alibaba'`, groups view, disabled items, local detection through the daemon route, no key step
  for local presets), `packages/web-shell/client/daemon/workspace/{actions,types}.ts`,
  `packages/web-shell/client/i18n.tsx` (`auth.*` keys), the e2e spec
  `client/e2e/web-shell.model-configuration.spec.ts`, `AuthMessage.dom.test.tsx`.
- VS Code companion (if kept in step): `src/webview/handlers/AuthMessageHandler.ts` (the four
  groups, disabled coming-soon entries).
