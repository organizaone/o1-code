/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

export function mockConstructorReturning<T>(value: T): () => T {
  return function MockConstructor(): T {
    return value;
  };
}
