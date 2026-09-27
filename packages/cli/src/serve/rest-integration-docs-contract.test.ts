/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSION_TRANSCRIPT_MAX_LIMIT } from '@organizaone/o1-code-core';
import { DaemonClient } from '@organizaone/o1-code-sdk/daemon';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SERVE_CAPABILITY_REGISTRY } from './capabilities.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const PROTOCOL = path.join(
  REPO_ROOT,
  'docs/developers/o1-code-serve-protocol.md',
);
// The published links point at the repository brand.json names.
const PROTOCOL_URL = `${
  (
    JSON.parse(readFileSync(path.join(REPO_ROOT, 'brand.json'), 'utf8')) as {
      identity: { repoUrl: string };
    }
  ).identity.repoUrl
}/blob/main/docs/developers/o1-code-serve-protocol.md`;
const OPENAPI = path.join(
  REPO_ROOT,
  'docs/developers/daemon-rest-api.openapi.json',
);
const SERVE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** The supported integration surface the OpenAPI document publishes. */
const SUPPORTED_OPERATIONS: readonly string[] = [
  'GET /health',
  'GET /capabilities',
  'POST /session',
  'DELETE /session/:id',
  'POST /session/:id/prompt',
  'POST /session/:id/cancel',
  'GET /session/:id/events',
  'GET /session/:id/status',
  'GET /session/:id/transcript',
  'GET /session/:id/context',
  'GET /session/:id/export',
  'GET /session/:id/pending-prompts',
  'POST /session/:id/heartbeat',
  'PATCH /session/:id/metadata',
  'POST /session/:id/model',
  'POST /session/:id/load',
  'POST /session/:id/resume',
  'POST /session/:id/permission/:requestId',
  'POST /permission/:requestId',
  'GET /workspace/tools',
  'GET /workspace/auth/local-servers',
  'GET /file',
  'GET /file/bytes',
  'GET /stat',
  'GET /list',
  'GET /glob',
];

const SDK_METHOD_BY_OPERATION: Readonly<Record<string, string>> = {
  'GET /health': 'DaemonClient.health',
  'GET /capabilities': 'DaemonClient.capabilities',
  'POST /session': 'DaemonClient.createOrAttachSession',
  'DELETE /session/:id': 'DaemonClient.closeSession',
  'POST /session/:id/load': 'DaemonClient.loadSession',
  'POST /session/:id/resume': 'DaemonClient.resumeSession',
  'POST /session/:id/heartbeat': 'DaemonClient.heartbeat',
  'PATCH /session/:id/metadata': 'DaemonClient.updateSessionMetadata',
  'POST /session/:id/model': 'DaemonClient.setSessionModel',
  'GET /session/:id/status': 'DaemonClient.sessionStatus',
  'POST /session/:id/prompt': 'DaemonClient.promptNonBlocking',
  'POST /session/:id/cancel': 'DaemonClient.cancel',
  'GET /session/:id/events': 'DaemonClient.subscribeEvents',
  'GET /session/:id/transcript': 'DaemonClient.getSessionTranscriptPage',
  'GET /session/:id/context': 'DaemonClient.sessionContext',
  'GET /session/:id/export': 'DaemonClient.exportSession',
  'GET /session/:id/pending-prompts': 'DaemonClient.getPendingPrompts',
  'POST /session/:id/permission/:requestId':
    'DaemonClient.respondToSessionPermission',
  'POST /permission/:requestId': 'DaemonClient.respondToPermission',
  'GET /workspace/tools': 'DaemonClient.workspaceTools',
  'GET /workspace/auth/local-servers': 'DaemonClient.getLocalAuthServers',
  'GET /file': 'DaemonClient.readWorkspaceFile',
  'GET /file/bytes': 'DaemonClient.readWorkspaceFileBytes',
  'GET /stat': 'DaemonClient.fileStat',
  'GET /list': 'DaemonClient.dirList',
  'GET /glob': 'DaemonClient.glob',
};

const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;
const REGISTERED_METHODS = new Set<string>([...HTTP_METHODS, 'all']);
const SCOPES = new Set([
  'process-global',
  'selected-runtime',
  'persisted-workspace',
  'live-session-owner',
  'legacy-primary',
]);
/** Media types the published document is allowed to claim. */
const CONTENT_TYPES = new Set([
  'application/json',
  'application/jsonl',
  'text/event-stream',
  'text/html',
  'text/markdown',
]);

interface OpenApiOperation {
  operationId?: string;
  requestBody?: unknown;
  parameters?: Array<{
    name?: string;
    in?: string;
    schema?: { minimum?: number; maximum?: number };
  }>;
  responses?: Record<
    string,
    { description?: string; content?: Record<string, unknown> }
  >;
  security?: Array<Record<string, unknown>>;
  externalDocs?: { url?: string };
  'x-o1code-capability'?: string | null;
  'x-o1code-scope'?: string;
  'x-o1code-stability'?: string;
  'x-o1code-sdk-method'?: string;
}

interface OpenApiDocument {
  openapi?: string;
  externalDocs?: { url?: string };
  servers?: Array<{ url?: string }>;
  paths?: Record<
    string,
    Partial<Record<(typeof HTTP_METHODS)[number], OpenApiOperation>>
  >;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

/** Collect every operation registered on an Express app or router. */
function registeredOperations(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) {
        continue;
      }
      const source = ts.createSourceFile(
        full,
        readFileSync(full, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          ['app', 'router'].includes(node.expression.expression.text)
        ) {
          const method = node.expression.name.text;
          const target = node.arguments[0];
          if (
            REGISTERED_METHODS.has(method) &&
            target !== undefined &&
            ts.isStringLiteral(target) &&
            method !== 'all'
          ) {
            found.add(`${method.toUpperCase()} ${target.text}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk(SERVE_DIR);
  return found;
}

function openApiOperations(
  document: OpenApiDocument,
): Map<string, OpenApiOperation> {
  const found = new Map<string, OpenApiOperation>();
  for (const [openApiPath, pathItem] of Object.entries(document.paths ?? {})) {
    const expressPath = openApiPath.replace(/\{([^}]+)\}/g, ':$1');
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) {
        found.set(`${method.toUpperCase()} ${expressPath}`, operation);
      }
    }
  }
  return found;
}

/**
 * GitHub heading slug, so anchor links can be checked. Matches github-slugger:
 * punctuation is dropped, but underscores survive and each space becomes one
 * hyphen (a run of spaces is not collapsed).
 */
function slug(heading: string): string {
  return heading
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '')
    .trim()
    .replace(/ /g, '-');
}

/** Markdown headings outside fenced code blocks, where # starts a comment. */
function markdownHeadings(source: string): string[] {
  const headings: string[] = [];
  let fence: '`' | '~' | undefined;
  for (const line of readFileSync(source, 'utf8').split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0] as
      | '`'
      | '~'
      | undefined;
    if (marker) {
      if (fence === undefined) {
        fence = marker;
      } else if (marker === fence) {
        fence = undefined;
      }
      continue;
    }
    if (fence !== undefined) {
      continue;
    }
    const match = /^#{1,6} (.+)$/.exec(line);
    if (match) {
      headings.push(match[1]);
    }
  }
  return headings;
}

function protocolHeadings(): string[] {
  return markdownHeadings(PROTOCOL);
}

function collectRefs(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRefs(entry, found));
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === '$ref' && typeof entry === 'string') {
      found.add(entry);
    } else {
      collectRefs(entry, found);
    }
  }
}

/** Resolve a JSON Pointer, so any in-document target is accepted. */
function resolveRef(
  document: OpenApiDocument,
  ref: string,
): Record<string, unknown> {
  let node: unknown = document;
  for (const step of ref.replace(/^#\//, '').split('/')) {
    node = (node as Record<string, unknown>)[step];
  }
  return node as Record<string, unknown>;
}

function resolvesPointer(document: unknown, ref: string): boolean {
  if (!ref.startsWith('#/')) {
    return false;
  }
  const target = ref
    .slice(2)
    .split('/')
    .reduce<unknown>((node, token) => {
      if (typeof node !== 'object' || node === null) {
        return undefined;
      }
      return (node as Record<string, unknown>)[
        token.replace(/~1/g, '/').replace(/~0/g, '~')
      ];
    }, document);
  return target !== undefined;
}

/** Every member the client exposes, including inherited accessors. */
function sdkMethods(): Set<string> {
  const names = new Set<string>();
  for (
    let proto: object | null = DaemonClient.prototype;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .forEach((name) => names.add(name));
  }
  return names;
}

describe('REST contract documentation', () => {
  it('keeps the OpenAPI document and daemon registrations aligned', () => {
    const registered = registeredOperations();
    expect(
      SUPPORTED_OPERATIONS.filter((entry) => !registered.has(entry)),
    ).toEqual([]);

    const openApi = JSON.parse(
      readFileSync(OPENAPI, 'utf8'),
    ) as OpenApiDocument;
    expect([...openApiOperations(openApi).keys()].sort()).toEqual(
      [...SUPPORTED_OPERATIONS].sort(),
    );
    expect(openApi.externalDocs?.url).toBe(PROTOCOL_URL);
  });

  it('keeps the OpenAPI contract self-describing', () => {
    const openApi = JSON.parse(
      readFileSync(OPENAPI, 'utf8'),
    ) as OpenApiDocument;
    expect(openApi.openapi).toBe('3.1.0');
    const protocol = protocolHeadings();
    const capabilities = new Set(Object.keys(SERVE_CAPABILITY_REGISTRY));
    const schemes = new Set(
      Object.keys(openApi.components?.securitySchemes ?? {}),
    );
    const methods = sdkMethods();
    const operationIds: string[] = [];
    for (const [name, operation] of openApiOperations(openApi)) {
      const operationId = operation.operationId;
      expect(operationId).toBeTruthy();
      if (operationId) {
        operationIds.push(operationId);
      }
      expect(operation).toHaveProperty('x-o1code-capability');
      const capability = operation['x-o1code-capability'];
      expect(
        capability === null || capabilities.has(capability as string),
      ).toBe(true);
      expect(SCOPES.has(operation['x-o1code-scope'] as string)).toBe(true);
      expect(operation['x-o1code-stability']).toBe('stable');
      expect(operation['x-o1code-sdk-method']).toBe(
        SDK_METHOD_BY_OPERATION[name],
      );
      expect(
        methods.has(
          (operation['x-o1code-sdk-method'] ?? '').replace(
            /^DaemonClient\./,
            '',
          ),
        ),
      ).toBe(true);
      const ownHeadings = protocol.filter((heading) =>
        heading.startsWith(`\`${name}\``),
      );
      expect(ownHeadings).toHaveLength(1);
      expect(operation.externalDocs?.url).toBe(
        `${PROTOCOL_URL}#${slug(ownHeadings[0])}`,
      );
      const security = operation.security ?? [];
      expect(security.length).toBeGreaterThan(0);
      for (const requirement of security) {
        const names = Object.keys(requirement);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
          expect(schemes.has(name)).toBe(true);
        }
      }
      const successful = Object.entries(operation.responses ?? {}).filter(
        ([code]) => /^2\d\d$/.test(code),
      );
      expect(successful.length).toBeGreaterThan(0);
      for (const [code, response] of successful) {
        if (code === '204' || code === '205') {
          continue;
        }
        const mediaTypes = Object.keys(response.content ?? {});
        expect(mediaTypes.length).toBeGreaterThan(0);
        expect(mediaTypes.every((type) => CONTENT_TYPES.has(type))).toBe(true);
      }
    }
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(
      Object.keys(
        openApi.paths?.['/session/{id}/events']?.get?.responses?.['200']
          ?.content ?? {},
      ),
    ).toEqual(['text/event-stream']);
    expect(
      Object.keys(
        openApi.paths?.['/session/{id}/export']?.get?.responses?.['200']
          ?.content ?? {},
      ).sort(),
    ).toEqual([
      'application/json',
      'application/jsonl',
      'text/html',
      'text/markdown',
    ]);
    const closeResponses =
      openApi.paths?.['/session/{id}']?.delete?.responses ?? {};
    expect(closeResponses['404']?.description).toContain('session_closing');
    expect(closeResponses['409']?.description ?? '').not.toContain(
      'session_closing',
    );

    const schemas = openApi.components?.schemas ?? {};
    const metadataProperties = (
      schemas['SessionMetadataRequest'] as {
        properties?: Record<string, { pattern?: string }>;
      }
    ).properties;
    const displayNamePattern = metadataProperties?.['displayName']?.pattern;
    expect(displayNamePattern).toBeTruthy();
    expect(new RegExp(displayNamePattern as string).test('bad\nname')).toBe(
      false,
    );
    for (const schemaName of ['SessionPrInput', 'SessionPr', 'SessionIssue']) {
      const urlPattern = (
        schemas[schemaName] as {
          properties?: Record<string, { pattern?: string }>;
        }
      ).properties?.['url']?.pattern;
      expect(urlPattern).toBeTruthy();
      expect(
        new RegExp(urlPattern as string).test('https://example.com\n'),
      ).toBe(false);
    }

    const refs = new Set<string>();
    collectRefs(openApi, refs);
    expect([...refs].filter((ref) => !resolvesPointer(openApi, ref))).toEqual(
      [],
    );
  });

  it('gives every supported operation a dedicated protocol heading', () => {
    const headings = new Set(
      protocolHeadings().flatMap((heading) => {
        const match = /^`(GET|POST|PATCH|PUT|DELETE) ([^`]+)`/.exec(heading);
        return match ? [`${match[1]} ${match[2]}`] : [];
      }),
    );
    expect(
      SUPPORTED_OPERATIONS.filter((entry) => !headings.has(entry)),
    ).toEqual([]);
  });

  it('publishes the resume request schema without the load-only fields', () => {
    const openApi = JSON.parse(
      readFileSync(OPENAPI, 'utf8'),
    ) as OpenApiDocument;
    const requestFields = (
      operation: OpenApiOperation | undefined,
    ): string[] => {
      const ref = (
        operation?.requestBody as
          | { content?: Record<string, { schema?: { $ref?: string } }> }
          | undefined
      )?.content?.['application/json']?.schema?.$ref;
      expect(ref).toBeTruthy();
      const schema = resolveRef(openApi, ref as string);
      return Object.keys(
        (schema['properties'] ?? {}) as Record<string, unknown>,
      ).sort();
    };
    expect(
      requestFields(openApi.paths?.['/session/{id}/resume']?.post),
    ).toEqual(['approvalMode', 'cwd', 'sourceId', 'sourceType']);
    const loadPost = openApi.paths?.['/session/{id}/load']?.post;
    expect(requestFields(loadPost)).toEqual([
      'approvalMode',
      'compactedReplayMode',
      'cwd',
      'historyPageSize',
      'liveReplayMode',
      'sourceId',
      'sourceType',
    ]);
    const loadSchema = resolveRef(
      openApi,
      (
        loadPost?.requestBody as
          | { content?: Record<string, { schema?: { $ref?: string } }> }
          | undefined
      )?.content?.['application/json']?.schema?.$ref as string,
    ) as { properties?: Record<string, { maximum?: number }> };
    const schemas = openApi.components?.schemas ?? {};
    for (const [schemaName, field] of [
      ['RestoreSessionRequest', 'compactedReplayMode'],
      ['PromptRequest', 'eventDetailMode'],
    ]) {
      expect(schemas[schemaName!]).toMatchObject({
        properties: {
          [field!]: {
            type: 'string',
            enum: ['full', 'summary'],
            default: 'full',
          },
        },
      });
    }
    expect(
      openApi.paths?.['/session/{id}/transcript']?.get?.parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'query',
          name: 'compactedReplayMode',
          schema: {
            type: 'string',
            enum: ['full', 'summary'],
            default: 'full',
          },
        }),
      ]),
    );
    expect(loadSchema.properties?.['historyPageSize']?.maximum).toBe(
      SESSION_TRANSCRIPT_MAX_LIMIT,
    );
    const transcriptLimit = (
      openApi.paths?.['/session/{id}/transcript']?.get?.parameters ?? []
    ).find(
      (parameter) => parameter.in === 'query' && parameter.name === 'limit',
    );
    expect(transcriptLimit?.schema?.maximum).toBe(SESSION_TRANSCRIPT_MAX_LIMIT);
  });

  it('still sees the bulk of the route surface', () => {
    expect(registeredOperations().size).toBeGreaterThan(100);
  });
});
