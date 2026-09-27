/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import {
  AGENTS_MD_SKELETON,
  initCommand,
  O1CODE_SECTION_HEADING,
} from './initCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { type CommandContext } from './types.js';

// Mock the 'fs' module with both named and default exports to avoid breaking default import sites
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const existsSync = vi.fn();
  const writeFileSync = vi.fn();
  const readFileSync = vi.fn();
  return {
    ...actual,
    existsSync,
    writeFileSync,
    readFileSync,
    default: {
      ...(actual as unknown as Record<string, unknown>),
      existsSync,
      writeFileSync,
      readFileSync,
    },
  } as unknown as typeof import('fs');
});

describe('initCommand', () => {
  let mockContext: CommandContext;
  const targetDir = '/test/dir';
  const DEFAULT_CONTEXT_FILENAME = 'AGENTS.md';
  const memoryFilePath = path.join(targetDir, DEFAULT_CONTEXT_FILENAME);

  beforeEach(() => {
    // Create a fresh mock context for each test
    mockContext = createMockCommandContext({
      services: {
        config: {
          getTargetDir: () => targetDir,
        },
      },
    });
  });

  afterEach(() => {
    // Clear all mocks after each test
    vi.clearAllMocks();
  });

  it(`should not replace an existing ${DEFAULT_CONTEXT_FILENAME} and offer to append the o1-code section`, async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# Existing content');

    const result = await initCommand.action!(mockContext, '');

    expect(result).toEqual(
      expect.objectContaining({
        type: 'confirm_action',
        prompt: expect.anything(), // React element, not a string
        originalInvocation: expect.anything(),
      }),
    );
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it(`should ask the model to append only the o1-code section when confirmed`, async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# Existing content');
    mockContext.overwriteConfirmed = true;

    const result = await initCommand.action!(mockContext, '');

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ type: 'submit_prompt' }));
    const content = (result as { content: string }).content;
    expect(content).toContain('Do not rewrite it');
    expect(content).toContain(O1CODE_SECTION_HEADING);
    expect(content).toContain('Other agents may ignore this section.');
    expect(content).not.toContain('## Commands');
  });

  it(`should do nothing when ${DEFAULT_CONTEXT_FILENAME} already has the o1-code section`, async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '# Project\n\n## o1-code\n\nAlready here.\n',
    );

    const result = await initCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content:
        'AGENTS.md already exists and already has an `## o1-code` section. Nothing to do.',
    });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it(`should preserve ${DEFAULT_CONTEXT_FILENAME} if the confirmation prompt cannot be built`, async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# Existing content');
    vi.spyOn(React, 'createElement').mockImplementationOnce(() => {
      throw new Error('prompt unavailable');
    });

    const result = await initCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: `Unexpected error preparing ${DEFAULT_CONTEXT_FILENAME}: prompt unavailable`,
    });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it(`should create ${DEFAULT_CONTEXT_FILENAME} and submit a prompt if it does not exist`, async () => {
    // Arrange: Simulate that the file does not exist
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Act: Run the command's action
    const result = await initCommand.action!(mockContext, '');

    // Assert: Check that writeFileSync was called correctly
    expect(fs.writeFileSync).toHaveBeenCalledWith(memoryFilePath, '', 'utf8');

    // Assert: Check that an informational message was added to the UI
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'info',
        text: `Empty ${DEFAULT_CONTEXT_FILENAME} created. Now analyzing the project to populate it.`,
      },
      expect.any(Number),
    );

    // Assert: Check that the correct prompt is submitted
    expect(result).toEqual(
      expect.objectContaining({
        type: 'submit_prompt',
        content: expect.stringContaining(
          'You are O1-Code, an interactive CLI agent',
        ),
      }),
    );
  });

  it(`should proceed to initialize when ${DEFAULT_CONTEXT_FILENAME} exists but is empty`, async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('   \n  ');

    const result = await initCommand.action!(mockContext, '');

    expect(fs.writeFileSync).toHaveBeenCalledWith(memoryFilePath, '', 'utf8');
    expect(result).toEqual(
      expect.objectContaining({
        type: 'submit_prompt',
      }),
    );
  });

  it('should ask for the AGENTS.md skeleton with the o1-code section', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await initCommand.action!(mockContext, '');

    const content = (result as { content: string }).content;
    expect(content).toContain(AGENTS_MD_SKELETON);
    for (const heading of [
      '## Commands',
      '## Conventions',
      O1CODE_SECTION_HEADING,
    ]) {
      expect(AGENTS_MD_SKELETON).toContain(`\n${heading}\n`);
    }
    expect(AGENTS_MD_SKELETON).toContain(
      'Instructions for o1-code only. Other agents may ignore this section.',
    );
    expect(content).toContain(
      'Write the complete content to the `AGENTS.md` file.',
    );
  });

  it('should return an error if config is not available', async () => {
    // Arrange: Create a context without config
    const noConfigContext = createMockCommandContext();
    if (noConfigContext.services) {
      noConfigContext.services.config = null;
    }

    // Act: Run the command's action
    const result = await initCommand.action!(noConfigContext, '');

    // Assert: Check for the correct error message
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration not available.',
    });
  });
});
