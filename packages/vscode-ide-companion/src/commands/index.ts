/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import type { DiffManager } from '../diff-manager.js';
import type { WebViewProvider } from '../webview/providers/WebViewProvider.js';
import { getErrorMessage } from '../utils/errorMessage.js';
import { resolveWorkspacePath } from '../utils/file-path.js';
import { CHAT_VIEW_ID_SIDEBAR } from '../constants/viewIds.js';

type Logger = (message: string) => void;

export const runO1CodeCommand = 'o1-code.runO1Code';
export const showDiffCommand = 'o1Code.showDiff';
export const closeDiffCommand = 'o1Code.closeDiff';
export const openChatCommand = 'o1-code.openChat';
export const openNewChatTabCommand = 'o1Code.openNewChatTab';
export const authCommand = 'o1-code.auth';
export const focusChatCommand = 'o1-code.focusChat';
export const newConversationCommand = 'o1-code.newConversation';
export const showLogsCommand = 'o1-code.showLogs';

/**
 * Register all O1-Code chat-related commands.
 *
 * `openChat` and `newConversation` always open an editor tab, while
 * `focusChat` focuses the Activity Bar chat view.
 *
 * @param context - VS Code extension context for subscription management
 * @param log - Logger function for debug output
 * @param diffManager - Diff manager for showing file diffs
 * @param getWebViewProviders - Returns all active editor-tab WebView providers
 * @param createWebViewProvider - Factory to create a new editor-tab WebView provider
 * @param outputChannel - Optional output channel for the showLogs command
 */
export function registerNewCommands(
  context: vscode.ExtensionContext,
  log: Logger,
  diffManager: DiffManager,
  getWebViewProviders: () => WebViewProvider[],
  createWebViewProvider: () => WebViewProvider,
  outputChannel?: vscode.OutputChannel,
): void {
  const disposables: vscode.Disposable[] = [];

  // Open Chat: show the most recent editor tab or create a new one
  disposables.push(
    vscode.commands.registerCommand(openChatCommand, async () => {
      const providers = getWebViewProviders();
      if (providers.length > 0) {
        await providers[providers.length - 1].show();
      } else {
        const provider = createWebViewProvider();
        await provider.show();
      }
    }),
  );

  disposables.push(
    vscode.commands.registerCommand(
      showDiffCommand,
      async (args: {
        path: string;
        oldText: string;
        newText: string;
        readOnly?: boolean;
        permissionRequestId?: string;
      }) => {
        try {
          const absolutePath = resolveWorkspacePath(args.path);
          log(`[Command] Showing diff for ${absolutePath}`);
          await diffManager.showDiff(absolutePath, args.oldText, args.newText, {
            readOnly: args.readOnly === true,
            permissionRequestId: args.permissionRequestId,
          });
        } catch (error) {
          const errorMsg = getErrorMessage(error);
          log(`[Command] Error showing diff: ${errorMsg}`);
          vscode.window.showErrorMessage(`Failed to show diff: ${errorMsg}`);
        }
      },
    ),
  );

  disposables.push(
    vscode.commands.registerCommand(
      closeDiffCommand,
      async (filePath: string, permissionRequestId?: string) =>
        diffManager.closeDiff(
          resolveWorkspacePath(filePath),
          true,
          permissionRequestId,
        ),
    ),
  );

  // Open New Chat Tab: always create a new editor tab
  disposables.push(
    vscode.commands.registerCommand(
      openNewChatTabCommand,
      async (args?: { initialModelId?: string }) => {
        const provider = createWebViewProvider();
        provider.setInitialModelId(args?.initialModelId);
        await provider.show();
      },
    ),
  );

  disposables.push(
    vscode.commands.registerCommand(authCommand, async () => {
      const providers = getWebViewProviders();
      const provider =
        providers.length > 0
          ? providers[providers.length - 1]
          : createWebViewProvider();

      await provider.show();
      await provider.startInteractiveAuth();
    }),
  );

  // Focus Chat: bring the Activity Bar chat view to front.
  disposables.push(
    vscode.commands.registerCommand(focusChatCommand, async () => {
      await vscode.commands.executeCommand(`${CHAT_VIEW_ID_SIDEBAR}.focus`);
    }),
  );

  // New Conversation: open a new editor tab for a fresh conversation
  disposables.push(
    vscode.commands.registerCommand(newConversationCommand, async () => {
      const provider = createWebViewProvider();
      await provider.show();
    }),
  );

  // Show Logs: reveal the output channel
  disposables.push(
    vscode.commands.registerCommand(showLogsCommand, async () => {
      if (outputChannel) {
        outputChannel.show(true);
      } else {
        vscode.window.showWarningMessage(
          'O1-Code Companion log channel is not available.',
        );
      }
    }),
  );

  context.subscriptions.push(...disposables);
}
