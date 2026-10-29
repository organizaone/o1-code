/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Exported documents have no MCP host URL and their CSP denies frames and
// connections. McpApp therefore displays its fallback without opening a bridge.
// Throw if that assumption changes instead of silently shipping a broken app.
export class AppBridge {
  constructor() {
    throw new Error('MCP app bridges are unavailable in exported documents');
  }
}

export class PostMessageTransport {
  constructor() {
    throw new Error('MCP app transports are unavailable in exported documents');
  }
}
