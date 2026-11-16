/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { ToolNames, resolveBuiltinToolName } from '../tools/tool-names.js';
import { sanitizeToolNameForProvider } from '../utils/tool-name-utils.js';
import { resolveToolName } from './rule-parser.js';

/**
 * Existence check for `settings.tools.disabled`, run when a discovery pass
 * has settled.
 *
 * The registry removes a tool only when an entry equals the name the tool
 * registers under, so a misspelt entry leaves the tool registered and callable
 * while the settings file reads as if it were gone. `/tools` lists only what
 * exists and the debug log is off in a default run, so nothing else says so.
 *
 * A disabled tool never reaches the registry, which means the registry cannot
 * confirm an entry. Built-ins are checked against the static name catalog
 * instead, and MCP entries only against the configured server names.
 */

const MCP_PREFIX = 'mcp__';

/** Warn-once ledger per session, so a later discovery pass does not repeat. */
const warnedEntriesByConfig = new WeakMap<Config, Set<string>>();

/**
 * Whether an entry names a tool on an MCP server that is configured. A typo in
 * the tool part cannot be told apart from a tool the server stopped offering,
 * so only an entry whose server is not configured at all is reported.
 */
function namesConfiguredMcpServer(config: Config, entry: string): boolean {
  const servers = config.getMcpServers() ?? {};
  return Object.keys(servers).some((serverName) => {
    const prefix = `${MCP_PREFIX}${serverName}__`;
    return (
      entry.startsWith(prefix) ||
      entry.startsWith(sanitizeToolNameForProvider(prefix))
    );
  });
}

/**
 * The registered name an entry was probably meant to be, when it is a display
 * name or an alias (`Bash`, `ReadFile`) rather than the name itself.
 */
function registeredNameFor(
  entry: string,
  knownNames: ReadonlySet<string>,
): string | undefined {
  const candidate = resolveBuiltinToolName(entry) ?? resolveToolName(entry);
  return candidate !== entry && knownNames.has(candidate)
    ? candidate
    : undefined;
}

/**
 * Report every `tools.disabled` entry that removes no tool, once per entry per
 * session. Never throws: a diagnostic must not be able to fail discovery.
 */
export function warnOnUnmatchedDisabledToolEntries(config: Config): void {
  try {
    const disabled = config.getDisabledTools();
    if (disabled.size === 0) {
      return;
    }
    const knownNames = new Set<string>(Object.values(ToolNames));
    // Tools from a discovery command carry names nothing here can enumerate.
    const hasDiscoveredTools = Boolean(config.getToolDiscoveryCommand());

    let warned = warnedEntriesByConfig.get(config);
    if (!warned) {
      warned = new Set<string>();
      warnedEntriesByConfig.set(config, warned);
    }

    for (const entry of disabled) {
      if (warned.has(entry) || knownNames.has(entry)) {
        continue;
      }
      if (entry.startsWith(MCP_PREFIX)) {
        if (namesConfiguredMcpServer(config, entry)) {
          continue;
        }
      } else {
        const registeredName = registeredNameFor(entry, knownNames);
        if (registeredName) {
          warned.add(entry);
          // eslint-disable-next-line no-console -- operator-facing: the debug log is off by default, and an entry that removes nothing would otherwise go unseen
          console.warn(
            `tools.disabled: "${entry}" is not the name the tool is ` +
              `registered under, so it disables nothing. Use ` +
              `"${registeredName}" instead.`,
          );
          continue;
        }
        if (hasDiscoveredTools) {
          continue;
        }
      }
      warned.add(entry);
      // eslint-disable-next-line no-console -- operator-facing: the debug log is off by default, and an entry that removes nothing would otherwise go unseen
      console.warn(
        `tools.disabled: "${entry}" matches no known tool, so it disables ` +
          `nothing and the tool it was meant to remove is still available. ` +
          `Check the spelling or drop the entry.`,
      );
    }
  } catch {
    // Diagnostics only.
  }
}
