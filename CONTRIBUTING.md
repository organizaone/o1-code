# Contributing to o1-code

Contributions are welcome. This file is the short version; the rules live in
[`AGENTS.md`](./AGENTS.md) and the guides in [`docs/guides/`](./docs/guides/), and they apply to
people and coding agents alike.

## Before you start

- Read [`AGENTS.md`](./AGENTS.md): project rules, commands, language, code conventions and the
  review checklist.
- For a large feature, open an issue first, with the card in "Proposing a feature" below.
- English is the repository's language: code, comments, tests, commit messages and docs.

## Set up

```bash
git clone https://github.com/silvioricardo87/o1-code.git && cd o1-code
git config core.longpaths true
corepack pnpm install --frozen-lockfile
npm run build -- --cli-only
npm run bundle
```

Node 22 or later. On Node 26, install Corepack with `npm i -g corepack`. The longer walkthrough is
[Build from source](./docs/developers/build-from-source.md); toolchain details and the Windows
rules are in [`docs/guides/STACK-O1-CODE.md`](./docs/guides/STACK-O1-CODE.md).

## Make a change

1. Branch from `main`. Keep one logical change per commit.
2. Write the test first when behavior changes. Product tests run per package, never from the root:
   `cd packages/core && npx vitest run src/path/file.test.ts`.
3. Before you open the pull request, run:

   ```bash
   npm run lint && npm run typecheck
   node scripts/o1/brand-lint.mjs
   node scripts/o1/smoke.mjs
   ```

4. Update the docs in `docs/users/` when a user would notice the change, and add an entry under
   `[Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md).
5. Commit messages follow [`docs/guides/COMMITS.md`](./docs/guides/COMMITS.md):
   `<Verb> <Area>: <description>`, in English, with no co-author lines.

The full cycle is in [`docs/guides/TASK-COMPLETION.md`](./docs/guides/TASK-COMPLETION.md).

## Pull requests

`main` is protected. Every change comes in through a pull request that fills in
[the template](./.github/pull_request_template.md): what changes for the user and how it was
verified. The CI fast gates must pass before merge, history stays linear, and review conversations
must be resolved. A TUI change carries a screenshot of the real app.

## Proposing a feature

Extension mechanisms come first: skills, hooks, MCP, rules, output styles, themes and
`modelProviders` are the cheapest path for a lot of things, and the core changes when they do not
suffice. A large feature, or one inspired by another open-source project, is weighed on a one-page
card, as a GitHub issue labelled `candidate`:

```markdown
# <short name>

Origin: <own idea | project name and link>
Problem it solves: <one sentence, from the user's point of view>
Evidence of value: <why we believe it is worth it; real usage, request, observed pain>

Delivery mechanism: mcp | skill | hook | command | agent | rule | output-style | theme |
modelProviders | workflow | extension | core
Files touched: <list, or "new files only">

Impact (1-5):
Effort (1-5):
Cost to port (1-5, external origin only):
Recurring maintenance cost: low | medium | high

Decision: accepted | rejected | deferred — <date, reason in one line>
Acceptance criterion (if accepted): <verifiable>
```

Scales. **Impact**, for the user: 1 cosmetic · 2 convenience · 3 improves a daily flow · 4 unlocks
a use case · 5 defines the value proposition. **Effort**, for one maintainer: 1 under two hours ·
2 half a day · 3 one to two days · 4 a week · 5 more. **Cost to port**, how much the source differs
from ours: 1 applies almost as is · 2 name and path adjustments · 3 the surrounding code differs ·
4 depends on something we do not have · 5 a rewrite from the idea. **Maintenance cost**: the
attention the feature demands after it lands (configuration, external service, test surface).

Decision rules:

1. **Direct acceptance:** Impact ≥ 3, Effort ≤ 3 and Cost to port ≤ 3.
2. **Needs a written justification:** Cost to port 4, or high maintenance cost.
3. **Cost to port 5** becomes an original idea; the card records the origin as inspiration.
4. **Automatic rejection:** an incompatible license (Apache-2.0-compatible only: MIT, BSD, Apache;
   never GPL); requires Rust, Go or administrator rights; introduces third-party telemetry; depends
   on something out of scope (`ROADMAP.md`); or sits outside a vendor's terms of use.
5. **Tie:** the lower Effort, then the lower maintenance cost.

Code from another open-source project is reimplemented, never copied as a whole tree; copied code
carries its attribution in `NOTICE`. Proprietary products are a UX reference only, never code.
Deferred cards are revisited every two months; after two reviews with no change, they are closed.
An accepted card becomes a roadmap item and follows
[`docs/guides/AGENT-WORKFLOW.md`](./docs/guides/AGENT-WORKFLOW.md) and
[`docs/guides/TASK-COMPLETION.md`](./docs/guides/TASK-COMPLETION.md); the issue closes when the
feature ships and the changelog records it.

## Adding a provider preset

A built-in preset is an endorsement: users send API keys and full prompts through it. A preset
needs all of the following:

- **Affiliation disclosure.** The author states any relationship with the provider.
- **Operational maturity.** Publicly operational, with a status page or SLA preferred.
- **Real demand.** Evidence that users want it, not a self-listing.
- **Data transparency.** The provider documents how it handles data.
- **Maintenance.** Someone commits to keeping the preset working.

Anything else connects through **Custom** in `/auth` or `/model`, with no code change.

An approved preset follows the `anthropic.ts` and `deepseek.ts` pattern in
`packages/core/src/providers/presets/`: a fixed base URL or a short list of options, an env key, a
`uiGroup`, and `customHeaders` only when the provider asks for attribution, with the env key added
to `SECRET_ENV_VARS` in `packages/cli/src/serve/envSnapshot.ts`, a test in
`packages/core/src/providers/__tests__/presets/`, and a row in
`docs/users/configuration/model-providers.md`. The key the user enters is saved in the credential
store under the preset's id.

## Licensing

o1-code is Apache-2.0. Every change keeps this true:

- `LICENSE` is the unchanged Apache-2.0 text; `NOTICE` carries the project's own line, the
  modification notice of §4(b) and the third-party notices the license requires.
- Third-party copyright headers in files stay as they are (§4(c)); new files carry
  `Copyright 2026 o1-code contributors`. Removing or rewriting a third-party header is a Critical
  in the review rules of `AGENTS.md`.
- No third-party name, logo or domain is used as product, package, binary, configuration folder
  or documentation identity; a provider's name appears only to name that provider and its models.
  `node scripts/o1/brand-lint.mjs` is the gate.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](./SECURITY.md).
