/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const brand = JSON.parse(
  readFileSync(resolve(__dirname, '../../brand.json'), 'utf8'),
) as { identity: { repoUrl: string } };

/**
 * Compile-time constants from brand.json, shared by the app, library and test
 * builds so the Web Shell links to the same repository as the CLI.
 */
export const BRAND_DEFINE = {
  __BRAND_REPO_URL__: JSON.stringify(brand.identity.repoUrl),
};
