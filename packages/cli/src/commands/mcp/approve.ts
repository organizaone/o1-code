/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Files for 'o1-code mcp approve' / 'o1-code mcp reject' commands.
import type { CommandModule } from 'yargs';
import type { MCPServerConfig } from '@organizaone/o1-code-core';
import { isGatedMcpScope } from '@organizaone/o1-code-core';
import { writeStdoutLine } from '../../utils/stdioHelpers.js';
import { loadSettings } from '../../config/settings.js';
import { assembleMcpServers } from '../../config/mcpServers.js';
import {
  loadMcpApprovals,
  type McpApprovalStatus,
} from '../../config/mcpApprovals.js';

/**
 * All gated (approval-requiring) servers visible from `cwd` — project
 * `.mcp.json` plus workspace `.o1-code/settings.json`. Non-gated sources
 * (user/system/extension) never need approval and are excluded.
 */
function loadGatedServers(cwd: string): Record<string, MCPServerConfig> {
  const settings = loadSettings(cwd);
  const all = assembleMcpServers(settings.merged.mcpServers, cwd);
  const gated: Record<string, MCPServerConfig> = {};
  for (const [serverName, config] of Object.entries(all)) {
    if (isGatedMcpScope(config.scope)) {
      gated[serverName] = config;
    }
  }
  return gated;
}

async function setProjectServerStatus(
  name: string | undefined,
  status: McpApprovalStatus,
  all: boolean,
): Promise<void> {
  const cwd = process.cwd();
  const servers = loadGatedServers(cwd);

  const names = Object.keys(servers);
  if (names.length === 0) {
    writeStdoutLine(
      'No approval-requiring MCP servers found (looked in .mcp.json and .o1-code/settings.json).',
    );
    return;
  }

  const verb = status === 'approved' ? 'Approved' : 'Rejected';
  const approvals = loadMcpApprovals();

  const targets = all ? names : name ? [name] : [];
  if (targets.length === 0) {
    writeStdoutLine('Specify a server name or pass --all.');
    return;
  }

  for (const target of targets) {
    const config = servers[target];
    if (!config) {
      writeStdoutLine(
        `Server "${target}" not found. Available: ${names.join(', ')}`,
      );
      continue;
    }
    // The decision binds to this exact config's hash: editing the server in
    // its source file later returns it to pending.
    await approvals.setState(cwd, target, config, status);
    writeStdoutLine(
      `${verb} MCP server "${target}" (bound to its current config).`,
    );
  }

  if (status === 'approved') {
    writeStdoutLine(
      'Approved servers connect in your next interactive session.',
    );
  }
}

export const approveCommand: CommandModule = {
  command: 'approve [name]',
  describe:
    'Approve a gated MCP server (.mcp.json or workspace .o1-code/settings.json)',
  builder: (yargs) =>
    yargs
      .usage('Usage: o1-code mcp approve [options] [name]')
      .positional('name', {
        describe: 'Name of the gated server to approve',
        type: 'string',
      })
      .option('all', {
        describe: 'Approve all gated servers in this workspace',
        type: 'boolean',
        default: false,
      }),
  handler: async (argv) => {
    await setProjectServerStatus(
      argv['name'] as string | undefined,
      'approved',
      argv['all'] as boolean,
    );
  },
};

export const rejectCommand: CommandModule = {
  command: 'reject [name]',
  describe:
    'Reject a gated MCP server (.mcp.json or workspace .o1-code/settings.json)',
  builder: (yargs) =>
    yargs
      .usage('Usage: o1-code mcp reject [options] [name]')
      .positional('name', {
        describe: 'Name of the gated server to reject',
        type: 'string',
      })
      .option('all', {
        describe: 'Reject all gated servers in this workspace',
        type: 'boolean',
        default: false,
      }),
  handler: async (argv) => {
    await setProjectServerStatus(
      argv['name'] as string | undefined,
      'rejected',
      argv['all'] as boolean,
    );
  },
};
