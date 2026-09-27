/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallConfirmationDetails,
  ToolPlanConfirmationDetails,
  ToolConfirmationPayload,
  ToolResult,
} from './tools.js';
import type { PermissionDecision } from '../permissions/types.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import type { FunctionDeclaration } from '@google/genai';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { ToolDisplayNames, ToolNames } from './tool-names.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import {
  buildSubagentPlanToolBlockedResult,
  isPlanRequiredTeammateContext,
  isPlanLifecycleToolUnavailableInSubagent,
} from '../agents/runtime/subagent-plan-tool-policy.js';
import { getTeammateContext } from '../agents/team/identity.js';
import type { TeamPlanApprovalDecision } from '../agents/team/TeamManager.js';
import { StructuredToolError } from './priorReadEnforcement.js';
import { ToolErrorType } from './tool-error.js';
import {
  draftGoalFromPlan,
  GOAL_ON_BLOCK_FORMAT,
} from '../goals/plan-to-goal.js';

const debugLogger = createDebugLogger('EXIT_PLAN_MODE');

export interface ExitPlanModeParams {
  plan: string;
  originalRequest?: string;
  researchSummary?: string;
  /** @deprecated Plan approval no longer uses an LLM review gate. */
  resolutionSummary?: string;
}

const exitPlanModeToolDescription = `Use this tool when you are in plan mode and have finished presenting your plan and are ready to code. This will prompt the user to exit plan mode.

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.

## Before Using This Tool
Ensure your plan is complete and unambiguous:
- If you have unresolved questions about requirements or approach, use AskUserQuestion first (in earlier phases)
- The plan parameter MUST contain your actual plan content — empty strings will be rejected
- Once your plan is finalized, use THIS tool to request approval

**Important:** Do NOT use AskUserQuestion to ask "Is this plan okay?" or "Should I proceed?" - that's exactly what THIS tool does. ExitPlanMode inherently requests user approval of your plan.

## Examples
1. Initial task: "Search for and understand the implementation of vim mode in the codebase" - Do not use the exit plan mode tool because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" - Use the exit plan mode tool after you have finished planning the implementation steps of the task.
3. Initial task: "Add a new feature to handle user authentication" - If unsure about auth method (OAuth, JWT, etc.), use AskUserQuestion first, then use exit plan mode tool after clarifying the approach.
`;

const exitPlanModeToolSchemaData: FunctionDeclaration = {
  name: 'exit_plan_mode',
  description: exitPlanModeToolDescription,
  parametersJsonSchema: {
    type: 'object',
    properties: {
      plan: {
        type: 'string',
        description:
          'The plan you came up with, that you want to run by the user for approval. Supports markdown. The plan should be pretty concise. Must contain your actual plan content — empty strings will be rejected.',
      },
      originalRequest: {
        type: 'string',
        description:
          'The original user request that prompted this plan. Restate it faithfully for a plan-required teammate leader.',
      },
      researchSummary: {
        type: 'string',
        description:
          'A brief summary of the investigation and key findings gathered during plan mode for a plan-required teammate leader.',
      },
    },
    required: ['plan'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

/**
 * `llmContent` prefixes that mark a successful plan-mode exit (user or
 * leader approval). The tool scheduler keys its post-execution history
 * sanitization off these, so they must stay in lockstep with the
 * success returns in `ExitPlanModeToolInvocation.execute` /
 * `executePlanRequiredTeammate` below.
 */
export const PLAN_EXIT_APPROVED_LLM_CONTENT_PREFIXES = [
  'User approved.',
  'Leader approved.',
] as const;

interface ExitApprovalSnapshot {
  plan: string;
  approvalModeRevision: number;
  prePlanMode: ApprovalMode;
}

interface ExitApproval {
  snapshot: ExitApprovalSnapshot;
  targetMode: ApprovalMode;
  /** The user chose "Approve and run as a Goal". */
  runAsGoal?: boolean;
}

const APPROVED_LLM_CONTENT =
  'User approved. You can now start coding. Start with updating your todo list if applicable.';

/**
 * The approval result when the user chose to run the plan as a Goal. The
 * model drafts the objective; the Goal itself is set only by the user's
 * approval in the `propose_goal` dialog. The character limit is prose here
 * (goal-tools is loaded lazily) and pinned to the constant by the test.
 */
function runPlanAsGoalLlmContent(plan: string): string {
  return [
    'User approved. The user chose to run this plan as a Goal. Do not start on the plan yet.',
    `Draft the Goal objective from the approved plan and call ${ToolNames.PROPOSE_GOAL} with it, on one line and at most 1,500 characters:`,
    'Outcome: one sentence; Done when: numbered binary items, one per plan task, each with the check the plan names for it (a command and the output line to paste); Must not: the plan constraints plus push, force-push, --no-verify unless the user allows them; Budget: a stopping agreement, marked [ASSUMPTION] in Context unless the user gave one;',
    `On block: ${GOAL_ON_BLOCK_FORMAT}; Context: only facts the agent cannot derive from the workspace.`,
    'The user approves or declines the Goal in its own dialog, and nothing starts without that approval. If they decline, do not propose it again; stop and wait for the user.',
    `If ${ToolNames.PROPOSE_GOAL} is unavailable or a Goal is already active, print the objective and a /goal set line with it instead.`,
    'First draft, derived mechanically from the plan; verify each check against the workspace and refine it:',
    draftGoalFromPlan(plan),
  ].join('\n');
}

class ExitPlanModeToolInvocation extends BaseToolInvocation<
  ExitPlanModeParams,
  ToolResult
> {
  private approval?: ExitApproval;

  constructor(
    private readonly config: Config,
    params: ExitPlanModeParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return 'Plan:';
  }

  override requiresUserInteraction(): boolean {
    // Outside plan mode, no user interaction is needed — execute() will
    // return a guidance error directly.
    if (this.config.getApprovalMode() !== ApprovalMode.PLAN) {
      return false;
    }
    return (
      !isPlanRequiredTeammateContext() &&
      !isPlanLifecycleToolUnavailableInSubagent(ToolNames.EXIT_PLAN_MODE)
    );
  }

  override async getDefaultPermission(): Promise<PermissionDecision> {
    // Always allow at the permission layer. Plan-mode gating lives in
    // requiresUserInteraction() (forces 'ask' via permissionFlow) and
    // execute() (returns guidance error outside plan mode). A single
    // source of truth avoids duplicated conditionals.
    return 'allow';
  }

  override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails> {
    if (isPlanRequiredTeammateContext()) {
      return super.getConfirmationDetails(abortSignal);
    }
    if (isPlanLifecycleToolUnavailableInSubagent(ToolNames.EXIT_PLAN_MODE)) {
      return super.getConfirmationDetails(abortSignal);
    }
    if (this.config.getApprovalMode() !== ApprovalMode.PLAN) {
      throw new StructuredToolError(
        this.outsidePlanGuidanceMessage(),
        ToolErrorType.EXECUTION_DENIED,
      );
    }

    const snapshot: ExitApprovalSnapshot = {
      plan: this.params.plan,
      approvalModeRevision: this.config.getApprovalModeRevision(),
      prePlanMode: this.config.getPrePlanMode(),
    };
    this.approval = undefined;

    const details: ToolPlanConfirmationDetails = {
      type: 'plan',
      title: 'Would you like to proceed?',
      hideAlwaysAllow: true,
      plan: snapshot.plan,
      prePlanMode: snapshot.prePlanMode,
      onConfirm: async (
        outcome: ToolConfirmationOutcome,
        payload?: ToolConfirmationPayload,
      ) => {
        switch (outcome) {
          case ToolConfirmationOutcome.RestorePrevious: {
            this.approval = undefined;
            const executionMode = this.config.getPlanExecutionMode?.();
            if (
              executionMode !== undefined &&
              payload?.expectedPlanExecutionMode !== executionMode
            ) {
              throw new StructuredToolError(
                'Execution permission changed or was not confirmed. Request plan approval again with the current permission.',
                ToolErrorType.EXECUTION_DENIED,
              );
            }
            this.approval = {
              snapshot,
              targetMode: executionMode ?? snapshot.prePlanMode,
            };
            break;
          }
          case ToolConfirmationOutcome.ProceedAlways:
            this.approval = {
              snapshot,
              targetMode: ApprovalMode.AUTO_EDIT,
            };
            break;
          case ToolConfirmationOutcome.ProceedOnce:
            this.approval = {
              snapshot,
              targetMode: ApprovalMode.DEFAULT,
            };
            break;
          case ToolConfirmationOutcome.Cancel:
            this.approval = undefined;
            break;
          default:
            this.approval = undefined;
            throw new Error(
              `Invalid plan approval outcome: ${String(outcome)}`,
            );
        }
        if (this.approval && payload?.runPlanAsGoal === true) {
          this.approval = { ...this.approval, runAsGoal: true };
        }
      },
    };

    return details;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    if (isPlanLifecycleToolUnavailableInSubagent(ToolNames.EXIT_PLAN_MODE)) {
      return buildSubagentPlanToolBlockedResult(
        ToolNames.EXIT_PLAN_MODE,
        'ExitPlanModeTool',
        debugLogger,
      );
    }

    // Not in plan mode and no approval snapshot — the user may have
    // manually switched modes. Return a guidance error instead of a
    // permission deny. If there IS an approval snapshot, let the
    // stale-revision check below handle it (concurrent exit scenario).
    if (this.config.getApprovalMode() !== ApprovalMode.PLAN && !this.approval) {
      return this.errorResult(
        this.outsidePlanGuidanceMessage(),
        ToolErrorType.EXECUTION_DENIED,
      );
    }

    const { plan, originalRequest, researchSummary } = this.params;
    if (isPlanRequiredTeammateContext()) {
      return this.executePlanRequiredTeammate(
        plan,
        originalRequest,
        researchSummary,
        signal,
      );
    }

    const approval = this.approval;
    if (!approval) {
      return this.noActionResult(
        'Plan execution was not approved. Remaining in plan mode.',
      );
    }
    const { snapshot, targetMode } = approval;
    if (signal.aborted) {
      return this.noActionResult(
        'Plan exit was cancelled. Remaining in plan mode.',
      );
    }
    if (
      this.config.getApprovalMode() !== ApprovalMode.PLAN ||
      this.config.getApprovalModeRevision() !== snapshot.approvalModeRevision
    ) {
      return this.noActionResult(
        'Plan approval is stale because the approval mode changed. No action was taken.',
      );
    }

    this.savePlanBestEffort(snapshot.plan);
    try {
      this.config.setApprovalMode(targetMode, {
        fromApprovedPlanExit: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.error(
        `[ExitPlanModeTool] Failed to set approval mode to "${targetMode}": ${message}`,
      );
      return this.errorResult(
        `Failed to exit plan mode: ${message}. Remaining in plan mode.`,
      );
    }

    if (approval.runAsGoal) {
      return {
        llmContent: runPlanAsGoalLlmContent(snapshot.plan),
        returnDisplay: {
          type: 'plan_summary',
          message: 'User approved. A Goal will be proposed for approval.',
          plan: snapshot.plan,
        },
      };
    }

    return {
      llmContent: APPROVED_LLM_CONTENT,
      returnDisplay: {
        type: 'plan_summary',
        message: 'User approved.',
        plan: snapshot.plan,
      },
    };
  }

  private async executePlanRequiredTeammate(
    plan: string,
    originalRequest: string | undefined,
    researchSummary: string | undefined,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    if (this.config.getApprovalMode() !== ApprovalMode.PLAN) {
      return this.errorResult('Not in plan mode — no action taken.');
    }

    const approvalModeRevision = this.config.getApprovalModeRevision();
    const teammate = getTeammateContext();
    const manager = this.config.getTeamManager();
    if (!teammate || !manager) {
      return this.errorResult(
        'Plan-required teammate approval is unavailable in this context.',
      );
    }

    let decision: TeamPlanApprovalDecision;
    try {
      decision = await manager.requestPlanApproval({
        teammateName: teammate.agentName,
        plan,
        originalRequest,
        researchSummary,
        signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.errorResult(
        `Failed to request leader plan approval: ${message}`,
      );
    }

    if (signal.aborted) {
      return this.noActionResult(
        'Leader plan approval was cancelled. Remaining in plan mode.',
      );
    }
    if (
      this.config.getApprovalMode() !== ApprovalMode.PLAN ||
      this.config.getApprovalModeRevision() !== approvalModeRevision
    ) {
      return this.noActionResult(
        'Leader plan approval is stale because the approval mode changed. No action was taken.',
      );
    }

    if (decision.action === 'reject') {
      const feedback = decision.message
        ? `\n\nLeader feedback:\n${decision.message}`
        : '';
      const llmContent =
        'Leader rejected the plan. Revise the plan based on the feedback and call exit_plan_mode again.' +
        feedback;
      return {
        llmContent,
        returnDisplay: {
          type: 'plan_summary',
          message: 'Leader rejected the plan.',
          plan: `${plan.trimEnd()}\n\n---\n\n${llmContent}`,
          rejected: true,
        },
      };
    }

    if (decision.targetMode === ApprovalMode.PLAN) {
      return this.errorResult(
        'Leader approval did not select an execution mode. Remaining in plan mode.',
      );
    }

    this.savePlanBestEffort(plan);
    try {
      this.config.setApprovalMode(decision.targetMode, {
        fromApprovedPlanExit: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.errorResult(
        `Leader approved the plan, but failed to exit plan mode: ${message}.`,
      );
    }

    const feedback = decision.message
      ? ` Leader note: ${decision.message}`
      : '';
    return {
      llmContent: `Leader approved.${feedback} You can now start coding. Start with updating your todo list if applicable.`,
      returnDisplay: {
        type: 'plan_summary',
        message: 'Leader approved.',
        plan,
      },
    };
  }

  private outsidePlanGuidanceMessage(): string {
    const currentMode = this.config.getApprovalMode();
    return (
      `You are not in plan mode (current mode: ${currentMode}). ` +
      `The user may have manually switched modes via Shift+Tab or /approval-mode. ` +
      `Do not call exit_plan_mode again. Continue working in the current mode.`
    );
  }

  private savePlanBestEffort(plan: string): void {
    try {
      this.config.savePlan(plan);
    } catch (error) {
      debugLogger.warn(
        `[ExitPlanModeTool] Failed to save plan to disk: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private errorResult(message: string, type?: ToolErrorType): ToolResult {
    return {
      llmContent: message,
      returnDisplay: message,
      error: { message, type },
    };
  }

  private noActionResult(message: string): ToolResult {
    return {
      llmContent: message,
      returnDisplay: message,
    };
  }
}

export class ExitPlanModeTool extends BaseDeclarativeTool<
  ExitPlanModeParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.EXIT_PLAN_MODE;

  constructor(private readonly config: Config) {
    super(
      ExitPlanModeTool.Name,
      ToolDisplayNames.EXIT_PLAN_MODE,
      exitPlanModeToolDescription,
      Kind.Think,
      exitPlanModeToolSchemaData.parametersJsonSchema as Record<
        string,
        unknown
      >,
      true,
      false,
      true,
      // Plan mode tells the model to call exit_plan_mode directly, so its schema
      // must always be declared instead of deferred.
      true,
    );
  }

  override validateToolParams(params: ExitPlanModeParams): string | null {
    if (
      !params.plan ||
      typeof params.plan !== 'string' ||
      params.plan.trim() === ''
    ) {
      return 'Parameter "plan" must be a non-empty string.';
    }
    return null;
  }

  protected createInvocation(params: ExitPlanModeParams) {
    return new ExitPlanModeToolInvocation(this.config, params);
  }
}
