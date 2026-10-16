/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import {
  ToolConfirmationOutcome,
  type ToolAskUserQuestionConfirmationDetails,
} from '@organizaone/o1-code-core/tools/tools.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../../types.js';
import { ToolGroupMessage } from './ToolGroupMessage.js';

const wait = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
const config = {
  getIdeMode: () => false,
  isTrustedFolder: () => true,
} as unknown as Config;

describe('tool group question layout', () => {
  it.each([
    { source: 'direct', fullDetail: false, width: 40 },
    { source: 'direct', fullDetail: true, width: 80 },
    { source: 'subagent', fullDetail: false, width: 80 },
    { source: 'subagent', fullDetail: true, width: 40 },
  ])(
    'keeps $source questions bounded at $width columns with fullDetail=$fullDetail',
    async ({ source, fullDetail, width }) => {
      const onConfirm = vi.fn();
      const confirmation: ToolAskUserQuestionConfirmationDetails = {
        type: 'ask_user_question',
        title: 'Question',
        questions: [
          {
            header: 'Direction',
            question: Array.from(
              { length: 10 },
              (_, index) => `Question line ${index + 1}`,
            ).join('\n'),
            options: [{ label: 'Continue', description: 'Keep going' }],
            multiSelect: false,
          },
        ],
        onConfirm,
      };
      const tool: IndividualToolCallDisplay = {
        callId: 'question-tool',
        name: source === 'direct' ? 'ask_user_question' : 'task',
        description: 'Ask for direction',
        status:
          source === 'direct'
            ? ToolCallStatus.Confirming
            : ToolCallStatus.Executing,
        renderOutputAsMarkdown: false,
        resultDisplay: undefined,
        confirmationDetails: undefined,
      };
      if (source === 'direct') {
        tool.confirmationDetails = confirmation;
      } else {
        tool.resultDisplay = {
          type: 'task_execution',
          subagentName: 'researcher',
          taskDescription: 'Research',
          taskPrompt: 'Research',
          status: 'running',
          pendingConfirmation: confirmation,
        };
      }
      const { stdin, lastFrame, unmount } = renderWithProviders(
        <Box width={width} flexDirection="column">
          <ToolGroupMessage
            groupId={1}
            toolCalls={[tool]}
            availableTerminalHeight={14}
            contentWidth={width}
            fullDetail={fullDetail}
            isPending
            isFocused
          />
        </Box>,
        { config },
      );
      try {
        await wait();
        const seen = new Set<string>();
        for (let page = 0; page < 14; page++) {
          const frame = stripAnsi(lastFrame() ?? '');
          expect(frame.split('\n').length).toBeLessThanOrEqual(14);
          for (const line of frame.split('\n'))
            expect(stringWidth(line)).toBeLessThanOrEqual(width);
          expect(frame).toContain('❯ 1. Continue');
          for (const line of frame.matchAll(/Question line \d+/g))
            seen.add(line[0]);
          stdin.write('\u001B[6~');
          await wait();
        }
        for (let index = 1; index <= 10; index++)
          expect(seen.has(`Question line ${index}`)).toBe(true);
        stdin.write('2');
        await wait();
        stdin.write('My full answer');
        await wait();
        expect(
          stripAnsi(lastFrame() ?? '').split('\n').length,
        ).toBeLessThanOrEqual(14);
        stdin.write('\r');
        await wait();
        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
          ToolConfirmationOutcome.ProceedOnce,
          { answers: { 0: 'My full answer' } },
        );
      } finally {
        unmount();
      }
    },
  );
});
