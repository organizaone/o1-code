/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadServerHierarchicalMemory,
  formatContextFileDisplayPath,
} from './memoryDiscovery.js';
import {
  setMemoryFilename,
  getAllMemoryFilenames,
  DEFAULT_CONTEXT_FILENAME,
} from '../utils/memory-constants.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { O1CODE_DIR } from '../utils/paths.js';
import type { InstructionsLoadedNotification } from './memoryDiscovery.js';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../utils/debugLogger.js', () => ({
  createDebugLogger: () => mockLogger,
}));

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(),
  };
});

describe('loadServerHierarchicalMemory', () => {
  const DEFAULT_FOLDER_TRUST = true;
  let testRootDir: string;
  let cwd: string;
  let projectRoot: string;
  let homedir: string;

  async function createEmptyDir(fullPath: string) {
    await fsPromises.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  async function createTestFile(fullPath: string, fileContents: string) {
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, fileContents);
    return path.resolve(testRootDir, fullPath);
  }

  beforeEach(async () => {
    testRootDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'folder-structure-test-'),
    );

    vi.resetAllMocks();
    // Set environment variables to indicate test environment
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VITEST', 'true');

    projectRoot = await createEmptyDir(path.join(testRootDir, 'project'));
    cwd = await createEmptyDir(path.join(projectRoot, 'src'));
    homedir = await createEmptyDir(path.join(testRootDir, 'userhome'));
    vi.mocked(os.homedir).mockReturnValue(homedir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Some tests set this to a different value.
    setMemoryFilename(DEFAULT_CONTEXT_FILENAME);
    // Clean up the temporary directory to prevent resource leaks.
    // Use maxRetries option for robust cleanup without race conditions
    await fsPromises.rm(testRootDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 10,
    });
  });

  describe('when untrusted', () => {
    it('does not load context files from untrusted workspaces', async () => {
      await createTestFile(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        'Project root memory',
      );
      await createTestFile(
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
        'Src directory memory',
      );
      const { fileCount } = await loadServerHierarchicalMemory(
        cwd,
        [],
        new FileDiscoveryService(projectRoot),
        [],
        false, // untrusted
      );

      expect(fileCount).toEqual(0);
    });

    it('loads context from outside the untrusted workspace', async () => {
      await createTestFile(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        'Project root memory',
      ); // Untrusted
      await createTestFile(
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
        'Src directory memory',
      ); // Untrusted

      const filepath = path.join(homedir, O1CODE_DIR, DEFAULT_CONTEXT_FILENAME);
      await createTestFile(filepath, 'default context content'); // In user home dir (outside untrusted space).
      const { fileCount, memoryContent } = await loadServerHierarchicalMemory(
        cwd,
        [],
        new FileDiscoveryService(projectRoot),
        [],
        false, // untrusted
      );

      expect(fileCount).toEqual(1);
      expect(memoryContent).toContain(path.relative(cwd, filepath).toString());
    });
  });

  it('should return empty memory and count if no context files are found', async () => {
    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: '',
      fileCount: 0,
      contextFilePaths: [],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should skip implicit global, project, and rule discovery in explicit-only mode', async () => {
    await createTestFile(
      path.join(homedir, O1CODE_DIR, DEFAULT_CONTEXT_FILENAME),
      'global context',
    );
    await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'project context',
    );
    await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'cwd context',
    );
    await createTestFile(
      path.join(projectRoot, O1CODE_DIR, 'rules', 'baseline.md'),
      'project rule',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      { explicitOnly: true },
    );

    expect(result).toEqual({
      memoryContent: '',
      fileCount: 0,
      contextFilePaths: [],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should still load context from explicit include directories in explicit-only mode', async () => {
    const extraDir = await createEmptyDir(path.join(testRootDir, 'explicit'));
    const explicitContextFile = await createTestFile(
      path.join(extraDir, DEFAULT_CONTEXT_FILENAME),
      'explicit context',
    );
    await createTestFile(
      path.join(homedir, O1CODE_DIR, DEFAULT_CONTEXT_FILENAME),
      'global context',
    );
    await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'project context',
    );
    await createTestFile(
      path.join(projectRoot, O1CODE_DIR, 'rules', 'baseline.md'),
      'project rule',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [extraDir],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      { explicitOnly: true },
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, explicitContextFile)} ---\nexplicit context\n--- End of Context from: ${path.relative(cwd, explicitContextFile)} ---`,
      fileCount: 1,
      contextFilePaths: [path.relative(cwd, explicitContextFile)],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should load only the global context file if present and others are not (default filename)', async () => {
    const defaultContextFile = await createTestFile(
      path.join(homedir, O1CODE_DIR, DEFAULT_CONTEXT_FILENAME),
      'default context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, defaultContextFile)} ---\ndefault context content\n--- End of Context from: ${path.relative(cwd, defaultContextFile)} ---`,
      fileCount: 1,
      contextFilePaths: [
        path.join('~', path.relative(homedir, defaultContextFile)),
      ],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should load only the global custom context file if present and filename is changed', async () => {
    const customFilename = 'CUSTOM_AGENTS.md';
    setMemoryFilename(customFilename);

    const customContextFile = await createTestFile(
      path.join(homedir, O1CODE_DIR, customFilename),
      'custom context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, customContextFile)} ---\ncustom context content\n--- End of Context from: ${path.relative(cwd, customContextFile)} ---`,
      fileCount: 1,
      contextFilePaths: [
        path.join('~', path.relative(homedir, customContextFile)),
      ],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should load context files by upward traversal with custom filename', async () => {
    const customFilename = 'PROJECT_CONTEXT.md';
    setMemoryFilename(customFilename);

    const projectContextFile = await createTestFile(
      path.join(projectRoot, customFilename),
      'project context content',
    );
    const cwdContextFile = await createTestFile(
      path.join(cwd, customFilename),
      'cwd context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, projectContextFile)} ---\nproject context content\n--- End of Context from: ${path.relative(cwd, projectContextFile)} ---\n\n--- Context from: ${path.relative(cwd, cwdContextFile)} ---\ncwd context content\n--- End of Context from: ${path.relative(cwd, cwdContextFile)} ---`,
      fileCount: 2,
      contextFilePaths: [
        path.relative(cwd, projectContextFile),
        path.relative(cwd, cwdContextFile),
      ],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should load context files from CWD with custom filename (not subdirectories)', async () => {
    const customFilename = 'LOCAL_CONTEXT.md';
    setMemoryFilename(customFilename);

    await createTestFile(
      path.join(cwd, 'subdir', customFilename),
      'Subdir custom memory',
    );
    await createTestFile(path.join(cwd, customFilename), 'CWD custom memory');

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    // Only upward traversal is performed, subdirectory files are not loaded
    expect(result).toEqual({
      memoryContent: `--- Context from: ${customFilename} ---\nCWD custom memory\n--- End of Context from: ${customFilename} ---`,
      fileCount: 1,
      contextFilePaths: [customFilename],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should load context files by upward traversal with default filename', async () => {
    const projectRootMemoryFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'Project root memory',
    );
    const srcMemoryFile = await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'Src directory memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, projectRootMemoryFile)} ---\nProject root memory\n--- End of Context from: ${path.relative(cwd, projectRootMemoryFile)} ---\n\n--- Context from: ${path.relative(cwd, srcMemoryFile)} ---\nSrc directory memory\n--- End of Context from: ${path.relative(cwd, srcMemoryFile)} ---`,
      fileCount: 2,
      contextFilePaths: [
        path.relative(cwd, projectRootMemoryFile),
        path.relative(cwd, srcMemoryFile),
      ],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should only load context files from CWD, not subdirectories', async () => {
    await createTestFile(
      path.join(cwd, 'subdir', DEFAULT_CONTEXT_FILENAME),
      'Subdir memory',
    );
    await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'CWD memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    // Subdirectory files are not loaded, only CWD and upward
    expect(result).toEqual({
      memoryContent: `--- Context from: ${DEFAULT_CONTEXT_FILENAME} ---\nCWD memory\n--- End of Context from: ${DEFAULT_CONTEXT_FILENAME} ---`,
      fileCount: 1,
      contextFilePaths: [DEFAULT_CONTEXT_FILENAME],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should load and correctly order global and upward context files', async () => {
    const defaultContextFile = await createTestFile(
      path.join(homedir, O1CODE_DIR, DEFAULT_CONTEXT_FILENAME),
      'default context content',
    );
    const rootMemoryFile = await createTestFile(
      path.join(testRootDir, DEFAULT_CONTEXT_FILENAME),
      'Project parent memory',
    );
    const projectRootMemoryFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'Project root memory',
    );
    const cwdMemoryFile = await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'CWD memory',
    );
    await createTestFile(
      path.join(cwd, 'sub', DEFAULT_CONTEXT_FILENAME),
      'Subdir memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    // Subdirectory files are not loaded, only global and upward from CWD
    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, defaultContextFile)} ---\ndefault context content\n--- End of Context from: ${path.relative(cwd, defaultContextFile)} ---\n\n--- Context from: ${path.relative(cwd, rootMemoryFile)} ---\nProject parent memory\n--- End of Context from: ${path.relative(cwd, rootMemoryFile)} ---\n\n--- Context from: ${path.relative(cwd, projectRootMemoryFile)} ---\nProject root memory\n--- End of Context from: ${path.relative(cwd, projectRootMemoryFile)} ---\n\n--- Context from: ${path.relative(cwd, cwdMemoryFile)} ---\nCWD memory\n--- End of Context from: ${path.relative(cwd, cwdMemoryFile)} ---`,
      fileCount: 4,
      contextFilePaths: [
        path.join('~', path.relative(homedir, defaultContextFile)),
        path.relative(cwd, rootMemoryFile),
        path.relative(cwd, projectRootMemoryFile),
        path.relative(cwd, cwdMemoryFile),
      ],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should load extension context file paths', async () => {
    const extensionFilePath = await createTestFile(
      path.join(testRootDir, 'extensions/ext1/AGENTS.md'),
      'Extension memory content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [extensionFilePath],
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, extensionFilePath)} ---\nExtension memory content\n--- End of Context from: ${path.relative(cwd, extensionFilePath)} ---`,
      fileCount: 1,
      contextFilePaths: [path.relative(cwd, extensionFilePath)],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('announces extension context files with custom basenames', async () => {
    const extensionFilePath = await createTestFile(
      path.join(testRootDir, 'extensions/ext1/system-prompt.md'),
      'Extension custom context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [extensionFilePath],
      DEFAULT_FOLDER_TRUST,
    );

    // The file is attached by concatenateInstructions even though its
    // basename is not a configured memory filename, so it must be announced.
    expect(result.fileCount).toBe(0);
    expect(result.memoryContent).toContain('Extension custom context content');
    expect(result.contextFilePaths).toEqual([
      path.relative(cwd, extensionFilePath),
    ]);
  });

  it('counts but does not announce whitespace-only context files', async () => {
    await createTestFile(path.join(cwd, DEFAULT_CONTEXT_FILENAME), '   \n\t ');

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    // The file is discovered, but its blank content never reaches the system
    // prompt, so it must not be announced as attached.
    expect(result.fileCount).toBe(1);
    expect(result.memoryContent).toBe('');
    expect(result.contextFilePaths).toEqual([]);
  });

  it('notifies when startup instruction files are loaded', async () => {
    const globalFile = await createTestFile(
      path.join(homedir, O1CODE_DIR, DEFAULT_CONTEXT_FILENAME),
      'global context',
    );
    const projectFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'project context',
    );
    const extensionFile = await createTestFile(
      path.join(testRootDir, 'extensions/ext1/AGENTS.md'),
      'extension context',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [extensionFile],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    expect(notifications).toEqual(
      expect.arrayContaining([
        {
          filePath: globalFile,
          memoryType: 'user',
          loadReason: 'session_start',
        },
        {
          filePath: projectFile,
          memoryType: 'project',
          loadReason: 'session_start',
        },
        {
          filePath: extensionFile,
          memoryType: 'extension',
          loadReason: 'session_start',
        },
      ]),
    );
  });

  it('uses refresh load reason for explicit memory refreshes', async () => {
    const projectFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'project context',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        loadReason: 'refresh',
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    expect(notifications).toEqual(
      expect.arrayContaining([
        {
          filePath: projectFile,
          memoryType: 'project',
          loadReason: 'refresh',
        },
      ]),
    );
  });

  it('classifies home-directory project files as project memory', async () => {
    await createEmptyDir(path.join(homedir, '.git'));
    const globalFile = await createTestFile(
      path.join(homedir, O1CODE_DIR, DEFAULT_CONTEXT_FILENAME),
      'global context',
    );
    const projectFile = await createTestFile(
      path.join(homedir, DEFAULT_CONTEXT_FILENAME),
      'home project context',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      homedir,
      [],
      new FileDiscoveryService(homedir),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    expect(notifications).toContainEqual({
      filePath: globalFile,
      memoryType: 'user',
      loadReason: 'session_start',
    });
    expect(notifications).toContainEqual({
      filePath: projectFile,
      memoryType: 'project',
      loadReason: 'session_start',
    });
  });

  it('notifies when imported instruction files are loaded', async () => {
    await createEmptyDir(path.join(projectRoot, '.git'));
    const importedFile = await createTestFile(
      path.join(projectRoot, 'included.md'),
      'included content',
    );
    const projectFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'project context @./included.md',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: projectFile,
          memoryType: 'project',
          loadReason: 'session_start',
        }),
        expect.objectContaining({
          filePath: importedFile,
          memoryType: 'project',
          loadReason: 'include',
          triggerFilePath: projectFile,
          parentFilePath: projectFile,
        }),
      ]),
    );
    expect(
      notifications.findIndex((item) => item.filePath === projectFile),
    ).toBeGreaterThan(
      notifications.findIndex((item) => item.filePath === importedFile),
    );
  });

  it('inherits memory type from the importing instruction file', async () => {
    const importedFile = await createTestFile(
      path.join(homedir, 'rules', 'personal.md'),
      'personal included content',
    );
    const userFile = await createTestFile(
      path.join(homedir, DEFAULT_CONTEXT_FILENAME),
      'user context @./rules/personal.md',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      homedir,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: userFile,
          memoryType: 'user',
          loadReason: 'session_start',
        }),
        expect.objectContaining({
          filePath: importedFile,
          memoryType: 'user',
          loadReason: 'include',
          triggerFilePath: userFile,
          parentFilePath: userFile,
        }),
      ]),
    );
  });

  it('inherits memory type from the root instruction file for nested imports', async () => {
    const nestedFile = await createTestFile(
      path.join(homedir, 'rules', 'nested.md'),
      'nested included content',
    );
    const importedFile = await createTestFile(
      path.join(homedir, 'rules', 'personal.md'),
      'personal included content @./nested.md',
    );
    const userFile = await createTestFile(
      path.join(homedir, DEFAULT_CONTEXT_FILENAME),
      'user context @./rules/personal.md',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      homedir,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: nestedFile,
          memoryType: 'user',
          loadReason: 'include',
          triggerFilePath: userFile,
          parentFilePath: importedFile,
        }),
      ]),
    );
  });

  it('reports the root trigger and immediate parent for nested imports', async () => {
    await createEmptyDir(path.join(projectRoot, '.git'));
    const grandchildFile = await createTestFile(
      path.join(projectRoot, 'grandchild.md'),
      'grandchild content',
    );
    const childFile = await createTestFile(
      path.join(projectRoot, 'child.md'),
      'child content @./grandchild.md',
    );
    const projectFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'project context @./child.md',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    // The grandchild is imported by child.md, but the chain was started by the
    // top-level discovered AGENTS.md, so trigger != parent at depth > 1.
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: grandchildFile,
          loadReason: 'include',
          triggerFilePath: projectFile,
          parentFilePath: childFile,
        }),
      ]),
    );
  });

  it('classifies extension-owned imports as extension memory', async () => {
    const extensionDir = path.join(testRootDir, 'extensions/ext1');
    const importedFile = await createTestFile(
      path.join(extensionDir, 'included.md'),
      'extension included content',
    );
    const extensionFile = await createTestFile(
      path.join(extensionDir, DEFAULT_CONTEXT_FILENAME),
      'extension context @./included.md',
    );
    const notifications: InstructionsLoadedNotification[] = [];

    await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [extensionFile],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: (notification) => {
          notifications.push(notification);
        },
      },
    );

    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: importedFile,
          memoryType: 'extension',
          loadReason: 'include',
          triggerFilePath: extensionFile,
          parentFilePath: extensionFile,
        }),
      ]),
    );
  });

  it('still loads memory when instruction load notification fails', async () => {
    const projectFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'project context',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
      'tree',
      [],
      {
        onInstructionsLoaded: () => {
          throw new Error('hook failed');
        },
      },
    );

    expect(result.fileCount).toBe(1);
    expect(result.memoryContent).toContain(
      `--- Context from: ${path.relative(cwd, projectFile)} ---\nproject context`,
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      `InstructionsLoaded notification failed for ${projectFile}: hook failed`,
    );
  });

  it('should load memory from included directories', async () => {
    const includedDir = await createEmptyDir(
      path.join(testRootDir, 'included'),
    );
    const includedFile = await createTestFile(
      path.join(includedDir, DEFAULT_CONTEXT_FILENAME),
      'included directory memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [includedDir],
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, includedFile)} ---\nincluded directory memory\n--- End of Context from: ${path.relative(cwd, includedFile)} ---`,
      fileCount: 1,
      contextFilePaths: [path.relative(cwd, includedFile)],
      ruleCount: 0,
      conditionalRules: [],
      projectRoot: expect.any(String),
    });
  });

  it('should handle multiple directories and files in parallel correctly', async () => {
    // Create multiple test directories with AGENTS.md files
    const numDirs = 5;
    const createdFiles: string[] = [];

    for (let i = 0; i < numDirs; i++) {
      const dirPath = await createEmptyDir(
        path.join(testRootDir, `project-${i}`),
      );
      const filePath = await createTestFile(
        path.join(dirPath, DEFAULT_CONTEXT_FILENAME),
        `Content from project ${i}`,
      );
      createdFiles.push(filePath);
    }

    // Load memory from all directories
    const result = await loadServerHierarchicalMemory(
      cwd,
      createdFiles.map((f) => path.dirname(f)),
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    // Should have loaded all files
    expect(result.fileCount).toBe(numDirs);

    // Content should include all project contents
    for (let i = 0; i < numDirs; i++) {
      expect(result.memoryContent).toContain(`Content from project ${i}`);
    }
  });

  it('should preserve order and prevent duplicates when processing multiple directories', async () => {
    // Create overlapping directory structure
    const parentDir = await createEmptyDir(path.join(testRootDir, 'parent'));
    const childDir = await createEmptyDir(path.join(parentDir, 'child'));

    await createTestFile(
      path.join(parentDir, DEFAULT_CONTEXT_FILENAME),
      'Parent content',
    );
    await createTestFile(
      path.join(childDir, DEFAULT_CONTEXT_FILENAME),
      'Child content',
    );

    // Include both parent and child directories
    const result = await loadServerHierarchicalMemory(
      parentDir,
      [childDir, parentDir], // Deliberately include duplicates
      new FileDiscoveryService(projectRoot),
      [],
      DEFAULT_FOLDER_TRUST,
    );

    // Should have both files without duplicates
    expect(result.fileCount).toBe(2);
    expect(result.memoryContent).toContain('Parent content');
    expect(result.memoryContent).toContain('Child content');

    // Check that files are not duplicated
    const parentOccurrences = (
      result.memoryContent.match(/Parent content/g) || []
    ).length;
    const childOccurrences = (
      result.memoryContent.match(/Child content/g) || []
    ).length;
    expect(parentOccurrences).toBe(1);
    expect(childOccurrences).toBe(1);
  });

  describe('context file names', () => {
    beforeEach(async () => {
      await createEmptyDir(path.join(projectRoot, '.git'));
    });

    it('discovers AGENTS.md only, from the project and the global directory', async () => {
      await createTestFile(
        path.join(projectRoot, 'AGENTS.md'),
        'shared agents instructions',
      );
      await createTestFile(
        path.join(homedir, O1CODE_DIR, 'AGENTS.md'),
        'global agents instructions',
      );
      await createTestFile(
        path.join(projectRoot, 'CONTEXT.md'),
        'unconfigured file',
      );
      await createTestFile(
        path.join(projectRoot, O1CODE_DIR, 'CONTEXT.local.md'),
        'unconfigured local file',
      );

      const result = await loadServerHierarchicalMemory(
        cwd,
        [],
        new FileDiscoveryService(projectRoot),
        [],
        DEFAULT_FOLDER_TRUST,
      );

      expect(DEFAULT_CONTEXT_FILENAME).toBe('AGENTS.md');
      expect(getAllMemoryFilenames()).toEqual(['AGENTS.md']);
      expect(result.fileCount).toBe(2);
      expect(result.memoryContent).toContain('shared agents instructions');
      expect(result.memoryContent).toContain('global agents instructions');
      expect(result.memoryContent).not.toContain('unconfigured');
    });
  });

  describe('symlink aliases of the same physical file', () => {
    it('loads a context file once when a workspace-level file is a symlink to an ancestor file', async () => {
      await createTestFile(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        'shared symlink marker content',
      );
      await fsPromises.symlink(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      );

      const result = await loadServerHierarchicalMemory(
        cwd,
        [],
        new FileDiscoveryService(projectRoot),
        [],
        DEFAULT_FOLDER_TRUST,
      );

      expect(result.fileCount).toBe(1);
      expect(result.contextFilePaths).toHaveLength(1);
      const occurrences = (
        result.memoryContent.match(/shared symlink marker content/g) ?? []
      ).length;
      expect(occurrences).toBe(1);
    });

    it('keeps two context blocks for distinct physical files with identical content', async () => {
      await createTestFile(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        'identical content in two physical files',
      );
      await createTestFile(
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
        'identical content in two physical files',
      );

      const result = await loadServerHierarchicalMemory(
        cwd,
        [],
        new FileDiscoveryService(projectRoot),
        [],
        DEFAULT_FOLDER_TRUST,
      );

      expect(result.fileCount).toBe(2);
      const occurrences = (
        result.memoryContent.match(
          /identical content in two physical files/g,
        ) ?? []
      ).length;
      expect(occurrences).toBe(2);
    });

    it('still loads through a symlink when the target is outside the project-root scan boundary', async () => {
      // A .git marker makes cwd the project root, so the upward scan stops
      // at its parent and never reaches testRootDir. The outside file can
      // then only be loaded through the workspace symlink.
      await createEmptyDir(path.join(cwd, '.git'));
      await createTestFile(
        path.join(testRootDir, DEFAULT_CONTEXT_FILENAME),
        'outside scan boundary marker',
      );
      await fsPromises.symlink(
        path.join(testRootDir, DEFAULT_CONTEXT_FILENAME),
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      );

      const result = await loadServerHierarchicalMemory(
        cwd,
        [],
        new FileDiscoveryService(cwd),
        [],
        DEFAULT_FOLDER_TRUST,
      );

      expect(result.fileCount).toBe(1);
      expect(result.memoryContent).toContain('outside scan boundary marker');
    });

    it('does not duplicate relative @imports of a file loaded through a symlink alias', async () => {
      // The import target resolves from both directories, so while the parent
      // file is loaded twice (once per lexical alias) its @import content is
      // attached twice as well.
      await createTestFile(
        path.join(projectRoot, 'shared.md'),
        'imported-once marker',
      );
      await createTestFile(path.join(cwd, 'shared.md'), 'imported-once marker');
      await createTestFile(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        '@shared.md',
      );
      await fsPromises.symlink(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      );

      const result = await loadServerHierarchicalMemory(
        cwd,
        [],
        new FileDiscoveryService(projectRoot),
        [],
        DEFAULT_FOLDER_TRUST,
      );

      const occurrences = (
        result.memoryContent.match(/imported-once marker/g) ?? []
      ).length;
      expect(occurrences).toBe(1);
    });
  });
});

describe('formatContextFileDisplayPath', () => {
  // Fixtures share one volume (os.tmpdir()) so `..` relationships hold on
  // every platform; POSIX literals like '/proj' behave differently under
  // path.win32 and would fail the Windows merge-queue gate.
  const root = os.tmpdir();
  const proj = path.join(root, 'proj');
  const other = path.join(root, 'other');
  const home = path.join(root, 'u');
  const siblingHome = path.join(root, 'u2');

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(home);
  });

  it('returns CWD-relative paths for files inside the CWD tree', () => {
    expect(
      formatContextFileDisplayPath(path.join(proj, 'AGENTS.md'), proj),
    ).toBe('AGENTS.md');
    expect(
      formatContextFileDisplayPath(path.join(proj, 'sub', 'AGENTS.md'), proj),
    ).toBe(path.join('sub', 'AGENTS.md'));
  });

  it('shortens home-dir files outside the CWD tree to ~ paths', () => {
    expect(
      formatContextFileDisplayPath(
        path.join(home, '.o1-code', 'AGENTS.md'),
        proj,
      ),
    ).toBe(path.join('~', '.o1-code', 'AGENTS.md'));
  });

  it('prefers CWD-relative paths for projects under the home dir', () => {
    const projUnderHome = path.join(home, 'proj');
    expect(
      formatContextFileDisplayPath(
        path.join(projUnderHome, 'AGENTS.md'),
        projUnderHome,
      ),
    ).toBe('AGENTS.md');
  });

  it('keeps CWD-relative paths for directories with leading-dot names', () => {
    // '..cfg' merely starts with two dots; it is not a real '..' segment, so
    // the file is inside the CWD tree and must not be tildeified.
    const projUnderHome = path.join(home, 'proj2');
    expect(
      formatContextFileDisplayPath(
        path.join(projUnderHome, '..cfg', 'AGENTS.md'),
        projUnderHome,
      ),
    ).toBe(path.join('..cfg', 'AGENTS.md'));
  });

  it('does not tildeify sibling directories sharing the home prefix', () => {
    const file = path.join(siblingHome, 'proj', 'AGENTS.md');
    expect(formatContextFileDisplayPath(file, proj)).toBe(
      path.relative(proj, file),
    );
  });

  it('keeps relative paths for files outside both CWD and home', () => {
    const file = path.join(other, 'AGENTS.md');
    expect(formatContextFileDisplayPath(file, proj)).toBe(
      path.relative(proj, file),
    );
  });

  it('passes through non-absolute paths unchanged', () => {
    expect(formatContextFileDisplayPath('AGENTS.md', proj)).toBe('AGENTS.md');
  });

  it('strips ANSI escapes and control characters from display paths', () => {
    // stripVTControlCharacters removes the ESC[2J sequence but leaves the
    // bare BEL after it, which the control-character pass must remove. (A
    // letter between the two was swallowed by Node 22's matcher and kept by
    // Node 25+, so the fixture has none.)
    expect(
      formatContextFileDisplayPath(
        path.join(proj, 'a\u001b[2J\u0007.md'),
        proj,
      ),
    ).toBe('a.md');
  });
});
