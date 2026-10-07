/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import type { RecentSlashCommands } from '../hooks/useSlashCompletion.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import { SelectionDialog } from './shared/SelectionDialog.js';
import { getEffectiveSupportedModes } from '../../services/commandUtils.js';
import {
  getCommandDisplayName,
  getCommandSourceBadge,
} from '../../services/commandMetadata.js';
import { normalizeDescription } from '../utils/suggestions.js';
import { extendedTheme, theme } from '../semantic-colors.js';
import { glyphs } from '../glyphs.js';
import { t } from '../../i18n/index.js';

const GROUPS = [
  {
    id: 'sessions',
    label: 'Sessions and conversation',
    description: 'Resume, history, export',
    names: [
      'resume',
      'clear',
      'rename',
      'branch',
      'rewind',
      'restore',
      'delete',
      'history',
      'export',
      'copy',
      'recap',
      'btw',
    ],
  },
  {
    id: 'execution',
    label: 'Model and execution',
    description: 'Models, reasoning and modes',
    names: [
      'model',
      'auth',
      'effort',
      'plan',
      'approval-mode',
      'output-style',
      'voice',
      'advisor',
      'arena',
    ],
  },
  {
    id: 'project',
    label: 'Project and context',
    description: 'Files, memory, compression',
    names: [
      'cd',
      'directory',
      'init',
      'diff',
      'context',
      'compress',
      'compress-fast',
      'summary',
      'memory',
      'remember',
      'forget',
      'dream',
      'learn',
      'curator',
    ],
  },
  {
    id: 'agents',
    label: 'Agents and tasks',
    description: 'Background work and goals',
    names: ['agents', 'fork', 'tasks', 'goal', 'workflows', 'peers'],
  },
  {
    id: 'integrations',
    label: 'Plugins and integrations',
    description: 'Stores, skills, MCP and hooks',
    names: [
      'plugins',
      'extensions',
      'reload-plugins',
      'skills',
      'hooks',
      'mcp',
      'lsp',
      'ide',
      'import-config',
      'tools',
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Appearance, language, permissions',
    names: [
      'config',
      'settings',
      'theme',
      'language',
      'editor',
      'vim',
      'terminal-setup',
      'statusline',
      'permissions',
      'trust',
    ],
  },
  {
    id: 'help',
    label: 'Help and diagnostics',
    description: 'Status, usage and updates',
    names: [
      'help',
      'docs',
      'about',
      'status',
      'stats',
      'insight',
      'doctor',
      'bug',
      'update',
      'quit',
    ],
  },
];

const COMMAND_LABELS: Record<string, string> = {
  resume: 'Resume a session',
  clear: 'New session',
  rename: 'Rename session',
  branch: 'Branch this session',
  rewind: 'Rewind conversation',
  restore: 'Restore checkpoint',
  delete: 'Delete session',
  history: 'Conversation history',
  export: 'Export conversation',
  copy: 'Copy last response',
  recap: 'Session recap',
  btw: 'Side question',
  model: 'Choose a model',
  auth: 'Connect a provider',
  effort: 'Reasoning effort',
  plan: 'Plan mode',
  'approval-mode': 'Tool Approval Mode',
  'output-style': 'Output style',
  voice: 'Voice input',
  advisor: 'Advisor model',
  arena: 'Model arena',
  cd: 'Change project directory',
  directory: 'Workspace directories',
  init: 'Initialize project instructions',
  diff: 'Project changes',
  context: 'Context usage',
  compress: 'Compress context',
  'compress-fast': 'Fast compression',
  summary: 'Conversation summary',
  memory: 'Project memory',
  remember: 'Remember information',
  forget: 'Forget information',
  dream: 'Consolidate memory',
  learn: 'Learn from this session',
  curator: 'Memory curator',
  agents: 'Manage agents',
  fork: 'Background agent',
  tasks: 'Background tasks',
  goal: 'Session goal',
  workflows: 'Saved workflows',
  peers: 'Peer sessions',
  plugins: 'Manage plugins',
  extensions: 'Manage plugins',
  'reload-plugins': 'Reload plugins',
  skills: 'Manage skills',
  hooks: 'Manage hooks',
  mcp: 'MCP servers',
  lsp: 'Language servers',
  ide: 'Editor connection',
  'import-config': 'Import configuration',
  tools: 'Available tools',
  config: 'Application settings',
  settings: 'Application settings',
  theme: 'Appearance theme',
  language: 'Interface language',
  editor: 'Choose editor',
  vim: 'Vim input mode',
  'terminal-setup': 'Terminal setup',
  statusline: 'Status line',
  permissions: 'Tool permissions',
  trust: 'Project trust',
  help: 'Command help',
  docs: 'Documentation',
  about: 'About application',
  status: 'Application status',
  stats: 'Usage statistics',
  insight: 'Project insights',
  doctor: 'Diagnostics',
  bug: 'Report a problem',
  update: 'Update application',
  quit: 'Exit application',
};

function isBuiltin(command: SlashCommand): boolean {
  return (
    command.source === 'builtin-command' ||
    (command.source === undefined && command.kind === CommandKind.BUILT_IN)
  );
}

function isAvailable(command: SlashCommand): boolean {
  return (
    !command.hidden &&
    command.userInvocable !== false &&
    getEffectiveSupportedModes(command).includes('interactive')
  );
}

function commandLabel(command: SlashCommand, path = command.name): string {
  return isBuiltin(command) && !path.includes(' ')
    ? t(COMMAND_LABELS[command.name] ?? command.name)
    : command.name;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export function matchesSlashMenuQuery(
  command: SlashCommand,
  query: string,
  path = command.name,
): boolean {
  const text = normalizeSearch(
    [
      path,
      command.name,
      ...(command.altNames ?? []),
      commandLabel(command, path),
      normalizeDescription(command.description),
    ].join(' '),
  );
  return normalizeSearch(query)
    .trim()
    .split(/\s+/u)
    .every((word) => text.includes(word));
}

export function isSlashMenuQuery(
  text: string,
  commands: readonly SlashCommand[],
): boolean {
  if (!text.startsWith('/') || text.includes('\n')) return false;
  const query = text.slice(1);
  const lowerQuery = query.toLowerCase();
  if (
    query &&
    !/\s/u.test(query) &&
    commands.some((command) =>
      [command.name, ...(command.altNames ?? [])].some((name) =>
        name.toLowerCase().startsWith(lowerQuery),
      ),
    )
  )
    return false;
  const first = lowerQuery.split(/\s/u)[0];
  return !(
    /\s/u.test(query) &&
    commands.some(
      (command) =>
        command.name.toLowerCase() === first ||
        command.altNames?.some((name) => name.toLowerCase() === first),
    )
  );
}

interface CommandEntry {
  command: SlashCommand;
  path: string;
  isParentAction?: boolean;
}

function searchPriority(entry: CommandEntry, query: string): number {
  const normalized = normalizeSearch(query).trim();
  if (!normalized) return 0;
  const names = [
    entry.command.name,
    ...(entry.command.altNames ?? []),
    entry.path,
    commandLabel(entry.command, entry.path),
  ].map(normalizeSearch);
  if (names.includes(normalized)) return 3;
  if (names.some((name) => name.startsWith(normalized))) return 2;
  if (names.some((name) => name.includes(normalized))) return 1;
  return 0;
}

function entriesFor(
  commands: readonly SlashCommand[],
  prefix = '',
): CommandEntry[] {
  return commands.filter(isAvailable).map((command) => ({
    command,
    path: `${prefix}${command.name}`,
  }));
}

function searchEntries(
  commands: readonly SlashCommand[],
  query: string,
  prefix = '',
): CommandEntry[] {
  return entriesFor(commands, prefix).flatMap((entry) => [
    ...(matchesSlashMenuQuery(entry.command, query, entry.path) ? [entry] : []),
    ...searchEntries(entry.command.subCommands ?? [], query, `${entry.path} `),
  ]);
}

export function getSlashMenuGroups(
  commands: readonly SlashCommand[],
  recentCommands?: RecentSlashCommands,
) {
  const available = commands.filter(
    (command) =>
      !command.hidden &&
      command.userInvocable !== false &&
      getEffectiveSupportedModes(command).includes('interactive'),
  );
  const grouped = new Map<string, SlashCommand[]>();
  for (const command of available) {
    const group = isBuiltin(command)
      ? (GROUPS.find((group) => group.names.includes(command.name))?.id ??
        'help')
      : 'integrations';
    grouped.set(group, [...(grouped.get(group) ?? []), command]);
  }
  const recent = [...(recentCommands?.values() ?? [])]
    .sort((left, right) => right.usedAt - left.usedAt)
    .flatMap((entry) => {
      const command = available.find((command) => command.name === entry.name);
      return command ? [command] : [];
    })
    .slice(0, 8);
  return [
    {
      id: 'recent',
      label: t('Recent commands'),
      description: t('Commands used in this session'),
      commands: recent,
    },
    ...GROUPS.map((group) => {
      const commands = grouped.get(group.id) ?? [];
      return {
        id: group.id,
        label: t(group.label),
        description: t(group.description),
        commands: commands.sort((left, right) => {
          const leftIndex = group.names.indexOf(left.name);
          const rightIndex = group.names.indexOf(right.name);
          return (
            (leftIndex < 0 ? Infinity : leftIndex) -
              (rightIndex < 0 ? Infinity : rightIndex) ||
            left.name.localeCompare(right.name)
          );
        }),
      };
    }),
  ];
}

interface SlashCommandMenuProps {
  commands: readonly SlashCommand[];
  recentCommands?: RecentSlashCommands;
  availableTerminalHeight: number;
  query?: string;
  onSelect: (
    command: SlashCommand,
    path?: string,
    invokeBareAction?: boolean,
  ) => void;
  onDismiss: () => void;
  onPanelChange: (open: boolean) => void;
  onHeightChange?: (height: number) => void;
}

export function SlashCommandMenu({
  commands,
  recentCommands,
  availableTerminalHeight,
  onSelect,
  onDismiss,
  onPanelChange,
  onHeightChange,
  query = '',
}: SlashCommandMenuProps) {
  const { columns } = useTerminalSize();
  const width = Math.max(1, Math.min(columns - 4, 140));
  const groups = useMemo(
    () => getSlashMenuGroups(commands, recentCommands),
    [commands, recentCommands],
  );
  const [groupId, setGroupId] = useState<string | null>(null);
  const [highlightedGroup, setHighlightedGroup] = useState('recent');
  const group = groups.find((group) => group.id === groupId);
  const [highlighted, setHighlighted] = useState<string | undefined>();
  const [filter, setFilter] = useState('');
  const [parents, setParents] = useState<
    Array<{
      entry: CommandEntry;
      filter: string;
      highlighted: string | undefined;
      groupId: string | null;
    }>
  >([]);
  const parent = parents.at(-1)?.entry;
  const matchingEntries = group
    ? [
        ...(parent?.command.action
          ? [{ ...parent, isParentAction: true }]
          : []),
        ...entriesFor(
          parent?.command.subCommands ?? group.commands,
          parent ? `${parent.path} ` : '',
        ),
      ].filter((entry) =>
        matchesSlashMenuQuery(entry.command, filter, entry.path),
      )
    : query
      ? searchEntries(commands, query)
      : [];
  const entries = matchingEntries.sort(
    (left, right) =>
      searchPriority(right, group ? filter : query) -
      searchPriority(left, group ? filter : query),
  );
  const selectEntry = (entry: CommandEntry | undefined) => {
    if (!entry) return;
    if (entry.isParentAction) {
      onSelect(entry.command, entry.path, true);
      return;
    }
    if (entriesFor(entry.command.subCommands ?? []).length) {
      if (!group) {
        setGroupId(
          groups.find((group) =>
            group.commands.some(
              (command) => entry.path.split(' ')[0] === command.name,
            ),
          )?.id ?? 'help',
        );
      }
      setParents([
        ...parents,
        { entry, filter, highlighted: entry.path, groupId },
      ]);
      setFilter('');
      setHighlighted(undefined);
    } else if (entry.path === entry.command.name) onSelect(entry.command);
    else onSelect(entry.command, entry.path);
  };
  const height = Math.max(
    1,
    Math.min(availableTerminalHeight - 3, groups.length + 3),
  );
  useEffect(() => {
    if (!group && !query) onHeightChange?.(height);
  }, [group, query, height, onHeightChange]);
  useEffect(() => {
    onPanelChange(groupId !== null);
  }, [groupId, onPanelChange]);
  useKeypress(
    (key) => {
      if (key.name === 'tab' && groupId === null && !query)
        setGroupId(highlightedGroup);
      else if (key.name === 'tab' && query && !group) {
        selectEntry(
          entries.find((entry) => entry.path === highlighted) ?? entries[0],
        );
      }
      if (key.name === 'escape') {
        if (parents.length) {
          const parent = parents.at(-1)!;
          setParents(parents.slice(0, -1));
          setGroupId(parent.groupId);
          setFilter(parent.filter);
          setHighlighted(parent.highlighted);
        } else if (groupId !== null) {
          setGroupId(null);
          setHighlighted(undefined);
          setFilter('');
        } else onDismiss();
      }
    },
    { isActive: true },
  );

  if (group || query) {
    const title = parent ? `/${parent.path}` : (group?.label ?? t('Search'));
    return (
      <Box marginX={2}>
        <SelectionDialog<CommandEntry | undefined>
          key={`${group?.id ?? 'search'}:${parent?.path ?? ''}`}
          title={`${t('Commands')} › ${title}`}
          subtitle={
            parent
              ? normalizeDescription(parent.command.description)
              : (group?.description ?? '')
          }
          items={entries.map((entry) => ({
            key: entry.path,
            value: entry,
            label: `${commandLabel(entry.command, entry.path)}${!entry.isParentAction && entriesFor(entry.command.subCommands ?? []).length ? ' ›' : ''}`,
            description: [
              normalizeDescription(entry.command.description),
              `${getCommandDisplayName({ ...entry.command, name: entry.path }, { prefix: '/' })}${entry.command.argumentHint ? ` ${entry.command.argumentHint}` : ''}`,
              getCommandSourceBadge(entry.command),
            ]
              .filter(Boolean)
              .join('\n'),
          }))}
          currentValue={undefined}
          textNavigation
          onHeightChange={onHeightChange}
          initialValue={
            entries.find((entry) => entry.path === highlighted) ?? entries[0]
          }
          onHighlight={(entry) => setHighlighted(entry?.path)}
          onSelect={selectEntry}
          filter={
            group
              ? {
                  value: filter,
                  onChange: (value) => {
                    setFilter(value);
                    setHighlighted(undefined);
                  },
                }
              : undefined
          }
          footer={t('↑↓ navigate · enter select · esc back')}
          warning={
            entries.length === 0
              ? t('No commands available in this category.')
              : undefined
          }
          availableTerminalHeight={
            group
              ? availableTerminalHeight
              : Math.max(1, availableTerminalHeight - 3)
          }
        />
      </Box>
    );
  }

  const listRows = Math.max(1, height - 3);
  return (
    <Box
      marginX={2}
      width={width}
      height={height}
      borderStyle={glyphs().borderStyle}
      borderColor={extendedTheme.ui.rule}
      paddingX={1}
      flexDirection="column"
      overflow="hidden"
    >
      <Box height={listRows} overflow="hidden">
        <BaseSelectionList
          items={groups.map((group) => ({
            key: group.id,
            value: group.id,
            ...group,
          }))}
          initialIndex={Math.max(
            0,
            groups.findIndex((group) => group.id === highlightedGroup),
          )}
          showNumbers={false}
          maxItemsToShow={listRows}
          onHighlight={(id: string) => setHighlightedGroup(id)}
          onSelect={(id) => {
            setGroupId(id);
            setHighlighted(undefined);
          }}
          renderItem={(item, { titleColor, isSelected }) => (
            <Box width="100%">
              <Box width="45%">
                <Text bold={isSelected} color={titleColor} wrap="truncate-end">
                  {item.label}
                </Text>
              </Box>
              <Box flexGrow={1} minWidth={0}>
                <Text color={theme.text.secondary} wrap="truncate-end">
                  {item.description}
                </Text>
              </Box>
            </Box>
          )}
        />
      </Box>
      {height >= 4 && (
        <Box height={1} flexShrink={0}>
          <Box flexGrow={1} minWidth={0}>
            <Text color={extendedTheme.text.muted} wrap="truncate-end">
              {t(
                'Type to search commands · ↑↓ navigate · enter open · esc close',
              )}
            </Text>
          </Box>
          <Box marginLeft={1} flexShrink={0}>
            <Text color={extendedTheme.text.muted}>
              {Math.max(
                0,
                groups.findIndex((group) => group.id === highlightedGroup),
              ) + 1}
              /{groups.length}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
