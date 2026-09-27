/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { docsUrl, newIssueUrl, repoDocUrl } from './repo-links.js';

vi.mock('../generated/brand.js', () => ({
  BRAND: {
    productName: 'tool',
    displayName: 'Tool',
    organization: 'Acme',
    repoUrl: 'https://example.test/acme/tool',
  },
}));

describe('repository links', () => {
  it('builds the documentation index from brand.json', () => {
    expect(docsUrl()).toBe('https://example.test/acme/tool/tree/main/docs');
  });

  it('builds a documentation page from brand.json', () => {
    expect(repoDocUrl('users/support/tos-privacy.md')).toBe(
      'https://example.test/acme/tool/blob/main/docs/users/support/tos-privacy.md',
    );
  });

  it('builds the new-issue form from brand.json', () => {
    expect(newIssueUrl()).toBe('https://example.test/acme/tool/issues/new');
  });
});
