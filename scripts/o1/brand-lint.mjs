#!/usr/bin/env node
// Brand lint: reports the name of the project this code came from wherever
// it appears in sources and docs, tracked or not yet added (untracked files
// git does not ignore). What it looks for, which lines are
// allowed (provider and model names, endpoints, license headers) and which
// files are exempt live in brand.json under `lint`.
//
// Code ported by hand is plain editing, and this is what keeps it from
// bringing the old name back.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function findResidual(text, { patterns, allow }) {
  const marks = new RegExp(patterns.join('|'), 'i');
  const allowed = allow.length > 0 ? new RegExp(allow.join('|'), 'i') : null;
  const hits = [];
  text.split('\n').forEach((line, index) => {
    if (allowed?.test(line)) return;
    const hit = line.match(marks);
    if (hit) hits.push({ line: index + 1, match: hit[0], text: line.trim() });
  });
  return hits;
}

/** Keeps the files under `paths` that no `exclude` or `allowPaths` glob matches. */
export function selectFiles(files, { paths, exclude = [], allowPaths = [] }) {
  const skip = [...exclude, ...allowPaths];
  return files.filter(
    (file) =>
      paths.some((glob) => matchesGlob(file, glob)) &&
      !skip.some((glob) => matchesGlob(file, glob)),
  );
}

/**
 * Tracked files plus untracked ones git does not ignore, so a file not yet
 * added is linted locally as CI will lint it once it is committed.
 */
export function lintedFiles(git) {
  const list = (args) => git(args).split('\0').filter(Boolean);
  return [
    ...new Set([
      ...list(['ls-files', '-z']),
      ...list(['ls-files', '-z', '--others', '--exclude-standard']),
    ]),
  ];
}

function runGit(root) {
  return (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { lint } = JSON.parse(readFileSync(join(root, 'brand.json'), 'utf8'));
  const files = selectFiles(lintedFiles(runGit(root)), lint).sort();
  let total = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // Deleted in the working tree but still in the index.
    }
    if (text.includes('\0')) continue; // Binary.
    for (const hit of findResidual(text, lint)) {
      total += 1;
      if (total <= 50)
        console.error(
          `${file}:${hit.line}: ${hit.match}: ${hit.text.slice(0, 120)}`,
        );
    }
  }
  if (total > 50) console.error(`... and ${total - 50} more`);
  console.log(
    `brand-lint: ${files.length} file(s), ${total} line(s) with a forbidden name`,
  );
  return total;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main() === 0 ? 0 : 1;
}
