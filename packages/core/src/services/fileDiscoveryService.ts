/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitIgnoreFilter } from '../utils/gitIgnoreParser.js';
import type { O1CodeIgnoreFilter } from '../utils/o1codeIgnoreParser.js';
import { GitIgnoreParser } from '../utils/gitIgnoreParser.js';
import {
  formatO1CodeIgnoreFileNames,
  O1CodeIgnoreParser,
} from '../utils/o1codeIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'node:path';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectO1CodeIgnore?: boolean;
}

export interface FilterReport {
  filteredPaths: string[];
  gitIgnoredCount: number;
  o1codeIgnoredCount: number;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private o1codeIgnoreFilter: O1CodeIgnoreFilter | null = null;
  private projectRoot: string;

  constructor(
    projectRoot: string,
    private readonly customIgnoreFiles?: string[],
  ) {
    this.projectRoot = path.resolve(projectRoot);
    if (isGitRepository(this.projectRoot)) {
      this.gitIgnoreFilter = new GitIgnoreParser(this.projectRoot);
    }
    this.o1codeIgnoreFilter = new O1CodeIgnoreParser(
      this.projectRoot,
      customIgnoreFiles,
    );
  }

  /**
   * Filters a list of file paths based on git and AI ignore rules.
   */
  filterFiles(
    filePaths: string[],
    options: FilterFilesOptions = {
      respectGitIgnore: true,
      respectO1CodeIgnore: true,
    },
  ): string[] {
    return filePaths.filter((filePath) => {
      if (options.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
        return false;
      }
      if (
        options.respectO1CodeIgnore &&
        this.shouldO1CodeIgnoreFile(filePath)
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Filters a list of file paths based on git ignore rules and returns a report
   * with counts of ignored files.
   */
  filterFilesWithReport(
    filePaths: string[],
    opts: FilterFilesOptions = {
      respectGitIgnore: true,
      respectO1CodeIgnore: true,
    },
  ): FilterReport {
    const filteredPaths: string[] = [];
    let gitIgnoredCount = 0;
    let o1codeIgnoredCount = 0;

    for (const filePath of filePaths) {
      if (opts.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
        gitIgnoredCount++;
        continue;
      }

      if (opts.respectO1CodeIgnore && this.shouldO1CodeIgnoreFile(filePath)) {
        o1codeIgnoredCount++;
        continue;
      }

      filteredPaths.push(filePath);
    }

    return {
      filteredPaths,
      gitIgnoredCount,
      o1codeIgnoredCount,
    };
  }

  /**
   * Checks if a single file should be git-ignored
   */
  shouldGitIgnoreFile(filePath: string): boolean {
    if (this.gitIgnoreFilter) {
      return this.gitIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * Checks if a single file should be ignored by o1-code/agent ignore files.
   */
  shouldO1CodeIgnoreFile(filePath: string): boolean {
    if (this.o1codeIgnoreFilter) {
      return this.o1codeIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * Unified method to check if a file should be ignored based on filtering options.
   *
   * Convention: append a trailing `/` to `filePath` to signal that the path
   * refers to a directory. This allows directory-only ignore patterns (e.g.
   * `node_modules/`) to match correctly during traversal pruning. Both the
   * GitIgnoreParser and O1CodeIgnoreParser preserve the trailing slash through
   * their internal path normalization.
   */
  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    const {
      respectGitIgnore = true,
      respectO1CodeIgnore: respectO1CodeIgnore = true,
    } = options;

    if (respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
      return true;
    }
    if (respectO1CodeIgnore && this.shouldO1CodeIgnoreFile(filePath)) {
      return true;
    }
    return false;
  }

  /**
   * Returns loaded patterns from o1-code/agent ignore files.
   */
  getO1CodeIgnorePatterns(): string[] {
    return this.o1codeIgnoreFilter?.getPatterns() ?? [];
  }

  getO1CodeIgnoreFileDisplayForPath(filePath: string): string {
    return (
      this.o1codeIgnoreFilter?.getIgnoreFileNameForPath(filePath) ??
      this.getO1CodeIgnoreFileNamesDisplay()
    );
  }

  getO1CodeIgnoreFileNamesDisplay(): string {
    return formatO1CodeIgnoreFileNames(this.customIgnoreFiles);
  }
}
