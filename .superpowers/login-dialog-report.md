# Login plan A2 — the terminal dialog, the daemon catalog and the Web Shell: report

Branch `login-dialog` (stacked on `login-core`), working tree only: nothing staged, committed or
stashed. Brief: scratchpad `login-dialog-brief.md`; spec: scratchpad `login-design-spec.md`.

## What was built

### Core (`packages/core/src/providers`)

- `types.ts`: `ProviderFamily { id, label, description }` and `ProviderConfig.family?`. The three
  ModelStudio plans carry `family: MODELSTUDIO_FAMILY` (new `presets/modelstudio-family.ts`:
  id `alibaba`, label `Alibaba Cloud`, description `Coding Plan, Token Plan, or Standard API Key`).
- `all-providers.ts`: `getMenuRows(group)` returns the rows of a menu group, a family folded into one
  row (`{ kind: 'family', family, providers }`), everything else one row per provider. Exported from
  the providers index with `MenuRow`, `ProviderFamily` and `MODELSTUDIO_FAMILY`.
- `telemetry/gen-ai-provider.ts`: the `OPENROUTER_API_KEY` / `REQUESTY_API_KEY` hints and the
  `openrouter.ai` / `requesty.ai` host names are gone; such an endpoint now reports its protocol.

### Terminal dialog (`packages/cli/src/ui/auth`)

- `AuthDialog.tsx` rewritten on the four groups. Main screen: OrganizaOne, API key, Local, Custom
  (two-line entries, the terms link on this screen only). The Local entry carries `… looking` while the
  probe runs and `● Ollama detected` / `● LM Studio detected` (success colour) when one answered.
  `probeLocalServers` runs once when the dialog opens and again on `ctrl+r` in the Local screen.
- OrganizaOne screen: `API key` (the `organizaone` preset, described "Paste your key; the models come
  from OrganizaOne"), then `Sign in with your account` and `aipp device code` drawn muted with a
  `coming soon` badge in `theme.status.warning`; enter on them prints "Coming soon: this path depends
  on the OrganizaOne server." and nothing else.
- API key screen: one-line rows, label padded to 18 columns, preset description muted, from
  `getMenuRows('apiKey')`: Alibaba Cloud, Anthropic, DeepSeek, Google Gemini, Kimi (Moonshot), MiniMax,
  ModelScope, OpenAI, xAI, Z.AI. Alibaba Cloud opens the plan list (Coding Plan, Token Plan, Standard
  API Key); each plan then runs its region step as before.
- Local screen: Ollama and LM Studio with `● detected · N models` or `○ not running` (muted, enter says
  "Nothing answered on that port. Start the server and press ctrl+r."), then Other local server. A
  detected server starts its flow with the probe's models handed over as the key check, so the models
  step opens on them, all checked, with no key step and no `✓ key valid` line.
- Other local server: the base URL step is titled `Port`, asks "Port of the server on this machine, or
  its full URL.", shows `8080` as placeholder, reads a bare port as `http://127.0.0.1:<port>/v1`, and
  has no remote default behind an empty field (`useProviderSetupFlow.ts`).
- Key step hint: "the key is saved in ~/.o1-code/credentials/, for your user only".
- `auth-step-position.ts`: `getAuthStepPosition({ screensBefore, flow? })`. The count is the menu
  screens passed (the dialog's view stack) plus the provider's own steps; the last step is the flow's
  last (the review where the provider has one).
- Default landing entry from the active provider's `uiGroup` (organizaone 0, apiKey 1, local 2,
  custom 3). The transitional `MODELSTUDIO_PLAN_IDS` / `PLAN_PROVIDERS` / `OTHER_PROVIDERS` lists are
  gone. `useAuth.ts` has no group logic and needed no change.
- Glyphs from `glyphs()` (`●`/`○` with VS15, `❯`); no `☑`/`☐`.
- ACP `o1code/providers/list`: the fallback group is `apiKey` instead of `third-party`.

### i18n

21 new CLI strings in the nine locales (pt-BR by hand, from the mock); removed the now-unused
`Access Method`, `Third-party Providers`, the two old group descriptions and the old key hint.
`npx tsx scripts/check-i18n.ts` passes. Web Shell `auth.*` keys added in en and zh-CN (the key hint,
`auth.step.port`, `auth.comingSoon`, `auth.organizaone.*`, `auth.local.*`, `auth.group.*`).

### Daemon, SDK and Web Shell

- `serve/server/auth-provider-helpers.ts`: the catalog carries the four groups (`organizaone`,
  `apiKey`, `local`, `custom`) with the terminal's labels and descriptions, every provider of each
  group (the coming-soon entries included, so the Web Shell can show them), and per descriptor
  `comingSoon`, `localProbe` and `family`. The `alibaba` / `third-party` groups are gone. The install
  route still refuses the coming-soon ids (`unsupported_provider`).
- Private-host check: for a `uiGroup: 'local'` preset a loopback `baseUrl` (`localhost`,
  `*.localhost`, `127.0.0.0/8`, `::1`) is accepted without `--allow-private-auth-base-url`; a LAN host
  still needs the flag, and remote providers and Custom still refuse loopback.
- New route `GET /workspace/auth/local-servers` (`serve/routes/workspace-auth.ts`), ownership
  process-global: runs `probeLocalServers()` on the daemon host and answers
  `[{ id, baseUrl, running, models }]`. Types `ServeLocalServerProbe`, `ServeAuthProviderGroupId`.
  Documented in `docs/developers/o1-code-serve-protocol.md` (section renamed "Auth routes") and in
  the OpenAPI file (new tag "Provider setup", schema `LocalServerProbe`, scope `process-global`,
  `x-o1code-sdk-method: DaemonClient.getLocalAuthServers`); the contract test's supported operations
  list includes it.
- SDK: `DaemonClient.getLocalAuthServers()`, `DaemonLocalServerProbe`, `DaemonAuthProviderGroupId`,
  descriptor `comingSoon` / `localProbe` / `family`.
- Daemon env presence list: `OPENROUTER_API_KEY` removed (and from the protocol doc).
- Web Shell `AuthMessage.tsx`: the four groups (names translated by id, the daemon's text as
  fallback), the same rows: OrganizaOne's `API key` plus the two coming-soon entries as disabled
  buttons with a warning badge; the API key list with one Alibaba Cloud row opening its plans; the
  Local group calls the new route when it opens and on **Look again**, shows `● detected · N models` /
  `○ not running` (disabled) / `… looking`, starts a detected server with its models and no key, and
  reads a port for Other local server. Key hint under the key field. The wizard's steps are unchanged.
  `daemon/workspace/{actions,types}.ts`: `getLocalAuthServers()`.
- e2e `web-shell.model-configuration.spec.ts` (updated by reading, not run): the mock catalog has the
  four groups, `local-servers` is routed, and the custom path checks the four group rows and clicks
  Custom by its description.

### Docs

`docs/users/configuration/auth.md` (the four entries, coming-soon, a "Local servers" section, the
Alibaba Cloud path), `docs/users/quickstart.md` (first-launch menu), `model-providers.md` (menu note,
local presets, Coding Plan path), `docs/guides/TUI-DESIGN.md` (connect-provider rules and the new
hint), `CHANGELOG.md` (`### Connect a provider` line from the brief), `ROADMAP.md` (terminal dialog
and Web Shell shipped, plan C remains).

## Decisions and deviations

1. **Family instead of id filtering.** The brief keeps the three plans inside one API key entry. Rather
   than filter plan ids in two UIs, the presets carry a `family`, and the terminal, the daemon catalog
   and the Web Shell fold on it. The constant is `MODELSTUDIO_FAMILY` in `modelstudio-family.ts`:
   brand-lint forbids `alibaba` in identifiers and file names (the value `'alibaba'` and the label
   "Alibaba Cloud" are allowed).
2. **Unavailable rows stay reachable.** `BaseSelectionList` skips `disabled` items, so enter could never
   reach them to show the brief's line. Coming-soon and not-running rows are drawn muted with their
   badge but are selectable; enter prints the notice. The Web Shell uses real disabled buttons (no
   notice there).
3. **Probe models all checked.** For a keyless provider `preselectedModels` checks every model the
   server lists (the 10-model cap applies to remote providers only).
4. **Step counter API changed** (`AuthView` removed, input is `{ screensBefore, flow? }`): the brief
   asked for a recount of the new paths.
5. **Local route answers a bare array**, as the brief states, not a `{ v: 1, … }` envelope.
6. **Web Shell probes when the Local group opens**, not when the dialog opens (the terminal probes on
   open, for the main-screen badge). The Web Shell has no badge on its group row.
7. **TDD order.** Every change was test-first except `AuthDialog.tsx`, whose rewrite was drafted before
   its new tests; those tests were written and run right after.
8. **Tool rules.** One `sed -i` was run on an ASCII-only line of `model-providers.md` (the diff was
   checked: only the intended line changed) and `prettier --write` formatted five touched files;
   everything else went through Edit/Write. Stale `alibaba-family.*` build outputs were deleted from
   `packages/core/dist`.
9. The VS Code companion was not touched (outside the brief).

## Tests (affected files only, per package, `--coverage.enabled=false`)

| Package              | Files                                                                                                                                                                 | Result                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| core                 | `src/providers` (all 27 files incl. new family rows), `telemetry/gen-ai-provider.test.ts`, `config/config.test.ts`                                                    | 1243 passed            |
| cli                  | `ui/auth/*` (6), `serve/server/auth-provider-helpers`, `serve/routes/workspace-auth` (new), `serve/env-snapshot`, both contract tests, `config/auth`, `commands/auth` | 231 passed, 23 skipped |
| cli                  | `acpAgent.test.ts` + `server.test.ts`, `-t "provider\|auth"`                                                                                                          | 125 passed             |
| sdk-typescript       | `test/unit/DaemonClient.test.ts`                                                                                                                                      | 432 passed             |
| web-shell            | `AuthMessage.dom.test.tsx`, `daemon/workspace/actions.test.ts`, `i18n.test.ts`                                                                                        | 48 passed              |
| vscode-ide-companion | `AuthMessageHandler.test.ts` (sanity)                                                                                                                                 | 13 passed              |

New or rewritten: the four groups, the badges, the disabled entries, the plan sub-choice and the
coming-soon and not-running notices (`AuthDialog.test.tsx`, run everywhere through the exported
`build*Items` / `AuthMenuList` and the rendered main screen; the navigation cases keep the
Windows/CI skip and were updated to the new paths, plus three new ones: the coming-soon notice,
ctrl+r, the detected-server path); `ProviderSetupSteps.test.tsx` (key hint, detected server opens on
its models all checked with no key line, port prompt); `use-provider-setup-flow.test.ts` (port,
full URL, empty field, no port reading for remote providers); `auth-step-position.test.ts`; catalog,
descriptors and loopback rules; the route; SDK method; Web Shell groups (7 cases); telemetry and env
list removals.

## Gates (repo root, one at a time)

| Gate                                                                            | Result                  |
| ------------------------------------------------------------------------------- | ----------------------- |
| `npm run build -- --cli-only`                                                   | pass                    |
| `npm run typecheck`                                                             | pass                    |
| `npm run lint`                                                                  | exit 0                  |
| `node scripts/o1/brand-lint.mjs`                                                | 0 lines over 5832 files |
| `npx tsx scripts/check-i18n.ts`                                                 | All checks passed       |
| `npm run bundle`                                                                | pass                    |
| `node scripts/o1/smoke.mjs`                                                     | PASS                    |
| `node scripts/o1/provider-smoke.mjs`                                            | PASS                    |
| `npx prettier --check` (docs, changelog, roadmap, OpenAPI, touched sources)     | clean                   |
| `node scripts/o1/check-guides.mjs`                                              | 0 problems              |
| contract tests (`rest-integration-docs-contract`, `capabilities-docs-contract`) | 9 passed                |

## Real check

`node dist/cli.js` through `pty-screen-cwd.cjs` (120×40), scratch `O1CODE_HOME` with folder trust
off, system locale pt-BR. The dialog opens by itself on a home with no provider, so the brief's
`/auth\r` + `\r` lands one screen in; the steps then press esc to reach the main screen. For the
detection captures a stand-in Ollama (`tui-proto/fake-ollama.cjs`, `/api/tags` and `/v1/models` on
127.0.0.1:11434) was started; no real Ollama or LM Studio runs on this machine.

Main screen (nothing running):

```
│ Conectar provedor                                                                        passo 1 │
│ ❯ OrganizaOne                                                                                    │
│   Conecte-se à OrganizaOne com sua chave                                                         │
│   Chave de API                                                                                   │
│   Anthropic, OpenAI, Google Gemini, xAI e outros                                                 │
│   Local                                                                                          │
│   Modelos rodando nesta máquina                                                                  │
│   Personalizado                                                                                  │
│   Qualquer URL, OpenAI-compatible ou Anthropic                                                   │
│ ────────────────────────────────────────────────────────────────────────────────                 │
│ Termos de Serviço e Aviso de Privacidade:                                                        │
│ https://github.com/silvioricardo87/o1-code/blob/main/docs/users/support/tos-privacy.md           │
```

Main screen with Ollama answering:

```
│   Local  ●︎ Ollama detectado                                                                      │
│   Modelos rodando nesta máquina                                                                  │
```

OrganizaOne, enter on a coming-soon entry:

```
│ Conectar provedor › OrganizaOne                                                          passo 2 │
│   Chave de API                                                                                   │
│   Cole a chave; os modelos vêm da OrganizaOne                                                    │
│   Entrar com sua conta  em breve                                                                 │
│   Entre na OrganizaOne pelo navegador                                                            │
│ ❯ Código de dispositivo aipp  em breve                                                           │
│   Cole um código de conexão aipp                                                                 │
│ Em breve: este caminho depende do servidor da OrganizaOne.                                       │
│ ↑↓ navegar · enter selecionar · esc voltar                                                       │
```

API key list:

```
│ Conectar provedor › Chave de API                                                         passo 2 │
│ ❯ Alibaba Cloud     Coding Plan, Token Plan ou chave padrão                                      │
│   Anthropic         Claude · chave em console.anthropic.com                                      │
│   DeepSeek          Configuração rápida do DeepSeek (deepseek-v4-flash, deepseek-v4-pro)         │
│   Google Gemini     Gemini · chave em aistudio.google.com                                        │
│   Kimi (Moonshot)   Configuração rápida dos modelos Kimi                                         │
│   MiniMax           Configuração rápida dos modelos MiniMax                                      │
│   ModelScope        Configuração rápida da inferência por API do ModelScope                      │
│   OpenAI            GPT · chave em platform.openai.com                                           │
│   xAI               Grok · chave em console.x.ai                                                 │
│   Z.AI              Configuração rápida dos modelos Z.AI                                         │
│ ↑↓ navegar · enter selecionar · esc voltar                                                       │
```

Local, nothing running, enter on Ollama:

```
│ Conectar provedor › Local                                                                passo 2 │
│ ❯ Ollama  ○︎ inativo                                                                              │
│   Modelos do Ollama nesta máquina                                                                │
│   LM Studio  ○︎ inativo                                                                           │
│   Modelos do LM Studio nesta máquina                                                             │
│   Outro servidor local                                                                           │
│   Qualquer servidor compatível com OpenAI nesta máquina                                          │
│ Nada respondeu nessa porta. Inicie o servidor e pressione ctrl+r.                                │
│ ↑↓ navegar · enter selecionar · ctrl+r procurar de novo · esc voltar                             │
```

Local with Ollama answering, then enter on Ollama (no key step, models checked):

```
│ Conectar provedor › Local                                                                passo 2 │
│ ❯ Ollama  ●︎ detectado · 3 modelos                                                                │
│   LM Studio  ○︎ inativo                                                                           │

│ Conectar provedor › Ollama › IDs de modelo                                          passo 3 de 3 │
│ Modelos · do provedor · 3 marcados                                                               │
│   ●︎ llama3.2:3b                  text                                                            │
│   ●︎ qwen3:8b                     text                                                            │
│   ●︎ gemma3:4b                    text                                                            │
```

Full path to the review: Custom → OpenAI-compatible → Chat Completions → base URL
`http://127.0.0.1:11434/v1` → key → models → advanced → review:

```
│ Conectar provedor › Provedor personalizado › Protocolo                              passo 2 de 8 │
│ Conectar provedor › Provedor personalizado › Base URL                               passo 4 de 8 │
│ Conectar provedor › Provedor personalizado › API Key                                passo 5 de 8 │
│ > sk-...                                                                                         │
│ a chave fica em ~/.o1-code/credentials/, só para o seu usuário                                   │
│ Conectar provedor › Provedor personalizado › IDs de modelo                          passo 6 de 8 │
│ ✓ chave válida                                                                                   │
│ Modelos · do provedor · 3 marcados                                                               │
│ Conectar provedor › Provedor personalizado › Revisão                                passo 8 de 8 │
│ Endpoint    http://127.0.0.1:11434/v1                                                            │
│ Modelos     llama3.2:3b, qwen3:8b, gemma3:4b                                                     │
│ Este JSON será gravado no settings.json:                                                         │
│   "credential": {                                                                                │
│     "id": "custom-a5a03f67a771",                                                                 │
│     "apiKey": "sk-...7890"                                                                       │
```

Full captures: scratchpad `tui-proto/a2-menus.txt`, `a2-local.txt`, `a2-custom.txt`.

## Open points

1. The TUI navigation cases in `AuthDialog.test.tsx` are skipped on Windows and on CI, so the updated
   and new navigation cases are unverified by a test run; the real check covers the same paths.
2. The review step overflows a 40-row terminal (the JSON is taller than the screen): the Provider and
   Key rows are not visible in the capture and the hint overlaps the JSON. The review step was not
   changed by this plan.
3. `Enter the API endpoint for this protocol.` has no pt-BR translation (pre-existing).
4. The DeepSeek, Kimi, MiniMax, ModelScope and Z.AI rows show the presets' "Quick setup…" descriptions;
   the mock had "key from …" texts. The brief says descriptions come from the presets, so they were
   not changed.
5. The Web Shell was not validated in a browser against a running daemon, and the e2e suite was not
   run (per the brief).
6. The VS Code companion still builds its own grouping from `PROVIDERS_BY_GROUP`; it does not show the
   four groups or the family row.
7. The main entry is "Custom", while the flow's path still says "Custom Provider" (the preset label).

Open points 2, 3, 4 and 7 are closed by the follow-up below.

## Follow-up (coordinator round 2)

1. **Custom label.** `customProvider.label` is `Custom`, so the path line and the menu say the same
   word ("Personalizado" in pt-BR, through the existing `Custom` key). The `Custom Provider` locale
   entry is gone from the nine locales. Tests and fixtures that named the old label were updated
   (`AuthDialog.test.tsx` paths, `ProviderSetupSteps.test.tsx`, the Web Shell DOM test and e2e
   fixtures), plus `docs/users/overview.md`, `auth.md` and `model-providers.md`.
2. **Compact review.** `ReviewStep` shows one line each for Provider, Endpoint, Key (masked as before,
   with `✓ key valid` when checked) and Models (comma-separated), then one muted line "The key is saved
   in ~/.o1-code/credentials/ and the models in settings.json." The raw JSON preview is no longer
   rendered; the flow still computes `previewJson`/`previewError`, and a refused plan still shows its
   message in place of the muted line. The string "The following JSON will be saved to settings.json:"
   was replaced by the new one in the nine locales. `TUI-DESIGN.md` records the rule. Three TUI
   navigation tests that read the JSON from the screen (skipped on Windows/CI) now assert the summary
   and check the submitted inputs instead.
3. **Key row descriptions.** The DeepSeek, Moonshot, MiniMax, ModelScope and Z.AI presets now read
   "key from platform.deepseek.com", "key from platform.moonshot.ai", "key from
   platform.minimax.io", "key from modelscope.cn" and "key from z.ai" (pt-BR "chave em …"; the
   other locales follow the form of their Anthropic/OpenAI rows). The old "Quick setup…" keys were
   removed from the locales and from `scripts/unused-keys-only-in-locales.json`.
4. **pt-BR endpoint prompt.** `Enter the API endpoint for this protocol.` was not in any locale; it is
   now in the nine, pt-BR "Informe o endpoint da API para este protocolo."

Tests first: the custom label and the five descriptions (`custom-provider.test.ts`,
`all-providers.test.ts`), the compact summary (`ProviderSetupSteps.test.tsx`: the four labelled rows,
the muted line, no JSON, at most six rows) — red, then green. The refused-plan test and the pt-BR
prompt test were added as guards; the first already passed before the change, and the second was
written after the locale entry. The API key row test in `AuthDialog.test.tsx` now checks all ten
descriptions.

Affected tests: core `src/providers` 365 passed; cli `ui/auth`, daemon helpers, the route,
`config/auth`, `commands/auth` 209 passed (23 skipped, the Windows TUI guard); `acpAgent -t provider`
38 passed; Web Shell `AuthMessage.dom.test.tsx` 27 passed.

Gates, one at a time: build `--cli-only` pass, typecheck pass, lint exit 0, brand-lint 0 lines,
check-i18n passed, bundle pass, smoke PASS, provider-smoke PASS, prettier clean (touched files,
formatted with `prettier --write` first), check-guides 0 problems.

Review re-captured at 120×40 (same Custom path to the stand-in server; it now fits, with the hint
on screen):

```
│ Conectar provedor › Personalizado › Revisão                                         passo 8 de 8 │
│                                                                                                  │
│                                                                                                  │
│ Provedor    Personalizado                                                                        │
│ Endpoint    http://127.0.0.1:11434/v1                                                            │
│ Chave       sk-test-…7890  ✓ chave válida                                                        │
│ Modelos     llama3.2:3b, qwen3:8b, gemma3:4b                                                     │
│                                                                                                  │
│ A chave fica em ~/.o1-code/credentials/ e os modelos no settings.json.                           │
│                                                                                                  │
│ Enter grava, Esc volta                                                                           │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

The base URL step now reads "Informe o endpoint da API para este protocolo.", and the API key list:

```
│ ❯ Alibaba Cloud     Coding Plan, Token Plan ou chave padrão                                      │
│   Anthropic         Claude · chave em console.anthropic.com                                      │
│   DeepSeek          chave em platform.deepseek.com                                               │
│   Google Gemini     Gemini · chave em aistudio.google.com                                        │
│   Kimi (Moonshot)   chave em platform.moonshot.ai                                                │
│   MiniMax           chave em platform.minimax.io                                                 │
│   ModelScope        chave em modelscope.cn                                                       │
│   OpenAI            GPT · chave em platform.openai.com                                           │
│   xAI               Grok · chave em console.x.ai                                                 │
│   Z.AI              chave em z.ai                                                                │
```

Captures: scratchpad `tui-proto/a2-review.txt`, `a2-keys.txt`.
