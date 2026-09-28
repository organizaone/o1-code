/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { Storage } from '@organizaone/o1-code-core/config/storage.js';
import { resolveBundleDir } from '@organizaone/o1-code-core/utils/bundlePaths.js';
import { BRAND } from '../../generated/brand.js';
import type { HistoryItemUpdateNotice } from '../types.js';

/** The highlights the first run of a new version shows. */
export interface WhatsNew {
  version: string;
  fromVersion?: string;
  highlights: string[];
  moreCount: number;
  notesUrl?: string;
}

/** `release-notes.json`, written into the bundle from CHANGELOG.md. */
export type ReleaseHighlights = Record<string, { highlights: string[] }>;

const MAX_HIGHLIGHTS = 4;
const SEEN_VERSION_FILE = 'last-seen-version';

export function loadReleaseHighlights(
  bundleDir = resolveBundleDir(import.meta.url),
): ReleaseHighlights | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(bundleDir, 'release-notes.json'), 'utf8'),
    ) as ReleaseHighlights;
  } catch {
    return undefined;
  }
}

/**
 * The highlights of every release after `fromVersion` up to `toVersion`,
 * newest first, capped at four; the rest are counted.
 */
export function computeWhatsNew(
  notes: ReleaseHighlights,
  fromVersion: string,
  toVersion: string,
  repoUrl: string = BRAND.repoUrl,
): WhatsNew | undefined {
  const versions = Object.keys(notes)
    .filter(
      (version) =>
        semver.valid(version) &&
        semver.gt(version, fromVersion) &&
        semver.lte(version, toVersion),
    )
    .sort(semver.rcompare);
  const all = versions.flatMap((version) => notes[version]!.highlights);
  if (all.length === 0) return undefined;
  return {
    version: toVersion,
    fromVersion,
    highlights: all.slice(0, MAX_HIGHLIGHTS),
    moreCount: Math.max(0, all.length - MAX_HIGHLIGHTS),
    notesUrl: repoUrl ? `${repoUrl}/releases/tag/v${toVersion}` : undefined,
  };
}

function seenVersionPath(): string {
  return path.join(Storage.getGlobalO1CodeDir(), SEEN_VERSION_FILE);
}

/**
 * Records this run's version and returns what is new since the version the
 * previous run recorded. A first install records and shows nothing; so does
 * a downgrade or a version with no notes.
 */
export function takeWhatsNew(
  currentVersion: string,
  notes: ReleaseHighlights | undefined = loadReleaseHighlights(),
): WhatsNew | undefined {
  if (!semver.valid(currentVersion)) return undefined;
  let previous: string | undefined;
  try {
    previous = fs.readFileSync(seenVersionPath(), 'utf8').trim();
  } catch {
    previous = undefined;
  }
  if (previous === currentVersion) return undefined;
  try {
    fs.mkdirSync(path.dirname(seenVersionPath()), { recursive: true });
    fs.writeFileSync(seenVersionPath(), `${currentVersion}\n`);
  } catch {
    // Unwritable home: show nothing rather than the same notes every run.
    return undefined;
  }
  if (!previous || !semver.valid(previous) || !notes) return undefined;
  if (!semver.gt(currentVersion, previous)) return undefined;
  return computeWhatsNew(notes, previous, currentVersion);
}

/** The notice a `WhatsNew` becomes in the conversation. */
export function whatsNewNotice(
  whatsNew: WhatsNew,
): Omit<HistoryItemUpdateNotice, 'id'> {
  return {
    type: 'update_notice',
    status: 'whats_new',
    version: whatsNew.version,
    fromVersion: whatsNew.fromVersion,
    highlights: whatsNew.highlights,
    moreCount: whatsNew.moreCount,
    notesUrl: whatsNew.notesUrl,
  };
}
