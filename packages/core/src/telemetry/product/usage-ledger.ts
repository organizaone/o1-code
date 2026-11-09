/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/** How a session was started. */
export type SessionMode = 'interactive' | 'headless' | 'sdk';
const SESSION_MODES: readonly SessionMode[] = [
  'interactive',
  'headless',
  'sdk',
];

/** The totals of one local day, as sent to the intake. */
export interface DayUsage {
  day: string;
  /** Always every mode: the intake refuses a day without one of them. */
  sessions: Record<SessionMode, number>;
  prompts: number;
  toolCalls: Record<string, number>;
  slashCommands: Record<string, number>;
  providers: Record<string, number>;
  apiErrors: Record<string, number>;
  tokens: { input: number; output: number };
  subagents: number;
}

/** Keys a map may hold before further names fold into `other`. */
export const MAX_MAP_KEYS = 100;
/** Days kept on disk and sent; older days are dropped unsent. */
export const MAX_DAYS = 31;
const MAX_COUNT = 1_000_000_000;
const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.[A-Za-z0-9-]+\.json$/;

export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function emptyDay(day: string): DayUsage {
  return {
    day,
    sessions: { interactive: 0, headless: 0, sdk: 0 },
    prompts: 0,
    toolCalls: {},
    slashCommands: {},
    providers: {},
    apiErrors: {},
    tokens: { input: 0, output: 0 },
    subagents: 0,
  };
}

function clamp(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MAX_COUNT, Math.max(0, Math.round(value)))
    : 0;
}

/** The intake's rule for a map key. */
const MAP_KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

function addTo(map: Record<string, number>, key: string, amount = 1): void {
  const name =
    Object.hasOwn(map, key) || Object.keys(map).length < MAX_MAP_KEYS
      ? key
      : 'other';
  map[name] = clamp((Object.hasOwn(map, name) ? map[name]! : 0) + amount);
}

/**
 * Adds a map read from disk. A key the intake would refuse is skipped, so one
 * damaged file cannot keep every later report from being accepted.
 */
function mergeMap(
  target: Record<string, number>,
  source: unknown,
): Record<string, number> {
  if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'number' && MAP_KEY.test(key)) {
        addTo(target, key, value);
      }
    }
  }
  return target;
}

function mergeDay(target: DayUsage, source: Partial<DayUsage>): DayUsage {
  for (const mode of SESSION_MODES) {
    target.sessions[mode] = clamp(
      target.sessions[mode] + (Number(source.sessions?.[mode]) || 0),
    );
  }
  target.prompts = clamp(target.prompts + (Number(source.prompts) || 0));
  mergeMap(target.toolCalls, source.toolCalls);
  mergeMap(target.slashCommands, source.slashCommands);
  mergeMap(target.providers, source.providers);
  mergeMap(target.apiErrors, source.apiErrors);
  target.tokens.input = clamp(
    target.tokens.input + (Number(source.tokens?.input) || 0),
  );
  target.tokens.output = clamp(
    target.tokens.output + (Number(source.tokens?.output) || 0),
  );
  target.subagents = clamp(target.subagents + (Number(source.subagents) || 0));
  return target;
}

/**
 * Counts this process's usage per local day. Each process writes its own
 * file per day, so concurrent sessions never overwrite each other; the sender
 * sums the files of a day.
 */
export class UsageLedger {
  private usage: DayUsage;
  private dirty = false;

  constructor(
    private readonly directory: string,
    private readonly now: () => Date = () => new Date(),
    private readonly processKey = `${process.pid}-${randomUUID().slice(0, 8)}`,
  ) {
    this.usage = emptyDay(localDay(this.now()));
  }

  session(mode: SessionMode): void {
    this.update((day) => (day.sessions[mode] = clamp(day.sessions[mode] + 1)));
  }

  prompt(): void {
    this.update((day) => (day.prompts = clamp(day.prompts + 1)));
  }

  toolCall(name: string): void {
    this.update((day) => addTo(day.toolCalls, name));
  }

  slashCommand(name: string): void {
    this.update((day) => addTo(day.slashCommands, name));
  }

  apiResponse(provider: string, input: number, output: number): void {
    this.update((day) => {
      addTo(day.providers, provider);
      day.tokens.input = clamp(day.tokens.input + input);
      day.tokens.output = clamp(day.tokens.output + output);
    });
  }

  apiError(category: string): void {
    this.update((day) => addTo(day.apiErrors, category));
  }

  subagent(): void {
    this.update((day) => (day.subagents = clamp(day.subagents + 1)));
  }

  /** Writes this process's totals for the current day, if they changed. */
  persist(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const file = path.join(
        this.directory,
        `${this.usage.day}.${this.processKey}.json`,
      );
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(this.usage));
      fs.renameSync(temporary, file);
      this.dirty = false;
    } catch {
      // Usage counts are best effort; a full or read-only disk loses them.
    }
  }

  private update(change: (day: DayUsage) => void): void {
    const today = localDay(this.now());
    if (today !== this.usage.day) {
      this.persist();
      this.usage = emptyDay(today);
    }
    change(this.usage);
    this.dirty = true;
  }
}

export interface CollectedUsage {
  days: DayUsage[];
  /** Files of days before today, removed once the intake accepts them. */
  completedFiles: string[];
}

/**
 * Sums every process's file per day for the last {@link MAX_DAYS} days.
 * Files of older days are deleted without being sent.
 */
export function collectUsage(directory: string, now: Date): CollectedUsage {
  const today = localDay(now);
  const oldest = localDay(new Date(now.getTime() - MAX_DAYS * 86_400_000));
  const days = new Map<string, DayUsage>();
  const completedFiles: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(directory);
  } catch {
    return { days: [], completedFiles };
  }
  for (const name of names) {
    const match = FILE_PATTERN.exec(name);
    if (!match) continue;
    const day = match[1]!;
    const file = path.join(directory, name);
    if (day < oldest || day > today) {
      fs.rmSync(file, { force: true });
      continue;
    }
    try {
      const content = JSON.parse(
        fs.readFileSync(file, 'utf8'),
      ) as Partial<DayUsage>;
      days.set(day, mergeDay(days.get(day) ?? emptyDay(day), content));
    } catch {
      fs.rmSync(file, { force: true });
      continue;
    }
    if (day < today) completedFiles.push(file);
  }
  return {
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    completedFiles,
  };
}
