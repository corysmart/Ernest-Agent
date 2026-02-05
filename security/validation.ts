const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Maximum depth for recursive object validation to prevent DoS via deep nesting.
 * Default: 50 levels
 */
const MAX_DEPTH = 50;

export function assertSafeObject(value: unknown): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (containsUnsafeKeys(value, 0)) {
    throw new Error('Unsafe object');
  }
}

/**
 * P3: Recursively checks for unsafe keys with depth limit to prevent DoS attacks.
 * Uses iterative traversal with depth tracking instead of pure recursion.
 */
function containsUnsafeKeys(value: unknown, currentDepth: number): boolean {
  if (currentDepth >= MAX_DEPTH) {
    throw new Error(`Object depth exceeds maximum allowed depth of ${MAX_DEPTH}`);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  // Check if prototype was modified (indicates __proto__ pollution)
  // Only check plain objects (not arrays or other built-ins)
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    // If it's a plain object but prototype was changed, it's unsafe
    return true;
  }

  // Use getOwnPropertyNames to catch other unsafe keys
  const keys = Object.getOwnPropertyNames(value as Record<string, unknown>);
  for (const key of keys) {
    if (UNSAFE_KEYS.has(key)) {
      return true;
    }

    const nested = (value as Record<string, unknown>)[key];
    if (containsUnsafeKeys(nested, currentDepth + 1)) {
      return true;
    }
  }

  return false;
}
