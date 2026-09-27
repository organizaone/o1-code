/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newIssueUrl, repoDocUrl } from './repoLinks';

const repoUrl = (
  JSON.parse(
    readFileSync(resolve(__dirname, '../../../../brand.json'), 'utf8'),
  ) as { identity: { repoUrl: string } }
).identity.repoUrl;

describe('repository links', () => {
  it('builds a documentation page from brand.json', () => {
    expect(repoDocUrl('users/support/tos-privacy.md')).toBe(
      `${repoUrl}/blob/main/docs/users/support/tos-privacy.md`,
    );
  });

  it('builds the new-issue form from brand.json', () => {
    expect(newIssueUrl()).toBe(`${repoUrl}/issues/new`);
  });
});
