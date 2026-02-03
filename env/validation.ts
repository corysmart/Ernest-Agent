const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function assertSafePayload(payload?: Record<string, unknown>): void {
  if (!payload) {
    return;
  }

  if (typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }

  if (containsUnsafeKeys(payload)) {
    throw new Error('Unsafe payload');
  }
}

function containsUnsafeKeys(value: unknown): boolean {
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
    if (containsUnsafeKeys(nested)) {
      return true;
    }
  }

  return false;
}
