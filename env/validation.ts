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
