const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function assertSafeObject(value: unknown): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (containsUnsafeKeys(value)) {
    throw new Error('Unsafe object');
  }
}

function containsUnsafeKeys(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
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
