/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../utils/debugLogger.js', () => ({
  createDebugLogger: () => logger,
}));

import { getLastPeerInboxFailure, startPeerInbox } from './uds-inbox.js';

describe('startPeerInbox on a platform without automatic socket paths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('logs one warning and no error', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    await expect(startPeerInbox({ onFrame: () => {} })).resolves.toBeNull();

    expect(getLastPeerInboxFailure()?.cause).toBe('unsupported_platform');
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'cross-session messaging is not available on this platform',
    );
  });
});
