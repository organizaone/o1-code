/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BRAND } from '../generated/brand.js';

/** The documentation index in the product repository. */
export function docsUrl(): string {
  return `${BRAND.repoUrl}/tree/main/docs`;
}

/** A page under `docs/`, e.g. `users/support/tos-privacy.md`. */
export function repoDocUrl(docPath: string): string {
  return `${BRAND.repoUrl}/blob/main/docs/${docPath}`;
}

/** The repository's new-issue form, without query parameters. */
export function newIssueUrl(): string {
  return `${BRAND.repoUrl}/issues/new`;
}
