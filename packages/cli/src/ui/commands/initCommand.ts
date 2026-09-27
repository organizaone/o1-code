/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { DEFAULT_CONTEXT_FILENAME } from '@organizaone/o1-code-core';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import {
  detectProjectCommands,
  formatDetectedCommands,
} from './init-project-commands.js';

/** Heading of the section that holds instructions for o1-code only. */
export const O1CODE_SECTION_HEADING = '## o1-code';

/** The `## o1-code` section /init writes, with placeholders to fill. */
export const O1CODE_SECTION_TEMPLATE = `${O1CODE_SECTION_HEADING}

Instructions for o1-code only. Other agents may ignore this section.

- Approval: <what o1-code may do without asking in this project, and what always needs confirmation>. The default approval mode is \`tools.approvalMode\` in \`.o1-code/settings.json\`.
- Project skills live in \`.o1-code/skills/\`; hooks are configured under \`hooks\` in \`.o1-code/settings.json\`.`;

/** The skeleton of the AGENTS.md file /init generates. */
export const AGENTS_MD_SKELETON = `# <Project name>

<What the project is, its main technologies and its architecture, in one or two short paragraphs.>

## Commands

\`\`\`bash
<build>
<lint>
<typecheck>
<test one file>
<full test suite>
\`\`\`

## Conventions

- <Code style, naming, test placement, commit and review practices that the codebase actually follows.>

${O1CODE_SECTION_TEMPLATE}
`;

function hasO1CodeSection(content: string): boolean {
  return /^## o1-code[ \t]*$/m.test(content);
}

function buildGeneratePrompt(
  contextFileName: string,
  targetDir: string,
): string {
  const commands = formatDetectedCommands(detectProjectCommands(targetDir));
  return `
You are O1-Code, an interactive CLI agent. Analyze the current directory and write a ${contextFileName} file: the project context file that o1-code and other coding agents read before they work here. Write it in plain English.

**Analysis Process:**

1.  **Initial Exploration:**
    *   Start by listing the files and directories to get a high-level overview of the structure.
    *   Read the README file (e.g., \`README.md\`, \`README.txt\`) if it exists. This is often the best place to start.

2.  **Iterative Deep Dive (up to 10 files):**
    *   Based on your initial findings, select a few files that seem most important (e.g., configuration files, main source files, documentation).
    *   Read them. As you learn more, refine your understanding and decide which files to read next. You don't need to decide all 10 files at once. Let your discoveries guide your exploration.

3.  **Identify Project Type:**
    *   **Code Project:** Look for clues like \`package.json\`, \`requirements.txt\`, \`pom.xml\`, \`go.mod\`, \`Cargo.toml\`, \`build.gradle\`, \`Makefile\`, or a \`src\` directory. If you find them, this is likely a software project.
    *   **Non-Code Project:** If you don't find code-related files, this might be a directory for documentation, research papers, notes, or something else.

**Detected Commands:**

${commands}

**${contextFileName} Content:**

Follow this skeleton. Replace every \`<...>\` placeholder with what you learned and keep the headings.

\`\`\`markdown
${AGENTS_MD_SKELETON}\`\`\`

*   **Overview:** the paragraph under the title. For a non-code project, describe what the directory holds and how it is meant to be used, and list its key files.
*   **\`## Commands\`:** the commands to build, lint, typecheck, run the tests of one file, and run the full suite. Use the detected commands above when they check out. Drop a line that does not apply to the project; if a command should exist but you cannot find it, write a \`TODO\` line instead of inventing one. For a non-code project, list how the contents are used instead.
*   **\`## Conventions\`:** only conventions the codebase actually follows (style, naming, where tests live, commit practices). Keep it short.
*   **\`${O1CODE_SECTION_HEADING}\`:** keep the note that other agents may ignore the section. Fill the approval line from what the project needs. Keep the skills and hooks pointer as written.

**Final Output:**

Write the complete content to the \`${contextFileName}\` file. The output must be well-formatted Markdown.
`;
}

function buildAppendPrompt(contextFileName: string): string {
  return `
You are O1-Code, an interactive CLI agent. The project already has a ${contextFileName} file. Do not rewrite it and do not change its existing content.

Read \`${contextFileName}\`, then append the section below at its end, separated from the previous content by a blank line. Replace the \`<...>\` placeholder with what fits this project. Keep the note that other agents may ignore the section. Write in plain English.

\`\`\`markdown
${O1CODE_SECTION_TEMPLATE}
\`\`\`
`;
}

export const initCommand: SlashCommand = {
  name: 'init',
  get description() {
    return t('Analyzes the project and creates a tailored AGENTS.md file.');
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ['interactive', 'non_interactive', 'acp'] as const,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Configuration not available.'),
      };
    }
    const targetDir = context.services.config.getTargetDir();
    const contextFileName = DEFAULT_CONTEXT_FILENAME;
    const contextFilePath = path.join(targetDir, contextFileName);

    try {
      if (fs.existsSync(contextFilePath)) {
        // An empty (or whitespace-only) file is treated as missing.
        let existing = '';
        try {
          existing = fs.readFileSync(contextFilePath, 'utf8');
        } catch {
          // If we fail to read, conservatively proceed to (re)create the file
        }
        if (existing && existing.trim().length > 0) {
          // An existing AGENTS.md belongs to the project and possibly to other
          // agents: never replace it, only offer to add the o1-code section.
          if (hasO1CodeSection(existing)) {
            return {
              type: 'message',
              messageType: 'info',
              content: `${contextFileName} already exists and already has an \`${O1CODE_SECTION_HEADING}\` section. Nothing to do.`,
            };
          }
          if (!context.overwriteConfirmed) {
            const [{ Text }, { default: React }] = await Promise.all([
              import('ink'),
              import('react'),
            ]);
            return {
              type: 'confirm_action',
              prompt: React.createElement(
                Text,
                null,
                `A ${contextFileName} file already exists in this directory, and /init will not replace it. Do you want to append an \`${O1CODE_SECTION_HEADING}\` section to it?`,
              ),
              originalInvocation: {
                raw: context.invocation?.raw || '/init',
              },
            };
          }
          return {
            type: 'submit_prompt',
            content: buildAppendPrompt(contextFileName),
          };
        }
      }

      // Ensure an empty context file exists before prompting the model to populate it
      try {
        fs.writeFileSync(contextFilePath, '', 'utf8');
        context.ui.addItem(
          {
            type: 'info',
            text: `Empty ${contextFileName} created. Now analyzing the project to populate it.`,
          },
          Date.now(),
        );
      } catch (err) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to create ${contextFileName}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Unexpected error preparing ${contextFileName}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      type: 'submit_prompt',
      content: buildGeneratePrompt(contextFileName, targetDir),
    };
  },
};
