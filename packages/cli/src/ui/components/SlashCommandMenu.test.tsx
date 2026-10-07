/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandKind, type SlashCommand } from '../commands/types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import {
  getSlashMenuGroups,
  isSlashMenuQuery,
  matchesSlashMenuQuery,
  SlashCommandMenu,
} from './SlashCommandMenu.js';
import { glyphs } from '../glyphs.js';

const terminal = vi.hoisted(() => ({ columns: 120, rows: 40 }));
vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => terminal,
}));

function command(
  name: string,
  extra: Partial<SlashCommand> = {},
): SlashCommand {
  return {
    name,
    description: `Description for ${name}`,
    kind: CommandKind.BUILT_IN,
    ...extra,
  };
}

const commands = [
  command('resume'),
  command('clear'),
  command('model'),
  command('approval-mode'),
  command('init'),
  command('agents'),
  command('extensions'),
  command('config'),
  command('help'),
];

function renderMenu(availableTerminalHeight = 30, entries = commands) {
  const onSelect = vi.fn();
  const onDismiss = vi.fn();
  const onPanelChange = vi.fn();
  return {
    ...renderWithProviders(
      <SlashCommandMenu
        commands={entries}
        availableTerminalHeight={availableTerminalHeight}
        onSelect={onSelect}
        onDismiss={onDismiss}
        onPanelChange={onPanelChange}
      />,
    ),
    onSelect,
    onDismiss,
    onPanelChange,
  };
}

function expectCursor(frame: string | undefined, label: string) {
  const line = frame
    ?.split('\n')
    .find((line) => line.includes(label) && line.includes(glyphs().prompt));
  expect(line).toContain(glyphs().prompt);
}

describe('slash menu categories', () => {
  it('matches readable labels, descriptions and aliases, ignoring accents and case', () => {
    const entry = command('config', {
      altNames: ['preferences'],
      description: 'Change café settings',
    });
    expect(matchesSlashMenuQuery(entry, 'application settings')).toBe(true);
    expect(matchesSlashMenuQuery(entry, 'PREFERENCES')).toBe(true);
    expect(matchesSlashMenuQuery(entry, 'cafe')).toBe(true);
    expect(matchesSlashMenuQuery(entry, 'unknown')).toBe(false);
    expect(
      matchesSlashMenuQuery(command('model'), 'choose a model', 'stats model'),
    ).toBe(false);
  });

  it('keeps explicit arguments and multiline prompts in direct completion', () => {
    expect(isSlashMenuQuery('/application settings', commands)).toBe(true);
    expect(isSlashMenuQuery('/config general.language', commands)).toBe(false);
    expect(isSlashMenuQuery('/CONFIG general.language', commands)).toBe(false);
    expect(isSlashMenuQuery('/resume ', commands)).toBe(false);
    expect(isSlashMenuQuery('/res', commands)).toBe(false);
    expect(
      isSlashMenuQuery('/preferences value', [
        command('config', { altNames: ['preferences'] }),
      ]),
    ).toBe(false);
    expect(isSlashMenuQuery('/res\ntext', commands)).toBe(false);
    expect(isSlashMenuQuery('text /resume', commands)).toBe(false);
  });
  it('groups each available command exactly once without exposing unavailable commands', () => {
    const entries = [
      ...commands,
      command('future-command'),
      command('hidden', { hidden: true }),
      command('private', { userInvocable: false }),
      command('headless', { supportedModes: ['non_interactive'] }),
      command('model', { kind: CommandKind.FILE, source: 'plugin-command' }),
    ];
    const groups = getSlashMenuGroups(entries);
    const grouped = groups.slice(1).flatMap((group) => group.commands);
    expect(grouped).toHaveLength(commands.length + 2);
    expect(grouped).not.toContain(entries[commands.length + 1]);
    expect(grouped).not.toContain(entries[commands.length + 2]);
    expect(grouped).not.toContain(entries[commands.length + 3]);
    expect(
      groups.find((group) => group.id === 'integrations')?.commands,
    ).toContain(entries.at(-1));
    expect(groups.find((group) => group.id === 'help')?.commands).toContain(
      entries[commands.length],
    );
    expect(new Set(grouped)).toHaveProperty('size', grouped.length);
  });

  it('uses recent canonical commands in usage order and drops stale or hidden entries', () => {
    const recent = new Map([
      ['resume', { name: 'resume', usedAt: 10, count: 5 }],
      ['model', { name: 'model', usedAt: 20, count: 1 }],
      ['missing', { name: 'missing', usedAt: 30, count: 1 }],
      ['hidden', { name: 'hidden', usedAt: 40, count: 1 }],
    ]);
    expect(
      getSlashMenuGroups(
        [...commands, command('hidden', { hidden: true })],
        recent,
      )[0].commands,
    ).toEqual([commands[2], commands[0]]);
  });
});

describe('SlashCommandMenu', () => {
  beforeEach(() => {
    terminal.columns = 120;
  });

  it('filters a category without treating letters or digits as navigation or selection', async () => {
    const entry = command('resume', { description: 'json 2 snapshots' });
    const { stdin, lastFrame, onSelect } = renderMenu(30, [
      entry,
      command('clear'),
    ]);
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Search:'));
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'New session'));
    stdin.write('j');
    await vi.waitFor(() => expect(lastFrame()).not.toContain('New session'));
    stdin.write('2');
    await vi.waitFor(() => expect(lastFrame()).toContain('j2'));
    expect(onSelect).not.toHaveBeenCalled();
    stdin.write('\x15');
    await vi.waitFor(() => expect(lastFrame()).toContain('New session'));
    await vi.waitFor(() => expect(lastFrame()).toContain('/resume'));
    expect(lastFrame()).not.toContain('/clear');
  });

  it('navigates nested subcommands, hides unavailable descendants and restores the parent', async () => {
    const leaf = command('list');
    const parent = command('resume', {
      subCommands: [
        command('sessions', {
          subCommands: [leaf, command('secret', { hidden: true })],
        }),
        command('disabled', { userInvocable: false }),
      ],
    });
    const { stdin, lastFrame, onSelect } = renderMenu(30, [parent]);
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Resume a session'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Commands › /resume'));
    expect(lastFrame()).not.toContain('disabled');
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('/resume sessions list'),
    );
    expect(lastFrame()).not.toContain('secret');
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(leaf, 'resume sessions list'),
    );
    stdin.write('\x1b');
    await vi.waitFor(() => expect(lastFrame()).toContain('Commands › /resume'));
    await vi.waitFor(() => expectCursor(lastFrame(), 'sessions'));
    stdin.write('\x1b');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('Commands › Sessions and conversation'),
    );
    await vi.waitFor(() => expectCursor(lastFrame(), 'Resume a session'));
  });

  it('searches globally through available descendants using canonical paths', async () => {
    const leaf = command('list', {
      altNames: ['browse'],
      description: 'Stored snapshots',
    });
    const onSelect = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <SlashCommandMenu
        commands={[
          command('resume', { subCommands: [leaf] }),
          command('hidden', {
            hidden: true,
            subCommands: [command('snapshots')],
          }),
        ]}
        query="snapshots"
        availableTerminalHeight={30}
        onSelect={onSelect}
        onDismiss={vi.fn()}
        onPanelChange={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain('/resume list (browse)');
    expect(lastFrame()).not.toContain('/hidden');
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(leaf, 'resume list'),
    );
  });

  it('returns from a searched parent to the search results and accepts a result with Tab', async () => {
    const parent = command('config', { subCommands: [command('get')] });
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <SlashCommandMenu
        commands={[parent]}
        query="application settings"
        availableTerminalHeight={30}
        onSelect={onSelect}
        onDismiss={onDismiss}
        onPanelChange={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain('Commands › Search');
    stdin.write('\t');
    await vi.waitFor(() => expect(lastFrame()).toContain('Commands › /config'));
    stdin.write('\x1b');
    await vi.waitFor(() => expect(lastFrame()).toContain('Commands › Search'));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps a parent command action available alongside its subcommands', async () => {
    const parent = command('resume', {
      action: () => ({
        type: 'message',
        messageType: 'info',
        content: 'Session list',
      }),
      subCommands: [command('list')],
    });
    const { stdin, lastFrame, onSelect } = renderMenu(30, [parent]);
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Resume a session'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Commands › /resume'));
    expect(lastFrame()).toContain('list');
    expect(onSelect).not.toHaveBeenCalled();
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(parent, 'resume', true),
    );
  });

  it('keeps the filter cursor when editing in the middle of the query', async () => {
    const { stdin, lastFrame } = renderMenu();
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Search:'));
    stdin.write('resme');
    await vi.waitFor(() => expect(lastFrame()).toContain('resme'));
    stdin.write('\x1b[D');
    stdin.write('\x1b[D');
    stdin.write('u');
    await vi.waitFor(() => expect(lastFrame()).toContain('resume'));
    expect(lastFrame()).toContain('Resume a session');
  });

  it('prioritizes an exact command name over matching words in descriptions', async () => {
    const install = command('install');
    const parent = command('resume', {
      subCommands: [
        command('list', { description: 'List installed extensions' }),
        install,
      ],
    });
    const { stdin, lastFrame, onSelect } = renderMenu(30, [parent]);
    stdin.write('\x1b[B');
    await vi.waitFor(() => expect(lastFrame()).toContain('2/8'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Resume a session'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Commands › /resume'));
    stdin.write('install');
    await vi.waitFor(() => expectCursor(lastFrame(), 'install'));
    expect(lastFrame()).toContain('1/2');
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(install, 'resume install'),
    );
  });

  it('opens a category and executes only the explicitly selected real command', async () => {
    const { stdin, lastFrame, onSelect, onPanelChange } = renderMenu();
    expect(lastFrame()).toContain('Sessions and conversation');
    expect(lastFrame()).not.toContain('/resume');
    expect(lastFrame()).toContain('1/8');
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    expect(lastFrame()).toContain('2/8');
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('Commands › Sessions and conversation'),
    );
    expect(lastFrame()).toContain('Resume a session');
    expect(lastFrame()).toContain('/resume');
    expect(onPanelChange).toHaveBeenLastCalledWith(true);
    expect(onSelect).not.toHaveBeenCalled();
    stdin.write('\x1b[B');
    await vi.waitFor(() => expect(lastFrame()).toContain('2/2'));
    stdin.write('\r');
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(commands[1]));
  });

  it('returns to the same category cursor before dismissing the menu', async () => {
    const { stdin, lastFrame, onDismiss, onPanelChange } = renderMenu();
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    stdin.write('\t');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('Commands › Sessions and conversation'),
    );
    stdin.write('\x1b');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    expect(onPanelChange).toHaveBeenLastCalledWith(false);
    expect(onDismiss).not.toHaveBeenCalled();
    stdin.write('\x1b');
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('explains empty categories without applying a command', async () => {
    const { stdin, lastFrame, onSelect } = renderMenu();
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('No commands available in this category.'),
    );
    stdin.write('\r');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows aliases and owning extension metadata for integration commands', async () => {
    const entry = command('custom-action', {
      kind: CommandKind.FILE,
      source: 'plugin-command',
      sourceDetail: 'extension',
      sourceLabel: 'Extension: Sample',
      altNames: ['quick'],
      description: 'Execute the sample plugin action',
    });
    const { stdin, lastFrame } = renderMenu(30, [entry]);
    for (let index = 0; index < 5; index++) {
      stdin.write('\x1b[B');
      await vi.waitFor(() => expect(lastFrame()).toContain(`${index + 2}/8`));
    }
    await vi.waitFor(() =>
      expectCursor(lastFrame(), 'Plugins and integrations'),
    );
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('/custom-action (quick)'),
    );
    expect(lastFrame()).toContain('Extension: Sample');
  });

  it.each([8, 10, 12])(
    'bounds the root menu to %i available rows minus the prompt',
    (height) => {
      const { lastFrame } = renderMenu(height);
      expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(
        height - 3,
      );
    },
  );

  it('keeps the title visible when a filter has no matches in a short terminal', async () => {
    terminal.columns = 60;
    const { stdin, lastFrame } = renderMenu(9);
    stdin.write('\x1b[B');
    await vi.waitFor(() => expect(lastFrame()).toContain('2/8'));
    stdin.write('\r');
    await vi.waitFor(() => expect(lastFrame()).toContain('Search:'));
    stdin.write('no matches');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('No commands available'),
    );
    expect(lastFrame()).toContain('Commands › Sessions and conversation');
    expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(9);
  });

  it('keeps help below the category list in a narrow terminal', async () => {
    terminal.columns = 60;
    const { stdin, lastFrame } = renderMenu();
    stdin.write('\x1b[B');
    await vi.waitFor(() => expectCursor(lastFrame(), 'Sessions and'));
    stdin.write('\r');
    await vi.waitFor(() =>
      expect(lastFrame()).toContain('Description for resume'),
    );
    const lines = (lastFrame() ?? '').split('\n');
    expect(
      lines.findIndex((line) => line.includes('Description for resume')),
    ).toBeGreaterThan(lines.findIndex((line) => line.includes('New session')));
  });
});
