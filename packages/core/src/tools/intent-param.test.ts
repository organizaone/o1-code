/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Type, type FunctionDeclaration } from '@google/genai';
import {
  INTENT_DESCRIPTION,
  INTENT_MAX_LENGTH,
  argsWithoutIntent,
  declaresOwnIntent,
  extractIntent,
  withIntentParam,
} from './intent-param.js';

describe('withIntentParam', () => {
  it('adds an optional intent string to a JSON schema and keeps required', () => {
    const declaration: FunctionDeclaration = {
      name: 'edit',
      parametersJsonSchema: {
        type: 'object',
        properties: { file_path: { type: 'string' } },
        required: ['file_path'],
        additionalProperties: false,
      },
    };
    const result = withIntentParam(declaration);
    expect(result.parametersJsonSchema).toEqual({
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        intent: { type: 'string', description: INTENT_DESCRIPTION },
      },
      required: ['file_path'],
      additionalProperties: false,
    });
    expect(declaration.parametersJsonSchema).not.toHaveProperty(
      'properties.intent',
    );
  });

  it('adds intent to a genai Schema', () => {
    const result = withIntentParam({
      name: 'legacy',
      parameters: { type: Type.OBJECT, properties: {}, required: [] },
    });
    expect(result.parameters?.properties?.['intent']).toEqual({
      type: Type.STRING,
      description: INTENT_DESCRIPTION,
    });
    expect(result.parameters?.required).toEqual([]);
  });

  it('creates an object schema for a tool without parameters', () => {
    const result = withIntentParam({ name: 'noargs' });
    expect(result.parametersJsonSchema).toEqual({
      type: 'object',
      properties: {
        intent: { type: 'string', description: INTENT_DESCRIPTION },
      },
    });
  });

  it('leaves a tool that already declares intent untouched', () => {
    const declaration: FunctionDeclaration = {
      name: 'mcp',
      parametersJsonSchema: {
        type: 'object',
        properties: { intent: { type: 'number' } },
      },
    };
    expect(declaresOwnIntent(declaration)).toBe(true);
    expect(withIntentParam(declaration)).toBe(declaration);
  });

  it('treats a missing declaration as not owning intent', () => {
    expect(declaresOwnIntent(undefined)).toBe(false);
    expect(argsWithoutIntent(undefined, { a: 1, intent: 'x' })).toEqual({
      a: 1,
    });
  });
});

describe('extractIntent', () => {
  it('splits intent off without mutating the input', () => {
    const args = { file_path: 'a.ts', intent: '  Fix the login  ' };
    const result = extractIntent(args);
    expect(result).toEqual({
      intent: 'Fix the login',
      args: { file_path: 'a.ts' },
    });
    expect(args).toHaveProperty('intent');
  });

  it('caps the sentence', () => {
    const result = extractIntent({ intent: 'x'.repeat(500) });
    expect(result.intent).toHaveLength(INTENT_MAX_LENGTH);
  });

  it('drops empty and non-string values', () => {
    expect(extractIntent({ intent: '   ', a: 1 })).toEqual({ args: { a: 1 } });
    expect(extractIntent({ intent: 42 })).toEqual({ args: {} });
  });

  it('returns the same args when there is no intent', () => {
    const args = { a: 1 };
    expect(extractIntent(args).args).toBe(args);
  });
});
