/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Builds release-notes.json from CHANGELOG.md: for every released version,
// the first sentence of each top-level entry, in the order the changelog
// lists them. The first run of a new version shows them offline (the
// "What's new" notice). Usage: node scripts/o1/release-highlights.mjs <out>
// [--changelog <path>].

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultChangelog = resolve(here, '..', '..', 'CHANGELOG.md');
const MAX_LENGTH = 110;

/** Plain text of one entry, cut to its first sentence or clause. */
export function highlightOf(entry) {
  const text = entry
    .replace(/\s+/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
  if (sentence.length <= MAX_LENGTH) return sentence;
  const clause = sentence.match(/^.*?(?=[:;] )/)?.[0];
  if (clause && clause.length <= MAX_LENGTH) return clause;
  return `${sentence.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
}

export function buildReleaseHighlights(changelog) {
  const notes = {};
  let version;
  let entry;
  const flush = () => {
    if (version && entry) notes[version].highlights.push(highlightOf(entry));
    entry = undefined;
  };
  for (const line of changelog.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = line.match(/^## \[(\d+\.\d+\.\d+)\]/);
    if (heading) {
      flush();
      version = heading[1];
      notes[version] = { highlights: [] };
      continue;
    }
    if (line.startsWith('## ')) {
      flush();
      version = undefined;
      continue;
    }
    if (!version) continue;
    if (line.startsWith('- ')) {
      flush();
      entry = line.slice(2);
    } else if (entry !== undefined && /^\s+\S/.test(line)) {
      entry += ` ${line.trim()}`;
    } else {
      flush();
    }
  }
  flush();
  return notes;
}

function main(argv) {
  let out;
  let changelogPath = defaultChangelog;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--changelog') changelogPath = resolve(argv[++i] ?? '');
    else if (out === undefined) out = resolve(argv[i]);
  }
  if (!out) {
    process.stderr.write(
      'Usage: node scripts/o1/release-highlights.mjs <out> [--changelog <path>]\n',
    );
    return 1;
  }
  const notes = buildReleaseHighlights(readFileSync(changelogPath, 'utf8'));
  writeFileSync(out, `${JSON.stringify(notes, null, 2)}\n`);
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
