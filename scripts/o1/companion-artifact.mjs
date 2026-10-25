// Copyright 2026 o1-code contributors
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publishRelease } from './github-release.mjs';
import { extractReleaseNotes } from './release-notes.mjs';

export const COMPANION_TARGETS = [
  'win32-x64',
  'win32-arm64',
  'darwin-x64',
  'darwin-arm64',
  'linux-x64',
];
export function companionAssetName(version, target) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Invalid companion release version');
  if (!COMPANION_TARGETS.includes(target))
    throw new Error(`Unsupported companion target: ${target}`);
  return `o1-code-vscode-ide-companion-${version}-${target}.vsix`;
}
export function writeCompanionChecksum(file) {
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  const checksum = file + '.sha256';
  writeFileSync(checksum, `${digest}  ${basename(file)}\n`);
  return checksum;
}
export function verifyReusableCompanionBuild(root) {
  const version = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  ).version;
  const built = JSON.parse(
    readFileSync(join(root, 'dist', 'package.json'), 'utf8'),
  ).version;
  if (version !== built)
    throw new Error(
      'Reusable companion CLI build version does not match the source version',
    );
  for (const file of [
    'cli.js',
    'execution-worker.js',
    'web-shell/index.html',
    'vendor',
  ]) {
    if (!existsSync(join(root, 'dist', file)))
      throw new Error(`Missing reusable companion build artifact: ${file}`);
  }
}

export function prepareCompanionAssets(file, existingAssets) {
  const name = basename(file);
  const bytes = readFileSync(file);
  const existing = existingAssets.find((asset) => asset.name === name);
  const digest = existing
    ? /^sha256:([a-f0-9]{64})$/i.exec(existing.digest ?? '')?.[1]
    : createHash('sha256').update(bytes).digest('hex');
  if (!digest)
    throw new Error('Existing companion asset has no usable SHA-256 digest');
  const checksum = Buffer.from(`${digest.toLowerCase()}  ${name}\n`);
  const existingChecksum = existingAssets.find(
    (asset) => asset.name === `${name}.sha256`,
  );
  if (
    existingChecksum &&
    existingChecksum.digest !==
      `sha256:${createHash('sha256').update(checksum).digest('hex')}`
  ) {
    throw new Error(
      'Existing companion checksum conflicts with its VSIX; do not overwrite release assets',
    );
  }
  return [
    { name, data: bytes, contentType: 'application/octet-stream' },
    { name: `${name}.sha256`, data: checksum, contentType: 'text/plain' },
  ];
}

async function main() {
  const [tag, file] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag) || !file || !repo || !token)
    throw new Error(
      'A release tag, companion file, GITHUB_REPOSITORY and GH_TOKEN are required',
    );
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(`Release lookup failed: HTTP ${response.status}`);
  const release = response.ok ? await response.json() : { assets: [] };
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { identity } = JSON.parse(
    readFileSync(join(root, 'brand.json'), 'utf8'),
  );
  const result = await publishRelease({
    repo,
    tag,
    title: `${identity.productName} ${tag.slice(1)}`,
    notes: extractReleaseNotes(
      readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
      tag.slice(1),
    ),
    assets: prepareCompanionAssets(file, release.assets),
    token,
  });
  console.log(JSON.stringify(result));
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
