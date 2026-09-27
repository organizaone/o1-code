#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Prints the body of a version's section in CHANGELOG.md, the notes of its
// GitHub release. Usage: node scripts/o1/release-notes.mjs <version>
// [--changelog <path>]. Exits 1 when the section is missing or empty, so a
// release never goes out without notes.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultChangelog = resolve(here, '..', '..', 'CHANGELOG.md');

/**
 * @param {string} changelog the whole CHANGELOG.md
 * @param {string} version a version without the leading `v`
 * @returns {string} the section's body, trimmed, with `\n` line endings
 */
export function extractReleaseNotes(changelog, version) {
  const lines = changelog.replace(/\r\n?/g, '\n').split('\n');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^## \\[${escaped}\\](\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) {
    throw new Error(`No "## [${version}]" section in CHANGELOG.md`);
  }
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    body.push(line);
  }
  // The last section runs into the link reference definitions at the end of
  // a Keep a Changelog file; they are not part of its notes.
  while (body.length > 0) {
    const last = body[body.length - 1];
    if (last.trim() === '' || /^\[[^\]]+\]:\s/.test(last)) body.pop();
    else break;
  }
  const notes = body.join('\n').trim();
  if (notes === '') {
    throw new Error(`The "## [${version}]" section of CHANGELOG.md is empty`);
  }
  return notes;
}

function main(argv) {
  let version;
  let changelogPath = defaultChangelog;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--changelog') changelogPath = resolve(argv[++i] ?? '');
    else if (version === undefined) version = argv[i];
  }
  if (!version) {
    process.stderr.write(
      'Usage: node scripts/o1/release-notes.mjs <version> [--changelog <path>]\n',
    );
    return 1;
  }
  try {
    const notes = extractReleaseNotes(
      readFileSync(changelogPath, 'utf8'),
      version.replace(/^v/, ''),
    );
    process.stdout.write(`${notes}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(
      `release-notes: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
