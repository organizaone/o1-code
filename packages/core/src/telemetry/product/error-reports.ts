/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export type ErrorKind = 'uncaughtException' | 'unhandledRejection';

/** One group of identical errors, as stored on disk and sent to the intake. */
export interface ErrorReport {
  fingerprint: string;
  kind: ErrorKind;
  version: string;
  name: string;
  message: string;
  stack: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LENGTH = 8000;
/** Reports sent per request; the rest wait for the next one. */
export const MAX_REPORTS_PER_SEND = 20;
/** Distinct reports kept on disk; new ones are dropped beyond this. */
const MAX_STORED_REPORTS = 100;
const FINGERPRINT_FRAMES = 5;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes what could identify the user or their work from an error text:
 * the home directory, absolute paths (keeping only the package-relative part
 * of a dependency, otherwise the file name), URLs, e-mail addresses and long
 * token-like strings.
 */
export function sanitizeErrorText(
  text: string,
  homeDir: string = os.homedir(),
): string {
  let result = text;
  if (homeDir.length > 1) {
    const variants = new Set([
      homeDir,
      homeDir.replace(/\\/g, '/'),
      homeDir.replace(/\//g, '\\'),
    ]);
    for (const variant of variants) {
      result = result.replace(new RegExp(escapeRegExp(variant), 'gi'), '~');
    }
  }
  result = result
    // Stack frames of ES modules name their file as a file: URL; it is a
    // path like any other, shortened below rather than hidden as a URL.
    .replace(/file:\/\/\/(?=[A-Za-z]:)/gi, '')
    .replace(/file:\/\//gi, '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`)]+/gi, '<url>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    // Node's own modules (`node:internal/...`) name no user file and stay.
    .replace(
      /(?<!node:\w*)(?:~|[A-Za-z]:)?(?:[\\/][^\s\\/:'"`()]+)+[\\/]?([^\s\\/:'"`()]*)/g,
      (match: string) => shortenPath(match),
    )
    // Credentials that are shorter than the generic rule below: an
    // authorization value, a `secret=…` pair, or a key with a known prefix.
    .replace(/\b(Bearer|Basic)\s+[^\s'"`,;)]+/gi, '$1 <redacted>')
    .replace(
      /\b([\w-]*(?:password|passwd|secret|token|api[_-]?key|auth)[\w-]*)(["']?\s*[:=]\s*["']?)[^\s'"`,;)&]+/gi,
      '$1$2<redacted>',
    )
    .replace(
      /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr|github_pat|glpat|xox[abprs]|AKIA|ASIA|AIza)[-_A-Za-z0-9]{8,}/g,
      '<redacted>',
    )
    .replace(/\b[A-Za-z0-9_\-+=]{32,}\b/g, '<redacted>')
    // Quoted text longer than an identifier is usually the user's content
    // echoed back (a JSON parse error, a command line); its shape is enough.
    .replace(/(["'`])([^"'`\n]{41,})\1/g, '$1…$1');
  return result;
}

function shortenPath(match: string): string {
  const normalized = match.replace(/\\/g, '/');
  const dependency = normalized.lastIndexOf('node_modules/');
  if (dependency !== -1) return normalized.slice(dependency);
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 1 ? `…/${segments.at(-1)}` : normalized;
}

function frames(stack: string): string[] {
  return (
    stack
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('at '))
      .slice(0, FINGERPRINT_FRAMES)
      // Line and column numbers change with every build; the function and file
      // names do not, so they identify the same failure across versions.
      .map((line) => line.replace(/:\d+(?::\d+)?\)?$/u, ''))
  );
}

/** Turns a thrown value into a report of one occurrence. */
export function buildErrorReport(
  error: unknown,
  kind: ErrorKind,
  version: string,
  now: Date = new Date(),
  homeDir?: string,
): ErrorReport {
  const value =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Non-error value thrown');
  const name = (value.name || 'Error').slice(0, 64);
  const message = sanitizeErrorText(value.message ?? '', homeDir).slice(
    0,
    MAX_MESSAGE_LENGTH,
  );
  const stack = sanitizeErrorText(value.stack ?? '', homeDir).slice(
    0,
    MAX_STACK_LENGTH,
  );
  const fingerprint = createHash('sha256')
    .update([kind, name, ...frames(stack)].join('\n'))
    .digest('hex')
    .slice(0, 32);
  const seen = now.toISOString();
  return {
    fingerprint,
    kind,
    version,
    name,
    message,
    stack,
    count: 1,
    firstSeen: seen,
    lastSeen: seen,
  };
}

function reportFile(directory: string, report: ErrorReport): string {
  // The version is part of the name so a fix can be told apart from the
  // version that still fails.
  const version = report.version.replace(/[^A-Za-z0-9.-]/g, '_');
  return path.join(directory, `${report.fingerprint}.${version}.json`);
}

/**
 * Adds an occurrence to the stored group of the same error. Synchronous, as
 * it runs while the process is about to exit.
 */
export function storeErrorReport(directory: string, report: ErrorReport): void {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const file = reportFile(directory, report);
    let stored: ErrorReport | undefined;
    if (fs.existsSync(file)) {
      stored = JSON.parse(fs.readFileSync(file, 'utf8')) as ErrorReport;
    } else if (fs.readdirSync(directory).length >= MAX_STORED_REPORTS) {
      return;
    }
    const next: ErrorReport = stored
      ? {
          ...stored,
          count: Math.min(1_000_000_000, (stored.count || 0) + report.count),
          lastSeen: report.lastSeen,
        }
      : report;
    fs.writeFileSync(file, JSON.stringify(next));
  } catch {
    // Reporting must never be the reason a crash handler fails.
  }
}

export interface CollectedErrors {
  reports: ErrorReport[];
  files: string[];
}

const REPORT_KEYS = [
  'fingerprint',
  'kind',
  'version',
  'name',
  'message',
  'stack',
  'count',
  'firstSeen',
  'lastSeen',
].sort();

function isValidReport(value: unknown): value is ErrorReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Record<string, unknown>;
  const keys = Object.keys(report).sort();
  const firstSeen = Date.parse(String(report['firstSeen']));
  const lastSeen = Date.parse(String(report['lastSeen']));
  return (
    keys.length === REPORT_KEYS.length &&
    keys.every((key, index) => key === REPORT_KEYS[index]) &&
    /^[0-9a-f]{32}$/.test(String(report['fingerprint'])) &&
    (report['kind'] === 'uncaughtException' ||
      report['kind'] === 'unhandledRejection') &&
    typeof report['version'] === 'string' &&
    /^(?:[0-9A-Za-z.+-]{1,32})$/.test(report['version']) &&
    typeof report['name'] === 'string' &&
    report['name'].length >= 1 &&
    report['name'].length <= 64 &&
    typeof report['message'] === 'string' &&
    report['message'].length <= MAX_MESSAGE_LENGTH &&
    typeof report['stack'] === 'string' &&
    report['stack'].length <= MAX_STACK_LENGTH &&
    Number.isInteger(report['count']) &&
    (report['count'] as number) >= 1 &&
    (report['count'] as number) <= 1_000_000_000 &&
    Number.isFinite(firstSeen) &&
    Number.isFinite(lastSeen) &&
    firstSeen <= lastSeen
  );
}

export function collectErrorReports(directory: string): CollectedErrors {
  const reports: ErrorReport[] = [];
  const files: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(directory).filter((name) => name.endsWith('.json'));
  } catch {
    return { reports, files };
  }
  for (const name of names.slice(0, MAX_REPORTS_PER_SEND)) {
    const file = path.join(directory, name);
    try {
      const report = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      if (!isValidReport(report)) throw new Error('Invalid report');
      reports.push(report);
      files.push(file);
    } catch {
      // A file the intake would refuse would otherwise block every report.
      fs.rmSync(file, { force: true });
    }
  }
  return { reports, files };
}
