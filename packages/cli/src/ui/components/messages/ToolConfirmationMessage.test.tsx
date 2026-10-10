/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { EOL } from 'node:os';
import { promises as fsp } from 'node:fs';
import { Box } from 'ink';

// Capture launches of the external editor so the full-plan viewer
// can be asserted without spawning a real editor process.
const { launchEditorMock, isEditorAvailableMock } = vi.hoisted(() => ({
  launchEditorMock: vi.fn((_filePath: string) => Promise.resolve()),
  // Editor availability probes PATH for a real binary (`command -v code`),
  // so leaving it unstubbed would make these tests depend on whether the
  // host happens to have the configured editor installed. Default to
  // "configured means available" and opt out per test. The detection itself
  // is covered by packages/core/src/utils/editor.test.ts.
  isEditorAvailableMock: vi.fn((editor: string | undefined) => Boolean(editor)),
}));
vi.mock('../../hooks/useLaunchEditor.js', () => ({
  useLaunchEditor: () => launchEditorMock,
}));
vi.mock('@organizaone/o1-code-core/utils/editor.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@organizaone/o1-code-core/utils/editor.js')
    >();
  return {
    ...actual,
    isEditorAvailable: isEditorAvailableMock,
  };
});

import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import type {
  ToolCallConfirmationDetails,
  Config,
} from '@organizaone/o1-code-core';
import { IdeClient, ToolConfirmationOutcome } from '@organizaone/o1-code-core';
import {
  renderWithProviders,
  withProviders,
} from '../../../test-utils/render.js';
import type { LoadedSettings } from '../../../config/settings.js';

describe('ToolConfirmationMessage', () => {
  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
  } as unknown as Config;

  it('should not display urls if prompt and url are the same', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        contentWidth={80}
      />,
    );

    expect(lastFrame()).not.toContain('URLs to fetch:');
  });

  it('should display urls if prompt and url are different', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt:
        'fetch https://github.com/google/gemini-react/blob/main/README.md',
      urls: [
        'https://raw.githubusercontent.com/google/gemini-react/main/README.md',
      ],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        contentWidth={80}
      />,
    );

    expect(lastFrame()).toContain('URLs to fetch:');
    expect(lastFrame()).toContain(
      '- https://raw.githubusercontent.com/google/gemini-react/main/README.md',
    );
  });

  it('preserves urls when the prompt is rendered as plain text', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Hook confirmation',
      prompt: 'Review the literal target',
      urls: ['https://example.com/target'],
      renderPromptAsPlainText: true,
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        contentWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Review the literal target');
    expect(lastFrame()).toContain('URLs to fetch:');
    expect(lastFrame()).toContain('- https://example.com/target');
  });

  it('renders plain-text info prompts without interpreting Markdown or links', () => {
    const prompt =
      'Save "[visible](https://hidden.example/target) **bold** `code` <u>under</u>"';
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Hook confirmation',
      prompt,
      renderPromptAsPlainText: true,
      hideAlwaysAllow: true,
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        contentWidth={160}
      />,
    );

    expect(lastFrame()).toContain(prompt);
    expect(lastFrame()).not.toContain('\u001b]8;;');
  });

  it('renders every line of a short multiline plain-text info prompt', () => {
    const prompt =
      'Save this exact content to the bound Mem0 repository memory?\n"LINK [visible label](https://hidden.example/secret-target) BOLD **bold-value** CODE `code-value` UNDER <u>under-value</u>"';
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Hook confirmation',
      prompt,
      renderPromptAsPlainText: true,
      hideAlwaysAllow: true,
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={10}
        contentWidth={98}
      />,
    );

    expect(lastFrame()).toContain(
      'Save this exact content to the bound Mem0 repository memory?',
    );
    expect(lastFrame()).toContain(
      '"LINK [visible label](https://hidden.example/secret-target) BOLD **bold-value** CODE',
    );
    expect(lastFrame()).toContain('`code-value` UNDER <u>under-value</u>"');
  });

  it('marks overflow in constrained plain-text info prompts', () => {
    const prompt = `Confirm exact content:\n${JSON.stringify(
      [
        'PROMPT_TOP',
        ...Array.from({ length: 80 }, (_, index) => `line-${index}`),
        'PROMPT_TAIL',
      ].join('\n'),
    )}`;
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Hook confirmation',
      prompt,
      renderPromptAsPlainText: true,
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={12}
        contentWidth={80}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('PROMPT_TOP');
    expect(frame).toMatch(/last \d+ lines hidden/);
    expect(frame).not.toContain('PROMPT_TAIL');
  });

  it('renders the complete plain-text info prompt when unconstrained', () => {
    const prompt = `Confirm exact content:\n${JSON.stringify(
      [
        'PROMPT_TOP',
        ...Array.from({ length: 80 }, (_, index) => `line-${index}`),
        'PROMPT_TAIL',
      ].join('\n'),
    )}`;
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Hook confirmation',
      prompt,
      renderPromptAsPlainText: true,
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        contentWidth={80}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('PROMPT_TOP');
    expect(frame).toContain('PROMPT_TAIL');
    expect(frame).not.toContain('lines hidden');
  });

  // Regression coverage: exec confirmations carry a
  // user-facing warning for command substitution. Previously such
  // commands were hard-denied at L4 with an opaque "denied by
  // permission rules" message; we now ask for confirmation and surface
  // the substitution clearly.
  it('renders warnings on exec confirmations when provided', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'python3 -c "print($(echo hello))"',
      rootCommand: 'python3',
      warnings: [
        'Contains command substitution ($(...), backticks, <(...), or >(...)).',
      ],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        contentWidth={80}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('command substitution');
  });

  it('omits the warning region when no warnings are provided on exec confirmations', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'echo hello',
      rootCommand: 'echo',
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        contentWidth={80}
      />,
    );

    expect(lastFrame() ?? '').not.toContain('command substitution');
  });

  it('renders classifier fallback guidance and the Default Mode option', async () => {
    const onConfirm = vi.fn();
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'touch /tmp/marker',
      rootCommand: 'touch',
      hideAlwaysAllow: true,
      autoModeFallback: {
        reason: 'classifier_unavailable',
        message:
          "Auto Mode couldn't classify this action. Switching to Default Mode is recommended.",
      },
      onConfirm,
    };

    const { lastFrame, stdin } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={12}
        contentWidth={80}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain("Auto Mode couldn't classify this action");
    expect(frame).toContain(
      'Switch to Default Mode and allow once (recommended)',
    );
    expect(frame).not.toContain('Always allow');

    stdin.write('\x1b[B');
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        ToolConfirmationOutcome.ProceedOnceAndSwitchToDefault,
      ),
    );
  });

  it('renders blocked retry guidance without offering a mode switch', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'touch /tmp/marker',
      rootCommand: 'touch',
      hideAlwaysAllow: true,
      autoModeFallback: {
        reason: 'classifier_blocked_retry',
        message: 'This exact action was previously blocked.',
      },
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={12}
        contentWidth={80}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('This exact action was previously blocked.');
    expect(frame).toContain('Yes, allow once');
    expect(frame).not.toContain('Switch to Default Mode');
    expect(frame).not.toContain('Always allow');
  });

  it('offers a mode switch after consecutive classifier failures', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'touch /tmp/marker',
      rootCommand: 'touch',
      hideAlwaysAllow: true,
      autoModeFallback: {
        reason: 'consecutive_unavailable',
        message: 'Auto Mode could not classify consecutive actions.',
      },
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={12}
        contentWidth={80}
      />,
    );

    expect(lastFrame() ?? '').toContain(
      'Switch to Default Mode and allow once (recommended)',
    );
  });

  // Regression coverage: the warnings block sits outside the MaxSizedBox
  // cap, so its footprint has to be reserved from `bodyContentHeight`
  // up-front; otherwise the options list can be pushed off-screen on
  // small terminals. The original round-1 test used a single-line
  // command, which made the `MaxSizedBox` clamp `min(content_lines,
  // maxHeight)` reduce to `min(1, X) = 1` regardless of the
  // reservation — i.e. the test was vacuous. Replaced here with a
  // multi-line command so the clamp is actually exercised, and the
  // assertion checks for the `... N lines hidden ...` truncation
  // footer that MaxSizedBox emits ONLY when its cap is active. Without
  // the warnings reservation, the cap is loose enough that the whole
  // command fits and the footer never appears.
  it('clamps the multi-line command body to make room for the warning on a tight compactMode layout', () => {
    // Four-line command: forces MaxSizedBox to clamp once the warnings
    // footprint is reserved. With the reservation: cap is tight enough
    // that the body is truncated and shows a "... N lines hidden ..."
    // footer. Without it: the whole 4-line command renders and the
    // footer is absent.
    const command = [
      'cmd-line-1',
      'cmd-line-2',
      'cmd-line-3',
      'cmd-line-4',
    ].join('\n');
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command,
      rootCommand: 'cmd-line-1',
      warnings: [
        'Contains command substitution ($(...), backticks, <(...), or >(...)).',
      ],
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={10}
        contentWidth={80}
        compactMode={true}
      />,
    );

    const frame = lastFrame() ?? '';
    // MaxSizedBox emits this footer when it clamps; its presence proves
    // the reservation actually narrowed the body cap below the command
    // height. Without `bodyContentHeight -= warningsHeight`, the cap is
    // loose and the footer doesn't appear.
    expect(frame).toMatch(/lines hidden/);
    // Warning + all three compactMode options must still be on-screen.
    expect(frame).toContain('command substitution');
    expect(frame).toContain('Yes, allow once');
    expect(frame).toContain('Allow always');
    expect(frame).toContain('No');
  });

  it('should render plan confirmation with markdown plan content', () => {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'plan',
      title: 'Would you like to proceed?',
      plan: '# Implementation Plan\n- Step one\n- Step two'.replace(/\n/g, EOL),
      onConfirm: vi.fn(),
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        contentWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Yes, and auto-accept edits');
    expect(lastFrame()).toContain('Yes, and manually approve edits');
    expect(lastFrame()).toContain('No, keep planning');
    expect(lastFrame()).toContain('Implementation Plan');
    expect(lastFrame()).toContain('Step one');
  });

  describe('run the plan as a Goal', () => {
    const renderPlan = (onConfirm = vi.fn(), trusted = true) =>
      renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            type: 'plan',
            title: 'Would you like to proceed?',
            plan: '# Plan\n1. Step one',
            onConfirm,
          }}
          config={
            {
              isTrustedFolder: () => trusted,
              getIdeMode: () => false,
            } as unknown as Config
          }
          availableTerminalHeight={30}
          contentWidth={80}
        />,
      );

    it('offers the choice next to the approve and reject options, trusted or not', () => {
      expect(renderPlan().lastFrame()).toContain('Approve and run as a Goal');
      expect(renderPlan(vi.fn(), false).lastFrame()).toContain(
        'Approve and run as a Goal',
      );
    });

    it('approves with manual edit approval and asks for a Goal proposal', async () => {
      const onConfirm = vi.fn();
      const { stdin } = renderPlan(onConfirm);

      // restore previous, auto-accept, manually approve, run as a Goal, no.
      stdin.write('4');

      await vi.waitFor(() =>
        expect(onConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
          { runPlanAsGoal: true },
        ),
      );
    });

    it('sends no Goal request with a plain approval', async () => {
      const onConfirm = vi.fn();
      const { stdin } = renderPlan(onConfirm);

      stdin.write('3');

      await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
      expect(onConfirm.mock.calls[0]).toEqual([
        ToolConfirmationOutcome.ProceedOnce,
      ]);
    });
  });

  describe('full-plan viewer', () => {
    const plan = [
      '# Big Plan',
      ...Array.from({ length: 60 }, (_, i) => `- Step ${i + 1}`),
    ].join('\n');

    const planDetails = (onConfirm = vi.fn()): ToolCallConfirmationDetails => ({
      type: 'plan',
      title: 'Would you like to proceed?',
      plan,
      onConfirm,
    });

    it('shows the open-in-editor hint on plan confirmations', () => {
      launchEditorMock.mockClear();
      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={planDetails()}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
      );
      expect(lastFrame()).toContain('o open full plan in editor');
    });

    it('`o` writes the FULL plan to a temp file and opens the editor without confirming', async () => {
      launchEditorMock.mockClear();
      const onConfirm = vi.fn();
      const { stdin } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={planDetails(onConfirm)}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
      );

      stdin.write('o');
      await vi.waitFor(() => expect(launchEditorMock).toHaveBeenCalledTimes(1));

      const openedPath = launchEditorMock.mock.calls[0]![0];
      // The staged file must contain the COMPLETE plan, not the truncated view.
      expect(await fsp.readFile(openedPath, 'utf-8')).toBe(plan);
      // Viewing the plan must not resolve the confirmation either way.
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('Ctrl+O does not open the editor', async () => {
      launchEditorMock.mockClear();
      const { stdin } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={planDetails()}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
      );
      stdin.write('\x0f'); // Ctrl+O
      await new Promise((r) => setTimeout(r, 50));
      expect(launchEditorMock).not.toHaveBeenCalled();
    });

    it('`o` is inert for non-plan confirmations', async () => {
      launchEditorMock.mockClear();
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt: 'https://example.com',
        urls: ['https://example.com'],
        onConfirm: vi.fn(),
      };
      const { stdin, lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
      );
      expect(lastFrame()).not.toContain('o open full plan in editor');
      stdin.write('o');
      await new Promise((r) => setTimeout(r, 50));
      expect(launchEditorMock).not.toHaveBeenCalled();
    });
  });

  describe('with folder trust', () => {
    const editConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
      onConfirm: vi.fn(),
    };

    const execConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo "hello"',
      rootCommand: 'echo',
      onConfirm: vi.fn(),
    };

    const infoConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'https://example.com',
      urls: ['https://example.com'],
      onConfirm: vi.fn(),
    };

    const mcpConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool',
      serverName: 'test-server',
      toolName: 'test-tool',
      toolDisplayName: 'Test Tool',
      onConfirm: vi.fn(),
    };

    describe.each([
      {
        description: 'for edit confirmations',
        details: editConfirmationDetails,
        alwaysAllowText: 'Yes, allow always',
      },
      {
        description: 'for exec confirmations',
        details: execConfirmationDetails,
        alwaysAllowText: 'Always allow in this project',
      },
      {
        description: 'for info confirmations',
        details: infoConfirmationDetails,
        alwaysAllowText: 'Always allow in this project',
      },
      {
        description: 'for mcp confirmations',
        details: mcpConfirmationDetails,
        alwaysAllowText: 'Always allow in this project',
      },
    ])('$description', ({ details, alwaysAllowText }) => {
      it('should show "allow always" when folder is trusted', () => {
        const mockConfig = {
          isTrustedFolder: () => true,
          getIdeMode: () => false,
        } as unknown as Config;

        const { lastFrame } = renderWithProviders(
          <ToolConfirmationMessage
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            contentWidth={80}
          />,
        );

        expect(lastFrame()).toContain(alwaysAllowText);
      });

      it('should NOT show "allow always" when folder is untrusted', () => {
        const mockConfig = {
          isTrustedFolder: () => false,
          getIdeMode: () => false,
        } as unknown as Config;

        const { lastFrame } = renderWithProviders(
          <ToolConfirmationMessage
            confirmationDetails={details}
            config={mockConfig}
            availableTerminalHeight={30}
            contentWidth={80}
          />,
        );

        expect(lastFrame()).not.toContain(alwaysAllowText);
      });
    });

    describe('unguarded entrances', () => {
      const infoDetails = (
        onConfirm: ToolCallConfirmationDetails['onConfirm'] = vi.fn(),
      ): ToolCallConfirmationDetails => ({
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt: 'https://example.com',
        urls: ['https://example.com'],
        onConfirm,
      });

      const planDetails = (
        onConfirm: ToolCallConfirmationDetails['onConfirm'] = vi.fn(),
      ): ToolCallConfirmationDetails => ({
        type: 'plan',
        title: 'Would you like to proceed?',
        plan: '# Plan\n- Step 1',
        onConfirm,
      });

      const renderWith = (
        trusted: boolean,
        details: ToolCallConfirmationDetails,
        compactMode = false,
      ) => {
        const config = {
          isTrustedFolder: () => trusted,
          getIdeMode: () => false,
        } as unknown as Config;
        return renderWithProviders(
          <ToolConfirmationMessage
            confirmationDetails={details}
            config={config}
            availableTerminalHeight={30}
            contentWidth={80}
            compactMode={compactMode}
          />,
        );
      };

      it('compactMode offers "Allow always" only in a trusted folder', () => {
        expect(renderWith(true, infoDetails(), true).lastFrame()).toContain(
          'Allow always',
        );
        const untrusted = renderWith(false, infoDetails(), true).lastFrame();
        expect(untrusted).toContain('Yes, allow once');
        expect(untrusted).not.toContain('Allow always');
      });

      it('plan exit offers auto-accept only in a trusted folder', () => {
        expect(renderWith(true, planDetails()).lastFrame()).toContain(
          'Yes, and auto-accept edits',
        );
        const untrusted = renderWith(false, planDetails()).lastFrame();
        // Both remaining exits must survive: the gate admits DEFAULT and PLAN.
        expect(untrusted).toContain('Yes, and manually approve edits');
        expect(untrusted).toContain('restore previous mode');
        expect(untrusted).not.toContain('Yes, and auto-accept edits');
      });

      it('subscribes to the promise onConfirm returns instead of letting it float', async () => {
        // A floating rejection reaches the process-level handler (llm.tsx) and
        // shows a "file a bug report" banner over a correctly-refused action,
        // so the call site must consume what onConfirm returns. Asserted via a
        // thenable: `Promise.resolve(x).catch(...)` subscribes through `then`,
        // a bare `onConfirm(outcome)` statement never does.
        const then = vi.fn();
        const thenable = { then } as unknown as Promise<void>;
        const onConfirm = vi.fn(() => thenable);
        const { stdin } = renderWith(true, infoDetails(onConfirm));

        stdin.write('\r');

        await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
        expect(then).toHaveBeenCalled();
      });
    });
  });

  describe('external editor option', () => {
    const editConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'edit',
      title: 'Confirm Edit',
      fileName: 'test.txt',
      filePath: '/test.txt',
      fileDiff: '...diff...',
      originalContent: 'a',
      newContent: 'b',
      onConfirm: vi.fn(),
    };
    const execConfirmationDetails: ToolCallConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Execution',
      command: 'echo hello',
      rootCommand: 'echo',
      onConfirm: vi.fn(),
    };
    const preferredEditorSettings = {
      merged: { general: { preferredEditor: 'vscode' } },
    } as unknown as LoadedSettings;

    it('should show "Modify with external editor" when preferredEditor is set', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;
      isEditorAvailableMock.mockClear();

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
        { settings: preferredEditorSettings },
      );

      expect(lastFrame()).toContain('Modify with external editor');
      expect(isEditorAvailableMock).toHaveBeenCalledWith('vscode');
    });

    it('probes editor availability once for the dialog lifetime', () => {
      isEditorAvailableMock.mockClear();

      const component = (height: number) => (
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={height}
          contentWidth={80}
        />
      );
      const { lastFrame, rerender } = renderWithProviders(component(30), {
        settings: preferredEditorSettings,
      });

      expect(lastFrame()).toContain('Modify with external editor');
      expect(isEditorAvailableMock).toHaveBeenCalledTimes(1);

      // A terminal resize re-renders the dialog; the availability probe shells
      // out, so it must not run again.
      rerender(
        withProviders(component(31), { settings: preferredEditorSettings }),
      );

      expect(lastFrame()).toContain('Modify with external editor');
      expect(isEditorAvailableMock).toHaveBeenCalledTimes(1);
    });

    // The option used to be offered whenever `preferredEditor` was merely
    // set, so picking it tried to launch a binary that is not installed and
    // the modify flow failed. Offer it only when the editor is available.
    it('should NOT show "Modify with external editor" when the configured editor is unavailable', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;
      isEditorAvailableMock.mockClear();
      isEditorAvailableMock.mockReturnValueOnce(false);

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
        { settings: preferredEditorSettings },
      );

      expect(lastFrame()).toContain('Yes, allow once');
      expect(lastFrame()).not.toContain('Modify with external editor');
    });

    it('should NOT show "Modify with external editor" when preferredEditor is not set', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;
      isEditorAvailableMock.mockClear();

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
        {
          settings: {
            merged: { general: {} },
          } as unknown as LoadedSettings,
        },
      );

      expect(isEditorAvailableMock).not.toHaveBeenCalled();
      expect(lastFrame()).not.toContain('Modify with external editor');
    });

    it('should NOT show "Modify with external editor" when hideModify is true', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;
      isEditorAvailableMock.mockClear();

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{ ...editConfirmationDetails, hideModify: true }}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
        { settings: preferredEditorSettings },
      );

      expect(isEditorAvailableMock).not.toHaveBeenCalled();
      expect(lastFrame()).not.toContain('Modify with external editor');
    });

    it('should NOT probe editor availability in compactMode', () => {
      isEditorAvailableMock.mockClear();

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={editConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
          compactMode={true}
        />,
        { settings: preferredEditorSettings },
      );

      expect(lastFrame()).toContain('Yes, allow once');
      expect(isEditorAvailableMock).not.toHaveBeenCalled();
      expect(lastFrame()).not.toContain('Modify with external editor');
    });

    it('should NOT probe editor availability for a non-edit confirmation', () => {
      isEditorAvailableMock.mockClear();

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={execConfirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
        { settings: preferredEditorSettings },
      );

      expect(lastFrame()).toContain('Yes, allow once');
      expect(isEditorAvailableMock).not.toHaveBeenCalled();
    });

    it('renders edit warnings and honors hideAlwaysAllow on small terminals', () => {
      const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
      } as unknown as Config;
      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            ...editConfirmationDetails,
            hideAlwaysAllow: true,
            warnings: [
              'Unknown shell safety',
              'Exact shell command: sed -i s/a/b/ test.txt',
            ],
          }}
          config={mockConfig}
          availableTerminalHeight={10}
          contentWidth={50}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('Unknown shell safety');
      expect(frame).toContain('Exact shell command');
      expect(frame).toContain('Yes, allow once');
      expect(frame).not.toContain('Yes, allow always');
    });

    it('budgets edit warnings using their rendered inner width', () => {
      const availableTerminalHeight = 11;
      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            ...editConfirmationDetails,
            fileDiff: '@@ -1 +1 @@\n-a\n+b',
            hideAlwaysAllow: true,
            hideModify: true,
            warnings: ['x'.repeat(44)],
          }}
          config={mockConfig}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={50}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame.split(EOL).length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      expect(frame).toContain('x'.repeat(44));
      expect(frame).toContain('Apply this change?');
      expect(frame).toContain('Yes, allow once');
    });

    it('keeps a multiline exact command visible within the body budget', () => {
      const availableTerminalHeight = 11;
      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            ...editConfirmationDetails,
            fileDiff: '@@ -1 +1 @@\n-a\n+b',
            hideAlwaysAllow: true,
            hideModify: true,
            warnings: [
              'Plan mode could not determine whether this command is read-only.',
              'Exact shell command: `printf a\nprintf b`',
            ],
          }}
          config={mockConfig}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={50}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame.split(EOL).length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      expect(frame).toContain('Plan mode could not determine');
      expect(frame).toContain('Exact shell command');
      expect(frame).toContain('printf a ↵');
      expect(frame).toContain('Apply this change?');
      expect(frame).toContain('Yes, allow once');
    });

    it('budgets compact edit warnings at the wrapping boundary', () => {
      const availableTerminalHeight = 9;
      const { lastFrame } = renderWithProviders(
        <Box width={50}>
          <ToolConfirmationMessage
            confirmationDetails={{
              ...editConfirmationDetails,
              fileDiff: '@@ -1 +1 @@\n-a\n+b',
              hideAlwaysAllow: true,
              hideModify: true,
              warnings: ['x'.repeat(46), 'y'.repeat(46)],
            }}
            config={mockConfig}
            availableTerminalHeight={availableTerminalHeight}
            contentWidth={50}
            compactMode={true}
          />
        </Box>,
      );

      const frame = lastFrame() ?? '';
      expect(frame.split(EOL).length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      expect(frame).toContain('x'.repeat(46));
      expect(frame).toContain('y'.repeat(46));
      expect(frame).toContain('Apply this change?');
      expect(frame).toContain('Yes, allow once');
    });

    it('keeps one-line compact bodies within the terminal height', () => {
      const availableTerminalHeight = 5;
      const { lastFrame } = renderWithProviders(
        <Box width={50}>
          <ToolConfirmationMessage
            confirmationDetails={{
              ...editConfirmationDetails,
              fileDiff: '@@ -1 +1 @@\n-a\n+b',
              hideAlwaysAllow: true,
              hideModify: true,
              warnings: [
                'Plan mode could not determine whether this command is read-only.',
                'Exact shell command: `printf a\nprintf b`',
              ],
            }}
            config={mockConfig}
            availableTerminalHeight={availableTerminalHeight}
            contentWidth={50}
            compactMode={true}
          />
        </Box>,
      );

      const frame = lastFrame() ?? '';
      expect(frame.split(EOL).length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      expect(frame).toContain('Exact shell command');
      expect(frame).toContain('Apply this change?');
      expect(frame).toContain('Yes, allow once');
      expect(frame).toContain('No');
    });

    it('keeps the diff placeholder visible without warnings on one-line bodies', () => {
      const availableTerminalHeight = 8;
      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            ...editConfirmationDetails,
            fileDiff: '@@ -1 +1 @@\n-a\n+b',
            hideAlwaysAllow: true,
            hideModify: true,
          }}
          config={mockConfig}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={50}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame.split(EOL).length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      expect(frame).toContain('diff hidden');
      expect(frame).toContain('Apply this change?');
      expect(frame).toContain('Yes, allow once');
    });

    it('keeps compact edit warnings and diff within the available height', () => {
      const availableTerminalHeight = 9;
      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            ...editConfirmationDetails,
            fileDiff:
              '@@ -1,3 +1,3 @@\n-old one\n-old two\n+new one\n+new two\n context',
            hideAlwaysAllow: true,
            hideModify: true,
            warnings: [
              'Plan mode could not determine whether this shell command is read-only. Approval applies only to this exact invocation once.',
              `Exact shell command: \`python -c "${"open('result.txt', 'a').write('changed');".repeat(12)}"\``,
            ],
          }}
          config={mockConfig}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={50}
          compactMode={true}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame.split(EOL).length).toBeLessThanOrEqual(
        availableTerminalHeight,
      );
      expect(frame).toContain('Plan mode could not determine');
      expect(frame).toContain('Exact shell command');
      expect(frame).toContain('lines hidden');
      expect(frame).toContain('Apply this change?');
      expect(frame).toContain('Yes, allow once');
      expect(frame).toContain('No');
    });

    it('resolves ordinary IDE edits but skips confirmations that have no IDE diff', async () => {
      const resolveDiffFromCli = vi.fn().mockResolvedValue(undefined);
      const isDiffingEnabled = vi.fn().mockReturnValue(true);
      const getInstanceSpy = vi
        .spyOn(IdeClient, 'getInstance')
        .mockResolvedValue({
          isDiffingEnabled,
          resolveDiffFromCli,
        } as unknown as IdeClient);
      const ideConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => true,
      } as unknown as Config;

      const ordinaryOnConfirm = vi.fn().mockResolvedValue(undefined);
      const ordinary = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            ...editConfirmationDetails,
            onConfirm: ordinaryOnConfirm,
          }}
          config={ideConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
      );
      await vi.waitFor(() => expect(isDiffingEnabled).toHaveBeenCalled());
      ordinary.stdin.write('\r');
      await vi.waitFor(() =>
        expect(resolveDiffFromCli).toHaveBeenCalledWith(
          '/test.txt',
          'accepted',
        ),
      );
      ordinary.unmount();

      resolveDiffFromCli.mockClear();
      isDiffingEnabled.mockClear();
      const skippedOnConfirm = vi.fn().mockResolvedValue(undefined);
      const skipped = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={{
            ...editConfirmationDetails,
            onConfirm: skippedOnConfirm,
            skipIdeDiff: true,
          }}
          config={ideConfig}
          availableTerminalHeight={30}
          contentWidth={80}
        />,
      );
      await vi.waitFor(() => expect(isDiffingEnabled).toHaveBeenCalled());
      skipped.stdin.write('\r');
      await vi.waitFor(() =>
        expect(skippedOnConfirm).toHaveBeenCalledWith(
          ToolConfirmationOutcome.ProceedOnce,
        ),
      );
      expect(resolveDiffFromCli).not.toHaveBeenCalled();

      skipped.unmount();
      getInstanceSpy.mockRestore();
    });
  });

  describe('compactMode', () => {
    it('keeps classifier fallback guidance and all choices visible', () => {
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Execution',
        command: 'touch /tmp/marker',
        rootCommand: 'touch',
        hideAlwaysAllow: true,
        autoModeFallback: {
          reason: 'classifier_unavailable',
          message:
            "Auto Mode couldn't classify this action. Switching to Default Mode is recommended.",
        },
        onConfirm: vi.fn(),
      };

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          availableTerminalHeight={10}
          contentWidth={80}
          compactMode={true}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain("Auto Mode couldn't classify this action");
      expect(frame).toContain('Yes, allow once');
      expect(frame).toContain(
        'Switch to Default Mode and allow once (recommended)',
      );
      expect(frame).toContain('No');
      expect(frame).not.toContain('Allow always');
    });

    it('budgets the two-option blocked retry layout on a tight terminal', () => {
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Execution',
        command: ['line-1', 'line-2', 'line-3', 'line-4'].join('\n'),
        rootCommand: 'line-1',
        hideAlwaysAllow: true,
        autoModeFallback: {
          reason: 'classifier_blocked_retry',
          message: 'This exact action was previously blocked.',
        },
        onConfirm: vi.fn(),
      };

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          availableTerminalHeight={10}
          contentWidth={80}
          compactMode={true}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('previously blocked');
      expect(frame).toContain('line-1');
      expect(frame).toContain('last 2 lines hidden');
      expect(frame).toContain('Yes, allow once');
      expect(frame).toContain('No');
      expect(frame).not.toContain('Switch to Default Mode');
      expect(frame).not.toContain('Allow always');
    });

    it('renders the command and exec-specific question for exec confirmations', () => {
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Execution',
        command: 'rm -f /tmp/foo.txt',
        rootCommand: 'rm',
        onConfirm: vi.fn(),
      };

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
          compactMode={true}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('rm -f /tmp/foo.txt');
      expect(frame).toContain('Do you want to proceed?');
      expect(frame).toContain('Yes, allow once');
      expect(frame).toContain('Allow always');
      expect(frame).toContain('No');
      // Compact mode swaps the type-specific exec question for the
      // generic prompt (the body already shows the command) and trims
      // project/user-scope variants.
      expect(frame).not.toContain('Allow execution of:');
      expect(frame).not.toContain('Always allow in this project');
      expect(frame).not.toContain('Always allow for this user');
    });

    it('honors hideAlwaysAllow', () => {
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Execution',
        command: 'rm -f /tmp/foo.txt',
        rootCommand: 'rm',
        hideAlwaysAllow: true,
        onConfirm: vi.fn(),
      };

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
          compactMode={true}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('Yes, allow once');
      expect(frame).not.toContain('Allow always');
      expect(frame).toContain('No');
    });

    it('renders MCP server and tool name for mcp confirmations', () => {
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'mcp',
        title: 'Confirm MCP Tool',
        serverName: 'my-server',
        toolName: 'my-tool',
        toolDisplayName: 'My Tool',
        onConfirm: vi.fn(),
      };

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
          compactMode={true}
        />,
      );

      const frame = lastFrame() ?? '';
      expect(frame).toContain('MCP Server: my-server');
      expect(frame).toContain('Tool: my-tool');
      expect(frame).toContain('Do you want to proceed?');
      expect(frame).toContain('Yes, allow once');
      expect(frame).toContain('Allow always');
      expect(frame).toContain('No');
      // Compact mode swaps the type-specific mcp question for the
      // generic prompt (the body already shows server + tool) and trims
      // project/user-scope variants.
      expect(frame).not.toContain('Allow execution of MCP tool');
      expect(frame).not.toContain('Always allow in this project');
      expect(frame).not.toContain('Always allow for this user');
    });

    it('caps multi-line exec body at 5 lines with overflow indicator', () => {
      const lines = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`);
      const command = `cat <<'EOF'\n${lines.join('\n')}\nEOF`;
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Execution',
        command,
        rootCommand: 'cat',
        onConfirm: vi.fn(),
      };

      const { lastFrame } = renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={confirmationDetails}
          config={mockConfig}
          availableTerminalHeight={50}
          contentWidth={80}
          compactMode={true}
        />,
      );

      const frame = lastFrame() ?? '';
      // Head of the command is preserved (so the user sees what's being
      // run); the heredoc tail elides behind the overflow indicator.
      expect(frame).toContain("cat <<'EOF'");
      expect(frame).toContain('Line 1');
      expect(frame).not.toContain('Line 8');
      expect(frame).not.toContain('Line 12');
      expect(frame).toMatch(/\.{3} last \d+ lines hidden \.{3}/);
    });
  });

  describe('approval frame', () => {
    const details: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Web Fetch',
      prompt: 'fetch the page',
      onConfirm: vi.fn(),
    };
    const frameOf = (compactMode: boolean) =>
      renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={details}
          config={mockConfig}
          availableTerminalHeight={30}
          contentWidth={80}
          compactMode={compactMode}
        />,
      ).lastFrame() ?? '';

    it('draws a border around the approval request', () => {
      const rows = frameOf(false).split('\n');
      expect(rows[0]!.trimStart().startsWith('╭')).toBe(true);
      expect(rows[rows.length - 1]!.trimStart().startsWith('╰')).toBe(true);
    });

    it('lays the options side by side from a 100-column terminal', () => {
      // The approval's own width is the terminal's minus the conversation
      // chrome, so the switch follows the terminal (spec §8).
      const optionRows = (columns: number) => {
        const original = Object.getOwnPropertyDescriptor(
          process.stdout,
          'columns',
        );
        Object.defineProperty(process.stdout, 'columns', {
          configurable: true,
          value: columns,
        });
        try {
          return (
            renderWithProviders(
              <ToolConfirmationMessage
                confirmationDetails={details}
                config={mockConfig}
                availableTerminalHeight={30}
                contentWidth={94}
              />,
            ).lastFrame() ?? ''
          )
            .split('\n')
            .filter((row) => /\d\. /.test(row));
        } finally {
          if (original) {
            Object.defineProperty(process.stdout, 'columns', original);
          } else {
            Reflect.deleteProperty(process.stdout, 'columns');
          }
        }
      };

      // Options that do not fit wrap onto the next row.
      expect(optionRows(100)[0]).toMatch(/1\. .*2\. /);
      expect(optionRows(99).every((row) => !/1\. .*2\. /.test(row))).toBe(true);
    });

    it('leaves the frame to the parent in compact mode', () => {
      expect(frameOf(true)).not.toContain('╭');
    });
  });
});

describe('ToolConfirmationMessage in the Summary display mode', () => {
  const config = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
  } as unknown as Config;
  const summarySettings = {
    merged: { ui: { displayMode: 'summary' }, general: {} },
  } as unknown as LoadedSettings;

  const diff = [
    '--- a/validate.ts',
    '+++ b/validate.ts',
    '@@ -12,3 +12,3 @@',
    '-  return raw;',
    '+  return raw.trim().toLowerCase();',
    '-  return EMAIL_RE.test(raw);',
    '+  return EMAIL_RE.test(normalizeEmail(raw));',
  ].join('\n');

  const edit = (onConfirm = vi.fn()): ToolCallConfirmationDetails => ({
    type: 'edit',
    title: 'Confirm Edit',
    fileName: 'validate.ts',
    filePath: '/repo/src/auth/validate.ts',
    fileDiff: diff,
    originalContent: 'a',
    newContent: 'b',
    onConfirm,
  });

  const renderSummary = (
    details: ToolCallConfirmationDetails,
    intent?: string,
  ) =>
    renderWithProviders(
      <ToolConfirmationMessage
        confirmationDetails={details}
        config={config}
        availableTerminalHeight={30}
        contentWidth={100}
        intent={intent}
      />,
      { settings: summarySettings },
    );

  it('states the file, the line counts and the intent instead of the diff', () => {
    const frame =
      renderSummary(edit(), 'Clean the e-mail before validating').lastFrame() ??
      '';
    expect(frame).toContain('Change file');
    expect(frame).toContain('validate.ts');
    expect(frame).toContain('+2');
    expect(frame).toContain('−2');
    expect(frame).toContain('Clean the e-mail before validating');
    expect(frame).toContain('View changes');
    expect(frame).not.toContain('toLowerCase');
  });

  it('opens and closes the diff without answering', async () => {
    const onConfirm = vi.fn();
    const { stdin, lastFrame } = renderSummary(edit(onConfirm), 'Fix it');

    // allow once, allow always, view changes, no.
    stdin.write('3');
    await vi.waitFor(() => expect(lastFrame()).toContain('toLowerCase'));
    expect(lastFrame()).toContain('Hide changes');
    expect(onConfirm).not.toHaveBeenCalled();

    stdin.write('3');
    await vi.waitFor(() => expect(lastFrame()).not.toContain('toLowerCase'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('resolves the same outcomes as the Detailed options', async () => {
    const onConfirm = vi.fn();
    const { stdin } = renderSummary(edit(onConfirm));
    stdin.write('2');
    await vi.waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        ToolConfirmationOutcome.ProceedAlways,
      ),
    );
  });

  it('always shows the full shell command, under the intent', () => {
    const frame =
      renderSummary(
        {
          type: 'exec',
          title: 'Confirm Execution',
          command: 'npm test -- src/auth --run && rm -rf ./tmp',
          rootCommand: 'npm',
          onConfirm: vi.fn(),
        },
        'Run the auth tests',
      ).lastFrame() ?? '';
    expect(frame).toContain('Run the auth tests');
    expect(frame).toContain('npm test -- src/auth --run && rm -rf ./tmp');
  });

  it('keeps the Detailed edit approval when the mode is Detailed', () => {
    const frame =
      renderWithProviders(
        <ToolConfirmationMessage
          confirmationDetails={edit()}
          config={config}
          availableTerminalHeight={30}
          contentWidth={100}
          intent="Fix it"
        />,
      ).lastFrame() ?? '';
    expect(frame).toContain('toLowerCase');
    expect(frame).not.toContain('View changes');
    expect(frame).not.toContain('Fix it');
  });
});
