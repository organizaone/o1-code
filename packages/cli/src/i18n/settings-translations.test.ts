// Copyright 2026 o1-code contributors. SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { Storage } from '@organizaone/o1-code-core/config/storage.js';
import { LoadedSettings, SettingScope } from '../config/settings.js';
import {
  getDialogSettingKeys,
  getDisplayValue,
  getSettingDefinition,
} from '../config/settingsUtils.js';
import { getScopeMessageForSetting } from '../config/dialogScopeUtils.js';
import { setLanguageAsync, t } from './index.js';

describe('Portuguese settings translations', () => {
  beforeEach(async () => {
    vi.spyOn(Storage, 'getGlobalO1CodeDir').mockReturnValue(
      path.join(os.tmpdir(), 'o1-code-settings-translation-test'),
    );
    await setLanguageAsync('pt');
  });

  afterEach(async () => {
    await setLanguageAsync('en');
    vi.restoreAllMocks();
  });

  it('covers every visible setting label, description and option', () => {
    const missing: string[] = [];
    for (const key of getDialogSettingKeys()) {
      const definition = getSettingDefinition(key)!;
      const strings = [
        definition.label,
        definition.description,
        ...(definition.options ?? []).map((option) => option.label),
      ];
      for (const text of strings) {
        if (text && text !== 'YOLO' && t(text) === text) {
          missing.push(`${key}: ${text}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('translates settings chrome and preserves command names and placeholders', () => {
    expect(t('Stats')).toBe('Estatísticas');
    expect(t('Search settings…')).toBe('Pesquisar configurações…');
    expect(t('(↑ to switch tabs)')).toBe('(↑ para alternar abas)');
    expect(t('tab · r dates · ←→ month · esc')).toBe(
      'Tab · r datas · ←→ mês · Esc',
    );
    expect(
      t('+{{count}} more (run /stats for the full list)', { count: '3' }),
    ).toBe('+3 itens (use /stats para ver a lista completa)');
    expect(t('Attribution: review')).toBe('Atribuição: revisão');
    expect(t('All (approvals + task completion)')).toBe(
      'Todas (aprovações e conclusão de tarefas)',
    );
  });

  it('localizes boolean values while preserving the modification marker', () => {
    expect(
      getDisplayValue(
        'general.terminalBell',
        { general: { terminalBell: true } },
        {},
        new Set(),
      ),
    ).toBe('Ativado*');
    expect(
      getDisplayValue(
        'general.terminalBell',
        { general: { terminalBell: false } },
        {},
        new Set(),
      ),
    ).toBe('Desativado*');
  });

  it('translates inherited scopes and retains the English fallback', async () => {
    const user = { general: { terminalBell: true } };
    const file = (settings = {}) => ({
      settings,
      originalSettings: settings,
      path: '/settings.json',
    });
    const settings = new LoadedSettings(
      file(),
      file(),
      file(user),
      file(),
      true,
      new Set(),
    );
    expect(
      getScopeMessageForSetting(
        'general.terminalBell',
        SettingScope.Workspace,
        settings,
      ),
    ).toBe('(Alterado em Usuário)');
    await setLanguageAsync('en');
    expect(
      getScopeMessageForSetting(
        'general.terminalBell',
        SettingScope.Workspace,
        settings,
      ),
    ).toBe('(Modified in User)');
    expect(getDisplayValue('general.terminalBell', user, {}, new Set())).toBe(
      'true*',
    );
  });
});
