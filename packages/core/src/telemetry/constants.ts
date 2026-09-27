/**
 * @license
 * Copyright 2025 Google LLC
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'o1-code';

export const EVENT_USER_PROMPT = 'o1-code.user_prompt';
export const EVENT_USER_RETRY = 'o1-code.user_retry';
export const EVENT_TOOL_CALL = 'o1-code.tool_call';
export const EVENT_REPEATED_TOOL_FAILURE_GUARD =
  'o1-code.repeated_tool_failure_guard';
export const EVENT_API_REQUEST = 'o1-code.api_request';
export const EVENT_API_ERROR = 'o1-code.api_error';
export const EVENT_API_CANCEL = 'o1-code.api_cancel';
export const EVENT_API_RESPONSE = 'o1-code.api_response';
export const EVENT_CLI_CONFIG = 'o1-code.config';
export const EVENT_SESSION_START = 'session.start';
export const EVENT_SESSION_END = 'session.end';
export const EVENT_EXTENSION_DISABLE = 'o1-code.extension_disable';
export const EVENT_EXTENSION_ENABLE = 'o1-code.extension_enable';
export const EVENT_EXTENSION_INSTALL = 'o1-code.extension_install';
export const EVENT_EXTENSION_UNINSTALL = 'o1-code.extension_uninstall';
export const EVENT_EXTENSION_UPDATE = 'o1-code.extension_update';
export const EVENT_FLASH_FALLBACK = 'o1-code.flash_fallback';
export const EVENT_RIPGREP_FALLBACK = 'o1-code.ripgrep_fallback';
export const EVENT_RIPGREP_RUNTIME_RECOVERY =
  'o1-code.ripgrep_runtime_recovery';
export const EVENT_NEXT_SPEAKER_CHECK = 'o1-code.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'o1-code.slash_command';
export const EVENT_IDE_CONNECTION = 'o1-code.ide_connection';
export const EVENT_CHAT_COMPRESSION = 'o1-code.chat_compression';
export const EVENT_INVALID_CHUNK = 'o1-code.chat.invalid_chunk';
export const EVENT_CONTENT_RETRY = 'o1-code.chat.content_retry';
export const EVENT_CONTENT_RETRY_FAILURE = 'o1-code.chat.content_retry_failure';
export const EVENT_PROTOCOL_TAG_SANITIZED =
  'o1-code.chat.protocol_tag_sanitized';
// Phase 4b — HTTP-status retry telemetry emitted by `retryWithBackoff` for
// 429 / 5xx errors at LLM call sites. Distinct from EVENT_CONTENT_RETRY,
// which is fired by llmChat for InvalidStreamError retries on a separate
// retry budget.
export const EVENT_API_RETRY = 'o1-code.api_retry';
export const EVENT_CONVERSATION_FINISHED = 'o1-code.conversation_finished';
export const EVENT_MALFORMED_JSON_RESPONSE = 'o1-code.malformed_json_response';
export const EVENT_FILE_OPERATION = 'o1-code.file_operation';
export const EVENT_MODEL_SLASH_COMMAND = 'o1-code.slash_command.model';
export const EVENT_SUBAGENT_EXECUTION = 'o1-code.subagent_execution';
export const EVENT_GOAL_STATE = 'o1-code.goal_state';
export const EVENT_SKILL_LAUNCH = 'o1-code.skill_launch';
export const EVENT_AUTH = 'o1-code.auth';
export const EVENT_USER_FEEDBACK = 'o1-code.user_feedback';
export const EVENT_TOOL_OUTPUT_TRUNCATED = 'o1-code.tool_output_truncated';

export const DEFAULT_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH = 1024 * 1024;
export const SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT = 100 * 1024 * 1024;

export function isValidSensitiveSpanAttributeMaxLength(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH_LIMIT
  );
}

// Prompt Suggestion Events
export const EVENT_PROMPT_SUGGESTION = 'o1-code.prompt_suggestion';
export const EVENT_SPECULATION = 'o1-code.speculation';

// Workflow Events
export const EVENT_WORKFLOW_KEYWORD = 'o1-code.workflow_keyword';
export const EVENT_WORKFLOW_RUN = 'o1-code.workflow_run';
export const EVENT_WORKFLOW_SIZE_WARNING = 'o1-code.workflow_size_warning';

// Arena Events
export const EVENT_ARENA_SESSION_STARTED = 'o1-code.arena_session_started';
export const EVENT_ARENA_AGENT_COMPLETED = 'o1-code.arena_agent_completed';
export const EVENT_ARENA_SESSION_ENDED = 'o1-code.arena_session_ended';

// Performance Events
export const EVENT_STARTUP_PERFORMANCE = 'o1-code.startup.performance';
export const EVENT_MEMORY_USAGE = 'o1-code.memory.usage';
export const EVENT_PERFORMANCE_BASELINE = 'o1-code.performance.baseline';
export const EVENT_PERFORMANCE_REGRESSION = 'o1-code.performance.regression';

// Managed Auto-Memory Events
export const EVENT_MEMORY_EXTRACT = 'o1-code.memory.extract';
export const EVENT_MEMORY_DREAM = 'o1-code.memory.dream';
export const EVENT_MEMORY_RECALL = 'o1-code.memory.recall';
export const EVENT_MEMORY_RECALL_DELIVERY = 'o1-code.memory.recall.delivery';

// Session Tracing Span Names
export const SPAN_INTERACTION = 'o1-code.interaction';
export const SPAN_LLM_REQUEST = 'o1-code.llm_request';
export const SPAN_TOOL = 'o1-code.tool';
export const SPAN_TOOL_EXECUTION = 'o1-code.tool.execution';
/** Brackets the time a tool spends in `awaiting_approval` waiting on the user. */
export const SPAN_TOOL_BLOCKED_ON_USER = 'o1-code.tool.blocked_on_user';
/** Wraps each pre/post-tool-use hook fire site for per-hook latency / decision tracking. */
export const SPAN_HOOK = 'o1-code.hook';
/**
 * Wraps a single subagent invocation. Parents the LLM/tool/hook spans the
 * subagent emits, so concurrent subagents (parallel AGENT tool calls) get
 * isolated subtrees instead of interleaving under the parent interaction.
 */
export const SPAN_SUBAGENT = 'o1-code.subagent';

// Tool failure kind span attribute and vocabulary — shared across
// coreToolScheduler, session-tracing, and telemetry docs so the
// write sites and documented values cannot drift.
export const TOOL_FAILURE_KIND_ATTRIBUTE = 'tool.failure_kind';
export const TOOL_FAILURE_KIND_CANCELLED = 'cancelled';
export const TOOL_FAILURE_KIND_PRE_HOOK_BLOCKED = 'pre_hook_blocked';
export const TOOL_FAILURE_KIND_INVOCATION_GUARD_DENIED =
  'invocation_guard_denied';
export const TOOL_FAILURE_KIND_POST_HOOK_STOPPED = 'post_hook_stopped';
export const TOOL_FAILURE_KIND_TOOL_ERROR = 'tool_error';
export const TOOL_FAILURE_KIND_TOOL_EXCEPTION = 'tool_exception';
export const TOOL_FAILURE_KIND_PERMISSION_DENIED = 'permission_denied';
export const TOOL_FAILURE_KIND_PERMISSION_HOOK_DENIED =
  'permission_hook_denied';
export const TOOL_FAILURE_KIND_PLAN_MODE_BLOCKED = 'plan_mode_blocked';
export const TOOL_FAILURE_KIND_NON_INTERACTIVE_DENIED =
  'non_interactive_denied';
export const TOOL_FAILURE_KIND_BACKGROUND_AGENT_DENIED =
  'background_agent_denied';
export const TOOL_FAILURE_KIND_TIMEOUT = 'timeout';
