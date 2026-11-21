/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { makeFakeConfig } from '../test-utils/config.js';
import type { Config } from '../config/config.js';
import { ToolRegistry, type ToolFactory } from '../tools/tool-registry.js';
import { warnOnUnmatchedDisabledToolEntries } from './disabled-tools-coverage.js';

const neverCalledFactory: ToolFactory = async () => {
  throw new Error('tool factory must not be invoked by the coverage check');
};

function makeConfig(opts: {
  disabled: string[];
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  toolDiscoveryCommand?: string;
}): Config {
  return makeFakeConfig({
    disabledTools: opts.disabled,
    trustedFolder: true,
    ...(opts.mcpServers ? { mcpServers: opts.mcpServers } : {}),
    ...(opts.toolDiscoveryCommand
      ? { toolDiscoveryCommand: opts.toolDiscoveryCommand }
      : {}),
  });
}

describe('tools.disabled entries that remove no tool', () => {
  let warnSpy: Mock<typeof console.warn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  function disabledWarnings(): string[] {
    return warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('tools.disabled'));
  }

  it('names a misspelt entry and stays quiet about the ones that match', () => {
    const config = makeConfig({
      disabled: ['run_shell_command', 'run_shel_command'],
    });

    warnOnUnmatchedDisabledToolEntries(config);

    expect(disabledWarnings()).toHaveLength(1);
    expect(disabledWarnings()[0]).toContain('run_shel_command');
    expect(disabledWarnings()[0]).toContain('disables nothing');
  });

  it('says nothing when every entry names a known tool', () => {
    const config = makeConfig({
      disabled: ['run_shell_command', 'read_file'],
    });

    warnOnUnmatchedDisabledToolEntries(config);

    expect(disabledWarnings()).toEqual([]);
  });

  it('points an alias at the name the tool registers under', () => {
    const config = makeConfig({ disabled: ['Bash'] });

    // The premise: registration compares exact names, so the alias really
    // does leave the shell tool registered.
    const registry = new ToolRegistry(config);
    registry.registerFactory('run_shell_command', neverCalledFactory);
    expect(registry.getAllToolNames()).toContain('run_shell_command');

    warnOnUnmatchedDisabledToolEntries(config);

    expect(disabledWarnings()).toHaveLength(1);
    expect(disabledWarnings()[0]).toContain('"Bash"');
    expect(disabledWarnings()[0]).toContain('"run_shell_command"');
  });

  it('reports an entry once across repeated discovery passes', () => {
    const config = makeConfig({ disabled: ['run_shel_command'] });

    warnOnUnmatchedDisabledToolEntries(config);
    warnOnUnmatchedDisabledToolEntries(config);

    expect(disabledWarnings()).toHaveLength(1);
  });

  it('leaves a tool on a configured MCP server alone', () => {
    // A disabled MCP tool is refused at registration, so the registry cannot
    // confirm the name; a configured server is as close as the check can get.
    const config = makeConfig({
      disabled: ['mcp__github__create_issue', 'mcp__my_server__run'],
      mcpServers: {
        github: { command: 'npx' },
        'my server': { command: 'npx' },
      },
    });

    warnOnUnmatchedDisabledToolEntries(config);

    expect(disabledWarnings()).toEqual([]);
  });

  it('still reports an entry whose MCP server is not configured at all', () => {
    const config = makeConfig({
      disabled: ['mcp__githb__create_issue'],
      mcpServers: { github: { command: 'npx' } },
    });

    warnOnUnmatchedDisabledToolEntries(config);

    expect(disabledWarnings()).toHaveLength(1);
    expect(disabledWarnings()[0]).toContain('mcp__githb__create_issue');
  });

  it('does not guess at names when a discovery command supplies tools', () => {
    const config = makeConfig({
      disabled: ['deploy_site', 'Bash'],
      toolDiscoveryCommand: 'list-tools',
    });

    warnOnUnmatchedDisabledToolEntries(config);

    // The alias is still a definite mistake; the unknown name may be real.
    expect(disabledWarnings()).toHaveLength(1);
    expect(disabledWarnings()[0]).toContain('"Bash"');
  });

  it('says nothing when nothing is disabled', () => {
    const config = makeConfig({ disabled: [] });

    warnOnUnmatchedDisabledToolEntries(config);

    expect(disabledWarnings()).toEqual([]);
  });

  it('runs at the end of an MCP discovery pass', async () => {
    const config = makeConfig({ disabled: ['run_shel_command'] });
    const registry = new ToolRegistry(config);
    Object.assign(config, { toolRegistry: registry });

    await registry.getMcpClientManager().discoverAllMcpToolsIncremental(config);

    expect(disabledWarnings()).toHaveLength(1);
  });
});
