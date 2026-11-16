/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Kind } from '../tools/tools.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { ToolNames } from '../tools/tool-names.js';
import {
  classifyToolForExploration,
  TOOL_EXPLORATION_REMINDER,
  ToolExplorationBudget,
} from './tool-exploration-budget.js';

function registryOf(
  names: string[],
  kinds: Record<string, Kind> = {},
): ToolRegistry {
  return {
    getAllToolNames: () => names,
    getTool: (name: string) =>
      names.includes(name) && kinds[name] !== undefined
        ? { kind: kinds[name] }
        : undefined,
  } as unknown as ToolRegistry;
}

describe('ToolExplorationBudget', () => {
  it('reminds once at the allowance and lets the investigation continue', () => {
    const budget = new ToolExplorationBudget();
    for (let i = 0; i < 99; i++) budget.record('exploration');
    expect(budget.takeReminder(100)).toBeUndefined();
    budget.record('exploration');
    expect(budget.takeReminder(100)).toBe(TOOL_EXPLORATION_REMINDER);
    for (let i = 0; i < 50; i++) budget.record('exploration');
    expect(budget.takeReminder(100)).toBeUndefined();
  });

  it('starts a new phase after a progress call', () => {
    const budget = new ToolExplorationBudget();
    budget.record('exploration');
    budget.record('progress');
    budget.record('exploration');
    expect(budget.takeReminder(2)).toBeUndefined();
    budget.record('exploration');
    expect(budget.takeReminder(2)).toBe(TOOL_EXPLORATION_REMINDER);
    // The reminder is available again only after the phase ended.
    budget.record('progress');
    budget.record('exploration');
    budget.record('exploration');
    expect(budget.takeReminder(2)).toBe(TOOL_EXPLORATION_REMINDER);
  });

  it('does not let a rollback bring back the previous turn', () => {
    const budget = new ToolExplorationBudget();
    budget.record('exploration');
    budget.record('exploration');
    budget.commit();
    budget.reset();
    budget.record('exploration');
    budget.rollback();
    expect(budget.takeReminder(2)).toBeUndefined();
    budget.record('exploration');
    budget.record('exploration');
    expect(budget.takeReminder(2)).toBe(TOOL_EXPLORATION_REMINDER);
  });

  it('rolls back a replayed attempt without repeating a delivered reminder', () => {
    const budget = new ToolExplorationBudget();
    budget.record('exploration');
    budget.commit();
    budget.record('exploration');
    budget.rollback();
    expect(budget.takeReminder(2)).toBeUndefined();
    budget.record('exploration');
    budget.commit();
    expect(budget.takeReminder(2)).toBe(TOOL_EXPLORATION_REMINDER);
    budget.record('exploration');
    budget.rollback();
    expect(budget.takeReminder(2)).toBeUndefined();
    budget.record('progress');
    budget.rollback();
    budget.record('exploration');
    budget.record('exploration');
    expect(budget.takeReminder(2)).toBe(TOOL_EXPLORATION_REMINDER);
  });

  it('honors a disabled allowance', () => {
    const budget = new ToolExplorationBudget();
    budget.record('exploration');
    expect(budget.takeReminder(Infinity)).toBeUndefined();
    expect(budget.takeReminder(0)).toBeUndefined();
    expect(budget.takeReminder(-1)).toBeUndefined();
  });
});

describe('classifyToolForExploration', () => {
  const builtins = Object.values(ToolNames);
  const registry = registryOf(builtins);

  it.each([
    ToolNames.READ_FILE,
    ToolNames.ZOOM_IMAGE,
    ToolNames.GREP,
    ToolNames.GLOB,
    ToolNames.LS,
    ToolNames.LSP,
    ToolNames.WEB_FETCH,
    ToolNames.WEB_SEARCH,
    ToolNames.TOOL_SEARCH,
    ToolNames.READ_MCP_RESOURCE,
    ToolNames.LIST_AGENTS,
    ToolNames.TASK_LIST,
    ToolNames.CRON_LIST,
    ToolNames.GET_GOAL,
    ToolNames.OMNI_RECALL_MEDIA_MEMORY,
  ])('counts %s as exploration without a loaded instance', (name) => {
    expect(classifyToolForExploration(registry, name, {})).toBe('exploration');
  });

  it.each([
    ToolNames.EDIT,
    ToolNames.WRITE_FILE,
    ToolNames.NOTEBOOK_EDIT,
    ToolNames.SHELL,
    ToolNames.EXEC,
    ToolNames.TODO_WRITE,
    ToolNames.MEMORY,
    ToolNames.AGENT,
    ToolNames.SKILL,
    ToolNames.ENTER_PLAN_MODE,
    ToolNames.EXIT_PLAN_MODE,
    ToolNames.ASK_USER_QUESTION,
    ToolNames.TASK_UPDATE,
    ToolNames.DISPLAY_IMAGE,
    ToolNames.TOOL_CALL,
  ])('counts %s as progress', (name) => {
    expect(classifyToolForExploration(registry, name, {})).toBe('progress');
  });

  it('keeps a built-in outside the table as progress whatever its kind', () => {
    const typed = registryOf(builtins, { [ToolNames.SKILL]: Kind.Read });
    expect(classifyToolForExploration(typed, ToolNames.SKILL, {})).toBe(
      'progress',
    );
  });

  it('resolves a legacy alias to its canonical tool', () => {
    expect(
      classifyToolForExploration(registry, 'search_file_content', {}),
    ).toBe('exploration');
    expect(classifyToolForExploration(registry, 'replace', {})).toBe(
      'progress',
    );
  });

  it('follows the declared kind of an MCP tool', () => {
    const mcp = registryOf(
      ['mcp__docs__describe', 'mcp__docs__search', 'mcp__docs__publish'],
      {
        mcp__docs__describe: Kind.Read,
        mcp__docs__search: Kind.Search,
        mcp__docs__publish: Kind.Other,
      },
    );
    expect(classifyToolForExploration(mcp, 'mcp__docs__describe', {})).toBe(
      'exploration',
    );
    expect(classifyToolForExploration(mcp, 'mcp__docs__search', {})).toBe(
      'exploration',
    );
    expect(classifyToolForExploration(mcp, 'mcp__docs__publish', {})).toBe(
      'progress',
    );
  });

  it('treats an unregistered or unknown name as progress', () => {
    const narrow = registryOf([ToolNames.READ_FILE]);
    expect(classifyToolForExploration(narrow, ToolNames.LSP, {})).toBe(
      'progress',
    );
    expect(classifyToolForExploration(narrow, 'no_such_tool', {})).toBe(
      'progress',
    );
    expect(classifyToolForExploration(narrow, 'mcp__gone__read', {})).toBe(
      'progress',
    );
    expect(classifyToolForExploration(undefined, ToolNames.READ_FILE, {})).toBe(
      'progress',
    );
  });

  it('classifies a bridged call by its target', () => {
    const bridgedRegistry = registryOf([...builtins, 'mcp__Docs__Describe'], {
      mcp__Docs__Describe: Kind.Read,
    });
    const bridge = (name: unknown) =>
      classifyToolForExploration(bridgedRegistry, ToolNames.TOOL_CALL, {
        name,
        arguments: {},
      });
    expect(bridge(ToolNames.LSP)).toBe('exploration');
    expect(bridge('mcp__docs__describe')).toBe('exploration');
    expect(bridge(ToolNames.EDIT)).toBe('progress');
    // The bridge refuses its own two halves.
    expect(bridge(ToolNames.TOOL_SEARCH)).toBe('progress');
    expect(bridge(ToolNames.TOOL_CALL)).toBe('progress');
    expect(bridge(undefined)).toBe('progress');
  });

  it('keeps a phase alive across interleaved read-only discovery tools', () => {
    const budget = new ToolExplorationBudget();
    for (const name of [ToolNames.READ_FILE, ToolNames.LSP, ToolNames.GREP]) {
      budget.record(classifyToolForExploration(registry, name, {}));
    }
    expect(budget.takeReminder(3)).toBe(TOOL_EXPLORATION_REMINDER);
  });
});
