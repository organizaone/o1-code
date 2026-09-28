/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentTypeOf, parseArgs, publishRelease } from './github-release.mjs';

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
    });
    const key = `${init.method ?? 'GET'} ${url}`;
    const route = routes.find(([pattern]) =>
      pattern instanceof RegExp ? pattern.test(key) : pattern === key,
    );
    if (!route) throw new Error(`unexpected request ${key}`);
    const [, status, body] = route;
    return {
      status,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    };
  };
  return { fetch, calls };
}

test('parses the tag, title, notes file, assets and repo', () => {
  const options = parseArgs([
    'v1.2.3',
    '--title',
    'o1-code 1.2.3',
    '--notes-file',
    'n.md',
    '--asset',
    'a.tgz',
    '--asset',
    'b.zip',
    '--repo',
    'o/r',
  ]);
  assert.deepEqual(options, {
    tag: 'v1.2.3',
    title: 'o1-code 1.2.3',
    notesFile: 'n.md',
    assets: ['a.tgz', 'b.zip'],
    repo: 'o/r',
  });
});

test('refuses a missing title or notes file', () => {
  assert.throws(
    () => parseArgs(['v1.0.0', '--notes-file', 'n.md']),
    /--title is required/,
  );
  assert.throws(
    () => parseArgs(['v1.0.0', '--title', 'x']),
    /--notes-file is required/,
  );
  assert.throws(() => parseArgs(['v1.0.0', '--title']), /missing value/);
});

test('picks a media type by extension', () => {
  assert.equal(
    contentTypeOf('organizaone-o1-code-0.1.0.tgz'),
    'application/gzip',
  );
  assert.equal(contentTypeOf('x.zip'), 'application/zip');
  assert.equal(contentTypeOf('x.bin'), 'application/octet-stream');
});

test('creates the release and uploads the asset', async () => {
  const { fetch, calls } = fakeFetch([
    [
      'GET https://api.github.com/repos/o/r/releases/tags/v1.0.0',
      404,
      { message: 'Not Found' },
    ],
    [
      'POST https://api.github.com/repos/o/r/releases',
      201,
      {
        id: 7,
        html_url: 'https://github.com/o/r/releases/tag/v1.0.0',
        assets: [],
      },
    ],
    [
      /^POST https:\/\/uploads\.github\.com\/repos\/o\/r\/releases\/7\/assets\?name=a\.tgz$/,
      201,
      { name: 'a.tgz' },
    ],
  ]);
  const result = await publishRelease({
    repo: 'o/r',
    tag: 'v1.0.0',
    title: 'o1-code 1.0.0',
    notes: 'notes',
    token: 't',
    assets: [
      {
        name: 'a.tgz',
        data: new Uint8Array([1, 2, 3]),
        contentType: 'application/gzip',
      },
    ],
    fetch,
  });
  assert.deepEqual(result, {
    url: 'https://github.com/o/r/releases/tag/v1.0.0',
    uploaded: ['a.tgz'],
    reused: false,
  });
  const created = JSON.parse(calls[1].body);
  assert.deepEqual(created, {
    tag_name: 'v1.0.0',
    name: 'o1-code 1.0.0',
    body: 'notes',
    draft: false,
    prerelease: false,
  });
  assert.equal(calls[1].headers.Authorization, 'Bearer t');
  assert.equal(calls[2].headers['Content-Type'], 'application/gzip');
  assert.equal(calls[2].headers['Content-Length'], '3');
});

test('reuses an existing release and skips an asset already attached', async () => {
  const { fetch, calls } = fakeFetch([
    [
      'GET https://api.github.com/repos/o/r/releases/tags/v1.0.0',
      200,
      { id: 9, html_url: 'u', assets: [{ name: 'a.tgz' }] },
    ],
  ]);
  const result = await publishRelease({
    repo: 'o/r',
    tag: 'v1.0.0',
    title: 'x',
    notes: 'n',
    token: 't',
    assets: [
      {
        name: 'a.tgz',
        data: new Uint8Array(0),
        contentType: 'application/gzip',
      },
    ],
    fetch,
  });
  assert.deepEqual(result, { url: 'u', uploaded: [], reused: true });
  assert.equal(calls.length, 1);
});

test('reports a failed creation with the API message', async () => {
  const { fetch } = fakeFetch([
    [
      'GET https://api.github.com/repos/o/r/releases/tags/v1.0.0',
      404,
      { message: 'Not Found' },
    ],
    [
      'POST https://api.github.com/repos/o/r/releases',
      422,
      { message: 'Validation Failed' },
    ],
  ]);
  await assert.rejects(
    publishRelease({
      repo: 'o/r',
      tag: 'v1.0.0',
      title: 'x',
      notes: 'n',
      token: 't',
      assets: [],
      fetch,
    }),
    /creating the release of v1\.0\.0 failed: HTTP 422 Validation Failed/,
  );
});
