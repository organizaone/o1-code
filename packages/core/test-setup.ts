/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Tests assert en-US numbers and dates. On Windows, Node takes the default
// locale from the system settings and ignores LANG, so a call that names no
// locale is pinned to en-US here, as CI's Linux runners produce.
const TEST_LOCALE = 'en-US';
{
  const pinned = <T extends (...args: never[]) => unknown>(format: T): T =>
    new Proxy(format, {
      apply: (target, self, [locales, options]) =>
        Reflect.apply(target, self, [locales ?? TEST_LOCALE, options]),
      construct: (target, [locales, options]) =>
        Reflect.construct(target, [locales ?? TEST_LOCALE, options]),
    });
  Intl.NumberFormat = pinned(Intl.NumberFormat);
  Intl.DateTimeFormat = pinned(Intl.DateTimeFormat);
  const toLocale = <K extends string>(
    proto: Record<K, (locales?: unknown, options?: unknown) => string>,
    name: K,
  ) => {
    const original = proto[name];
    proto[name] = function (this: unknown, locales, options) {
      return original.call(this, locales ?? TEST_LOCALE, options);
    };
  };
  toLocale(Number.prototype as never, 'toLocaleString');
  toLocale(BigInt.prototype as never, 'toLocaleString');
  toLocale(Date.prototype as never, 'toLocaleString');
  toLocale(Date.prototype as never, 'toLocaleDateString');
  toLocale(Date.prototype as never, 'toLocaleTimeString');
}

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env['NO_COLOR'] !== undefined) {
  delete process.env['NO_COLOR'];
}

import { setSimulate429 } from './src/utils/testUtils.js';

// Avoid writing per-session debug log files during tests.
// Unit tests can opt-in by overriding this env var.
if (process.env['O1CODE_DEBUG_LOG_FILE'] === undefined) {
  process.env['O1CODE_DEBUG_LOG_FILE'] = '0';
}

// Disable 429 simulation globally for all tests
setSimulate429(false);

// Keep managed auto-memory test fixtures under per-test temp project roots.
if (process.env['O1CODE_MEMORY_LOCAL'] === undefined) {
  process.env['O1CODE_MEMORY_LOCAL'] = '1';
}

// Some dependencies (e.g., undici) expect a global File constructor in Node.
// Provide a minimal shim for test environment if missing.
if (typeof (globalThis as unknown as { File?: unknown }).File === 'undefined') {
  (globalThis as unknown as { File: unknown }).File = class {} as unknown;
}
