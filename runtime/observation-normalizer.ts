/**
 * ObservationNormalizer produces StateObservation from raw text inputs.
 * Enforces input size caps and safe object validation.
 */

import { assertSafeObject } from '../security/validation';
import type { RawTextObservation } from './types';
import type { StateObservation } from '../env/types';

/** Reserved key for events in raw observation; value is JSON array of strings. */
const EVENTS_KEY = 'events';

export interface ObservationNormalizerOptions {
  /** Maximum character length per input field. Default: 10_000. */
  maxInputLength?: number;
  /** Maximum character length per event string. Default: 500. */
  maxEventLength?: number;
  /** Maximum number of events. Default: 50. */
  maxEvents?: number;
  /** Total max characters across all state fields. Default: 50_000. */
  maxTotalStateLength?: number;
  /** Optional clock for deterministic tests. */
  getTime?: () => number;
}

export class ObservationNormalizer {
  private readonly maxInputLength: number;
  private readonly maxEventLength: number;
  private readonly maxEvents: number;
  private readonly maxTotalStateLength: number;
  private readonly getTime: () => number;

  constructor(options: ObservationNormalizerOptions = {}) {
    this.maxInputLength = options.maxInputLength ?? 10_000;
    this.maxEventLength = options.maxEventLength ?? 500;
    this.maxEvents = options.maxEvents ?? 50;
    this.maxTotalStateLength = options.maxTotalStateLength ?? 50_000;
    this.getTime = options.getTime ?? (() => Date.now());
  }

  /**
   * Normalizes raw text observations into a safe StateObservation.
   * Enforces size caps and validates against unsafe keys (__proto__, prototype, constructor).
   */
  normalize(raw: RawTextObservation): StateObservation {
    assertSafeObject(raw);

    const state: Record<string, unknown> = {};
    let totalLength = 0;
    let events: string[] = [];

    for (const [key, value] of Object.entries(raw)) {
      if (key === EVENTS_KEY) {
        events = this.parseAndValidateEvents(value);
        continue;
      }

      const str = typeof value === 'string' ? value : String(value);
      if (str.length > this.maxInputLength) {
        throw new Error(
          `Input field "${key}" exceeds maximum length of ${this.maxInputLength} characters`
        );
      }
      totalLength += str.length;
      state[key] = str;
    }

    if (totalLength > this.maxTotalStateLength) {
      throw new Error(
        `Total state length (${totalLength}) exceeds maximum of ${this.maxTotalStateLength} characters`
      );
    }

    return {
      timestamp: this.getTime(),
      state,
      events
    };
  }

  private parseAndValidateEvents(value: unknown): string[] {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    let arr: unknown[];
    try {
      const parsed = JSON.parse(str);
      if (!Array.isArray(parsed)) {
        return [];
      }
      arr = parsed;
    } catch {
      return [];
    }

    const result: string[] = [];
    for (let i = 0; i < arr.length && result.length < this.maxEvents; i++) {
      const item = arr[i];
      const str = typeof item === 'string' ? item : String(item);
      if (str.length > this.maxEventLength) {
        throw new Error(
          `Event at index ${i} exceeds maximum event length of ${this.maxEventLength} characters`
        );
      }
      result.push(str);
    }
    return result;
  }
}
