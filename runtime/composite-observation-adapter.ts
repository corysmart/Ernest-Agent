/**
 * Merges observations from multiple adapters.
 * Useful for combining OpenClaw workspace content with other sources (e.g., API, queue).
 * Later adapters override earlier ones for overlapping keys.
 */

import type { ObservationAdapter } from './observation-adapter';
import type { RawTextObservation } from './types';

export class CompositeObservationAdapter implements ObservationAdapter {
  constructor(private readonly adapters: ObservationAdapter[]) {}

  async getObservations(): Promise<RawTextObservation> {
    const result: RawTextObservation = {};
    for (const adapter of this.adapters) {
      const obs = await adapter.getObservations();
      Object.assign(result, obs);
    }
    return result;
  }
}
