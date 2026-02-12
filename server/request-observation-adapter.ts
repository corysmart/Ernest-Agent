/**
 * Converts HTTP request observation format to RawTextObservation.
 * Used to merge request body with OpenClaw workspace in CompositeObservationAdapter.
 */

import type { ObservationAdapter } from '../runtime/observation-adapter';
import type { RawTextObservation } from '../runtime/types';
import type { StateObservation } from '../env/types';

function toRawValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export class RequestObservationAdapter implements ObservationAdapter {
  constructor(private readonly observation: StateObservation) {}

  async getObservations(): Promise<RawTextObservation> {
    const raw: RawTextObservation = {};
    if (this.observation.state && typeof this.observation.state === 'object') {
      for (const [key, value] of Object.entries(this.observation.state)) {
        raw[key] = toRawValue(value);
      }
    }
    if (this.observation.events && this.observation.events.length > 0) {
      raw.events = JSON.stringify(this.observation.events);
    }
    if (this.observation.conversation_history && this.observation.conversation_history.length > 0) {
      raw.conversation_history = JSON.stringify(this.observation.conversation_history);
    }
    return raw;
  }
}
