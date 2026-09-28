# Release workflow report

Branch `release-workflow`, working tree only: nothing committed, staged or stashed.

## Files

- `scripts/prepare-package.js` (modified). New option `packageAudioCapture`, default
  `process.env.O1CODE_PACKAGE_AUDIO_CAPTURE === '1'`. `@organizaone/o1-code-audio-capture` is in the
  published `optionalDependencies`, and `verifyNativeAudioCapturePackage` checks its artifacts, only
  when that switch or the existing `requireNativeAudioCapture` (`O1CODE_REQUIRE_AUDIO_CAPTURE_PREBUILD=1`)
  is on. Stale `dist/node_modules/@organizaone/o1-code-audio-capture` is still removed in every
  case. `dist/package.json` now carries `homepage` (`<repoUrl>#readme`), `bugs`
  (`<repoUrl>/issues`) and `publishConfig: { access: 'public' }`; `repository` was already derived
  from `brand.json`. Without `brand.json`, `homepage` and `bugs` fall back to the root manifest.
- `scripts/tests/package-assets.test.js` (modified). Four new tests: audio-capture absent by
  default (env stubbed empty), artifacts not checked when not packaging, present with
  `O1CODE_PACKAGE_AUDIO_CAPTURE=1`, and `publishConfig`/`repository`/`homepage`/`bugs` from
  `brand.json`. The existing "includes extension examples" test no longer asserts the audio-capture
  entry (the behavior the brief changes). The Qwen header is untouched.
- `scripts/o1/release-notes.mjs` (new). Exports `extractReleaseNotes(changelog, version)`; the
  command `node scripts/o1/release-notes.mjs <version> [--changelog <path>]` prints the section body
  and exits 1 with `No "## [x.y.z]" section ...` or `... section of CHANGELOG.md is empty`.
- `scripts/o1/release-notes.test.mjs` (new). 10 tests, temp changelogs.
- `.github/workflows/release.yml` (new).
- `docs/guides/VERSIONING.md`: three bullets in "Deviations in this project" (release, credentials,
  switches).
- `ROADMAP.md` "npm publication": workflow and audio-capture switch marked done; open items listed.
- `CHANGELOG.md` and `README.md`: untouched, as the brief says.

## Workflow

Triggers: `push` of tags `v*.*.*`; `workflow_dispatch` with a required `tag` input. One job
`release`, `ubuntu-latest`, 60 min, `contents: write`, `id-token: write`. Workflow env
`PUBLISH_PROVENANCE: 'false'` (comment: turn on when public) and `PACKAGE_NAME`. Steps: validate the
tag format; checkout `refs/tags/<tag>` depth 1 (a non-existent dispatched tag fails here); setup-node
from `.nvmrc` with the npm registry; install; check the version; build + bundle + `prepare:package`;
fast checks (typecheck, lint, brand-lint, smoke, provider-smoke, fork script tests, `test:scripts`);
pack and try (pack to `$RUNNER_TEMP/pack`, `npm install -g` from a temp directory with
`npm_config_prefix` in `$RUNNER_TEMP/prefix`, `--version` must equal the version, `--help` must
succeed); publish with `NODE_AUTH_TOKEN: secrets.NPM_TOKEN`; verify (10 polls, 15 s apart); `gh release
create <tag> <tarball> --verify-tag --title "o1-code <version>" --notes-file ...` with `GH_TOKEN:
github.token`. Actions pinned to the same checkout (v6.0.3) and setup-node (v6.4.0) SHAs as
`o1-ci.yml`. YAML parsed with `js-yaml` and passes `prettier --check`. No token is anywhere in the
repository; `.env` was not read.

## Deviations from the brief

1. **"npm view must fail".** For an unpublished version of an already-published package, `npm view
pkg@ver version` prints nothing and exits 0; it only fails (E404) while the package does not
   exist. The check therefore fails the release when the output is non-empty, which covers both
   cases.
2. **Release notes are extracted in the version-check step**, before the build, into
   `$RUNNER_TEMP/release-notes.md`, so a missing changelog section stops the run before anything is
   published instead of after.
3. **Concurrency group.** On a manual run `github.ref` is the branch, not the tag, so the group is
   `release-${{ inputs.tag && format('refs/tags/{0}', inputs.tag) || github.ref }}`: a push and a
   dispatch of the same tag share one group. `cancel-in-progress: false`.
4. **`id-token: write` is granted** now (the brief lists it), unused while provenance is off.
5. **`requireNativeAudioCapture` implies packaging.** `O1CODE_REQUIRE_AUDIO_CAPTURE_PREBUILD=1`
   keeps its meaning (missing artifacts are an error) and also lists the dependency; the existing
   "required" tests keep passing unchanged. The option names and the exported `preparePackage`
   are unchanged; `packageAudioCapture` is an added option.
6. **`release-notes.mjs` accepts a leading `v`** and a `--changelog <path>` option (used by the
   tests); the default is the repository's `CHANGELOG.md`.
7. **`--provenance="$PUBLISH_PROVENANCE"`** rather than a literal `--provenance=false`, so the
   switch is the one env value.
8. **Tool use.** File changes were made with the Edit/Write tools as the brief and `AGENTS.md`
   require on Windows; the shell was used for reading, searching and running commands only.
9. The brief says `ROADMAP.md`; the file is at the repository root (not `docs/fork/`).

## Tests (TDD)

- `package-assets.test.js`: 3 new tests red before the change (default absent, not checked,
  `publishConfig`), then 48 passed / 1 skipped.
- `release-notes.test.mjs`: red (module missing), then 10/10.

## Gates (run one at a time, repo root)

- `node --test scripts/o1/*.test.mjs`: 25 pass, 0 fail.
- `npm run test:scripts`: 47 files passed, 1 skipped; 676 tests passed, 15 skipped.
- `npm run prepare:package`: prints "Skipping native audio capture package (set
  O1CODE_PACKAGE_AUDIO_CAPTURE=1 to include it)"; `dist/package.json` has no audio-capture entry,
  has `publishConfig: {access: public}`, `homepage`, `bugs` and `repository` at
  `https://github.com/silvioricardo87/o1-code`.
- `npm run lint`: clean; `npx eslint` on the four changed scripts: clean.
- `npm run typecheck`: not run (no TypeScript changed).
- `node scripts/o1/brand-lint.mjs`: 5835 files, 0 forbidden lines.
- `node scripts/o1/check-guides.mjs`: 5 guides, 0 problems.
- `npx prettier --check` on `release.yml`, `VERSIONING.md`, `ROADMAP.md` and the changed scripts: clean.
- Not run: build and bundle (no source change reaches the bundle; the existing `dist/` bundle of
  today was used), full product suites.

## Local rehearsal (step 5)

`cd dist && npm pack --pack-destination <scratchpad>/rehearsal/pack`, then from an empty directory
`npm_config_prefix=<scratchpad>/rehearsal/prefix npm install -g <tarball>`:

```
tarball: organizaone-o1-code-0.1.0.tgz
npm notice package size: 28.1 MB
npm notice unpacked size: 98.5 MB
npm notice total files: 1066
o1-code --version -> 0.1.0
o1-code --help    -> Usage: o1-code [options] [command] ... (exit 0)
```

The install produced no warning about the audio-capture package. On Windows the shims land in the
prefix root (`o1-code.cmd`); on the Linux runner the workflow uses `<prefix>/bin/o1-code`.

## Open points

- The maintainer adds the repository secret `NPM_TOKEN` (from the local `NPM_API_TOKEN`) before the
  first tag; then trusted publishing on npmjs.com and deletion of the token.
- Provenance: set `PUBLISH_PROVENANCE: 'true'` when the repository is public.
- Audio-capture prebuild pipeline; then set `O1CODE_PACKAGE_AUDIO_CAPTURE=1` in the workflow's
  build step.
- The workflow has not run on GitHub; no `actionlint` is installed locally, so only YAML parsing
  and Prettier validated it.
- `README.md` "Install" still says nothing is published; change it after the first publication.
- The `dist/` optional dependencies have no `@lydell/node-pty-linux-arm64` pin because the core
  manifest does not declare one (pre-existing, not touched).
