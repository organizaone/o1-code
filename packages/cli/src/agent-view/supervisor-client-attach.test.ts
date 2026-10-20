/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { attachAgentViewSupervisorTerminal } from './supervisor-client.js';

let server: Server | undefined;
let accepted: Socket | undefined;

afterEach(async () => {
  accepted?.destroy();
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
  accepted = undefined;
});

it('detaches an established terminal stream on controller abort', async () => {
  const socketPath =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\o1-attach-${randomUUID()}`
      : join(tmpdir(), `o1-attach-${randomUUID()}.sock`);
  server = createServer((socket) => {
    accepted = socket;
    socket.once('data', (data) => {
      const request = JSON.parse(data.toString().trim()) as { id: string };
      socket.write(
        `${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`,
      );
    });
  });
  await new Promise<void>((resolve) => server?.listen(socketPath, resolve));
  const input = new PassThrough();
  const output = new PassThrough();
  const abort = new AbortController();
  const onAttached = vi.fn();
  const attachment = attachAgentViewSupervisorTerminal(
    socketPath,
    'session-1',
    {
      stdin: input,
      stdout: output,
      rawMode: false,
      detachSignal: abort.signal,
      onAttached,
    },
  );
  await vi.waitFor(() => expect(onAttached).toHaveBeenCalledTimes(1));
  abort.abort();
  await expect(attachment).resolves.toEqual({ reason: 'detached' });
  input.destroy();
  output.destroy();
});
