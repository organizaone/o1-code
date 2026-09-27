#!/usr/bin/env node
// Compares each copied guide with its source, up to the deviations heading.
// Rejected approach: comparing the whole file. The project needs to record
// its deviations somewhere, and that place is the end of the guide itself;
// comparing everything would make any deviation indistinguishable from
// accidental drift.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source =
  process.env.O1CODE_GUIDES_SOURCE ?? resolve(root, '..', 'agents-defaults');
const guides = [
  'AGENT-WORKFLOW.md',
  'TASK-COMPLETION.md',
  'COMMITS.md',
  'VERSIONING.md',
  'AUTONOMOUS-EXECUTION.md',
];
const HEADINGS = ['## Desvios deste projeto', '## Deviations in this project'];

// The source may have CRLF on disk while the copy is normalized to LF by the
// fork's .gitattributes. Comparing bytes would report the whole file as
// changed on the first clean checkout, which is indistinguishable from real
// drift. The rule is about content, not about the platform's line-ending
// convention.
const normalize = (text) => text.replace(/\r\n/g, '\n');

function body(text) {
  for (const heading of HEADINGS) {
    const at = text.indexOf(heading);
    if (at !== -1) return text.slice(0, at).trimEnd();
  }
  return null;
}

const problems = [];

// The source is a sibling checkout that only the maintainer's machine has. Its
// absence is reported and skipped, not failed, so the gate runs everywhere;
// the skip line names the path so it is never mistaken for a pass. When the
// source exists, the comparison below stays strict.
if (!existsSync(source)) {
  console.log(
    `check-guides: source not found, skipped (${source}). Point O1CODE_GUIDES_SOURCE to the guides repository to compare.`,
  );
  process.exit(0);
}

for (const guide of guides) {
  const copyPath = join(root, 'docs', 'guides', guide);
  const sourcePath = join(source, guide);
  if (!existsSync(copyPath)) {
    problems.push(`${guide}: missing copy`);
    continue;
  }
  if (!existsSync(sourcePath)) {
    problems.push(`${guide}: missing in the source`);
    continue;
  }
  const copy = body(normalize(readFileSync(copyPath, 'utf8')));
  if (copy === null) {
    problems.push(`${guide}: copy missing the deviations heading`);
    continue;
  }
  const original = normalize(readFileSync(sourcePath, 'utf8')).trimEnd();
  if (copy !== original) {
    problems.push(`${guide}: body diverges from the source`);
  }
}

console.log(
  `check-guides: ${guides.length} guide(s), ${problems.length} problem(s)`,
);
for (const problem of problems) console.error(`  - ${problem}`);
process.exitCode = problems.length === 0 ? 0 : 1;
