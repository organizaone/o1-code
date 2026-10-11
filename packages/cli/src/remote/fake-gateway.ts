/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A stand-in for the gateway's `/remote/agent` for tests (contract §5.2):
 * speaks the frames the real one does, over a loopback HTTP server the
 * vendored library accepts, and lets a test play the proxy — send an
 * input, a command, a viewer's decision, a `bye` — and read what the
 * terminal sent. Never the real gateway.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

export const FAKE_GATEWAY_PROTOCOL = 'o1gw-remote.v1';

export type GatewayFrame = Record<string, unknown> & { type: string };

export interface FakeGatewayOptions {
  /** The answer to the first hello; `bye` ends the socket as the gateway would. */
  onHello?: (hello: GatewayFrame) => GatewayFrame | undefined;
  viewerUrl?: (remoteId: string) => string;
}

export class FakeGateway {
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private socket: WebSocket | null = null;
  private seq = 0;
  private readonly received: GatewayFrame[] = [];
  private readonly waiters: Array<{
    match: (frame: GatewayFrame) => boolean;
    resolve: (frame: GatewayFrame) => void;
  }> = [];
  private readonly connections: Array<() => void> = [];
  readonly hellos: GatewayFrame[] = [];
  /** The close code of every socket the terminal closed or lost. */
  readonly closeCodes: number[] = [];
  remoteId = 'rm_test';
  ackSeq = 0;

  private constructor(private readonly options: FakeGatewayOptions) {
    this.server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    this.wss = new WebSocketServer({
      server: this.server,
      path: '/remote/agent',
      handleProtocols: (protocols) =>
        protocols.has(FAKE_GATEWAY_PROTOCOL) ? FAKE_GATEWAY_PROTOCOL : false,
    });
    this.wss.on('connection', (socket) => {
      this.socket = socket;
      for (const waiter of this.connections.splice(0)) waiter();
      socket.on('close', (code) => this.closeCodes.push(code));
      socket.on('message', (data) => {
        const frame = JSON.parse(data.toString()) as GatewayFrame;
        this.received.push(frame);
        this.handle(socket, frame);
        for (const waiter of [...this.waiters]) {
          if (waiter.match(frame)) {
            this.waiters.splice(this.waiters.indexOf(waiter), 1);
            waiter.resolve(frame);
          }
        }
      });
    });
  }

  static async start(options: FakeGatewayOptions = {}): Promise<FakeGateway> {
    const gateway = new FakeGateway(options);
    await new Promise<void>((resolve) =>
      gateway.server.listen(0, '127.0.0.1', resolve),
    );
    return gateway;
  }

  get baseUrl(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  get frames(): readonly GatewayFrame[] {
    return this.received;
  }

  framesOf(type: string): GatewayFrame[] {
    return this.received.filter((frame) => frame.type === type);
  }

  /** Resolves with the next frame of `type` the terminal sends from now on. */
  next(type: string): Promise<GatewayFrame> {
    return new Promise((resolve) => {
      this.waiters.push({ match: (frame) => frame.type === type, resolve });
    });
  }

  /** Resolves on the next agent connection (a reconnection after a drop). */
  nextConnection(): Promise<void> {
    return new Promise((resolve) => this.connections.push(resolve));
  }

  /** A frame from the proxy, numbered when the kind carries a `seq`. */
  send(frame: Record<string, unknown>): number {
    const numbered = ['input', 'command', 'decision'].includes(
      frame['type'] as string,
    );
    const seq = numbered ? ++this.seq : undefined;
    this.socket?.send(
      JSON.stringify({ v: 1, ...(seq !== undefined ? { seq } : {}), ...frame }),
    );
    return seq ?? 0;
  }

  /** Ends the session the way the gateway does: a `bye`, then the close code. */
  bye(reason: string, code = 4000, extra: Record<string, unknown> = {}): void {
    this.send({ type: 'bye', reason, ...extra });
    this.socket?.close(code);
  }

  /** Drops the socket without a `bye`: the terminal should reconnect. */
  drop(): void {
    this.socket?.terminate();
    this.socket = null;
  }

  async close(): Promise<void> {
    for (const client of this.wss.clients) client.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handle(socket: WebSocket, frame: GatewayFrame): void {
    switch (frame.type) {
      case 'hello': {
        this.hellos.push(frame);
        const answer = this.options.onHello?.(frame);
        if (answer) {
          socket.send(JSON.stringify({ v: 1, ...answer }));
          if (answer.type === 'bye') socket.close(4029);
          return;
        }
        socket.send(
          JSON.stringify({
            v: 1,
            type: 'ready',
            remote_id: this.remoteId,
            url:
              this.options.viewerUrl?.(this.remoteId) ??
              `https://account.example/account#/me/remote/${this.remoteId}`,
            viewers: 0,
            limits: { max_viewers: 2, frame_bytes: 256 * 1024 },
            resumed: this.hellos.length > 1,
            ack_seq: this.ackSeq,
          }),
        );
        return;
      }
      case 'event':
      case 'decision_request':
        this.ackSeq = frame['seq'] as number;
        socket.send(JSON.stringify({ v: 1, type: 'ack', seq: frame['seq'] }));
        return;
      case 'ping':
        socket.send(JSON.stringify({ v: 1, type: 'pong' }));
        return;
      default:
        return;
    }
  }
}
