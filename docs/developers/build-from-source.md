# Build from source

Most people install o1-code from npm: `npm install -g @organizaone/o1-code@latest`. Build from source
when you want to run an unreleased change, work on the code, or package it yourself.

## Requirements

- Node.js 22 or later ([nodejs.org](https://nodejs.org/en/download)).
- Corepack, which selects the pnpm version the repository pins. Node 26 no longer ships it:
  `npm i -g corepack`.
- Git. On Windows, run `git config core.longpaths true` before cloning, or the checkout fails on
  long paths.

No compiler, Rust or Go toolchain and no administrator rights are needed. Native modules are
prebuilt or optional.

## Build

```bash
git clone https://github.com/organizaone/o1-code.git
cd o1-code
git config core.longpaths true         # Windows only
corepack pnpm install --frozen-lockfile
npm run build -- --cli-only            # builds the CLI and its workspace dependencies
npm run bundle                         # writes dist/cli.js
```

Install normally, without `--ignore-scripts`: `prepare` generates sources the build needs, and
`postinstall` applies `patches/ink+7.0.3.patch`, without which `packages/cli` does not compile.

## Run

Run the bundle directly, or link it onto your `PATH`:

```bash
node dist/cli.js                       # from the repository root
npm link                               # puts `o1-code` on your PATH
```

Restart your terminal if `o1-code` is not found right after `npm link`. To remove the link later,
run `npm unlink -g` from the repository root.

## Check

```bash
npm run lint && npm run typecheck
node scripts/o1/smoke.mjs              # the bundle starts and responds
```

Product tests run per package, never from the root:

```bash
cd packages/core && npx vitest run src/path/file.test.ts
cd packages/cli  && npx vitest run src/path/file.test.tsx
```

The full list of commands, the code conventions and the review rules are in
[`AGENTS.md`](../../AGENTS.md); the toolchain details and the Windows rules are in
[`docs/guides/STACK-O1-CODE.md`](../guides/STACK-O1-CODE.md). To contribute a change, read
[`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Package

To produce the same tarball the release workflow publishes:

```bash
npm run prepare:package                # writes dist/package.json, README, LICENSE, NOTICE
cd dist && npm pack
```

The release workflow (`.github/workflows/release.yml`) builds a `vX.Y.Z` tag this way, installs
the tarball in a clean prefix, runs it, and only then publishes.
