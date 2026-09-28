/**
 * @license
 * Copyright 2025 Qwen
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prepares the bundled CLI package for npm publishing
 * This script adds publishing metadata (package.json, README, LICENSE) to dist/
 * All runtime assets (cli.js, vendor/, *.sb) are already in dist/ from the bundle step
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRootDir = path.resolve(__dirname, '..');
const TEST_FILE_RE = /\.(test|spec)\.(d\.)?[mc]?[jt]s(\.map)?$/;
// The docker-sandbox E2E leg builds its image by running this script, so an
// over-budget package turns main's E2E run red as well as blocking publishing.
const DEFAULT_MAX_NPM_PACKAGE_UNPACKED_BYTES = 128 * 1024 * 1024;
const PACKAGE_TEXT_FILE_RE =
  /\.(?:[cm]?[jt]sx?|json|md|html|css|txt|ya?ml|sh|svg|map)$/i;
const PACKAGE_SCAN_FORBIDDEN_LITERALS = [
  ['chrome', 'devtools', 'mcp'].join('-'),
  ['puppeteer', 'core'].join('-'),
  ['oastify', 'com'].join('.'),
  ['webhook', 'site'].join('.'),
  ['ngrok', 'io'].join('.'),
  ['ngrok-free', 'app'].join('.'),
];

export function preparePackage({
  rootDir = defaultRootDir,
  requireNativeAudioCapture = process.env
    .O1CODE_REQUIRE_AUDIO_CAPTURE_PREBUILD === '1',
  // o1-code: the native audio-capture package has no prebuild pipeline and is
  // not published, and an unpublished optional dependency makes `npm install`
  // of the CLI fail or warn. It is packaged only on request; voice falls back
  // to SoX/arecord without it. Requiring the prebuild implies packaging it.
  packageAudioCapture = process.env.O1CODE_PACKAGE_AUDIO_CAPTURE === '1',
  maxPackageUnpackedBytes = DEFAULT_MAX_NPM_PACKAGE_UNPACKED_BYTES,
} = {}) {
  const distDir = path.join(rootDir, 'dist');
  const includeAudioCapture = packageAudioCapture || requireNativeAudioCapture;

  verifyBundleArtifacts(rootDir, distDir);
  copyDocumentationFiles(rootDir, distDir);
  copyLocales(rootDir, distDir);
  copyExtensionExamples(rootDir, distDir);
  verifyNativeAudioCapturePackage(rootDir, distDir, {
    enabled: includeAudioCapture,
    required: requireNativeAudioCapture,
  });
  writeDistPackageJson(rootDir, distDir, {
    includeAudioCapture,
  });
  assertNoSensitivePackageScanLiterals(distDir);
  assertPreparedPackageSize(distDir, maxPackageUnpackedBytes);
  printPackageStructure(distDir);
}

if (isDirectRun()) {
  preparePackage();
}

function isDirectRun() {
  return process.argv[1]
    ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
    : false;
}

function verifyBundleArtifacts(rootDir, distDir) {
  const requiredPaths = [
    path.join(distDir, 'cli.js'),
    path.join(distDir, 'execution-worker.js'),
    path.join(distDir, 'vendor'),
    path.join(distDir, 'bundled', 'qc-helper', 'docs'),
    // The Web Shell ships with the published package ("Web Shell out of the
    // box"). Gate on it here so a build that skipped the web-shell workspace
    // (e.g. `npm ci --ignore-scripts` bypassing the root `prepare`) fails
    // loudly during packaging instead of silently publishing an API-only CLI
    // whose `GET /` 404s. copy_bundle_assets.js stays warn-and-skip for
    // --cli-only dev bundles; this is the release gate.
    path.join(distDir, 'web-shell', 'index.html'),
    path.join(distDir, 'web-shell', 'assets'),
    path.join(distDir, 'web-shell', 'manifest.webmanifest'),
    path.join(distDir, 'web-shell', 'sw.js'),
    path.join(distDir, 'export-transcript-document.js'),
    path.join(distDir, 'export-transcript-document.css'),
  ];

  if (!fs.existsSync(distDir)) {
    console.error('Error: dist/ directory not found');
    console.error('Please run "npm run bundle" first');
    process.exit(1);
  }

  for (const requiredPath of requiredPaths) {
    if (!fs.existsSync(requiredPath)) {
      console.error(
        `Error: Required package artifact not found: ${requiredPath}`,
      );
      console.error('Please run "npm run bundle" first');
      process.exit(1);
    }
  }
}

function copyDocumentationFiles(rootDir, distDir) {
  console.log('Copying documentation files...');
  // The package README is the one npm shows: shorter than the repository's,
  // with absolute links and no images, since npm serves neither relative
  // paths nor a private repository's files.
  const packageReadme = path.join(rootDir, 'packages', 'cli', 'README.md');
  const readmeSource = fs.existsSync(packageReadme)
    ? packageReadme
    : path.join(rootDir, 'README.md');
  const filesToCopy = [
    ['README.md', readmeSource],
    ['LICENSE', path.join(rootDir, 'LICENSE')],
    ['NOTICE', path.join(rootDir, 'NOTICE')],
  ];
  for (const [file, sourcePath] of filesToCopy) {
    const destPath = path.join(distDir, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${file} from ${path.relative(rootDir, sourcePath)}`);
    } else {
      console.warn(`Warning: ${file} not found at ${sourcePath}`);
    }
  }
}

function copyLocales(rootDir, distDir) {
  console.log('Copying locales folder...');
  const localesSourceDir = path.join(
    rootDir,
    'packages',
    'cli',
    'src',
    'i18n',
    'locales',
  );
  const localesDestDir = path.join(distDir, 'locales');

  if (fs.existsSync(localesSourceDir)) {
    copyRecursiveSync(localesSourceDir, localesDestDir);
    console.log('Copied locales folder');
  } else {
    console.warn(`Warning: locales folder not found at ${localesSourceDir}`);
  }
}

function copyExtensionExamples(rootDir, distDir) {
  console.log('Copying extension examples folder...');
  const extensionExamplesDir = path.join(
    rootDir,
    'packages',
    'cli',
    'src',
    'commands',
    'extensions',
    'examples',
  );
  const extensionExamplesDestDir = path.join(distDir, 'examples');

  if (fs.existsSync(extensionExamplesDir)) {
    copyRecursiveSync(extensionExamplesDir, extensionExamplesDestDir);
    console.log('Copied extension examples folder');
  } else {
    console.warn(
      `Warning: extension examples folder not found at ${extensionExamplesDir}`,
    );
  }
}

function verifyNativeAudioCapturePackage(
  rootDir,
  distDir,
  { enabled = true, required } = {},
) {
  const addonSrc = path.join(rootDir, 'packages', 'audio-capture');
  const addonDest = path.join(
    distDir,
    'node_modules',
    '@organizaone',
    'o1-code-audio-capture',
  );
  const requiredPaths = [
    path.join(addonSrc, 'dist'),
    path.join(addonSrc, 'prebuilds'),
    path.join(addonSrc, 'package.json'),
  ];

  fs.rmSync(addonDest, { recursive: true, force: true });

  if (!enabled) {
    console.log(
      'Skipping native audio capture package (set O1CODE_PACKAGE_AUDIO_CAPTURE=1 to include it)',
    );
    return;
  }
  console.log('Verifying native audio capture package...');

  for (const requiredPath of requiredPaths) {
    if (!fs.existsSync(requiredPath)) {
      const message = `audio capture package artifact not found at ${requiredPath}`;
      if (required) {
        throw new Error(
          `Required ${message}. ` +
            'Cannot publish package without native voice capture.',
        );
      }
      console.warn(`Warning: ${message}`);
      return;
    }
  }
  for (const [artifactPath, description, predicate] of [
    [
      path.join(addonSrc, 'dist'),
      'runtime JS',
      (filePath) => /\.[cm]?js$/.test(filePath) && !TEST_FILE_RE.test(filePath),
    ],
    [
      path.join(addonSrc, 'prebuilds'),
      'native prebuild',
      (filePath) => filePath.endsWith('.node'),
    ],
  ]) {
    if (!hasFileMatching(artifactPath, predicate)) {
      const message = `audio capture package artifact has no ${description}: ${artifactPath}`;
      if (required) {
        throw new Error(
          `Required ${message}. ` +
            'Cannot publish package without native voice capture.',
        );
      }
      console.warn(`Warning: ${message}`);
      return;
    }
  }

  let addonPkg;
  try {
    addonPkg = JSON.parse(
      fs.readFileSync(path.join(addonSrc, 'package.json'), 'utf8'),
    );
  } catch {
    const message = `audio capture package.json is not valid JSON at ${path.join(
      addonSrc,
      'package.json',
    )}`;
    if (required) {
      throw new Error(
        `Required ${message}. ` +
          'Cannot publish package without native voice capture.',
      );
    }
    console.warn(`Warning: ${message}`);
    return;
  }
  const addonRequire = createRequire(path.join(addonSrc, 'package.json'));
  for (const dependencyName of Object.keys(addonPkg.dependencies ?? {})) {
    try {
      addonRequire.resolve(`${dependencyName}/package.json`);
    } catch {
      const message = `audio capture dependency not resolvable: ${dependencyName}`;
      if (required) {
        throw new Error(
          `Required ${message}. ` +
            'Cannot publish package without native voice capture.',
        );
      }
      console.warn(`Warning: ${message}`);
      return;
    }
  }

  console.log('Verified native audio capture package');
}

function hasFileMatching(dir, predicate) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      if (hasFileMatching(entryPath, predicate)) return true;
    } else if (stat.isFile() && predicate(entryPath)) {
      return true;
    }
  }
  return false;
}

function writeDistPackageJson(rootDir, distDir, { includeAudioCapture } = {}) {
  console.log('Creating package.json for distribution...');

  const cliEntryPath = path.join(distDir, 'cli-entry.js');
  fs.copyFileSync(path.join(__dirname, 'cli-entry.js'), cliEntryPath);
  fs.chmodSync(cliEntryPath, 0o755);
  console.log('Created dist cli-entry.js wrapper');

  const rootPackageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'),
  );
  const coreManifest = JSON.parse(
    fs.readFileSync(
      path.join(rootDir, 'packages', 'core', 'package.json'),
      'utf-8',
    ),
  );
  // Resolve sharp the way core does at runtime — the nearest
  // node_modules/sharp above packages/core — so the published manifest pins
  // the version this release was built against, whichever package manager
  // installed the tree.
  let sharpVersion;
  for (
    let dir = path.join(rootDir, 'packages', 'core');
    ;
    dir = path.dirname(dir)
  ) {
    const manifest = path.join(dir, 'node_modules', 'sharp', 'package.json');
    if (fs.existsSync(manifest)) {
      sharpVersion = JSON.parse(fs.readFileSync(manifest, 'utf-8')).version;
      break;
    }
    if (dir === rootDir || path.dirname(dir) === dir) break;
  }
  const declared = coreManifest.dependencies?.sharp;
  if (!sharpVersion || !declared || !semver.satisfies(sharpVersion, declared)) {
    throw new Error(
      `sharp is not installed at a version packages/core accepts ` +
        `(installed ${sharpVersion ?? 'none'}, ` +
        `packages/core declares ${declared ?? 'none'})`,
    );
  }
  // The six `@lydell/node-pty*` platform pins ship in the tarball's
  // optionalDependencies and decide which bundled ConPTY `conpty.dll` /
  // `OpenConsole.exe` real Windows users get. Derive them from
  // packages/core/package.json — the single source conpty-host.ts verifies its
  // release path against (and its pin tripwire asserts) — instead of a third
  // hardcoded table, so a bump of the native backend in one manifest cannot
  // silently ship an unverified pin here. Mirrors the sharp / audio-capture
  // derivations above.
  const nodePtyPins = Object.fromEntries(
    Object.entries(coreManifest.optionalDependencies ?? {}).filter(([name]) =>
      name.startsWith('@lydell/node-pty'),
    ),
  );

  // o1-code: the repository and the bin name come from brand.json; the
  // version is the root package.json's, which every workspace shares.
  // Optional so that a root without the fork's identity (the package-asset
  // tests build one in a temp dir) falls back to the root manifest's values.
  const brandPath = path.join(rootDir, 'brand.json');
  const brand = fs.existsSync(brandPath)
    ? JSON.parse(fs.readFileSync(brandPath, 'utf-8'))
    : {};
  // The tarball is the CLI package, so it takes the CLI's name; the monorepo
  // root has a name of its own.
  const cliManifestPath = path.join(rootDir, 'packages', 'cli', 'package.json');
  const cliPackageName = fs.existsSync(cliManifestPath)
    ? JSON.parse(fs.readFileSync(cliManifestPath, 'utf-8')).name
    : (brand.identity?.npmName ?? rootPackageJson.name);
  const repoUrl = brand.identity?.repoUrl;
  const distPackageJson = {
    name: cliPackageName,
    version: rootPackageJson.version,
    description:
      rootPackageJson.description || 'O1-Code - AI-powered coding assistant',
    repository: repoUrl
      ? { type: 'git', url: `git+${repoUrl}.git` }
      : rootPackageJson.repository,
    homepage: repoUrl ? `${repoUrl}#readme` : rootPackageJson.homepage,
    bugs: repoUrl ? { url: `${repoUrl}/issues` } : rootPackageJson.bugs,
    // A scoped package is private by default on npm.
    publishConfig: { access: 'public' },
    type: 'module',
    main: 'cli.js',
    bin: {
      // The command the package installs, read from brand.json.
      [brand.identity?.binName ?? 'o1-code']: 'cli-entry.js',
    },
    files: [
      'cli-entry.js',
      'cli.js',
      'execution-worker.js',
      // Worker thread entry loaded by FzfWorkerHandle at runtime via
      // `resolveBundleDir(import.meta.url)` + `path.join(dir, 'fzfWorker.js')`.
      // Must ship in the tarball or the @-picker silently falls back to the
      // in-thread AsyncFzf path on big workspaces in npm-installed CLIs.
      'fzfWorker.js',
      'codeModeHost.js',
      'sandboxBwrapRelay.js',
      'sandboxFileWorker.js',
      'chunks',
      'vendor',
      '*.sb',
      'README.md',
      'LICENSE',
      'NOTICE',
      'locales',
      'examples',
      'bundled',
      'web-shell',
      'export-transcript-document.js',
      'export-transcript-document.css',
    ],
    config: rootPackageJson.config,
    dependencies: {},
    optionalDependencies: {
      ...(includeAudioCapture
        ? { '@organizaone/o1-code-audio-capture': rootPackageJson.version }
        : {}),
      ...nodePtyPins,
      '@teddyzhu/clipboard': '0.0.5',
      '@teddyzhu/clipboard-darwin-arm64': '0.0.5',
      '@teddyzhu/clipboard-darwin-x64': '0.0.5',
      '@teddyzhu/clipboard-linux-x64-gnu': '0.0.5',
      '@teddyzhu/clipboard-linux-arm64-gnu': '0.0.5',
      '@teddyzhu/clipboard-win32-x64-msvc': '0.0.5',
      '@teddyzhu/clipboard-win32-arm64-msvc': '0.0.5',
      // sharp is a native module externalized in esbuild. Declaring sharp alone
      // is sufficient: its own optionalDependencies pull in the matching @img
      // platform binary for every OS/arch npm installs onto, so the platform
      // packages are not pinned here (pinning them drifts on a sharp bump).
      // The version is exact-pinned like all other native optional deps in this
      // manifest — a project-wide convention that keeps the published tarball
      // reproducible. Sharp's recurring CVE stream means users must wait for a
      // CLI release to pick up libvips fixes; nightly releases keep the
      // turnaround short.
      sharp: sharpVersion,
    },
    engines: rootPackageJson.engines,
  };

  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify(distPackageJson, null, 2) + '\n',
  );
}

function assertNoSensitivePackageScanLiterals(distDir) {
  for (const filePath of listTextPackageFiles(distDir)) {
    const contents = fs.readFileSync(filePath, 'utf8');
    const lowerContents = contents.toLowerCase();
    for (const literal of PACKAGE_SCAN_FORBIDDEN_LITERALS) {
      if (!lowerContents.includes(literal.toLowerCase())) continue;
      const relativePath = path.relative(distDir, filePath);
      throw new Error(
        `Prepared package contains forbidden string "${literal}" in ${relativePath}`,
      );
    }
  }
}

function listTextPackageFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTextPackageFiles(entryPath));
    } else if (entry.isFile() && PACKAGE_TEXT_FILE_RE.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function assertPreparedPackageSize(distDir, maxUnpackedBytes) {
  const packageFiles = collectPreparedPackageFiles(distDir);
  let unpackedBytes = 0;
  for (const filePath of packageFiles) {
    unpackedBytes += fs.statSync(filePath).size;
  }
  if (unpackedBytes <= maxUnpackedBytes) return;
  throw new Error(
    `Prepared package unpacked size ${unpackedBytes} bytes exceeds ${maxUnpackedBytes} bytes`,
  );
}

function collectPreparedPackageFiles(distDir) {
  const distPackageJson = JSON.parse(
    fs.readFileSync(path.join(distDir, 'package.json'), 'utf8'),
  );
  const packageFiles = new Set([path.join(distDir, 'package.json')]);

  for (const entry of distPackageJson.files ?? []) {
    if (entry === '*.sb') {
      for (const fileName of fs.readdirSync(distDir)) {
        if (fileName.endsWith('.sb')) {
          packageFiles.add(path.join(distDir, fileName));
        }
      }
      continue;
    }

    const entryPath = path.join(distDir, entry);
    if (!fs.existsSync(entryPath)) continue;
    collectFiles(entryPath, packageFiles);
  }

  return packageFiles;
}

function collectFiles(entryPath, output) {
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(entryPath)) {
      collectFiles(path.join(entryPath, entry), output);
    }
  } else if (stat.isFile()) {
    output.add(entryPath);
  }
}

function printPackageStructure(distDir) {
  console.log('\n✅ Package prepared for publishing at dist/');
  console.log('\nPackage structure:');
  // Use Node.js to list directory contents (cross-platform)
  const distFiles = fs.readdirSync(distDir);
  for (const file of distFiles) {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    const size = stats.isDirectory() ? '<DIR>' : formatBytes(stats.size);
    console.log(`  ${size.padEnd(12)} ${file}`);
  }
}

function copyRecursiveSync(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyRecursiveSync(srcPath, destPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
