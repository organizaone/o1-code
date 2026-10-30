/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createServer,
  type IncomingHttpHeaders,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createStreamableHttpCompatibilityFetch } from './mcp-client.js';

const headers = {
  'x-api-key': 'synthetic-redirect-key',
  'mcp-session-id': 'synthetic-redirect-session',
};
const notification = {
  jsonrpc: '2.0' as const,
  method: 'notifications/cancelled',
  params: { requestId: 1, reason: 'synthetic-redirect-body' },
};

interface ReceivedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});

async function listen(
  respond: (request: ReceivedRequest, response: ServerResponse) => void,
) {
  const requests: ReceivedRequest[] = [];
  const server = createServer(async (request, response) => {
    request.setEncoding('utf8');
    let body = '';
    for await (const chunk of request) body += chunk as string;
    const received = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
    };
    requests.push(received);
    respond(received, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
  };
}

function accept(response: ServerResponse) {
  response.writeHead(202).end();
}

function openEventStream(response: ServerResponse) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write('event: endpoint\ndata: /messages\n\n');
}

function httpTransport(url: string) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    sessionId: headers['mcp-session-id'],
    requestInit: { headers },
    fetch: createStreamableHttpCompatibilityFetch(
      'redirect-security',
      globalThis.fetch,
      { httpUrl: url, headers },
    ),
  });
  cleanups.push(() => transport.close());
  return transport;
}

function sseTransport(url: string) {
  const transport = new SSEClientTransport(new URL(url), {
    requestInit: { headers },
  });
  cleanups.push(() => transport.close());
  return transport;
}

function expectSensitiveRequest(request: ReceivedRequest, method = 'POST') {
  expect(request).toMatchObject({
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(notification) : '',
  });
}

describe('MCP transport redirect security', () => {
  it.each([307, 308])(
    'does not send HTTP headers, session or body across an origin with %i',
    async (status) => {
      const destination = await listen((_request, response) =>
        accept(response),
      );
      const source = await listen((_request, response) => {
        response
          .writeHead(status, { location: `${destination.origin}/received` })
          .end();
      });
      const transport = httpTransport(`${source.origin}/mcp`);
      await transport.start();
      const result = await transport
        .send(notification)
        .catch((error: unknown) => error);

      expect(source.requests).toHaveLength(1);
      expectSensitiveRequest(source.requests[0]);
      expect(destination.requests).toEqual([]);
      expect(result).toBeInstanceOf(Error);
    },
  );

  it.each([307, 308])(
    'preserves same-origin HTTP redirects with %i',
    async (status) => {
      const source = await listen((request, response) => {
        if (request.url === '/mcp')
          response.writeHead(status, { location: '/received' }).end();
        else accept(response);
      });
      const transport = httpTransport(`${source.origin}/mcp`);
      await transport.start();
      await transport.send(notification);

      expect(source.requests).toHaveLength(2);
      expectSensitiveRequest(source.requests[1]);
    },
  );

  it.each([307, 308])(
    'does not send SSE GET headers across an origin with %i',
    async (status) => {
      const destination = await listen((_request, response) =>
        openEventStream(response),
      );
      const source = await listen((_request, response) => {
        response
          .writeHead(status, { location: `${destination.origin}/events` })
          .end();
      });
      const transport = sseTransport(`${source.origin}/sse`);
      const result = await transport.start().catch((error: unknown) => error);

      expect(source.requests).toHaveLength(1);
      expectSensitiveRequest(source.requests[0], 'GET');
      expect(destination.requests).toEqual([]);
      expect(result).toBeInstanceOf(Error);
    },
  );

  it.each([307, 308])(
    'preserves same-origin SSE redirects with %i',
    async (status) => {
      const source = await listen((request, response) => {
        if (request.url === '/sse')
          response.writeHead(status, { location: '/events' }).end();
        else if (request.url === '/events') openEventStream(response);
        else accept(response);
      });
      const transport = sseTransport(`${source.origin}/sse`);
      await transport.start();
      await transport.send(notification);

      expect(source.requests).toHaveLength(3);
      expectSensitiveRequest(source.requests[1], 'GET');
      expectSensitiveRequest(source.requests[2]);
    },
  );

  it.each([307, 308])(
    'does not send SSE POST headers or body across an origin with %i',
    async (status) => {
      const destination = await listen((_request, response) =>
        accept(response),
      );
      const source = await listen((request, response) => {
        if (request.url === '/sse') openEventStream(response);
        else
          response
            .writeHead(status, { location: `${destination.origin}/received` })
            .end();
      });
      const transport = sseTransport(`${source.origin}/sse`);
      await transport.start();
      const result = await transport
        .send(notification)
        .catch((error: unknown) => error);

      expect(source.requests).toHaveLength(2);
      expectSensitiveRequest(source.requests[1]);
      expect(destination.requests).toEqual([]);
      expect(result).toBeInstanceOf(Error);
    },
  );
});
