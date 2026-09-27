/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Shared ACP route table
// ---------------------------------------------------------------------------
// Single source of truth for the URL→JSON-RPC mapping used by both
// `AcpWsTransport` and `AcpHttpTransport`. Keeping a single table
// prevents route inconsistencies between the two transport variants.
// ---------------------------------------------------------------------------

const REQUESTED_SESSION_ID_META_KEY = 'o1-code/sessionId';

// Kept local (instead of reusing `isRecord` from `acpTransportUtils.ts`):
// acpTransportUtils imports this module's ROUTE_TABLE, so re-importing the
// predicate from there would silently restore the
// acpRouteTable -> acpTransportUtils -> acpRouteTable runtime cycle this
// change exists to break. ESM cycles compile and test green, so the guard is
// this comment — do not consolidate without breaking the cycle some other
// way first.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface RouteMapping {
  method: string;
  /**
   * Extract JSON-RPC params from URL path segments, request body, and — for the
   * REST-style query-backed helpers (`/file?path=…&maxBytes=…`, `/stat`,
   * `/list`, `/glob`, `context-usage?detail=…`) — the URL query string. The
   * daemon's ACP handlers are strictly typed (e.g. `maxBytes` must be a
   * `number`, `detail` must be the boolean `true`), so query values — which
   * arrive as strings — are coerced to the expected type here via
   * `strParam`/`numParam`/`boolParam`.
   */
  extractParams: (
    segments: string[],
    body: unknown,
    httpMethod: string,
    query?: URLSearchParams,
  ) => Record<string, unknown>;
  /**
   * True for notifications (no response expected). The transport will
   * NOT wait for a JSON-RPC response from the server.
   */
  notification?: boolean;
}

/** A string query param, omitted when absent. */
function strParam(
  q: URLSearchParams | undefined,
  name: string,
): Record<string, string> {
  const v = q?.get(name);
  return v == null ? {} : { [name]: v };
}

/**
 * A numeric query param coerced to a `number`, omitted when absent. The daemon's
 * ACP handlers require a real number (a query string's `"123"` would be
 * rejected). An unparseable value forwards as `NaN`, which the daemon rejects
 * the same way it would a malformed REST query.
 *
 * An empty value (`?maxBytes=`) is treated as ABSENT, not `0`: `Number('')` is
 * `0`, a plausible-but-unintended value the handler would otherwise honor.
 */
function numParam(
  q: URLSearchParams | undefined,
  name: string,
): Record<string, number> {
  const v = q?.get(name);
  return v == null || v === '' ? {} : { [name]: Number(v) };
}

/** A boolean query param (`?detail=true`), omitted when absent. */
function boolParam(
  q: URLSearchParams | undefined,
  name: string,
): Record<string, boolean> {
  const v = q?.get(name);
  // Treat an empty value (`?detail=`) as absent, mirroring `numParam`, so we
  // don't forward `{ detail: false }` for a param the caller never set.
  return v == null || v === '' ? {} : { [name]: v === 'true' };
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return isRecord(body) ? body : {};
}

export interface RouteEntry {
  httpMethod: string;
  pattern: RegExp;
  mapping: RouteMapping;
}

/**
 * Map of `METHOD PATH_PATTERN` to JSON-RPC method + params extractor.
 * Path segments are split by `/` after stripping the base URL prefix.
 *
 * Pattern conventions:
 *   - `:param` = named path param (consumed positionally)
 *   - `*`      = rest wildcard
 */
export const ROUTE_TABLE: readonly RouteEntry[] = [
  // POST /session → session/new
  // ACP standard: session/new always creates an isolated session.
  // Strip non-standard params (sessionScope) — the server enforces
  // 'thread' regardless, so passing it is harmless but misleading.
  {
    httpMethod: 'POST',
    pattern: /^\/session\/?$/,
    mapping: {
      method: 'session/new',
      extractParams: (_s, body) => {
        if (!isRecord(body)) return {};
        const {
          sessionScope: _,
          sessionId,
          _meta,
          ...rest
        } = body as Record<string, unknown>;
        if (sessionId === undefined) {
          return { ...rest, ...(_meta !== undefined ? { _meta } : {}) };
        }
        return {
          ...rest,
          _meta: {
            ...(isRecord(_meta) ? _meta : {}),
            [REQUESTED_SESSION_ID_META_KEY]: sessionId,
          },
        };
      },
    },
  },
  // POST /session/:id/prompt → session/prompt
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/prompt$/,
    mapping: {
      method: 'session/prompt',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/cancel → session/cancel (notification)
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/cancel$/,
    mapping: {
      method: 'session/cancel',
      extractParams: (segs) => ({ sessionId: segs[0] }),
      notification: true,
    },
  },
  // DELETE /session/:id → session/close
  {
    httpMethod: 'DELETE',
    pattern: /^\/session\/([^/]+)\/?$/,
    mapping: {
      method: 'session/close',
      extractParams: (segs) => ({ sessionId: segs[0] }),
    },
  },
  // POST /session/:id/load → session/load
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/load$/,
    mapping: {
      method: 'session/load',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/resume → session/resume
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/resume$/,
    mapping: {
      method: 'session/resume',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/permission/:reqId → session/permission
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/permission\/([^/]+)$/,
    mapping: {
      method: 'session/permission',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
        requestId: segs[1],
      }),
    },
  },
  // POST /permission/:reqId (without session prefix)
  {
    httpMethod: 'POST',
    pattern: /^\/permission\/([^/]+)$/,
    mapping: {
      method: 'session/permission',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        requestId: segs[0],
      }),
    },
  },
  // POST /session/:id/model → session/set_model
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/model$/,
    mapping: {
      method: 'session/set_model',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // GET /capabilities → use initialize result (handled specially)
  {
    httpMethod: 'GET',
    pattern: /^\/capabilities\/?$/,
    mapping: {
      method: '_capabilities',
      extractParams: () => ({}),
    },
  },
  // POST /workspace/mcp/initialize → _o1code/workspace/mcp/initialize
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/mcp\/initialize\/?$/,
    mapping: {
      method: '_o1code/workspace/mcp/initialize',
      extractParams: (_segs, body) => bodyRecord(body),
    },
  },
  // POST /workspace/mcp/reload → _o1code/workspace/mcp/reload
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/mcp\/reload\/?$/,
    mapping: {
      method: '_o1code/workspace/mcp/reload',
      extractParams: (_segs, body) => bodyRecord(body),
    },
  },
  // GET /health
  {
    httpMethod: 'GET',
    pattern: /^\/health\/?$/,
    mapping: {
      method: '_o1code/health',
      extractParams: () => ({}),
    },
  },

  // ---- Vendor session extensions (_o1code/ prefix) -------------------------

  // PATCH /session/:id/metadata → _o1code/session/update_metadata
  {
    httpMethod: 'PATCH',
    pattern: /^\/session\/([^/]+)\/metadata$/,
    mapping: {
      method: '_o1code/session/update_metadata',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // PATCH /session/:id/organization → _o1code/session/update_organization
  {
    httpMethod: 'PATCH',
    pattern: /^\/session\/([^/]+)\/organization$/,
    mapping: {
      method: '_o1code/session/update_organization',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/heartbeat → _o1code/session/heartbeat
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/heartbeat$/,
    mapping: {
      method: '_o1code/session/heartbeat',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // GET /session/:id/artifacts → _o1code/session/artifacts
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/artifacts$/,
    mapping: {
      method: '_o1code/session/artifacts',
      extractParams: (segs) => ({ sessionId: segs[0] }),
    },
  },
  // GET /session/:id/attachments → _o1code/session/attachments
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/attachments$/,
    mapping: {
      method: '_o1code/session/attachments',
      extractParams: (segs) => ({ sessionId: segs[0] }),
    },
  },
  // POST /session/:id/artifacts → _o1code/session/artifacts/add
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/artifacts$/,
    mapping: {
      method: '_o1code/session/artifacts/add',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // DELETE /session/:id/artifacts/:artifactId → _o1code/session/artifacts/remove
  {
    httpMethod: 'DELETE',
    pattern: /^\/session\/([^/]+)\/artifacts\/([^/]+)$/,
    mapping: {
      method: '_o1code/session/artifacts/remove',
      extractParams: (segs, body) => {
        const record = isRecord(body) ? body : {};
        return {
          sessionId: segs[0],
          artifactId: segs[1],
          ...(typeof record.clientId === 'string'
            ? { clientId: record.clientId }
            : {}),
        };
      },
    },
  },
  // POST /session/:id/recap → _o1code/session/recap
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/recap$/,
    mapping: {
      method: '_o1code/session/recap',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/btw → _o1code/session/btw
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/btw$/,
    mapping: {
      method: '_o1code/session/btw',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/shell → _o1code/session/shell
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/shell$/,
    mapping: {
      method: '_o1code/session/shell',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/branch → session/fork
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/branch$/,
    mapping: {
      method: 'session/fork',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },
  // POST /session/:id/detach → _o1code/session/detach
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/detach$/,
    mapping: {
      method: '_o1code/session/detach',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
      }),
    },
  },

  // ---- Session diagnostic routes (_o1code/ prefix) -------------------------

  // GET /session/:id/context → _o1code/session/context
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/context$/,
    mapping: {
      method: '_o1code/session/context',
      extractParams: (segs) => ({ sessionId: segs[0] }),
    },
  },
  // GET /session/:id/context-usage?detail=true → _o1code/session/context_usage
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/context-usage$/,
    mapping: {
      method: '_o1code/session/context_usage',
      extractParams: (segs, _b, _m, q) => ({
        sessionId: segs[0],
        ...boolParam(q, 'detail'),
      }),
    },
  },
  // GET /session/:id/supported-commands → _o1code/session/supported_commands
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/supported-commands$/,
    mapping: {
      method: '_o1code/session/supported_commands',
      extractParams: (segs) => ({ sessionId: segs[0] }),
    },
  },
  // GET /session/:id/tasks → _o1code/session/tasks
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/tasks$/,
    mapping: {
      method: '_o1code/session/tasks',
      extractParams: (segs, _body, _method, query) => ({
        sessionId: segs[0],
        ...boolParam(query, 'includeWorkflows'),
      }),
    },
  },
  // POST /session/:id/tasks/:taskId/cancel → _o1code/session/tasks/cancel
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/tasks\/([^/]+)\/cancel$/,
    mapping: {
      method: '_o1code/session/tasks/cancel',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
        taskId: segs[1],
      }),
    },
  },
  // POST /session/:id/tasks/:taskId/workflow-action → _o1code/session/tasks/workflow_action
  {
    httpMethod: 'POST',
    pattern: /^\/session\/([^/]+)\/tasks\/([^/]+)\/workflow-action$/,
    mapping: {
      method: '_o1code/session/tasks/workflow_action',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        sessionId: segs[0],
        taskId: segs[1],
      }),
    },
  },
  // GET /session/:id/agents → _o1code/session/agents
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/agents$/,
    mapping: {
      method: '_o1code/session/agents',
      extractParams: (segs) => ({ sessionId: segs[0] }),
    },
  },
  // GET /session/:id/agent-trace → _o1code/session/agent_trace
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/agent-trace$/,
    mapping: {
      method: '_o1code/session/agent_trace',
      extractParams: (segs, _body, _method, query) => ({
        sessionId: segs[0],
        ...strParam(query, 'rootAgentId'),
      }),
    },
  },
  // GET /session/:id/lsp -> _o1code/session/lsp
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/lsp$/,
    mapping: {
      method: '_o1code/session/lsp',
      extractParams: (segs) => ({ sessionId: segs[0] }),
    },
  },
  // GET /session/:id/saved-workflows/:name -> _o1code/session/saved_workflow
  {
    httpMethod: 'GET',
    pattern: /^\/session\/([^/]+)\/saved-workflows\/([^/]+)$/,
    mapping: {
      method: '_o1code/session/saved_workflow',
      extractParams: (segs) => ({ sessionId: segs[0], name: segs[1] }),
    },
  },

  // ---- Granular workspace routes (_o1code/workspace/*) ---------------------

  // GET /workspace/mcp → _o1code/workspace/mcp
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/mcp\/?$/,
    mapping: {
      method: '_o1code/workspace/mcp',
      extractParams: () => ({}),
    },
  },
  // GET /workspace/skills → _o1code/workspace/skills
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/skills\/?$/,
    mapping: {
      method: '_o1code/workspace/skills',
      extractParams: () => ({}),
    },
  },
  // GET /workspace/providers → _o1code/workspace/providers
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/providers\/?$/,
    mapping: {
      method: '_o1code/workspace/providers',
      extractParams: () => ({}),
    },
  },
  // GET /workspace/env → _o1code/workspace/env
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/env\/?$/,
    mapping: {
      method: '_o1code/workspace/env',
      extractParams: () => ({}),
    },
  },
  // GET /workspace/preflight → _o1code/workspace/preflight
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/preflight\/?$/,
    mapping: {
      method: '_o1code/workspace/preflight',
      extractParams: () => ({}),
    },
  },
  // POST /workspace/init → _o1code/workspace/init
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/init\/?$/,
    mapping: {
      method: '_o1code/workspace/init',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // GET /workspace/trust → _o1code/workspace/trust
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/trust\/?$/,
    mapping: {
      method: '_o1code/workspace/trust',
      extractParams: () => ({}),
    },
  },
  // POST /workspace/trust/request → _o1code/workspace/trust/request
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/trust\/request\/?$/,
    mapping: {
      method: '_o1code/workspace/trust/request',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // GET /workspace/permissions → _o1code/workspace/permissions
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/permissions\/?$/,
    mapping: {
      method: '_o1code/workspace/permissions',
      extractParams: () => ({}),
    },
  },
  // POST /workspace/permissions → _o1code/workspace/permissions/set
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/permissions\/?$/,
    mapping: {
      method: '_o1code/workspace/permissions/set',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // GET /workspace/voice → _o1code/workspace/voice
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/voice\/?$/,
    mapping: {
      method: '_o1code/workspace/voice',
      extractParams: () => ({}),
    },
  },
  // POST /workspace/voice → _o1code/workspace/voice/set
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/voice\/?$/,
    mapping: {
      method: '_o1code/workspace/voice/set',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // GET /workspace/tools → _o1code/workspace/tools
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/tools\/?$/,
    mapping: {
      method: '_o1code/workspace/tools',
      extractParams: () => ({}),
    },
  },
  // GET /workspace/memory → _o1code/workspace/memory
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/memory\/?$/,
    mapping: {
      method: '_o1code/workspace/memory',
      extractParams: () => ({}),
    },
  },
  // POST /workspace/memory → _o1code/workspace/memory/write
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/memory\/?$/,
    mapping: {
      method: '_o1code/workspace/memory/write',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // POST /workspace/memory/remember → _o1code/workspace/memory/remember
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/memory\/remember\/?$/,
    mapping: {
      method: '_o1code/workspace/memory/remember',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // GET /workspace/memory/remember/:taskId → _o1code/workspace/memory/remember/get
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/memory\/remember\/([^/]+)$/,
    mapping: {
      method: '_o1code/workspace/memory/remember/get',
      extractParams: (segs) => ({ taskId: segs[0] }),
    },
  },
  // POST /workspace/memory/forget → _o1code/workspace/memory/forget
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/memory\/forget\/?$/,
    mapping: {
      method: '_o1code/workspace/memory/forget',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // GET /workspace/memory/forget/:taskId → _o1code/workspace/memory/forget/get
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/memory\/forget\/([^/]+)$/,
    mapping: {
      method: '_o1code/workspace/memory/forget/get',
      extractParams: (segs) => ({ taskId: segs[0] }),
    },
  },
  // POST /workspace/memory/dream → _o1code/workspace/memory/dream
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/memory\/dream\/?$/,
    mapping: {
      method: '_o1code/workspace/memory/dream',
      extractParams: () => ({}),
    },
  },
  // GET /workspace/memory/dream/:taskId → _o1code/workspace/memory/dream/get
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/memory\/dream\/([^/]+)$/,
    mapping: {
      method: '_o1code/workspace/memory/dream/get',
      extractParams: (segs) => ({ taskId: segs[0] }),
    },
  },
  // GET /workspace/agents → _o1code/workspace/agents/list
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/agents\/?$/,
    mapping: {
      method: '_o1code/workspace/agents/list',
      extractParams: () => ({}),
    },
  },
  // POST /workspace/agents → _o1code/workspace/agents/create
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/agents\/?$/,
    mapping: {
      method: '_o1code/workspace/agents/create',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // GET /workspace/agents/:agentType → _o1code/workspace/agents/get
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/agents\/([^/]+)\/?$/,
    mapping: {
      method: '_o1code/workspace/agents/get',
      extractParams: (segs) => ({ agentType: segs[0] }),
    },
  },
  // DELETE /workspace/agents/:agentType → _o1code/workspace/agents/delete
  {
    httpMethod: 'DELETE',
    pattern: /^\/workspace\/agents\/([^/]+)\/?$/,
    mapping: {
      method: '_o1code/workspace/agents/delete',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        agentType: segs[0],
      }),
    },
  },
  // GET /workspace/mcp/:server/tools → _o1code/workspace/mcp/tools
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/mcp\/([^/]+)\/tools\/?$/,
    mapping: {
      method: '_o1code/workspace/mcp/tools',
      extractParams: (segs) => ({ serverName: segs[0] }),
    },
  },
  // GET /workspace/mcp/:server/resources → _o1code/workspace/mcp/resources
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/mcp\/([^/]+)\/resources\/?$/,
    mapping: {
      method: '_o1code/workspace/mcp/resources',
      extractParams: (segs) => ({ serverName: segs[0] }),
    },
  },
  // POST /workspace/mcp/servers → _o1code/workspace/mcp/servers/add
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/mcp\/servers\/?$/,
    mapping: {
      method: '_o1code/workspace/mcp/servers/add',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // DELETE /workspace/mcp/servers/:name → _o1code/workspace/mcp/servers/remove
  {
    httpMethod: 'DELETE',
    pattern: /^\/workspace\/mcp\/servers\/([^/]+)\/?$/,
    mapping: {
      method: '_o1code/workspace/mcp/servers/remove',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        name: segs[0],
      }),
    },
  },
  // POST /workspace/set-tool-enabled → _o1code/workspace/set_tool_enabled
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/set-tool-enabled\/?$/,
    mapping: {
      method: '_o1code/workspace/set_tool_enabled',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // POST /workspace/mcp/:server/restart → _o1code/workspace/restart_mcp_server
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/mcp\/([^/]+)\/restart\/?$/,
    mapping: {
      method: '_o1code/workspace/restart_mcp_server',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        serverName: segs[0],
      }),
    },
  },
  // GET /workspace/auth/status → _o1code/workspace/auth/status
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/auth\/status\/?$/,
    mapping: {
      method: '_o1code/workspace/auth/status',
      extractParams: () => ({}),
    },
  },

  // GET /workspace/:id/sessions → session/list
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/(.+)\/sessions\/?$/,
    mapping: {
      method: 'session/list',
      extractParams: (segs, _body, _method, query) => {
        const size = query?.get('size');
        return {
          workspaceCwd: segs[0],
          ...strParam(query, 'cursor'),
          ...strParam(query, 'archiveState'),
          ...strParam(query, 'view'),
          ...strParam(query, 'group'),
          ...strParam(query, 'parentSessionId'),
          ...strParam(query, 'sourceType'),
          ...strParam(query, 'sourceId'),
          ...(size == null || size === ''
            ? {}
            : { _meta: { size: Number(size) } }),
        };
      },
    },
  },
  // GET /workspace/:id/session-groups → _o1code/workspace/session_groups/list
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/(.+)\/session-groups\/?$/,
    mapping: {
      method: '_o1code/workspace/session_groups/list',
      extractParams: (segs) => ({ workspaceCwd: segs[0] }),
    },
  },
  // POST /workspace/:id/session-groups → _o1code/workspace/session_groups/create
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/(.+)\/session-groups\/?$/,
    mapping: {
      method: '_o1code/workspace/session_groups/create',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        workspaceCwd: segs[0],
      }),
    },
  },
  // PATCH /workspace/:id/session-groups/:groupId → _o1code/workspace/session_groups/update
  {
    httpMethod: 'PATCH',
    pattern: /^\/workspace\/(.+)\/session-groups\/([^/]+)\/?$/,
    mapping: {
      method: '_o1code/workspace/session_groups/update',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        workspaceCwd: segs[0],
        groupId: segs[1],
      }),
    },
  },
  // DELETE /workspace/:id/session-groups/:groupId → _o1code/workspace/session_groups/delete
  {
    httpMethod: 'DELETE',
    pattern: /^\/workspace\/(.+)\/session-groups\/([^/]+)\/?$/,
    mapping: {
      method: '_o1code/workspace/session_groups/delete',
      extractParams: (segs) => ({
        workspaceCwd: segs[0],
        groupId: segs[1],
      }),
    },
  },

  // ---- Workspace catch-all (must be AFTER all specific workspace routes) --
  // Handles any workspace path not matched above (e.g., /workspace/custom/path).
  {
    httpMethod: 'GET',
    pattern: /^\/workspace\/(.+)$/,
    mapping: {
      method: '_o1code/workspace',
      extractParams: (segs) => ({ path: segs[0] }),
    },
  },
  {
    httpMethod: 'POST',
    pattern: /^\/workspace\/(.+)$/,
    mapping: {
      method: '_o1code/workspace',
      extractParams: (segs, body) => ({
        ...bodyRecord(body),
        path: segs[0],
      }),
    },
  },

  // ---- File system routes -----------------------------------------------
  // These map the DaemonClient's file-system helpers to _o1code/file/* RPC
  // methods on the ACP daemon.

  // GET /file?path=…&maxBytes=…&line=…&limit=… → _o1code/file/read
  {
    httpMethod: 'GET',
    pattern: /^\/file\/?$/,
    mapping: {
      method: '_o1code/file/read',
      extractParams: (_s, _b, _m, q) => ({
        ...strParam(q, 'path'),
        ...numParam(q, 'maxBytes'),
        ...numParam(q, 'line'),
        ...numParam(q, 'limit'),
        ...strParam(q, 'cursor'),
      }),
    },
  },
  // GET /file/bytes?path=…&offset=…&maxBytes=… → _o1code/file/read_bytes
  {
    httpMethod: 'GET',
    pattern: /^\/file\/bytes\/?$/,
    mapping: {
      method: '_o1code/file/read_bytes',
      extractParams: (_s, _b, _m, q) => ({
        ...strParam(q, 'path'),
        ...numParam(q, 'offset'),
        ...numParam(q, 'maxBytes'),
      }),
    },
  },
  // GET /stat?path=… → _o1code/file/stat
  {
    httpMethod: 'GET',
    pattern: /^\/stat\/?$/,
    mapping: {
      method: '_o1code/file/stat',
      extractParams: (_s, _b, _m, q) => ({ ...strParam(q, 'path') }),
    },
  },
  // GET /list?path=… → _o1code/file/list
  {
    httpMethod: 'GET',
    pattern: /^\/list\/?$/,
    mapping: {
      method: '_o1code/file/list',
      extractParams: (_s, _b, _m, q) => ({ ...strParam(q, 'path') }),
    },
  },
  // GET /glob?pattern=… → _o1code/file/glob
  {
    httpMethod: 'GET',
    pattern: /^\/glob\/?$/,
    mapping: {
      method: '_o1code/file/glob',
      extractParams: (_s, _b, _m, q) => ({ ...strParam(q, 'pattern') }),
    },
  },
  // POST /file/write → _o1code/file/write
  {
    httpMethod: 'POST',
    pattern: /^\/file\/write\/?$/,
    mapping: {
      method: '_o1code/file/write',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // POST /file/edit → _o1code/file/edit
  {
    httpMethod: 'POST',
    pattern: /^\/file\/edit\/?$/,
    mapping: {
      method: '_o1code/file/edit',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },

  // ---- Bulk session operations -------------------------------------------

  // POST /sessions/delete → _o1code/sessions/delete
  {
    httpMethod: 'POST',
    pattern: /^\/sessions\/delete\/?$/,
    mapping: {
      method: '_o1code/sessions/delete',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // POST /sessions/archive → _o1code/sessions/archive
  {
    httpMethod: 'POST',
    pattern: /^\/sessions\/archive\/?$/,
    mapping: {
      method: '_o1code/sessions/archive',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
  // POST /sessions/unarchive → _o1code/sessions/unarchive
  {
    httpMethod: 'POST',
    pattern: /^\/sessions\/unarchive\/?$/,
    mapping: {
      method: '_o1code/sessions/unarchive',
      extractParams: (_s, body) => bodyRecord(body),
    },
  },
];
