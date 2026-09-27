/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InputModalities } from './contentGenerator.js';
import { normalize } from './tokenLimits.js';
import { parseModelReasoningCapabilities } from './reasoning-effort.js';

const FULL_MULTIMODAL: InputModalities = {
  image: true,
  pdf: true,
  audio: true,
  video: true,
};

/**
 * Ordered regex patterns: most specific -> most general (first match wins).
 * Default for unknown models is text-only (empty object = all false).
 */
const MODALITY_PATTERNS: Array<[RegExp, InputModalities]> = [
  // -------------------
  // Google Gemini — full multimodal
  // -------------------
  [/^gemini-3/, FULL_MULTIMODAL],
  [/^gemini-/, FULL_MULTIMODAL],

  // -------------------
  // OpenAI — image by default for all gpt/o-series models
  // -------------------
  [/^gpt-5/, { image: true }],
  [/^gpt-/, { image: true }],
  [/^o\d/, { image: true }],

  // -------------------
  // Anthropic Claude — image + pdf
  // -------------------
  [/^claude-/, { image: true, pdf: true }],

  // -------------------
  // Alibaba (DashScope)
  // -------------------
  // Omni models: full multimodal (image + audio + video) — the omni
  // harness targets these. Must precede the plus and catch-all patterns
  // below: "qwen3.5-omni-plus" would otherwise be text-only.
  [/^qwen\d*\.?\d*-omni/, FULL_MULTIMODAL],
  [/^qwen-omni/, FULL_MULTIMODAL],
  // Plus models: image + video support
  [/^qwen3\.5-plus/, { image: true, video: true }],
  [/^qwen3\.6-plus/, { image: true, video: true }],
  [/^qwen3\.7-plus/, { image: true, video: true }],
  // qwen3.8 series: flash/plus support image + video; max supports image only
  [/^qwen3\.8-flash/, { image: true, video: true }],
  [/^qwen3\.8-plus/, { image: true, video: true }],
  [/^qwen3\.8-max/, { image: true }],
  [/^coder-model$/, { image: true, video: true }],

  // VL (vision-language) models: image + video
  [/^qwen-vl-/, { image: true, video: true }],
  [/^qwen3-vl-/, { image: true, video: true }],

  // Coder / text models: text-only
  [/^qwen3-coder-/, {}],
  // qwen3.6-35b-a3b (local quant variants) — image + video
  [/^qwen3\.6-35b/, { image: true, video: true }],
  [/^qwen/, {}],

  // -------------------
  // DeepSeek — text-only, except explicit vision variants
  // -------------------
  [/^deepseek-.*vision/, { image: true }],
  [/^deepseek/, {}],

  // -------------------
  // Zhipu GLM — v-suffix ids are vision models; others are text-only
  // -------------------
  [/^glm-[0-9.]+v/, { image: true }],
  // glm-5.3-flash natively integrates vision input (no v suffix)
  [/^glm-5\.3-flash/, { image: true }],
  [/^glm-5(?:-|$)/, {}],
  [/^glm-/, {}],

  // -------------------
  // MiniMax — M3 supports image + video input; older models default to text-only
  // -------------------
  [/^minimax-m3/i, { image: true, video: true }],
  [/^minimax-/, {}],

  // -------------------
  // Moonshot / Kimi
  // -------------------
  [/^kimi-k3/, { image: true, video: true }],
  [/^kimi-k2\./, { image: true, video: true }],
  [/^kimi-/, {}],

  // -------------------
  // ByteDance Doubao — Seed-series and *-vision / *-vl models accept image
  // input; other Doubao models (pro / lite / text) are text-only.
  // -------------------
  // seedance (text→video) and seedream (text→image) are generation models with
  // text-only input — exclude them before the multimodal Seed chat series.
  [/^doubao-seed(ance|ream)/, {}],
  [/^doubao-seed/, { image: true }],
  [/^doubao-.*(vision|vl)/, { image: true }],
  [/^doubao/, {}],
];

/**
 * Return the default input modalities for a model based on its name.
 *
 * Uses the same normalize-then-regex pattern as {@link tokenLimit}.
 * Unknown models default to text-only (empty object) to avoid sending
 * unsupported media types that would cause unrecoverable API errors.
 */
export function defaultModalities(model: string): InputModalities {
  const norm = normalize(model);
  for (const [regex, modalities] of MODALITY_PATTERNS) {
    if (regex.test(norm)) {
      return { ...modalities };
    }
  }
  return {};
}

/**
 * True for wire model ids DashScope serves first-party: any `qwen*` model id
 * plus `coder-model`, the default model id (DEFAULT_O1CODE_MODEL in
 * config/models.ts), which DashScope aliases to a hybrid-thinking model.
 * Shared by the pipeline's disable/tool-choice gates and the DashScope
 * provider's effort mapping so the family fact lives in one place.
 */
export function isDashScopeWireModel(model: string | undefined): boolean {
  if (!model) {
    return false;
  }
  const normalized = model.toLowerCase();
  return normalized.startsWith('qwen') || normalized === 'coder-model';
}

/**
 * A configured DashScope reasoning protocol takes precedence over the legacy
 * qwen3.8-max family fallback. Other providers use independent wire rules.
 */
export function isTieredEffortWireModel(
  model: string | undefined,
  configuredReasoning?: unknown,
): boolean {
  if (!model) {
    return false;
  }
  const reasoning = parseModelReasoningCapabilities(configuredReasoning);
  if (reasoning) {
    return (
      isDashScopeWireModel(model) &&
      !reasoning.toggleOnly &&
      reasoning.disableField === 'reasoning_effort'
    );
  }
  return model.toLowerCase().startsWith('qwen3.8-max');
}
