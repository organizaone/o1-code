/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { PermissionManager } from './permission-manager.js';
import type { PermissionManagerConfig } from './permission-manager.js';
import type { McpToolIdentity, PermissionCheckContext } from './types.js';
import {
  generateLegacyMcpToolName,
  normalizeToolNameForProvider,
} from '../utils/tool-name-utils.js';

interface RegisteredMcpTool extends McpToolIdentity {
  name: string;
}

function tool(serverName: string, serverToolName: string): RegisteredMcpTool {
  return {
    serverName,
    serverToolName,
    name: normalizeToolNameForProvider(`mcp__${serverName}__${serverToolName}`),
  };
}

/** The context the permission flow builds for a real MCP invocation. */
function callOf(registered: RegisteredMcpTool): PermissionCheckContext {
  const rawName = `mcp__${registered.serverName}__${registered.serverToolName}`;
  const legacyName = generateLegacyMcpToolName(rawName);
  return {
    toolName: registered.name,
    toolAliases: legacyName === registered.name ? [] : [legacyName],
    mcpIdentity: {
      serverName: registered.serverName,
      serverToolName: registered.serverToolName,
    },
  };
}

function managerWith(
  rules: { allow?: string[]; ask?: string[]; deny?: string[] },
  registered: RegisteredMcpTool[],
): PermissionManager {
  const config: PermissionManagerConfig = {
    getPermissionsAllow: () => rules.allow,
    getPermissionsAsk: () => rules.ask,
    getPermissionsDeny: () => rules.deny,
    getProjectRoot: () => '/project',
    getCwd: () => '/project',
    getApprovalMode: () => 'default',
    getToolRegistry: () => ({ getMcpToolIdentities: () => registered }),
  };
  const pm = new PermissionManager(config);
  pm.initialize();
  return pm;
}

describe('an MCP allow rule never authorizes a colliding server', () => {
  it('keeps a bare server rule on its own server when another key extends it', async () => {
    const own = tool('foo', 'deploy');
    const foreign = tool('foo__bar', 'deploy');
    const pm = managerWith({ allow: ['mcp__foo'] }, [own, foreign]);

    expect(await pm.evaluate(callOf(own))).toBe('allow');
    expect(await pm.evaluate(callOf(foreign))).toBe('default');
    expect(pm.hasRelevantRules(callOf(foreign))).toBe(false);
  });

  it('does not let the extended key inherit the rule when the named server is absent', async () => {
    const foreign = tool('foo__bar', 'deploy');

    for (const rule of ['mcp__foo', 'mcp__foo__*', 'mcp__foo__d*']) {
      const pm = managerWith({ allow: [rule] }, [foreign]);
      expect(await pm.evaluate(callOf(foreign))).toBe('default');
    }
  });

  it('keeps a whole-server wildcard on its own server', async () => {
    const own = tool('foo', 'deploy');
    const foreign = tool('foo__bar', 'deploy');
    const pm = managerWith({ allow: ['mcp__foo__*'] }, [own, foreign]);

    expect(await pm.evaluate(callOf(own))).toBe('allow');
    expect(await pm.evaluate(callOf(foreign))).toBe('default');
  });

  it('gives a rule to the server it spells exactly, not to one that sanitizes to it', async () => {
    const underscore = tool('foo_bar', 'deploy');
    const dotted = tool('foo.bar', 'deploy');
    const colon = tool('foo:bar', 'deploy');
    const registered = [underscore, dotted, colon];

    for (const rule of ['mcp__foo_bar', 'mcp__foo_bar__*']) {
      const pm = managerWith({ allow: [rule] }, registered);
      expect(await pm.evaluate(callOf(underscore))).toBe('allow');
      expect(await pm.evaluate(callOf(dotted))).toBe('default');
      expect(await pm.evaluate(callOf(colon))).toBe('default');
    }

    for (const rule of ['mcp__foo.bar', 'mcp__foo.bar__*']) {
      const pm = managerWith({ allow: [rule] }, registered);
      expect(await pm.evaluate(callOf(dotted))).toBe('allow');
      expect(await pm.evaluate(callOf(underscore))).toBe('default');
      expect(await pm.evaluate(callOf(colon))).toBe('default');
    }
  });

  it('grants neither server when two keys share a sanitized spelling and neither is spelled exactly', async () => {
    const dotted = tool('foo.bar', 'deploy');
    const colon = tool('foo:bar', 'deploy');
    const pm = managerWith({ allow: ['mcp__foo_bar'] }, [dotted, colon]);

    expect(await pm.evaluate(callOf(dotted))).toBe('default');
    expect(await pm.evaluate(callOf(colon))).toBe('default');
  });

  it('still honours a sanitized spelling that only one registered server claims', async () => {
    const dotted = tool('foo.bar', 'deploy');
    const other = tool('github', 'deploy');

    for (const rule of [
      'mcp__foo_bar',
      'mcp__foo_bar__*',
      'mcp__foo_bar__d*',
    ]) {
      const pm = managerWith({ allow: [rule] }, [dotted, other]);
      expect(await pm.evaluate(callOf(dotted))).toBe('allow');
      expect(await pm.evaluate(callOf(other))).toBe('default');
    }
  });

  it('grants neither claimant when a prefix has two real server boundaries', async () => {
    const nested = tool('foo__bar', 'deploy_y');
    const flat = tool('foo', 'bar__deploy_x');
    const rule = 'mcp__foo__bar__deploy*';

    const contested = managerWith({ allow: [rule] }, [nested, flat]);
    expect(await contested.evaluate(callOf(nested))).toBe('default');
    expect(await contested.evaluate(callOf(flat))).toBe('default');

    // The check reads the live registry: once the competitor is gone the
    // sole claimant is covered again.
    const alone = managerWith({ allow: [rule] }, [nested]);
    expect(await alone.evaluate(callOf(nested))).toBe('allow');
  });

  it('lets an exact tool name outrank a nested server that shares its spelling', async () => {
    const exact = tool('foo', 'bar');
    const nested = tool('foo__bar', 'deploy');
    const rule = 'mcp__foo__bar';

    const both = managerWith({ allow: [rule] }, [exact, nested]);
    expect(await both.evaluate(callOf(exact))).toBe('allow');
    expect(await both.evaluate(callOf(nested))).toBe('default');

    const alone = managerWith({ allow: [rule] }, [nested]);
    expect(await alone.evaluate(callOf(nested))).toBe('allow');
  });

  it('does not let a legacy exact spelling grant another server that owns that name', async () => {
    const owner = tool('foo_bar', 'get_x');
    const legacySpelled = tool('foo:bar', 'get_x');
    const rule = 'mcp__foo_bar__get_x';

    const both = managerWith({ allow: [rule] }, [owner, legacySpelled]);
    expect(await both.evaluate(callOf(owner))).toBe('allow');
    expect(await both.evaluate(callOf(legacySpelled))).toBe('default');

    const alone = managerWith({ allow: [rule] }, [legacySpelled]);
    expect(await alone.evaluate(callOf(legacySpelled))).toBe('allow');
  });

  it('keeps exact, raw and deliberately coarse rules working', async () => {
    const dotted = tool('zybio.db', 'literature.search_pubmed');
    const plain = tool('github', 'create_issue');
    const registered = [dotted, plain, tool('github__enterprise', 'x')];

    const rawName = 'mcp__zybio.db__literature.search_pubmed';
    for (const rule of [
      dotted.name,
      rawName,
      'mcp__zybio.db',
      'mcp__zybio.db__*',
      'mcp__zybio.db__literature.*',
      'mcp__zybio*',
      'mcp__*',
    ]) {
      const pm = managerWith({ allow: [rule] }, registered);
      expect(await pm.evaluate(callOf(dotted))).toBe('allow');
    }

    const pm = managerWith({ allow: ['mcp__github__create_*'] }, registered);
    expect(await pm.evaluate(callOf(plain))).toBe('allow');
    expect(await pm.evaluate(callOf(dotted))).toBe('default');
  });

  it('does not treat a bare * as an MCP grant', async () => {
    const plain = tool('github', 'create_issue');
    const pm = managerWith({ allow: ['*'] }, [plain]);

    expect(await pm.evaluate(callOf(plain))).toBe('default');
  });
});

describe('MCP deny and ask rules keep their coverage', () => {
  it('still restricts every server a lossy spelling reaches', async () => {
    const underscore = tool('foo_bar', 'deploy');
    const dotted = tool('foo.bar', 'deploy');
    const registered = [underscore, dotted];

    const denied = managerWith({ deny: ['mcp__foo_bar'] }, registered);
    expect(await denied.evaluate(callOf(underscore))).toBe('deny');
    expect(await denied.evaluate(callOf(dotted))).toBe('deny');

    const asked = managerWith({ ask: ['mcp__foo_bar__*'] }, registered);
    expect(await asked.evaluate(callOf(underscore))).toBe('ask');
    expect(await asked.evaluate(callOf(dotted))).toBe('ask');
  });

  it('lets a deny beat an allow that only the other server earns', async () => {
    const own = tool('foo', 'deploy');
    const foreign = tool('foo__bar', 'deploy');
    const pm = managerWith(
      { allow: ['mcp__foo__*'], deny: ['mcp__foo__bar__deploy'] },
      [own, foreign],
    );

    expect(await pm.evaluate(callOf(own))).toBe('allow');
    expect(await pm.evaluate(callOf(foreign))).toBe('deny');
  });

  it('restricts a nested server key through its bare rule', async () => {
    const nested = tool('foo__bar', 'deploy');
    const pm = managerWith({ deny: ['mcp__foo__bar'] }, [nested]);

    expect(await pm.evaluate(callOf(nested))).toBe('deny');
    expect(pm.findMatchingDenyRule(callOf(nested))).toBe('mcp__foo__bar');
  });
});
