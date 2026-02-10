const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Maximum depth for recursive payload validation to prevent DoS via deep nesting.
 * Default: 50 levels (matches assertSafeObject)
 */
const MAX_DEPTH = 50;

export function assertSafePayload(payload?: Record<string, unknown>): void {
  if (!payload) {
    return;
  }

  if (typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }

  if (containsUnsafeKeys(payload, 0)) {
    throw new Error('Unsafe payload');
  }
}

/**
 * P3: Recursively checks for unsafe keys with depth limit to prevent DoS attacks.
 * Uses depth tracking to prevent stack overflow from deeply nested payloads.
 */
function containsUnsafeKeys(value: unknown, currentDepth: number): boolean {
  if (currentDepth >= MAX_DEPTH) {
    throw new Error(`Payload depth exceeds maximum allowed depth of ${MAX_DEPTH}`);
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
