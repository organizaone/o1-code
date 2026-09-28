# Documentation inventory: o1-code

Survey of 2026-09-26, branch `gaps` at `62dfa80`. Read-only. It covers every documentation-like file tracked
in git: 209 files and 86,253 lines. That count excludes 45 Web Shell `sidebar` source files that the
pattern caught and one SVG icon.

Origin is judged from the text alone, because the history is one squashed commit (`feat: o1-code 0.1.0`)
and there is no upstream remote. "Rebranded" means upstream prose with the names swapped.

Legend: KEEP · KEEP VERBATIM · UPDATE (specific facts are stale) · REWRITE (keep the topic, write it in
o1-code's voice) · REMOVE. Effort: S < 1h, M = a few hours, L = a day or more.

Facts that shape the verdicts:

- **`docs/users/` ships inside the product.** `scripts/copy_bundle_assets.js:529` copies it to
  `dist/bundled/qc-helper/docs/`, and the bundled `qc-helper` skill reads it at runtime. Its
  `SKILL.md` (lines 88–100) holds a table of doc paths that must follow every rename or removal.
- **brand-lint only covers `docs/users/**/\*.md`** plus the UI, i18n and prompts (`brand.json`→`lint.paths`).
`docs/index.md`, `docs/developers`, `CONTRIBUTING.md`, `README.md` and the package READMEs are
  outside the gate, and still say "Qwen Code".
- **Five guides are copies by design.** `AGENT-WORKFLOW`, `AUTONOMOUS-EXECUTION`, `COMMITS`,
  `TASK-COMPLETION` and `VERSIONING` are copies of `../agents-defaults`. `scripts/o1/check-guides.mjs`
  compares them byte for byte up to `## Deviations in this project`, so only the deviations section may
  be edited.
- **Contract tests read four developer docs.** `packages/cli/src/serve/rest-integration-docs-contract.test.ts`
  and `capabilities-docs-contract.test.ts` read `o1-code-serve-protocol.md`,
  `daemon-rest-api-reference.md`, `daemon-rest-api.openapi.json`, `rest-api-integration.md`,
  `examples/daemon-client-quickstart.md` and `daemon/00-index.md`. Renaming them breaks tests. An edit
  must keep the headings and anchors the tests check.
- **The docs site is not built.** `docs-site/` is Nextra 4 / Next 16 and consumes `docs/` through 11
  `_meta.ts` files. No CI job, workspace entry or `build` script touches it.

## 1. Summary

| Recommendation | Files |  Lines | Notes                                                                                                                                             |
| -------------- | ----: | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| KEEP           |   100 | 22,109 | Includes 21 bundled-skill prompt files, which are runtime content, not docs                                                                       |
| KEEP VERBATIM  |    12 | 29,488 | LICENSE ×3, NOTICES.txt (27,737, generated), 2 test fixtures, 5 copied guides (the deviation sections of COMMITS and TASK-COMPLETION need UPDATE) |
| UPDATE         |    70 | 20,135 | Mostly: `npm install` of unpublished packages, QwenLM issue/PR links, removed features in passing, broken `../design/` links                      |
| REWRITE        |    13 |  4,071 | README, CONTRIBUTING, SECURITY, docs/index, PRD, 5 user pages, 3 docs in upstream PR voice or Chinese                                             |
| REMOVE         |    14 | 10,450 | CHANGELOG.md is 8,533 of these lines                                                                                                              |
| **Total**      |   209 | 86,253 |                                                                                                                                                   |

Doc-adjacent assets:

- 6 images under `docs/`. Five are unreferenced anywhere and should be REMOVED:
  `docs/assets/{session-group-custom-hex-colors.png, workspace-display-name-web-shell*.jpg}` and
  `docs/images/webshell-extension-tag-icon-{before,after}.jpg`. The sixth,
  `daemon/assets/workspace-create-timeout.png`, is referenced by `daemon/17-configuration.md`.
- 2 JSON files that tests load: `docs/developers/daemon-rest-api.openapi.json` (4,284 lines) and
  `docs/users/features/omni-fixed-policies-preset.json`. Both are KEEP.
- About 20 external screenshots on `gw.alicdn.com` show the upstream UI, in `themes.md`,
  `integration-zed.md`, `integration-jetbrains.md` and `token-caching.md`, plus a taobao demo video.
  Replace them or drop them.
- Package UI assets (web-shell 30, vscode 4) are code assets, not docs, and are out of scope.

`CODE_OF_CONDUCT.md` does not exist. Nothing links to it.

## 2. Root and identity files

| Path              | Lines | What / reader                                                            | Origin                         | Verdict       | Why                                                                                                                                                                                                                                                                   | Effort |
| ----------------- | ----: | ------------------------------------------------------------------------ | ------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `LICENSE`         |   204 | Apache-2.0 text                                                          | upstream                       | KEEP VERBATIM | The license requires the copy                                                                                                                                                                                                                                         | –      |
| `NOTICE`          |    27 | §4(b)/(c) attribution                                                    | o1-code                        | KEEP          | Already o1-code's own, plain and current                                                                                                                                                                                                                              | –      |
| `README.md`       |   107 | Landing page; everyone                                                   | rebranded (~60% upstream copy) | REWRITE       | See the section table below                                                                                                                                                                                                                                           | M      |
| `CONTRIBUTING.md` |   332 | Contributor process                                                      | upstream, half-rebranded       | REWRITE       | See the notes below the README table                                                                                                                                                                                                                                  | M      |
| `SECURITY.md`     |     9 | Vulnerability reporting                                                  | upstream unchanged             | REWRITE       | **Sends reports to Alibaba's Aliyun security portal.** Use GitHub private vulnerability reporting on `silvioricardo87/o1-code`. Urgent                                                                                                                                | S      |
| `CHANGELOG.md`    | 8,533 | Upstream release history 0.0.2 to 0.24.3, generated from QwenLM releases | upstream unchanged             | REMOVE        | See the recommendation below                                                                                                                                                                                                                                          | S      |
| `CHANGELOG.o1.md` |    54 | o1-code's changelog                                                      | o1-code                        | KEEP          | Optionally rename to `CHANGELOG.md` once the upstream file is gone. Its references: PR template:12, AGENTS.md:15, HANDOFF, ROADMAP:38, TASK-COMPLETION:172                                                                                                            | S      |
| `AGENTS.md`       |   155 | Canonical agent and maintainer rules                                     | o1-code                        | UPDATE        | Rule 4 omits Live and computer use, which HANDOFF lists as removed. The "This replaces the earlier instruction…" paragraph and the "seven scripts" anecdote are history; cut them. Line 12 points to `01-upstream-survey.md`, which this inventory proposes to remove | S      |
| `CLAUDE.md`       |     6 | Pointer to AGENTS.md                                                     | o1-code                        | KEEP          | –                                                                                                                                                                                                                                                                     | –      |

**CHANGELOG.md.** Remove it, together with the tooling that generates it:

- `scripts/generate-changelog.js` and the `changelog` script in `package.json:74` regenerate it from QwenLM GitHub Releases.
- `.prettierignore:17` excludes it.

Then rename `CHANGELOG.o1.md` to `CHANGELOG.md`, or keep the `.o1` name. `NOTICE` records the fork point, so the upstream history is still reachable upstream.

Text that mentions `CHANGELOG.md` and needs editing:

- `docs/guides/TASK-COMPLETION.md:172-173` (deviation section)
- `CHANGELOG.o1.md:3-4`
- `docs/fork/02-prd-o1-code.md:131`
- `docs/fork/04-development-guidelines.md`, which is itself slated for removal

The `CHANGELOG` strings in `review/lib/workspace-scope.ts` and `fileUtils.ts` are generic and do not depend on this file.

**README.md, section by section:**

| Section                                                                 | Verdict                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header tagline "…for your terminal, editor, desktop, browser, and chat" | REWRITE: desktop, browser and chat were removed                                                                                                                                          |
| Why O1-Code                                                             | REWRITE: the "Beyond the terminal" bullet claims a desktop app, chat integrations and SDKs "exist in the source tree". They were removed. "Qwen" as a model-family selling point is fine |
| Tip box (derives from Qwen Code 0.24.4)                                 | KEEP, or fold into Acknowledgments                                                                                                                                                       |
| Installation                                                            | UPDATE: `git clone <this repository>` should be the real URL                                                                                                                             |
| Quick Start                                                             | KEEP                                                                                                                                                                                     |
| How to Use                                                              | UPDATE: drop the note that the upstream's desktop app and SDKs are "not part of this fork" and the ROADMAP pointer. Say what exists                                                      |
| Capabilities (vs Claude Code table)                                     | REMOVE: upstream marketing that links `wenshao/codeagents` and claims Computer Use ✓, which was removed. Replace it with a short feature list in o1-code's voice                         |
| Privacy                                                                 | KEEP                                                                                                                                                                                     |
| Contributing                                                            | KEEP (link)                                                                                                                                                                              |
| Acknowledgments                                                         | KEEP                                                                                                                                                                                     |

**CONTRIBUTING.md.** Replace it with about 60 lines that point to AGENTS.md and `docs/guides/`. What is wrong with the current file:

- Upstream process: issue-first, Draft PRs, and "Conventional Commits", which contradicts the `<Verb> <Area>:` format actually used.
- Line 103 clones `QwenLM/qwen-code`, and lines 135, 159, 220 and 295 say "Qwen Code".
- `npm run preflight` (unverified that it still exists).
- The docs-site section.
- "Sandboxing: TBD".
- "Manual Publish: …our internal registry" (upstream-internal).
- The "Adding a Provider Preset" section is worth keeping.

## 3. docs/users (66 files, ~20k lines; bundled into the product)

Every page is upstream rebranded. No documented feature is missing from the code, so nothing here is
REMOVE. Two problems run across many pages:

- `npm install -g @organizaone/o1-code` appears in 11 places, but the package is `private: true` and unpublished.
- Marketplace, Open VSX and ACP Registry install paths are unverified.

**Entry pages:**

| Path                            | Lines | Verdict | Why                                                                                                                                                                                                  | Effort |
| ------------------------------- | ----: | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `docs/index.md`                 |    25 | REWRITE | Says "Qwen Code Documentation" 4×, outside brand-lint                                                                                                                                                | S      |
| `docs/_meta.ts`                 |    14 | KEEP    | –                                                                                                                                                                                                    | –      |
| `users/_meta.ts`                |    33 | UPDATE  | `ide-integration` is hidden with a `// need refine` comment. Decide whether to show or merge it                                                                                                      | S      |
| `overview.md`                   |    61 | REWRITE | npm badges and install; "Alibaba ModelStudio official recommended"; taobao video; "Our new VS Code extension"                                                                                        | S      |
| `quickstart.md`                 |   256 | REWRITE | npm install; an Alibaba key as the prerequisite; a note on Qwen OAuth being discontinued. Build from source, then `/auth`                                                                            | M      |
| `common-workflow.md`            |   603 | KEEP    | –                                                                                                                                                                                                    | –      |
| `o1-code-serve.md`              | 1,199 | REWRITE | "v0.16-alpha ships to npm"; Stage 1/1.5 roadmap voice; about 18 QwenLM issue/PR links; "what we won't fix". A test string cites it (`acp-bridge/src/child-heap-policy.test.ts:96`), so keep the name | L      |
| `o1-code-serve-deploy-local.md` |   266 | UPDATE  | v0.16-alpha framing; QwenLM #4175 link at line 266                                                                                                                                                   | S      |
| `conversations-recovery.md`     |   102 | UPDATE  | Lines 4-5 mention a "Live locator/publication"; Live was removed (unverified). Runtime error text links here (`session-writer-lease.ts:1671`), so keep the path                                      | S      |
| `integration-github-action.md`  |   241 | REWRITE | Presents `qwen-code-action` as if it were ours: `@qwencoder`, QwenLM links, "we". The Action stays by decision (HANDOFF:31), but frame it as the upstream Action that `/setup-github` installs       | M      |
| `integration-vscode.md`         |    39 | UPDATE  | taobao video; Marketplace listing unverified (the extension is private)                                                                                                                              | S      |
| `integration-zed.md`            |    72 | UPDATE  | npm install ×2; ACP Registry unverified; 4 alicdn screenshots                                                                                                                                        | S      |
| `integration-jetbrains.md`      |    83 | UPDATE  | Same issues as `integration-zed.md`                                                                                                                                                                  | S      |

**configuration/\*:**

| Path                                                                        | Lines | Verdict | Why                                                                                                                                                                                      | Effort |
| --------------------------------------------------------------------------- | ----: | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `auth.md`                                                                   |   407 | UPDATE  | "Option 1: Qwen OAuth (Discontinued)" leads the page, and Alibaba plans come before the generic API key. Reorder so the provider by URL comes first                                      | S      |
| `settings.md`                                                               | 1,026 | UPDATE  | Lines 994-1026 say data goes to "Alibaba Cloud RUM", which the fork removed and which contradicts `tos-privacy.md`. That is a **privacy claim**. Line 201 mentions computer-use sessions | S      |
| `themes.md`                                                                 |   202 | UPDATE  | 13 upstream screenshots on alicdn                                                                                                                                                        | M      |
| `model-providers.md`, `o1-code-ignore.md`, `trusted-folders.md`, `_meta.ts` | 1,058 | KEEP    | Qwen and Alibaba mentions here are provider facts. `o1-code-ignore.md:9` links `developers/tools/multi-file`, which this inventory removes, so fix that link                             | S      |

**extension/\* (5 files, 1,048 lines).** KEEP. The voice is upstream's ("We offer") but acceptable. Two pages are hidden in the sidebar and reachable by link.

**features/\* (33 pages plus the JSON and `_meta.ts`, ~12.9k lines).** 26 are KEEP. These are UPDATE:

| Page                          | Why                                                                                      | Effort |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| `arena.md`                    | Line 55 "We intend to support tmux/iTerm2" is roadmap voice; the example models are fine | S      |
| `dual-output.md`              | Lines 23-28 lead with a "desktop ChatUI… mobile" use case                                | S      |
| `language.md`                 | Line 130 links QwenLM PR #1238                                                           | S      |
| `multi-agent-coordination.md` | The "Herdr" row has no code                                                              | S      |
| `omni-media-policies.md`      | "Only on the omni experimental branch", but omni is in the tree                          | S      |
| `sandbox.md`                  | npm install at line 53                                                                   | S      |
| `token-caching.md`            | "Qwen API key" wording and an alicdn screenshot                                          | S      |
| `hooks.md`                    | KEEP; line 241 has minor upstream voice                                                  | S      |

**ide-integration/\*:**

| Path                    | Lines | Verdict | Why                                                                                                                                                  | Effort |
| ----------------------- | ----: | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `ide-integration.md`    |   144 | UPDATE  | Hidden; overlaps `integration-vscode.md`; Marketplace links. Merge into `integration-vscode.md` or unhide it                                         | M      |
| `ide-companion-spec.md` |   182 | UPDATE  | A protocol spec for developers that sits in the user guide. Consider moving it to `docs/developers/`, and update `qc-helper/SKILL.md:92` if it moves | S      |

**reference/_ and support/_:**

| Path                    | Lines | Verdict | Why                                                                                                                                                                                       | Effort |
| ----------------------- | ----: | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `keyboard-shortcuts.md` |   147 | KEEP    | –                                                                                                                                                                                         | –      |
| `troubleshooting.md`    |   151 | UPDATE  | Qwen OAuth errors lead the page; npm update at lines 46 and 75                                                                                                                            | S      |
| `tos-privacy.md`        |   108 | UPDATE  | Qwen OAuth is listed first; the usage-statistics section is o1-code's own and correct                                                                                                     | S      |
| `Uninstall.md`          |    42 | REWRITE | npx cache and `npm uninstall -g` do not apply to a from-source install. Also rename it to lowercase `uninstall.md` (house style), then update `support/_meta.ts` and `qc-helper/SKILL.md` | S      |

## 4. docs/developers (55 files, ~16.8k lines, plus the OpenAPI JSON)

No file here reads as o1-code's own. Everything is upstream rebranded. The whole tree sits outside brand-lint.

**Top-level and navigation:**

| Path                | Lines | Reader         | Verdict | Why                                                                                                                                                   | Effort |
| ------------------- | ----: | -------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `_meta.ts`          |    26 | nav            | UPDATE  | `development`, `daemon-ui` and `daemon-client-adapters` are missing from the nav. It lists `roadmap` and `contributing`, which this inventory removes | S      |
| `architecture.md`   |   220 | contributor    | UPDATE  | Lines 84-85 list `packages/desktop-shell`, `cua-driver` and `mobile-mcp`, which were removed. Line 87 mentions `docs-site`                            | S      |
| `contributing.md`   |   312 | contributor    | REMOVE  | Near-duplicate of root CONTRIBUTING, and demands zh-CN design docs in a nonexistent `../design/`                                                      | S      |
| `roadmap.md`        |    82 | upstream       | REMOVE  | The upstream's product roadmap (V0.0.5–V0.10, Alibaba Coding Plan). `docs/fork/ROADMAP.md` replaces it                                                | S      |
| `sdk-typescript.md` |   533 | SDK integrator | UPDATE  | "Requires O1-Code >= 0.4.0" (we are at 0.1.0); the `authType` list includes `gemini` and `vertex-ai` (unverified); qwen example models                | S      |

**REST API and protocol docs (contract-tested, keep the names):**

| Path                           | Lines | Verdict | Why                                                                                                   | Effort |
| ------------------------------ | ----: | ------- | ----------------------------------------------------------------------------------------------------- | ------ |
| `rest-api-integration.md`      |   379 | UPDATE  | QwenLM #11357 and #11358 links                                                                        | S      |
| `daemon-rest-api-reference.md` |   148 | UPDATE  | The OpenAPI raw URL uses `organizaone/o1-code`, but `brand.json` names `silvioricardo87/o1-code`      | S      |
| `daemon-rest-api.openapi.json` | 4,284 | KEEP    | –                                                                                                     | –      |
| `o1-code-serve-protocol.md`    | 3,747 | UPDATE  | Line 3 "Stage 1 of daemon design" plus QwenLM #3803; about 8 more QwenLM links; alibabacloud examples | M      |

**daemon/ (00–20, no 15):**

| Path                       |  Lines | Verdict        | Why                                                                                                 | Effort |
| -------------------------- | -----: | -------------- | --------------------------------------------------------------------------------------------------- | ------ |
| `00-index.md`              |    167 | UPDATE         | Cites a missing doc "15" (line 27); broken `../../design/` link; F1–F4 milestones via QwenLM #4175  | S      |
| `01–13, 16–20` (18 files)  | ~5,400 | UPDATE (group) | These are reference docs that match `packages/cli/src/serve`, not RFCs. Details below the table     | M      |
| `14-cli-tui-adapter.md`    |    195 | UPDATE         | Presents the layer as serving "IM channels" and a "channel base" (removed); PR history as narrative | S      |
| `_meta.ts`, `assets/*.png` |     22 | KEEP           | –                                                                                                   | –      |

What is stale in the 01–13 and 16–20 group:

- QwenLM #3803 and #4175 links in 01–06, 13 and 14.
- Broken `../../design/*.md` links in 00, 01, 05, 06, 07 and 17. `docs/design/` does not exist.
- **Channel webhook ingress** (`x-o1code-webhook-secret`) in 02 (L39, L60) and 12 (L164, L205, L356). That is the removed messaging-channels feature, and there is no webhook code.

**daemon-ui/ and daemon-client-adapters/:**

| Path                                  | Lines | Verdict | Why                                                                                                                                | Effort |
| ------------------------------------- | ----: | ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `daemon-ui/README.md`                 |   436 | REWRITE | A valid API topic, written in PR voice ("this PR", #4353/#4328)                                                                    | M      |
| `daemon-ui/MIGRATION.md`              |   340 | REMOVE  | PR history: "PR #4353 (this PR) ships v2… safe to merge"                                                                           | S      |
| `daemon-ui/sidebar-customization.md`  |   352 | KEEP    | Matches `WebShellSidebar`                                                                                                          | –      |
| `daemon-client-adapters/tui.md`       |   100 | REMOVE  | Self-declared "Deprecated… (historical)"; `daemon/14` replaces it                                                                  | S      |
| `daemon-client-adapters/ide.md`       |   122 | REMOVE  | Draft; its proposed `experimentalDaemon.*` settings do not exist; `daemon/16` covers the real code                                 | S      |
| `daemon-client-adapters/web-shell.md` |   120 | UPDATE  | Overlaps `daemon-ui/README` and `daemon/14`, and is outside the nav. Candidate to merge into `daemon-ui/README` during its rewrite | S      |

**development/:**

| Path                   | Lines | Verdict | Why                                                                                                                                         | Effort |
| ---------------------- | ----: | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `_meta.ts`             |     8 | UPDATE  | The root `_meta.ts` does not reach it                                                                                                       | S      |
| `deployment.md`        |   123 | REMOVE  | Upstream release workflow and "Aliyun OSS mirror", neither in the tree (only `o1-ci.yml` exists)                                            | S      |
| `npm.md`               |   258 | REMOVE  | Upstream release process: QwenLM `release.yml`, nightly and preview. Salvage the ~16-line package overview into `architecture.md` if wanted | S      |
| `telemetry.md`         | 1,018 | UPDATE  | A valid, user-configurable OTLP guide. "Aliyun Telemetry" (L437-534), `target: gcp`, and a broken `../../design/` link are stale            | M      |
| `integration-tests.md` |   127 | KEEP    | –                                                                                                                                           | –      |

**examples/ and tools/:**

| Path                                                                                               | Lines | Verdict | Why                                                                                                          | Effort |
| -------------------------------------------------------------------------------------------------- | ----: | ------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| `examples/daemon-client-quickstart.md`, `examples/proxy-script.md`                                 |   412 | KEEP    | The quickstart is contract-tested                                                                            | –      |
| `tools/_meta.ts`                                                                                   |    14 | UPDATE  | Drop `multi-file`; the "Task" title documents the `agent` tool                                               | S      |
| `tools/introduction.md`                                                                            |    60 | UPDATE  | Covers about 15 of ~60 tools in `tool-names.ts`                                                              | M      |
| `tools/multi-file.md`                                                                              |    71 | REMOVE  | `read_many_files` is no longer a registered tool; the doc itself says so                                     | S      |
| `tools/task.md`                                                                                    |   170 | UPDATE  | Documents `agent`; the real `task_*` tools are undocumented. Rename it to `agent.md` and write a `task` page | M      |
| `tools/web-search.md`                                                                              |   310 | UPDATE  | The "Historical Breaking Change" section (L100+) is upstream history                                         | S      |
| `tools/sandbox.md`                                                                                 |    91 | UPDATE  | `ghcr.io/organizaone/o1-code:sha-570ec43` is unverified; "1、" numbering                                     | S      |
| `tools/file-system`, `shell`, `monitor`, `todo-write`, `exit-plan-mode`, `web-fetch`, `mcp-server` | 1,901 | KEEP    | They match the code. `zoom_image` and `enter_plan_mode` are undocumented                                     | –      |

## 5. docs/guides and docs/fork

**docs/guides/** holds lasting guides. The English translation is done.

| Path                                                            | Lines | Kind         | Verdict                           | Why                                                                                                                                                                                                                                                                                                                                           | Effort |
| --------------------------------------------------------------- | ----: | ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `AGENT-WORKFLOW.md`, `AUTONOMOUS-EXECUTION.md`, `VERSIONING.md` |   616 | copied guide | KEEP VERBATIM                     | `check-guides.mjs` enforces the copy; the deviation sections are current                                                                                                                                                                                                                                                                      | –      |
| `COMMITS.md`                                                    |   186 | copied guide | KEEP VERBATIM + UPDATE deviations | **The deviation is false.** It says the project uses Conventional Commits "because the history is shared with the upstream". The history was rewritten, and every commit since uses the guide's default `<Verb> <Area>: …` format. Delete the Format, Version levels and `fork`-scope deviations, or decide to return to Conventional Commits | S      |
| `TASK-COMPLETION.md`                                            |   182 | copied guide | KEEP VERBATIM + UPDATE deviations | The "Additional exception" for the three-commit upstream sync (L180-182) is dead, since there are no more syncs. "`CHANGELOG.md` belongs to upstream" changes if the file is removed                                                                                                                                                          | S      |
| `STACK-O1-CODE.md`                                              |    78 | o1-code      | KEEP                              | This is the reference style                                                                                                                                                                                                                                                                                                                   | –      |
| `TUI-DESIGN.md`                                                 |   293 | o1-code      | KEEP                              | Current. Its link to the PRD Phase 3 is fine                                                                                                                                                                                                                                                                                                  | –      |

**docs/fork/** holds working documents, the conversation with the maintainer.

| Path                               | Lines | Kind              | Verdict           | Why / references                                                                                                                                                                                                                                                                                    | Effort |
| ---------------------------------- | ----: | ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `01-upstream-survey.md`            |   299 | history           | REMOVE            | Survey of 0.24.3 for a sync strategy that was abandoned. HANDOFF says the old history is not archived. Referenced by AGENTS.md:12 and PRD:5 and :100                                                                                                                                                | S      |
| `02-prd-o1-code.md`                |   460 | working → lasting | REWRITE           | See the notes below the table. Referenced by AGENTS.md:10, STACK:78 and TUI-DESIGN:293                                                                                                                                                                                                              | M      |
| `03-feature-evaluation-process.md` |    85 | lasting process   | KEEP              | Already revised for D10                                                                                                                                                                                                                                                                             | –      |
| `04-development-guidelines.md`     |    66 | history           | REMOVE            | The adoption evaluation of agents-defaults. It describes a "direct merge to main" and sync exceptions that are now false; the live deviations are in the guides. Referenced by PRD:59                                                                                                               | S      |
| `PATCHES.md`                       |    83 | history (frozen)  | REMOVE (decision) | 89 tracked source files carry the header `Modified by the o1-code project; see docs/fork/PATCHES.md.` Removing the file means rewriting those 89 headers to `…; see NOTICE.` mechanically. NOTICE is the §4(b) notice, and the §4(c) copyright lines stay untouched. AGENTS.md:26 also refers to it | M      |
| `HANDOFF.md`                       |    80 | working           | UPDATE            | Next step 2 says "this translation is the first of them", but the translation is done. Refresh the next steps                                                                                                                                                                                       | S      |
| `ROADMAP.md`                       |   104 | lasting           | UPDATE            | Three tests say "See docs/fork/ROADMAP.md (CI)", but there is no CI heading (governance is under "Repository governance"). Add the heading or fix the comments. Otherwise current                                                                                                                   | S      |
| `UPSTREAM-WATCH.md`                |    40 | lasting           | KEEP              | –                                                                                                                                                                                                                                                                                                   | –      |
| `candidates/*` (4 files)           |   112 | working           | KEEP              | Two v0.24.5 cards are still deferred                                                                                                                                                                                                                                                                | –      |

The PRD rewrite:

- The status line reads "initial draft (survey stage)", which is stale.
- §4.2 and §4.3 (branding layer, upstream sync) and Phases 0–3 are finished history.
- §10 "TUI design [TO DEFINE]" is now `TUI-DESIGN.md`.
- Condense the PRD to vision, scope, out of scope, Phases 4–5, risks and the license checklist.

## 6. Packages and integrations

**Bundled skills and runtime content:**

| Path                                                               | Lines | Runtime?                                  | Verdict       | Why                                                                                                                                                                                  | Effort |
| ------------------------------------------------------------------ | ----: | ----------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `packages/core/src/skills/bundled/**` (21 files)                   | 5,379 | yes (prompts)                             | KEEP          | Prompt content, not docs                                                                                                                                                             | –      |
| `…/bundled/review/references/posting.md`                           |   293 | yes                                       | UPDATE        | Line 196 relies on `.github/workflows/qwen-autofix.yml`, which does not exist                                                                                                        | S      |
| `…/bundled/review/DESIGN.md`                                       | 1,276 | no (excluded from the bundle)             | KEEP          | `SKILL.test.ts:46,154,180` requires DESIGN.md headings for every "(measured; DESIGN.md — …)" pointer in SKILL.md. It cannot be trimmed alone. It has about 45 upstream PR references | –      |
| `packages/cli/src/commands/extensions/examples/**` (10 files)      |   441 | yes (templates copied into user projects) | KEEP / UPDATE | `starter/README.md:58` links QwenLM's copy of getting-started-extensions; point it at the local doc. Both `diary.md` files hardcode `model: qwen3-coder-plus`                        | S      |
| `packages/cli/src/commands/review/__fixtures__/pr-6486-*.md`       |   114 | yes (test)                                | KEEP VERBATIM | Test data                                                                                                                                                                            | –      |
| `packages/cli/src/services/test-commands/example.md`               |     5 | no                                        | REMOVE        | Nothing references `test-commands` (a glob loader was not checked)                                                                                                                   | S      |
| `packages/cli/src/acp-integration/session/rewrite/README.md`       |    38 | no                                        | KEEP          | –                                                                                                                                                                                    | –      |
| `packages/core/src/core/openaiContentGenerator/provider/README.md` |    50 | no                                        | UPDATE        | Lists a nonexistent `constants.ts` and omits 10 providers                                                                                                                            | S      |

**Package READMEs.** Published-package docs worth keeping: SDK, Web Shell, VS Code, Zed and node-repl. They should say "not yet published" until Phase 5.

| Path                                                            |  Lines | Verdict       | Why                                                                                                                                             | Effort |
| --------------------------------------------------------------- | -----: | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `packages/acp-bridge/README.md`                                 |    138 | UPDATE        | "Channels" and "remote-control adapters" (removed); a lift-history table of upstream PRs                                                        | S      |
| `packages/sdk-typescript/README.md`                             |    645 | UPDATE        | `npm install @organizaone/o1-code-sdk` is unpublished; `gemini` and `vertex-ai` in the `authType` list; a `computer_use` mention                | S      |
| `packages/sdk-typescript/src/daemon-mcp/serve-bridge/README.md` |    205 | REWRITE       | 71 lines in Chinese (English-only rule)                                                                                                         | S      |
| `packages/web-shell/README.md`                                  |    698 | REWRITE       | About 319 lines in Chinese, headings too; npm install of an unpublished package                                                                 | M      |
| `packages/node-repl/README.md`                                  |    141 | UPDATE        | Lines 95-113 "Linux desktop sessions / CUA" are computer use, which was removed; `npx` of an unpublished package                                | S      |
| `packages/vscode-ide-companion/README.md`                       |     70 | UPDATE        | Marketplace and Open VSX badges; taobao video; `bug_report.yml` and `feature_request.yml` links are broken because there are no issue templates | S      |
| `packages/vscode-ide-companion/development.md`                  |     30 | UPDATE        | `npm install` should be `corepack pnpm install --frozen-lockfile`                                                                               | S      |
| `packages/zed-extension/README.md`                              |    126 | UPDATE        | "Search for O1-Code in Zed Extensions" assumes a listing that does not exist                                                                    | S      |
| `LICENSE` in node-repl, vscode, zed                             |    427 | KEEP VERBATIM | License texts                                                                                                                                   | –      |
| `packages/vscode-ide-companion/NOTICES.txt`                     | 27,737 | KEEP VERBATIM | Generated by `scripts/generate-notices.js`; shown by the `showNotices` command                                                                  | –      |

**integrations/ and integration-tests/:**

| Path                                                                          | Lines | Verdict       | Why                                                                                                                            | Effort |
| ----------------------------------------------------------------------------- | ----: | ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `integrations/external-context/**` (3 files)                                  |   599 | KEEP          | –                                                                                                                              | –      |
| `integrations/external-context-mem0/README.md`                                |   635 | UPDATE        | Line 15 "Install the published Extension", but nothing is published                                                            | S      |
| `integration-tests/concurrent-runner/README.md`                               |   152 | UPDATE        | Minor: `npm install` and a qwen sample model                                                                                   | S      |
| `integration-tests/concurrent-runner/requirements.txt`                        |     2 | KEEP          | –                                                                                                                              | –      |
| `integration-tests/fixtures/chat-transcript-contract/v1/capability-matrix.md` |    22 | KEEP VERBATIM | SHA-256 pinned by `chat-transcript-contract.test.ts:28`. Its "Tauri/Desktop" row is stale, but editing means updating the hash | –      |
| `integration-tests/terminal-capture/motivation.md`                            |   127 | KEEP          | –                                                                                                                              | –      |

## 7. .github, scripts, docs-site, .claude

| Path                                                                | Lines | Verdict                  | Why                                                                                                                                                              | Effort |
| ------------------------------------------------------------------- | ----: | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `.github/pull_request_template.md`                                  |    12 | KEEP                     | o1-code's own                                                                                                                                                    | –      |
| `.github/workflows/o1-ci.yml`                                       |     – | KEEP                     | The only workflow. No upstream issue templates remain                                                                                                            | –      |
| `.claude/skills/autorun/SKILL.md`                                   |    39 | KEEP                     | o1-code's own                                                                                                                                                    | –      |
| `scripts/sandbox-runtime/README.md`, `scripts/tui-parity/README.md` |   229 | KEEP                     | –                                                                                                                                                                | –      |
| `docs-site/README.md` (and all of `docs-site/`, 12 files)           |    56 | REMOVE (decision)        | "Qwen Code Docs Site", "MIT © Qwen Team" (the package is ISC); nothing builds or deploys the site. If a public docs site is wanted for Phase 5, REWRITE instead | S      |
| `scripts/generate-changelog.js` (code, not docs)                    |     – | REMOVE with CHANGELOG.md | Regenerates the upstream changelog from QwenLM releases                                                                                                          | S      |

If `docs-site/` goes, these references go with it:

- `CONTRIBUTING.md:226-267`
- `docs/developers/contributing.md` (removed anyway)
- `docs/developers/architecture.md:87`
- `eslint.config.js:75-76,643-645`
- `.gitignore:87,89`

The `_meta.ts` files can stay: they still give order, and `qc-helper` ignores them.

## 8. Broken-link risks of the proposed removals

| Removed                                              | Inbound references to fix                                                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHANGELOG.md`                                       | `.prettierignore:17`; `package.json:74` plus `scripts/generate-changelog.js`; `TASK-COMPLETION.md:172-173`; `CHANGELOG.o1.md:3-4`; `02-prd:131`. The generic regex in `review/lib/workspace-scope.ts:136` is unaffected |
| `docs/fork/01-upstream-survey.md`                    | `AGENTS.md:12`; `02-prd:5`, `:100`                                                                                                                                                                                      |
| `docs/fork/04-development-guidelines.md`             | `02-prd:59`                                                                                                                                                                                                             |
| `docs/fork/PATCHES.md`                               | **89 source-file headers** (`git grep -l 'see docs/fork/PATCHES.md'`); `AGENTS.md:26`. Built `dist/*.d.ts` copies regenerate                                                                                            |
| `docs/developers/contributing.md`                    | `developers/_meta.ts:8`. `path-rules.test.ts:203` uses the path as a string fixture only                                                                                                                                |
| `docs/developers/roadmap.md`                         | `developers/_meta.ts:7`. `path-rules.test.ts:204` uses the path as a string only                                                                                                                                        |
| `docs/developers/daemon-ui/MIGRATION.md`             | `daemon/00-index.md:137`; `daemon/14-cli-tui-adapter.md:14, 151, 170, 182, 194`                                                                                                                                         |
| `docs/developers/daemon-client-adapters/tui.md`      | `daemon/00-index.md:154` (line 12 links the directory)                                                                                                                                                                  |
| `docs/developers/daemon-client-adapters/ide.md`      | `daemon/16-vscode-ide-adapter.md:193, 205`; `daemon/14:181`                                                                                                                                                             |
| `docs/developers/development/deployment.md`          | `development/_meta.ts:5`                                                                                                                                                                                                |
| `docs/developers/development/npm.md`                 | `development/_meta.ts:2`                                                                                                                                                                                                |
| `docs/developers/tools/multi-file.md`                | `tools/_meta.ts:4`; `docs/users/configuration/o1-code-ignore.md:9`                                                                                                                                                      |
| `packages/cli/src/services/test-commands/example.md` | none                                                                                                                                                                                                                    |
| 5 orphan images                                      | none                                                                                                                                                                                                                    |
| `docs-site/`                                         | Listed in §7                                                                                                                                                                                                            |

These already break today and are not caused by removals:

- `../design/*.md` links from `developers/contributing.md`, `daemon/00, 01, 05, 06, 07, 17` and `development/telemetry.md`.
- The "doc 15" reference in `daemon/00-index.md:27`.
- The vscode README's `.github/ISSUE_TEMPLATE` links.

Renames need care in two places:

- **`docs/users/`**: the `qc-helper/SKILL.md` table and the runtime link in `session-writer-lease.ts:1671` (to `conversations-recovery.md`).
- **The contract-tested developer docs**: listed in the preamble.

## 9. Proposed order of work

1. **Security and privacy claims (S).** Point `SECURITY.md` at GitHub private reporting. Fix the "Alibaba Cloud RUM" section of `settings.md` so it matches `tos-privacy.md`.
2. **Removals with no dependents (S).**
   - `CHANGELOG.md`, `generate-changelog.js` and the `changelog` script; optionally rename `CHANGELOG.o1.md`.
   - The 5 orphan images and `test-commands/example.md`.
   - `developers/{roadmap,contributing}.md`, `daemon-ui/MIGRATION.md`, `daemon-client-adapters/{tui,ide}.md`, `development/{deployment,npm}.md` and `tools/multi-file.md`.
   - Fix the references in §8 in the same commit.
3. **The docs/fork cleanup (S–M).**
   - Remove `01-upstream-survey` and `04-development-guidelines`.
   - Decide on PATCHES.md. If it goes, run a scripted header rewrite across the 89 files.
   - Condense the PRD and refresh HANDOFF and AGENTS.md.
   - Fix the stale deviation sections in `COMMITS.md` and `TASK-COMPLETION.md`, then run `check-guides.mjs`.
4. **Identity surfaces (M).** Rewrite README, CONTRIBUTING (short, pointing to AGENTS.md) and `docs/index.md`. Decide the fate of `docs-site/`.
5. **Widen brand-lint.** Add `docs/**/*.md`, `README.md`, `CONTRIBUTING.md` and `packages/*/README.md` to `brand.json` → `lint.paths`, then fix whatever it reports. This turns the rest into a checked gate.
6. **The docs/users install story (M).** One pass that replaces every `npm install -g` with the from-source path, or with "not yet published". Rewrite overview, quickstart and Uninstall. Reorder auth and troubleshooting to lead with the provider by URL. Frame `integration-github-action` as the upstream Action.
7. **docs/users feature pages (S each).** Apply the small UPDATEs in §3 and replace or drop the alicdn screenshots.
8. **docs/developers (M–L).**
   - Strip QwenLM links, `../design/` links and channel-webhook text from the daemon series.
   - Rewrite `daemon-ui/README` and merge `daemon-client-adapters/web-shell.md` into it.
   - Update the `tools/` coverage.
   - Keep the contract-tested headings stable and re-run `rest-integration-docs-contract.test.ts` and `capabilities-docs-contract.test.ts`.
9. **Package READMEs (M).** Translate the web-shell README and the serve-bridge README to English. Mark the SDK, node-repl, VS Code, Zed and mem0 READMEs "not yet published". Drop the removed-feature text in node-repl and acp-bridge.
10. **Last and optional.** `o1-code-serve.md` (1,199 lines) and `o1-code-serve-protocol.md` (3,747 lines) need a full voice rewrite (L). They are correct in substance, so this can wait until after the npm publication.
