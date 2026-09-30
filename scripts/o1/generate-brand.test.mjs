/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { BRAND_MODULE_TARGETS, renderBrandModule } from './generate-brand.mjs';

const identity = {
  productName: 'o1-code',
  displayName: 'O1-Code',
  organization: 'OrganizaOne',
  repoUrl: 'https://github.com/example/o1-code',
  coAuthorEmail: 'o1-code@example.com',
  userAgent: 'O1Code',
  npmName: '@organizaone/o1-code',
};

test('renders the runtime brand fields', () => {
  const source = renderBrandModule(identity);
  assert.match(source, /productName: "o1-code",/);
  assert.match(source, /displayName: "O1-Code",/);
  assert.match(source, /organization: "OrganizaOne",/);
  assert.match(source, /repoUrl: "https:\/\/github\.com\/example\/o1-code",/);
  assert.match(source, /coAuthorEmail: "o1-code@example\.com",/);
  assert.match(source, /userAgent: "O1Code",/);
  assert.doesNotMatch(source, /npmName/);
  assert.match(source, /\} as const;/);
});

test('escapes values as string literals', () => {
  const source = renderBrandModule({ ...identity, organization: 'A "B"' });
  assert.match(source, /organization: "A \\"B\\"",/);
});

test('refuses a missing field', () => {
  const { organization, ...rest } = identity;
  void organization;
  assert.throws(() => renderBrandModule(rest), /identity\.organization/);
});

test('refuses a missing repository URL', () => {
  const { repoUrl, ...rest } = identity;
  void repoUrl;
  assert.throws(() => renderBrandModule(rest), /identity\.repoUrl/);
});

test('refuses a missing co-author email', () => {
  const { coAuthorEmail, ...rest } = identity;
  void coAuthorEmail;
  assert.throws(() => renderBrandModule(rest), /identity\.coAuthorEmail/);
});

test('writes the module for the CLI and for core', () => {
  const targets = BRAND_MODULE_TARGETS.map((target) =>
    target.split(path.sep).join('/'),
  );
  assert.deepEqual(targets, [
    'packages/cli/src/generated/brand.ts',
    'packages/core/src/generated/brand.ts',
  ]);
});
