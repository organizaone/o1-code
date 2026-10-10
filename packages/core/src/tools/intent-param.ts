/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type, type FunctionDeclaration, type Schema } from '@google/genai';

/**
 * Optional argument advertised on every declared tool. The model states the
 * purpose of the step in it; the Summary display mode shows that sentence in
 * place of the tool's arguments. The scheduler removes it before validation,
 * hooks, permission checks and the tool itself see the arguments.
 */
export const INTENT_PARAM = 'intent';

export const INTENT_MAX_LENGTH = 120;

export const INTENT_DESCRIPTION =
  "Short sentence in the user's language, infinitive form, stating the purpose of this step (max 80 characters).";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the tool's own schema already has an `intent` property. */
export function declaresOwnIntent(declaration: FunctionDeclaration): boolean {
  const json = declaration.parametersJsonSchema;
  if (isRecord(json) && isRecord(json['properties'])) {
    return Object.hasOwn(json['properties'], INTENT_PARAM);
  }
  const properties = declaration.parameters?.properties;
  return properties !== undefined && Object.hasOwn(properties, INTENT_PARAM);
}

/**
 * Returns a copy of the declaration with an optional `intent` string
 * property. `required` is never touched; a declaration that already defines
 * `intent` is returned unchanged.
 */
export function withIntentParam(
  declaration: FunctionDeclaration,
): FunctionDeclaration {
  if (declaresOwnIntent(declaration)) return declaration;

  const json = declaration.parametersJsonSchema;
  if (isRecord(json)) {
    const properties = isRecord(json['properties']) ? json['properties'] : {};
    return {
      ...declaration,
      parametersJsonSchema: {
        ...json,
        properties: {
          ...properties,
          [INTENT_PARAM]: { type: 'string', description: INTENT_DESCRIPTION },
        },
      },
    };
  }

  if (declaration.parameters) {
    const parameters: Schema = {
      ...declaration.parameters,
      properties: {
        ...(declaration.parameters.properties ?? {}),
        [INTENT_PARAM]: { type: Type.STRING, description: INTENT_DESCRIPTION },
      },
    };
    return { ...declaration, parameters };
  }

  return {
    ...declaration,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        [INTENT_PARAM]: { type: 'string', description: INTENT_DESCRIPTION },
      },
    },
  };
}

/**
 * Splits `intent` off a tool call's arguments. The input is not mutated; the
 * sentence is trimmed and capped, and an empty or non-string value is dropped.
 */
export function extractIntent(args: Record<string, unknown>): {
  intent?: string;
  args: Record<string, unknown>;
} {
  if (!Object.hasOwn(args, INTENT_PARAM)) return { args };
  const { [INTENT_PARAM]: raw, ...rest } = args;
  const intent =
    typeof raw === 'string' ? raw.trim().slice(0, INTENT_MAX_LENGTH) : '';
  return intent ? { intent, args: rest } : { args: rest };
}

/** Arguments a tool may be built with: `intent` removed unless it owns one. */
export function argsWithoutIntent(
  declaration: FunctionDeclaration,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return declaresOwnIntent(declaration) ? args : extractIntent(args).args;
}
