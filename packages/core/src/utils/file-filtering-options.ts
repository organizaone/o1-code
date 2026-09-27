/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_O1CODE_CUSTOM_IGNORE_FILE_NAMES } from './o1codeIgnoreParser.js';

export interface FileFilteringOptions {
  respectGitIgnore: boolean;
  respectO1CodeIgnore: boolean;
  customIgnoreFiles?: string[];
}

// For memory files
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: false,
  respectO1CodeIgnore: true,
  customIgnoreFiles: [...DEFAULT_O1CODE_CUSTOM_IGNORE_FILE_NAMES],
};

// For all other files
export const DEFAULT_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: true,
  respectO1CodeIgnore: true,
  customIgnoreFiles: [...DEFAULT_O1CODE_CUSTOM_IGNORE_FILE_NAMES],
};
