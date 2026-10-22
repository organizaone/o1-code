// Copyright 2026 o1-code contributors
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthType, type Config } from '@organizaone/o1-code-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { MultiSelect } from '../shared/MultiSelect.js';
import { ArenaStartDialog } from './ArenaStartDialog.js';

vi.mock('../shared/MultiSelect.js', () => ({ MultiSelect: vi.fn(() => null) }));
vi.mock('../../hooks/useKeypress.js', () => ({ useKeypress: vi.fn() }));

describe('ArenaStartDialog', () => {
  it('keeps provider labels and protocol-specific selection keys without displaying protocols', async () => {
    const config = {
      getAllConfiguredModels: () =>
        [AuthType.USE_OPENAI, AuthType.USE_ANTHROPIC].map((authType) => ({
          id: 'shared-model',
          label: '[OrganizaOne] Shared model',
          authType,
        })),
    } as unknown as Config;
    const onConfirm = vi.fn();
    const { unmount } = renderWithProviders(
      <ArenaStartDialog onClose={vi.fn()} onConfirm={onConfirm} />,
      { config },
    );
    const props = vi.mocked(MultiSelect).mock.calls[0][0];
    expect(props.items.map(({ label }) => label)).toEqual([
      '[OrganizaOne] Shared model',
      '[OrganizaOne] Shared model',
    ]);
    expect(props.items.map(({ value }) => value)).toEqual([
      'openai:shared-model',
      'anthropic:shared-model',
    ]);
    await act(async () =>
      props.onConfirm(
        ['openai:shared-model', 'anthropic:shared-model'],
        'openai:shared-model',
      ),
    );
    expect(onConfirm).toHaveBeenCalledWith([
      'openai:shared-model',
      'anthropic:shared-model',
    ]);
    unmount();
  });
});
