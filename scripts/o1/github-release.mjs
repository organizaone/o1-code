#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Creates the GitHub release of a tag through the REST API and uploads its
// assets, so the release workflow does not depend on the `gh` CLI being on
// the runner (the self-hosted image has none). Idempotent: a release that
// already exists for the tag is reused, and an asset already uploaded under
// the same name is left alone.
//
// Usage: node scripts/o1/github-release.mjs <tag> --title <title>
//   --notes-file <path> [--asset <path>]... [--repo owner/name]
// Reads GH_TOKEN (or GITHUB_TOKEN) and, without --repo, GITHUB_REPOSITORY.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';

/**
 * @param {string[]} argv
 * @returns {{ tag: string; title: string; notesFile: string; assets: string[]; repo?: string }}
 */
export function parseArgs(argv) {
  const [tag, ...rest] = argv;
  if (!tag)
    throw new Error(
      'usage: github-release.mjs <tag> --title <title> --notes-file <path> [--asset <path>]...',
    );
  const options = {
    tag,
    title: '',
    notesFile: '',
    assets: [],
    repo: undefined,
  };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (value === undefined) throw new Error(`missing value for ${flag}`);
    if (flag === '--title') options.title = value;
    else if (flag === '--notes-file') options.notesFile = value;
    else if (flag === '--asset') options.assets.push(value);
    else if (flag === '--repo') options.repo = value;
    else throw new Error(`unknown option ${flag}`);
  }
  if (!options.title) throw new Error('--title is required');
  if (!options.notesFile) throw new Error('--notes-file is required');
  return options;
}

/** Media type of an asset by its extension; GitHub stores it as given. */
export function contentTypeOf(file) {
  if (/\.tgz$|\.tar\.gz$/i.test(file)) return 'application/gzip';
  if (/\.zip$/i.test(file)) return 'application/zip';
  if (/\.json$/i.test(file)) return 'application/json';
  if (/\.md$|\.txt$/i.test(file)) return 'text/plain';
  return 'application/octet-stream';
}

async function request(fetch, token, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body };
}

/**
 * Creates or reuses the release of `tag` and uploads the assets not yet
 * attached. Returns the release's html_url and the names uploaded.
 *
 * @param {object} input
 * @param {string} input.repo owner/name
 * @param {string} input.tag
 * @param {string} input.title
 * @param {string} input.notes
 * @param {Array<{ name: string; data: Uint8Array; contentType: string }>} input.assets
 * @param {string} input.token
 * @param {typeof fetch} [input.fetch]
 */
export async function publishRelease({
  repo,
  tag,
  title,
  notes,
  assets,
  token,
  fetch: fetchImpl = globalThis.fetch,
}) {
  let release;
  const existing = await request(
    fetchImpl,
    token,
    `${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  );
  if (existing.status === 200) {
    release = existing.body;
  } else if (existing.status === 404) {
    const created = await request(
      fetchImpl,
      token,
      `${API}/repos/${repo}/releases`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: tag,
          name: title,
          body: notes,
          draft: false,
          prerelease: false,
        }),
      },
    );
    if (created.status !== 201) {
      throw new Error(
        `creating the release of ${tag} failed: HTTP ${created.status} ${created.body?.message ?? ''}`.trim(),
      );
    }
    release = created.body;
  } else {
    throw new Error(
      `looking up the release of ${tag} failed: HTTP ${existing.status} ${existing.body?.message ?? ''}`.trim(),
    );
  }

  const attached = new Set((release.assets ?? []).map((asset) => asset.name));
  const uploaded = [];
  for (const asset of assets) {
    if (attached.has(asset.name)) continue;
    const url = `${UPLOADS}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`;
    const result = await request(fetchImpl, token, url, {
      method: 'POST',
      headers: {
        'Content-Type': asset.contentType,
        'Content-Length': String(asset.data.byteLength),
      },
      body: asset.data,
    });
    if (result.status !== 201) {
      throw new Error(
        `uploading ${asset.name} failed: HTTP ${result.status} ${result.body?.message ?? ''}`.trim(),
      );
    }
    uploaded.push(asset.name);
  }
  return { url: release.html_url, uploaded, reused: existing.status === 200 };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GH_TOKEN or GITHUB_TOKEN is required');
  const repo = options.repo || process.env.GITHUB_REPOSITORY;
  if (!repo)
    throw new Error('--repo owner/name or GITHUB_REPOSITORY is required');
  const notes = readFileSync(options.notesFile, 'utf8');
  const assets = options.assets.map((file) => ({
    name: basename(file),
    data: readFileSync(file),
    contentType: contentTypeOf(file),
  }));
  const result = await publishRelease({
    repo,
    tag: options.tag,
    title: options.title,
    notes,
    assets,
    token,
  });
  console.log(
    `${result.reused ? 'Reused' : 'Created'} release ${options.tag}: ${result.url}`,
  );
  for (const name of result.uploaded) console.log(`Uploaded ${name}`);
}

if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
