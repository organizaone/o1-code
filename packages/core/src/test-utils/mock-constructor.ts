/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export function mockConstructorReturning<T>(value: T): () => T {
  return function MockConstructor(): T {
    return value;
  };
}
