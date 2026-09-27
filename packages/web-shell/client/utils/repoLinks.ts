/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** A page under `docs/` in the product repository named by brand.json. */
export function repoDocUrl(docPath: string): string {
  return `${__BRAND_REPO_URL__}/blob/main/docs/${docPath}`;
}

/** The repository's new-issue form, without query parameters. */
export function newIssueUrl(): string {
  return `${__BRAND_REPO_URL__}/issues/new`;
}
