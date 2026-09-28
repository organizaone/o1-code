/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, ReasoningEffort } from '@organizaone/o1-code-core';
import { applyReasoningEffort } from '@organizaone/o1-code-core/core/reasoning-effort.js';
import { t } from '../../i18n/index.js';
import type { LoadedSettings } from '../../config/settings.js';
import { getPersistScopeForModelSelection } from '../../config/modelProvidersScope.js';
import { REASONING_EFFORT_DEFAULT } from '../../acp-integration/model-configuration.js';

/** A tier, or `default`: no tier of our own, the model/provider decides. */
export type EffortSelection = ReasoningEffort | typeof REASONING_EFFORT_DEFAULT;

/**
 * Applies an effort choice for the next turn and, unless told not to, saves
 * it for future sessions. `default` clears the saved tier. Returns the line
 * that reports the outcome.
 */
export function applyEffortSelection(
  config: Config,
  settings: LoadedSettings | undefined,
  selection: EffortSelection,
  persist = true,
): string {
  const tier = selection === REASONING_EFFORT_DEFAULT ? undefined : selection;
  applyReasoningEffort(config, tier);
  if (persist && settings) {
    settings.setValue(
      getPersistScopeForModelSelection(settings),
      'model.reasoningEffort',
      tier,
    );
  }
  return tier
    ? formatEffortChangeMessage(config, tier)
    : t('Reasoning effort: default (the model/provider decides).');
}

export function formatEffortChangeMessage(
  config: Config,
  tier: ReasoningEffort,
): string {
  if (config.getReasoningEffort() !== tier) {
    const override = config.getReasoningEffortOverride?.();
    if (override) {
      return t(
        'Reasoning effort set to {{tier}}, but thinking is currently disabled; after thinking is re-enabled, {{source}}.{{field}} will still have higher priority.',
        { tier, source: override.source, field: override.field },
      );
    }
    return t(
      'Reasoning effort set to {{tier}}, but thinking is currently disabled — it will take effect when thinking is re-enabled.',
      { tier },
    );
  }

  const override = config.getReasoningEffortOverride?.();
  if (override) {
    return t(
      'Reasoning effort: {{tier}} requested, but {{source}}.{{field}} has higher priority for the active DashScope model; that configured value will remain effective.',
      { tier, source: override.source, field: override.field },
    );
  }

  return t(
    'Reasoning effort: {{tier}} (requested; the effective tier depends on the active provider/model).',
    { tier },
  );
}
